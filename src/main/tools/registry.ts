import type { AiToolDefinition, AiToolDanger } from '../../shared/ai.js'
import type { TiptapDocument } from '../../shared/document.js'

/** Everything a tool needs about the app state it is allowed to touch. */
export interface ToolContext {
  /** Root the file and shell tools are confined to; empty disables them. */
  workspaceRoot: string
  /** Absolute path the shell starts in when no cwd is given. */
  fallbackCwd: string
  /** Default command timeout, from settings. */
  commandTimeoutMs: number
  /** Restrictive file-system view of the knowledge base. */
  knowledge: KnowledgeApi
  /** Marks the renderer's document list as stale after a write. */
  notifyDocumentsChanged(): void
  signal: AbortSignal
}

/**
 * The subset of the repository the knowledge tools use.
 *
 * Declared structurally rather than importing `AtomicDocumentRepository`, so the
 * tool tests can pass a plain in-memory object instead of a temp directory.
 */
export interface KnowledgeApi {
  list(): Promise<KnowledgeDocument[]>
  get(id: string): Promise<KnowledgeDocument | null>
  listJournals(): Promise<KnowledgeJournal[]>
  getJournal(id: string): Promise<KnowledgeJournal | null>
  listCategories(): Promise<KnowledgeCategory[]>
  saveCategory(payload: { id?: string; name: string }): Promise<KnowledgeCategory>
  save(payload: KnowledgeSavePayload): Promise<{ revision: number; version: number; savedAt: string; created?: boolean }>
}

export interface KnowledgeDocument {
  id: string
  title: string
  categoryId: string | null
  tags: string[]
  favorite: boolean
  content: TiptapDocument
  revision: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeJournal {
  id: string
  title: string
  categoryId: string | null
  content: TiptapDocument
  revision: number
  version: number
  createdAt: string
  updatedAt: string
  documentId?: string | null
}

export interface KnowledgeCategory {
  id: string
  name: string
}

export interface KnowledgeSavePayload {
  id: string
  title: string
  categoryId: string | null
  tags: string[]
  favorite: boolean
  content: TiptapDocument
  revision: number
  version: number
  sourceJournalId?: string | null
}

export interface AiTool {
  definition: AiToolDefinition
  danger: AiToolDanger
  execute(input: unknown, context: ToolContext): Promise<string>
}

/** Thrown by a tool to report a recoverable failure back to the model. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

export interface ToolRegistry {
  /** Definitions for the model; excludes tools whose prerequisite is unset. */
  definitions(context: Pick<ToolContext, 'workspaceRoot'>): AiToolDefinition[]
  execute(name: string, input: unknown, context: ToolContext): Promise<string>
  meta(name: string): AiTool | undefined
}

/**
 * Collects the tools a run may use.
 *
 * Availability is a runtime question, not a static one: without a workspace
 * root the file and shell tools are not merely denied, they are not advertised,
 * so the model never wastes a turn discovering they are off.
 */
export function createToolRegistry(tools: ReadonlyArray<AiTool & { available?: (context: Pick<ToolContext, 'workspaceRoot'>) => boolean }>): ToolRegistry {
  const byName = new Map(tools.map((tool) => [tool.definition.name, tool]))
  return {
    definitions(context) {
      return tools
        .filter((tool) => (tool.available ? tool.available(context) : true))
        .map((tool) => tool.definition)
    },
    async execute(name, input, context) {
      const tool = byName.get(name)
      if (!tool) throw new ToolError(`未知工具：${name}`)
      return tool.execute(input, context)
    },
    meta(name) {
      return byName.get(name)
    },
  }
}

/** Small helper for reading tool arguments with a clear error message. */
export function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`缺少参数 ${key}`)
  return value.trim()
}

export function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
