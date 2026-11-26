import { describe, expect, it } from 'vitest'
import {
  buildAiChatRequest,
  isAiConfigured,
  normalizeAiConfig,
  resolveChatEndpoint,
  textMessage,
  toAiConfigView,
  validateAiChatRequest,
  DEFAULT_AI_CONFIG,
  type AiMessage,
  type AiToolDefinition,
} from '../src/shared/ai'
import { AiStreamParser } from '../src/shared/aiStream'

const baseConfig = { ...DEFAULT_AI_CONFIG, model: 'demo-model' }

describe('AI endpoint resolution', () => {
  it('accepts a root address and adds the protocol path', () => {
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: 'https://api.openai.com' }))
      .toBe('https://api.openai.com/v1/chat/completions')
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: 'https://host/v1' }))
      .toBe('https://host/v1/chat/completions')
    expect(resolveChatEndpoint({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' }))
      .toBe('https://api.anthropic.com/v1/messages')
  })

  it('keeps a complete endpoint and its query string verbatim', () => {
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: 'https://gateway/proxy/chat/completions' }))
      .toBe('https://gateway/proxy/chat/completions')
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: 'https://azure/openai/deployments/x/chat/completions?api-version=2' }))
      .toBe('https://azure/openai/deployments/x/chat/completions?api-version=2')
    expect(resolveChatEndpoint({ protocol: 'anthropic', baseUrl: 'https://proxy/v1/messages' }))
      .toBe('https://proxy/v1/messages')
  })

  it('rejects non-http addresses and an empty model', () => {
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: 'ftp://host' })).toBe('')
    expect(resolveChatEndpoint({ protocol: 'openai', baseUrl: '  ' })).toBe('')
    expect(isAiConfigured({ ...baseConfig, baseUrl: 'https://api.openai.com', model: '' })).toBe(false)
    expect(isAiConfigured({ ...baseConfig, baseUrl: 'https://api.openai.com' })).toBe(true)
  })
})

describe('AI wire format', () => {
  const messages = [
    textMessage('user', 'hi'),
    textMessage('assistant', 'hello'),
    textMessage('user', 'again'),
  ]

  it('builds an OpenAI-compatible request with a system message', () => {
    const wire = buildAiChatRequest(
      { ...baseConfig, baseUrl: 'https://api.example.com/v1', apiKey: 'k', systemPrompt: 'be brief' },
      messages,
    )
    expect(wire.url).toBe('https://api.example.com/v1/chat/completions')
    expect(wire.headers.authorization).toBe('Bearer k')
    expect(wire.body).toMatchObject({ model: 'demo-model', stream: true })
    expect(wire.body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'again' },
    ])
  })

  it('builds an Anthropic request with x-api-key, version header and a top-level system', () => {
    const wire = buildAiChatRequest(
      { ...baseConfig, protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k', systemPrompt: 'be brief' },
      messages,
    )
    expect(wire.url).toBe('https://api.anthropic.com/v1/messages')
    expect(wire.headers['x-api-key']).toBe('k')
    expect(wire.headers['anthropic-version']).toBe('2023-06-01')
    expect(wire.body.system).toBe('be brief')
    // Current Anthropic models reject sampling parameters with a 400.
    expect(wire.body).not.toHaveProperty('temperature')
    expect(wire.body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      { role: 'user', content: [{ type: 'text', text: 'again' }] },
    ])
  })

  it('maps tools and tool traffic per protocol', () => {
    const tool: AiToolDefinition = {
      name: 'list_journals',
      description: 'list',
      inputSchema: { type: 'object', properties: {} },
    }
    const withCall: AiMessage[] = [
      textMessage('user', 'summarise'),
      {
        role: 'assistant',
        blocks: [
          { type: 'text', text: 'checking' },
          { type: 'tool_use', id: 'call-1', name: 'list_journals', input: { from: '2026-11-23' } },
        ],
      },
      {
        role: 'user',
        blocks: [{ type: 'tool_result', toolUseId: 'call-1', content: '[]' }],
      },
    ]

    const anthropic = buildAiChatRequest(
      { ...baseConfig, protocol: 'anthropic', baseUrl: 'https://api.anthropic.com' },
      withCall,
      [tool],
    )
    expect(anthropic.body.tools).toEqual([
      { name: 'list_journals', description: 'list', input_schema: tool.inputSchema },
    ])
    expect((anthropic.body.messages as Array<{ content: unknown[] }>)[1]!.content).toEqual([
      { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 'call-1', name: 'list_journals', input: { from: '2026-11-23' } },
    ])
    expect((anthropic.body.messages as Array<{ content: unknown[] }>)[2]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'call-1', content: '[]' },
    ])

    const openai = buildAiChatRequest(
      { ...baseConfig, baseUrl: 'https://api.example.com/v1' },
      withCall,
      [tool],
    )
    expect(openai.body.tools).toEqual([
      { type: 'function', function: { name: 'list_journals', description: 'list', parameters: tool.inputSchema } },
    ])
    // OpenAI needs the result as its own `role: 'tool'` message.
    expect(openai.body.messages).toEqual([
      { role: 'user', content: 'summarise' },
      {
        role: 'assistant',
        content: 'checking',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'list_journals', arguments: JSON.stringify({ from: '2026-11-23' }) },
        }],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '[]' },
    ])
  })

  it('omits the authorization header for keyless local endpoints', () => {
    const wire = buildAiChatRequest({ ...baseConfig, baseUrl: 'http://localhost:11434/v1' }, messages)
    expect(wire.headers.authorization).toBeUndefined()
  })
})

