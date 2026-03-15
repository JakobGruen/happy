# Unified Permission Modal — Manual Testing Checklist

> **For testing from a Happy session connected to the worktree build.**
> Branch: `feature/unified-permission-modal`

## Setup

The app should be running from the worktree at `.worktrees/unified-permission-modal`.
You need a Claude session in sandbox or manual permission mode so tools trigger permission requests.

---

## 1. Floating Card Style (all tool modals)

**Test:** Tap any completed tool bubble in chat (e.g., a completed Bash, Read, or Edit tool).

- [ ] Modal opens as a **floating card** — rounded corners on ALL four sides (not just top)
- [ ] Small gap between card edges and screen edges (~12px margin)
- [ ] Card has shadow on all sides
- [ ] Drag handle at top still works — drag up to expand, drag down to shrink
- [ ] Fling down dismisses the modal
- [ ] X button closes the modal
- [ ] Backdrop (semi-transparent overlay) is visible behind the card
- [ ] Tap backdrop closes the modal

## 2. Regular Tool Permission (e.g., Bash)

**Test:** Trigger a Bash command that requires permission (sandbox mode).

- [ ] Modal **auto-opens** when permission arrives (spring slide-up)
- [ ] Content shows **INPUT/OUTPUT tabs** (same as completed tool view)
- [ ] **PermissionActionBar** visible as a **separate card below** the content card
- [ ] ~8px gap between content card and action bar
- [ ] Action bar shows: LLM summary text (italic, gray) if available
- [ ] Action bar shows: **Allow** (green), **Deny** (red) buttons
- [ ] Action bar shows: **Legacy fallback** button ("Approve for session", blue) when no CC suggestions
- [ ] If CC sends suggestions, suggestion buttons appear instead of legacy fallback
- [ ] Allow button works — permission granted, modal closes
- [ ] Deny button — first tap shows feedback TextInput
- [ ] Deny button — second tap with empty text cancels feedback (hides input)
- [ ] Deny button — second tap with text submits deny with feedback
- [ ] Queue badge shows "N more" when multiple permissions pending

## 3. Edit Tool Permission

**Test:** Trigger an Edit/Write tool that requires permission.

- [ ] Modal auto-opens with **DiffModalContent** (same diff view as completed Edit tools)
- [ ] PermissionActionBar shows below with "Allow all edits" legacy button (when no suggestions)
- [ ] Allow works, diff view is readable

## 4. AskUserQuestion Permission

**Test:** Use a prompt that triggers AskUserQuestion (e.g., with options).

- [ ] Modal auto-opens with **QuestionSheetContent** (interactive form)
- [ ] Radio buttons / checkboxes for options work
- [ ] Preview pane shows if options have previews
- [ ] Submit/Cancel buttons are part of the question form (NOT in a separate action bar)
- [ ] **No PermissionActionBar** visible (QuestionSheetContent has its own buttons)
- [ ] Submit sends the answer

## 5. ExitPlanMode Permission

**Test:** Enter plan mode, then exit (CC calls ExitPlanMode).

- [ ] Modal auto-opens with **PlanSheetContent** (scrollable markdown)
- [ ] PermissionActionBar visible below with Allow/Deny
- [ ] Plan text is readable, scrollable
- [ ] Allow exits plan mode

## 6. Minimized Bar

**Test:** While a permission modal is open, swipe down or close it.

- [ ] **Minimized bar** appears at bottom of screen
- [ ] Bar shows: tool icon + tool name + **description as subtitle**
- [ ] Bar shows: **Allow** and **Deny** buttons (green/red) for ALL tool types
- [ ] Bar shows: expand chevron (up arrow)
- [ ] Tap Allow on bar — permission granted without opening modal
- [ ] Tap Deny on bar — deny fires
- [ ] Tap chevron — modal re-opens
- [ ] When new permission arrives — bar disappears, new modal auto-opens

## 7. Permission Queue

**Test:** Trigger multiple permissions in quick succession.

- [ ] First permission auto-opens modal
- [ ] Queue badge shows count (e.g., "2 more")
- [ ] After allowing/denying first, next permission auto-opens
- [ ] Queue count decrements

## 8. Non-Claude Sessions (Codex/Gemini)

**Test:** Open a non-Claude session.

- [ ] No permission modal or bar appears
- [ ] Inline PermissionFooter still works (not suppressed)
- [ ] Tool detail modals still work (floating card style)

## 9. Cross-Session Permission Banner

**Test:** While viewing one session, trigger a permission in another.

- [ ] PermissionBanner (amber bar at top) still appears for other sessions
- [ ] Tapping banner navigates to the session
- [ ] Banner is independent from the modal system

---

## Known Issues (not bugs)

- **Performance**: Every ToolView instance runs permission hooks. May cause extra re-renders in very long sessions (100+ tools). Not visible in normal use.
- **Minimize coordination**: Closing the modal and showing the bar may have a brief visual gap. This is expected for v1.
