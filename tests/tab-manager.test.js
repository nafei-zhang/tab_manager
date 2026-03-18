import { describe, expect, it } from "vitest"
import { buildGroupedTabs, detectDuplicateGroups, searchTabs } from "../src/core/tab-manager.js"

const tabs = [
  { id: 1, title: "Google", url: "https://google.com" },
  { id: 2, title: "Google 2", url: "https://google.com#hash" },
  { id: 3, title: "Docs", url: "https://docs.example.com/a?x=1" },
  { id: 4, title: "Docs copy", url: "https://docs.example.com/a?x=2" }
]

describe("tab-manager", () => {
  it("检测重复标签并保留最早tab", () => {
    const groups = detectDuplicateGroups(tabs, {
      ignoreQuery: false,
      ignoreHash: true,
      ignoreProtocol: false,
      ignoreWww: false,
      lowercasePath: false
    })
    expect(groups.length).toBe(1)
    expect(groups[0].keepTabId).toBe(1)
    expect(groups[0].duplicates[0].id).toBe(2)
  })

  it("可按域名分组并统计数量", () => {
    const grouped = buildGroupedTabs(tabs)
    expect(grouped[0].tabCount).toBeGreaterThanOrEqual(2)
    expect(grouped.map((g) => g.domain)).toContain("google.com")
  })

  it("支持普通搜索/模糊搜索/正则搜索", () => {
    expect(searchTabs(tabs, "docs", "normal").length).toBe(2)
    expect(searchTabs(tabs, "dcs", "fuzzy").length).toBeGreaterThan(0)
    expect(searchTabs(tabs, "^Google", "regex").length).toBe(2)
    expect(searchTabs(tabs, "(", "regex").length).toBe(0)
    expect(searchTabs(tabs, "", "normal").length).toBe(tabs.length)
  })
})
