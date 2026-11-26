export type AiProtocol = 'openai' | 'anthropic'

/**
 * Provider protocols the assistant can talk to.
 *
 * `openai` covers every OpenAI-compatible endpoint (OpenAI, DeepSeek, Moonshot,
 * OpenRouter, Ollama, LM Studio, one-api style gateways, ...); `anthropic` the
 * Messages API. Nothing else is hard-coded, so a new endpoint only needs a URL
 * and a key.
 */
export const AI_PROTOCOLS: readonly AiProtocol[] = ['openai', 'anthropic']

/**
 * Connection settings for the AI assistant. Deliberately generic: like Claude
 * Code, the user supplies an endpoint and a key, and any compatible provider
 * works without code changes.
 */
export interface AiProviderConfig {
  protocol: AiProtocol
  /** Base URL or a complete chat endpoint; the path is added when missing. */
  baseUrl: string
  /** Optional: local endpoints (Ollama, LM Studio) usually need no key. */
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
}

/**
 * What the renderer sees: the key never leaves the main process in plain text,
 * only whether one is stored.
 */
export interface AiConfigView extends Omit<AiProviderConfig, 'apiKey'> {
  hasApiKey: boolean
}

/** Settings patch. An absent `apiKey` keeps the stored one; '' clears it. */
export type AiConfigPatch = Partial<Omit<AiProviderConfig, 'apiKey'>> & { apiKey?: string | null }

/**
 * One piece of a message.
 *
 * Conversations stopped being plain strings once tools arrived: an assistant
 * turn can carry prose *and* tool calls, and the next user turn carries the
 * results. Both wire formats model this as content blocks, so the internal
 * representation does too rather than inventing a lossy middle shape.
 */
export type AiBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }

export interface AiMessage {
  role: 'user' | 'assistant'
  blocks: AiBlock[]
}

/** A tool the model may call; `inputSchema` is plain JSON Schema. */
export interface AiToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface AiChatRequest {
  /** Correlation id; every stream event carries it so the UI can ignore stale runs. */
  requestId: string
  messages: AiMessage[]
}

export type AiChatErrorCode = 'notConfigured' | 'unauthorized' | 'timeout' | 'network' | 'upstream'

/**
 * Why a connection test failed without the provider saying so itself.
 * `desktopOnly` covers the browser preview, `emptyReply` a stream that ended
 * without text (usually a wrong base URL that still returned 200).
 */
export type AiTestFailureCode = AiChatErrorCode | 'desktopOnly' | 'emptyReply'

export type AiChatEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'tool_call'; toolUseId: string; name: string; input: unknown }
  | { requestId: string; type: 'tool_result'; toolUseId: string; status: 'ok' | 'error' | 'denied'; output: string }
  | {
      requestId: string
      type: 'approval'
      toolUseId: string
      name: string
      input: unknown
      danger: AiToolDanger
      preview: string
    }
  | { requestId: string; type: 'done'; aborted?: boolean }
  | { requestId: string; type: 'error'; message: string; code?: AiChatErrorCode }

/**
 * How much damage a tool can do. The renderer colours its card by this and the
 * permission gate uses it to decide whether the user must be asked.
 */
export type AiToolDanger = 'read' | 'write' | 'execute'

/**
 * What `chat()` resolves to.
 *
 * The stream events and the promise resolution travel over two different IPC
 * paths, and Electron does not guarantee their order: the invoke reply can
 * arrive before the last `send`s. So the resolved value carries the whole reply
 * and the renderer treats it as authoritative — a late-arriving delta can then
 * only be a duplicate, never a missing tail.
 */
export interface AiChatResult {
  /** Everything the provider streamed, already concatenated. */
  text: string
  /** Tool calls made during the run, in order, with their final outcome. */
  toolCalls: AiToolCallRecord[]
  aborted: boolean
  /** Failure message, if the stream ended in an error rather than a reply. */
  error?: string
  errorCode?: AiChatErrorCode
}

