# Session Initialization & Reactivation

## Eager Session Initialization (completed)

- **Feature**: Claude SDK starts immediately when session opens, without waiting for first user message
- **Root cause of message replay bug**: `ApiSessionClient.lastSeq` was hardcoded to `0` instead of using `session.seq`, causing full history refetch on reactivation
- **Fix**: Initialize `lastSeq` from `session.seq` in constructor — prevents duplicates on session reactivation
- **Implementation**: Async IIFE in `claudeRemote.ts` handles first message non-blocking, can handle `/clear` and `/compact` commands
- **Test approach**: Use `vi.hoisted()` for early mock setup, `vi.mock()` for module-level mocks, manage mock call counts with separate closures
- **Guard against closed streams**: Check `messages.done` before pushing to stream (can be closed by `/clear`)
- **Key files**: `claudeRemote.ts`, `apiSession.ts` (line 116), `claudeRemote.test.ts` (6 tests, all passing)

## Session Reactivation Bug (Fixed)

- **Bug**: Flag `session.isReactivation` cleared at END of `claudeRemoteLauncher()` function, not after first use
- **Symptom**: Second while loop iteration would reset message queue again, discarding user messages sent after reactivation
- **Root cause**: Flag lifecycle was wrong — should clear after purpose fulfilled, not at function end
- **Fix**: Clear flag immediately after `queue.reset()` (line 403), use `wasReactivated` capture for diagnostics logging
- **Pattern**: Flags used once per function should be cleared after use, not deferred to end — prevents repeated execution on loop iterations
- **Key file**: `claudeRemoteLauncher.ts` lines 177, 403, 581

## Vitest Mocking Patterns

- **Hoisted mocks**: Use `vi.hoisted()` callback to define mock objects before `vi.mock()` calls
- **Export missing types**: Mock must export all types/classes imported by module (e.g., `AbortError`)
- **Mock return values**: Use `mockImplementation()` for dynamic behavior per call, `mockReturnValue()` for static returns
- **Call tracking**: `vi.fn()` automatically tracks calls; use closure variables for call counts when need per-call logic
