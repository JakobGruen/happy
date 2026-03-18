import { z } from "zod";
import { type Fastify } from "../types";
import { log } from "@/utils/log";
import { rpcListenersMap } from "../socket";

/**
 * HTTP→RPC proxy for voice agent tool callbacks.
 *
 * The voice agent sends { method, params } — same RPC method names the app uses
 * (e.g. "send-message", "process-permission"). Server prepends sessionId and
 * forwards to the CLI daemon socket via the existing RPC infrastructure.
 *
 * Auth: PIPECAT_AUTH_SECRET via query param or header.
 */
export function voiceToolCallbackRoutes(app: Fastify) {
    app.post('/v1/voice/tool-callback', {
        schema: {
            querystring: z.object({
                sessionId: z.string(),
                secret: z.string().optional(),
            }),
            body: z.object({
                method: z.string(),
                params: z.record(z.unknown()).optional(),
            }),
        },
    }, async (request, reply) => {
        const secret = request.query.secret || request.headers['x-pipecat-secret'] as string;
        const expectedSecret = process.env.PIPECAT_AUTH_SECRET;
        if (!expectedSecret || !secret || secret !== expectedSecret) {
            return reply.code(401).send({ error: 'Invalid secret' });
        }

        const { sessionId } = request.query;
        const { method, params } = request.body;
        const rpcMethod = `${sessionId}:${method}`;

        log({ module: 'voice-callback' }, `RPC proxy: ${method} → ${sessionId}`);

        if (!rpcListenersMap) {
            return reply.code(503).send({ error: 'Socket server not ready' });
        }

        // Find the CLI daemon socket that registered this RPC method
        let targetSocket = null;
        for (const [_userId, listeners] of rpcListenersMap) {
            const socket = listeners.get(rpcMethod);
            if (socket) { targetSocket = socket; break; }
        }

        if (!targetSocket || !targetSocket.connected) {
            return reply.code(404).send({ error: 'Session not connected' });
        }

        try {
            const response = await targetSocket.timeout(30000).emitWithAck('rpc-request', {
                method: rpcMethod,
                params: params ?? {},
            });
            return reply.send({ ok: true, result: response });
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'RPC call failed';
            log({ module: 'voice-callback', level: 'error' }, `RPC failed: ${method} → ${detail}`);
            return reply.code(500).send({ error: detail });
        }
    });
}
