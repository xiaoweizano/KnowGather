# 拾知文档编辑页 Implementation Plan

> **For agentic workers:** Execute tasks in order. Each phase must pass typecheck, tests, and build before the next phase starts.

**Goal:** Build a production-grade Electron + Vue 3 + Tiptap document editor matching the supplied Shizhi specification and high-fidelity prototype.

**Architecture:** Electron main/preload expose a narrow local document and attachment API. The Vue renderer owns UI and editor state. Tiptap/ProseMirror remains a single long-lived instance; Pinia holds document metadata and save state, while repositories/services handle persistence. Editor content CSS is isolated under `.shizhi-editor`.

**Tech Stack:** Electron, Vue 3, TypeScript, Vite/electron-vite, Pinia, Tiptap/ProseMirror, Vitest, Vue Test Utils, Playwright.

---

## P0 - Foundation and editor reliability

**Files:** package/config files, `src/main`, `src/preload`, `src/renderer/src/app`, `src/renderer/src/editor`, `src/renderer/src/services`, `src/renderer/src/stores`, tests.

- [ ] Create Vite/Electron/Vue/TypeScript/Pinia project and test/build scripts.
- [ ] Add failing tests for document JSON round-trip, debounced autosave, save failure/retry, and editor instance preservation.
- [ ] Implement secure main/preload IPC and atomic JSON document repository under Electron userData.
- [ ] Build three-column shell, collapsible resource tree, document header, editor canvas, and status bar.
- [ ] Create one Tiptap editor with paragraph/heading/undo/history and namespaced CSS.
- [ ] Implement composition guard, stable Enter spacing, placeholder, word count, and autosave state.
- [ ] Verify typecheck, tests, build, and Electron launch smoke test.

## P1 - Formatting and responsive toolbar

- [ ] Add failing command/selection tests for marks, block types, lists, links, undo/redo, and toolbar focus retention.
- [ ] Implement toolbar groups, tooltips, disabled/active states, color/highlight palettes, and more menu.
- [ ] Add width-priority folding without horizontal scrolling.
- [ ] Verify typecheck, tests, build, and resize behavior.

## P2 - Overlays and shortcuts

- [ ] Add failing tests for slash filtering, keyboard selection, escape close, boundary placement, bubble visibility, and composition suppression.
- [ ] Implement anchor-aware Slash Menu with viewport flipping and keyboard navigation.
- [ ] Implement Bubble Menu for marks/colors/link.
- [ ] Add shortcuts help and focus-safe menu interactions.
- [ ] Verify typecheck, tests, build, and overlay geometry.

## P3 - Content modules

- [ ] Add failing tests for attachment reference normalization, table commands, image insertion, task list, and code block.
- [ ] Implement image file picker through preload, stable `shizhi-attachment://` references, resize/align/alt/delete controls.
- [ ] Implement file attachments, tables, code blocks, task lists, and dividers.
- [ ] Add Markdown-safe degradation rules for unsupported structured nodes.
- [ ] Verify typecheck, tests, build, and persistence after reload.

## P4 - Clipboard, durability, and scaling

- [ ] Add failing tests for HTML sanitization, Word/web paste cleanup, autosave retry, and save race ordering.
- [ ] Implement clipboard sanitizer preserving headings, lists, links, images, and tables.
- [ ] Harden autosave revision ordering, failure banner, close protection, and recovery.
- [ ] Add viewport resize/long-document geometry tests.
- [ ] Verify typecheck, tests, build, and Windows manual IME/clipboard checks.

## P5 - Focus, themes, companion, polish

- [ ] Add failing tests for focus mode, theme persistence, companion visibility, and reduced motion.
- [ ] Implement focus mode, dark theme, pet toggle, content width/zoom, and low-frequency save feedback.
- [ ] Complete visual regression against prototype at common desktop sizes.
- [ ] Run full acceptance checklist; record macOS-only remaining verification.

## Acceptance gates

- [ ] `pnpm typecheck`
- [ ] `pnpm test --run`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e` where Electron display is available
- [ ] No global editor element selectors, toolbar horizontal overflow, or overlays covering selection/caret.
