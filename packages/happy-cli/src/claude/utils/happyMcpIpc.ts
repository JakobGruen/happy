/**
 * Happy MCP IPC Server
 *
 * Unix domain socket server that receives tool call messages from the
 * stdio MCP script (spawned by CC) and executes them using ApiSessionClient.
 *
 * Protocol: newline-delimited JSON over UDS
 * Request:  { type: "change_title", title: string }
 *        or { type: "log_step", title?: string, summary?: string, stats?: Record<string, number>, status?: string }
 * Response: { success: true } or { success: false, error: string }
 */

import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import { ApiSessionClient } from '@/api/apiSession';
import type { Metadata } from '@/api/types';

export interface HappyMcpIpcServer {
    socketPath: string;
    toolNames: string[];
    stop: () => void;
}

export async function startHappyMcpIpc(
    client: ApiSessionClient,
    { initialLogSteps }: { initialLogSteps?: NonNullable<Metadata['logSteps']> } = {}
): Promise<HappyMcpIpcServer> {
    const socketPath = join(tmpdir(), `happy-mcp-${randomUUID().slice(0, 8)}.sock`);
    const toolNames = ['change_title', 'log_step'];
    const numericKeys = Object.keys(initialLogSteps ?? {})
        .map(k => parseInt(k, 10))
        .filter(Number.isFinite);
    let stepCounter = numericKeys.length > 0 ? Math.max(...numericKeys) : 0;

    logger.debug(`[happyMcpIpc] Starting UDS server at ${socketPath}`);

    // Clean up stale socket from a previous crash
    try { unlinkSync(socketPath); } catch { /* doesn't exist, fine */ }

    return new Promise((resolve, reject) => {
        const server: Server = createServer((conn) => {
            let buffer = '';

            conn.on('data', (chunk) => {
                buffer += chunk.toString();
                const newlineIdx = buffer.indexOf('\n');
                if (newlineIdx === -1) return;

                const line = buffer.slice(0, newlineIdx);
                buffer = buffer.slice(newlineIdx + 1);

                let response: { success: boolean; error?: string };
                try {
                    const msg = JSON.parse(line);
                    response = handleMessage(msg);
                } catch (error) {
                    response = { success: false, error: String(error) };
                }

                conn.end(JSON.stringify(response));
            });

            conn.on('error', (err) => {
                logger.debug('[happyMcpIpc] Connection error:', err);
            });
        });

        function handleMessage(
            msg: { type: string; title?: string; summary?: string; stats?: Record<string, number>; status?: string },
        ): { success: boolean; error?: string } {
            switch (msg.type) {
                case 'change_title': {
                    logger.debug('[happyMcpIpc] change_title:', msg.title);
                    // sendClaudeSessionMessage already writes metadata.summary via apiSession.ts
                    client.sendClaudeSessionMessage({
                        type: 'summary',
                        summary: msg.title!,
                        leafUuid: randomUUID(),
                    });
                    return { success: true };
                }

                case 'log_step': {
                    const hasStep = msg.title && msg.summary;
                    const hasStatus = typeof msg.status === 'string';
                    // Resolve new currentStatus: explicit status wins, step-only clears it, empty string clears it
                    const newStatus = hasStatus
                        ? (msg.status!.trim() || null)
                        : (hasStep ? null : undefined); // undefined = don't touch

                    if (hasStep) {
                        stepCounter++;
                        const stepKey = String(stepCounter);
                        logger.debug(`[happyMcpIpc] log_step #${stepKey}${hasStatus ? ` status="${msg.status}"` : ''}`);
                        client.updateMetadata((m: any) => {
                            const existing = m.logSteps ?? {};
                            const capped = { ...existing };
                            const keys = Object.keys(capped);
                            if (keys.length >= 50) {
                                const oldest = keys.sort((a, b) => Number(a) - Number(b))[0];
                                delete capped[oldest];
                            }
                            return {
                                ...m,
                                logSteps: {
                                    ...capped,
                                    [stepKey]: {
                                        title: msg.title,
                                        summary: msg.summary?.replace(/\\n/g, '\n'),
                                        ...(msg.stats ? { stats: msg.stats } : {}),
                                        createdAt: Date.now(),
                                    },
                                },
                                ...(newStatus !== undefined ? { currentStatus: newStatus } : {}),
                            };
                        });
                    } else if (hasStatus) {
                        logger.debug(`[happyMcpIpc] status="${msg.status}"`);
                        client.updateMetadata((m: any) => ({
                            ...m,
                            currentStatus: newStatus,
                        }));
                    }
                    return { success: true };
                }

                default:
                    return { success: false, error: `Unknown message type: ${msg.type}` };
            }
        }

        server.listen(socketPath, () => {
            logger.debug(`[happyMcpIpc] Ready at ${socketPath}`);
            resolve({
                socketPath,
                toolNames,
                stop: () => {
                    logger.debug(`[happyMcpIpc] Stopping`);
                    server.close();
                    try { unlinkSync(socketPath); } catch { /* already removed */ }
                },
            });
        });

        server.on('error', (err) => {
            logger.debug('[happyMcpIpc] Server error:', err);
            reject(err);
        });
    });
}
