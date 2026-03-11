# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Happy Coder is a mobile/web client for AI coding agents (Claude Code, Codex, Gemini). The CLI (`happy`) wraps these tools, the mobile app provides remote control, and everything syncs through the server with end-to-end encryption. Published as `happy-coder` on npm.

## Monorepo Structure

Yarn 1.22 workspaces (no Turborepo/Lerna). Package manager: `yarn` — never use npm.

| Package | npm name | What it is |
|---|---|---|
| `happy-app` | `happy-app` | React Native / Expo 54 mobile + web client |
| `happy-cli` | `happy-coder` | CLI wrapper for Claude Code / Codex / Gemini |
| `happy-server` | `happy-server` | Fastify 5 backend API + Socket.IO relay |
| `happy-wire` | `@jakobgruen/happy-wire` | Shared Zod schemas — the wire protocol source of truth |
| `happy-agent` | `@slopus/agent` | Programmatic remote agent control CLI (`auth`, `list`, `create`, `send`, `history`, `status`, `stop`, `wait`) |
| `happy-voice-agent` | *(Python, not in workspaces)* | LiveKit voice agent (standalone Python package) |

**Dependency graph**: All TS packages depend on `@jakobgruen/happy-wire`. Wire must be built first on clean checkout.

## Build & Dev Commands

```bash
# Build wire first (required on clean checkout before anything else)
yarn workspace @jakobgruen/happy-wire build

# CLI development (from repo root)
yarn cli                              # dev-run CLI via tsx
yarn cli codex                        # run in Codex mode

# App
yarn workspace happy-app start        # Expo dev server
yarn workspace happy-app ios          # iOS simulator
yarn workspace happy-app web          # web browser
yarn web                              # shortcut for above
yarn workspace happy-app typecheck    # MUST run after changes

# Server
yarn workspace happy-server dev       # starts with .env + .env.dev, kills port 3005
yarn workspace happy-server db        # Docker postgres
yarn workspace happy-server redis     # Docker redis
yarn workspace happy-server generate  # Prisma client codegen

# Dev reset (rebuild + restart services)
yarn dev:reset                        # full reset: install → wire → cli → daemon → server → metro
yarn dev:reset -c -d                  # rebuild CLI + restart daemon
yarn dev:reset -s                     # restart server only
yarn dev:reset -m                     # reset Metro bundler only
yarn dev:reset -i                     # reinstall dependencies only

# CLI with local server
cd packages/happy-cli && yarn dev:local-server

# Tests
yarn workspace @jakobgruen/happy-wire test   # vitest
yarn workspace happy-coder test          # builds first, then vitest (daemon integration)
yarn workspace happy-server test         # vitest

# Release
yarn release                          # interactive release picker (from root)

# Voice agent (Python, separate from yarn)
cd packages/happy-voice-agent && . .venv/bin/activate && python agent.py dev
```

## CI Checks

- **CLI smoke test**: builds CLI, installs globally, runs `--help`, `--version`, `doctor`, `daemon status` (Linux + Windows, Node 20 + 24)
- **App typecheck**: `yarn workspace happy-app typecheck` on PRs touching `packages/happy-app/`

## Architecture

### Communication Pattern
```
Mobile App ←→ Server (Socket.IO + REST) ←→ CLI daemon (Socket.IO)
                ↕
         Voice Agent (LiveKit)
```

Three Socket.IO connection scopes: `user-scoped`, `session-scoped`, `machine-scoped` — each receives different update subsets. RPC calls (bash, file ops, spawn/stop sessions) flow through Socket.IO, not REST.

### End-to-End Encryption (Core Constraint)
The server stores opaque encrypted blobs — it cannot read user content. Two encryption variants:
- **Legacy (NaCl secretbox)**: XSalsa20-Poly1305 via TweetNaCl
- **DataKey (AES-256-GCM)**: Per-session key, 1-byte version prefix

All session data, messages, artifacts, machine metadata, and daemon state are encrypted client-side. Server-side encryption (via KeyTree from `HANDY_MASTER_SECRET`) is only for OAuth tokens and vendor service keys.

### Session Protocol
Two message format generations coexist:
- **Legacy**: `{ role: "user"/"agent", content: {...} }`
- **Modern**: `{ role: "session", content: SessionEnvelope }` with 9 event types

Feature flag `ENABLE_SESSION_PROTOCOL_SEND` controls which format clients emit. Defined in `@jakobgruen/happy-wire`'s `sessionProtocol.ts`.

### Optimistic Concurrency
State updates (session metadata, agent state, machine daemon state) use `expectedVersion`. Version mismatch → client gets current version and can retry.

### PGlite Standalone Mode
Server can run with embedded WASM PostgreSQL (PGlite) instead of external Postgres. Azure deployment uses `tsx sources/standalone.ts migrate && tsx sources/standalone.ts serve`.

