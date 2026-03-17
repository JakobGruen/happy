import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHappyServer } from './startHappyServer';

// Mock ApiSessionClient with metadata accumulation
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

/** Call an MCP tool via HTTP (server is pre-initialized via mcp.connect) */
async function callTool(url: string, name: string, args: Record<string, any>, id = 1): Promise<any> {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name, arguments: args },
        }),
    });
    expect(res.ok).toBe(true);

    // Parse SSE response to extract JSON-RPC result
    const text = await res.text();
    for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
            return JSON.parse(line.slice(6));
        }
    }
    return null;
}

describe('startHappyServer', () => {
    let server: Awaited<ReturnType<typeof startHappyServer>> | null = null;

    afterEach(() => {
        server?.stop();
        server = null;
    });

    it('should return both change_title and turn_summary in toolNames', async () => {
        const client = createMockClient();
        server = await startHappyServer(client as any, { value: 0 });

        expect(server.toolNames).toContain('change_title');
        expect(server.toolNames).toContain('turn_summary');
    });

    it('should store turn summary at the correct turn key via updateMetadata', async () => {
        const client = createMockClient();
        const turnCounterRef = { value: 5 };
        server = await startHappyServer(client as any, turnCounterRef);

        const parsed = await callTool(server.url, 'turn_summary', { title: 'Test turn', summary: '- Did stuff' });
        expect(parsed?.result?.isError).toBe(false);

        // Verify updateMetadata was called and the turn key is "5"
        expect(client.updateMetadata).toHaveBeenCalled();
        const metadata = client.getMetadata();
        expect(metadata.turnSummaries).toBeDefined();
        expect(metadata.turnSummaries['5']).toBeDefined();
        expect(metadata.turnSummaries['5'].title).toBe('Test turn');
        expect(metadata.turnSummaries['5'].summary).toBe('- Did stuff');
    });

    it('should enforce 50-entry growth cap by dropping oldest key', async () => {
        // Pre-fill metadata with 50 entries (keys "0" through "49")
        const client = createMockClient();
        const existing: Record<string, any> = {};
        for (let i = 0; i < 50; i++) {
            existing[String(i)] = { title: `Turn ${i}`, summary: 'x', createdAt: i };
        }
        // Seed the metadata so updateMetadata handler sees existing entries
        (client as any).updateMetadata.mockImplementation((handler: (m: any) => any) => {
            const base = { turnSummaries: { ...existing } };
            const result = handler(base);
            // Replace existing with the handler's output (preserves deletions)
            for (const key of Object.keys(existing)) delete existing[key];
            Object.assign(existing, result.turnSummaries);
        });

        const turnCounterRef = { value: 99 };
        server = await startHappyServer(client as any, turnCounterRef);

        // Call turn_summary — should trigger cap
        await callTool(server.url, 'turn_summary', { title: 'New turn', summary: '- New' }, 2);

        expect(client.updateMetadata).toHaveBeenCalled();
        // Key "0" (oldest) should have been dropped, key "99" added
        expect(existing['99']).toBeDefined();
        expect(existing['0']).toBeUndefined();
    });
});
