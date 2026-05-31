# Daemon & Session Lifecycle

How the CLI daemon tracks, sweeps, and reactivates Claude Code sessions. Implementation-level companion to `cli-architecture.md`.

## Daemon session management

- **PID persistence**: `daemon.children.json` tracks child PIDs + sessionIds — survives daemon restarts.
- **Orphan cleanup (startup)**: on startup, reads persisted children, SIGTERMs alive orphans.
- **Orphan sweeper (runtime)**: `orphanSweeper.ts` scans `/proc/*/cmdline` for happy-spawned Claude processes (markers: `mcp__happy__change_title`, `session-hook-`, `--started-by daemon`) not in the tracking map. 90s grace period via `filterOrphansReadyToKill()`. Runs every heartbeat, Linux-only. Catches processes that escaped tracking (daemon restart, lost webhook, etc.).
  - **Descendant check**: `isDescendantOfTracked()` walks `/proc/<pid>/status` PPid up the tree — child/grandchild processes of tracked PIDs (e.g. `node launcher.cjs` → `claude binary`) are excluded. Process hierarchy: daemon → Happy CLI (tracked PID) → node launcher (child) → claude binary (grandchild).
- **Idle timeout**: `findIdleSessions()` pure function in `idleTimeout.ts`, configurable via `HAPPY_DAEMON_IDLE_TIMEOUT` env (default 30min).
- **Activity detection (two layers)**: session reports activity to daemon via `POST /session-activity` when thinking (throttled 5min in `session.ts`). Backup: heartbeat reads `/proc/<pid>/stat` CPU ticks via `processActivity.ts` — if CPU increased, refreshes `lastActivityAt`. Both layers keep `findIdleSessions()` pure.
- **Memory stats**: `collectMemoryStats()` pure function in `memoryStats.ts` reads `/proc/<pid>/status` VmRSS on Linux, null fallback elsewhere.
- **Heartbeat loop** (60s in `run.ts`): prune stale PIDs → detect CPU activity → evict idle → sweep orphans → collect memory stats → emit via `updateDaemonState()`.
- **Audit trail**: `recentlyArchived` array (last 10) tracks eviction reason (`idle`, `manual`, `crash`, `orphan`, `orphan-sweep`).
- **`DaemonStateSchema`** in `api/types.ts` includes `memoryStats`, `recentlyArchived`, `startTime`, `startedWithCliVersion`.
- **App display**: `CompactMemoryBadge.tsx` on session rows; memory section + low-memory warning on machine detail screen.
- **Archive cascade**: `sessionArchive()` in `ops.ts` tries: (1) daemon machineRPC `stop-session` (primary — stable connection, kills by PID), (2) direct session RPC `killSession` (fallback), (3) server `session-end` (last resort).
- **Pure function extraction pattern**: `idleTimeout.ts`, `memoryStats.ts`, `processActivity.ts`, `orphanSweeper.ts` keep `run.ts` wiring-only, enabling unit testing without process spawning.

## Session reactivation (same session ID)

- **Flow**: App calls `machineResumeSession()` → RPC with `happySessionId` + `claudeSessionId` → daemon passes `HAPPY_REACTIVATE_SESSION_ID` + `HAPPY_RESUME_CLAUDE_SESSION_ID` env vars → CLI loads stored encryption key → calls `POST /v1/sessions/:id/reactivate` → server sets `active=true` + updates metadata → same session with full history.
- **Session key store**: `~/.happy/session-keys/<sessionId>.json` persists `{ encryptionKey, encryptionVariant }` for future reactivation.
- **Encryption key recovery**: `dataKey` sessions need the stored key file; `legacy` sessions can always use the shared `secret`; missing key → falls back to creating a new session.
- **Server endpoints**: `POST /v1/sessions/:id/reactivate` (activates), `POST /v1/sessions/:id/end` (deactivates, used by daemon on crash).
- **Retry**: `reactivateSession()` retries once on transient errors (5xx/network), logs at warn level.
- **Zombie prevention**: daemon calls `markSessionInactive()` on crash/orphan/idle — eliminates the 10-minute server timeout delay.
- **History replay guard (outgoing)**: `session.isReactivation` flag in `claudeRemoteLauncher.ts` skips `messageQueue.enqueue()` until `system.init` — defense-in-depth for outgoing messages.
- **History replay fix (incoming)**: `ApiSessionClient.lastSeq` initialized from `session.seq` (not `0`) — prevents `fetchMessages(after_seq=0)` from downloading all historical user messages and feeding them to Claude as new input on reactivation.
- **Lifecycle state**: reactivated sessions start with `lifecycleState: 'waiting'` (not `'running'`) — prevents ghost "working" activity in the app.
- **Webhook timeout**: reactivation spawns get 25s (vs 15s normal) for the extra `/reactivate` API round-trip.
- **Key files**: `sessionKeyStore.ts`, `runClaude.ts`, `api.ts` (`reactivateSession`, `markSessionInactive`), `run.ts` (env passthrough, `apiRef`), `sessionRoutes.ts` (endpoints), `ops.ts` (RPC), `SessionView.tsx` (same-ID handling), `session.ts` (`isReactivation` flag).
