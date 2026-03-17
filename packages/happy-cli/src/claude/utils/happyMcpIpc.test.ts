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
        server = await startHappyMcpIpc(client as any);

        expect(server.socketPath).toMatch(/\.sock$/);
        expect(server.toolNames).toEqual(['change_title', 'log_step']);
    });

    it('should handle change_title messages', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any);

        const response = await sendIpcMessage(server.socketPath, {
            type: 'change_title',
            title: 'My new title',
        });

        expect(response).toEqual({ success: true });
        expect(client.sendClaudeSessionMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'summary', summary: 'My new title' })
        );
    });

    it('should also write title to metadata when change_title is called', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any);

        await sendIpcMessage(server.socketPath, {
            type: 'change_title',
            title: 'My Session Title',
        });

        expect(client.updateMetadata).toHaveBeenCalled();
        expect(client.getMetadata()).toMatchObject({ title: 'My Session Title' });
    });

    it('should handle log_step with auto-increment key', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any);

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'First step',
            summary: '- thing 1',
        });

        const meta1 = client.getMetadata();
        expect(meta1.logSteps['1']).toMatchObject({
            title: 'First step',
            summary: '- thing 1',
        });

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'Second step',
            summary: '- thing 2',
        });

        const meta2 = client.getMetadata();
        expect(meta2.logSteps['2']).toMatchObject({
            title: 'Second step',
            summary: '- thing 2',
        });
    });

    it('should store optional stats alongside title and summary', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any);

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'Step with stats',
            summary: '- did stuff',
            stats: { tokensUsed: 1234, durationMs: 500 },
        });

        const meta = client.getMetadata();
        expect(meta.logSteps['1']).toMatchObject({
            title: 'Step with stats',
            summary: '- did stuff',
            stats: { tokensUsed: 1234, durationMs: 500 },
        });
    });

    it('should enforce 50-entry growth cap', async () => {
        const client = createMockClient();
        const existing: Record<string, any> = {};
        // Pre-seed with keys "100"-"149" to avoid collision with auto-increment counter
        for (let i = 100; i < 150; i++) {
            existing[String(i)] = { title: `Step ${i}`, summary: 'x', createdAt: i };
        }
        (client as any).updateMetadata.mockImplementation((handler: (m: any) => any) => {
            const base = { logSteps: { ...existing } };
            const result = handler(base);
            for (const key of Object.keys(existing)) delete existing[key];
            Object.assign(existing, result.logSteps);
        });

        server = await startHappyMcpIpc(client as any);

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'New step',
            summary: '- new',
        });

        expect(existing['1']).toBeDefined();
        expect(existing['100']).toBeUndefined(); // oldest dropped
    });

    it('should start stepCounter after max key from initialLogSteps', async () => {
        const client = createMockClient();
        const initialLogSteps = {
            '3': { title: 'Step 3', summary: '- done', createdAt: 1000 },
            '7': { title: 'Step 7', summary: '- done', createdAt: 2000 },
        };
        server = await startHappyMcpIpc(client as any, { initialLogSteps });

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'New step',
            summary: '- new thing',
        });

        const meta = client.getMetadata();
        expect(meta.logSteps?.['8']).toMatchObject({ title: 'New step' });
        expect(meta.logSteps?.['1']).toBeUndefined();
    });

    it('should default stepCounter to produce key "1" when initialLogSteps is empty', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any, { initialLogSteps: {} });

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'First step',
            summary: '- first',
        });

        const meta = client.getMetadata();
        expect(meta.logSteps?.['1']).toMatchObject({ title: 'First step' });
    });

    it('should ignore non-numeric keys in initialLogSteps for stepCounter derivation', async () => {
        const client = createMockClient();
        const initialLogSteps = {
            'abc': { title: 'Bad key', summary: '- done', createdAt: 1000 },
            '5': { title: 'Good key', summary: '- done', createdAt: 2000 },
        };
        server = await startHappyMcpIpc(client as any, { initialLogSteps });

        await sendIpcMessage(server.socketPath, {
            type: 'log_step',
            title: 'New step',
            summary: '- new',
        });

        const meta = client.getMetadata();
        expect(meta.logSteps?.['6']).toMatchObject({ title: 'New step' });
    });

    it('should reject unknown message types', async () => {
        const client = createMockClient();
        server = await startHappyMcpIpc(client as any);

        const response = await sendIpcMessage(server.socketPath, {
            type: 'unknown_action',
        });

        expect(response).toEqual({ success: false, error: expect.stringContaining('Unknown') });
    });
});
