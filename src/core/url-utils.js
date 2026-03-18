const DEFAULT_RULES = {
  ignoreQuery: false,
  ignoreHash: true,
  ignoreProtocol: false,
  ignoreWww: false,
  lowercasePath: false
}

export function getDefaultRules() {
  return { ...DEFAULT_RULES }
}

export function normalizeUrl(rawUrl, rules = DEFAULT_RULES) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return ""
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl.trim()
  }

  const protocol = rules.ignoreProtocol ? "" : parsed.protocol
  const hostname = rules.ignoreWww ? parsed.hostname.replace(/^www\./i, "") : parsed.hostname
  const pathname = rules.lowercasePath ? parsed.pathname.toLowerCase() : parsed.pathname
  const search = rules.ignoreQuery ? "" : parsed.search
  const hash = rules.ignoreHash ? "" : parsed.hash

  return `${protocol}//${hostname}${pathname}${search}${hash}`
}

export function getDomain(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return url.hostname || "unknown"
  } catch {
    return "unknown"
  }
}

export function estimateTabMemoryMb(tab) {
  const titleLength = tab.title?.length ?? 0
  const urlLength = tab.url?.length ?? 0
  const weight = titleLength * 0.02 + urlLength * 0.01
  const base = 7
  const activeBoost = tab.active ? 2 : 0
  return Math.round((base + weight + activeBoost) * 10) / 10
}

export function fuzzyMatch(source, query) {
  if (!query) {
    return true
  }
  let i = 0
  let j = 0
  const a = source.toLowerCase()
  const b = query.toLowerCase()
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      j += 1
    }
    i += 1
  }
  return j === b.length
}
