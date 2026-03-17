/**
 * Happy MCP IPC Server
 *
 * Unix domain socket server that receives tool call messages from the
 * stdio MCP script (spawned by CC) and executes them using ApiSessionClient.
 *
 * Protocol: newline-delimited JSON over UDS
 * Request:  { type: "change_title", title: string }
 *        or { type: "turn_summary", title: string, summary: string }
 * Response: { success: true } or { success: false, error: string }
 */

import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import { ApiSessionClient } from '@/api/apiSession';

export interface TurnCounterRef {
    value: number;
}

export interface HappyMcpIpcServer {
    socketPath: string;
    toolNames: string[];
    stop: () => void;
}

export async function startHappyMcpIpc(
    client: ApiSessionClient,
    turnCounterRef: TurnCounterRef,
): Promise<HappyMcpIpcServer> {
    const socketPath = join(tmpdir(), `happy-mcp-${randomUUID().slice(0, 8)}.sock`);
    const toolNames = ['change_title', 'turn_summary'];

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
                    response = handleMessage(msg, client, turnCounterRef);
                } catch (error) {
                    response = { success: false, error: String(error) };
                }

                conn.end(JSON.stringify(response));
            });

            conn.on('error', (err) => {
                logger.debug('[happyMcpIpc] Connection error:', err);
            });
        });

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

function handleMessage(
    msg: { type: string; title?: string; summary?: string },
    client: ApiSessionClient,
    turnCounterRef: TurnCounterRef,
): { success: boolean; error?: string } {
    switch (msg.type) {
        case 'change_title': {
            logger.debug('[happyMcpIpc] change_title:', msg.title);
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: msg.title!,
                leafUuid: randomUUID(),
            });
            return { success: true };
        }

        case 'turn_summary': {
            const turnKey = String(turnCounterRef.value);
            logger.debug(`[happyMcpIpc] turn_summary for turn ${turnKey}`);
            client.updateMetadata((m: any) => {
                const existing = m.turnSummaries ?? {};
                const capped = { ...existing };
                const keys = Object.keys(capped);
                if (keys.length >= 50) {
                    const oldest = keys.sort((a, b) => Number(a) - Number(b))[0];
                    delete capped[oldest];
                }
                return {
                    ...m,
                    turnSummaries: {
                        ...capped,
                        [turnKey]: {
                            title: msg.title,
                            summary: msg.summary,
                            createdAt: Date.now(),
                        },
                    },
                };
            });
            return { success: true };
        }

        default:
            return { success: false, error: `Unknown message type: ${msg.type}` };
    }
}
