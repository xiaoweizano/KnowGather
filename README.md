<div align="center">

<img src="build/icon.png" width="128" alt="拾知 KnowGather">

# 拾知 · KnowGather

**本地优先的个人知识管理桌面应用**

[简体中文](README.md) · [English](README.en.md)

![Platform](https://img.shields.io/badge/platform-Windows-2ea44f)
![Electron](https://img.shields.io/badge/Electron-45-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## 拾知是什么

拾知是一个把「每天记录」和「长期积累」放在一起的个人知识管理桌面应用。日志是日常的写作面，知识库收集值得留存的内容，两者之间可以随时互相流转。所有数据保存在本机，不经过任何服务器。

名字里的 **Gather** 是它的主张：散落在每一天里的记录，最终要汇到一处。

## 功能

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

- 三档权限：**逐条确认**（默认）/ **只拦危险** / **全自动**。危险命令（`rm -rf`、`git push --force`、`curl | sh` 等 16 种模式）即使在全自动档也会强制确认
- 路径越界、符号链接逃逸、内网地址（SSRF）都会被拦截
- 三栏工作台：会话历史、带工具卡片的对话流、工作区面板

**其他**
- 首页活跃热力图（过去一年每天的编辑记录）
- 萌宠陪伴（15 种形象，可上传自定义图片）
- 五种主题色、浅色 / 深色模式、焦点模式、自定义字体
- 所有应用内快捷键可重新绑定
- 导入 `.txt` `.text` `.log` `.md` `.markdown` `.mdown` `.docx`，支持文件夹和 `.zip` 压缩包
- 导出全部数据为单个 JSON

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron 45 |
| 前端 | Vue 3 + TypeScript（strict）+ Vite |
| 状态 | Pinia |
| 编辑器 | Tiptap 3 / ProseMirror |
| 测试 | Vitest（385 条） |
| 打包 | electron-builder（NSIS） |

## 开发

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

## 数据存放位置

全部保存在 Electron 的 `userData` 目录（Windows 下通常是 `%APPDATA%\shizhi\`）：

| 文件 | 内容 |
|---|---|
| `shizhi-documents.json` | 文档、分类、日志（含版本号与修订号） |
| `shizhi-settings.json` | 应用设置（不含 API Key） |
| `shizhi-ai.json` | AI 接口配置（含 API Key，单独存放） |
| `shizhi-activity.json` | 编辑活跃度 |
| `attachments/` | 图片与附件 |

写入采用「临时文件 + 原子重命名」，崩溃不会留下半截文件。

## 已知限制

- 目前只提供 Windows 安装包，且没有配置 macOS 打包目标；代码里有 macOS 分支（标题栏样式等），但需要自行补充打包配置
- 不做云同步；数据结构为将来的同步预留了版本号和修订号
- AI 助手需要自备接口和 Key，应用本身不内置模型服务

## 免责声明

- **请自行备份重要数据。** 本软件按「现状」提供，不附带任何明示或暗示的担保，包括但不限于适销性、特定用途适用性及不侵权。作者不对因使用或无法使用本软件造成的任何直接、间接、偶然或后果性损失负责。
- **数据默认只存在本机。** 没有服务器、没有账号、没有自动备份。删除应用数据目录、重装系统或磁盘故障都会导致数据永久丢失，请定期通过「设置 → 数据 → 导出」备份。
- **AI 助手会把内容发给你配置的第三方服务。** 使用助手时，对话内容以及与工具读取结果相关的本地内容（日志正文、文档正文、文件内容、命令输出）都会通过你填写的接口地址发送给该服务商。这些内容如何被存储和使用取决于该服务商，与本项目无关。涉及敏感信息时请自行评估，或改用本地模型。
- **AI 助手具备文件读写与命令执行能力。** 模型可能出错或被提示词诱导，从而修改、覆盖或删除文件。默认档位是「逐条确认」，**不建议长期使用「全自动」档位处理重要目录**。因已授权操作造成的文件损坏或数据丢失由使用者自行承担。
- **AI 输出仅供参考。** 生成内容可能存在事实错误、过时信息或不当表述，不构成任何专业建议（法律、医疗、财务等）。请自行核实后再采用。
- **`fetch_url` 会访问公网。** 抓取到的网页内容未经审核，存在提示词注入风险——网页可能包含旨在操纵模型的指令。应用已阻止访问内网地址，但无法保证外部内容的可靠性。

## 第三方与致谢

图标与萌宠形象来自项目设计稿。编辑、公式与图表分别依赖 Tiptap / ProseMirror、KaTeX 与 Mermaid 及其社区生态，版权归各自作者所有，均按其原始许可分发。

## 许可

GPL-3.0，见 [LICENSE](LICENSE)。
