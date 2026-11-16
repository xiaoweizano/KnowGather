import { describe, expect, it } from "vitest"
import { BrowserDocumentRepository } from "../src/renderer/src/services/documentRepository"

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const content = { type: "doc" as const, content: [{ type: "paragraph" }] }

describe("browser knowledge repository", () => {
  it("persists v2 documents, categories and journals", async () => {
    const target = storage()
    const repository = new BrowserDocumentRepository(target)
    const category = await repository.saveCategory({ name: "工作" })
    await repository.save({ id: "doc-1", title: "文档", categoryId: category.id, tags: [], content, revision: 0, version: 1 })
    await repository.saveJournal({ id: "journal-1", title: "日志", categoryId: category.id, content, revision: 0, version: 1 })

    const reloaded = new BrowserDocumentRepository(target)
    expect(await reloaded.listCategories()).toEqual([expect.objectContaining({ id: category.id, name: "工作" })])
    expect((await reloaded.get("doc-1"))?.categoryId).toBe(category.id)
    expect(await reloaded.listJournals()).toEqual([expect.objectContaining({ id: "journal-1", title: "日志" })])
  })

  it("fails loudly instead of silently discarding corrupt data", async () => {
    const target = storage()
    target.setItem("shizhi.knowledge.v2", "{broken")
    const repository = new BrowserDocumentRepository(target)
    await expect(repository.list()).rejects.toThrow(/JSON/i)
  })
})
