import {
  messageText,
  type AiBlock,
  type AiChatEvent,
  type AiChatResult,
  type AiMessage,
  type AiProviderConfig,
  type AiToolCallRecord,
} from '../shared/ai.js'
import {
  classifyDangerousCommand,
  clipToolOutput,
  findToolMeta,
  MAX_RUN_OUTPUT_CHARS,
  needsApproval,
  summarizeToolInput,
  type AiPermissionMode,
} from '../shared/aiTools.js'
import { streamAiChat, type AiFetch } from './aiClient.js'
import { ToolError, type ToolContext, type ToolRegistry } from './tools/registry.js'

export interface AgentApprovalRequest {
  toolUseId: string
  name: string
  input: unknown
  danger: import('../shared/ai.js').AiToolDanger
  /** Human-readable text the approval card shows verbatim. */
  preview: string
}

export interface AgentOptions {
  config: AiProviderConfig
  requestId: string
  /** The conversation so far; the last message must be a user turn. */
  messages: AiMessage[]
  registry: ToolRegistry
  toolContext: Omit<ToolContext, 'signal'>
  permissionMode: AiPermissionMode
  maxSteps: number
  emit(event: AiChatEvent): void
  /** Resolves once the user (or the permission gate) allows or denies the call. */
  approve(request: AgentApprovalRequest): Promise<'allow' | 'deny'>
  signal: AbortSignal
  fetchImpl?: AiFetch
}

/**
 * Drives one assistant run to completion.
 *
 * The loop is intentionally simple: ask the model, run what it asks for, feed
 * the results back, repeat. Everything that makes that safe lives elsewhere —
 * the permission gate decides whether to ask, the tools confine their own blast
 * radius, and the step limit stops a model that never converges.
 */
export async function runAgent(options: AgentOptions): Promise<AiChatResult> {
  const { config, requestId, registry, toolContext, emit, signal } = options
  const messages: AiMessage[] = cloneMessages(options.messages)
  const calls: AiToolCallRecord[] = []
  let text = ''

  for (let step = 0; step < options.maxSteps; step += 1) {
    if (signal.aborted) return { text, toolCalls: calls, aborted: true }

    const definitions = registry.definitions(toolContext)
    const turn = await streamAiChat({
      config,
      request: { requestId, messages },
      tools: definitions,
      emit,
      signal,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })

    text += turn.text
    if (turn.error || turn.aborted) {
      return {
        text,
        toolCalls: calls,
        aborted: turn.aborted,
        ...(turn.error ? { error: turn.error } : {}),
        ...(turn.errorCode ? { errorCode: turn.errorCode } : {}),
      }
    }

    if (!turn.toolUses.length) {
      return { text, toolCalls: calls, aborted: false }
    }

    // The assistant turn is added verbatim, including any prose it wrote before
    // deciding to call a tool — the provider needs both to continue coherently.
    messages.push({
      role: 'assistant',
      blocks: [
        ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
        ...turn.toolUses.map((call): AiBlock => ({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        })),
      ],
    })

    const resultBlocks: AiBlock[] = []
    for (const call of turn.toolUses) {
      if (signal.aborted) return { text, toolCalls: calls, aborted: true }
      const record = await runCall(call, options, registry, toolContext, signal)
      calls.push(record)
      emit({
        requestId,
        type: 'tool_result',
        toolUseId: record.toolUseId,
        status: record.status,
        output: record.output,
      })
      resultBlocks.push({
        type: 'tool_result',
        toolUseId: record.toolUseId,
        content: record.output,
        ...(record.status === 'error' || record.status === 'denied' ? { isError: true } : {}),
      })
    }
    messages.push({ role: 'user', blocks: resultBlocks })
    pruneResults(messages)
  }

  return {
    text: text || `已达到最大工具调用步数（${options.maxSteps}），先停在这里。`,
    toolCalls: calls,
    aborted: false,
    ...(text ? {} : { error: `已达到最大工具调用步数（${options.maxSteps}）` }),
  }
}

