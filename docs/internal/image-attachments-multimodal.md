# Image Attachments & Multimodal Messages

How images travel end-to-end through Happy as inline base64 content blocks, plus the encryption workarounds the web platform needs.

- **Inline base64 approach**: images travel as base64 content blocks inside E2E encrypted payloads — no server changes needed.
- **Wire schema**: `UserMessageSchema` uses a discriminated union `text | multimodal` with `ImageContentBlockSchema` in `legacyProtocol.ts`.
- **CLI pipeline**: `MessageQueue2` accepts `UserContent = string | UserContentBlock[]`; smart batching merges mixed content; non-Claude launchers extract text-only.
- **App schemas**: `rawRecordSchema` user content → discriminated union; `NormalizedMessage` user variant widened; `ImageAttachmentData` on `UserTextMessage`.
- **Reducer Phase 1**: extracts text + images from multimodal content blocks, passes `imageAttachments` through `convertReducerMessageToMessage`.
- **UI**: `useImageAttachment` hook (expo-image-picker + expo-image-manipulator, max 2048px, max 4); `AgentInput` has an image button, thumbnail strip, and web paste handler; `MessageView` renders images in user bubbles.
- **Fullscreen viewer**: `ImageViewer.tsx` — imperative singleton `ImageViewerManager.open(images, index)` + React component. Pinch-to-zoom (1x–4x), pan, swipe-down-to-dismiss, double-tap toggle, gallery swipe with page dots. Mounted in root `_layout.tsx`. Uses reanimated + gesture-handler (no new deps).

## Encryption gotchas

- **Base64 overflow fix**: `encryption/base64.ts` `encodeBase64()` uses 8KB chunked `String.fromCharCode()` — `Function.apply()` has a ~65K arg limit, so large encrypted images caused "max call stack size exceeded".
- **Web encryption bypass**: `aes.web.ts` uses the native Web Crypto API directly, bypassing the buggy `web-secure-encryption` library (its `dist/` bundle has an unfixable base64 overflow). Metro auto-resolves `.web.ts` on the web platform.

## CLI delivery

- `UserMessageSchema` in `api/types.ts` accepts the `text | multimodal` discriminated union. `extractUserContent()` and `extractTextFromContent()` helpers convert between wire format and SDK format. Non-Claude launchers (Codex, Gemini, ACP) extract text-only from `UserContent`.

## Key files

`useImageAttachment.ts`, `AgentInput.tsx` (paste handler + thumbnails), `MessageView.tsx` (UserTextBlock), `ImageViewer.tsx` (fullscreen viewer), `sync.ts` (sendMessage constructs multimodal), `typesRaw.ts`, `typesMessage.ts`, `reducer.ts`, `encryption/base64.ts`, `encryption/aes.web.ts`.
