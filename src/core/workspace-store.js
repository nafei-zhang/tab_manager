const STORAGE_KEY = "savedWorkspaces"

export function sanitizeWorkspaceName(name) {
  return (name || "").trim().slice(0, 60)
}

export function createWorkspaceRecord(name, tabs) {
  const safeName = sanitizeWorkspaceName(name) || `workspace-${new Date().toISOString()}`
  return {
    id: crypto.randomUUID(),
    name: safeName,
    createdAt: Date.now(),
    tabs: tabs.map((tab) => ({
      title: tab.title || "",
      url: tab.url || "",
      pinned: Boolean(tab.pinned)
    }))
  }
}

export async function loadWorkspaces(storage) {
  const data = await storage.local.get(STORAGE_KEY)
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []
}

export async function saveWorkspaces(storage, workspaces) {
  await storage.local.set({ [STORAGE_KEY]: workspaces })
  return workspaces
}

export async function addWorkspace(storage, workspace) {
  const existing = await loadWorkspaces(storage)
  const next = [workspace, ...existing]
  await saveWorkspaces(storage, next)
  return next
}

export async function deleteWorkspaceById(storage, id) {
  const existing = await loadWorkspaces(storage)
  const next = existing.filter((item) => item.id !== id)
  await saveWorkspaces(storage, next)
  return next
}

export async function removeWorkspaceTabByIndex(storage, workspaceId, tabIndex, tabUrl = "") {
  const existing = await loadWorkspaces(storage)
  let removed = false
  const next = existing.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace
    }
    const tabs = Array.isArray(workspace.tabs) ? workspace.tabs : []
    const validIndex = Number.isInteger(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length
    if (validIndex) {
      removed = true
      return {
        ...workspace,
        tabs: tabs.filter((_, index) => index !== tabIndex)
      }
    }
    const fallbackIndex = tabs.findIndex((tab) => (tab?.url || "") === tabUrl)
    if (fallbackIndex === -1) {
      return workspace
    }
    removed = true
    return {
      ...workspace,
      tabs: tabs.filter((_, index) => index !== fallbackIndex)
    }
  })
  await saveWorkspaces(storage, next)
  return { workspaces: next, removed }
}

export async function appendTabToWorkspace(storage, workspaceId, tab) {
  const existing = await loadWorkspaces(storage)
  let added = false
  const next = existing.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace
    }
    const tabs = Array.isArray(workspace.tabs) ? workspace.tabs : []
    added = true
    return {
      ...workspace,
      tabs: [
        ...tabs,
        {
          title: tab?.title || "",
          url: tab?.url || "",
          pinned: Boolean(tab?.pinned)
        }
      ]
    }
  })
  await saveWorkspaces(storage, next)
  return { workspaces: next, added }
}

export function serializeWorkspaces(workspaces) {
  return JSON.stringify({ version: 1, workspaces }, null, 2)
}

export function deserializeWorkspaces(raw) {
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.workspaces)) {
    throw new Error("Invalid workspace file")
  }
  return parsed.workspaces
}
