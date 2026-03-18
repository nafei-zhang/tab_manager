# Tab Disaster Manager

A Manifest V3 smart tab management extension for Chrome / Edge / Firefox.

Chinese version: [README.zh.md](./README.zh.md)

## Why This Project

When tab count grows fast, the common pain points are:

- Too many duplicate pages
- Tabs scattered across multiple contexts
- Hard to jump back to a previous working session

Tab Disaster Manager is designed to keep high-tab workflows manageable by making tab cleanup, lookup, and restore fast.

## Feature Overview

### 1) Duplicate Cleanup

- Rule-based duplicate detection
- Configurable ignore rules:
  - Query params
  - Hash
  - Protocol
  - `www`
- One-click duplicate cleanup while keeping the earliest original tab

### 2) Domain Grouping & Sorting

- Automatic domain-based grouping
- Expand/collapse per group
- Per-group tab count and estimated memory
- One-click domain sorting that applies directly to browser tab order

### 3) Search & Quick Actions

- Search modes:
  - Normal
  - Fuzzy
  - Regex
- Highlighted results for faster scanning
- Per-result actions:
  - Switch to tab
  - Close tab

### 4) Workspace Management

- Save current tab set as workspace
- Restore all records or selected records
- JSON import/export
- Per-record operations:
  - Open record
  - Remove from workspace list only (without closing opened page)
- One-click add of the currently focused page to a workspace

## Typical Workflows

### Workflow A: Clean first, then focus

1. Open popup
2. Run duplicate cleanup
3. Run domain organize
4. Use search to jump to target tabs

### Workflow B: Task snapshot

1. Save current tabs as workspace before context switch
2. Work on another task
3. Restore selected records to continue where you left off

### Workflow C: Ongoing collection

1. While browsing, find a useful page
2. Click `+` in target workspace to add focused page
3. Restore/export later for follow-up

## Setup

### Local Development

```bash
npm install
npm test
```

### Load Extension

- Chrome / Edge:
  - Open `chrome://extensions` or `edge://extensions`
  - Enable Developer mode
  - Click Load unpacked
  - Select project root
- Firefox:
  - Open `about:debugging#/runtime/this-firefox`
  - Load Temporary Add-on
  - Select project `manifest.json`

## Project Structure

```text
manifest.json
src/
  assets/
    icons/
  background.js
  content-script.js
  core/
    tab-manager.js
    url-utils.js
    workspace-store.js
  popup/
    popup.html
    popup.css
    popup.js
tests/
docs/
```

## Technical Notes

- Plain JavaScript (ES modules), lightweight architecture
- Popup handles interaction, background service worker handles orchestration
- `storage.local` used for persistence
- Cross-browser API compatibility with `browser ?? chrome`
- Unit tests cover core logic (grouping, URL utilities, workspace store)

## Documentation

- [Installation Guide](./docs/install.md)
- [User Guide](./docs/user-guide.md)
- [Performance Report](./docs/performance-report.md)

## Known Notes

- Firefox temporary loading needs reloading after browser restart
- Popup size rendering may vary slightly between browsers
- Some system pages (for example `chrome://`) have browser API limitations

## Suggested Next Improvements

- Organize scope switch: current window vs all windows
- Workspace rename, drag-sort, enhanced dedupe policies
- Keyboard shortcut and command palette integration
