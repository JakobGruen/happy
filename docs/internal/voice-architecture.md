# Voice Architecture (Pipecat)

The voice stack was simplified to a single backend: Pipecat. ElevenLabs + LiveKit were removed from the server, app, and voice-agent.

- **Voice agent repo**: `happy-voice-agent` lives in its own repository, separate from the monorepo.
- **Key files (voice agent)**: `server.py` (FastAPI + WebRTC signaling), `bot.py` (Pipecat pipeline), `tools.py` (8 `FunctionSchema` defs), `text_handler.py` (3-channel message handler), `fallback_tts.py` (Cartesia → Deepgram failover), `prompts.py` (system prompt).
- **Pipeline**: `transport.input → STT → ClientMessageHandler → context_aggregator.user → LLM → TTS → transport.output → context_aggregator.assistant`.
- **TURN**: self-hosted Coturn via `docker-compose.yml`. Controlled by the `TURN_ENABLED` + `TURN_PASSWORD` env vars. Auto-detects `EXTERNAL_IP`.
- **Auth (two layers)**: `PIPECAT_AUTH_SECRET` (HMAC from happy-server) and `PIPECAT_ACCESS_SECRET` (direct connections). (Names only — actual secret values are machine-local.)
- **WebRTC polyfill**: the app uses `@livekit/react-native-webrtc` for `registerGlobals()` (a standalone WebRTC polyfill, NOT the LiveKit SDK).
- **Server endpoint**: `POST /v1/voice/pipecat-session` on happy-server returns an HMAC-signed WebRTC offer URL.
- **App direct connect**: `localSettings.pipecatUrl` for local dev (bypasses the server proxy).
