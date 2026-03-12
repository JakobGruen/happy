---
name: ToolModal Scroll Bug Fix
description: Layout bug fix—changed maxHeight to height on Animated.View to enable ScrollView
type: feedback
---

## Scroll Bug (Fixed 2025-03-12)

**Issue**: ScrollView inside ToolModal wasn't scrollable despite `flex: 1` on SafeAreaView.

**Root Cause**: Yoga layout engine behavior — `flex: 1` only distributes a parent's *remaining space after intrinsic sizing*. `Animated.View` had `maxHeight: modalHeight.value` (caps growth) but no defined height, causing the entire flex chain to collapse to content size:
```
GestureHandlerRootView (flex: 1)              ✅ defined
  View (flex: 1, justifyContent: 'flex-end')  ✅ defined
    Animated.View (maxHeight only)            ❌ no height → sizes to content
      SafeAreaView (flex: 1)                  ❌ flex: 1 into unsized parent
        ToolModalTabs (flex: 1)               ❌ same cascade
          ScrollView (flex: 1)                ❌ no bounded height → no scroll
```

**Fix**: In `ToolModal.tsx` line ~103, changed:
```ts
// Before:
const animatedStyle = useAnimatedStyle(() => ({
    maxHeight: modalHeight.value,
}));

// After:
const animatedStyle = useAnimatedStyle(() => ({
    height: modalHeight.value,
}));
```

This gives Yoga a concrete boundary, activating the entire `flex: 1` chain.

**Side effect** (desired): Card is now always exactly `modalHeight.value` tall. Short content leaves blank space below — matches spec: "if modal content is smaller than modal size, make sure modal is blank below it and still attaches to the bottom."

**Verification**: `yarn workspace happy-app typecheck` ✅ No errors

**Key learning**: When debugging Yoga layout bugs with `flex: 1` chains:
1. Check if **all parents have defined heights** (not just `max-*` props)
2. `maxHeight` alone doesn't inject height downward — it only caps growth
3. Use `height` instead of `maxHeight` when you need a concrete layout boundary
4. Trace the flex chain from root to leaf — a single unsized parent breaks the entire chain
