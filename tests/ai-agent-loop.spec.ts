import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_CONFIG, textMessage, type AiChatEvent } from '../src/shared/ai'
import { runAgent } from '../src/main/agentRunner'
import { ApprovalBroker } from '../src/main/aiApproval'
import { createToolRegistry, ToolError, type AiTool, type KnowledgeApi, type ToolContext } from '../src/main/tools/registry'

/**
 * The agent loop is exercised against a scripted fake provider: each call to
 * `fetch` replays the next pre-built SSE body. That keeps the tests about the
 * loop's own decisions — run the tool, feed the result back, stop at the limit —
 * rather than about HTTP.
 */

const config = { ...DEFAULT_AI_CONFIG, protocol: 'anthropic' as const, baseUrl: 'https://example.test', model: 'm' }

function sseFrame(payload: unknown): string {
  return `event: x\ndata: ${JSON.stringify(payload)}\n\n`
}

/** A turn that only talks. */
function textTurn(text: string): string {
  return [
    sseFrame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    sseFrame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
    sseFrame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
    sseFrame({ type: 'message_stop' }),
  ].join('')
}

/** A turn that asks for one tool. */
function toolTurn(id: string, name: string, input: Record<string, unknown>): string {
  const json = JSON.stringify(input)
  return [
    sseFrame({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id, name, input: {} },
    }),
    // Split the JSON across fragments: real providers do the same.
    sseFrame({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(0, 4) } }),
    sseFrame({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(4) } }),
    sseFrame({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
    sseFrame({ type: 'message_stop' }),
  ].join('')
}

function scriptedFetch(bodies: string[]): { fetch: typeof fetch; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  let index = 0
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body) as Record<string, unknown>)
    const body = bodies[Math.min(index, bodies.length - 1)]!
    index += 1
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}

const emptyKnowledge: KnowledgeApi = {
  list: async () => [],
  get: async () => null,
  listJournals: async () => [],
  getJournal: async () => null,
  listCategories: async () => [],
  saveCategory: async ({ name }) => ({ id: 'c1', name }),
  save: async () => ({ revision: 1, version: 1, savedAt: new Date().toISOString() }),
}

function toolContext(overrides: Partial<ToolContext> = {}): Omit<ToolContext, 'signal'> {
  return {
    workspaceRoot: '',
    fallbackCwd: process.cwd(),
    commandTimeoutMs: 30_000,
    knowledge: emptyKnowledge,
    notifyDocumentsChanged: () => undefined,
    ...overrides,
  }
}

function makeTool(name: string, danger: AiTool['danger'], execute: AiTool['execute']): AiTool {
  return {
    danger,
    definition: { name, description: name, inputSchema: { type: 'object', properties: {} } },
    execute,
  }
}

async function drive(options: {
  bodies: string[]
  tools: AiTool[]
  approve?: (name: string) => 'allow' | 'deny'
  permissionMode?: 'always' | 'dangerous' | 'auto'
  maxSteps?: number
  context?: Partial<ToolContext>
}): Promise<{ result: Awaited<ReturnType<typeof runAgent>>; events: AiChatEvent[]; calls: Array<Record<string, unknown>> }> {
  const registry = createToolRegistry(options.tools)
  const { fetch: fetchImpl, calls } = scriptedFetch(options.bodies)
  const events: AiChatEvent[] = []
  const result = await runAgent({
    config,
    requestId: 'r1',
    messages: [textMessage('user', 'go')],
    registry,
    toolContext: toolContext(options.context),
    permissionMode: options.permissionMode ?? 'auto',
    maxSteps: options.maxSteps ?? 8,
    emit: (event) => events.push(event),
    approve: async (request) => options.approve?.(request.name) ?? 'allow',
    signal: new AbortController().signal,
    fetchImpl,
  })
  return { result, events, calls }
}

