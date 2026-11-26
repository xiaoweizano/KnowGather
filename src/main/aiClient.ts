import { AiStreamParser, type AiStreamEvent } from '../shared/aiStream.js'
import {
  buildAiChatRequest,
  isAiConfigured,
  resolveChatEndpoint,
  type AiChatErrorCode,
  type AiChatEvent,
  type AiChatRequest,
  type AiProviderConfig,
  type AiToolDefinition,
} from '../shared/ai.js'

export type AiFetch = typeof fetch

export interface AiClientOptions {
  config: AiProviderConfig
  request: AiChatRequest
  /** Tools offered to the model; empty means a plain chat turn. */
  tools?: readonly AiToolDefinition[]
  /** Emits stream events; called many times, always with the same request id. */
  emit(event: AiChatEvent): void
  /** Cancels an in-flight request; resolves once the body is closed. */
  signal?: AbortSignal
  fetchImpl?: AiFetch
  /** Replaces the built-in explanation for a non-2xx response. */
  describeError?(status: number, body: string): string
}

/** One model turn: the prose it produced plus the tools it asked for. */
export interface AiTurnResult {
  text: string
  toolUses: Array<{ id: string; name: string; input: unknown; parseError?: string }>
  /** Provider stop reason (`tool_use`, `end_turn`, `stop`, `length`, ...). */
  stopReason: string | null
  aborted: boolean
  error?: string
  errorCode?: AiChatErrorCode
}

const IDLE_TIMEOUT_MS = 60_000
const TOTAL_TIMEOUT_MS = 10 * 60_000

/**
 * Sends one turn to the configured provider and streams the reply.
 *
 * Runs in the main process on purpose: the request crosses origins, needs the
 * key, and a long reply must survive the renderer being closed. Errors are
 * classified here (auth / timeout / network / upstream) so the renderer can
 * show a translated message instead of a raw English one from the provider.
 *
 * Tool calls are reassembled here rather than in the parser: the pieces arrive
 * keyed by block index, and only this layer knows when a turn has ended, which
 * is when a truncated argument string can be reported as a parse failure.
 */
