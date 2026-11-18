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

## Execution status (2026-11-17)

The installed build was audited end to end by launching the production bundle in Electron and driving it over CDP. The editor itself was sound; the surrounding application shell was not. Everything below was reproduced first, then fixed, then re-verified against the running build.

**Confirmed defects and fixes**

| Defect | Root cause | Fix |
| -- | -- | -- |
| Focus mode and navigation collapse did nothing | `:global(.is-focus-mode) .rail` — Vue's scoped compiler keeps only what is inside `:global()` and drops the trailing selector, so the rule became `.is-focus-mode { display: none }` and matched nothing | Rail/sidebar now bind `v-if` and a `collapsed` class; width comes from `ui.navigationWidth` instead of an ancestor selector |
| Collapsed rail kept its full width | A flex item refuses to shrink below content width (the mascot card), and scoped rules tied with ancestor overrides | `min-width: 0` on the rail plus component-state-driven inline width |
| `Ctrl+K` inserted no link | `ResourceSidebar` handled `Ctrl+K` globally with `preventDefault` | `shouldYieldShortcutToEditor()` keeps the shortcut inside `.shizhi-editor` |
| Half the UI was unreadable in dark mode | Hard-coded light colors in the sidebar, header, status bar and workspace | Tokens added to `base.css` (`--surface-input`, `--state-*`, `--divider-soft`, …) and applied across the components |
| Column resizers dragged in the wrong direction | `growRight?: boolean` — Vue coerces an absent Boolean prop to `false`, inverting the delta | Prop is now `grow?: 'left' \| 'right'` |
| Drag could start but never move | `setPointerCapture` threw before the window listeners were registered | Listeners are registered first; capture failures are swallowed |

**Functionality that was UI-only and is now wired to real data**

- Favorite: persisted on `DocumentRecord.favorite`, validated, migrated (`missing → false`), shown in the header and in the sidebar list.
- Tags: add/remove through a popover, persisted with the document.
- Share: copies title, plain-text preview and last-edit time; reports failure honestly instead of a fallback success message.
- Delete document and create document: `更多` menu in the document header.
- Journal editing: new `JournalPage.vue` with the same Tiptap canvas, its own autosave controller, `currentJournal` state, list/detail navigation, and selectable journal entries in the sidebar.
- Home page: real counts, recent documents and recent journals, both actionable.
- Settings page: theme, content width, zoom, companion, focus mode, storage info, platform.
- Three-column resizing with drag, keyboard (arrow keys) and double-click reset, persisted in `localStorage`.
- AI assistant: honest "not enabled" page instead of a silent placeholder.

**Verification on the production bundle**

- `tsc --noEmit` clean for both projects.
- `vitest run`: 26 files, 94 tests passed (9 new regression tests in `tests/shell-interactions.spec.ts`).
- `scripts/build.mjs` passes including the P0 artifact smoke check.
- Driven over CDP against `electron .`: create/edit/persist, favorite and tags written to disk, document delete, journal create/edit/persist/return, sidebar journal entry selection, focus mode, collapse, column drag in both directions with clamping, double-click reset, dark theme computed colors, `Ctrl+K` ownership, settings page and home page.

**Still open**

- Windows-native IME and clipboard acceptance has not been repeated on the installed NSIS build this round; the Chromium-level checks pass but are not a substitute.
- macOS remains config-only; it has not been run on macOS hardware.
- No NSIS installer was produced in this round: `dist/` is absent and `pnpm package:win` was not executed.

## Import feature (2026-11-17)

Historical notes arrive as loose files, folders of files, or zip archives, in a mix of encodings. The app cannot take third-party dependencies in this environment, so every parser here is written against Node built-ins.

**Formats**

| Format | Handling |
| -- | -- |
| `.txt`, `.text`, `.log` | Encoding detection (UTF-8 / UTF-16LE / UTF-16BE BOM, then GB18030, then Big5); blank-line paragraphs; `<br>` inside a paragraph |
| `.md`, `.markdown`, `.mdown` | CommonMark subset → HTML: headings, fenced code, block quotes, bullet/ordered/task lists, tables with alignment, rules, emphasis, links, images; YAML front matter supplies the title |
| `.docx` | ZIP reader (`node:zlib`) → OOXML XML parser → HTML: headings via `outlineLvl` or 标题 N style names, bold/italic/underline/strike/highlight, bullets and numbering, tables with `gridSpan`, hyperlinks, embedded images |
| `.zip` | Expanded in memory; `__MACOSX` and dot-files ignored |

`.doc` is recognised but refused with an instruction to re-save as `.docx`: it is an OLE compound document, not OOXML.

**Import shapes**

- Individual files (multi-select), a folder (walked recursively), or a zip archive.
- Each file becomes its own document by default, or all content is appended to the open document when "合并到当前文档" is checked.
- The target category is chosen per import; the picker is disabled while merging, because merging cannot change a document's category.

**Safety and failure behaviour**

- Imported HTML goes through the same sanitizer as pasted content before Tiptap parses it, so a file cannot inject markup the paste path rejects.
- Inline `data:` images are lifted out of the HTML, written to the attachment store and rewritten to stable `shizhi-attachment://` URLs; images that cannot be persisted are removed rather than left dangling.
- Failures are reported per file (parse error, empty content, too large, unsupported) and never abort the batch. Caps: 200 files, 32 MB per file, 256 MB per import.
- Files are read through a shared-read handle with a retry, so a document open in Word or a transient antivirus lock does not fail the import.

**Corporate encryption (encountered during acceptance)**

On the test machine, `.docx` files reach `electron.exe` already transformed by endpoint encryption software: the byte count is correct but the header is not a ZIP signature, and neither `readFile`, `readFileSync`, a stream, nor `copyFile` yields plaintext. The same bytes read as `.zipx` are plain, so the policy is per-extension. This is not solvable in application code and would be inappropriate to work around; instead the importer names the likely cause and tells the user to get the file decrypted or copy the text into a new document.

**Verification**

- `tsc --noEmit` clean for both projects.
- `vitest run`: 139 passed, 10 skipped (DOM-dependent cases are skipped in the Node environment and covered against the real renderer instead).
- Driven over CDP against the running app with a test-only path injection hook (`SHIZHI_IMPORT_TEST_PATHS_FILE`, inert unless set): multi-file import (3 documents, GBK text intact, Markdown structure preserved with headings/lists/table), folder import (2 documents from nested directories, unsupported files skipped), zip import (2 documents), and merge mode (node count 1 → 15, persisted, category picker disabled).
- Encrypted `.docx` produces the specific guidance message instead of a generic "damaged file" error.


