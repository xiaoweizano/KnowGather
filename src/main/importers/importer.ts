import { basename, extname, relative } from 'node:path'
import { constants } from 'node:fs'
import { open, readdir, readFile } from 'node:fs/promises'
import { convertDocx } from './docx.js'
import { decodeTextBuffer, type DetectedEncoding } from './encoding.js'
import { guessTitleFromContent, markdownToHtml, plainTextToHtml } from './textFormats.js'
import { openZip } from './zip.js'

/**
 * Turns imported files into documents.
 *
 * Three input shapes are supported: individual files, a folder (walked
 * recursively), and an archive (expanded in memory). Everything funnels into
 * `convertFile`, so a file behaves the same however it was reached, and each
 * failure is reported per file instead of aborting the whole import.
 */

export const SUPPORTED_EXTENSIONS = ['.txt', '.text', '.log', '.md', '.markdown', '.mdown', '.docx'] as const
export const ARCHIVE_EXTENSIONS = ['.zip'] as const
/**
 * Extensions that are recognised so the UI can explain why they are not
 * imported, rather than silently ignoring the file.
 */
export const UNSUPPORTED_WORD_EXTENSIONS = ['.doc'] as const

const MAX_FILES_PER_IMPORT = 200
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
const MAX_FOLDER_DEPTH = 8

export type ImportedFormat = 'text' | 'markdown' | 'docx'

export interface ImportedDocument {
  /** Display title: front-matter, document metadata or the file name. */
  title: string
  html: string
  format: ImportedFormat
  /** Path inside the folder or archive, used for reporting. */
  sourceLabel: string
  encoding?: DetectedEncoding
  warnings: string[]
}

export interface ImportFailure {
  sourceLabel: string
  /** Fallback text, kept for logs and for codes the renderer does not know. */
  reason: string
  /** Stable code the renderer translates (`import.<code>`). */
  code?: string
  params?: Record<string, string | number>
}

export interface ImportSource {
  /** Absolute path of a file or folder, or the archive's display name. */
  path: string
  kind: 'file' | 'folder' | 'archive'
}

export interface ImportConversionResult {
  documents: ImportedDocument[]
  failures: ImportFailure[]
  skipped: ImportFailure[]
}

/**
 * Carries a stable code alongside the human-readable message so the renderer
 * can translate the reason without parsing Chinese or English text.
 */
export class ImportError extends Error {
  constructor(message: string, readonly code: string, readonly params?: Record<string, string | number>) {
    super(message)
    this.name = 'ImportError'
  }
}

function failureCode(error: unknown): Pick<ImportFailure, 'code' | 'params'> {
  if (error instanceof ImportError) return { code: error.code, ...(error.params ? { params: error.params } : {}) }
  return { code: 'generic' }
}

export async function importSources(sources: readonly ImportSource[]): Promise<ImportConversionResult> {
  const documents: ImportedDocument[] = []
  const failures: ImportFailure[] = []
  const skipped: ImportFailure[] = []
  let totalBytes = 0

  for (const source of sources) {
    if (documents.length >= MAX_FILES_PER_IMPORT) {
      skipped.push({
        sourceLabel: source.path,
        reason: `超过单次导入上限（${MAX_FILES_PER_IMPORT} 个文件）`,
        code: 'tooManyFiles',
        params: { count: MAX_FILES_PER_IMPORT },
      })
      continue
    }

    try {
      const files = await collectFiles(source, skipped)
      for (const file of files) {
        if (documents.length >= MAX_FILES_PER_IMPORT) {
          skipped.push({
            sourceLabel: file.label,
            reason: `超过单次导入上限（${MAX_FILES_PER_IMPORT} 个文件）`,
            code: 'tooManyFiles',
            params: { count: MAX_FILES_PER_IMPORT },
          })
          continue
        }
        if (totalBytes + file.bytes.length > MAX_TOTAL_BYTES) {
          skipped.push({ sourceLabel: file.label, reason: '超过单次导入总大小上限', code: 'tooLargeBatch' })
          continue
        }
        totalBytes += file.bytes.length

        try {
          documents.push(convertFile(file.label, file.displayName, file.bytes))
        } catch (error) {
          failures.push({ sourceLabel: file.label, reason: messageOf(error), ...failureCode(error) })
        }
      }
    } catch (error) {
      failures.push({ sourceLabel: source.path, reason: messageOf(error), ...failureCode(error) })
    }
  }

  return { documents, failures, skipped }
}

interface CollectedFile {
  /** Path shown to the user, e.g. "笔记/日记/2024.md". */
  label: string
  /** Name without extension, used as a title fallback. */
  displayName: string
  bytes: Buffer
}

