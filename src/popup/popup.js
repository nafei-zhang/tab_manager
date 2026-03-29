import { searchTabs } from "../core/tab-manager.js"
import { getDomain } from "../core/url-utils.js"
import {
  IGNORE_WORKSPACE_TEMP_KEYS,
  USER_PREFS_KEY,
  createChromeGroupOrganizePlan,
  pickTabsForDomainGrouping,
  resolveIgnoreWorkspaceState,
  shouldSkipWorkspaceGroupDetection
} from "../core/organize-options.js"

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
  workspaceOpenTabIds: new Map(),
  workspaceExpandedIds: new Set(),
  workspaceExpandInitialized: false,
  searchQuery: "",
  searchMode: "normal",
  expandedGroups: new Set(),
  activePanel: "overview",
  organizePrefs: {
    cbGroup: false,
    cbIgnoreWorkspace: false
  }
}

const $ = (id) => document.getElementById(id)

function setStatus(message) {
  $("statusText").textContent = message
}

function syncPanelHeightWithOverview() {
  const app = document.querySelector(".app")
  const overviewPanel = document.querySelector('.panel[data-panel-content="overview"]')
  if (!app || !overviewPanel) {
    return
  }
  const previousStyle = overviewPanel.getAttribute("style") || ""
  const active = overviewPanel.classList.contains("is-active")
  if (!active) {
    overviewPanel.style.display = "flex"
    overviewPanel.style.visibility = "hidden"
    overviewPanel.style.position = "absolute"
    overviewPanel.style.inset = "0"
    overviewPanel.style.pointerEvents = "none"
  }
  const panelHeight = Math.ceil(overviewPanel.scrollHeight)
  if (!active) {
    if (previousStyle) {
      overviewPanel.setAttribute("style", previousStyle)
    } else {
      overviewPanel.removeAttribute("style")
    }
  }
  if (panelHeight > 0) {
    app.style.setProperty("--panel-fixed-height", `${panelHeight}px`)
  }
}

function syncFillPanelsToViewport() {
  const app = document.querySelector(".app")
  const header = document.querySelector(".header")
  const tabs = document.querySelector(".main-tabs")
  const status = $("statusText")
  if (!app || !header || !tabs || !status) {
    return
  }
  const appStyle = globalThis.getComputedStyle(app)
  const gap = Number.parseFloat(appStyle.gap || "0") || 0
  const paddingTop = Number.parseFloat(appStyle.paddingTop || "0") || 0
  const paddingBottom = Number.parseFloat(appStyle.paddingBottom || "0") || 0
  const occupiedHeight = header.offsetHeight + tabs.offsetHeight + status.offsetHeight + gap * 3 + paddingTop + paddingBottom
  const availableHeight = Math.floor(globalThis.innerHeight - occupiedHeight)
  if (availableHeight > 0) {
    app.style.setProperty("--panel-fill-height", `${availableHeight}px`)
  }
}

