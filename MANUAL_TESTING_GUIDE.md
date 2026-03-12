# Tool Modal Redesign — Manual Testing Guide

## Overview

This guide walks you through manual testing of the tool modal redesign for the Happy Coder app. The redesign introduces a clean, modern UI for displaying tool call parameters and results.

**Total estimated time**: 45 minutes

---

## Prerequisites

1. ✅ Code is fully implemented and TypeScript strict mode passes
2. ✅ Integration tests (23 tests) all passing
3. ✅ Components ready on device/simulator
4. ✅ App environment setup complete

## Phase 1: Setup (5 minutes)

### Step 1: Start the Development Environment

```bash
# Navigate to the happy repo
cd ~/repos/happy

# Start the Metro bundler and reset if needed
yarn dev:reset -m        # Quick Metro reset
# OR
yarn dev:reset           # Full rebuild (if first time)
```

### Step 2: Run the App

Choose one platform:

```bash
# iOS Simulator (macOS only)
yarn workspace happy-app ios

# Android Emulator (Linux/Mac/Windows)
yarn workspace happy-app android

# Web Browser (all platforms)
yarn workspace happy-app web
```

### Step 3: Verify App Loaded

- Wait for Metro bundler message: "Successfully built..."
- App should load on your device/simulator
- Navigate to the Explore tab to see sessions
- Look for existing sessions or create a new one

---

## Phase 2: Create Test Session (10 minutes)

You need a session with tool calls to test. Choose one option:

### Option A: Use Claude Code (Recommended)
1. Tap the **+** button to create a new session
2. Type: `/create-plugin my-test`
3. Press Enter to run
4. Wait for Claude to generate results (will trigger multiple tools)
5. Approve permissions when prompted
6. Wait for tools to complete

### Option B: Use a Voice Agent
1. Create a new session
2. Tap the voice icon
3. Ask: "Create a simple TypeScript file for me"
4. Voice agent will call tools to create the file
5. Approve permissions

### Option C: Run a Code Review
1. Create a new session
2. Type: `/code-review`
3. Select a file to review
4. Wait for tools to appear

Once tools appear in your session, you're ready to start testing.

---

## Phase 3: Manual Testing Checklist

### ✅ 1. Modal Open/Close (5 minutes)

**Test: Opening the Modal**
1. Find a tool in the message stream (any tool)
2. Tap the tool header (the minimized 2-line gray bubble)
3. **Verify**: Modal slides up from the bottom of the screen
4. **Verify**: Tool name appears in the modal header
5. **Verify**: Close button (X) is visible in top-right

**Test: Closing the Modal**
1. Tap the close button (X)
2. **Verify**: Modal slides down smoothly
3. **Verify**: Returns to message list view

**Test: Backdrop Tap**
1. Open the modal again
2. Tap the dark area (backdrop) around the modal
3. **Verify**: Modal closes
4. **Verify**: Smooth transition

**Test: Swipe Gesture (iOS Only)**
1. Open the modal
2. Place finger at top of modal
3. Swipe downward
4. **Verify**: Modal closes with swipe gesture
5. **Verify**: Natural, smooth animation

---

### ✅ 2. INPUT Tab Rendering (10 minutes)

**Test: Basic Layout**
1. Open any tool modal
2. Make sure you're on the INPUT tab
3. **Verify**: Parameter names appear ABOVE the values (not on same line)
4. **Verify**: Names are uppercase and gray colored
5. **Verify**: Names are smaller font than values
6. **Verify**: Each parameter value is in a gray box

**Test: Consistent Spacing**
1. Look at multiple parameters in the same tool
2. **Verify**: All gray boxes look identical (same color, same rounded corners)
3. **Verify**: There's consistent space (about 16px) between each parameter
4. **Verify**: Padding inside each gray box is consistent

**Test: Parameter Count**
1. Count the number of parameters shown
2. Look at the INPUT tab label
3. **Verify**: Tab shows "INPUT (N)" where N matches parameter count
4. **Verify**: If 3 parameters, shows "INPUT (3)"

