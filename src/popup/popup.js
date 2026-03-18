import { searchTabs } from "../core/tab-manager.js"
import { getDomain } from "../core/url-utils.js"

const ext = globalThis.browser ?? globalThis.chrome

const state = {
  snapshot: {
    tabs: [],
    groupedTabs: [],
    duplicateGroups: [],
    duplicateCount: 0,
    duplicateRules: {}
  },
  workspaces: [],
  workspaceExpandedIds: new Set(),
  workspaceExpandInitialized: false,
  searchQuery: "",
  searchMode: "normal",
  expandedGroups: new Set()
}

const $ = (id) => document.getElementById(id)

function setStatus(message) {
  $("statusText").textContent = message
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function highlightText(rawText, query, mode) {
  const text = rawText || ""
  if (!query) {
    return escapeHtml(text)
  }

  if (mode === "regex") {
    try {
      const regex = new RegExp(query, "ig")
      return escapeHtml(text).replace(regex, (segment) => `<mark>${segment}</mark>`)
    } catch {
      return escapeHtml(text)
    }
  }

  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const index = lower.indexOf(q)
  if (index === -1 || mode === "fuzzy") {
    return escapeHtml(text)
  }
  const head = escapeHtml(text.slice(0, index))
  const center = escapeHtml(text.slice(index, index + q.length))
  const tail = escapeHtml(text.slice(index + q.length))
  return `${head}<mark>${center}</mark>${tail}`
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    ext.runtime.sendMessage(payload, (response) => {
      if (ext.runtime.lastError) {
        reject(new Error(ext.runtime.lastError.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Operation failed"))
        return
      }
      resolve(response.data)
    })
  })
}

async function refreshSnapshot() {
  const data = await sendMessage({ type: "GET_TAB_SNAPSHOT" })
  state.snapshot = data
  state.expandedGroups = new Set(data.groupedTabs.slice(0, 3).map((group) => group.domain))
  $("duplicateSummary").textContent = `Duplicate tabs: ${data.duplicateCount}`
  $("ignoreQuery").checked = Boolean(data.duplicateRules.ignoreQuery)
  $("ignoreHash").checked = Boolean(data.duplicateRules.ignoreHash)
  $("ignoreProtocol").checked = Boolean(data.duplicateRules.ignoreProtocol)
  $("ignoreWww").checked = Boolean(data.duplicateRules.ignoreWww)
  renderGroups()
  renderSearchResults()
}

async function refreshWorkspaces() {
  state.workspaces = await sendMessage({ type: "LIST_WORKSPACES" })
  if (!state.workspaceExpandInitialized) {
    state.workspaceExpandedIds = new Set(state.workspaces.map((workspace) => workspace.id))
    state.workspaceExpandInitialized = true
  } else {
    const validIds = new Set(state.workspaces.map((workspace) => workspace.id))
    state.workspaceExpandedIds = new Set([...state.workspaceExpandedIds].filter((id) => validIds.has(id)))
    for (const workspace of state.workspaces) {
      if (!state.workspaceExpandedIds.has(workspace.id)) {
        state.workspaceExpandedIds.add(workspace.id)
      }
    }
  }
  renderWorkspaces()
}

function renderGroups() {
  const root = $("groupContainer")
  root.innerHTML = ""
  for (const group of state.snapshot.groupedTabs) {
    const expanded = state.expandedGroups.has(group.domain)
    const card = document.createElement("article")
    card.className = "group"
    card.innerHTML = `
      <div class="group-header">
        <strong>${escapeHtml(group.domain)}</strong>
        <button class="icon-btn workspace-icon-btn" data-domain="${escapeHtml(group.domain)}" title="${expanded ? "Collapse" : "Expand"}">${expanded ? "▴" : "▾"}</button>
      </div>
      <div class="group-meta">Tabs ${group.tabCount} | Estimated memory ${group.estimatedMemoryMb} MB</div>
      <div class="tab-list" style="display:${expanded ? "flex" : "none"};">
        ${group.tabs
          .slice(0, 12)
          .map(
            (tab) => `
            <div class="item">
              <div class="search-item-header">
                <div class="tab-title">${escapeHtml(tab.title || "Untitled")}</div>
                <div class="search-actions">
                  <button class="icon-btn group-tab-action" data-action="activate" data-tab-id="${tab.id}" title="Switch to this tab">↗</button>
                  <button class="icon-btn group-tab-action" data-action="close" data-tab-id="${tab.id}" title="Close this tab">✕</button>
                </div>
              </div>
              <div class="tab-url">${escapeHtml(tab.url || "")}</div>
            </div>`
          )
          .join("")}
      </div>
    `
    root.appendChild(card)
  }

  root.querySelectorAll("button[data-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.getAttribute("data-domain")
      if (!domain) {
        return
      }
      if (state.expandedGroups.has(domain)) {
        state.expandedGroups.delete(domain)
      } else {
        state.expandedGroups.add(domain)
      }
      renderGroups()
    })
  })

  root.querySelectorAll("button.group-tab-action[data-action][data-tab-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const action = button.getAttribute("data-action")
      const tabId = Number(button.getAttribute("data-tab-id"))
      if (!Number.isFinite(tabId)) {
        return
      }
      try {
        if (action === "activate") {
          await activateSearchTab(tabId)
        } else if (action === "close") {
          await closeSearchTab(tabId)
        }
      } catch (error) {
        setStatus(error.message)
      }
    })
  })
}

