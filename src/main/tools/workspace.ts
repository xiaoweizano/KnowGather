import { mkdir, open, readdir, readFile, realpath, stat, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireString,
  ToolError,
  type AiTool,
} from './registry.js'

/**
 * File tools scoped to one user-chosen workspace directory.
 *
 * Every path passes through `resolveInsideRoot`, which is the only thing
 * standing between the model and the rest of the disk. Two checks matter: the
 * lexical one catches `../` and absolute paths, and the `realpath` one catches a
 * symlink inside the workspace that points outside it.
 */

const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'out', 'build', '.next', '.nuxt', '.cache',
  '__pycache__', '.venv', 'venv', 'target', '.idea', '.vscode', '.DS_Store',
])
const MAX_LIST_ENTRIES = 500
const MAX_READ_BYTES = 200 * 1024
const MAX_SEARCH_RESULTS = 100
const BINARY_SNIFF_BYTES = 8192

export function workspaceTools(): AiTool[] {
  return [listDir, readFileTool, searchFiles, writeFileTool]
}

const listDir: AiTool = {
  danger: 'read',
  definition: {
    name: 'list_dir',
    description: '列出工作区某个目录下的文件与子目录。path 是相对工作区根目录的路径，省略表示根目录。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对路径，例如 "src/main"；省略为根目录' },
      },
    },
  },
  async execute(input, context) {
    if (!context.workspaceRoot) throw new ToolError('未配置工作区目录')
    const relative = optionalString(asRecord(input), 'path') ?? '.'
    const absolute = await resolveInsideRoot(context.workspaceRoot, relative)
    const info = await stat(absolute).catch(() => null)
    if (!info) throw new ToolError(`路径不存在：${relative}`)
    if (!info.isDirectory()) throw new ToolError(`不是目录：${relative}`)
    const entries = await readdir(absolute, { withFileTypes: true })
    const ordered = entries.slice().sort((left, right) => {
      // Directories first, then alphabetically — the order a file tree uses.
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    const lines: string[] = []
    for (const entry of ordered) {
      if (isIgnored(entry.name, entry.isDirectory())) continue
      if (lines.length >= MAX_LIST_ENTRIES) {
        lines.push(`…（还有更多条目，已截断）`)
        break
      }
      if (entry.isDirectory()) {
        lines.push(`${entry.name}/`)
        continue
      }
      const sub = await stat(path.join(absolute, entry.name)).catch(() => null)
      lines.push(`${entry.name}${sub ? `\t${sub.size}B` : ''}`)
    }
    if (!lines.length) return `${relative} 是空目录。`
    return lines.join('\n')
  },
}

const readFileTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'read_file',
    description: '读取工作区内一个文本文件的内容。二进制文件会被拒绝。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区根的路径' },
        maxBytes: { type: 'number', description: `最多读取字节数，默认和上限都是 ${MAX_READ_BYTES}` },
      },
      required: ['path'],
    },
  },
  async execute(input, context) {
    if (!context.workspaceRoot) throw new ToolError('未配置工作区目录')
    const args = asRecord(input)
    const relative = requireString(args, 'path')
    const limit = Math.min(MAX_READ_BYTES, Math.max(1, optionalNumber(args, 'maxBytes') ?? MAX_READ_BYTES))
    const absolute = await resolveInsideRoot(context.workspaceRoot, relative)
    const info = await stat(absolute).catch(() => null)
    if (!info) throw new ToolError(`文件不存在：${relative}`)
    if (info.isDirectory()) throw new ToolError(`${relative} 是目录，用 list_dir`)
    const handle = await open(absolute, 'r')
    try {
      const length = Math.min(limit, info.size)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, 0)
      if (looksBinary(buffer)) throw new ToolError(`${relative} 看起来是二进制文件，不支持读取`)
      const text = buffer.toString('utf8')
      const truncated = info.size > length
      return truncated
        ? `${text}\n\n[已截断：文件共 ${info.size} 字节，只读了前 ${length} 字节]`
        : text
    } finally {
      await handle.close()
    }
  },
}

