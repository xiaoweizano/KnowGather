import type { AiToolDanger } from '../shared/ai.js'

export type ApprovalDecision = 'allow' | 'deny'

interface PendingApproval {
  resolve(decision: ApprovalDecision): void
  /** What "remember" applies to: the same tool at the same danger level. */
  scope: string
}

/**
 * Holds runs that are waiting on the user.
 *
 * The main process cannot block on a dialog the renderer owns, so each pending
 * call parks a promise here until `respond` — or `cancel` — wakes it. "Always
 * allow this session" is stored per tool+danger rather than per tool so that
 * approving `read_file` never silently approves `write_file`.
 */
export class ApprovalBroker {
  private readonly pending = new Map<string, Map<string, PendingApproval>>()
  private readonly remembered = new Set<string>()

  /** @returns a promise that settles when the renderer answers. */
  wait(requestId: string, toolUseId: string, name: string, danger: AiToolDanger): Promise<ApprovalDecision> {
    const scope = `${name}:${danger}`
    if (this.remembered.has(scope)) return Promise.resolve('allow')
    return new Promise<ApprovalDecision>((resolve) => {
      let calls = this.pending.get(requestId)
      if (!calls) {
        calls = new Map()
        this.pending.set(requestId, calls)
      }
      calls.set(toolUseId, { resolve, scope })
    })
  }

  respond(requestId: string, toolUseId: string, decision: ApprovalDecision, remember = false): boolean {
    const calls = this.pending.get(requestId)
    const entry = calls?.get(toolUseId)
    if (!calls || !entry) return false
    calls.delete(toolUseId)
    if (!calls.size) this.pending.delete(requestId)
    if (decision === 'allow' && remember) this.remembered.add(entry.scope)
    entry.resolve(decision)
    return true
  }

  /** Denies everything still waiting for a run that is being cancelled. */
  cancel(requestId: string): void {
    const calls = this.pending.get(requestId)
    if (!calls) return
    this.pending.delete(requestId)
    for (const entry of calls.values()) entry.resolve('deny')
  }

  /** True while the renderer still owes an answer; used by tests. */
  hasPending(requestId: string): boolean {
    return (this.pending.get(requestId)?.size ?? 0) > 0
  }

  /** Forgets remembered scopes; called when the run set empties. */
  reset(): void {
    this.remembered.clear()
  }
}
