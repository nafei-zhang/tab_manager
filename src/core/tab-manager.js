import { estimateTabMemoryMb, fuzzyMatch, getDomain, normalizeUrl } from "./url-utils.js"

export function detectDuplicateGroups(tabs, duplicateRules) {
  const buckets = new Map()
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url, duplicateRules)
    if (!buckets.has(key)) {
      buckets.set(key, [])
    }
    buckets.get(key).push(tab)
  }

  const groups = []
  for (const [normalizedUrl, list] of buckets.entries()) {
    if (list.length > 1) {
      const sorted = [...list].sort((a, b) => a.id - b.id)
      groups.push({
        normalizedUrl,
        keepTabId: sorted[0].id,
        duplicates: sorted.slice(1),
        allTabs: sorted
      })
    }
  }
  return groups
}

export function buildGroupedTabs(tabs) {
  const map = new Map()

  for (const tab of tabs) {
    const domain = getDomain(tab.url)
    if (!map.has(domain)) {
      map.set(domain, {
        domain,
        tabs: [],
        estimatedMemoryMb: 0
      })
    }
    const entry = map.get(domain)
    entry.tabs.push(tab)
    entry.estimatedMemoryMb += estimateTabMemoryMb(tab)
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      tabCount: group.tabs.length,
      estimatedMemoryMb: Math.round(group.estimatedMemoryMb * 10) / 10
    }))
    .sort((a, b) => b.tabCount - a.tabCount)
}

export function searchTabs(tabs, query, mode = "normal") {
  if (!query) {
    return tabs
  }

  if (mode === "regex") {
    let regex
    try {
      regex = new RegExp(query, "i")
    } catch {
      return []
    }
    return tabs.filter((tab) => regex.test(tab.title || "") || regex.test(tab.url || "") || regex.test(getDomain(tab.url || "")))
  }

  if (mode === "fuzzy") {
    return tabs.filter((tab) => {
      const domain = getDomain(tab.url || "")
      return fuzzyMatch(tab.title || "", query) || fuzzyMatch(tab.url || "", query) || fuzzyMatch(domain, query)
    })
  }

  const q = query.toLowerCase()
  return tabs.filter((tab) => {
    const title = (tab.title || "").toLowerCase()
    const url = (tab.url || "").toLowerCase()
    const domain = getDomain(tab.url || "").toLowerCase()
    return title.includes(q) || url.includes(q) || domain.includes(q)
  })
}