describe('agent loop', () => {
  it('runs a tool and feeds the result back into the next turn', async () => {
    const executed: unknown[] = []
    const { result, calls } = await drive({
      bodies: [toolTurn('t1', 'ping', { value: 'x' }), textTurn('done!')],
      tools: [makeTool('ping', 'read', async (input) => {
        executed.push(input)
        return 'pong'
      })],
    })

    expect(executed).toEqual([{ value: 'x' }])
    expect(result.text).toBe('done!')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({ status: 'ok', output: 'pong', name: 'ping' })

    // Second request must carry the assistant tool_use and the user tool_result.
    // The wire body is Anthropic-shaped (content blocks), not the internal form.
    const second = calls[1]!.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>
    const assistantTurn = second.at(-2)!
    expect(assistantTurn.content.some((block) => block.type === 'tool_use')).toBe(true)
    expect(assistantTurn.content.find((block) => block.type === 'tool_use')).toMatchObject({
      id: 't1',
      name: 'ping',
      input: { value: 'x' },
    })
    expect(second.at(-1)!.content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'pong' },
    ])
  })

  it('reports a denied call to the model instead of running it', async () => {
    let ran = false
    const { result, events } = await drive({
      bodies: [toolTurn('t1', 'rm', {}), textTurn('ok, skipped')],
      tools: [makeTool('rm', 'write', async () => { ran = true; return 'deleted' })],
      permissionMode: 'always',
      approve: () => 'deny',
    })
    expect(ran).toBe(false)
    expect(result.toolCalls[0]!.status).toBe('denied')
    expect(events.some((event) => event.type === 'approval')).toBe(true)
  })

  it('only interrupts for writes in dangerous mode, and for every call in always mode', async () => {
    const approveRead = await drive({
      bodies: [toolTurn('t1', 'peek', {}), textTurn('x')],
      tools: [makeTool('peek', 'read', async () => 'data')],
      permissionMode: 'dangerous',
      approve: () => 'deny',
    })
    // A read tool was never parked: the result is real, not denied.
    expect(approveRead.result.toolCalls[0]!.status).toBe('ok')

    const approveAlways = await drive({
      bodies: [toolTurn('t1', 'peek', {}), textTurn('x')],
      tools: [makeTool('peek', 'read', async () => 'data')],
      permissionMode: 'always',
      approve: () => 'deny',
    })
    expect(approveAlways.result.toolCalls[0]!.status).toBe('denied')
  })

  it('always confirms a destructive command even in dangerous mode', async () => {
    const { events } = await drive({
      bodies: [toolTurn('t1', 'run_command', { command: 'rm -rf /tmp/x' }), textTurn('x')],
      tools: [makeTool('run_command', 'execute', async () => 'gone')],
      permissionMode: 'dangerous',
      approve: () => 'deny',
    })
    expect(events.some((event) => event.type === 'approval')).toBe(true)
  })

  it('turns a tool failure into an error result the model can react to', async () => {
    const { result } = await drive({
      bodies: [toolTurn('t1', 'boom', {}), textTurn('recovered')],
      tools: [makeTool('boom', 'read', async () => { throw new ToolError('磁盘满了') })],
    })
    expect(result.toolCalls[0]!.status).toBe('error')
    expect(result.toolCalls[0]!.output).toContain('磁盘满了')
    expect(result.text).toBe('recovered')
  })

  it('reports malformed tool arguments without executing anything', async () => {
    // A truncated argument string: the parser cannot produce JSON from it.
    const broken = [
      sseFrame({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'ping', input: {} } }),
      sseFrame({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"a":' } }),
      sseFrame({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
      sseFrame({ type: 'message_stop' }),
    ].join('')
    let ran = false
    const { result } = await drive({
      bodies: [broken, textTurn('retry')],
      tools: [makeTool('ping', 'read', async () => { ran = true; return 'ok' })],
    })
    expect(ran).toBe(false)
    expect(result.toolCalls[0]!.status).toBe('error')
    expect(result.text).toBe('retry')
  })

  it('stops at the step limit instead of looping forever', async () => {
    const { result, calls } = await drive({
      bodies: [toolTurn('t1', 'loop', {}), toolTurn('t2', 'loop', {}), toolTurn('t3', 'loop', {})],
      tools: [makeTool('loop', 'read', async () => 'again')],
      maxSteps: 2,
    })
    expect(calls).toHaveLength(2)
    expect(result.error).toContain('最大工具调用步数')
  })

  it('refuses unknown tool names with a message the model can act on', async () => {
    const { result } = await drive({
      bodies: [toolTurn('t1', 'nope', {}), textTurn('sorry')],
      tools: [makeTool('ping', 'read', async () => 'pong')],
    })
    expect(result.toolCalls[0]!.status).toBe('error')
    expect(result.toolCalls[0]!.output).toContain('nope')
  })
})

describe('approval broker', () => {
  it('resolves a parked call when the renderer answers', async () => {
    const broker = new ApprovalBroker()
    const waiting = broker.wait('r1', 't1', 'write_file', 'write')
    expect(broker.hasPending('r1')).toBe(true)
    expect(broker.respond('r1', 't1', 'allow')).toBe(true)
    await expect(waiting).resolves.toBe('allow')
    expect(broker.hasPending('r1')).toBe(false)
  })

  it('denies everything still waiting when a run is cancelled', async () => {
    const broker = new ApprovalBroker()
    const first = broker.wait('r1', 't1', 'a', 'write')
    const second = broker.wait('r1', 't2', 'b', 'write')
    broker.cancel('r1')
    await expect(first).resolves.toBe('deny')
    await expect(second).resolves.toBe('deny')
  })

  it('remembers a tool only for the scope that was approved', async () => {
    const broker = new ApprovalBroker()
    const first = broker.wait('r1', 't1', 'write_file', 'write')
    broker.respond('r1', 't1', 'allow', true)
    await expect(first).resolves.toBe('allow')
    // Same tool, same danger: allowed without asking.
    await expect(broker.wait('r1', 't2', 'write_file', 'write')).resolves.toBe('allow')
  })
})
