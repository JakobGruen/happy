import crypto from "crypto";
import { z } from "zod";
import { type Fastify } from "../types";
import { log } from "@/utils/log";

export function voiceRoutes(app: Fastify) {
    app.post('/v1/voice/pipecat-session', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                sessionId: z.string()
            }),
            response: {
                200: z.object({
                    url: z.string()
                }),
                400: z.object({
                    error: z.string()
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.body;

        log({ module: 'voice' }, `Pipecat session request from user ${userId}`);

        const pipecatUrl = process.env.PIPECAT_VOICE_URL;

        if (!pipecatUrl) {
            log({ module: 'voice' }, 'Missing Pipecat configuration');
            return reply.code(400).send({
                error: 'Pipecat voice server not configured. Set PIPECAT_VOICE_URL on the server.'
            });
        }

        // Generate HMAC auth token for the Pipecat server
        const authSecret = process.env.PIPECAT_AUTH_SECRET;
        let offerUrl = `${pipecatUrl}/api/offer?session_id=${encodeURIComponent(sessionId)}`;

        if (authSecret) {
            const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes
            const message = `${userId}:${sessionId}:${expiry}`;
            const signature = crypto
                .createHmac('sha256', authSecret)
                .update(message)
                .digest('hex');
            const token = `${userId}:${sessionId}:${expiry}:${signature}`;
            offerUrl += `&token=${encodeURIComponent(token)}`;
        }

        log({ module: 'voice' }, `Pipecat session URL issued for user ${userId}`);
        return reply.send({ url: offerUrl });
    });
}
