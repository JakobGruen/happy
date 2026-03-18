/**
 * Happy MCP Stdio Server
 *
 * Standalone MCP server that CC spawns as a child process.
 * Uses StdioServerTransport (stdin/stdout) for MCP protocol.
 * Forwards tool calls to the parent Happy CLI process via Unix domain socket.
 *
 * Environment:
 *   HAPPY_MCP_SOCKET — path to UDS socket on the parent process
 *
 * This script must not print to stdout (breaks MCP stdio protocol).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { connect } from 'node:net';
import { z } from 'zod';

const socketPath = process.env.HAPPY_MCP_SOCKET;
if (!socketPath) {
    process.stderr.write('[happy-mcp] Missing HAPPY_MCP_SOCKET env var\n');
    process.exit(2);
}

/** Send a message to the parent process via UDS, return the response */
function sendToParent(message: object): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('UDS timeout')), 5000);
        const client = connect(socketPath!, () => {
            client.write(JSON.stringify(message) + '\n');
        });
        let data = '';
        client.on('data', (chunk) => { data += chunk; });
        client.on('end', () => {
            clearTimeout(timeout);
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`Invalid response: ${data}`)); }
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function main() {
    const server = new McpServer({
        name: 'Happy MCP',
        version: '1.0.0',
    });

    server.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        try {
            const resp = await sendToParent({ type: 'change_title', title: args.title });
            if (resp.success) {
                return {
                    content: [{ type: 'text' as const, text: `Changed title to: "${args.title}"` }],
                    isError: false,
                };
            }
            return {
                content: [{ type: 'text' as const, text: `Failed: ${resp.error}` }],
                isError: true,
            };
        } catch (error) {
            return {
                content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    });

    server.registerTool('log_step', {
        description: 'Record a completed step and/or set an ephemeral status. Call with title+summary to log a completed step. Call with status to show what you are currently doing. Call with all three to log a step and set the next status.',
        title: 'Log Step',
        inputSchema: {
            title: z.string().describe('Short title for this step (<60 chars)'),
            summary: z.string().describe('Bullet-point summary of actions taken'),
            stats: z.object({
                linesAdded: z.number().optional().describe('Lines of code added'),
                linesRemoved: z.number().optional().describe('Lines of code removed'),
                filesChanged: z.number().optional().describe('Number of files modified'),
                filesDeleted: z.number().optional().describe('Number of files deleted'),
                filesCreated: z.number().optional().describe('Number of files created'),
                testsPassed: z.number().optional().describe('Number of tests passing'),
                testsFailed: z.number().optional().describe('Number of tests failing'),
            }).optional().describe('Optional structured stats about the step'),
            status: z.string().describe('Ephemeral status of what you are currently doing (e.g. "Exploring auth module", "Running tests"). Shown temporarily until the next log_step call.'),
        },
    }, async (args) => {
        if (!args.title || !args.summary || args.status === undefined) {
            return {
                content: [{ type: 'text' as const, text: 'Error: title, summary, and status are all required. Every call must log a step AND set a status.' }],
                isError: true,
            };
        }
        try {
            const resp = await sendToParent({
                type: 'log_step',
                ...(args.title ? { title: args.title } : {}),
                ...(args.summary ? { summary: args.summary } : {}),
                ...(args.stats ? { stats: args.stats } : {}),
                ...(args.status !== undefined ? { status: args.status } : {}),
            });
            if (resp.success) {
                const parts: string[] = [];
                if (args.title) parts.push('Step logged.');
                if (args.status) parts.push(`Status: ${args.status}`);
                return {
                    content: [{ type: 'text' as const, text: parts.join(' ') || 'OK' }],
                    isError: false,
                };
            }
            return {
                content: [{ type: 'text' as const, text: `Failed: ${resp.error}` }],
                isError: true,
            };
        } catch (error) {
            return {
                content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    try { process.stderr.write(`[happy-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`); }
    finally { process.exit(1); }
});
