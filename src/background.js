import { buildGroupedTabs, detectDuplicateGroups } from "./core/tab-manager.js"
import {
  addWorkspace,
  appendTabToWorkspace,
  createWorkspaceRecord,
  deleteWorkspaceById,
  deserializeWorkspaces,
  loadWorkspaces,
  removeWorkspaceTabByIndex,
  saveWorkspaces,
  serializeWorkspaces
} from "./core/workspace-store.js"
import { getDefaultRules, getDomain } from "./core/url-utils.js"

const DUPLICATE_RULES_KEY = "duplicateRules"

const ext = globalThis.browser ?? globalThis.chrome

async function getDuplicateRules() {
  const stored = await ext.storage.local.get(DUPLICATE_RULES_KEY)
  return { ...getDefaultRules(), ...(stored[DUPLICATE_RULES_KEY] || {}) }
}

async function setDuplicateRules(rules) {
  await ext.storage.local.set({ [DUPLICATE_RULES_KEY]: { ...getDefaultRules(), ...rules } })
}

async function getAllTabs() {
  return ext.tabs.query({})
}

async function getTabSnapshot() {
  const tabs = await getAllTabs()
  const rules = await getDuplicateRules()
  const duplicateGroups = detectDuplicateGroups(tabs, rules)
  const groupedTabs = buildGroupedTabs(tabs)
  return {
    tabs,
    groupedTabs,
    duplicateGroups,
    duplicateCount: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0),
    duplicateRules: rules
  }
}

async function closeDuplicates() {
  const tabs = await getAllTabs()
  const rules = await getDuplicateRules()
  const duplicateGroups = detectDuplicateGroups(tabs, rules)
  const closeIds = duplicateGroups.flatMap((group) => group.duplicates.map((tab) => tab.id))
  if (closeIds.length) {
    await ext.tabs.remove(closeIds)
  }
  return { closedCount: closeIds.length, keptCount: duplicateGroups.length }
}

async function saveCurrentWorkspace(name) {
  const tabs = await getAllTabs()
  const workspace = createWorkspaceRecord(name, tabs)
  const workspaces = await addWorkspace(ext.storage, workspace)
  return { workspace, workspaces }
}

async function restoreWorkspace(workspaceId, selectedIndexes = null) {
  const workspaces = await loadWorkspaces(ext.storage)
  const target = workspaces.find((item) => item.id === workspaceId)
  if (!target) {
    throw new Error("Workspace not found")
  }

  const tabsToOpen = Array.isArray(selectedIndexes) && selectedIndexes.length
    ? target.tabs.filter((_, index) => selectedIndexes.includes(index))
    : target.tabs

  for (const tab of tabsToOpen) {
    if (tab.url) {
      await ext.tabs.create({ url: tab.url, active: false, pinned: tab.pinned })
    }
  }

  return { restoredCount: tabsToOpen.length, workspace: target }
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

async function organizeTabsByDomain() {
  const tabs = await getAllTabs()
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

async function getFocusedTab() {
  const list = await ext.tabs.query({ active: true, lastFocusedWindow: true })
  return list[0] || null
}

ext.runtime.onMessage.addListener((message, _, sendResponse) => {
  ;(async () => {
    switch (message?.type) {
      case "GET_TAB_SNAPSHOT":
        sendResponse({ ok: true, data: await getTabSnapshot() })
        break
      case "SET_DUPLICATE_RULES":
        await setDuplicateRules(message.payload || {})
        sendResponse({ ok: true })
        break
      case "CLOSE_DUPLICATES":
        sendResponse({ ok: true, data: await closeDuplicates() })
        break
      case "ORGANIZE_BY_DOMAIN":
        sendResponse({ ok: true, data: await organizeTabsByDomain() })
        break
      case "SAVE_WORKSPACE":
        sendResponse({ ok: true, data: await saveCurrentWorkspace(message.name) })
        break
      case "ADD_FOCUSED_TAB_TO_WORKSPACE": {
        const focusedTab = await getFocusedTab()
        if (!focusedTab?.url) {
          throw new Error("No focused tab found")
        }
        sendResponse({
          ok: true,
          data: await appendTabToWorkspace(ext.storage, message.workspaceId, focusedTab)
        })
        break
      }
      case "LIST_WORKSPACES":
        sendResponse({ ok: true, data: await loadWorkspaces(ext.storage) })
        break
      case "RESTORE_WORKSPACE":
        sendResponse({
          ok: true,
          data: await restoreWorkspace(message.workspaceId, message.selectedIndexes)
        })
        break
      case "DELETE_WORKSPACE":
        sendResponse({ ok: true, data: await deleteWorkspaceById(ext.storage, message.workspaceId) })
        break
      case "REMOVE_WORKSPACE_TAB":
        {
          const result = await removeWorkspaceTabByIndex(
            ext.storage,
            message.workspaceId,
            message.tabIndex,
            message.tabUrl
          )
          sendResponse({
            ok: true,
            data: result
          })
        }
        break
      case "EXPORT_WORKSPACES": {
        const workspaces = await loadWorkspaces(ext.storage)
        sendResponse({ ok: true, data: serializeWorkspaces(workspaces) })
        break
      }
      case "IMPORT_WORKSPACES": {
        const imported = deserializeWorkspaces(message.raw)
        await saveWorkspaces(ext.storage, imported)
        sendResponse({ ok: true, data: imported })
        break
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" })
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error?.message || "Execution failed" })
  })
  return true
})
