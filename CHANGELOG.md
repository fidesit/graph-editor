# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-02-28

### Added

- **iconSvg property** — New `iconSvg` property on `NodeTypeDefinition` for inline SVG icon definitions
- **SvgIconDefinition interface** — Type-safe interface for defining custom SVG icons with `path`, `viewBox`, `fill`, `stroke`, and `strokeWidth` properties
- **Icon helper functions** — `renderIconSvg()` and `iconToDataUrl()` utilities for working with SVG icons

### Changed

- **Consumer-owned icons** — Library no longer ships built-in icons. Consumers define their own icon sets matching their design system.
- Demo app now includes sample icons showing the recommended approach
- Palette toolbar renders inline SVG icons when `iconSvg` is defined on node types
- Node icon priority: `node.data['imageUrl']` → `nodeType.iconSvg` → `nodeType.defaultData['imageUrl']` → `nodeType.icon` (emoji fallback)

### Migration from 1.0.1

If you were using `WORKFLOW_ICONS` from the library, define your own icons:

```typescript
// Before (1.0.1)
import { WORKFLOW_ICONS } from '@utisha/graph-editor';
{ type: 'process', iconSvg: WORKFLOW_ICONS.process, ... }

// After (1.0.2)
import { SvgIconDefinition } from '@utisha/graph-editor';
const MY_ICONS: Record<string, SvgIconDefinition> = {
  process: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#6366f1',
    strokeWidth: 1.75,
    path: 'M12 15a3 3 0 1 0 0-6...'
  }
};
{ type: 'process', iconSvg: MY_ICONS.process, ... }
```

---

## [1.0.1] - 2026-02-28

### Added

- **Custom node images** — Display custom images instead of emoji icons via `imageUrl` in node data or type defaults
- **Box selection** — Shift+drag on canvas to select multiple nodes; automatically selects connecting edges
- **Multi-select via Ctrl+Click** — Toggle nodes/edges in selection with Ctrl+Click (Cmd+Click on Mac)
- **Undo/Redo** — Full history support with Ctrl+Z (undo) and Ctrl+Y or Ctrl+Shift+Z (redo)
- **Batch delete** — Delete key removes all selected nodes and edges in one atomic operation (single undo step)
- **Arrow key multi-move** — Arrow keys move all selected nodes together
- **Multi-node drag** — Drag any selected node to move all selected nodes together

### Changed

- Extracted template to separate `.html` file (352 lines)
- Extracted styles to separate `.scss` file (234 lines)
- Extracted `GraphHistoryService` for undo/redo logic
- Switched tests to ChromeHeadless for ~2x faster execution

### Fixed

- **Auto-layout edge ports** — Edge attachment points are now recalculated after applying layout, ensuring edges connect to the most logical ports based on node positions
- **Drag-click suppression** — After dragging nodes, the click event no longer resets the selection

## [1.0.0] - 2026-02-28

First stable release of `@utisha/graph-editor`.

### Features

- **Configuration-driven architecture** — All behavior flows from `GraphEditorConfig`
- **Node management** — Add, remove, update, drag, select nodes
- **Edge management** — Draw connections, set direction (forward/backward/bidirectional)
- **Auto-layout** — Dagre-based automatic graph layout (TB/LR directions)
- **Zoom & pan** — Mouse wheel zoom, canvas panning
- **Grid snapping** — Optional snap-to-grid for node positioning
- **Keyboard shortcuts** — Delete, arrow keys (nudge), Escape (cancel)
- **Context menus** — Right-click events for canvas/node/edge (UI built by consumer)
- **Validation system** — Custom validation rules with error/warning severity
- **Theming** — CSS custom properties, optional shadows, configurable icon position

### Demo App

- Theme switcher (Default, Compact, Detailed, Minimal)
- Auto Layout & Fit to Screen buttons
- Help popup with keyboard/mouse reference
- Working context menu example

### Infrastructure

- GitHub Actions CI (build + test on push/PR)
- Trusted Publishing to npm (no token needed)
- GitHub Pages deployment for live demo
- 7 smoke tests

---

## [1.0.0-beta.1] - 2026-02-27

Initial beta release.
