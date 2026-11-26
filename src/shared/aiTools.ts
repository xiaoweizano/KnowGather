export type AiToolDanger = 'read' | 'write' | 'execute'

/**
 * Which tools need the user's blessing before they run.
 *
 * Mirrors the three stances a CLI agent offers, because that is what the user
 * asked for: confirm every action, confirm only the ones that destroy or
 * execute things, or trust the model outright.
 */
export type AiPermissionMode = 'always' | 'dangerous' | 'auto'

export const AI_PERMISSION_MODES: readonly AiPermissionMode[] = ['always', 'dangerous', 'auto']

export const DEFAULT_AI_PERMISSION_MODE: AiPermissionMode = 'always'

export const DEFAULT_AI_MAX_STEPS = 24
export const MAX_AI_MAX_STEPS = 64
export const MIN_AI_MAX_STEPS = 1

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000
export const MIN_COMMAND_TIMEOUT_MS = 5_000
export const MAX_COMMAND_TIMEOUT_MS = 120_000

/** How much of one tool result is kept; the rest is truncated with a marker. */
export const MAX_TOOL_OUTPUT_CHARS = 20_000
/** How much tool output may accumulate across one run before old results are dropped. */
export const MAX_RUN_OUTPUT_CHARS = 200_000

export interface AiToolMeta {
  name: string
  /** i18n key for the card title. */
  labelKey: string
  /** Icon name from `AppIcon`. */
  icon: string
  danger: AiToolDanger
  /** False for tools that vanish when a prerequisite (e.g. a workspace) is unset. */
  available: boolean
}

/**
 * Stable descriptions of every tool the assistant can call.
 *
 * Kept apart from the implementations so the renderer can label a tool card
 * without importing anything from the main process.
 */
export const AI_TOOL_META: readonly AiToolMeta[] = [
  { name: 'list_journals', labelKey: 'aiTool.list_journals', icon: 'journal', danger: 'read', available: true },
  { name: 'read_journal', labelKey: 'aiTool.read_journal', icon: 'journal', danger: 'read', available: true },
  { name: 'list_documents', labelKey: 'aiTool.list_documents', icon: 'library', danger: 'read', available: true },
  { name: 'search_documents', labelKey: 'aiTool.search_documents', icon: 'search', danger: 'read', available: true },
  { name: 'read_document', labelKey: 'aiTool.read_document', icon: 'library', danger: 'read', available: true },
  { name: 'list_categories', labelKey: 'aiTool.list_categories', icon: 'folder', danger: 'read', available: true },
  { name: 'create_document', labelKey: 'aiTool.create_document', icon: 'filePlus', danger: 'write', available: true },
  { name: 'update_document', labelKey: 'aiTool.update_document', icon: 'edit', danger: 'write', available: true },
  { name: 'list_dir', labelKey: 'aiTool.list_dir', icon: 'folder', danger: 'read', available: false },
  { name: 'read_file', labelKey: 'aiTool.read_file', icon: 'file', danger: 'read', available: false },
  { name: 'search_files', labelKey: 'aiTool.search_files', icon: 'search', danger: 'read', available: false },
  { name: 'write_file', labelKey: 'aiTool.write_file', icon: 'filePlus', danger: 'write', available: false },
  { name: 'run_command', labelKey: 'aiTool.run_command', icon: 'terminal', danger: 'execute', available: false },
  { name: 'fetch_url', labelKey: 'aiTool.fetch_url', icon: 'globe', danger: 'read', available: true },
]

export function findToolMeta(name: string): AiToolMeta | undefined {
  return AI_TOOL_META.find((meta) => meta.name === name)
}

/**
 * Whether a call must be confirmed before it runs.
 *
 * Read-only tools never prompt unless the user chose the strictest stance;
 * `deny` is handled by the caller, so this only answers "do we need to ask".
 */
