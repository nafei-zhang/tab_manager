# Tab Disaster Manager

A Manifest V3 smart tab manager for Chrome / Edge / Firefox.

中文版本: [README.zh.md](./README.zh.md)

## What It Solves

When tab count grows, people usually hit these issues:

- Duplicate pages are hard to clean quickly
- Tabs are scattered and difficult to navigate
- Switching tasks makes it hard to return to previous context

Tab Disaster Manager focuses on three actions: clean, find, and restore.

## Main UI Structure

The popup is split into 3 tabs:

1. Cleanup & Search
2. Domain Groups
3. Workspaces

This keeps high-density features separated while preserving a consistent popup height and scrolling behavior.

## Features

### 1) Duplicate Cleanup

- Rule-based duplicate detection
- Configurable ignore rules:
  - Query params
  - Hash
  - Protocol
  - `www`
- One-click duplicate cleanup while keeping the earliest original tab

### 2) Domain Groups

- Auto aggregation by domain with expand/collapse
- Group card metadata: tab count + estimated memory
- Quick actions per tab: switch / close
- One-click organize modes:
  - Unchecked `Group organize`: keep classic behavior, reorder tabs by domain
  - Checked `Group organize`: use Chrome native tab groups, one group per domain
  - Group title is the domain name

### 3) Search & Quick Actions

- Search modes: Normal / Fuzzy / Regex
- Match highlight in title and URL
- Per-result actions:
  - Switch to tab
  - Close tab

### 4) Workspace Management

- Save current tabs as a workspace
- Expand/collapse workspace cards
- Add focused tab to a workspace with `+`
- Remove single record from workspace list (without closing opened pages)
- Import/export workspace JSON
- Restore modes:
  - Unchecked `Group open`: open restored tabs normally
  - Checked `Group open`: restore into Chrome native tab group
  - Group title is the workspace name

## UI/UX Updates

- Optimized scrollbar styling for Windows Chrome
- Better popup spacing and layout consistency across tabs
- Domain and workspace panels fill available popup height and use internal scrolling
- Refined extension icons across all required sizes (16/32/48/128)

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

- Plain JavaScript (ES modules)
- Popup handles interaction, background service worker handles orchestration
- `storage.local` is used for workspace and rule persistence
- Cross-browser API compatibility via `browser ?? chrome`
- Chrome group-related features rely on `tabs` + `tabGroups` permissions
- Unit tests cover core logic (grouping, URL utilities, workspace store)

## Documentation

- [Installation Guide](./docs/install.md)
- [User Guide](./docs/user-guide.md)
- [Performance Report](./docs/performance-report.md)

## Known Notes

- Firefox temporary loading needs reloading after browser restart
- Some system pages (for example `chrome://`) have browser API limitations
- Native tab-group behavior depends on browser support and permissions
