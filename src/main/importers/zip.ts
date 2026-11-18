import { inflateRawSync, inflateSync } from 'node:zlib'

/**
 * Minimal ZIP reader built on Node's zlib.
 *
 * A DOCX file is an ordinary ZIP archive, and the app cannot add third-party
 * dependencies, so this reads exactly what OOXML packages need: the central
 * directory plus stored/deflated entries. It rejects anything it does not
 * understand instead of guessing, so a malformed file fails loudly.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const MAX_ARCHIVE_SIZE = 512 * 1024 * 1024
const MAX_ENTRY_SIZE = 256 * 1024 * 1024

export interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

export interface ZipArchive {
  entries: Map<string, ZipEntry>
  read(name: string): Buffer | null
  readText(name: string): string | null
  listNames(): string[]
}

/** Locates the End Of Central Directory record, scanning backwards past the comment. */
function findEndOfCentralDirectory(buffer: Buffer): number {
  // The EOCD record is 22 bytes plus a comment of at most 65535 bytes.
  const minimum = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  throw new Error('不是有效的 ZIP 文件：未找到结束记录')
}

function readEntries(buffer: Buffer): Map<string, ZipEntry> {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)

  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('暂不支持 ZIP64 格式的文件')
  }
  if (centralDirectoryOffset >= buffer.length) {
    throw new Error('ZIP 中央目录位置无效')
  }

  const entries = new Map<string, ZipEntry>()
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length) throw new Error('ZIP 中央目录被截断')
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      throw new Error('ZIP 中央目录条目无效')
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength)

    // Bit 0 of the general purpose flags means the entry is encrypted.
    if (flags & 0x1) throw new Error(`暂不支持加密的 ZIP 条目：${name}`)

    // Directory entries end with a slash and carry no data.
    if (!name.endsWith('/')) {
      entries.set(name, {
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      })
    }

    offset = nameStart + nameLength + extraLength + commentLength
  }

  return entries
}

function extractEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const headerOffset = entry.localHeaderOffset
  if (headerOffset + 30 > buffer.length) throw new Error(`ZIP 条目被截断：${entry.name}`)
  if (buffer.readUInt32LE(headerOffset) !== LOCAL_FILE_HEADER) {
    throw new Error(`ZIP 条目本地头无效：${entry.name}`)
  }

  const nameLength = buffer.readUInt16LE(headerOffset + 26)
  const extraLength = buffer.readUInt16LE(headerOffset + 28)
  const dataStart = headerOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize

  if (dataEnd > buffer.length) throw new Error(`ZIP 条目数据超出文件范围：${entry.name}`)
  if (entry.uncompressedSize > MAX_ENTRY_SIZE) {
    throw new Error(`ZIP 条目过大，已拒绝：${entry.name}`)
  }

  const compressed = buffer.subarray(dataStart, dataEnd)

  if (entry.compressionMethod === 0) return Buffer.from(compressed)
  if (entry.compressionMethod === 8) {
    try {
      return inflateRawSync(compressed)
    } catch {
      // Some writers emit a zlib wrapper despite signalling raw deflate.
      return inflateSync(compressed)
    }
  }

  throw new Error(`不支持的 ZIP 压缩方式 ${entry.compressionMethod}：${entry.name}`)
}

export function openZip(buffer: Buffer): ZipArchive {
  if (buffer.length > MAX_ARCHIVE_SIZE) {
    throw new Error('文件过大，已拒绝解析')
  }
  if (buffer.length < 22) throw new Error('不是有效的 ZIP 文件：内容过短')

  const entries = readEntries(buffer)

  return {
    entries,
    listNames: () => [...entries.keys()],
    read(name: string): Buffer | null {
      const entry = entries.get(name)
      return entry ? extractEntry(buffer, entry) : null
    },
    readText(name: string): string | null {
      const data = this.read(name)
      return data ? data.toString('utf8') : null
    },
  }
}
