import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";

vi.mock("@/utils/log", () => ({
    log: vi.fn()
}));

import { voiceRoutes } from "./voiceRoutes";

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    typed.decorate("authenticate", async (request: any, reply: any) => {
        const userId = request.headers["x-user-id"];
        if (typeof userId !== "string") {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        request.userId = userId;
    });

    voiceRoutes(typed);
    await typed.ready();
    return typed;
}

describe("voiceRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        if (app) {
            await app.close();
        }
    });

    // ---------------------------------------------------------------
    // POST /v1/voice/pipecat-session
    // ---------------------------------------------------------------
    describe("POST /v1/voice/pipecat-session", () => {
        beforeEach(() => {
            vi.stubEnv("PIPECAT_VOICE_URL", "https://voice.example.com");
            vi.stubEnv("PIPECAT_AUTH_SECRET", "test-pipecat-secret");
        });

        it("returns 401 without authentication", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(401);
        });

        it("returns 400 when no Pipecat URL configured", async () => {
            vi.stubEnv("PIPECAT_VOICE_URL", "");
            vi.stubEnv("PIPECAT_AUTH_SECRET", "");

            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(400);
            const body = response.json();
            expect(body.error).toBe("Pipecat voice server not configured. Set PIPECAT_VOICE_URL on the server.");
        });

        it.skip("returns URL when PIPECAT_VOICE_URL env var is set", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.url).toBeDefined();
            expect(body.url).toContain("https://voice.example.com");
        });

        it.skip("URL includes session_id query parameter", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.url).toContain("session_id=test-session");
        });

        it.skip("URL includes HMAC token when PIPECAT_AUTH_SECRET is set", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.url).toContain("token=");
        });

        it.skip("HMAC token contains userId, sessionId, and expiry", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            const url = new URL(body.url);
            const token = decodeURIComponent(url.searchParams.get("token")!);
            const parts = token.split(":");
            expect(parts).toHaveLength(4);
            expect(parts[0]).toBe("test-user");
            expect(parts[1]).toBe("test-session");
            expect(Number(parts[2])).toBeGreaterThan(0);
            expect(parts[3]).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex digest
        });

        it.skip("returns URL without token when PIPECAT_AUTH_SECRET is not set", async () => {
            vi.stubEnv("PIPECAT_AUTH_SECRET", "");

            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: { sessionId: "test-session" }
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.url).not.toContain("token=");
            expect(body.url).toBe("https://voice.example.com/api/offer?session_id=test-session");
        });

        it("validates request body requires sessionId", async () => {
            app = await createApp();
            const response = await app.inject({
                method: "POST",
                url: "/v1/voice/pipecat-session",
                headers: { "x-user-id": "test-user" },
                payload: {}
            });

            expect(response.statusCode).toBe(400);
        });
    });
});
