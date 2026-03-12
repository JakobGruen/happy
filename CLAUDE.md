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

# Metro watchdog (keeps Metro alive on crash)
yarn metro:watchdog                   # auto-restart on crash or 10min inactivity
yarn metro:watchdog 300               # auto-restart on 5min inactivity (pass timeout as arg)

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

## App UI Components

### Tool Display Modal — Unified Content Formatter

Tools are displayed with a **minimized 2-line chat bubble** that opens a **slide-up modal** on tap. The modal uses a **unified ContentFormatter** for intelligent rendering of all content types across INPUT and OUTPUT tabs.

**Components** (`packages/happy-app/sources/components/tools/modal/`):
- `ToolView.tsx` — Main tool container, triggers modal on header tap
- `ToolModal.tsx` — Slide-up modal with SafeAreaView, close button, backdrop
- `ToolModalTabs.tsx` — INPUT/OUTPUT tabs with dynamic parameter counts
  - INPUT count: `Object.keys(tool.input).length`
  - OUTPUT count: `Object.keys(tool.result).length` (only for objects, 0 for strings/arrays/primitives)
- `VerticalParameterStack.tsx` — Vertical parameter layout (name above value, gray box per parameter)
  - Uses `ContentFormatter` for intelligent value rendering
  - Single gray background (surfaceRipple) per parameter
- `OutputContent.tsx` — Smart output rendering with JSON string unpacking
  - Detects JSON strings and unpacks as parameters (2+ keys only)
  - Falls back to `ContentFormatter` for non-object JSON, diffs, code, markdown, plain text
- `ContentFormatter.tsx` — **New** unified content type detector and renderer
  - Detection order: JSON → Diff → Code → Markdown → Plain Text
  - Detects JSON objects and JSON strings (parses + formats)
  - Detects diffs by `---`, `+++`, `@@` markers (uses `ToolDiffView`)
  - Detects code by language patterns (uses `SimpleSyntaxHighlighter`)
  - Detects markdown by headers, lists, links, bold/italic markers
  - Falls back to plain text with proper scrolling
- `detectContentType.ts` — **New** pure utility function exported for reuse
- `ContentPreview.tsx` — 2-line summary (content type badge + first line)

**Modal behavior**:
- **INPUT tab**: Shows all parameters from `tool.input`, values formatted by `ContentFormatter`
  - Markdown strings render with formatting
  - Code strings render with syntax highlighting
  - JSON objects render as pretty-printed JSON
  - Plain text renders as-is
- **OUTPUT tab**: Intelligently displays `tool.result`
  - JSON strings with 2+ keys: unpacks as parameters (same layout as INPUT)
  - Plain objects with 2+ keys: renders as parameters
  - Single-key objects/arrays/strings: uses `ContentFormatter` for smart rendering
  - All non-object content routes through `ContentFormatter`
  - Hidden when permission pending (security UX)
- **Permission pending**: OUTPUT tab hidden, only INPUT visible
- **Close**: X button or swipe-down-to-dismiss gesture

**Styling**:
- Single gray box per parameter (no nested boxes, no double-boxing)
- Consistent background color: `theme.colors.surfaceRipple`
- Border radius: 6px on all boxes
- Padding: 10px horizontal, 8px vertical inside boxes
- Parameter spacing: 16px between parameters

**Testing**:
- 114 unit & integration tests (all passing)
- 25 tests for VerticalParameterStack with ContentFormatter
- 44 tests for ContentFormatter type detection
- 39 tests for OutputContent JSON unpacking
- 44 integration tests for complete ToolModal flow

**Key files**: See `docs/TOOL_MODAL_API.md`, `docs/TOOL_MODAL_MIGRATION.md`, `docs/TOOL_MODAL_PATTERNS.md`, `MANUAL_TESTING_GUIDE.md`

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
- `docs/TOOL_MODAL_API.md` — Tool modal component API (ToolModal, ToolModalTabs, VerticalParameterStack)
- `docs/TOOL_MODAL_MIGRATION.md` — Migration guide for tool display redesign
- `docs/TOOL_MODAL_PATTERNS.md` — UI patterns for tool rendering (INPUT/OUTPUT tabs, content preview)
