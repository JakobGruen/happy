#!/usr/bin/env node
/**
 * Stop hook: enforce mcp__happy__log_step after meaningful work.
 *
 * Blocks CC from finishing a turn if it performed meaningful work
 * (edits, writes, shell commands, agent delegation) without logging a step.
 *
 * Reads hook input from stdin, writes hook response to stdout.
 * No external dependencies — runs with any Node.js installation.
 */

const fs = require('fs');
const path = require('path');

// Tools that indicate meaningful work was done and require a log_step
const WORK_TOOLS = new Set([
    // File editing
    'Edit',
    'Write',
    'NotebookEdit',
    // Shell / execution
    'Bash',
    // Agent delegation (non-trivial tasks)
    'Agent',
    // Serena symbolic editing tools
    'mcp__plugin_serena_serena__replace_content',
    'mcp__plugin_serena_serena__replace_symbol_body',
    'mcp__plugin_serena_serena__insert_after_symbol',
    'mcp__plugin_serena_serena__insert_before_symbol',
    'mcp__plugin_serena_serena__rename_symbol',
    'mcp__plugin_serena_serena__create_text_file',
    // Filesystem writes via MCP
    'mcp__filesystem__write_file',
    'mcp__filesystem__edit_file',
    'mcp__filesystem__move_file',
    'mcp__filesystem__create_directory',
]);

const LOG_STEP_TOOL = 'mcp__happy__log_step';
const SKIP_TYPES = new Set(['progress', 'file-history-snapshot', 'last-prompt', 'queue-operation', 'system']);

/**
 * Extract tool names from the last assistant turn in JSONL transcript.
 * @returns {{ textParts: string[], toolNames: Set<string> }}
 */
function extractLastAssistantTurn(transcriptPath) {
    const textParts = [];
    const toolNames = new Set();

    const raw = fs.readFileSync(transcriptPath, 'utf-8');
    const allEntries = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            allEntries.push(JSON.parse(trimmed));
        } catch {
            continue;
        }
    }

    // Walk backwards to find contiguous assistant entries, skipping noise types
    const trailing = [];
    for (let i = allEntries.length - 1; i >= 0; i--) {
        const t = allEntries[i].type;
        if (SKIP_TYPES.has(t)) continue;
        if (t === 'assistant') {
            trailing.push(allEntries[i]);
        } else {
            break;
        }
    }
    trailing.reverse();

    for (const entry of trailing) {
        const content = (entry.message || {}).content || [];
        if (typeof content === 'string') {
            textParts.push(content);
            continue;
        }
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block && typeof block === 'object') {
                    if (block.type === 'text') {
                        textParts.push(block.text || '');
                    } else if (block.type === 'tool_use') {
                        toolNames.add(block.name || '');
                    }
                }
            }
        }
    }

    return { textParts, toolNames };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }

    let hookInput;
    try {
        hookInput = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
        process.stdout.write('{}');
        return;
    }

    const transcriptPath = hookInput.transcript_path || '';
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        process.stdout.write('{}');
        return;
    }

    let { textParts, toolNames } = extractLastAssistantTurn(transcriptPath);

    // Retry once on race condition (CC may flush transcript slightly late)
    if (toolNames.size === 0 && !textParts.some(t => t.trim())) {
        await sleep(150);
        ({ textParts, toolNames } = extractLastAssistantTurn(transcriptPath));
    }

    // Already logged — we're good
    if (toolNames.has(LOG_STEP_TOOL)) {
        process.stdout.write('{}');
        return;
    }

    // Check if any meaningful work was done
    const workDone = [...toolNames].filter(t => WORK_TOOLS.has(t));
    if (workDone.length === 0) {
        process.stdout.write('{}');
        return;
    }

    // Work was done but log_step was not called — block
    const sorted = workDone.sort();
    process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `You used ${sorted.join(', ')} but did not call mcp__happy__log_step. `
            + 'Activity tracking is mandatory after meaningful work. '
            + 'Please call mcp__happy__log_step now with a title and bullet-point summary '
            + 'of what you just did, then finish.',
    }));
}

main();
