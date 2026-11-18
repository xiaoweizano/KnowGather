/**
 * Decodes imported text files without a BOM dependency.
 *
 * Historical notes are often GBK, and a wrong guess turns Chinese into garbage,
 * so detection is explicit: BOMs win, then valid UTF-8, then GB18030 (a superset
 * of GBK), then a fallback. The chosen encoding is returned so the UI can report
 * what happened.
 */

export type DetectedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030' | 'big5'

export interface DecodedText {
  text: string
  encoding: DetectedEncoding
}

const REPLACEMENT = '�'

export function decodeTextBuffer(buffer: Buffer): DecodedText {
  if (buffer.length === 0) return { text: '', encoding: 'utf-8' }

  // Byte order marks take precedence over any heuristic.
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: stripBom(buffer.subarray(3).toString('utf8')), encoding: 'utf-8' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: stripBom(new TextDecoder('utf-16le').decode(buffer.subarray(2))), encoding: 'utf-16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2))
    swapped.swap16()
    return { text: stripBom(new TextDecoder('utf-16le').decode(swapped)), encoding: 'utf-16be' }
  }

  // A valid UTF-8 decode is strong evidence; invalid sequences produce U+FFFD.
  const utf8 = safeDecode(buffer, 'utf-8')
  if (utf8 !== null && !utf8.includes(REPLACEMENT)) {
    return { text: stripBom(utf8), encoding: 'utf-8' }
  }

  // GB18030 covers GBK and GB2312, which is what most Chinese legacy notes use.
  const gb = safeDecode(buffer, 'gb18030')
  if (gb !== null && !gb.includes(REPLACEMENT)) {
    return { text: stripBom(gb), encoding: 'gb18030' }
  }

  const big5 = safeDecode(buffer, 'big5')
  if (big5 !== null && !big5.includes(REPLACEMENT)) {
    return { text: stripBom(big5), encoding: 'big5' }
  }

  // Nothing decoded cleanly: fall back to the least-surprising choice for the
  // platform, keeping the replacement characters so the problem is visible.
  return { text: stripBom(utf8 ?? gb ?? big5 ?? buffer.toString('utf8')), encoding: 'utf-8' }
}

function safeDecode(buffer: Buffer, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer)
  } catch {
    return null
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}
