/**
 * Happy MCP server
 * Provides Happy CLI specific tools including chat session title management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";

export interface TurnCounterRef {
    value: number;
}

export async function startHappyServer(client: ApiSessionClient, turnCounterRef: TurnCounterRef = { value: 0 }) {
    logger.debug(`[happyMCP] server:start sessionId=${client.sessionId}`);

    // Handler that sends title updates via the client
    const handler = async (title: string) => {
        logger.debug('[happyMCP] Changing title to:', title);
        try {
            // Send title as a summary message, similar to title generator
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Create the MCP server
    //

    const mcp = new McpServer({
        name: "Happy MCP",
        version: "1.0.0",
    });

    mcp.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        const response = await handler(args.title);
        logger.debug('[happyMCP] Response:', response);
        
        if (response.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed chat title to: "${args.title}"`,
                    },
                ],
                isError: false,
            };
        } else {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    });

    mcp.registerTool('turn_summary', {
        description: 'Record a summary of what was accomplished in this turn',
        title: 'Record Turn Summary',
        inputSchema: {
            title: z.string().describe('Short title for this turn (<60 chars)'),
            summary: z.string().describe('Bullet-point summary of actions taken'),
        },
    }, async (args) => {
        const turnKey = String(turnCounterRef.value);
        logger.debug(`[happyMCP] Recording turn summary for turn ${turnKey}`);
        try {
            client.updateMetadata((m: any) => {
                const existing = m.turnSummaries ?? {};
                // Enforce 50-entry growth cap — drop lowest numeric key if at limit
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
                            title: args.title,
                            summary: args.summary,
                            createdAt: Date.now(),
                        },
                    },
                };
            });
            return {
                content: [{ type: 'text' as const, text: `Turn ${turnKey} summary recorded.` }],
                isError: false,
            };
        } catch (error) {
            return {
                content: [{ type: 'text' as const, text: `Failed to record turn summary: ${String(error)}` }],
                isError: true,
            };
        }
    });

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    logger.debug(`[happyMCP] server:ready sessionId=${client.sessionId} url=${baseUrl.toString()}`);

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title', 'turn_summary'],
        stop: () => {
            logger.debug(`[happyMCP] server:stop sessionId=${client.sessionId}`);
            mcp.close();
            server.close();
        }
    }
}
