# Tool Modal Manual Testing Workflow

## Phase 1: Setup (5 minutes)

1. Open terminal at repo root
2. Start the dev environment:
   ```bash
   yarn dev:reset -m        # Rebuild Metro
   # OR if first time:
   yarn dev:reset           # Full rebuild
   ```

3. Open iOS Simulator or Web:
   ```bash
   yarn workspace happy-app ios    # iOS Simulator
   # OR
   yarn workspace happy-app web    # Web Browser
   ```

4. Wait for app to load completely (watch for Metro bundler completion)

## Phase 2: Create Test Session (10 minutes)

### Option A: Use Claude Code (Recommended)
1. Create new session in app
2. Run a command that uses tools:
   ```
   /create-plugin my-test
   ```
   This triggers multiple tools (Read, Write, MultiEdit)

3. Allow permissions for tools to complete
4. Wait for all tools to finish (completion state)

### Option B: Use Voice Agent
1. Create new session in app
2. Click voice button and ask a question requiring file operations
3. Tools will appear in the message stream

### Option C: Manual Tool Injection (Testing Only)
If you have access to the CLI, you can inject test messages directly

## Phase 3: Modal Testing Flow

### Step 1: Basic Modal Open/Close (5 min)
1. Find a tool with input parameters (e.g., "Read" tool with file_path)
2. Tap the tool header (the minimized 2-line chat bubble)
3. **Verify**: Modal slides up from bottom
4. **Verify**: Tool name shows in header
5. **Verify**: Close (X) button visible in top-right
6. Tap X button
7. **Verify**: Modal closes smoothly

### Step 2: INPUT Tab Verification (10 min)
1. Open modal again (any tool with input)
2. INPUT tab should be active by default
3. **Verify**: Parameter names appear ABOVE values (not inline)
4. **Verify**: Names are uppercase, gray color, smaller font
5. **Verify**: Each parameter in a single gray box (no double-box)
6. **Verify**: 16px gaps between parameters
7. **Verify**: "INPUT (N)" shows correct count
8. Scroll down if many parameters
9. **Verify**: Scrolling smooth and responsive

