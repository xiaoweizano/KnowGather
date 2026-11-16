import { describe, expect, it } from "vitest"
import { IPC_CHANNELS } from "../src/shared/api"

describe("Shizhi API v2 IPC channels", () => {
  it("exposes category and journal CRUD channels", () => {
    expect(IPC_CHANNELS).toMatchObject({
      categoriesList: "shizhi:categories:list",
      categoriesSave: "shizhi:categories:save",
      categoriesRemove: "shizhi:categories:remove",
      journalsList: "shizhi:journals:list",
      journalsGet: "shizhi:journals:get",
      journalsSave: "shizhi:journals:save",
      journalsRemove: "shizhi:journals:remove",
    })
  })
})
