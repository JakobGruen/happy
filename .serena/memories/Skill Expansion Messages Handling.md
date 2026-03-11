# Skill Expansion Message Handling

## Problem
Skill invocations were generating large markdown expansion content that appeared as separate messages in the main chat, cluttering conversations. The expansion content should be hidden from chat and accessible in the Skill tool detail view instead.

## Solution Implemented
### Reducer Phase 6: Post-Processing (Phase 6)
Added a post-processing phase in the reducer to:
1. Detect skill expansion messages using `isSkillExpansionContent()` pattern matching
2. Find the preceding Skill tool in the message history
3. Attach expansion content to the Skill tool's `result` field
4. Remove the expansion message from the main chat by excluding it from `changed`

### Detection Patterns
Messages are identified as skill expansion content if they include:
- `"Base directory for this skill:"`
- `"Base directory:"`
- `"This skill guides"` AND `"implementation"`
- `"Design Thinking"` AND length > 500 characters

### UI Filtering
- **MessageView.tsx**: AgentTextBlock returns null for skill expansion messages
- **TaskViewFull.tsx**: ChildMessage component filters out skill expansion from Activity/Response sections
- **SkillView.tsx**: Displays skill content from tool.result in the detail view

## Key Files
- `packages/happy-app/sources/sync/reducer/reducer.ts` - Core linking logic (Phase 6)
- `packages/happy-app/sources/components/MessageView.tsx` - Main chat filtering
- `packages/happy-app/sources/components/tools/views/TaskViewFull.tsx` - Task tool filtering
- `packages/happy-app/sources/components/tools/views/SkillView.tsx` - Skill detail rendering
- `packages/happy-app/sources/sync/reducer/reducer.test.ts` - Test coverage (NEW)

## Testing
TDD approach: Wrote failing test first, implemented minimal code to pass, then refactored.
Test verifies that skill expansion content is attached to Skill tool and NOT rendered in main chat.

## Architecture Note
Phase 6 runs after all other processing phases (tool calls, sidechains, etc.) so that:
1. All Skill tool messages have already been created
2. Message timestamps are finalized for chronological ordering
3. Attachment logic can reliably find the preceding tool
