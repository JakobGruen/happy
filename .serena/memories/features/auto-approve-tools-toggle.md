# Auto-Approve Tools Toggle (autoApproveTools)

## What
Independent boolean toggle that auto-approves all tool uses except `AskUserQuestion` and `ExitPlanMode`. Composes with any base permission mode (Default, Accept Edits, Plan, Bypass).

## Architecture
- **Not a permission mode** — `autoApproveTools` is a separate boolean field, orthogonal to `permissionMode`
- **Wire schema**: `autoApproveTools?: boolean` in `MessageMetaSchema` (`messageMeta.ts`)
- **CLI PermissionHandler**: `autoApproveTools` boolean field, checked independently of `permissionMode` in `handleToolCall()`
- **RPC**: `switch-permission-mode` accepts `{ mode, autoApproveTools? }` — both travel in a single RPC
- **Metadata**: `autoApproveTools` stored in session metadata for persistence across reloads

## Key Design Decision
Initially implemented as `yoloAsk` — a competing permission mode in the same radio selector. This prevented combining with other modes (e.g., Plan + auto-approve). Redesigned as an independent toggle that composes with any base mode.

The toggle works because:
- Base mode maps to SDK mode as usual (e.g., `plan` → SDK `plan`)
- `autoApproveTools` is checked in PermissionHandler *before* the normal approval flow
- Even in Plan mode, tool calls (like ExitPlanMode) route through the handler

## Data Flow
```
App toggle → RPC { mode: 'plan', autoApproveTools: true }
  → CLI: permissionHandler.setAutoApproveTools(true) + handleModeChange('plan')
  → SDK mode: 'plan' (from mapToClaudeMode)
  → handleToolCall(): if autoApproveTools && !askUserQuestion && !exitPlan → auto-allow
```

## Files Changed
| Layer | File | Change |
|-------|------|--------|
| Wire | `messageMeta.ts` | Added `autoApproveTools?: boolean` |
| Wire | `claudeModels.ts` | Operating modes list (no yoloAsk) |
| CLI | `permissionHandler.ts` | `autoApproveTools` boolean + `setAutoApproveTools()` |
| CLI | `claudeRemoteLauncher.ts` | RPC handler accepts `autoApproveTools` |
| CLI | `runClaude.ts` | Reads `autoApproveTools` from message meta |
| CLI | `getToolDescriptor.ts` | `askUserQuestion` flag for AskUserQuestion tool |
| CLI | `api/types.ts` | `autoApproveTools` in local MessageMetaSchema |
| App | `AgentInput.tsx` | Switch toggle UI + badge "· Auto" suffix |
| App | `SessionView.tsx` | `updateAutoApproveTools` callback + RPC |
| App | `storage.ts` | `updateSessionAutoApproveTools` store method |
| App | `storageTypes.ts` | `autoApproveTools` on Session interface |
| App | i18n (11 files) | `autoApproveTools.title` + `.description` keys |

## UI
- Toggle appears between permission mode radios and divider in settings overlay
- Badge shows "Plan · Auto" or "Default · Auto" when enabled
- Uses `theme.colors.permission.safeYolo` color when active
- Toggle hidden/disabled when `bypassPermissions` is selected (redundant)
- Claude-only (not shown for Codex/Gemini)

## Date: 2026-03-14
## Status: Complete, committed on `happy-bridge` branch
