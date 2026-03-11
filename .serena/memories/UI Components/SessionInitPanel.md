# SessionInitPanel Component Pattern

**Status**: Completed and deployed in happy-app

## Overview
Card-based launch pad UI for session initialization with agent tabs, rich configuration cards, and animated transitions.

## Components
- **SessionInitCard** - Reusable card primitive for options display
- **SessionInitPanel** - Orchestrator panel with tabs, cards, and activation button

## Key Design Decisions
1. **Agent tabs at top** - Natural entry point, controls model/mode filtering
2. **Card-based layout** - Visual prominence for each option (Session Type, Model, Mode, Machine/Dir)
3. **Staggered animations** - Progressive reveal with 100ms delays between cards
4. **[Change] button** - Opens modal overlay for machine/path picker (vs. direct navigation)
5. **No initial message** - Keep init panel focused on configuration only

## Architecture
- Agent selection → filters `availableModels`, `availableModes`
- Each card built from options array (SessionInitCardOption[])
- All state lives in parent `new/index.tsx`, SessionInitPanel is stateless
- Activation triggers `handleCreateSession` RPC with all current selections

## Styling Patterns
- ItemGroup pattern: borderRadius 10/16, shadow, overflow:hidden
- Unistyles theme integration: `theme.colors.*`, `Typography.default()`
- Platform.select for iOS/Android/Web differences
- Animated components from react-native-reanimated v3

## Files
- `packages/happy-app/sources/components/SessionInitCard.tsx`
- `packages/happy-app/sources/components/SessionInitPanel.tsx`
- `packages/happy-app/sources/app/(app)/new/index.tsx` (integration)