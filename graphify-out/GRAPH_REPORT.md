# Graph Report - pos-app  (2026-08-26)

## Corpus Check
- 29 files · ~16,976 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 207 nodes · 499 edges · 10 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41e6bc6d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- POSRight.jsx
- POSLeft.jsx
- showToast
- dependencies
- devDependencies
- bluetooth.js
- React + Vite
- App.jsx

## God Nodes (most connected - your core abstractions)
1. `showToast()` - 38 edges
2. `SettingsPage()` - 22 edges
3. `ProductsPage()` - 15 edges
4. `fmtCurrency()` - 15 edges
5. `Icon()` - 13 edges
6. `PiutangPage()` - 13 edges
7. `POSRight()` - 12 edges
8. `HistoryPage()` - 11 edges
9. `POSLeft()` - 11 edges
10. `fmtDateTime()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `CategoriesPage()` --indirect_call--> `getCategoriesQuery()`  [INFERRED]
  src/features/categories/CategoriesPage.jsx → src/services/categoryService.js
- `confirmDelete()` --calls--> `showToast()`  [EXTRACTED]
  src/features/categories/CategoriesPage.jsx → src/components/Toast.jsx
- `handleDelete()` --calls--> `showToast()`  [EXTRACTED]
  src/features/categories/CategoriesPage.jsx → src/components/Toast.jsx
- `handleSave()` --calls--> `showToast()`  [EXTRACTED]
  src/features/categories/CategoriesPage.jsx → src/components/Toast.jsx
- `handleReprint()` --calls--> `showToast()`  [EXTRACTED]
  src/features/history/HistoryPage.jsx → src/components/Toast.jsx

## Import Cycles
- None detected.

## Communities (10 total, 0 thin omitted)

### Community 0 - "POSRight.jsx"
Cohesion: 0.12
Nodes (34): db, HistoryPage(), openDetail(), ageBarClass(), ageBarWidth(), ageColor(), ageDaysLabel(), DebtCard() (+26 more)

### Community 1 - "POSLeft.jsx"
Cohesion: 0.11
Nodes (20): POSLeft(), handleBarcodeScan(), handleCreateAndAddProduct(), POSPage(), useCartStore, ProductsPage(), adjustStock(), confirmDelete() (+12 more)

### Community 2 - "showToast"
Cohesion: 0.15
Nodes (23): showToast(), SettingsPage(), clearQrisImage(), confirmClearAll(), confirmImport(), executeManualExport(), handleDisconnect(), handleExport() (+15 more)

### Community 3 - "dependencies"
Cohesion: 0.08
Nodes (24): dexie, dexie-react-hooks, dependencies, dexie, dexie-react-hooks, react, react-dom, react-router-dom (+16 more)

### Community 4 - "devDependencies"
Cohesion: 0.10
Nodes (21): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+13 more)

### Community 5 - "bluetooth.js"
Cohesion: 0.14
Nodes (19): handleReprint(), handleConnect(), ALIGN_CENTER, ALIGN_LEFT, autoConnectPrinter(), BOLD_OFF, BOLD_ON, buildReceipt() (+11 more)

### Community 6 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

### Community 10 - "App.jsx"
Cohesion: 0.14
Nodes (19): App(), NAV, Icon(), Modal(), PWAUpdate(), Toast(), CategoriesPage(), confirmDelete() (+11 more)

## Knowledge Gaps
- **39 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `showToast` to `POSRight.jsx`, `POSLeft.jsx`, `App.jsx`, `bluetooth.js`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `ProductsPage()` connect `POSLeft.jsx` to `POSRight.jsx`, `App.jsx`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `SettingsPage()` connect `showToast` to `POSRight.jsx`, `POSLeft.jsx`, `App.jsx`, `bluetooth.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `POSRight.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11655874190564293 - nodes in this community are weakly interconnected._
- **Should `POSLeft.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1103448275862069 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._