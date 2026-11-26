import { asRecord, optionalNumber, requireString, ToolError, type AiTool } from './registry.js'

/**
 * Fetches a public web page as text.
 *
 * The private-address block is the important part: without it a prompt-injected
 * page could ask the model to fetch `http://192.168.1.1/...` and read the user's
 * router, or hit a cloud metadata endpoint. Checks run against the resolved
 * hostname *and* against every redirect hop, because a public host can redirect
 * inward.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_CHARS = 20_000
const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5

export function webTools(): AiTool[] {
  return [fetchUrl]
}

const fetchUrl: AiTool = {
  danger: 'read',
  definition: {
    name: 'fetch_url',
    description: '抓取一个公开网页或接口，返回纯文本（HTML 会被剥成文本）。只允许 http/https 公网地址。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '完整 URL' },
        maxChars: { type: 'number', description: `最多返回字符数，默认 ${DEFAULT_MAX_CHARS}` },
      },
      required: ['url'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const rawUrl = requireString(args, 'url')
    const maxChars = Math.min(100_000, Math.max(500, optionalNumber(args, 'maxChars') ?? DEFAULT_MAX_CHARS))
    const response = await fetchPublic(rawUrl, context.signal)
    const contentType = response.headers.get('content-type') ?? ''
    const buffer = Buffer.from(await response.arrayBuffer())
    const sliced = buffer.subarray(0, MAX_BODY_BYTES).toString('utf8')
    const text = contentType.includes('html') ? htmlToText(sliced) : sliced
    const trimmed = text.trim()
    if (!trimmed) return `（${rawUrl} 返回了空内容）`
    return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n\n[内容已截断]` : trimmed
  },
}

async function fetchPublic(rawUrl: string, signal?: AbortSignal): Promise<Response> {
  let current = parsePublicUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const abort = (): void => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'shizhi-assistant/1.0', accept: 'text/html,application/json,text/plain,*/*' },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new ToolError(`重定向缺少 Location：${response.status}`)
        current = parsePublicUrl(new URL(location, current).toString())
        continue
      }
      if (!response.ok) throw new ToolError(`HTTP ${response.status} ${response.statusText}`)
      return response
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  throw new ToolError('重定向次数过多')
}

/** @throws if the URL is not http(s) or resolves to a private address. */
export function parsePublicUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ToolError(`无效 URL：${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolError(`只支持 http/https，收到 ${url.protocol}`)
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (isPrivateHost(host)) throw new ToolError(`拒绝访问内网地址：${url.hostname}`)
  return url.toString()
}

export function isPrivateHost(host: string): boolean {
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.internal') || host.endsWith('.local')) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  // IPv6 loopback and unique-local / link-local ranges.
  if (host === '::1' || host === '::') return true
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true
  if (/^fe80:/.test(host)) return true
  return false
}

/**
 * Strips HTML to readable text.
 *
 * Not a parser on purpose: a permissive regex over already-untrusted markup is
 * enough for feeding a model, and anything it mishandles degrades to slightly
 * messy text rather than an injection surface.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}
