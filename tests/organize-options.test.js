import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  IGNORE_WORKSPACE_TEMP_KEYS,
  buildOrganizePreferenceChange,
  createChromeGroupOrganizePlan,
  pickTabsForDomainGrouping,
  resolveIgnoreWorkspaceState,
  shouldSkipWorkspaceGroupDetection
} from "../src/core/organize-options.js"

describe("organize-options", () => {
  it("覆盖主复选框/子复选框四种组合状态", () => {
    const c1 = resolveIgnoreWorkspaceState(false, false)
    expect(c1.ignoreWorkspaceEnabled).toBe(false)
    expect(c1.ignoreWorkspaceChecked).toBe(false)

    const c2 = resolveIgnoreWorkspaceState(false, true)
    expect(c2.ignoreWorkspaceEnabled).toBe(false)
    expect(c2.ignoreWorkspaceChecked).toBe(false)

    const c3 = resolveIgnoreWorkspaceState(true, false)
    expect(c3.ignoreWorkspaceEnabled).toBe(true)
    expect(c3.ignoreWorkspaceChecked).toBe(false)

    const c4 = resolveIgnoreWorkspaceState(true, true)
    expect(c4.ignoreWorkspaceEnabled).toBe(true)
    expect(c4.ignoreWorkspaceChecked).toBe(true)
  })

  it("主复选框取消时需要触发临时配置清空", () => {
    const change = buildOrganizePreferenceChange(false, true)
    expect(change.userPrefs).toEqual({
      cbGroup: false,
      cbIgnoreWorkspace: false
    })
    expect(change.shouldClearIgnoreWorkspaceTemp).toBe(true)
    expect(IGNORE_WORKSPACE_TEMP_KEYS.length).toBeGreaterThan(0)
  })

  it("分支判断：只有 group+ignore 同时勾选才跳过 workspace group 检测", () => {
    expect(shouldSkipWorkspaceGroupDetection(false, false)).toBe(false)
    expect(shouldSkipWorkspaceGroupDetection(false, true)).toBe(false)
    expect(shouldSkipWorkspaceGroupDetection(true, false)).toBe(false)
    expect(shouldSkipWorkspaceGroupDetection(true, true)).toBe(true)
  })

  it("20+ 标签且存在 3 个已命名 group 时，ignore 开启会跳过检测并一次性纳入处理", () => {
    const tabs = []
    for (let i = 0; i < 23; i += 1) {
      let groupId = -1
      if (i < 7) {
        groupId = 1001
      } else if (i < 14) {
        groupId = 1002
      } else if (i < 20) {
        groupId = 1003
      }
      tabs.push({
        id: i + 1,
        groupId
      })
    }

    const normalPlan = createChromeGroupOrganizePlan(tabs, { ignoreWorkspace: false })
    expect(normalPlan.skipWorkspaceGroupDetection).toBe(false)
    expect(normalPlan.workspaceGroupCount).toBe(3)
    expect(normalPlan.processedTabCount).toBe(23)

    const ignorePlan = createChromeGroupOrganizePlan(tabs, { ignoreWorkspace: true })
    expect(ignorePlan.skipWorkspaceGroupDetection).toBe(true)
    expect(ignorePlan.workspaceGroupCount).toBe(0)
    expect(ignorePlan.processedTabCount).toBe(23)
  })

  it("ignore 开启时不处理 workspace 已打开 group 内标签", () => {
    const tabs = [
      { id: 1, groupId: 1001 },
      { id: 2, groupId: -1 },
      { id: 3, groupId: 1002 },
      { id: 4, groupId: -1 }
    ]
    const included = pickTabsForDomainGrouping(tabs, { ignoreWorkspace: true })
    expect(included.map((tab) => tab.id)).toEqual([2, 4])
  })

  it("UI 文案替换后保留原按钮 ID", () => {
    const filePath = path.resolve("src/popup/popup.html")
    const html = fs.readFileSync(filePath, "utf8")
    expect(html.includes('id="organizeDomainBtn"')).toBe(true)
    expect(html.includes(">Organize<")).toBe(true)
    expect(html.includes('id="ungroupDomainBtn"')).toBe(true)
    expect(html.includes(">Ungroup ig WS<")).toBe(true)
  })
})
