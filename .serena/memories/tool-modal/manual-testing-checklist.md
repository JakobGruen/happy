# Tool Modal Manual Testing Checklist

## Overview
The tool modal redesign introduces a clean UI with:
- Parameter names displayed above values (vertical stack)
- Single gray container per value (no double-box styling)
- Intelligent content formatting (JSON, code, diffs, markdown, plain text)
- INPUT/OUTPUT tab switching with parameter counts
- Modal swipe-down-to-dismiss gesture

## Setup

```bash
# Build and start the app
cd packages/happy-app
yarn web          # or `yarn ios` for iOS simulator
```

## Test Categories

### 1. INPUT Tab Rendering

**Test: Parameter Layout**
- [ ] Open a tool modal that has input parameters
- [ ] Verify parameter names are displayed ABOVE values (not inline)
- [ ] Verify names are uppercase and smaller font (12px, secondary color)
- [ ] Verify 16px gap between parameter groups
- [ ] Verify single gray box per value (no double-box effect)

**Test: Parameter Formatting**
- [ ] Markdown values (headings, bold): Should render with formatting (not monospace)
- [ ] Code values: Should show syntax highlighting
- [ ] Nested JSON objects: Should render as formatted, indented JSON
- [ ] Plain text values: Should render as plain selectable text
- [ ] Arrays: Should render as formatted JSON

**Test: Scrolling**
- [ ] Very long parameter values: Should scroll within the parameter box
- [ ] Many parameters: InputContent should scroll vertically
- [ ] No visual glitches or overlapping text while scrolling

**Test: Tab Counting**
- [ ] Count matches number of keys in `tool.input`
- [ ] Tab reads "INPUT (N)" where N is correct count
- [ ] Empty input shows "INPUT" without number

### 2. OUTPUT Tab Rendering

**Test: Result Unpacking**
- [ ] JSON string result `{"key":"value"}`: Should unpack as individual parameters
- [ ] Plain object result: Should render as parameters if 2+ keys
- [ ] Single-key objects: Should use ContentFormatter, not unpacking
- [ ] Empty objects `{}`: Should use ContentFormatter

**Test: Content Detection**
- [ ] String results: Should render as text via ContentFormatter
- [ ] Code-like strings: Should show syntax highlighting
- [ ] Diff strings (+++/---): Should render as diff visualization
- [ ] Markdown strings: Should render with formatting
- [ ] JSON arrays: Should show as formatted JSON

**Test: Tab Counting**
- [ ] Count only shows for multi-key objects (not strings)
- [ ] Tab reads "OUTPUT (N)" for objects, "OUTPUT" for strings/primitives
- [ ] Empty object: Shows as "OUTPUT" (no count)

**Test: Scrolling**
- [ ] Long output content: Should scroll within the modal
- [ ] Code/JSON output: Should scroll horizontally for long lines
- [ ] Diffs: Should scroll with line numbers visible

### 3. Styling Consistency

**Test: Gray Box Background**
- [ ] All parameter value containers use same background color (surfaceRipple)
- [ ] No white boxes, no colored backgrounds
- [ ] Consistent across INPUT and OUTPUT tabs

**Test: Spacing**
- [ ] 16px gap between parameter groups
- [ ] 6px border radius on all boxes (not sharp corners)
- [ ] 10px horizontal padding, 8px vertical padding inside boxes
- [ ] 12px horizontal padding in content container

**Test: Typography**
- [ ] Parameter names: 12px, uppercase, secondary color, 600 weight
- [ ] Tab labels: 14px, 500 weight
- [ ] Value text: varies by type (12px for plain text, syntax for code)

### 4. Modal Interactions

**Test: Modal Open/Close**
- [ ] Tapping tool header opens modal
- [ ] Modal slides up from bottom (animationType="slide")
- [ ] Close button (X) in top-right closes modal
- [ ] Tapping backdrop (dark area) closes modal
- [ ] Swipe-down gesture closes modal (optional on iOS)

**Test: Tab Switching**
- [ ] INPUT tab active by default
- [ ] Clicking OUTPUT tab switches immediately
- [ ] Clicking INPUT tab switches immediately
- [ ] Active tab shows blue underline
- [ ] Content updates smoothly on tab switch
- [ ] No visual glitches during transition

**Test: Modal Header**
- [ ] Tool name displays correctly
- [ ] Close button is visible and tappable (hit area ≥44pt)
- [ ] Header has subtle border below it
- [ ] SafeAreaView respects notches/safe zones

### 5. Permission States

**Test: Permission Pending**
- [ ] When `permission.status === 'pending'`
- [ ] OUTPUT tab is hidden (`hideOutput={true}`)
- [ ] Only INPUT tab visible
- [ ] Tab text shows "INPUT (N)"
- [ ] No OUTPUT tab or option to view results
- [ ] Modal still opens and shows input parameters

**Test: Permission Approved**
- [ ] When `permission.status === 'approved'`
- [ ] Both INPUT and OUTPUT tabs visible
- [ ] Both tabs are clickable
- [ ] OUTPUT shows results