async function collectFiles(source: ImportSource, skipped: ImportFailure[]): Promise<CollectedFile[]> {
  if (source.kind === 'file') {
    const bytes = await readFileShared(source.path)
    if (bytes.length > MAX_FILE_BYTES) throw new ImportError('文件过大，已拒绝导入', 'tooLarge')
    return [{ label: basename(source.path), displayName: basename(source.path, extname(source.path)), bytes }]
  }

  if (source.kind === 'folder') {
    return collectFromFolder(source.path, source.path, 0, skipped)
  }

  return collectFromArchive(source.path, skipped)
}

/**
 * Reads a file without taking an exclusive lock.
 *
 * Corporate network drives and files still open in Word routinely deny the
 * default open mode, which would fail the import for reasons the user cannot act
 * on. This requests read-only sharing and falls back to a plain read only when the
 * handle cannot be opened at all.
 */
export async function readFileShared(filePath: string): Promise<Buffer> {
  // Windows share flags are not exposed by node:fs, but readFile on Windows uses
  // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE by default, so an
  // explicit handle adds a retry path rather than a different access mode.
  try {
    const handle = await open(filePath, constants.O_RDONLY)
    try {
      return await handle.readFile()
    } finally {
      await handle.close()
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      // The file may be locked by another process; one short retry covers a
      // transient lock such as an antivirus scan.
      await new Promise((resolve) => setTimeout(resolve, 250))
      return readFile(filePath)
    }
    throw error
  }
}

async function collectFromFolder(
  root: string,
  current: string,
  depth: number,
  skipped: ImportFailure[],
): Promise<CollectedFile[]> {
  if (depth > MAX_FOLDER_DEPTH) {
    skipped.push({ sourceLabel: current, reason: '文件夹层级过深，已跳过', code: 'tooDeep' })
    return []
  }

  const entries = await readdir(current, { withFileTypes: true })
  const files: CollectedFile[] = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    // Hidden files and common noise folders are ignored rather than imported.
    if (entry.name.startsWith('.')) continue
    const fullPath = `${current}/${entry.name}`

    if (entry.isDirectory()) {
      files.push(...await collectFromFolder(root, fullPath, depth + 1, skipped))
      continue
    }
    if (!entry.isFile()) continue

    const extension = extname(entry.name).toLowerCase()
    if (!isSupportedExtension(extension)) {
      if ((UNSUPPORTED_WORD_EXTENSIONS as readonly string[]).includes(extension)) {
        skipped.push({
          sourceLabel: displayPath(root, fullPath),
          reason: '旧版 .doc 格式暂不支持，请在 Word 中另存为 .docx 后导入',
          code: 'legacyDoc',
        })
        continue
      }
      // Archives nested inside a folder are expanded rather than skipped.
      if (isArchiveExtension(extension)) {
        files.push(...await collectFromArchive(fullPath, skipped))
      }
      continue
    }

    const bytes = await readFileShared(fullPath)
    if (bytes.length > MAX_FILE_BYTES) {
      skipped.push({ sourceLabel: displayPath(root, fullPath), reason: '文件过大，已跳过', code: 'tooLargeSkipped' })
      continue
    }
    files.push({
      label: displayPath(root, fullPath),
      displayName: basename(entry.name, extension),
      bytes,
    })
  }

  return files
}

/** Path shown to the user, always with forward slashes so it reads the same on every platform. */
function displayPath(root: string, fullPath: string): string {
  return relative(root, fullPath).split(/[\\/]/).join('/')
}

async function collectFromArchive(archivePath: string, skipped: ImportFailure[]): Promise<CollectedFile[]> {
  const bytes = await readFileShared(archivePath)
  const archive = openZip(bytes)
  const archiveName = basename(archivePath)
  const files: CollectedFile[] = []

  for (const name of archive.listNames()) {
    if (name.endsWith('/')) continue
    // macOS archives carry resource-fork noise under __MACOSX.
    if (name.startsWith('__MACOSX/') || name.split('/').some((part) => part.startsWith('.'))) continue

    const extension = extname(name).toLowerCase()
    if (!isSupportedExtension(extension)) {
      if ((UNSUPPORTED_WORD_EXTENSIONS as readonly string[]).includes(extension)) {
        skipped.push({
          sourceLabel: `${archiveName}/${name}`,
          reason: '旧版 .doc 格式暂不支持，请在 Word 中另存为 .docx 后导入',
          code: 'legacyDoc',
        })
      }
      continue
    }

    const data = archive.read(name)
    if (!data) continue
    if (data.length > MAX_FILE_BYTES) {
      skipped.push({ sourceLabel: `${archiveName}/${name}`, reason: '文件过大，已跳过', code: 'tooLargeSkipped' })
      continue
    }

    files.push({
      label: `${archiveName}/${name}`,
      displayName: basename(name, extension),
      bytes: data,
    })
  }

  if (!files.length) throw new ImportError('压缩包内没有可导入的文件（支持 txt、md、docx）', 'emptyArchive')
  return files
}

