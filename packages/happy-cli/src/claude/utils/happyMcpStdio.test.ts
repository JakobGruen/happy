/**
 * Tests for the stdio MCP server.
 * NOTE: These tests require a build step first (`bun run --filter happy-coder build`),
 * since they spawn the compiled output as a child process.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

/** Send JSON-RPC message to child stdin, read matching response from stdout */
function sendMcpMessage(child: ChildProcess, message: object): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for MCP response')), 5000);
        let buffer = '';

        const onData = (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.id === (message as any).id) {
                        clearTimeout(timeout);
                        child.stdout!.off('data', onData);
                        resolve(parsed);
                    }
                } catch { /* partial line, keep reading */ }
            }
        };

        child.stdout!.on('data', onData);
        child.stdin!.write(JSON.stringify(message) + '\n');
    });
}

const SCRIPT_PATH = join(__dirname, '..', '..', '..', 'dist', 'claude', 'utils', 'happyMcpStdio.mjs');

describe('happyMcpStdio', () => {
    let mockUds: NetServer | null = null;
    let child: ChildProcess | null = null;
    let socketPath: string;
    let receivedMessages: any[] = [];

    beforeEach(async () => {
        socketPath = join(tmpdir(), `test-mcp-${randomUUID().slice(0, 8)}.sock`);
        receivedMessages = [];

        // Start mock UDS server that echoes { success: true }
        mockUds = createNetServer((conn) => {
            let data = '';
            conn.on('data', (chunk) => {
                data += chunk.toString();
                if (data.includes('\n')) {
                    const msg = JSON.parse(data.split('\n')[0]);
                    receivedMessages.push(msg);
                    conn.end(JSON.stringify({ success: true }));
                }
            });
        });

        await new Promise<void>((resolve) => mockUds!.listen(socketPath, resolve));
    });

    afterEach(() => {
        child?.kill();
        child = null;
        mockUds?.close();
        try { unlinkSync(socketPath); } catch { /* ok */ }
    });

    /** Spawn the stdio script and run MCP initialize handshake */
    async function spawnAndInitialize(): Promise<ChildProcess> {
        child = spawn(process.execPath, ['--no-warnings', '--no-deprecation', SCRIPT_PATH], {
            env: { ...process.env, HAPPY_MCP_SOCKET: socketPath },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Initialize
        const initResp = await sendMcpMessage(child, {
            jsonrpc: '2.0', id: 1,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
        });
        expect(initResp.result.serverInfo.name).toBe('Happy MCP');

        // Send initialized notification
        child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

        return child;
    }

    it('should initialize and list tools', async () => {
        await spawnAndInitialize();

        const listResp = await sendMcpMessage(child!, {
            jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
        });
        const toolNames = listResp.result.tools.map((t: any) => t.name);
        expect(toolNames).toContain('change_title');
        expect(toolNames).toContain('turn_summary');
    });

    it('should forward change_title to UDS', async () => {
        await spawnAndInitialize();

        const result = await sendMcpMessage(child!, {
            jsonrpc: '2.0', id: 3,
            method: 'tools/call',
            params: { name: 'change_title', arguments: { title: 'My Session' } },
        });

        expect(result.result.isError).toBe(false);
        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]).toEqual({ type: 'change_title', title: 'My Session' });
    });

    it('should forward turn_summary to UDS', async () => {
        await spawnAndInitialize();

        const result = await sendMcpMessage(child!, {
            jsonrpc: '2.0', id: 4,
            method: 'tools/call',
            params: { name: 'turn_summary', arguments: { title: 'Did things', summary: '- item 1' } },
        });

        expect(result.result.isError).toBe(false);
        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]).toEqual({ type: 'turn_summary', title: 'Did things', summary: '- item 1' });
    });
});
