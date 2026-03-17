import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHappyMcpIpc, type HappyMcpIpcServer } from './happyMcpIpc';
import { connect } from 'node:net';

function createMockClient() {
    let metadata: Record<string, any> = {};
    return {
        sessionId: 'test-session-id',
        sendClaudeSessionMessage: vi.fn(),
        updateMetadata: vi.fn((handler: (m: any) => any) => {
            metadata = handler(metadata);
        }),
        getMetadata: () => metadata,
    };
}

function sendIpcMessage(socketPath: string, message: object): Promise<object> {
    return new Promise((resolve, reject) => {
        const client = connect(socketPath, () => {
            client.write(JSON.stringify(message) + '\n');
        });
        let data = '';
        client.on('data', (chunk) => { data += chunk; });
        client.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`Invalid JSON: ${data}`)); }
        });
        client.on('error', reject);
    });
}

describe('happyMcpIpc', () => {
    let server: HappyMcpIpcServer | null = null;

    afterEach(() => {
        server?.stop();
        server = null;
    });

    it('should create a UDS socket and return its path', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any, { value: 0 });

        expect(server.socketPath).toMatch(/\.sock$/);
        expect(server.toolNames).toEqual(['change_title', 'turn_summary']);
    });

    it('should handle change_title messages', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any, { value: 0 });

        const response = await sendIpcMessage(server.socketPath, {
            type: 'change_title',
            title: 'My new title',
        });

        expect(response).toEqual({ success: true });
        expect(client.sendClaudeSessionMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'summary', summary: 'My new title' })
        );
    });

    it('should handle turn_summary messages at current turn', async () => {
        const client = createMockClient();
        const turnRef = { value: 3 };
        server = await startHappyMcpIpc(client as any, turnRef);

        const response = await sendIpcMessage(server.socketPath, {
            type: 'turn_summary',
            title: 'Did stuff',
            summary: '- thing 1\n- thing 2',
        });

        expect(response).toEqual({ success: true });
        expect(client.updateMetadata).toHaveBeenCalled();
        const meta = client.getMetadata();
        expect(meta.turnSummaries['3']).toMatchObject({
            title: 'Did stuff',
            summary: '- thing 1\n- thing 2',
        });
    });

    it('should enforce 50-entry growth cap', async () => {
        const client = createMockClient();
        const existing: Record<string, any> = {};
        for (let i = 0; i < 50; i++) {
            existing[String(i)] = { title: `Turn ${i}`, summary: 'x', createdAt: i };
        }
        (client as any).updateMetadata.mockImplementation((handler: (m: any) => any) => {
            const base = { turnSummaries: { ...existing } };
            const result = handler(base);
            for (const key of Object.keys(existing)) delete existing[key];
            Object.assign(existing, result.turnSummaries);
        });

        const turnRef = { value: 99 };
        server = await startHappyMcpIpc(client as any, turnRef);

        await sendIpcMessage(server.socketPath, {
            type: 'turn_summary',
            title: 'New turn',
            summary: '- new',
        });

        expect(existing['99']).toBeDefined();
        expect(existing['0']).toBeUndefined(); // oldest dropped
    });

    it('should reject unknown message types', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any, { value: 0 });

        const response = await sendIpcMessage(server.socketPath, {
            type: 'unknown_action',
        });

        expect(response).toEqual({ success: false, error: expect.stringContaining('Unknown') });
    });
});