async function runCall(
  call: { id: string; name: string; input: unknown; parseError?: string },
  options: AgentOptions,
  registry: ToolRegistry,
  toolContext: Omit<ToolContext, 'signal'>,
  signal: AbortSignal,
): Promise<AiToolCallRecord> {
  const { requestId, emit } = options
  const danger = registry.meta(call.name)?.danger ?? 'read'

  if (call.parseError) {
    // A truncated or malformed argument string is the model's own mistake; tell
    // it plainly rather than running the call with half a payload.
    const output = `工具参数不是合法 JSON：${call.parseError}。请重新发起调用并提供完整参数。`
    return { toolUseId: call.id, name: call.name, input: call.input, status: 'error', output }
  }

  emit({ requestId, type: 'tool_call', toolUseId: call.id, name: call.name, input: call.input })
  if (!registry.meta(call.name)) {
    return {
      toolUseId: call.id,
      name: call.name,
      input: call.input,
      status: 'error',
      output: `没有名为 ${call.name} 的工具。可用工具见系统提示中的列表。`,
    }
  }

  const dangerous = danger === 'execute' ? classifyDangerousCommand(commandOf(call.input)) : null
  if (needsApproval(options.permissionMode, danger, Boolean(dangerous))) {
    const preview = buildPreview(call.name, call.input, dangerous)
    emit({ requestId, type: 'approval', toolUseId: call.id, name: call.name, input: call.input, danger, preview })
    const decision = await options.approve({ toolUseId: call.id, name: call.name, input: call.input, danger, preview })
    if (decision !== 'allow') {
      return {
        toolUseId: call.id,
        name: call.name,
        input: call.input,
        status: 'denied',
        output: '用户拒绝执行这个工具调用。请向用户说明你没有完成这步，或改用其他方式。',
      }
    }
  }

  try {
    const output = await registry.execute(call.name, call.input, { ...toolContext, signal })
    return { toolUseId: call.id, name: call.name, input: call.input, status: 'ok', output: clipToolOutput(output) }
  } catch (cause) {
    const message = cause instanceof ToolError || cause instanceof Error ? cause.message : String(cause)
    return { toolUseId: call.id, name: call.name, input: call.input, status: 'error', output: `工具执行失败：${message}` }
  }
}

function buildPreview(name: string, input: unknown, dangerousLabelKey: string | null): string {
  const summary = summarizeToolInput(name, input)
  const base = summary ? `${labelOf(name)}：${summary}` : labelOf(name)
  return dangerousLabelKey ? `${base}\n⚠️ 该命令匹配危险操作模式` : base
}

function labelOf(name: string): string {
  const meta = findToolMeta(name)
  // The main process has no i18n; the renderer translates `labelKey` for its
  // card. This preview is only used if a client cannot.
  return meta?.labelKey ?? name
}

function commandOf(input: unknown): string {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const command = (input as Record<string, unknown>).command
    if (typeof command === 'string') return command
  }
  return ''
}

/**
 * Drops the oldest tool results once the conversation outgrows its budget.
 *
 * Tool results are the part that grows without bound (a directory listing per
 * step adds up fast). The model only needs recent ones to keep going; old ones
 * are replaced in place so the message structure — which providers validate —
 * stays intact.
 */
function pruneResults(messages: AiMessage[]): void {
  let total = 0
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool_result') total += block.content.length
    }
  }
  if (total <= MAX_RUN_OUTPUT_CHARS) return
  for (const message of messages) {
    for (const block of message.blocks) {
      if (total <= MAX_RUN_OUTPUT_CHARS) return
      if (block.type !== 'tool_result' || block.content.startsWith('[已省略')) continue
      const omitted = `[已省略：共 ${block.content.length} 字符的工具输出]`
      total -= block.content.length - omitted.length
      block.content = omitted
    }
  }
}

function cloneMessages(messages: readonly AiMessage[]): AiMessage[] {
  return messages.map((message) => ({
    role: message.role,
    blocks: message.blocks.map((block) => ({ ...block })),
  }))
}

export { messageText }