function renderSearchResults() {
  const root = $("searchResults")
  const results = searchTabs(state.snapshot.tabs, state.searchQuery, state.searchMode).slice(0, 120)
  root.innerHTML = results
    .map(
      (tab) => `
      <article class="item" data-tab-id="${tab.id}">
        <div class="search-item-header">
          <div class="tab-title">${highlightText(tab.title || "Untitled", state.searchQuery, state.searchMode)}</div>
          <div class="search-actions">
            <button class="icon-btn" data-action="activate" data-tab-id="${tab.id}" title="Switch to this tab">↗</button>
            <button class="icon-btn" data-action="close" data-tab-id="${tab.id}" title="Close this tab">✕</button>
          </div>
        </div>
        <div class="tab-url">${highlightText(tab.url || "", state.searchQuery, state.searchMode)}</div>
      </article>
    `
    )
    .join("")

  root.querySelectorAll("button.icon-btn[data-action][data-tab-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const action = button.getAttribute("data-action")
      const tabId = Number(button.getAttribute("data-tab-id"))
      if (!Number.isFinite(tabId)) {
        return
      }
      try {
        if (action === "activate") {
          await activateSearchTab(tabId)
        } else if (action === "close") {
          await closeSearchTab(tabId)
        }
      } catch (error) {
        setStatus(error.message)
      }
    })
  })
}

async function activateSearchTab(tabId) {
  const tab = state.snapshot.tabs.find((item) => item.id === tabId)
  if (!tab) {
    return
  }
  await ext.tabs.update(tabId, { active: true })
  const windowId = Number.isFinite(tab.windowId) ? tab.windowId : null
  if (Number.isFinite(windowId) && ext.windows?.update) {
    await ext.windows.update(windowId, { focused: true })
  }
  setStatus("Switched to target tab")
}

async function closeSearchTab(tabId) {
  await ext.tabs.remove(tabId)
  await refreshSnapshot()
  setStatus("Closed current tab")
}

function compareTabsByDomain(a, b) {
  const domainA = getDomain(a.url || "")
  const domainB = getDomain(b.url || "")
  if (domainA !== domainB) {
    return domainA.localeCompare(domainB)
  }
  const urlA = a.url || ""
  const urlB = b.url || ""
  if (urlA !== urlB) {
    return urlA.localeCompare(urlB)
  }
  return (a.title || "").localeCompare(b.title || "")
}

async function organizeTabsByDomainFallback() {
  const tabs = await ext.tabs.query({})
  const windows = new Map()
  for (const tab of tabs) {
    if (!windows.has(tab.windowId)) {
      windows.set(tab.windowId, [])
    }
    windows.get(tab.windowId).push(tab)
  }

  let movedCount = 0
  let affectedWindows = 0

  for (const [, list] of windows) {
    const ordered = [...list].sort((a, b) => a.index - b.index)
    const pinned = ordered.filter((tab) => Boolean(tab.pinned)).sort(compareTabsByDomain)
    const normal = ordered.filter((tab) => !tab.pinned).sort(compareTabsByDomain)
    const desiredIds = [...pinned, ...normal].map((tab) => tab.id)
    const currentIds = ordered.map((tab) => tab.id)
    const changed = desiredIds.some((id, idx) => id !== currentIds[idx])
    if (!changed) {
      continue
    }
    affectedWindows += 1
    for (const [targetIndex, tabId] of desiredIds.entries()) {
      await ext.tabs.move(tabId, { index: targetIndex })
      movedCount += 1
    }
  }

  return { movedCount, affectedWindows }
}

