export const USER_PREFS_KEY = "userPrefs"
export const IGNORE_WORKSPACE_TEMP_KEYS = ["ignoreWorkspaceTempConfig", "ignoreWorkspaceSessionCache"]

export function resolveIgnoreWorkspaceState(groupChecked, ignoreWorkspaceChecked) {
  const group = Boolean(groupChecked)
  if (!group) {
    return {
      groupChecked: false,
      ignoreWorkspaceEnabled: false,
      ignoreWorkspaceChecked: false
    }
  }
  return {
    groupChecked: true,
    ignoreWorkspaceEnabled: true,
    ignoreWorkspaceChecked: Boolean(ignoreWorkspaceChecked)
  }
}

export function shouldSkipWorkspaceGroupDetection(groupChecked, ignoreWorkspaceChecked) {
  return Boolean(groupChecked) && Boolean(ignoreWorkspaceChecked)
}

export function collectWorkspaceGroupBuckets(tabs) {
  const buckets = new Map()
  for (const tab of tabs) {
    const groupId = Number(tab?.groupId)
    if (!Number.isInteger(groupId) || groupId < 0) {
      continue
    }
    if (!buckets.has(groupId)) {
      buckets.set(groupId, [])
    }
    buckets.get(groupId).push(tab.id)
  }
  return buckets
}

export function pickTabsForDomainGrouping(tabs, { ignoreWorkspace = false } = {}) {
  if (!ignoreWorkspace) {
    return tabs
  }
  return tabs.filter((tab) => {
    const groupId = Number(tab?.groupId)
    return !Number.isInteger(groupId) || groupId < 0
  })
}

export function createChromeGroupOrganizePlan(tabs, { ignoreWorkspace = false } = {}) {
  const skipWorkspaceGroupDetection = Boolean(ignoreWorkspace)
  const workspaceBuckets = skipWorkspaceGroupDetection ? new Map() : collectWorkspaceGroupBuckets(tabs)
  return {
    skipWorkspaceGroupDetection,
    workspaceGroupCount: workspaceBuckets.size,
    workspaceBuckets,
    processedTabCount: tabs.length
  }
}

export function buildOrganizePreferenceChange(groupChecked, ignoreWorkspaceChecked) {
  const controlState = resolveIgnoreWorkspaceState(groupChecked, ignoreWorkspaceChecked)
  return {
    controlState,
    userPrefs: {
      cbGroup: controlState.groupChecked,
      cbIgnoreWorkspace: controlState.ignoreWorkspaceChecked
    },
    shouldClearIgnoreWorkspaceTemp: !controlState.groupChecked
  }
}
