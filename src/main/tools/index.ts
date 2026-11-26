import type { ToolContext, ToolRegistry } from './registry.js'
import { createToolRegistry, type AiTool } from './registry.js'
import { knowledgeTools } from './knowledge.js'
import { shellTools } from './shell.js'
import { webTools } from './web.js'
import { workspaceTools } from './workspace.js'

/**
 * The full toolset for one run.
 *
 * File and shell tools are gated on a configured workspace: without one they are
 * not advertised at all, so the model never spends a turn discovering that they
 * are unavailable.
 */
export function buildToolRegistry(): ToolRegistry {
  const gated = (tool: AiTool): AiTool & { available: (context: Pick<ToolContext, 'workspaceRoot'>) => boolean } => ({
    ...tool,
    available: (context) => context.workspaceRoot.length > 0,
  })
  return createToolRegistry([
    ...knowledgeTools,
    ...webTools(),
    ...workspaceTools().map(gated),
    ...shellTools().map(gated),
  ])
}