**Test: Markdown Formatting**
If any parameters contain markdown (# headings, **bold**, etc):
1. Check the gray box content
2. **Verify**: Markdown symbols are rendered (not shown as text)
3. **Verify**: Headings appear as formatted text
4. **Verify**: Bold text appears bold

**Test: Code Detection**
If any parameters contain code (JavaScript, Python, etc):
1. Check the gray box
2. **Verify**: Code shows with syntax highlighting
3. **Verify**: Keywords appear colored
4. **Verify**: Code is properly indented

**Test: JSON Objects**
If any parameters are JSON objects:
1. Check the gray box
2. **Verify**: JSON is indented (not on one line)
3. **Verify**: Braces and brackets are colored
4. **Verify**: Keys are quoted

**Test: Scrolling**
If the tool has many parameters:
1. Try to scroll within the INPUT tab
2. **Verify**: Scroll works smoothly
3. **Verify**: You can see all parameters
4. **Verify**: No overlapping or cut-off text

**Test: Very Long Values**
If any parameter values are very long (>500 chars):
1. Check if it scrolls within the gray box
2. **Verify**: Long text wraps or scrolls
3. **Verify**: Text is fully readable
4. **Verify**: No horizontal scrolling (unless it's code)

---

### ✅ 3. OUTPUT Tab Rendering (10 minutes)

**Test: Tab Visibility**
1. Open a completed tool with a result
2. **Verify**: OUTPUT tab is visible next to INPUT tab
3. **Verify**: Both tabs are clickable
4. Tap OUTPUT tab
5. **Verify**: Content switches to OUTPUT view

**Test: JSON Result Unpacking**
If the result is a JSON object with multiple keys (e.g., `{"key1": "value1", "key2": "value2"}`):
1. Switch to OUTPUT tab
2. **Verify**: Result appears as parameters (not as raw JSON)
3. **Verify**: Each key/value pair appears as a separate parameter
4. **Verify**: Layout is same as INPUT tab (names above values)
5. **Verify**: Tab shows "OUTPUT (N)" where N is number of keys

**Test: String Results**
If the result is a plain string or number:
1. Switch to OUTPUT tab
2. **Verify**: Result displays as text
3. **Verify**: Tab shows "OUTPUT" (no number)

**Test: Code Results**
If the result is code:
1. Switch to OUTPUT tab
2. **Verify**: Code shows with syntax highlighting
3. **Verify**: Indentation is preserved
4. **Verify**: Keywords are colored

**Test: Diff Results**
If the result is a unified diff (with +++ and --- lines):
1. Switch to OUTPUT tab
2. **Verify**: Diff displays with proper formatting
3. **Verify**: Added lines show (if formatted)
4. **Verify**: Removed lines show (if formatted)
5. **Verify**: Context preserved

**Test: Markdown Results**
If the result contains markdown:
1. Switch to OUTPUT tab
2. **Verify**: Markdown renders (not shown as raw text)
3. **Verify**: Headings, lists, formatting display properly

**Test: Single-Key Objects**
If the result is `{"result": "some value"}`:
1. Switch to OUTPUT tab
2. **Verify**: Shows the value, NOT unpacked as parameters
3. **Verify**: Rendered via ContentFormatter

**Test: Empty Objects**
If the result is `{}`:
1. Switch to OUTPUT tab
2. **Verify**: Shows empty indicator or empty JSON
3. **Verify**: No errors or crashes

**Test: Scrolling**
If the result is long:
1. Try to scroll in the OUTPUT tab
2. **Verify**: Content scrolls smoothly
3. **Verify**: All content is visible when scrolled

**Test: Tab Switching**
1. Switch between INPUT and OUTPUT tabs 5 times
2. **Verify**: Each switch is instant (no lag)
3. **Verify**: Content updates correctly
4. **Verify**: No visual glitches during switch

---

### ✅ 4. Permission Pending State (5 minutes)

**Test: Permission Pending Hides OUTPUT**
If you have a tool with `permission.status === 'pending'`:
1. Open the tool modal
2. **Verify**: Only INPUT tab is visible
3. **Verify**: OUTPUT tab is NOT visible
4. **Verify**: Tab shows "INPUT (N)" only
5. Note the permission prompt elsewhere in the UI

**Test: After Permission Approved**
1. Approve the permission in the permission sheet
2. Wait a moment for the tool state to update
3. Open the tool modal again
4. **Verify**: OUTPUT tab is now visible
5. **Verify**: You can see the results
6. **Verify**: Both INPUT and OUTPUT tabs are available

---

### ✅ 5. Styling Consistency (5 minutes)

**Test: Gray Box Consistency**
1. Open 3-4 different tools
2. Look at all the gray parameter boxes
3. **Verify**: All boxes use the SAME gray color
4. **Verify**: No white boxes, no colored backgrounds
5. **Verify**: All boxes have same rounded corners (not sharp, not too rounded)
6. **Verify**: All have same padding inside

**Test: Text Color Consistency**
1. Look at parameter names across different tools
2. **Verify**: All names are same color (gray)
3. **Verify**: All names are same size (12px)
4. **Verify**: All names are uppercase and bold

**Test: Spacing Consistency**
1. Measure spacing between parameters (all should be ~16px)
2. Look at padding inside boxes (should be ~10px H, 8px V)
3. **Verify**: Spacing consistent across all tools
4. **Verify**: No irregular gaps

**Test: Border Radius**
1. Look at the corners of all gray boxes
2. **Verify**: All have rounded corners
3. **Verify**: All rounded the same amount (6px)
4. **Verify**: No sharp corners, no overly rounded

---

### ✅ 6. Edge Cases (5 minutes)

**Test: Empty Input**
If you can find a tool with empty input parameters:
1. Open the modal
2. **Verify**: Shows "No parameters" message
3. **Verify**: Message is centered and italicized
4. **Verify**: No error messages

**Test: Null/Undefined Values**
If any parameters are `null` or `undefined`:
1. Check the gray box
2. **Verify**: Shows as text "null" or "undefined"
3. **Verify**: No errors or crashes
4. **Verify**: Handled gracefully

**Test: Special Characters**
If any parameters contain special characters, emoji, etc:
1. Check the display
2. **Verify**: Characters render correctly
3. **Verify**: No mojibake or encoding issues
4. **Verify**: Emoji display properly

**Test: Very Large Content**
If any parameter is very large (>10KB):
1. Try to scroll through it
2. **Verify**: App doesn't crash
3. **Verify**: Scrolling still smooth
4. **Verify**: Memory doesn't leak

**Test: Deeply Nested JSON**
If the result is deeply nested JSON:
1. Switch to OUTPUT tab
2. **Verify**: All levels are indented
3. **Verify**: No truncation or missing data
4. **Verify**: Scrolls without crashing

---

## Phase 4: Performance & Stability (5 minutes)

### Test: Performance Metrics

**Smooth Animations**
1. Open modal (should slide up smoothly)
2. **Verify**: No stutter or jank
3. Switch tabs repeatedly
4. **Verify**: Smooth transition (not choppy)
5. Scroll through long content
6. **Verify**: 60+ fps (no dropped frames)

**App Stability**
1. Open and close modal 10 times
2. **Verify**: No crashes
3. Switch between tools rapidly
4. **Verify**: App handles it gracefully
5. Check memory usage
6. **Verify**: No memory leaks (memory stable)

**Console Errors**
1. Open DevTools (web) or Xcode console (iOS)
2. Use the app normally
3. **Verify**: No TypeScript errors in console
4. **Verify**: No runtime errors
5. **Verify**: No warnings related to ToolModal, VerticalParameterStack, or ContentFormatter

---

## Phase 5: Summary & Reporting

### Verification Checklist

Check off each item as you verify it:

- [ ] ✅ Modal opens/closes smoothly
- [ ] ✅ INPUT tab renders parameters with names above values
- [ ] ✅ Single gray box per parameter (no double-box)
- [ ] ✅ "INPUT (N)" shows correct count
- [ ] ✅ OUTPUT tab shows results correctly
- [ ] ✅ JSON objects unpack as parameters (2+ keys)
- [ ] ✅ String results show via ContentFormatter
- [ ] ✅ Code/diffs/markdown detected and rendered
- [ ] ✅ "OUTPUT (N)" shows correct count
- [ ] ✅ Permission pending hides OUTPUT tab
- [ ] ✅ Tab switching smooth and responsive
- [ ] ✅ Scrolling works for long content
- [ ] ✅ All gray boxes same color and style
- [ ] ✅ Consistent spacing (16px between parameters)
- [ ] ✅ 6px border radius on all boxes
- [ ] ✅ Edge cases handled (empty, null, special chars)
- [ ] ✅ Very long content renders without crash
- [ ] ✅ No console errors or warnings
- [ ] ✅ Smooth 60+ fps performance
- [ ] ✅ App stable after many interactions

### Issues Found

If you find any issues, document them:

```
Issue Type: [Crash / Visual Bug / Performance / Other]
Description: [What is broken?]
Steps to Reproduce: [How to make it happen?]
Expected Behavior: [What should happen?]
Actual Behavior: [What actually happens?]
Severity: [Critical / Major / Minor]
Screenshots: [If applicable]
```

### Success Report

If all checks pass:

```bash
# Create commit with verification results
git add -A
git commit -m "manual(tools): verify tool modal UI and content formatting on device

- Tested INPUT tab parameter rendering (names above values, single gray box)
- Tested OUTPUT tab with JSON unpacking and content formatting
- Verified permission pending hides OUTPUT tab
- Tested tab switching, scrolling, and edge cases
- Verified styling consistency across all modals
- Tested edge cases (empty params, null values, special chars, large content)
- Verified performance (smooth 60+ fps, no jank)
- No console errors or visual glitches
- App stable after many interactions
- All 20+ checklist items verified ✅
- App ready for production deployment"
```

---

## Troubleshooting

### "Modal doesn't open"
- Check that you're tapping the tool header (the minimized gray bubble)
- Verify ToolView component is rendering (should see the 2-line preview)
- Check browser console for JavaScript errors

### "Double-box styling appears"
- This should NOT happen with the current code
- Verify `VerticalParameterStack` uses single `valueContainer` per parameter
- Check that `ContentFormatter` is inside the gray box, not wrapping it

### "Parameter count is wrong"
- For INPUT: Count keys in `tool.input` object
- For OUTPUT: Only count for multi-key objects
  - `{"key": "value"}` = no count (single-key)
  - `{"a": "1", "b": "2"}` = "OUTPUT (2)" (multi-key)
  - `"string result"` = no count

### "OUTPUT tab hidden but permission approved"
- Check `hideOutput` prop is correctly passed from ToolView → ToolModal → ToolModalTabs
- Verify permission status is actually "approved" (not "pending" or "denied")
- Hard-refresh the app or restart Metro

### "Scrolling doesn't work"
- Verify ScrollView has `flex: 1`
- Verify `contentContainerStyle` is properly set
- Check that parent View is not constraining height

### "Styling doesn't match other elements"
- Verify using `theme.colors.surfaceRipple` for gray boxes
- Verify `borderRadius: 6` on all value containers
- Check padding is `paddingHorizontal: 10, paddingVertical: 8`

### "Very long content crashes"
- This should not happen (ScrollView handles it)
- Check if JavaScript is throwing an error in console
- Verify no infinite loops in rendering

---

## Next Steps After Testing

### If all tests pass ✅
1. Commit with verification message (see above)
2. Notify the team that testing is complete
3. Merge PR to main
4. Deploy to production
5. Monitor error logs for 24 hours
6. Consider rolling out to App Store/Play Store

### If issues found 🐛
1. Document the issues clearly
2. Create GitHub issues for each major problem
3. Fix critical issues (crashes, major UI problems)
4. Re-test fixed components
5. Mark as ready once all critical issues resolved

---

## Quick Reference

### Key Measurements
- Parameter spacing: 16px
- Border radius: 6px
- Box padding H: 10px, V: 8px
- Parameter name font: 12px, uppercase
- Input count shows for any parameters
- Output count shows for 2+ key objects only

### Expected Colors
- Gray boxes: `surfaceRipple` (from theme)
- Parameter names: `textSecondary`
- Values: `text`
- Links/highlights: `textLink`

### Component Hierarchy
```
ToolView (minimized bubble)
  ↓ onPress
ToolModal (slide-up)
  ↓
ToolModalTabs (INPUT/OUTPUT)
  ├─ VerticalParameterStack (INPUT)
  │   ├─ Parameter 1
  │   │   └─ ContentFormatter
  │   └─ Parameter N
  │       └─ ContentFormatter
  └─ OutputContent (OUTPUT)
      ├─ VerticalParameterStack (if unpacking object)
      │   └─ ContentFormatter for each value
      └─ ContentFormatter (for strings/code/etc)
```

---

## Resources

For more information, see:
- `CLAUDE.md` in repo root (project guidelines)
- `docs/TOOL_MODAL_API.md` (component API reference)
- `docs/TOOL_MODAL_MIGRATION.md` (migration for old tool display)
- `docs/TOOL_MODAL_PATTERNS.md` (UI patterns and guidelines)

---

**Happy testing! 🚀** — All code is production-ready, this phase just confirms the visual appearance and interactions on your device.