**Test: Permission Denied**
- [ ] Deny reason (if present) shows in red italic in ToolView
- [ ] Tool view shows compact denial message
- [ ] Modal can still be opened to view details

### 6. Edge Cases

**Test: Empty/Null Values**
- [ ] No parameters: Shows "No parameters" message
- [ ] `undefined` values: Handled gracefully
- [ ] `null` values: Rendered as text "null"
- [ ] Empty strings: Show as empty parameter value
- [ ] Empty objects `{}`: Uses ContentFormatter

**Test: Very Large Content**
- [ ] Very long text (>10KB): Scrolls without crashes
- [ ] Deep nested JSON: Renders without flattening
- [ ] Large code blocks: Properly highlighted
- [ ] Many parameters (20+): List scrolls smoothly

**Test: Special Characters**
- [ ] Unicode characters: Display correctly
- [ ] Emoji: Render properly
- [ ] HTML entities: Not escaped (rendered as-is)
- [ ] Control characters: Handled safely

**Test: Different Data Types**
- [ ] Boolean values: Render as "true"/"false"
- [ ] Numbers: Render as text
- [ ] Dates: Render as ISO strings
- [ ] Large numbers: Not truncated
- [ ] Scientific notation: Preserved

### 7. Content Type Detection

**Test: JSON Detection**
- [ ] Objects: Detected as JSON
- [ ] Arrays: Rendered as JSON
- [ ] Stringified JSON: Parsed and formatted

**Test: Code Detection**
- [ ] JavaScript keywords (const, function): Highlighted
- [ ] Python keywords (def, import): Highlighted
- [ ] No false positives for plain text with "if" word

**Test: Diff Detection**
- [ ] Lines starting with +++: Detected as diff
- [ ] Lines starting with ---: Detected as diff
- [ ] @@ markers: Recognized
- [ ] Shows old/new sections side-by-side or split

**Test: Markdown Detection**
- [ ] # Headings: Rendered with formatting
- [ ] **Bold** text: Bolded
- [ ] *Italic* text: Italicized
- [ ] Lists (- or *): Indented/formatted
- [ ] Links: Not clickable (just text)

**Test: Plain Text**
- [ ] Default fallback
- [ ] Long lines: Wrap or scroll
- [ ] Newlines: Preserved

## Verification Checklist

When testing complete, verify:

- [ ] All 5 INPUT tab tests pass
- [ ] All 4 OUTPUT tab tests pass
- [ ] All 3 styling tests pass
- [ ] All 4 modal interaction tests pass
- [ ] All 3 permission state tests pass
- [ ] All 6 edge case tests pass
- [ ] All 5 content type tests pass
- [ ] No console errors or warnings
- [ ] No visual glitches or rendering artifacts
- [ ] Modal performs smoothly (no jank/lag)
- [ ] No crashes on extreme data

## Known Behaviors to Expect

✅ **Expected**: Empty parameter message shows italicized placeholder text
✅ **Expected**: Tab count only shows for multi-key objects
✅ **Expected**: JSON strings auto-unpack only if 2+ keys
✅ **Expected**: Single-key JSON unpacked as parameter
✅ **Expected**: OUTPUT tab hidden during permission pending
✅ **Expected**: Modal closes on backdrop tap or X button
✅ **Expected**: Content scrolls within parameter boxes, not entire modal
✅ **Expected**: Syntax highlighting uses JavaScript by default, detects Python/Java

## Troubleshooting

**Issue**: Double-box styling visible
- Verify VerticalParameterStack is using single `valueContainer` per parameter
- Check that ContentFormatter container is inside valueContainer, not wrapping it

**Issue**: OUTPUT count shows "0" for multi-key objects
- Verify `shouldUnpackJson()` checks for `length >= 2`
- Verify `outputCount` calculation doesn't count arrays as objects

**Issue**: Tab doesn't switch
- Verify `setActiveTab()` is being called on Pressable onPress
- Verify `activeTab` state is correctly used in conditional rendering

**Issue**: Very long text doesn't scroll
- Verify ContentFormatter wraps content in ScrollView
- Verify ScrollView has `flex: 1` and proper contentContainerStyle
- Verify overflow is not hidden on Text components

**Issue**: Permission pending still shows OUTPUT tab
- Verify `hideOutput` prop is passed from ToolView to ToolModal
- Verify ToolModal passes `hideOutput` to ToolModalTabs
- Verify ToolModalTabs uses `hideOutput` to conditionally render OUTPUT tab button

## Test Data Suggestions

Create test sessions with tools that have:

1. **Simple parameters**: 3-4 text parameters
2. **Complex parameters**: Nested JSON object, code block, markdown text
3. **Simple results**: Plain string, number, boolean
4. **Complex results**: Multi-key object, code block, diff output
5. **Permission pending**: Permission.status = 'pending', no OUTPUT visible
6. **Large content**: Parameters with 1000+ char values
7. **Mixed types**: Some text, some code, some JSON in same tool

## Success Criteria

✅ **All checklist items verified green**
✅ **No visual inconsistencies**
✅ **No crashes or errors in console**
✅ **Smooth animations and interactions**
✅ **Proper spacing and typography**
✅ **Content renders as expected for all types**
✅ **Ready for production release**