export function isSupportedExtension(extension: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)
}

export function isArchiveExtension(extension: string): boolean {
  return (ARCHIVE_EXTENSIONS as readonly string[]).includes(extension)
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]

/** Compares raw bytes without assuming the value is a Buffer (IPC can hand over a Uint8Array). */
function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  // Indexed reads go through the typed-array view directly, so any Buffer or
  // Uint8Array produced by node:fs or the IPC bridge compares identically.
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes as ArrayLike<number>)
  for (let index = 0; index < signature.length; index += 1) {
    if (view[index] !== signature[index]) return false
  }
  return true
}

/** True when the bytes look like a ZIP local file header, i.e. a readable OOXML package. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, ZIP_SIGNATURE)
}

/**
 * Explains *why* a Word file cannot be read instead of failing with a generic
 * ZIP error.
 *
 * Three cases matter in practice:
 * - encrypted/password-protected Office files, which are OLE compound documents
 * - legacy .doc, which is OLE as well and needs re-saving
 * - files transformed by endpoint encryption software (DLP): the bytes keep the
 *   right length but the header no longer matches any known format. That cannot
 *   be decoded by this app and must be resolved by the file's owner.
 */
function assertReadableWordPackage(bytes: Uint8Array, label: string): void {
  const extension = extname(label).toLowerCase()

  if (startsWithBytes(bytes, OLE_SIGNATURE)) {
    if (extension === '.doc') {
      throw new ImportError('暂不支持旧版 .doc 格式，请在 Word 中另存为 .docx 后再导入', 'legacyDocShort')
    }
    throw new ImportError('该 Word 文档已加密或受密码保护，请先取消密码保护后再导入', 'encryptedWord')
  }

  if (looksLikeZip(bytes)) return

  // A .docx is a ZIP archive, so a non-ZIP header means the file was rewritten
  // before it reached the app — typically corporate transparent encryption.
  if (bytes.length >= 4) {
    throw new ImportError(
      '该 Word 文档无法读取：文件头不是有效的 .docx，通常是公司加密软件（透明加密）改写了文件内容。'
      + '请在加密系统中申请解密、另存为新文件后重试，或在 Word 中复制正文粘贴到新文档再导入。',
      'encryptedWordHint',
    )
  }

  throw new ImportError('不是有效的 Word 文档（.docx），文件为空或已损坏', 'invalidWord')
}

/** Converts one file's bytes into an editor document. Throws on unusable input. */
export function convertFile(label: string, displayName: string, bytes: Buffer): ImportedDocument {
  const extension = extname(label).toLowerCase()

  if (extension === '.docx' || extension === '.doc') {
    assertReadableWordPackage(bytes, label)
    const conversion = convertDocx(bytes)
    return {
      title: conversion.title || displayName,
      html: conversion.html,
      format: 'docx',
      sourceLabel: label,
      warnings: conversion.warnings,
    }
  }

  const decoded = decodeTextBuffer(bytes)
  const text = decoded.text

  if (!text.trim()) throw new ImportError('文件内容为空', 'emptyFile')

  if (extension === '.md' || extension === '.markdown' || extension === '.mdown') {
    const { frontMatter, body } = splitFrontMatter(text)
    const title = frontMatter.title || guessTitleFromContent(body, displayName)
    return {
      title,
      html: markdownToHtml(body),
      format: 'markdown',
      sourceLabel: label,
      encoding: decoded.encoding,
      warnings: [],
    }
  }

  return {
    title: guessTitleFromContent(text, displayName),
    html: plainTextToHtml(text),
    format: 'text',
    sourceLabel: label,
    encoding: decoded.encoding,
    warnings: [],
  }
}

/** Reads the small YAML subset used for titles in Markdown front matter. */
export function splitFrontMatter(text: string): { frontMatter: Record<string, string>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontMatter: {}, body: text }

  const frontMatter: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!pair) continue
    const value = pair[2]!.trim().replace(/^["']|["']$/g, '')
    if (value) frontMatter[pair[1]!] = value
  }

  return { frontMatter, body: text.slice(match[0].length) }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