export function needsApproval(
  mode: AiPermissionMode,
  danger: AiToolDanger,
  commandIsDangerous = false,
): boolean {
  if (mode === 'auto') return false
  if (mode === 'always') return true
  // `dangerous`: only writes and command execution interrupt; a command that
  // also matches a destructive pattern is still an execute action.
  if (danger === 'execute') return true
  return danger === 'write' && commandIsDangerous
}

/**
 * Patterns that force a confirmation even in `dangerous` mode's loosest reading.
 *
 * These are the commands whose damage is irreversible or system-wide; a typo in
 * one of them loses more than the current file. Matched case-insensitively
 * against the raw command line, which is deliberately coarse — a false positive
 * only costs one extra confirmation.
 */
export const DANGEROUS_COMMAND_PATTERNS: ReadonlyArray<{ pattern: RegExp; labelKey: string }> = [
  { pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+/, labelKey: 'aiDanger.rmRecursive' },
  { pattern: /\brm\s+-rf?\s+\/(?:\s|$)/, labelKey: 'aiDanger.rmRoot' },
  { pattern: /\bdel\s+\/[sfq]\b/i, labelKey: 'aiDanger.delForce' },
  { pattern: /\brd\s+\/s\b/i, labelKey: 'aiDanger.rdRecursive' },
  { pattern: /\bformat\s+[a-z]:/i, labelKey: 'aiDanger.format' },
  { pattern: /\bmkfs(\.\w+)?\b/, labelKey: 'aiDanger.mkfs' },
  { pattern: /\bdd\s+if=/, labelKey: 'aiDanger.dd' },
  { pattern: /\bgit\s+push\s+.*(--force|-f)\b/, labelKey: 'aiDanger.gitForcePush' },
  { pattern: /\bgit\s+reset\s+--hard\b/, labelKey: 'aiDanger.gitResetHard' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, labelKey: 'aiDanger.gitClean' },
  { pattern: /\bshutdown\b|\breboot\b/i, labelKey: 'aiDanger.shutdown' },
  { pattern: /\breg\s+delete\b/i, labelKey: 'aiDanger.regDelete' },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)\b/, labelKey: 'aiDanger.pipeToShell' },
  { pattern: /\bchmod\s+(-R\s+)?777\b/, labelKey: 'aiDanger.chmod777' },
  { pattern: /\bsudo\b/, labelKey: 'aiDanger.sudo' },
  { pattern: />\s*\/dev\/sd[a-z]/, labelKey: 'aiDanger.rawDevice' },
]

/** @returns the label key of the first destructive pattern hit, or null. */
export function classifyDangerousCommand(command: string): string | null {
  for (const entry of DANGEROUS_COMMAND_PATTERNS) {
    if (entry.pattern.test(command)) return entry.labelKey
  }
  return null
}

/** Clips tool output to the per-result budget, noting what was dropped. */
export function clipToolOutput(text: string, limit = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= limit) return text
  const dropped = text.length - limit
  return `${text.slice(0, limit)}\n\n[输出已截断：省略 ${dropped} 个字符]`
}

/** Short human-readable summary of a call's arguments, for a collapsed card. */
export function summarizeToolInput(name: string, input: unknown): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return ''
  const record = input as Record<string, unknown>
  const pick = (key: string): string => (typeof record[key] === 'string' ? record[key] as string : '')
  switch (name) {
    case 'run_command':
      return pick('command')
    case 'list_journals':
      return [pick('from'), pick('to')].filter(Boolean).join(' → ')
    case 'read_journal':
      return pick('day') || pick('id')
    case 'read_document':
    case 'update_document':
      return pick('id')
    case 'create_document':
      return [pick('categoryName'), pick('title')].filter(Boolean).join(' / ')
    case 'search_documents':
    case 'search_files':
      return [pick('query') || pick('pattern'), pick('content')].filter(Boolean).join(' · ')
    case 'read_file':
    case 'write_file':
    case 'list_dir':
      return pick('path')
    case 'fetch_url':
      return pick('url')
    default: {
      const first = Object.values(record).find((value) => typeof value === 'string')
      return typeof first === 'string' ? first : ''
    }
  }
}
