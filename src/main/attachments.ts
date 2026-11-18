import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { AttachmentReference } from '../shared/document.js'

export class AttachmentStore {
  constructor(private readonly baseDir: string) {}

  async addFiles(filePaths: readonly string[]): Promise<AttachmentReference[]> {
    await mkdir(this.baseDir, { recursive: true })
    const references: AttachmentReference[] = []
    for (const sourcePath of filePaths) {
      const id = randomUUID()
      const extension = extname(sourcePath).toLowerCase()
      const storedName = `${id}${extension}`
      const targetPath = join(this.baseDir, storedName)
      await copyFile(sourcePath, targetPath)
      const details = await stat(targetPath)
      references.push({
        id,
        name: basename(sourcePath),
        mimeType: mimeFromPath(sourcePath),
        size: details.size,
        url: `shizhi-attachment://${storedName}`,
      })
    }
    return references
  }

  /**
   * Persists bytes decoded from an imported file (for example an image embedded
   * in a DOCX or Markdown data URL) as a normal attachment.
   */
  async addBytes(
    bytes: Uint8Array,
    name: string,
    mimeType: string,
    extension: string,
  ): Promise<AttachmentReference> {
    await mkdir(this.baseDir, { recursive: true })
    const id = randomUUID()
    const safeExtension = normalizeExtension(extension) ?? extensionFromMime(mimeType)
    const storedName = `${id}${safeExtension}`
    const targetPath = join(this.baseDir, storedName)
    await writeFile(targetPath, bytes)
    return {
      id,
      name,
      mimeType,
      size: bytes.byteLength,
      url: `shizhi-attachment://${storedName}`,
    }
  }

  resolveUrl(url: string): { path: string; mimeType: string } | null {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'shizhi-attachment:') return null
      const requestedName = basename(decodeURIComponent(parsed.hostname))
      if (!/^[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/i.test(requestedName)) return null
      return {
        path: join(this.baseDir, requestedName),
        mimeType: mimeFromPath(requestedName),
      }
    } catch {
      return null
    }
  }
}

export function mimeFromPath(filePath: string): string {
  const extension = extname(filePath).slice(1).toLowerCase()
  return mimeFromExtension(extension)
}

export function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff',
  }
  return map[mimeType.toLowerCase()] ?? '.bin'
}

/** Accepts only a plain extension such as ".png"; anything else is rejected. */
function normalizeExtension(extension: string): string | null {
  const normalized = extension.startsWith('.') ? extension : `.${extension}`
  return /^\.[a-z0-9]{1,8}$/i.test(normalized) ? normalized.toLowerCase() : null
}

function mimeFromExtension(extension: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    json: 'application/json',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  }
  return map[extension] ?? 'application/octet-stream'
}