describe('AI configuration view and validation', () => {
  it('never exposes the key to the renderer', () => {
    const view = toAiConfigView({ ...baseConfig, apiKey: 'secret' })
    expect({ ...view }).not.toHaveProperty('apiKey')
    expect(view.hasApiKey).toBe(true)
  })

  it('normalises out-of-range numbers instead of trusting them', () => {
    const config = normalizeAiConfig({ protocol: 'anthropic', temperature: 9, maxTokens: 10 ** 6 })
    expect(config.temperature).toBe(2)
    expect(config.maxTokens).toBe(32_000)
  })

  it('requires the conversation to end with the user turn', () => {
    expect(() => validateAiChatRequest({
      requestId: 'r1',
      messages: [textMessage('user', 'hi'), textMessage('assistant', 'yo')],
    })).toThrow()
    expect(validateAiChatRequest({ requestId: 'r1', messages: [textMessage('user', 'hi')] }).messages)
      .toEqual([textMessage('user', 'hi')])
  })

  it('still accepts the pre-tool string form from an older renderer', () => {
    expect(validateAiChatRequest({ requestId: 'r1', messages: [{ role: 'user', content: 'hi' }] }).messages)
      .toEqual([textMessage('user', 'hi')])
  })

  it('validates tool blocks and rejects malformed ones', () => {
    const withTool: AiMessage = {
      role: 'assistant',
      blocks: [{ type: 'tool_use', id: 'c1', name: 'read_document', input: { id: 'd1' } }],
    }
    expect(validateAiChatRequest({ requestId: 'r1', messages: [textMessage('user', 'hi'), withTool, {
      role: 'user',
      blocks: [{ type: 'tool_result', toolUseId: 'c1', content: 'ok' }],
    }] }).messages).toHaveLength(3)

    expect(() => validateAiChatRequest({ requestId: 'r1', messages: [textMessage('user', 'hi'), {
      role: 'assistant',
      blocks: [{ type: 'tool_use', id: 1, name: 'x', input: {} }],
    }] })).toThrow()
    expect(() => validateAiChatRequest({ requestId: 'r1', messages: [{ role: 'user', blocks: [] }] })).toThrow()
  })
})

describe('AI stream parser', () => {
  it('streams OpenAI deltas and stops at [DONE]', () => {
    const parser = new AiStreamParser('openai')
    const events = [
      ...parser.push('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'),
      ...parser.push('data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'),
      ...parser.push('data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n'),
    ]
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done' },
    ])
  })

  it('streams Anthropic text deltas and ignores thinking blocks', () => {
    const parser = new AiStreamParser('anthropic')
    const frame = (payload: unknown): string => `event: x\ndata: ${JSON.stringify(payload)}\n\n`
    const events = [
      ...parser.push(frame({ type: 'message_start', message: {} })),
      ...parser.push(frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } })),
      ...parser.push(frame({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } })),
      ...parser.push(frame({ type: 'message_stop' })),
    ]
    expect(events).toEqual([{ type: 'text', text: 'Hi' }, { type: 'done' }])
  })

  it('reports Anthropic tool_use blocks and their argument fragments', () => {
    const parser = new AiStreamParser('anthropic')
    const frame = (payload: unknown): string => `event: x\ndata: ${JSON.stringify(payload)}\n\n`
    const events = [
      ...parser.push(frame({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'list_journals', input: {} },
      })),
      ...parser.push(frame({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"from":"2026-' } })),
      ...parser.push(frame({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '11-23"}' } })),
      ...parser.push(frame({ type: 'message_delta', delta: { stop_reason: 'tool_use' } })),
      ...parser.push(frame({ type: 'message_stop' })),
    ]
    expect(events).toEqual([
      { type: 'tool_use_start', index: 1, id: 'toolu_1', name: 'list_journals' },
      { type: 'tool_input_delta', index: 1, partialJson: '{"from":"2026-' },
      { type: 'tool_input_delta', index: 1, partialJson: '11-23"}' },
      { type: 'stop', reason: 'tool_use' },
      { type: 'done' },
    ])
  })

  it('reports OpenAI tool_calls fragments keyed by index', () => {
    const parser = new AiStreamParser('openai')
    const events = [
      ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"read_file","arguments":""}}]}}]}\n\n'),
      ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}\n\n'),
      ...parser.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.md\\"}"}}]}}]}\n\n'),
      ...parser.push('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n'),
    ]
    expect(events).toEqual([
      { type: 'tool_use_start', index: 0, id: 'call_a', name: 'read_file' },
      { type: 'tool_input_delta', index: 0, partialJson: '{"path":' },
      { type: 'tool_input_delta', index: 0, partialJson: '"a.md"}' },
      { type: 'stop', reason: 'tool_calls' },
      { type: 'done' },
    ])
  })

  it('reassembles a frame split across network chunks', () => {
    const parser = new AiStreamParser('openai')
    const first = parser.push('data: {"choices":[{"delta":{"con')
    const second = parser.push('tent":"split"}}]}\n\n')
    expect(first).toEqual([])
    expect(second).toEqual([{ type: 'text', text: 'split' }])
  })

  it('surfaces provider error frames and skips malformed ones', () => {
    const parser = new AiStreamParser('openai')
    const events = parser.push('data: {not json\n\ndata: {"error":{"message":"bad key"}}\n\n')
    expect(events).toEqual([{ type: 'error', message: 'bad key' }])
  })

  it('flushes a trailing frame that lacks a blank line', () => {
    const parser = new AiStreamParser('openai')
    expect(parser.push('data: {"choices":[{"delta":{"content":"tail"}}]}')).toEqual([])
    expect(parser.end()).toEqual([{ type: 'text', text: 'tail' }, { type: 'done' }])
  })
})
