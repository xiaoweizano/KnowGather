<div align="center">

<img src="build/icon.png" width="128" alt="拾知 KnowGather">

# 拾知 · KnowGather

**本地优先的个人知识管理桌面应用**<br>
*A local-first personal knowledge manager for the desktop*

[简体中文](#简体中文) · [English](#english)

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-2ea44f)
![Electron](https://img.shields.io/badge/Electron-45-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## 简体中文

### 拾知是什么

拾知是一个把「每天记录」和「长期积累」放在一起的个人知识管理桌面应用。日志是日常的写作面，知识库收集值得留存的内容，两者之间可以随时互相流转。所有数据保存在本机，不经过任何服务器。

名字里的 **Gather** 是它的主张：散落在每一天里的记录，最终要汇到一处。

### 功能

**日志（Journal）**
- 按本地日期自动归档，编辑旧日志不会把它移到今天
- 内置 7 种模板：每日回顾、会议记录、工作周报、项目复盘、读书笔记、个人规划、自由书写
- 支持补录历史日期；可把某篇日志「提升」为知识库文档，并保持链接
- 导入历史文件时按文件名/文件夹名推断日期

**知识库（Library）**
- 分类、标签、收藏，支持搜索标题与标签
- 从日志创建文档，或在文档之间移动

**编辑器**
- 基于 Tiptap / ProseMirror，所见即所得，同时支持 Markdown 输入语法
- 数学公式、Mermaid 图表、提示块、折叠块、分栏
- 表格（行列增删）、图片、附件、代码块（含语法高亮）
- 标题折叠、块编号、查找替换、选区工具栏
- 自动保存，带冲突检测；关闭窗口前有未保存提醒

**AI 助手（可调用工具）**
- 接入任意 OpenAI 兼容接口或 Anthropic Messages API（DeepSeek、Moonshot、OpenRouter、Ollama、自建网关等）
- **模型可以主动调用工具**，不需要你在表单里选范围。直接说「总结本周的日志」，它会自己算出本周的日期范围、列出并读取日志、生成周报，必要时存进知识库
- 四组工具，共 14 个：
  | 组 | 工具 |
  |---|---|
  | 知识库 | `list_journals` `read_journal` `list_documents` `search_documents` `read_document` `list_categories` `create_document` `update_document` |
  | 工作区文件 | `list_dir` `read_file` `search_files` `write_file` |
  | 命令执行 | `run_command` |
  | 网络 | `fetch_url` |
- 三档权限：**逐条确认**（默认）/ **只拦危险** / **全自动**。危险命令（`rm -rf`、`git push --force`、`curl \| sh` 等 16 种模式）即使在全自动档也会强制确认
- 路径越界、符号链接逃逸、内网地址（SSRF）都会被拦截
- 三栏工作台：会话历史、带工具卡片的对话流、工作区面板

**其他**
- 首页活跃热力图（过去一年每天的编辑记录）
- 萌宠陪伴（猫 / 狗 / 兔 / 熊猫，可上传自定义形象）
- 五种主题色、浅色 / 深色模式、焦点模式、自定义字体
- 所有应用内快捷键可重新绑定
- 导入 `.txt` `.text` `.log` `.md` `.markdown` `.mdown` `.docx`，支持文件夹和 `.zip` 压缩包
- 导出全部数据为单个 JSON

### 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 45 |
| 前端 | Vue 3 + TypeScript（strict）+ Vite |
| 状态 | Pinia |
| 编辑器 | Tiptap 3 / ProseMirror |
| 测试 | Vitest（385 条） |
| 打包 | electron-builder（NSIS） |

### 开发

```bash
pnpm install

pnpm dev          # 启动开发环境
pnpm typecheck    # 两个 tsconfig 的类型检查
pnpm test:run     # 运行全部测试
pnpm build        # 构建到 out/
```

打包：

```bash
pnpm package:win  # 生成 Windows 安装包（NSIS）
pnpm package:dir  # 只生成免安装目录
```

重新生成图标（修改 `docs/萌趣知识猫咪书屋.png` 后）：

```bash
node_modules/electron/dist/electron.exe scripts/build-icons.cjs
```

### 数据存放位置

全部保存在 Electron 的 `userData` 目录（Windows 下通常是 `%APPDATA%\shizhi\`）：

| 文件 | 内容 |
|---|---|
| `shizhi-documents.json` | 文档、分类、日志（含版本号与修订号） |
| `shizhi-settings.json` | 应用设置（不含 API Key） |
| `shizhi-ai.json` | AI 接口配置（含 API Key，单独存放） |
| `shizhi-activity.json` | 编辑活跃度 |
| `attachments/` | 图片与附件 |

写入采用「临时文件 + 原子重命名」，崩溃不会留下半截文件。

### 已知限制

- 目前只提供 Windows 安装包，且没有配置 macOS 打包目标；代码里有 macOS 分支（标题栏样式等），但需要自行补充打包配置
- 不做云同步；数据结构为将来的同步预留了版本号和修订号
- AI 助手需要自备接口和 Key，应用本身不内置模型服务

### 许可

GPL-3.0，见 [LICENSE](LICENSE)。

---

## English

### What is KnowGather

KnowGather (拾知, *shízhī*) is a personal knowledge manager for the desktop that treats daily journaling and long-term collecting as one workflow. The journal is the everyday writing surface; the library keeps what is worth retaining; either can be promoted into the other at any time. Everything is stored on your machine and never passes through a server.

The name says what it does: scattered daily notes are meant to **gather** in one place.

### Features

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
- Three permission modes: **confirm everything** (default), **block the dangerous ones**, **fully automatic**. Sixteen destructive command patterns (`rm -rf`, `git push --force`, `curl \| sh`, …) always require confirmation, even in fully automatic mode
- Path escapes, symlink escapes and private-network addresses (SSRF) are rejected
- Three-column workbench: conversation history, a transcript with expandable tool cards, and a workspace panel

**Other**
- Activity heatmap on the home page (edits per day, past year)
- Companion mascot (cat / dog / rabbit / panda, or upload your own)
- Five accent colours, light/dark themes, focus mode, custom fonts
- Every application shortcut can be rebound
- Imports `.txt` `.text` `.log` `.md` `.markdown` `.mdown` `.docx`, from files, folders or `.zip` archives
- Exports the whole database as a single JSON file

### Stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron 45 |
| Front end | Vue 3 + TypeScript (strict) + Vite |
| State | Pinia |
| Editor | Tiptap 3 / ProseMirror |
| Tests | Vitest (385 tests) |
| Packaging | electron-builder (NSIS) |

### Development

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

Regenerating icons (after changing `docs/萌趣知识猫咪书屋.png`):

```bash
node_modules/electron/dist/electron.exe scripts/build-icons.cjs
```

### Where the data lives

Everything sits in Electron's `userData` directory (`%APPDATA%\shizhi\` on Windows):

| File | Contents |
|---|---|
| `shizhi-documents.json` | Documents, categories, journals (with version and revision) |
| `shizhi-settings.json` | App settings (never the API key) |
| `shizhi-ai.json` | Provider config (holds the key, kept separate on purpose) |
| `shizhi-activity.json` | Editing activity |
| `attachments/` | Images and files |

Writes go through a temporary file and an atomic rename, so a crash never leaves a half-written database.

### Known limitations

- Only Windows is packaged today; there is no macOS build target configured. The code carries macOS branches (title bar style and so on), but the packaging config would have to be added
- No cloud sync; the schema keeps version and revision numbers so sync can be added later
- The assistant needs your own endpoint and key — no model service is bundled

### License

GPL-3.0 — see [LICENSE](LICENSE).