function removeWorkspaceTabFromList(workspaces, workspaceId, tabIndex, tabUrl) {
  let removed = false
  const next = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace
    }
    const tabs = Array.isArray(workspace.tabs) ? workspace.tabs : []
    if (Number.isInteger(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      removed = true
      return { ...workspace, tabs: tabs.filter((_, index) => index !== tabIndex) }
    }
    const fallbackIndex = tabs.findIndex((tab) => (tab?.url || "") === tabUrl)
    if (fallbackIndex === -1) {
      return workspace
    }
    removed = true
    return { ...workspace, tabs: tabs.filter((_, index) => index !== fallbackIndex) }
  })
  return { removed, workspaces: next }
}

async function removeWorkspaceTabWithFallback(workspaceId, tabIndex, tabUrl) {
  const workspaces = await sendMessage({ type: "LIST_WORKSPACES" })
  const result = removeWorkspaceTabFromList(workspaces, workspaceId, tabIndex, tabUrl)
  if (!result.removed) {
    return { removed: false, workspaces }
  }
  await sendMessage({
    type: "IMPORT_WORKSPACES",
    raw: JSON.stringify({ version: 1, workspaces: result.workspaces }, null, 2)
  })
  return { removed: true, workspaces: result.workspaces }
}

async function getFocusedTabForWorkspace() {
  const primary = await ext.tabs.query({ active: true, lastFocusedWindow: true })
  const current = await ext.tabs.query({ active: true, currentWindow: true })
  const tab = primary[0] || current[0] || null
  if (!tab?.url) {
    return null
  }
  return {
    title: tab.title || "",
    url: tab.url || "",
    pinned: Boolean(tab.pinned)
  }
}

async function addFocusedTabToWorkspaceWithFallback(workspaceId) {
  const focusedTab = await getFocusedTabForWorkspace()
  if (!focusedTab) {
    return { added: false }
  }
  const workspaces = await sendMessage({ type: "LIST_WORKSPACES" })
  let added = false
  const next = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace
    }
    const tabs = Array.isArray(workspace.tabs) ? workspace.tabs : []
    added = true
    return {
      ...workspace,
      tabs: [focusedTab, ...tabs]
    }
  })
  if (!added) {
    return { added: false }
  }
  await sendMessage({
    type: "IMPORT_WORKSPACES",
    raw: JSON.stringify({ version: 1, workspaces: next }, null, 2)
  })
  return { added: true, workspaces: next }
}

function renderWorkspaces() {
  const root = $("workspaceList")
  root.innerHTML = state.workspaces
    .map((workspace) => {
      const createdAt = new Date(workspace.createdAt).toLocaleString()
      const expanded = state.workspaceExpandedIds.has(workspace.id)
      return `
      <article class="workspace" data-id="${workspace.id}">
        <div class="workspace-header">
          <div class="workspace-title-wrap">
            <strong class="workspace-title">${escapeHtml(workspace.name)}</strong>
            <span class="group-meta">${workspace.tabs.length} tabs</span>
          </div>
          <div class="workspace-actions">
            <button class="icon-btn workspace-icon-btn" data-action="add-current-tab" data-id="${workspace.id}" title="Add focused tab to this workspace">＋</button>
            <button class="icon-btn workspace-icon-btn" data-action="toggle" data-id="${workspace.id}" title="${expanded ? "Collapse" : "Expand"}">${expanded ? "▴" : "▾"}</button>
          </div>
        </div>
        <div class="workspace-body" style="display:${expanded ? "block" : "none"};">
          <div class="group-meta workspace-date">${createdAt}</div>
          <div class="tab-list">
            ${workspace.tabs
              .slice(0, 6)
              .map(
                (tab, idx) => `
                <article class="workspace-tab-item">
                  <div class="workspace-tab-main">
                    <div class="tab-title">${escapeHtml(tab.title || "Untitled")}</div>
                    <div class="tab-url">${escapeHtml(tab.url || "")}</div>
                  </div>
                  <div class="workspace-tab-actions">
                    <button class="icon-btn workspace-icon-btn" data-action="open-tab" data-id="${workspace.id}" data-index="${idx}" title="Open this record">↗</button>
                    <button class="icon-btn workspace-icon-btn" data-action="remove-tab" data-id="${workspace.id}" data-index="${idx}" data-url="${encodeURIComponent(tab.url || "")}" title="Remove this record">✕</button>
                  </div>
                </article>
              `
              )
              .join("")}
          </div>
          <div class="row gap workspace-footer-actions">
            <button data-action="open-workspace" data-id="${workspace.id}">Restore selected</button>
            <button data-action="remove-workspace" data-id="${workspace.id}">Remove workspace</button>
          </div>
        </div>
      </article>
    `
    })
    .join("")

  root.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-action")
      const workspaceId = button.getAttribute("data-id")
      if (!workspaceId) {
        return
      }
      try {
        if (action === "toggle") {
          if (state.workspaceExpandedIds.has(workspaceId)) {
            state.workspaceExpandedIds.delete(workspaceId)
          } else {
            state.workspaceExpandedIds.add(workspaceId)
          }
          renderWorkspaces()
        } else if (action === "add-current-tab") {
          const result = await addFocusedTabToWorkspaceWithFallback(workspaceId)
          if (!result?.added) {
            setStatus("Failed to add focused tab")
            return
          }
          await refreshWorkspaces()
          setStatus("Focused tab added to workspace")
        } else if (action === "open-tab") {
          const tabIndex = Number(button.getAttribute("data-index"))
          if (!Number.isInteger(tabIndex) || tabIndex < 0) {
            return
          }
          const result = await sendMessage({
            type: "RESTORE_WORKSPACE",
            workspaceId,
            selectedIndexes: [tabIndex]
          })
          setStatus(`Opened ${result.restoredCount} record(s)`)
        } else if (action === "remove-tab") {
          const tabIndex = Number(button.getAttribute("data-index"))
          let tabUrl = ""
          try {
            tabUrl = decodeURIComponent(button.getAttribute("data-url") || "")
          } catch {
            tabUrl = button.getAttribute("data-url") || ""
          }
          if (!Number.isInteger(tabIndex) || tabIndex < 0) {
            return
          }
          const result = await removeWorkspaceTabWithFallback(workspaceId, tabIndex, tabUrl)
          if (!result?.removed) {
            setStatus("No removable record found")
            return
          }
          await refreshWorkspaces()
          await refreshSnapshot()
          setStatus("Removed record from tab list")
        } else if (action === "open-workspace") {
          const result = await sendMessage({
            type: "RESTORE_WORKSPACE",
            workspaceId
          })
          setStatus(`Restored ${result.restoredCount} tab(s)`)
        } else if (action === "remove-workspace") {
          await sendMessage({ type: "DELETE_WORKSPACE", workspaceId })
          await refreshWorkspaces()
          setStatus("Workspace removed")
        }
      } catch (error) {
        setStatus(error.message)
      }
    })
  })
}

