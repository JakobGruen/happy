/**
 * Generate temporary settings file with Claude hooks for session tracking
 *
 * Creates a settings.json file that configures:
 * - SessionStart hook: notifies HTTP server on session changes
 * - PostToolUse hooks: keeps TodoWrite and log_step in sync
 */

import { join, resolve } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';

/**
 * Generate a temporary settings file with SessionStart hook configuration
 * 
 * @param port - The port where Happy server is listening
 * @returns Path to the generated settings file
 */
export function generateHookSettingsFile(port: number): string {
    const hooksDir = join(configuration.happyHomeDir, 'tmp', 'hooks');
    mkdirSync(hooksDir, { recursive: true });

    // Unique filename per process to avoid conflicts
    const filename = `session-hook-${process.pid}.json`;
    const filepath = join(hooksDir, filename);

    // Paths to bundled hook scripts (no external dependencies — just Node.js)
    const scriptsDir = resolve(projectPath(), 'scripts');
    const forwarderScript = join(scriptsDir, 'session_hook_forwarder.cjs');
    const enforceLogStepScript = join(scriptsDir, 'enforce_log_step.cjs');

    const settings = {
        hooks: {
            SessionStart: [
                {
                    matcher: "*",
                    hooks: [
                        {
                            type: "command",
                            command: `node "${forwarderScript}" ${port}`
                        }
                    ]
                }
            ],
            Stop: [
                {
                    hooks: [
                        {
                            type: "command",
                            command: `node "${enforceLogStepScript}"`,
                            timeout: 10000
                        }
                    ]
                }
            ],
            PostToolUse: [
                {
                    matcher: "TodoWrite",
                    hooks: [
                        {
                            type: "prompt",
                            prompt: "You updated your todo list. If your current status no longer reflects what you're doing, call mcp__happy__log_step to update the log feed. Keep todos and log steps in sync."
                        }
                    ]
                },
                {
                    matcher: "mcp__happy__log_step",
                    hooks: [
                        {
                            type: "prompt",
                            prompt: "You logged a step. If your todo list has stale items (completed work not marked done, or new tasks discovered), update it with TodoWrite. Keep log steps and todos in sync."
                        }
                    ]
                }
            ]
        }
    };

    writeFileSync(filepath, JSON.stringify(settings, null, 2));
    logger.debug(`[generateHookSettings] Created hook settings file: ${filepath}`);

    return filepath;
}

/**
 * Clean up the temporary hook settings file
 * 
 * @param filepath - Path to the settings file to remove
 */
export function cleanupHookSettingsFile(filepath: string): void {
    try {
        if (existsSync(filepath)) {
            unlinkSync(filepath);
            logger.debug(`[generateHookSettings] Cleaned up hook settings file: ${filepath}`);
        }
    } catch (error) {
        logger.debug(`[generateHookSettings] Failed to cleanup hook settings file: ${error}`);
    }
}

