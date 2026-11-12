# 拾知文档编辑页 Implementation Plan

> **For agentic workers:** Execute tasks in order. Each phase must pass typecheck, tests, and build before the next phase starts.

**Goal:** Build a production-grade Electron + Vue 3 + Tiptap document editor matching the supplied Shizhi specification and high-fidelity prototype.

**Architecture:** Electron main/preload expose a narrow local document and attachment API. The Vue renderer owns UI and editor state. Tiptap/ProseMirror remains a single long-lived instance; Pinia holds document metadata and save state, while repositories/services handle persistence. Editor content CSS is isolated under `.shizhi-editor`.

**Tech Stack:** Electron, Vue 3, TypeScript, Vite/electron-vite, Pinia, Tiptap/ProseMirror, Vitest, Vue Test Utils, Playwright.

---

## P0 - Foundation and editor reliability

**Files:** package/config files, `src/main`, `src/preload`, `src/renderer/src/app`, `src/renderer/src/editor`, `src/renderer/src/services`, `src/renderer/src/stores`, tests.

- [x] Create Vite/Electron/Vue/TypeScript/Pinia project and test/build scripts.
- [x] Add failing tests for document JSON round-trip, debounced autosave, save failure/retry, and editor instance preservation.
- [x] Implement secure main/preload IPC and atomic JSON document repository under Electron userData.
- [x] Build three-column shell, collapsible resource tree, document header, editor canvas, and status bar.
- [x] Create one Tiptap editor with paragraph/heading/undo/history and namespaced CSS.
- [x] Implement composition guard, stable Enter spacing, placeholder, word count, and autosave state.
- [ ] Verify typecheck, tests, build, and Electron launch smoke test.

## P1 - Formatting and responsive toolbar

- [x] Add failing command/selection tests for marks, block types, lists, links, undo/redo, and toolbar focus retention.
- [x] Implement toolbar groups, tooltips, disabled/active states, color/highlight palettes, and more menu.
- [x] Add width-priority folding without horizontal scrolling.
- [x] Verify typecheck, tests, build, and resize behavior.

## P2 - Overlays and shortcuts

- [x] Add failing tests for slash filtering, keyboard selection, escape close, boundary placement, bubble visibility, and composition suppression.
- [x] Implement anchor-aware Slash Menu with viewport flipping and keyboard navigation.
- [x] Implement Bubble Menu for marks/colors/link.
- [x] Add shortcuts help and focus-safe menu interactions.
- [x] Verify typecheck, tests, build, and overlay geometry.

## P3 - Content modules

- [x] Add failing tests for attachment reference normalization, table commands, image insertion, task list, and code block.
- [x] Implement image file picker through preload, stable `shizhi-attachment://` references, resize/align/alt/delete controls.
- [x] Implement file attachments, tables, code blocks, task lists, and dividers.
- [x] Add Markdown-safe degradation rules for unsupported structured nodes.
- [x] Verify typecheck, tests, build, and persistence after reload.

## P4 - Clipboard, durability, and scaling

- [x] Add failing tests for HTML sanitization, Word/web paste cleanup, autosave retry, and save race ordering.
- [x] Implement clipboard sanitizer preserving headings, lists, links, images, and tables.
- [x] Harden autosave revision ordering, failure banner, close protection, and recovery.
- [x] Add viewport resize/long-document geometry tests.
- [ ] Verify typecheck, tests, build, and Windows manual IME/clipboard checks.

## P5 - Focus, themes, companion, polish

- [x] Add failing tests for focus mode, theme persistence, companion visibility, and reduced motion.
- [x] Implement focus mode, dark theme, pet toggle, content width/zoom, and low-frequency save feedback.
- [x] Complete visual regression against prototype at common desktop sizes.
- [x] Run full acceptance checklist; record macOS-only remaining verification.

## Acceptance gates

- [x] `pnpm typecheck`
- [x] `pnpm test --run`
- [x] `pnpm build`
- [x] Renderer E2E through CDP against the running preview (`scripts/e2e.mjs` and `scripts/acceptance.mjs`).
  - Electron-context E2E remains blocked: no Electron dependency or executable is present in this workspace.
- [x] No global editor element selectors, toolbar horizontal overflow, or overlays covering selection/caret.

## Execution status (2026-11-12)

- Completion: **33/35**. The two open items are the Electron launch smoke test and Windows-native IME/clipboard manual acceptance.
- `pnpm typecheck` passed for both renderer and Node configurations.
- `pnpm test --run` passed: 9 test files, 33 tests.
- `pnpm build` passed, including renderer, main, preload, and P0 artifact smoke checks.
- CDP acceptance passed at 1402x1122, 1280x800, and 960x720, including reload persistence, Chromium composition/paste, Bubble/Slash/More geometry, toolbar overflow, and page overflow.
- Fixed the 80% zoom paper-width calculation in `EditorCanvas.vue`; at 960px the editor paper is now 478px inside a 574px client-width scroll container instead of 621.5px.
- Acceptance screenshots were visually compared with `docs/拾知_文档编辑页_高保真原型.png`. No application runtime errors or failed requests remained; the only ignored browser noise was `/favicon.ico`.
- Electron-context E2E and launch smoke remain blocked because this workspace has no Electron dependency or executable. Windows-native IME/clipboard manual acceptance and macOS verification also remain external; Chromium composition/paste coverage is not a substitute.
- No Playwright or Puppeteer dependency was introduced.
