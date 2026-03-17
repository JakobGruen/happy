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

    server.registerTool('turn_summary', {
        description: 'Record a summary of what was accomplished in this turn',
        title: 'Record Turn Summary',
        inputSchema: {
            title: z.string().describe('Short title for this turn (<60 chars)'),
            summary: z.string().describe('Bullet-point summary of actions taken'),
        },
    }, async (args) => {
        try {
            const resp = await sendToParent({ type: 'turn_summary', title: args.title, summary: args.summary });
            if (resp.success) {
                return {
                    content: [{ type: 'text' as const, text: 'Turn summary recorded.' }],
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