export async function streamAiChat(options: AiClientOptions): Promise<AiTurnResult> {
  const { config, request, emit, signal } = options
  const tools = options.tools ?? []
  const fetchImpl = options.fetchImpl ?? fetch
  const failed = (code: AiChatErrorCode, message: string): AiTurnResult => {
    emit({ requestId: request.requestId, type: 'error', code, message })
    return { text: '', toolUses: [], stopReason: null, aborted: false, error: message, errorCode: code }
  }

  if (!isAiConfigured(config)) return failed('notConfigured', 'AI is not configured')

  let wire
  try {
    wire = buildAiChatRequest(config, request.messages, tools)
  } catch (cause) {
    return failed('notConfigured', cause instanceof Error ? cause.message : String(cause))
  }

  const controller = new AbortController()
  const abort = (): void => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })

  let idleTimer: NodeJS.Timeout | null = null
  let timedOut = false
  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, IDLE_TIMEOUT_MS)
  }
  // Each call is one turn of the agent loop, so the clock restarts per request;
  // overall run length is bounded by the loop's step limit, not by this timer.
  const totalTimer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TOTAL_TIMEOUT_MS)

  const cleanup = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    clearTimeout(totalTimer)
    signal?.removeEventListener('abort', abort)
  }

  const turn: TurnAccumulator = new TurnAccumulator()
  try {
    armIdle()
    const response = await fetchImpl(wire.url, {
      method: 'POST',
      headers: {
        ...wire.headers,
        // Hints the provider to separate SSE frames; harmless when ignored.
        'accept-encoding': 'identity',
      },
      body: JSON.stringify(wire.body),
      signal: controller.signal,
    })

    if (!response.ok) {
      // Read the body for the provider's message — the UI shows it verbatim
      // because only the provider knows why the key was rejected.
      const body = await response.text().catch(() => '')
      const described = options.describeError?.(response.status, body) ?? describeUpstreamError(response.status, body, wire.url)
      return failed(response.status === 401 || response.status === 403 ? 'unauthorized' : 'upstream', described)
    }
    if (!response.body) return failed('upstream', 'The provider returned an empty response body')

    const parser = new AiStreamParser(config.protocol)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let finished = false

    while (!finished) {
      const { done, value } = await reader.read()
      if (done) {
        for (const event of parser.end()) finished = turn.apply(event, emit, request.requestId) || finished
        break
      }
      armIdle()
      const text = decoder.decode(value, { stream: true })
      for (const event of parser.push(text)) {
        if (turn.apply(event, emit, request.requestId)) {
          finished = true
          break
        }
      }
    }

    reader.cancel().catch(() => undefined)
    const result = turn.finish(request.requestId, emit)
    // A provider that stops for `max_tokens` still returns partial text; the
    // caller decides whether that is worth showing, so report it as a result.
    return result
  } catch (cause) {
    const aborted = controller.signal.aborted
    if (aborted && !timedOut) {
      emit({ requestId: request.requestId, type: 'done', aborted: true })
      return { ...turn.snapshot(), aborted: true }
    }
    if (timedOut) return failed('timeout', 'The provider did not respond in time')
    return failed(
      'network',
      // `fetch` folds DNS/TLS/refused-connection into "fetch failed"; the
      // endpoint is what the user needs to see to know which host was tried.
      `${safeEndpoint(wire.url)}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  } finally {
    cleanup()
  }
}

/**
 * Collects one turn's text and tool calls from the stream events.
 *
 * Anthropic and OpenAI both number tool blocks, and OpenAI may interleave
 * several calls in one turn, so fragments are keyed by index rather than
 * appended to a single buffer.
 */
class TurnAccumulator {
  private text = ''
  private readonly toolUses = new Map<number, { id: string; name: string; arguments: string }>()
  private stopReason: string | null = null
  private done = false

  /** @returns true when the stream is finished and no more events are needed. */
  apply(event: AiStreamEvent, emit: (event: AiChatEvent) => void, requestId: string): boolean {
    if (event.type === 'text') {
      if (!event.text) return false
      this.text += event.text
      emit({ requestId, type: 'delta', text: event.text })
      return false
    }
    if (event.type === 'tool_use_start') {
      const existing = this.toolUses.get(event.index)
      this.toolUses.set(event.index, {
        id: event.id || existing?.id || `tool-${event.index}`,
        name: event.name || existing?.name || '',
        arguments: existing?.arguments ?? '',
      })
      return false
    }
    if (event.type === 'tool_input_delta') {
      const entry = this.toolUses.get(event.index) ?? { id: `tool-${event.index}`, name: '', arguments: '' }
      entry.arguments += event.partialJson
      this.toolUses.set(event.index, entry)
      return false
    }
    if (event.type === 'stop') {
      if (event.reason) this.stopReason = event.reason
      return event.reason !== null && event.reason !== 'tool_use'
    }
    if (event.type === 'done') {
      this.done = true
      return true
    }
    if (event.type === 'error') {
      emit({ requestId, type: 'error', code: 'upstream', message: event.message })
      return true
    }
    return false
  }

  snapshot(): AiTurnResult {
    return {
      text: this.text,
      toolUses: this.parseCalls(),
      stopReason: this.stopReason,
      aborted: false,
    }
  }

  /** Emits the terminal events the renderer relies on and returns the result. */
  finish(requestId: string, emit: (event: AiChatEvent) => void): AiTurnResult {
    const result = this.snapshot()
    emit({ requestId, type: 'done' })
    return result
  }

  private parseCalls(): AiTurnResult['toolUses'] {
    const calls: AiTurnResult['toolUses'] = []
    for (const [, entry] of [...this.toolUses.entries()].sort(([a], [b]) => a - b)) {
      if (!entry.name) continue
      const raw = entry.arguments.trim()
      if (!raw) {
        calls.push({ id: entry.id, name: entry.name, input: {} })
        continue
      }
      try {
        calls.push({ id: entry.id, name: entry.name, input: JSON.parse(raw) })
      } catch (cause) {
        calls.push({
          id: entry.id,
          name: entry.name,
          input: null,
          parseError: cause instanceof Error ? cause.message : String(cause),
        })
      }
    }
    return calls
  }
}

/**
 * Turns a failed HTTP response into something the user can act on.
 *
 * The provider's own message is quoted because it is the only real diagnostic
 * ("invalid x-api-key", "model not found"); the wrapper only adds the endpoint,
 * which is what the user most often mistypes.
 */
function describeUpstreamError(status: number, body: string, url: string): string {
  const detail = extractErrorText(body)
  const endpoint = safeEndpoint(url)
  const base = `HTTP ${status} from ${endpoint}`
  return detail ? `${base}: ${detail}` : base
}

function extractErrorText(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === 'string') return parsed.slice(0, 500)
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const error = record.error
      if (typeof error === 'string') return error.slice(0, 500)
      if (error && typeof error === 'object') {
        const message = (error as Record<string, unknown>).message
        if (typeof message === 'string') return message.slice(0, 500)
      }
      const message = record.message
      if (typeof message === 'string') return message.slice(0, 500)
    }
  } catch {
    // Not JSON: fall through to the raw body, which gateways often send.
  }
  return trimmed.slice(0, 500)
}

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return resolveChatEndpoint({ protocol: 'openai', baseUrl: url }) || url
  }
}
