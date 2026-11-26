import type { AiProtocol } from './ai.js'

export type AiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use_start'; index: number; id: string; name: string }
  | { type: 'tool_input_delta'; index: number; partialJson: string }
  | { type: 'stop'; reason: string | null }
  | { type: 'done' }
  | { type: 'error'; message: string }

/**
 * Incremental parser for a provider's streaming response.
 *
 * Both supported protocols speak server-sent events but disagree on the payload:
 * OpenAI-compatible endpoints send `choices[0].delta.content` chunks terminated
 * by `data: [DONE]`, the Anthropic Messages API a typed event stream
 * (`content_block_delta` / `message_stop`). Everything else — comments, `event:`
 * lines, unknown event types, keep-alives — is ignored rather than treated as
 * text, so a provider's extra metadata never leaks into the reply.
 *
 * Tool calls arrive the same way text does — in pieces — but need reassembly:
 * Anthropic streams `input_json_delta.partial_json` fragments per block index,
 * OpenAI sends `tool_calls[].function.arguments` the same way. The parser only
 * reports the pieces; the caller stitches and parses them, so a malformed
 * argument JSON becomes a recoverable tool error instead of a dead stream.
 *
 * Fed chunk by chunk because a network chunk can split an SSE frame mid-line.
 */
export class AiStreamParser {
  private buffer = ''
  private finished = false

  constructor(private readonly protocol: AiProtocol) {}

  push(chunk: string): AiStreamEvent[] {
    this.buffer += chunk
    const events: AiStreamEvent[] = []
    // Frames end with a blank line. Accept \r\n as well: some gateways re-serialize.
    let boundary = this.findBoundary()
    while (boundary !== null) {
      const frame = this.buffer.slice(0, boundary.index)
      this.buffer = this.buffer.slice(boundary.index + boundary.length)
      events.push(...this.consumeFrame(frame))
      boundary = this.findBoundary()
    }
    return events
  }

  /** Flushes a trailing frame when the body ends without a final blank line. */
  end(): AiStreamEvent[] {
    const rest = this.buffer
    this.buffer = ''
    const events = rest.trim() ? this.consumeFrame(rest) : []
    if (!this.finished) events.push({ type: 'done' })
    this.finished = true
    return events
  }

  private findBoundary(): { index: number; length: number } | null {
    const lf = this.buffer.indexOf('\n\n')
    const crlf = this.buffer.indexOf('\r\n\r\n')
    if (lf === -1 && crlf === -1) return null
    if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 }
    return { index: lf, length: 2 }
  }

  private consumeFrame(frame: string): AiStreamEvent[] {
    if (this.finished) return []
    const events: AiStreamEvent[] = []
    for (const line of frame.split('\n')) {
      const trimmed = line.replace(/\r$/, '')
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') {
        if (payload === '[DONE]') events.push({ type: 'done' })
        continue
      }
      events.push(...this.consumePayload(payload))
    }
    for (const event of events) {
      if (event.type === 'done') this.finished = true
    }
    return events
  }

  private consumePayload(payload: string): AiStreamEvent[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      // A malformed frame is not fatal: the rest of the stream may still be fine.
      return []
    }
    if (!isRecord(parsed)) return []
    return this.protocol === 'anthropic' ? this.consumeAnthropic(parsed) : this.consumeOpenAi(parsed)
  }

  private consumeAnthropic(payload: Record<string, unknown>): AiStreamEvent[] {
    const type = payload.type
    if (type === 'content_block_start') {
      const block = isRecord(payload.content_block) ? payload.content_block : null
      if (!block) return []
      if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        return [{
          type: 'tool_use_start',
          index: toIndex(payload.index),
          id: block.id,
          name: block.name,
        }]
      }
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        return [{ type: 'text', text: block.text }]
      }
      return []
    }
    if (type === 'content_block_delta') {
      const delta = isRecord(payload.delta) ? payload.delta : null
      if (!delta) return []
      // `thinking_delta` shares the shape; only visible text is rendered.
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return [{ type: 'text', text: delta.text }]
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        return [{ type: 'tool_input_delta', index: toIndex(payload.index), partialJson: delta.partial_json }]
      }
      return []
    }
    if (type === 'message_delta') {
      const delta = isRecord(payload.delta) ? payload.delta : null
      const reason = delta && typeof delta.stop_reason === 'string' ? delta.stop_reason : null
      return [{ type: 'stop', reason }]
    }
    if (type === 'message_stop') return [{ type: 'done' }]
    if (type === 'error') return [{ type: 'error', message: errorMessage(payload.error) }]
    return []
  }

  private consumeOpenAi(payload: Record<string, unknown>): AiStreamEvent[] {
    if (payload.error !== undefined) return [{ type: 'error', message: errorMessage(payload.error) }]
    const choices = Array.isArray(payload.choices) ? payload.choices : []
    const events: AiStreamEvent[] = []
    for (const choice of choices) {
      if (!isRecord(choice)) continue
      const delta = isRecord(choice.delta) ? choice.delta : null
      if (delta && typeof delta.content === 'string' && delta.content) {
        events.push({ type: 'text', text: delta.content })
      }
      // Providers that only implement the non-streaming shape send a message.
      const message = isRecord(choice.message) ? choice.message : null
      if (!delta && message && typeof message.content === 'string' && message.content) {
        events.push({ type: 'text', text: message.content })
      }
      const calls = delta && Array.isArray(delta.tool_calls) ? delta.tool_calls : []
      for (const call of calls) {
        if (!isRecord(call)) continue
        const index = toIndex(call.index)
        const fn = isRecord(call.function) ? call.function : null
        // The id and name only appear on the first fragment of each call.
        if (typeof call.id === 'string' && typeof fn?.name === 'string') {
          events.push({ type: 'tool_use_start', index, id: call.id, name: fn.name })
        }
        if (fn && typeof fn.arguments === 'string' && fn.arguments) {
          events.push({ type: 'tool_input_delta', index, partialJson: fn.arguments })
        }
      }
      if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
        events.push({ type: 'stop', reason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null })
        events.push({ type: 'done' })
      }
    }
    return events
  }
}

function toIndex(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string' && value) return value
  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message) return value.message
    if (typeof value.code === 'string' && value.code) return value.code
  }
  return 'Upstream provider reported an error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
