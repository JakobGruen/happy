# Implementation Plans

## Active & Backlog Plans (13)

### 🚀 **In Progress (Phase 3 pending)**

- **`2026-03-12-bun-integration-implementation.md`**  
  Bun runtime compilation for server. Phases 1-2 complete (dev + CI). Phase 3 (Docker binary) pending.

### 📋 **Backlog (Roadmap)**

- **`2026-03-12-docker-slim.md`**  
  Reduce Docker image size 30-40% via node:20-slim, dist-only copies, dependency pruning
  
- **`2026-03-12-bun-integration-design.md`**  
  3-phase architecture for Bun runtime: dev validation → CI testing → Docker binary
  
- **`2026-03-12-bun-phase-2-ci-testing.md`**  
  GitHub Actions test matrix (Node.js + Bun) — *already implemented, see ARCHIVED for completion*

- **`cli-v3-messages-api.md`**  
  Migrate ApiSessionClient from Socket.IO to HTTP v3 endpoints (cursor-based polling)
  
- **`reliable-http-messages-api.md`**  
  New v3 HTTP API endpoints for messages (replaces Socket.IO, optimizes CLI usage)
  
- **`generic-acp-runner.md`**  
  Clean ACP-compatible CLI runner with session protocol mapping
  
- **`portable-binary.md`**  
  Single Bun-compiled binary for server (PGlite + in-memory event bus)
  
- **`sandbox-runtime.md`**  
  Integrate @anthropic-ai/sandbox-runtime for filesystem/network restrictions
  
- **`multi-question-voice-tool.md`**  
  Multi-choice question relay for voice agent (low priority, architectural concern)

### ✅ **Completed (See ARCHIVED/)**

- Tool Display Modal Redesign
- Tool Modal Content Formatter
- Image Viewer (Fullscreen)
- Mobile Notification Actions
- LLM Summaries
- Test Architecture (Phase 1 & 2)

### 📚 **Pre-Existing (Already Implemented)**

- **`happy-agent.md`** — Published `@slopus/agent` CLI tool
- **`session-protocol-impl.md`** — Session protocol with 9 event types (merged)
- **`metadata-driven-model-mode-selection.md`** — Client metadata-first selection (merged)

---

## Organization

- **Active & Backlog**: This directory (`docs/plans/`)
- **Completed**: `docs/plans/ARCHIVED/` — finished features with implementation docs
- **Memory System**: `.serena/memories/` — tracks technical decisions, patterns, completions

## How to Use

1. **Pick a plan from Backlog** → read it, understand scope
2. **Use `superpowers:executing-plans`** to implement in a separate session with checkpoints
3. **Archive on completion** → move to ARCHIVED/ with completion summary
4. **Update memories** → document lessons learned, patterns, gotchas in `.serena/memories/`