export interface AiToolCallRecord {
  toolUseId: string
  name: string
  input: unknown
  status: 'ok' | 'error' | 'denied'
  output: string
}

export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: '',
}

export const DEFAULT_AI_CONFIG_VIEW: AiConfigView = {
  protocol: 'openai',
  baseUrl: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: '',
  hasApiKey: false,
}

export const MAX_AI_BASE_URL_LENGTH = 2048
export const MAX_AI_API_KEY_LENGTH = 512
export const MAX_AI_MODEL_LENGTH = 200
export const MAX_AI_SYSTEM_PROMPT_LENGTH = 8000
export const MAX_AI_MESSAGES = 100
export const MAX_AI_MESSAGE_LENGTH = 200_000
export const MAX_AI_BLOCKS_PER_MESSAGE = 64

/** Prompt for the "test connection" button: one turn, shortest useful reply. */
const MINIMAL_TEST_CONTENT = 'Reply with the single word OK.'

/** A one-turn request used by the "test connection" button. */
export function buildAiTestRequest(requestId: string): AiChatRequest {
  return {
    requestId,
    messages: [{ role: 'user', blocks: [{ type: 'text', text: MINIMAL_TEST_CONTENT }] }],
  }
}

/** Convenience for callers that only have plain prose to send. */
export function textMessage(role: AiMessage['role'], text: string): AiMessage {
  return { role, blocks: [{ type: 'text', text }] }
}

/** Flattens the text blocks of a message; tool blocks are skipped. */
export function messageText(message: AiMessage): string {
  return message.blocks
    .filter((block): block is Extract<AiBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

export function normalizeAiConfig(input: unknown): AiProviderConfig {
  const candidate = isRecord(input) ? input : {}
  return {
    protocol: candidate.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: cleanText(candidate.baseUrl, MAX_AI_BASE_URL_LENGTH).replace(/\/+$/, ''),
    apiKey: cleanText(candidate.apiKey, MAX_AI_API_KEY_LENGTH),
    model: cleanText(candidate.model, MAX_AI_MODEL_LENGTH),
    temperature: clampNumber(candidate.temperature, 0, 2, DEFAULT_AI_CONFIG.temperature),
    maxTokens: Math.round(clampNumber(candidate.maxTokens, 1, 32_000, DEFAULT_AI_CONFIG.maxTokens)),
    systemPrompt: cleanText(candidate.systemPrompt, MAX_AI_SYSTEM_PROMPT_LENGTH),
  }
}

export function toAiConfigView(config: AiProviderConfig): AiConfigView {
  return {
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
    hasApiKey: config.apiKey.length > 0,
  }
}

/** Applies a patch without exposing the stored key: absent means "keep". */
export function applyAiConfigPatch(current: AiProviderConfig, patch: unknown): AiProviderConfig {
  if (!isRecord(patch)) throw new TypeError('Invalid AI configuration patch')
  const merged: Record<string, unknown> = { ...current }
  for (const key of ['protocol', 'baseUrl', 'model', 'temperature', 'maxTokens', 'systemPrompt'] as const) {
    if (key in patch) merged[key] = patch[key]
  }
  if ('apiKey' in patch && patch.apiKey !== undefined) {
    if (patch.apiKey !== null && typeof patch.apiKey !== 'string') throw new TypeError('Invalid AI API key')
    merged.apiKey = patch.apiKey ?? ''
  }
  return validateAiConfig(merged)
}

/** Strict validation for IPC writes; throws instead of silently normalising. */
export function validateAiConfig(value: unknown): AiProviderConfig {
  if (!isRecord(value)) throw new TypeError('Invalid AI configuration')
  if (value.protocol !== 'openai' && value.protocol !== 'anthropic') throw new TypeError('Invalid AI protocol')
  if ('baseUrl' in value && typeof value.baseUrl !== 'string') throw new TypeError('Invalid AI base URL')
  if ('apiKey' in value && typeof value.apiKey !== 'string') throw new TypeError('Invalid AI API key')
  if ('model' in value && typeof value.model !== 'string') throw new TypeError('Invalid AI model')
  if ('temperature' in value && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature))) {
    throw new TypeError('Invalid AI temperature')
  }
  if ('maxTokens' in value && (typeof value.maxTokens !== 'number' || !Number.isFinite(value.maxTokens))) {
    throw new TypeError('Invalid AI max tokens')
  }
  if ('systemPrompt' in value && typeof value.systemPrompt !== 'string') throw new TypeError('Invalid AI system prompt')
  return normalizeAiConfig(value)
}

