import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentSavePayload } from '../src/shared/document'
import { AutoSaveController } from '../src/renderer/src/services/autosave'

function payload(revision: number): DocumentSavePayload {
  return {
    id: 'doc-1',
    title: '测试文档',
    tags: [],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    revision,
    version: 1,
  }
}

describe('AutoSaveController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rapid edits and only saves the latest revision', async () => {
    const save = vi.fn(async (input: DocumentSavePayload) => ({
      revision: input.revision,
      version: 2,
      savedAt: '2026-11-11T00:00:00.000Z',
    }))
    const controller = new AutoSaveController({ delay: 800, save })

    controller.schedule(payload(1))
    await vi.advanceTimersByTimeAsync(300)
    controller.schedule(payload(2))
    await vi.advanceTimersByTimeAsync(799)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].revision).toBe(2)
    expect(controller.snapshot.phase).toBe('saved')
    expect(controller.snapshot.savedRevision).toBe(2)
  })

  it('reports failure and retries the same pending payload', async () => {
    const save = vi
      .fn<(_input: DocumentSavePayload) => Promise<{ revision: number; version: number; savedAt: string }>>()
      .mockRejectedValueOnce(new Error('磁盘不可写'))
      .mockImplementationOnce(async (input) => ({
        revision: input.revision,
        version: 2,
        savedAt: '2026-11-11T00:00:00.000Z',
      }))
    const states: string[] = []
    const controller = new AutoSaveController({
      delay: 500,
      save,
      onStateChange: (state) => states.push(state.phase),
    })

    controller.schedule(payload(7))
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.snapshot.phase).toBe('error')
    expect(controller.snapshot.error).toBe('磁盘不可写')

    await expect(controller.retry()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[0].revision).toBe(7)
    expect(controller.snapshot.phase).toBe('saved')
    expect(states).toContain('dirty')
    expect(states).toContain('saving')
    expect(states).toContain('error')
    expect(states).toContain('saved')
  })

  it('serializes overlapping saves and lets the newest revision win', async () => {
    const requests: Array<{
      input: DocumentSavePayload
      resolve: (receipt: { revision: number; version: number; savedAt: string }) => void
    }> = []
    const save = vi.fn((input: DocumentSavePayload) => new Promise<{
      revision: number
      version: number
      savedAt: string
    }>((resolve) => requests.push({ input, resolve })))
    const controller = new AutoSaveController({ delay: 50, save })

    controller.schedule(payload(1))
    const firstFlush = controller.flush()
    expect(save).toHaveBeenCalledTimes(1)

    controller.schedule(payload(2))
    expect(controller.snapshot.phase).toBe('dirty')

    requests[0]?.resolve({ revision: 1, version: 2, savedAt: '2026-11-11T00:00:01.000Z' })
    await vi.advanceTimersByTimeAsync(0)

    expect(save).toHaveBeenCalledTimes(2)
    expect(requests[1]?.input.revision).toBe(2)
    requests[1]?.resolve({ revision: 2, version: 2, savedAt: '2026-11-11T00:00:02.000Z' })

    await expect(firstFlush).resolves.toBe(true)
    expect(controller.snapshot.savedRevision).toBe(2)
    expect(controller.snapshot.phase).toBe('saved')
  })
})