const searchFiles: AiTool = {
  danger: 'read',
  definition: {
    name: 'search_files',
    description:
      '按文件名 glob 或正文正则搜索工作区文件。pattern 匹配相对路径（支持 * 和 **），content 是正文正则。'
      + '两个都省略则列出全部文件路径。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '文件名/路径 glob，例如 "**/*.md" 或 "src/**/*.ts"' },
        content: { type: 'string', description: '正文正则表达式' },
        limit: { type: 'number', description: `最多返回条数，默认 ${MAX_SEARCH_RESULTS}` },
      },
    },
  },
  async execute(input, context) {
    if (!context.workspaceRoot) throw new ToolError('未配置工作区目录')
    const args = asRecord(input)
    const pattern = optionalString(args, 'pattern')
    const content = optionalString(args, 'content')
    const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, optionalNumber(args, 'limit') ?? MAX_SEARCH_RESULTS))
    const matcher = pattern ? globToRegExp(pattern) : null
    let contentMatcher: RegExp | null = null
    if (content) {
      try {
        contentMatcher = new RegExp(content, 'm')
      } catch (cause) {
        throw new ToolError(`正文正则无效：${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    const results: string[] = []
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > 12 || results.length >= limit) return
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (results.length >= limit) return
        if (isIgnored(entry.name, entry.isDirectory())) continue
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(absolute, depth + 1)
          continue
        }
        const relative = path.relative(context.workspaceRoot, absolute).split(path.sep).join('/')
        if (matcher && !matcher.test(relative)) continue
        if (!contentMatcher) {
          results.push(relative)
          continue
        }
        const hit = await matchContent(absolute, contentMatcher)
        if (hit !== null) results.push(hit ? `${relative}: ${hit}` : relative)
      }
    }
    await walk(context.workspaceRoot, 0)
    if (!results.length) return '没有匹配的文件。'
    return results.join('\n')
  },
}

const writeFileTool: AiTool = {
  danger: 'write',
  definition: {
    name: 'write_file',
    description:
      '在工作区写入文件。mode=create 只新建（已存在会报错）；mode=overwrite 覆盖已有文件；mode=append 追加到末尾。'
      + '覆盖必须显式传 mode=overwrite。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区根的路径' },
        content: { type: 'string', description: '文件内容' },
        mode: { type: 'string', enum: ['create', 'overwrite', 'append'], description: '默认 create' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(input, context) {
    if (!context.workspaceRoot) throw new ToolError('未配置工作区目录')
    const args = asRecord(input)
    const relative = requireString(args, 'path')
    const content = typeof args.content === 'string' ? args.content : ''
    const mode = optionalString(args, 'mode') ?? 'create'
    const absolute = await resolveInsideRoot(context.workspaceRoot, relative)
    const existing = await stat(absolute).catch(() => null)
    if (mode === 'create' && existing) {
      throw new ToolError(`${relative} 已存在；要覆盖请显式传 mode=overwrite`)
    }
    if (mode === 'append' && !existing) {
      throw new ToolError(`${relative} 不存在；追加前请用 create`)
    }
    await mkdir(path.dirname(absolute), { recursive: true })
    if (mode === 'append') await appendFile(absolute, content, 'utf8')
    else await writeFile(absolute, content, 'utf8')
    return JSON.stringify({ written: true, path: relative, mode, bytes: Buffer.byteLength(content) }, null, 2)
  },
}

/**
 * Resolves a workspace-relative path, refusing anything that escapes the root.
 *
 * The lexical check runs first because it works for paths that do not exist yet
 * (`write_file` creates them). The `realpath` check then runs on the closest
 * existing ancestor, which is what catches a symlink pointing outside.
 */
export async function resolveInsideRoot(root: string, relative: string): Promise<string> {
  const absoluteRoot = path.resolve(root)
  const candidate = path.resolve(absoluteRoot, relative)
  if (!isInside(absoluteRoot, candidate)) {
    throw new ToolError(`路径越界：${relative} 不在工作区内`)
  }
  const rootReal = await realpath(absoluteRoot).catch(() => absoluteRoot)
  let existing = candidate
  for (;;) {
    const info = await stat(existing).catch(() => null)
    if (info) break
    const parent = path.dirname(existing)
    if (parent === existing) break
    existing = parent
  }
  const existingReal = await realpath(existing).catch(() => existing)
  if (!isInside(rootReal, existingReal)) {
    throw new ToolError(`路径越界：${relative} 通过符号链接指向工作区之外`)
  }
  // Return the path in terms of the real root so later writes land in the same
  // place the check validated.
  return path.join(rootReal, path.relative(absoluteRoot, candidate))
}

function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isIgnored(name: string, isDirectory: boolean): boolean {
  if (!isDirectory) return false
  return IGNORED_DIRECTORIES.has(name)
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SNIFF_BYTES))
  return sample.includes(0)
}

async function matchContent(file: string, matcher: RegExp): Promise<string | null> {
  const info = await stat(file).catch(() => null)
  if (!info || info.size > MAX_READ_BYTES) return null
  const buffer = await readFile(file).catch(() => null)
  if (!buffer || looksBinary(buffer)) return null
  const lines = buffer.toString('utf8').split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (matcher.test(lines[index]!)) return `${index + 1}: ${lines[index]!.trim().slice(0, 200)}`
  }
  return null
}

/**
 * Converts a glob into a RegExp.
 *
 * Only the two forms the tool description promises are supported: `*` within a
 * segment and `**` across segments. Icecream-cone patterns (`{a,b}`) are not
 * needed and silently treating them as literals is better than a wrong match.
 */
export function globToRegExp(glob: string): RegExp {
  let source = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]!
    if (char === '*') {
      if (glob[index + 1] === '*') {
        // `**/` spans any number of directories; a bare `**` spans anything.
        if (glob[index + 2] === '/') {
          source += '(?:.*/)?'
          index += 2
        } else {
          source += '.*'
          index += 1
        }
      } else {
        source += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      source += '[^/]'
      continue
    }
    source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}
