import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { type Fastify } from "../types";
import { log } from "@/utils/log";

export function voiceRoutes(app: Fastify) {
    app.post('/v1/voice/token', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                agentId: z.string(),
                revenueCatPublicKey: z.string().optional()
            }),
            response: {
                200: z.object({
                    allowed: z.boolean(),
                    token: z.string().optional(),
                    agentId: z.string().optional()
                }),
                400: z.object({
                    allowed: z.boolean(),
                    error: z.string()
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId; // CUID from JWT
        const { agentId, revenueCatPublicKey } = request.body;

        log({ module: 'voice' }, `Voice token request from user ${userId}`);

        const isDevelopment = process.env.NODE_ENV === 'development' || process.env.ENV === 'dev';

        // Production requires RevenueCat key
        if (!isDevelopment && !revenueCatPublicKey) {
            log({ module: 'voice' }, 'Production environment requires RevenueCat public key');
            return reply.code(400).send({ 
                allowed: false,
                error: 'RevenueCat public key required'
            });
        }

        // Check subscription in production
        if (!isDevelopment && revenueCatPublicKey) {
            const response = await fetch(
                `https://api.revenuecat.com/v1/subscribers/${userId}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${revenueCatPublicKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                log({ module: 'voice' }, `RevenueCat check failed for user ${userId}: ${response.status}`);
                return reply.send({ 
                    allowed: false,
                    agentId
                });
            }

            const data = await response.json() as any;
            const proEntitlement = data.subscriber?.entitlements?.active?.pro;
            
            if (!proEntitlement) {
                log({ module: 'voice' }, `User ${userId} does not have active subscription`);
                return reply.send({ 
                    allowed: false,
                    agentId
                });
            }
        }

        // Check if 11Labs API key is configured
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        if (!elevenLabsApiKey) {
            log({ module: 'voice' }, 'Missing 11Labs API key');
            return reply.code(400).send({ allowed: false, error: 'Missing 11Labs API key on the server' });
        }

        // Get 11Labs conversation token
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
            {
                method: 'GET',
                headers: {
                    'xi-api-key': elevenLabsApiKey,
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            log({ module: 'voice' }, `Failed to get 11Labs token for user ${userId}`);
            return reply.code(400).send({ 
                allowed: false,
                error: `Failed to get 11Labs token for user ${userId}`
            });
        }

        const data = await response.json() as any;
        const token = data.token;

        log({ module: 'voice' }, `Voice token issued for user ${userId}`);
        return reply.send({
            allowed: true,
            token,
            agentId
        });
    });

    app.post('/v1/voice/livekit-token', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                sessionId: z.string()
            }),
            response: {
                200: z.object({
                    url: z.string(),
                    token: z.string()
                }),
                400: z.object({
                    error: z.string()
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.body;

        log({ module: 'voice' }, `LiveKit token request from user ${userId}`);

        const livekitApiKey = process.env.LIVEKIT_API_KEY;
        const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL;

        if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
            log({ module: 'voice' }, 'Missing LiveKit configuration');
            return reply.code(400).send({
                error: 'Missing LiveKit configuration on the server'
            });
        }

        try {
            const token = new AccessToken(livekitApiKey, livekitApiSecret, {
                identity: `user_${userId}`,
                name: `User ${userId}`,
                ttl: 3600
            });

            token.addGrant({
                roomJoin: true,
                room: `voice_${sessionId}`,
                canPublish: true,
                canSubscribe: true
            });

            const jwt = await token.toJwt();

            log({ module: 'voice' }, `LiveKit token issued for user ${userId}`);
            return reply.send({
                url: livekitUrl,
                token: jwt
            });
        } catch (error) {
            log({ module: 'voice' }, `Failed to generate LiveKit token for user ${userId}: ${error}`);
            return reply.code(400).send({
                error: 'Failed to generate LiveKit token'
            });
        }
    });
}