function renderMainPanels() {
  document.querySelectorAll(".main-tab-btn[data-panel-target]").forEach((button) => {
    const target = button.getAttribute("data-panel-target")
    const active = target === state.activePanel
    button.classList.toggle("active", active)
  })
  document.querySelectorAll(".panel[data-panel-content]").forEach((panel) => {
    const panelName = panel.getAttribute("data-panel-content")
    const active = panelName === state.activePanel
    panel.classList.toggle("is-active", active)
  })
  syncFillPanelsToViewport()
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

function getStorageLocal() {
  return ext.storage?.local ?? null
}

function getGroupCheckbox() {
  return $("cbGroup") || $("organizeDomainGroupOpen")
}

function getIgnoreWorkspaceCheckbox() {
  return $("cbIgnoreWorkspace")
}

function applyOrganizeControlState(controlState) {
  const groupInput = getGroupCheckbox()
  const ignoreInput = getIgnoreWorkspaceCheckbox()
  if (groupInput) {
    groupInput.checked = Boolean(controlState.groupChecked)
  }
  if (ignoreInput) {
    ignoreInput.disabled = !controlState.ignoreWorkspaceEnabled
    ignoreInput.checked = Boolean(controlState.ignoreWorkspaceChecked)
  }
  state.organizePrefs = {
    cbGroup: Boolean(controlState.groupChecked),
    cbIgnoreWorkspace: Boolean(controlState.ignoreWorkspaceChecked)
  }
}

async function readUserPrefs() {
  const storageLocal = getStorageLocal()
  if (!storageLocal?.get) {
    return {}
  }
  const payload = await storageLocal.get(USER_PREFS_KEY)
  const prefs = payload?.[USER_PREFS_KEY]
  if (!prefs || typeof prefs !== "object") {
    return {}
  }
  return prefs
}

async function writeUserPrefs(partial) {
  const storageLocal = getStorageLocal()
  if (!storageLocal?.set) {
    return
  }
  const current = await readUserPrefs()
  await storageLocal.set({
    [USER_PREFS_KEY]: {
      ...current,
      ...partial
    }
  })
}

async function clearIgnoreWorkspaceTemporaryState() {
  state.organizePrefs.cbIgnoreWorkspace = false
  const storageLocal = getStorageLocal()
  if (!storageLocal?.remove) {
    await writeUserPrefs({ cbIgnoreWorkspace: false })
    return
  }
  await storageLocal.remove(IGNORE_WORKSPACE_TEMP_KEYS)
  await writeUserPrefs({ cbIgnoreWorkspace: false })
}

async function restoreOrganizePreferences() {
  const controlState = resolveIgnoreWorkspaceState(false, false)
  applyOrganizeControlState(controlState)
  await clearIgnoreWorkspaceTemporaryState()
  await writeUserPrefs({ cbGroup: false, cbIgnoreWorkspace: false })
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
  syncPanelHeightWithOverview()
  syncFillPanelsToViewport()
}

async function refreshWorkspaces() {
  state.workspaces = await sendMessage({ type: "LIST_WORKSPACES" })
  state.workspaceOpenTabIds = await getWorkspaceOpenTabIds(state.workspaces)
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
  syncFillPanelsToViewport()
}

async function getWorkspaceOpenTabIds(workspaces) {
  const tabs = await ext.tabs.query({})
  const tabIdsByUrl = new Map()
  for (const tab of tabs) {
    const url = tab.url || ""
    if (!url) {
      continue
    }
    if (!tabIdsByUrl.has(url)) {
      tabIdsByUrl.set(url, [])
    }
    tabIdsByUrl.get(url).push(tab.id)
  }
  const index = new Map()
  for (const workspace of workspaces) {
    const urls = new Set(
      (Array.isArray(workspace.tabs) ? workspace.tabs : [])
        .map((tab) => tab?.url || "")
        .filter(Boolean)
    )
    const tabIds = []
    for (const url of urls) {
      const matched = tabIdsByUrl.get(url)
      if (matched?.length) {
        tabIds.push(...matched)
      }
    }
    index.set(workspace.id, [...new Set(tabIds)])
  }
  return index
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
        <div class="group-header-actions">
          <button class="group-domain-btn" data-action="group-domain" data-domain="${escapeHtml(group.domain)}" type="button">Group</button>
          <button class="group-domain-btn" data-action="ungroup-domain" data-domain="${escapeHtml(group.domain)}" type="button">Ungroup</button>
          <button class="icon-btn workspace-icon-btn" data-action="toggle-domain" data-domain="${escapeHtml(group.domain)}" title="${expanded ? "Collapse" : "Expand"}">${expanded ? "▴" : "▾"}</button>
        </div>
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

  root.querySelectorAll('button[data-action="toggle-domain"][data-domain]').forEach((btn) => {
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

  root.querySelectorAll('button.group-domain-btn[data-action][data-domain]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const action = button.getAttribute("data-action")
      const domain = button.getAttribute("data-domain")
      if (!domain) {
        return
      }
      try {
        if (action === "group-domain") {
          const result = await groupTabsForDomain(domain)
          await refreshSnapshot()
          setStatus(`Domain ${domain}: grouped ${result.groupedTabCount} tab(s)`)
        } else if (action === "ungroup-domain") {
          const result = await ungroupTabsForDomain(domain)
          await refreshSnapshot()
          setStatus(`Domain ${domain}: ungrouped ${result.ungroupedTabCount} tab(s)`)
        }
      } catch (error) {
        setStatus(error.message || "Domain action failed")
      }
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

async function groupTabsForDomain(domain) {
  if (typeof ext.tabs.group !== "function") {
    return { groupedTabCount: 0 }
  }
  const tabs = await ext.tabs.query({})
  const tabIds = tabs
    .filter((tab) => !tab.pinned && (getDomain(tab.url || "") || "Other") === domain)
    .map((tab) => tab.id)
  if (!tabIds.length) {
    return { groupedTabCount: 0 }
  }
  const groupId = await ext.tabs.group({ tabIds })
  if (Number.isInteger(groupId) && typeof ext.tabGroups?.update === "function") {
    await ext.tabGroups.update(groupId, {
      title: domain,
      collapsed: false
    })
  }
  return { groupedTabCount: tabIds.length }
}

async function ungroupTabsForDomain(domain) {
  if (typeof ext.tabs.ungroup !== "function") {
    return { ungroupedTabCount: 0 }
  }
  const tabs = await ext.tabs.query({})
  const tabIds = tabs
    .filter((tab) => !tab.pinned && Number.isInteger(tab.groupId) && tab.groupId >= 0 && (getDomain(tab.url || "") || "Other") === domain)
    .map((tab) => tab.id)
  if (!tabIds.length) {
    return { ungroupedTabCount: 0 }
  }
  await ext.tabs.ungroup(tabIds)
  return { ungroupedTabCount: tabIds.length }
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

function isWorkspaceGroupedTab(tab) {
  const groupId = Number(tab?.groupId)
  return Number.isInteger(groupId) && groupId >= 0
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

async function organizeTabsByDomainWithChromeGroups(options = {}) {
  const ignoreWorkspace = Boolean(options.ignoreWorkspace)
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
  let groupedDomainCount = 0
  let workspaceGroupCount = 0

  for (const [, list] of windows) {
    const ordered = [...list].sort((a, b) => a.index - b.index)
    const pinned = ordered.filter((tab) => Boolean(tab.pinned)).sort(compareTabsByDomain)
    const normalOrdered = ordered.filter((tab) => !tab.pinned)
    const ungroupedSorted = pickTabsForDomainGrouping(normalOrdered, { ignoreWorkspace }).sort(compareTabsByDomain)
    const normal = ignoreWorkspace
      ? (() => {
          const nextUngrouped = [...ungroupedSorted]
          return normalOrdered.map((tab) => {
            if (isWorkspaceGroupedTab(tab)) {
              return tab
            }
            return nextUngrouped.shift()
          })
        })()
      : ungroupedSorted
    const desiredIds = [...pinned, ...normal].map((tab) => tab.id)
    const currentIds = ordered.map((tab) => tab.id)
    const changed = desiredIds.some((id, idx) => id !== currentIds[idx])
    if (changed) {
      const groupedIds = new Set(ignoreWorkspace ? normalOrdered.filter(isWorkspaceGroupedTab).map((tab) => tab.id) : [])
      affectedWindows += 1
      for (const [targetIndex, tabId] of desiredIds.entries()) {
        if (ignoreWorkspace && groupedIds.has(tabId)) {
          continue
        }
        await ext.tabs.move(tabId, { index: targetIndex })
        movedCount += 1
      }
    }

    if (typeof ext.tabs.group !== "function") {
      continue
    }
    const organizePlan = createChromeGroupOrganizePlan(normalOrdered, { ignoreWorkspace })
    workspaceGroupCount += organizePlan.workspaceGroupCount
    const domainBuckets = new Map()
    const tabsForGrouping = ignoreWorkspace ? ungroupedSorted : normal
    for (const tab of tabsForGrouping) {
      const domain = getDomain(tab.url || "") || "Other"
      if (!domainBuckets.has(domain)) {
        domainBuckets.set(domain, [])
      }
      domainBuckets.get(domain).push(tab.id)
    }

    for (const [domain, tabIds] of domainBuckets.entries()) {
      if (!tabIds.length) {
        continue
      }
      try {
        const groupId = await ext.tabs.group({ tabIds })
        if (Number.isInteger(groupId)) {
          groupedDomainCount += 1
          if (typeof ext.tabGroups?.update === "function") {
            await ext.tabGroups.update(groupId, {
              title: domain,
              collapsed: false
            })
          }
        }
      } catch {}
    }
  }

  return {
    movedCount,
    affectedWindows,
    groupedDomainCount,
    workspaceGroupCount,
    skippedWorkspaceGroupDetection: Boolean(ignoreWorkspace)
  }
}

async function ungroupDomainOrganizedTabs() {
  if (typeof ext.tabs.ungroup !== "function") {
    return { ungroupedGroupCount: 0, ungroupedTabCount: 0 }
  }
  const tabs = await ext.tabs.query({})
  const groupedTabs = tabs.filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0)
  const groups = new Map()
  for (const tab of groupedTabs) {
    if (!groups.has(tab.groupId)) {
      groups.set(tab.groupId, [])
    }
    groups.get(tab.groupId).push(tab)
  }
  let ungroupedGroupCount = 0
  let ungroupedTabCount = 0
  for (const [groupId, groupTabs] of groups) {
    if (!groupTabs.length) {
      continue
    }
    const domains = new Set(groupTabs.map((tab) => getDomain(tab.url || "") || "Other"))
    if (domains.size !== 1) {
      continue
    }
    if (typeof ext.tabGroups?.get !== "function") {
      continue
    }
    let shouldUngroup = false
    try {
      const tabGroup = await ext.tabGroups.get(groupId)
      const title = String(tabGroup?.title || "").trim()
      shouldUngroup = title === [...domains][0]
    } catch {
      shouldUngroup = false
    }
    if (!shouldUngroup) {
      continue
    }
    const tabIds = groupTabs.map((tab) => tab.id)
    try {
      await ext.tabs.ungroup(tabIds)
      ungroupedGroupCount += 1
      ungroupedTabCount += tabIds.length
    } catch {}
  }
  return { ungroupedGroupCount, ungroupedTabCount }
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

function findWorkspaceById(workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) || null
}

function getWorkspaceRecordUrls(workspace) {
  return new Set(
    (Array.isArray(workspace?.tabs) ? workspace.tabs : [])
      .map((tab) => tab?.url || "")
      .filter(Boolean)
  )
}

async function groupWorkspaceInChrome(workspaceId) {
  const workspace = findWorkspaceById(workspaceId)
  if (!workspace || typeof ext.tabs.group !== "function") {
    return { groupedTabCount: 0, grouped: false }
  }
  const workspaceUrls = getWorkspaceRecordUrls(workspace)
  if (!workspaceUrls.size) {
    return { groupedTabCount: 0, grouped: false }
  }
  const beforeTabs = await ext.tabs.query({})
  const beforeTabsByUrl = new Map()
  for (const tab of beforeTabs) {
    const url = tab.url || ""
    if (!workspaceUrls.has(url)) {
      continue
    }
    if (!beforeTabsByUrl.has(url)) {
      beforeTabsByUrl.set(url, [])
    }
    beforeTabsByUrl.get(url).push(tab.id)
  }
  const missingIndexes = (Array.isArray(workspace.tabs) ? workspace.tabs : [])
    .map((tab, index) => ({ url: tab?.url || "", index }))
    .filter((item) => item.url && !beforeTabsByUrl.has(item.url))
    .map((item) => item.index)
  if (missingIndexes.length) {
    await sendMessage({
      type: "RESTORE_WORKSPACE",
      workspaceId,
      selectedIndexes: missingIndexes,
      groupInChrome: false
    })
  }
  const allTabs = await ext.tabs.query({})
  const tabIds = allTabs.filter((tab) => workspaceUrls.has(tab.url || "")).map((tab) => tab.id)
  if (!tabIds.length) {
    return { groupedTabCount: 0, grouped: false }
  }
  const groupId = await ext.tabs.group({ tabIds })
  const grouped = Number.isInteger(groupId)
  if (grouped && typeof ext.tabGroups?.update === "function") {
    await ext.tabGroups.update(groupId, {
      title: String(workspace.name || "").trim() || "Workspace",
      color: "blue",
      collapsed: false
    })
  }
  return {
    groupedTabCount: tabIds.length,
    grouped
  }
}

async function ungroupWorkspaceInChrome(workspaceId) {
  if (typeof ext.tabs.ungroup !== "function") {
    return { ungroupedGroupCount: 0, ungroupedTabCount: 0 }
  }
  const workspace = findWorkspaceById(workspaceId)
  if (!workspace) {
    return { ungroupedGroupCount: 0, ungroupedTabCount: 0 }
  }
  const workspaceUrls = getWorkspaceRecordUrls(workspace)
  if (!workspaceUrls.size) {
    return { ungroupedGroupCount: 0, ungroupedTabCount: 0 }
  }
  const tabs = await ext.tabs.query({})
  const groupedCandidates = tabs.filter(
    (tab) => workspaceUrls.has(tab.url || "") && Number.isInteger(tab.groupId) && tab.groupId >= 0
  )
  const tabIds = groupedCandidates.map((tab) => tab.id)
  if (!tabIds.length) {
    return { ungroupedGroupCount: 0, ungroupedTabCount: 0 }
  }
  const ungroupedGroupCount = new Set(groupedCandidates.map((tab) => tab.groupId)).size
  try {
    await ext.tabs.ungroup(tabIds)
  } catch {}
  return { ungroupedGroupCount, ungroupedTabCount: tabIds.length }
}

function renderWorkspaces() {
  const root = $("workspaceList")
  root.innerHTML = state.workspaces
    .map((workspace) => {
      const createdAt = new Date(workspace.createdAt).toLocaleString()
      const expanded = state.workspaceExpandedIds.has(workspace.id)
      const openedTabIds = state.workspaceOpenTabIds.get(workspace.id) || []
      const workspaceOpened = openedTabIds.length > 0
      return `
      <article class="workspace" data-id="${workspace.id}">
        <div class="workspace-header">
          <div class="workspace-title-wrap">
            <strong class="workspace-title">${escapeHtml(workspace.name)}</strong>
            <span class="group-meta">${workspace.tabs.length} tabs</span>
          </div>
          <div class="workspace-actions">
            <button class="workspace-mini-btn" data-action="group-workspace" data-id="${workspace.id}" type="button" ${workspaceOpened ? "" : "disabled"}>Group</button>
            <button class="workspace-mini-btn" data-action="ungroup-workspace" data-id="${workspace.id}" type="button" ${workspaceOpened ? "" : "disabled"}>Ungroup</button>
            <button class="icon-btn workspace-icon-btn" data-action="add-current-tab" data-id="${workspace.id}" title="Add focused tab to this workspace">＋</button>
            <button class="icon-btn workspace-icon-btn" data-action="toggle" data-id="${workspace.id}" title="${expanded ? "Collapse" : "Expand"}">${expanded ? "▴" : "▾"}</button>
          </div>
        </div>
        <div class="workspace-body" style="display:${expanded ? "block" : "none"};">
          <div class="group-meta workspace-date">${createdAt}</div>
          <div class="tab-list">
            ${workspace.tabs
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
            <label class="workspace-group-toggle">
              <input type="checkbox" data-role="group-open" data-id="${workspace.id}" />
              Group open
            </label>
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
          setStatus(
            result.grouped
              ? `Opened ${result.restoredCount} record(s) in a Chrome tab group`
              : `Opened ${result.restoredCount} record(s)`
          )
          await refreshWorkspaces()
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
          const workspaceCard = button.closest(".workspace")
          const groupOpenInput = workspaceCard?.querySelector('input[type="checkbox"][data-role="group-open"]')
          const groupInChrome = Boolean(groupOpenInput?.checked)
          const result = await sendMessage({
            type: "RESTORE_WORKSPACE",
            workspaceId,
            groupInChrome
          })
          setStatus(
            result.grouped
              ? `Restored ${result.restoredCount} tab(s) in a Chrome tab group`
              : `Restored ${result.restoredCount} tab(s)`
          )
          await refreshWorkspaces()
        } else if (action === "group-workspace") {
          const result = await groupWorkspaceInChrome(workspaceId)
          await refreshWorkspaces()
          await refreshSnapshot()
          setStatus(
            result.grouped
              ? `Workspace grouped ${result.groupedTabCount} tab(s)`
              : `Workspace group skipped`
          )
        } else if (action === "ungroup-workspace") {
          const result = await ungroupWorkspaceInChrome(workspaceId)
          await refreshWorkspaces()
          await refreshSnapshot()
          setStatus(`Workspace ungrouped ${result.ungroupedGroupCount} group(s), ${result.ungroupedTabCount} tab(s)`)
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
  globalThis.addEventListener("resize", () => {
    syncPanelHeightWithOverview()
    syncFillPanelsToViewport()
  })

  document.querySelectorAll(".main-tab-btn[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-panel-target")
      if (!target || target === state.activePanel) {
        return
      }
      state.activePanel = target
      renderMainPanels()
    })
  })

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
      const groupInChrome = Boolean(getGroupCheckbox()?.checked)
      const ignoreWorkspaceChecked = Boolean(getIgnoreWorkspaceCheckbox()?.checked)
      const ignoreWorkspace = shouldSkipWorkspaceGroupDetection(groupInChrome, ignoreWorkspaceChecked)
      const result = groupInChrome
        ? await organizeTabsByDomainWithChromeGroups({ ignoreWorkspace })
        : await organizeTabsByDomainFallback()
      await refreshSnapshot()
      if (groupInChrome) {
        const statusPrefix = result.skippedWorkspaceGroupDetection
          ? "Grouped by domain (ignore workspace)"
          : "Grouped by domain"
        setStatus(`${statusPrefix}: ${result.groupedDomainCount} group(s), ${result.affectedWindows} window(s), ${result.movedCount} tab move(s)`)
      } else {
        setStatus(`Organized by domain: ${result.affectedWindows} window(s), ${result.movedCount} tab move(s)`)
      }
    } catch (error) {
      setStatus(error.message || "Organize failed")
    }
  })

  $("ungroupDomainBtn")?.addEventListener("click", async () => {
    try {
      const result = await ungroupDomainOrganizedTabs()
      await refreshSnapshot()
      setStatus(`Ungrouped ${result.ungroupedGroupCount} group(s), ${result.ungroupedTabCount} tab(s)`)
    } catch (error) {
      setStatus(error.message || "Ungroup failed")
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

  getGroupCheckbox()?.addEventListener("change", async () => {
    const groupChecked = Boolean(getGroupCheckbox()?.checked)
    if (!groupChecked) {
      const controlState = resolveIgnoreWorkspaceState(false, false)
      applyOrganizeControlState(controlState)
      await clearIgnoreWorkspaceTemporaryState()
      await writeUserPrefs({ cbGroup: false, cbIgnoreWorkspace: false })
      return
    }
    const controlState = resolveIgnoreWorkspaceState(true, getIgnoreWorkspaceCheckbox()?.checked)
    applyOrganizeControlState(controlState)
    await writeUserPrefs({
      cbGroup: controlState.groupChecked,
      cbIgnoreWorkspace: controlState.ignoreWorkspaceChecked
    })
  })

  getIgnoreWorkspaceCheckbox()?.addEventListener("change", async () => {
    const groupChecked = Boolean(getGroupCheckbox()?.checked)
    const requested = Boolean(getIgnoreWorkspaceCheckbox()?.checked)
    const controlState = resolveIgnoreWorkspaceState(groupChecked, requested)
    applyOrganizeControlState(controlState)
    await writeUserPrefs({
      cbGroup: controlState.groupChecked,
      cbIgnoreWorkspace: controlState.ignoreWorkspaceChecked
    })
    const storageLocal = getStorageLocal()
    if (!storageLocal) {
      return
    }
    if (controlState.ignoreWorkspaceChecked) {
      await storageLocal.set({
        ignoreWorkspaceTempConfig: {
          updatedAt: Date.now()
        },
        ignoreWorkspaceSessionCache: {
          enabled: true
        }
      })
      return
    }
    await storageLocal.remove(IGNORE_WORKSPACE_TEMP_KEYS)
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
    await restoreOrganizePreferences()
    bindEvents()
    renderMainPanels()
    syncFillPanelsToViewport()
    await refreshSnapshot()
    await refreshWorkspaces()
    setStatus("Ready")
  } catch (error) {
    setStatus(error.message)
  }
}

bootstrap()
