<div align="center">

<img src="build/icon.png" width="128" alt="拾知 KnowGather">

# 拾知 · KnowGather

**A local-first personal knowledge manager for the desktop**

[简体中文](README.md) · [English](README.en.md)

![Platform](https://img.shields.io/badge/platform-Windows-2ea44f)
![Electron](https://img.shields.io/badge/Electron-45-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## What is KnowGather

KnowGather (拾知, *shízhī*) is a personal knowledge manager for the desktop that treats daily journaling and long-term collecting as one workflow. The journal is the everyday writing surface; the library keeps what is worth retaining; either can be promoted into the other at any time. Everything is stored on your machine and never passes through a server.

The name says what it does: scattered daily notes are meant to **gather** in one place.

## Features

**Journal**
- Entries are filed by local date — editing an old entry does not move it to today
- Seven built-in templates: daily review, meeting notes, weekly report, project retro, reading notes, personal plan, free writing
- Backdate entries; promote an entry into a library document while keeping the link
- Imports infer the entry's date from the file or folder name

**Library**
- Categories, tags, favourites, and search over titles and tags
- Create documents from journal entries, or move them between categories

**Editor**
- Tiptap / ProseMirror, true WYSIWYG with Markdown input shortcuts
- Math, Mermaid diagrams, callouts, toggles, columns
- Tables (add/remove rows and columns), images, attachments, syntax-highlighted code
- Heading folding, block numbering, find and replace, selection toolbar
- Autosave with conflict detection; unsaved-changes guard on close

**AI assistant (tool-calling)**
- Works with any OpenAI-compatible endpoint or the Anthropic Messages API (DeepSeek, Moonshot, OpenRouter, Ollama, self-hosted gateways, …)
- **The model calls tools on its own** — no scope form to fill in. Say “summarise this week's journals” and it resolves the week's date range itself, lists and reads the entries, writes the report, and files it in the library if you ask
- Four tool groups, 14 tools:

  | Group | Tools |
  |---|---|
  | Knowledge base | `list_journals` `read_journal` `list_documents` `search_documents` `read_document` `list_categories` `create_document` `update_document` |
  | Workspace files | `list_dir` `read_file` `search_files` `write_file` |
  | Shell | `run_command` |
  | Web | `fetch_url` |

- Three permission modes: **confirm everything** (default), **block the dangerous ones**, **fully automatic**. Sixteen destructive command patterns (`rm -rf`, `git push --force`, `curl | sh`, …) always require confirmation, even in fully automatic mode
- Path escapes, symlink escapes and private-network addresses (SSRF) are rejected
- Three-column workbench: conversation history, a transcript with expandable tool cards, and a workspace panel

**Other**
- Activity heatmap on the home page (edits per day, past year)
- Companion mascot (fifteen to choose from, or upload your own image)
- Five accent colours, light/dark themes, focus mode, custom fonts
- Every application shortcut can be rebound
- Imports `.txt` `.text` `.log` `.md` `.markdown` `.mdown` `.docx`, from files, folders or `.zip` archives
- Exports the whole database as a single JSON file

## Stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron 45 |
| Front end | Vue 3 + TypeScript (strict) + Vite |
| State | Pinia |
| Editor | Tiptap 3 / ProseMirror |
| Tests | Vitest (385 tests) |
| Packaging | electron-builder (NSIS) |

## Development

```bash
pnpm install

pnpm dev          # dev environment
pnpm typecheck    # typecheck both tsconfig projects
pnpm test:run     # full test suite
pnpm build        # compile into out/
```

Packaging:

```bash
pnpm package:win  # Windows installer (NSIS)
pnpm package:dir  # unpacked directory only
```

## Where the data lives

Everything sits in Electron's `userData` directory (`%APPDATA%\shizhi\` on Windows):

| File | Contents |
|---|---|
| `shizhi-documents.json` | Documents, categories, journals (with version and revision) |
| `shizhi-settings.json` | App settings (never the API key) |
| `shizhi-ai.json` | Provider config (holds the key, kept separate on purpose) |
| `shizhi-activity.json` | Editing activity |
| `attachments/` | Images and files |

Writes go through a temporary file and an atomic rename, so a crash never leaves a half-written database.

## Known limitations

- Only Windows is packaged today; there is no macOS build target configured. The code carries macOS branches (title bar style and so on), but the packaging config would have to be added
- No cloud sync; the schema keeps version and revision numbers so sync can be added later
- The assistant needs your own endpoint and key — no model service is bundled

## Disclaimer

- **Back up your data.** This software is provided “as is”, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and non-infringement. The authors are not liable for any direct, indirect, incidental or consequential loss arising from the use of, or inability to use, this software.
- **Your data lives only on this machine.** There is no server, no account and no automatic backup. Deleting the app's data directory, reinstalling the OS or a disk failure will lose it permanently — export a copy regularly from Settings → Data.
- **The AI assistant sends content to a third party you configure.** While the assistant is in use, the conversation and whatever the tools read (journal text, document text, file contents, command output) are sent to the provider behind the endpoint you entered. How that provider stores and uses the content is outside this project's control. Judge for yourself before using it on sensitive material, or point it at a local model instead.
- **The AI assistant can read and write files and run commands.** A model can be wrong, or be steered by a prompt injection, into modifying, overwriting or deleting files. The default mode is “confirm everything”; **running “fully automatic” on important directories is not recommended**. Damage caused by operations you approved is your responsibility.
- **AI output is not authoritative.** Generated text may be factually wrong, outdated or inappropriate, and is not professional advice of any kind (legal, medical, financial, …). Verify before relying on it.
- **`fetch_url` reaches the public web.** Fetched pages are unreviewed and carry a prompt-injection risk — a page may contain instructions aimed at the model. Private-network addresses are blocked, but the reliability of external content cannot be guaranteed.

## Credits

The app icon and the companion mascots come from the project's own design. Editing, math and diagrams build on Tiptap / ProseMirror, KaTeX and Mermaid and their communities; each remains under its own licence.

## License

GPL-3.0 — see [LICENSE](LICENSE).
