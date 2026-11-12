import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat } from 'node:fs/promises'
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
