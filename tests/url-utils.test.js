import { describe, expect, it } from "vitest"
import { estimateTabMemoryMb, fuzzyMatch, getDefaultRules, getDomain, normalizeUrl } from "../src/core/url-utils.js"

describe("url-utils", () => {
  it("按规则标准化URL", () => {
    const input = "https://www.Example.com/path?a=1#top"
    const out = normalizeUrl(input, {
      ignoreQuery: true,
      ignoreHash: true,
      ignoreProtocol: false,
      ignoreWww: true,
      lowercasePath: false
    })
    expect(out).toBe("https://example.com/path")
  })

  it("提取域名", () => {
    expect(getDomain("https://news.ycombinator.com/item?id=1")).toBe("news.ycombinator.com")
    expect(getDomain("not-a-url")).toBe("unknown")
  })

  it("估算内存为可计算数值", () => {
    const memory = estimateTabMemoryMb({ title: "a".repeat(20), url: "https://example.com", active: true })
    expect(memory).toBeGreaterThan(8)
    expect(memory).toBeLessThan(20)
  })

  it("支持模糊匹配", () => {
    expect(fuzzyMatch("github", "gth")).toBe(true)
    expect(fuzzyMatch("github", "gzb")).toBe(false)
    expect(fuzzyMatch("github", "")).toBe(true)
  })

  it("处理非法URL与默认规则", () => {
    expect(getDefaultRules().ignoreHash).toBe(true)
    expect(normalizeUrl("", getDefaultRules())).toBe("")
    expect(normalizeUrl("not-a-url", getDefaultRules())).toBe("not-a-url")
  })
})