export function validateAiChatRequest(value: unknown): AiChatRequest {
  if (!isRecord(value)) throw new TypeError('Invalid AI chat request')
  const requestId = value.requestId
  if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 200) {
    throw new TypeError('Invalid AI request id')
  }
  const rawMessages = value.messages
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_AI_MESSAGES) {
    throw new TypeError('Invalid AI messages')
  }
  const messages = rawMessages.map((message) => {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant')) {
      throw new TypeError('Invalid AI message role')
    }
    return { role: message.role, blocks: normalizeBlocks(message) } as AiMessage
  })
  const last = messages[messages.length - 1]!
  // The conversation must end with something the provider can answer: either a
  // user turn or an assistant turn that is still asking for tools (the agent
  // loop re-sends that shape). A plain user text turn is the common case.
  if (last.role !== 'user' || !last.blocks.length) throw new TypeError('AI messages must end with the user turn')
  return { requestId, messages }
}

/**
 * Accepts both the block form and the pre-tool `{ content: string }` form, so a
 * renderer built from older code keeps working across an in-place update.
 */
function normalizeBlocks(message: Record<string, unknown>): AiBlock[] {
  if (typeof message.content === 'string') {
    if (message.content.length > MAX_AI_MESSAGE_LENGTH) throw new TypeError('Invalid AI message content')
    return [{ type: 'text', text: message.content }]
  }
  const rawBlocks = message.blocks
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0 || rawBlocks.length > MAX_AI_BLOCKS_PER_MESSAGE) {
    throw new TypeError('Invalid AI message blocks')
  }
  let budget = MAX_AI_MESSAGE_LENGTH
  return rawBlocks.map((block) => {
    if (!isRecord(block)) throw new TypeError('Invalid AI content block')
    if (block.type === 'text') {
      if (typeof block.text !== 'string') throw new TypeError('Invalid AI text block')
      budget -= block.text.length
      if (budget < 0) throw new TypeError('AI message is too long')
      return { type: 'text', text: block.text } as AiBlock
    }
    if (block.type === 'tool_use') {
      if (typeof block.id !== 'string' || typeof block.name !== 'string') throw new TypeError('Invalid AI tool_use block')
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input } as AiBlock
    }
    if (block.type === 'tool_result') {
      if (typeof block.toolUseId !== 'string' || typeof block.content !== 'string') {
        throw new TypeError('Invalid AI tool_result block')
      }
      budget -= block.content.length
      if (budget < 0) throw new TypeError('AI tool result is too long')
      return {
        type: 'tool_result',
        toolUseId: block.toolUseId,
        content: block.content,
        ...(block.isError === true ? { isError: true } : {}),
      } as AiBlock
    }
    throw new TypeError('Invalid AI content block type')
  })
}

/**
 * Resolves the URL a chat request is sent to.
 *
 * A base URL gets the protocol's conventional path appended; a URL that already
 * names the endpoint is used verbatim (query string included), so a provider
 * with a custom layout — Azure-style `?api-version=...`, a gateway prefix —
 * can be pointed at it directly.
 */
