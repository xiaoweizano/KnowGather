import { spawn } from 'node:child_process'
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireString,
  ToolError,
  type AiTool,
} from './registry.js'
import { resolveInsideRoot } from './workspace.js'

/**
 * Runs one shell command inside the workspace.
 *
 * A shell string is intentional — the model needs pipes and redirections — and
 * that makes the approval gate, not this module, the security boundary. What
 * this module guarantees is narrower: the process cannot start outside the
 * workspace, cannot outlive its timeout, and cannot flood the context.
 */

const MAX_OUTPUT_BYTES = 32 * 1024
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000

export function shellTools(): AiTool[] {
  return [runCommand]
}

const runCommand: AiTool = {
  danger: 'execute',
  definition: {
    name: 'run_command',
    description:
      '在工作区目录执行一条 shell 命令（支持管道与重定向）。cwd 是相对工作区的目录，省略为工作区根目录。'
      + '命令无输出时返回退出码。会丢失标准输出的交互式命令（如 vim）不要用。',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        cwd: { type: 'string', description: '相对工作区根目录的工作目录' },
        timeoutMs: { type: 'number', description: `超时毫秒数，上限 ${MAX_TIMEOUT_MS}` },
      },
      required: ['command'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const command = requireString(args, 'command')
    const cwdArg = optionalString(args, 'cwd')
    const requested = optionalNumber(args, 'timeoutMs') ?? context.commandTimeoutMs
    const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, requested))

    let cwd = context.fallbackCwd
    if (context.workspaceRoot) {
      cwd = await resolveInsideRoot(context.workspaceRoot, cwdArg ?? '.')
    } else if (cwdArg) {
      throw new ToolError('未配置工作区目录，无法指定 cwd')
    }

    const result = await spawnCommand(command, cwd, timeoutMs, context.signal)
    const sections: string[] = []
    if (result.stdout) sections.push(result.stdout)
    if (result.stderr) sections.push(`[stderr]\n${result.stderr}`)
    if (result.timedOut) sections.push(`[超时：超过 ${timeoutMs}ms 已终止]`)
    sections.push(`[exit ${result.exitCode ?? 'signal'}]`)
    return sections.join('\n\n')
  },
}

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export function spawnCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32'
    const child = isWindows
      // `cmd /d /s /c` avoids the quoting surprises of `cmd /c` with quotes.
      ? spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd, windowsHide: true, windowsVerbatimArguments: true })
      : spawn('/bin/sh', ['-c', command], { cwd })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (result: CommandResult | Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }

    const kill = (): void => {
      if (child.pid === undefined) return
      if (isWindows) {
        // A shell command is usually a tree; killing only `cmd.exe` orphans the
        // real work, so take the whole tree down.
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).on('error', () => undefined)
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)

    const onAbort = (): void => {
      kill()
      finish(new Error('已取消'))
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => finish({
      stdout: clampOutput(stdout),
      stderr: clampOutput(stderr),
      exitCode: code,
      timedOut,
    }))
  })
}

function clampOutput(text: string): string {
  if (Buffer.byteLength(text) <= MAX_OUTPUT_BYTES) return text.trim()
  return `${text.slice(0, MAX_OUTPUT_BYTES)}\n[输出已截断]`
}