function bindEvents() {
  $("refreshBtn").addEventListener("click", async () => {
    await refreshSnapshot()
    await refreshWorkspaces()
    setStatus("Data refreshed")
  })

  $("cleanDuplicateBtn").addEventListener("click", async () => {
    const result = await sendMessage({ type: "CLOSE_DUPLICATES" })
    await refreshSnapshot()
    setStatus(`Closed ${result.closedCount} duplicate tab(s)`)
  })

  $("organizeDomainBtn").addEventListener("click", async () => {
    try {
      const result = await organizeTabsByDomainFallback()
      await refreshSnapshot()
      setStatus(`Organized by domain: ${result.affectedWindows} window(s), ${result.movedCount} tab move(s)`)
    } catch (error) {
      setStatus(error.message || "Organize failed")
    }
  })

  ;["ignoreQuery", "ignoreHash", "ignoreProtocol", "ignoreWww"].forEach((id) => {
    $(id).addEventListener("change", async () => {
      await sendMessage({
        type: "SET_DUPLICATE_RULES",
        payload: {
          ignoreQuery: $("ignoreQuery").checked,
          ignoreHash: $("ignoreHash").checked,
          ignoreProtocol: $("ignoreProtocol").checked,
          ignoreWww: $("ignoreWww").checked
        }
      })
      await refreshSnapshot()
      setStatus("Duplicate rules updated")
    })
  })

  $("searchInput").addEventListener("input", () => {
    state.searchQuery = $("searchInput").value.trim()
    renderSearchResults()
  })

  $("searchMode").addEventListener("change", () => {
    state.searchMode = $("searchMode").value
    renderSearchResults()
  })

  $("saveWorkspaceBtn").addEventListener("click", async () => {
    const name = $("workspaceName").value.trim()
    const result = await sendMessage({ type: "SAVE_WORKSPACE", name })
    state.workspaces = result.workspaces
    renderWorkspaces()
    $("workspaceName").value = ""
    setStatus(`Workspace saved: ${result.workspace.name}`)
  })

  $("exportWorkspaceBtn").addEventListener("click", async () => {
    const json = await sendMessage({ type: "EXPORT_WORKSPACES" })
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `workspaces-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus("Workspace exported")
  })

  $("importWorkspaceInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const raw = await file.text()
    await sendMessage({ type: "IMPORT_WORKSPACES", raw })
    await refreshWorkspaces()
    setStatus("Workspace imported")
  })
}

async function bootstrap() {
  try {
    bindEvents()
    await refreshSnapshot()
    await refreshWorkspaces()
    setStatus("Ready")
  } catch (error) {
    setStatus(error.message)
  }
}

bootstrap()