export function resolveChatEndpoint(config: Pick<AiProviderConfig, 'protocol' | 'baseUrl'>): string {
  const base = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
  if (!base || !/^https?:\/\//i.test(base)) return ''
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return ''
  }
  const endpoint = config.protocol === 'anthropic' ? 'messages' : 'chat/completions'
  const pathname = url.pathname.replace(/\/+$/, '')
  if (new RegExp(`/${endpoint}$`, 'i').test(pathname)) return url.toString().replace(/\/+$/, '')
  const next = new URL(url.toString())
  if (/\/v\d+[a-z0-9.-]*$/i.test(pathname)) {
    next.pathname = `${pathname}/${endpoint}`
  } else if (config.protocol === 'anthropic') {
    next.pathname = `${pathname}/v1/${endpoint}`
  } else {
    next.pathname = `${pathname}/v1/${endpoint}`
  }
  return next.toString()
}

/** True when the assistant has enough to send a request. */
export function isAiConfigured(config: AiProviderConfig): boolean {
  return resolveChatEndpoint(config).length > 0 && config.model.trim().length > 0
}

export interface AiWireRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/**
 * Maps the generic conversation onto the provider's wire format.
 *
 * The system prompt is configuration, not conversation: Anthropic takes it as a
 * top-level field, OpenAI as a leading `system` message.
 *
 * Tool plumbing deliberately diverges per protocol:
 * - Anthropic keeps everything inside `content` blocks (`tool_use` on the
 *   assistant turn, `tool_result` in the next user turn).
 * - OpenAI puts calls in `tool_calls` on the assistant message and each result
 *   in its own `role: 'tool'` message, keyed by `tool_call_id`.
 */
export function buildAiChatRequest(
  config: AiProviderConfig,
  messages: readonly AiMessage[],
  tools: readonly AiToolDefinition[] = [],
): AiWireRequest {
  const url = resolveChatEndpoint(config)
  if (!url) throw new TypeError('AI endpoint is not configured')
  const model = config.model.trim()
  if (!model) throw new TypeError('AI model is not configured')

  if (config.protocol === 'anthropic') {
    return {
      url,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'anthropic-version': '2023-06-01',
        ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
      },
      body: {
        model,
        max_tokens: config.maxTokens,
        // No `temperature`: Anthropic's current models reject sampling
        // parameters outright (HTTP 400), and the request must work for a
        // plain connection test as well as for chat.
        stream: true,
        ...(config.systemPrompt ? { system: config.systemPrompt } : {}),
        ...(tools.length
          ? {
              tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
              })),
            }
          : {}),
        messages: messages.map((message) => ({
          role: message.role,
          content: message.blocks.map((block) => {
            if (block.type === 'text') return { type: 'text', text: block.text }
            if (block.type === 'tool_use') {
              return { type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} }
            }
            return {
              type: 'tool_result',
              tool_use_id: block.toolUseId,
              content: block.content,
              ...(block.isError ? { is_error: true } : {}),
            }
          }),
        })),
      },
    }
  }

  return {
    url,
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: {
      model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
            })),
          }
        : {}),
      messages: [
        ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
        ...toOpenAiMessages(messages),
      ],
    },
  }
}

/** OpenAI needs tool results as separate `role: 'tool'` messages. */
function toOpenAiMessages(messages: readonly AiMessage[]): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = []
  for (const message of messages) {
    const text = messageText(message)
    const calls = message.blocks.filter((block): block is Extract<AiBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    const results = message.blocks.filter((block): block is Extract<AiBlock, { type: 'tool_result' }> => block.type === 'tool_result')

    if (calls.length) {
      // A message carrying calls becomes the assistant turn; any prose it also
      // streamed travels with them, which is what the model saw originally.
      output.push({
        role: 'assistant',
        content: text || null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
        })),
      })
      continue
    }
    if (results.length) {
      // Results must follow the assistant turn that requested them; the text
      // of the same user message (rare) is kept as its own turn before them.
      if (text) output.push({ role: 'user', content: text })
      for (const result of results) {
        output.push({ role: 'tool', tool_call_id: result.toolUseId, content: result.content })
      }
      continue
    }
    output.push({ role: message.role, content: text })
  }
  return output
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
