# App Debugging & Developer Experience

## Metro Server Issues (Session: 2026-03-11)

### Problem: Metro Dies After Some Time
- Metro was started with `nohup` in background via `dev-reset.sh`
- No process supervision or restart mechanism
- Crashes silently when memory runs out or bundler encounters errors
- Script only checked if process was alive 3 seconds after startup, then exited

### Solution: Metro Watchdog Script
- Created `scripts/metro-watchdog.sh` — continuous monitoring with auto-restart
- Restarts on: process crash OR idle timeout (default 10 min, configurable)
- Added `yarn metro:watchdog` command to package.json for easy invocation
- Logs all restarts with timestamps to `/tmp/happy-metro-dev-watchdog-*.log`
- Recommended workflow: Run Metro watchdog in separate terminal while developing
- Pattern: Can be adapted for other services (server, daemon) that need long-term stability

### Key Files
- `scripts/metro-watchdog.sh` — watchdog implementation
- `scripts/dev-reset.sh` — updated to show watchdog guidance when Metro starts
- `CLAUDE.md` — documented `yarn metro:watchdog` command

## Session Protocol Schema Sync (Session: 2026-03-11)

### Problem: Type Errors on App Start
- `packages/happy-app/sources/sync/typesRaw.ts` had stale schema for `sessionToolCallEndEventSchema`
- Missing `result` and `isError` optional properties
- Code tried to access these properties on lines 764-765, causing TypeScript errors
- App couldn't build, Metro white-screened

### Root Cause
- App defines its own session event schemas locally (line 73+)
- Wire package has authoritative schemas in `packages/happy-wire/src/sessionProtocol.ts`
- The two had diverged — app schema was outdated

### Solution
- Updated `sessionToolCallEndEventSchema` in typesRaw.ts to include:
  ```typescript
  result: z.string().optional(),
  isError: z.boolean().optional(),
  ```
- TypeScript now passes; app loads correctly

### Pattern: Schema Sync
- When session protocol changes, MUST update schema in TWO places:
  1. `packages/happy-wire/src/sessionProtocol.ts` (source of truth)
  2. `packages/happy-app/sources/sync/typesRaw.ts` (app's local copy)
- Consider importing schemas from wire instead of duplicating, but current pattern is accepted for app isolation

## Corruption Recovery (Session: 2026-03-11)

### Issue: Malformed TaskViewFull.tsx
- File had duplicate `const` keyword: `export const const isSkillExpansionMessage`
- Code was corrupted with duplicate sections and mangled syntax
- Likely from bad merge, copy-paste, or incomplete edit

### Resolution
- Reverted entire file to HEAD with `git checkout HEAD -- packages/happy-app/sources/components/tools/views/TaskViewFull.tsx`
- Simpler than trying to hand-fix the mangled code

### Pattern: Corruption Detection
- TypeScript compiler errors with "Declaration expected" and cascading syntax issues often indicate file corruption
- When file has multiple syntax errors in sequence, consider reverting rather than hand-fixing