### Step 3: Markdown/Code Detection (5 min)
1. Look for a tool result with markdown or code
2. Switch to OUTPUT tab
3. **Verify**: Markdown (# headings, **bold**) renders with formatting
4. **Verify**: Code blocks show syntax highlighting
5. **Verify**: JSON shows indented and colored
6. **Verify**: All in single gray container

### Step 4: OUTPUT Tab Parameter Unpacking (5 min)
1. Find tool with object result (e.g., `{ file: "...", size: 123 }`)
2. Switch to OUTPUT tab
3. **Verify**: Object unpacks as parameters (not shown as JSON)
4. **Verify**: "OUTPUT (2)" shows count = 2
5. **Verify**: Each key rendered as parameter above value
6. Test single-key object: `{ result: "..." }`
7. **Verify**: Shown as text via ContentFormatter, not unpacked

### Step 5: Permission Pending State (5 min)
1. Run a command that requires permission (e.g., bash execution)
2. Tool appears with permission pending
3. **Verify**: OUTPUT tab is NOT visible
4. **Verify**: Only INPUT tab available
5. **Verify**: Tab text shows "INPUT (N)" only
6. Approve or deny permission
7. **Verify**: OUTPUT tab becomes visible (if approved)

### Step 6: Tab Switching Performance (3 min)
1. Open any modal with both INPUT and OUTPUT
2. Click INPUT tab
3. **Verify**: Immediate switch to INPUT content
4. Click OUTPUT tab
5. **Verify**: Immediate switch to OUTPUT content
6. Switch back and forth 5 times
7. **Verify**: No lag, visual glitches, or errors

### Step 7: Scrolling & Large Content (5 min)
1. Find tool with very long output (>500 chars)
2. Open OUTPUT tab
3. **Verify**: Content scrolls within gray box
4. **Verify**: ScrollView indicator visible
5. Scroll to top, middle, bottom
6. **Verify**: Smooth and responsive
7. Test with long code block
8. **Verify**: Horizontal scroll works if lines are long

### Step 8: Edge Cases (5 min)

**Empty Parameters**
- Open modal with empty input `{ }`
- **Verify**: Shows "No parameters" message

**Null/Undefined Values**
- Find tool with `null` or `undefined` in parameters
- **Verify**: Rendered safely (not crash)
- **Verify**: Shows as text representation

**Mixed Types in Output**
- Find tool with varied output (text, numbers, booleans)
- **Verify**: All render correctly
- **Verify**: No type errors in console

**Very Large Nested JSON**
- Find tool with deeply nested result
- Switch to OUTPUT tab
- **Verify**: No crash
- **Verify**: Scrolls properly
- **Verify**: All levels indented correctly

### Step 9: Backdrop & Gesture (3 min)
1. Open any modal
2. Tap the dark area (backdrop) around the modal
3. **Verify**: Modal closes
4. Reopen modal
5. On iOS: Swipe down from top of modal
6. **Verify**: Modal closes with swipe gesture (if implemented)

### Step 10: Visual Consistency Check (5 min)
1. Open 3-4 different tools in sequence
2. **Verify**: All gray boxes look identical (same color, radius, padding)
3. **Verify**: All tab headers styled consistently
4. **Verify**: All parameter names formatted the same
5. **Verify**: Spacing consistent across all modals
6. **Verify**: Close button in same position each time
7. **Verify**: Safe area respected on notched devices

## Phase 4: Error Checking (5 minutes)

### Console Errors
1. Open DevTools (web) or XCode console (iOS)
2. Perform all above tests
3. **Verify**: No TypeScript errors
4. **Verify**: No Runtime errors
5. **Verify**: No warnings related to ToolModal, VerticalParameterStack, ContentFormatter

### Performance
1. Monitor FPS/performance during modal open/close
2. **Verify**: Smooth 60fps (or 120fps on newer devices)
3. **Verify**: No jank during tab switching
4. **Verify**: Scrolling smooth without stuttering

### Memory
1. Open and close modal 10 times
2. **Verify**: No memory leaks
3. **Verify**: App performance stable
4. **Verify**: No OOM errors

## Phase 5: Summary & Report

After all testing complete:

### Generate Report

```bash
# Commit the manual testing completion
git add -A
git commit -m "manual(tools): verify tool modal UI and content formatting on device

- Tested INPUT tab parameter rendering (names above values, single gray box)
- Tested OUTPUT tab with JSON unpacking and content formatting
- Verified permission pending hides OUTPUT tab
- Tested tab switching, scrolling, and edge cases
- Verified styling consistency across all modals
- No console errors or visual glitches
- App ready for production"
```

### Checklist to Report

- [ ] INPUT tab renders with proper layout
- [ ] OUTPUT tab unpacks objects correctly
- [ ] Permission pending hides OUTPUT
- [ ] Tab switching smooth and responsive
- [ ] Scrolling works for long content
- [ ] Modal gestures work (close button, backdrop, swipe)
- [ ] Styling consistent across modals
- [ ] No visual double-boxes
- [ ] No console errors or warnings
- [ ] No crashes on edge cases
- [ ] Performance smooth (60+ fps)
- [ ] App stable after many interactions

## Quick Test (< 5 minutes)

If short on time, run just these critical checks:

1. ✅ Open modal - slide up animation works
2. ✅ View INPUT tab - parameter names above values, single gray box
3. ✅ Switch to OUTPUT tab - content renders correctly
4. ✅ Close modal - X button works
5. ✅ Check console - no errors
6. ✅ Verify styling - gray boxes consistent

If all ✅, tool modal redesign is production-ready.

## Debugging Failed Tests

**If modal doesn't open**: Check ToolView.tsx tap handler and modal visible state
**If spacing looks off**: Check VerticalParameterStack.tsx styles (16px margins, 6px radius)
**If double-box appears**: Verify ContentFormatter not double-wrapping in gray box
**If OUTPUT shows wrong count**: Check shouldUnpackJson() logic for multi-key detection
**If permission pending still shows OUTPUT**: Check hideOutput prop threading through components
**If scrolling broken**: Check ScrollView flex and contentContainerStyle props
**If tabs don't switch**: Check activeTab state and setActiveTab() callback
**If styling inconsistent**: Verify all useUnistyles() calls use correct theme colors (surfaceRipple, text, textSecondary)

## Next Steps After Testing

1. Document any issues found
2. Create bugs for critical issues (crashes, major UI glitches)
3. Create enhancement requests for nice-to-haves
4. Merge PR once all critical issues resolved
5. Deploy to production
6. Monitor error logs and user feedback for issues