### Voice Architecture
Self-hosted Pipecat voice agent via WebRTC. The app implements the `VoiceSession` interface (`startSession`, `endSession`, `sendTextMessage`, `sendContextualUpdate`, `sendTrigger`).

```
User speaks → Pipecat WebRTC (self-hosted)
  → Voice agent LLM decides action
  → RPC tool call lands in happy-app (client-registered handlers)
  → App calls sessionAllow / sends message to CLI daemon
```

**Server endpoint:** `POST /v1/voice/pipecat-session` — returns HMAC-signed WebRTC offer URL. App can also connect directly via `localSettings.pipecatUrl` for local dev.

**Key app files** (all in `packages/happy-app/sources/realtime/`):
- `RealtimeSession.ts` — orchestrator: requests mic, connects to Pipecat
- `PipecatVoiceSession.tsx` / `.web.tsx` — WebRTC client implementation
- `types.ts` — `VoiceSession` interface contract
- `hooks/voiceHooks.ts` — bridges app events (messages, permissions, focus) to voice session
- `voiceQuestionBridge.ts` — state machine for `AskUserQuestion` RPC flows

## Critical Gotchas

1. **Build order**: `@jakobgruen/happy-wire` must be built before other packages (distributes from `dist/`, not `src/`)
2. **pglite patch**: `patches/pglite-prisma-adapter+0.7.2.patch` fixes bytea serialization — applied by `scripts/postinstall.cjs`. **Never add `Buffer.from()` workarounds**
3. **Database migrations**: NEVER run migrations yourself. Only run `yarn generate` for new Prisma types. Migrations are human-only
4. **`--resume` creates new session ID**: When Claude resumes, all historical messages get re-stamped with the new session ID
5. **`nohoist`**: Root `package.json` nohoists `zod`, `react`, `react-native`, and WebRTC modules to prevent version conflicts between app and server
6. **All imports use `@/` alias**: Maps to `./src/` (CLI) or `./sources/` (server, app)
7. **4 spaces** for indentation across all packages
8. **CLI tests require build first**: Daemon integration tests spawn the actual compiled binary
9. **No backward compatibility** in happy-app unless explicitly stated

## Code Style (Cross-Package)

- TypeScript strict mode everywhere
- Functional patterns — avoid classes (except where they already exist like `Sync`, `ApiSession`)
- Named exports preferred
- Prefer interfaces over types, avoid enums (use maps)
- Descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)
- Never import modules mid-code — all imports at the top
- Use `yarn`, never `npm`

## Key Environment Variables

| Package | Variable | Purpose |
|---|---|---|
| CLI | `HAPPY_SERVER_URL` | Override server URL (default: `https://happy-server.green-wald.de`) |
| CLI | `HAPPY_HOME_DIR` | Override `~/.happy` |
| App | `EXPO_PUBLIC_HAPPY_SERVER_URL` | Override server URL |
| Server | `DATABASE_URL` | PostgreSQL (if absent + `PGLITE_DIR` set → embedded PGlite) |
| Server | `HANDY_MASTER_SECRET` | Required master secret for auth/encryption KeyTree |
| Server | `PORT` | Default 3005 |
| Server | `PIPECAT_VOICE_URL` | Pipecat voice server base URL |
| Server | `PIPECAT_AUTH_SECRET` | Optional HMAC secret for Pipecat auth |

## Per-Package Details

Each package has its own `CLAUDE.md` with package-specific conventions, patterns, and gotchas. They load automatically when you work in those directories:
- `packages/happy-app/CLAUDE.md` — app conventions, i18n system, Unistyles guide
- `packages/happy-cli/CLAUDE.md` — CLI architecture, daemon details
  - `packages/happy-cli/src/daemon/CLAUDE.md` — daemon internals (loads automatically when editing daemon files)
- `packages/happy-server/CLAUDE.md` — server conventions, Prisma rules, debugging

## Architecture Docs

`docs/` contains detailed architecture references. Check these before reading source code for these topics:

- `docs/README.md` — Index of all docs, start here
- `docs/protocol.md` — WebSocket payload formats, sequencing, concurrency rules
- `docs/encryption.md` — Encryption boundaries and on-wire encoding
- `docs/session-protocol.md` — Unified encrypted chat event protocol (9 event types)
- `docs/session-protocol-claude.md` — Claude launcher session protocol emit paths and deduplication
- `docs/permission-resolution.md` — Permission mode resolution (sandbox, auto, manual)
- `docs/backend-architecture.md` — Internal backend data flow and key subsystems
- `docs/cli-architecture.md` — CLI and daemon architecture
- `docs/api.md` — HTTP endpoints and auth flows
- `docs/happy-wire.md` — Wire schemas package and migration notes
- `docs/deployment.md` — Deployment procedures
