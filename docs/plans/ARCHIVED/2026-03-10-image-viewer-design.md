# Fullscreen Image Viewer — Design

## Goal

Add tap-to-zoom fullscreen image viewer to the happy-app. When a user taps an image thumbnail in a chat message, it opens a fullscreen modal with pinch-to-zoom, pan, gallery swipe, and swipe-down-to-dismiss.

## Approach

Custom-built using `react-native-reanimated` + `react-native-gesture-handler` (both already installed). No new dependencies.

## Gestures & Behavior

| Gesture | Action |
|---|---|
| Tap thumbnail | Opens fullscreen at tapped image index |
| Pinch | Zoom in/out (min 1x, max 4x) |
| Pan (when zoomed) | Pan around the image |
| Horizontal swipe (not zoomed) | Navigate between images in message |
| Vertical swipe down | Dismiss with opacity fade (threshold ~100px) |
| Tap X button | Close |
| Tap background (not zoomed) | Close |

## Visual Design

- Black overlay background (`rgba(0,0,0,0.95)`)
- Image centered, `contentFit="contain"`
- X button: top-right, white icon on semi-transparent dark circle
- Page indicator dots at bottom (only when >1 image)

## Architecture

- **`ImageViewerManager`** — static class with `open(images, index)` / `close()`, event emitter pattern (matches existing `Modal` from `@/modal`)
- **`ImageViewer`** — React component mounted once in root layout, listens to manager events
- **Reanimated shared values** for scale, translateX/Y, overlay opacity
- **GestureDetector** for composed pinch + pan + tap gestures
- **FlatList** with `pagingEnabled` for horizontal gallery navigation

## Files to Create/Modify

| File | Change |
|---|---|
| `sources/components/ImageViewer.tsx` | New — component + manager (~200 lines) |
| `sources/components/MessageView.tsx` | Modify — wrap thumbnails in Pressable, call `ImageViewerManager.open()` |
| `sources/app/_layout.tsx` | Modify — mount `<ImageViewer />` at root |

## Non-goals

- No share/save button (can add later)
- No i18n (no user-visible text)
- No web-specific implementation (gestures work cross-platform)
