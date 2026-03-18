import { describe, expect, it } from "vitest"
import {
  addWorkspace,
  appendTabToWorkspace,
  createWorkspaceRecord,
  deleteWorkspaceById,
  deserializeWorkspaces,
  loadWorkspaces,
  removeWorkspaceTabByIndex,
  sanitizeWorkspaceName,
  saveWorkspaces,
  serializeWorkspaces
} from "../src/core/workspace-store.js"

describe("workspace-store", () => {
  it("创建工作区记录并裁剪名称", () => {
    const record = createWorkspaceRecord("  我的工作区  ", [{ title: "A", url: "https://a.com", pinned: true }])
    expect(record.name).toBe("我的工作区")
    expect(record.tabs[0].pinned).toBe(true)
    expect(record.id).toBeTruthy()
  })

  it("空名称时生成默认名称并补全字段", () => {
    const record = createWorkspaceRecord("", [{ pinned: false }])
    expect(record.name.startsWith("workspace-")).toBe(true)
    expect(record.tabs[0].title).toBe("")
    expect(record.tabs[0].url).toBe("")
  })

  it("处理空名称", () => {
    const name = sanitizeWorkspaceName(" ")
    expect(name).toBe("")
  })

  it("支持序列化与反序列化", () => {
    const raw = serializeWorkspaces([{ id: "1", name: "w", createdAt: 1, tabs: [] }])
    const list = deserializeWorkspaces(raw)
    expect(list[0].id).toBe("1")
  })

  it("反序列化非法数据时报错", () => {
    expect(() => deserializeWorkspaces("{}")).toThrowError()
  })

  it("支持读写与增删工作区", async () => {
    const data = {}
    const storage = {
      local: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (payload) => {
          Object.assign(data, payload)
        }
      }
    }

    await saveWorkspaces(storage, [])
    expect(await loadWorkspaces(storage)).toEqual([])
    data.savedWorkspaces = {}
    expect(await loadWorkspaces(storage)).toEqual([])

    const ws = createWorkspaceRecord("w1", [{ title: "A", url: "https://a.com", pinned: false }])
    const afterAdd = await addWorkspace(storage, ws)
    expect(afterAdd.length).toBe(1)

    const afterDelete = await deleteWorkspaceById(storage, ws.id)
    expect(afterDelete.length).toBe(0)
  })

  it("支持删除工作区中的单条记录", async () => {
    const data = {}
    const storage = {
      local: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (payload) => {
          Object.assign(data, payload)
        }
      }
    }

    data.savedWorkspaces = [
      {
        id: "w1",
        name: "w1",
        createdAt: 1,
        tabs: [
          { title: "A", url: "https://a.com", pinned: false },
          { title: "B", url: "https://b.com", pinned: false }
        ]
      }
    ]

    const afterRemove = await removeWorkspaceTabByIndex(storage, "w1", 0)
    expect(afterRemove.removed).toBe(true)
    expect(afterRemove.workspaces[0].tabs.length).toBe(1)
    expect(afterRemove.workspaces[0].tabs[0].title).toBe("B")
  })

  it("索引失效时支持按 URL 回退删除", async () => {
    const data = {}
    const storage = {
      local: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (payload) => {
          Object.assign(data, payload)
        }
      }
    }

    data.savedWorkspaces = [
      {
        id: "w1",
        name: "w1",
        createdAt: 1,
        tabs: [{ title: "A", url: "https://a.com", pinned: false }]
      }
    ]

    const afterRemove = await removeWorkspaceTabByIndex(storage, "w1", 9, "https://a.com")
    expect(afterRemove.removed).toBe(true)
    expect(afterRemove.workspaces[0].tabs.length).toBe(0)
  })

  it("支持向工作区追加标签", async () => {
    const data = {}
    const storage = {
      local: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (payload) => {
          Object.assign(data, payload)
        }
      }
    }

    data.savedWorkspaces = [
      {
        id: "w1",
        name: "w1",
        createdAt: 1,
        tabs: [{ title: "A", url: "https://a.com", pinned: false }]
      }
    ]

    const result = await appendTabToWorkspace(storage, "w1", {
      title: "B",
      url: "https://b.com",
      pinned: true
    })
    expect(result.added).toBe(true)
    expect(result.workspaces[0].tabs.length).toBe(2)
    expect(result.workspaces[0].tabs[1]).toEqual({
      title: "B",
      url: "https://b.com",
      pinned: true
    })
  })
})
