# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.18] - 2026-03-06

### Fixed

- **Waypoint addition on step/bezier edges** — Ctrl+click to add a waypoint now detects proximity to the actual rendered path (orthogonal corners for step, curve for bezier) instead of only the straight line between source and target.
- **Edge reconnection overwritten by port recalculation** — Dragging an edge endpoint to a new anchor point was immediately undone by the `graphChange` round-trip. Port recalculation now only assigns ports to edges missing them.

### Changed

- **`preservePorts` defaults to `true`** — Edge ports are now preserved once assigned. Set `preservePorts: false` to restore the old behavior where ports are recalculated on every drag/resize/layout.

## [1.0.17] - 2026-03-06

### Fixed

- **Edge reconnection overwritten by port recalculation** — Dragging an edge endpoint to a new anchor point was immediately undone: the `graphChange` round-trip triggered `ngOnChanges` which recalculated all edge ports, overwriting the user's choice. Port recalculation now only assigns ports to edges that are missing them, preserving manually set and reconnected ports.

## [1.0.16] - 2026-03-06

### Added

- **`preservePorts` edge option** — New `EdgesConfig.preservePorts` option (default: `false`). When `true`, edges that already carry `sourcePort` and `targetPort` values are never overwritten by automatic port recalculation (drag, resize, layout). Edges without ports still get them assigned normally.

### Fixed

- **Parallel edges collapse on JSON load** — Edges loaded via the `[graph]` input (JSON import, initial data) without explicit `sourcePort`/`targetPort` values now receive distinct ports through conflict avoidance, preventing parallel edges from visually merging into one. Previously, only layout/drag/resize triggered conflict avoidance — the input binding and `ngOnInit` paths were missed.

## [1.0.15] - 2026-03-05

### Added

- **Configurable edge double-click behavior** — New `interaction.edgeLabelEditOnDoubleClick` option (default: `true`). Set to `false` to disable inline label editing on edge double-click while still receiving the `edgeDoubleClick` output event.

### Changed

- **README rewritten as marketing page** — Concise hero pitch, grouped features, captioned visuals. Detailed API reference moved to `docs/API.md`.
- **Animated demo GIF** — New `files/demo.gif` showcasing node dragging, theme switching, and auto-layout.

## [1.0.14] - 2026-03-05

### Added

- **Lifecycle hooks** — 5 new hooks (`canConnect`, `beforeNodeAdd`, `beforeNodeRemove`, `beforeEdgeAdd`, `beforeEdgeRemove`) for intercepting and cancelling user-initiated graph mutations. Configure via `hooks` property on `GraphEditorConfig`. `canConnect` is synchronous (called on every mousemove); all others support async for confirmation dialogs or server validation. Hooks only apply to user actions — programmatic API calls remain unguarded.
- **Edge reconnection hook enforcement** — Reconnecting an edge endpoint now checks `canConnect` at drop time and invokes `beforeEdgeAdd` before committing, consistent with new connection behavior.
- **Demo: Guards toggle** — New "Guards" checkbox in demo header enables workflow-level lifecycle hooks with toast notifications: no self-loops, no duplicate edges, max 1 Start/End, confirm before deleting Start/End, max 2 outgoing from non-Decision nodes.
- **New exports** — `LifecycleHooks` and `ConnectionEndpoint` interfaces exported from public API.

### Fixed

- **Code quality improvements** — Infinite loop guards on layout algorithms, dead code removal, `as any` cast elimination, `DestroyRef` cleanup, dagre import error handling, magic number extraction, DRY deduplication of delete logic, hardcoded color fixes, inconsistent fallback values.

## [1.0.13] - 2026-03-05

### Added

- **Edge waypoints** — Ctrl+click on an edge to add draggable waypoints for manual routing bends. Waypoints work with all path types (straight, bezier, step). Drag existing waypoints to reshape edges; delete a waypoint by dragging it off the edge. Waypoint circles are only visible when the edge is selected.
- **Edge type toolbar switcher** — New `'edge-type'` toolbar item lets users switch between straight, bezier, and step edge path types at runtime.

### Changed

- **Layout algorithms simplified** — Replaced force-directed and tree layouts with a single compact layout. `LayoutConfig.algorithm` now accepts `'dagre' | 'compact' | 'manual'` (was `'dagre' | 'force' | 'tree' | 'manual'`). Force/tree-specific `LayoutOptions` removed.
- **Theme styling improvements** — Refreshed all four demo theme presets (Corporate, Emerald, Blueprint, Midnight) with refined color palettes, better contrast, and more cohesive per-type node styles.
- **Internal refactoring** — Extracted ~790 lines of pure utility functions from `GraphEditorComponent` into 5 focused modules (`edge-path.utils`, `node-rendering.utils`, `snap-guide.utils`, `port-geometry.utils`, `layout-algorithms`). No public API changes.

## [1.0.12] - 2026-03-04

### Fixed

- **Parallel edge port conflicts** — Multiple edges between the same node pair no longer collapse onto identical ports after layout, drag, or resize. A new `recalculateEdgePortsWithConflictAvoidance()` method detects when a freshly-computed port assignment duplicates an already-assigned sibling edge and preserves the original ports instead, preventing edges from visually merging into one.

## [1.0.11] - 2026-03-03

### Fixed

- **Bezier edge path routing** — Edges now follow natural, direct paths after applying hierarchical or tree layout. Previously, `findClosestPortForEdge()` picked ports by geometric proximity alone, causing edges between vertically-arranged nodes to route through side ports (left/right) instead of top/bottom — producing sideways S-curves and loops. The algorithm now scores ports by directional alignment (dot product of port outward normal vs. direction to target) with distance as tiebreaker.
- **Step path port detection** — Step edge routing now correctly identifies indexed port IDs like `'top-0'` as vertical/horizontal using `getPortSide()`, instead of failing on direct string comparison with `'top'`/`'bottom'`.

## [1.0.10] - 2026-03-03

### Fixed

- **Panning in readonly mode** — Canvas panning and scroll-to-zoom now work when `readonly` is enabled. Previously, readonly blocked all canvas mouse interactions including navigation.

## [1.0.9] - 2026-03-03

### Added

- **Multiple layout algorithms** — Layout toolbar button now has a chevron dropdown to switch between Hierarchical ↓ (dagre TB), Hierarchical → (dagre LR), Force-directed, and Tree layouts. Last-used algorithm is remembered.
- **Force-directed layout** — Physics-based layout using repulsion/attraction forces. Zero new dependencies — implemented from scratch. Configurable via `iterations`, `repulsionStrength`, and `attractionStrength` in `LayoutOptions`.
- **Tree layout** — BFS-based hierarchical tree layout that handles forests (multiple disconnected trees) and cyclic graphs gracefully. Configurable via `levelSeparation` and `siblingSpacing` in `LayoutOptions`.
- **Dropdown theme customization** — New `ToolbarTheme` properties (`dropdownBackground`, `dropdownBorderColor`, `dropdownBorderRadius`, `dropdownShadow`, `dropdownItemColor`, `dropdownItemHoverBackground`, `dropdownItemActiveColor`) and matching `--ge-dropdown-*` CSS custom properties for full dropdown styling control.

### Changed

- **`LayoutConfig.algorithm`** now accepts `'dagre' | 'force' | 'tree' | 'manual'` (was `'dagre' | 'manual'`).
- **`LayoutOptions`** extended with force-directed and tree-specific options.
- **`applyLayout()`** refactored into a dispatcher that delegates to algorithm-specific methods. Accepts optional algorithm override parameter. Legacy `applyLayout('TB')` / `applyLayout('LR')` calls are mapped automatically.

## [1.0.8] - 2026-03-03

### Added

- **Copy/Paste/Cut** — `Ctrl+C` / `Ctrl+V` / `Ctrl+X` to copy, paste, and cut selected nodes with their internal edges. Pasted nodes are offset and become the new selection. Fully undo-compatible.
- **Snap alignment guides** — Dashed guide lines appear when dragging nodes near another node's edges or center (5px threshold, zoom-aware). Guide snap takes priority over grid snap per axis. Also active during node resize.
- **Drag-to-connect** — Select a node to reveal its ports, hover a port to highlight it, then drag from the port to a target port on another node to create an edge. Replaces the old two-click line tool.
- **Multiple anchor points** — Nodes now show multiple evenly-spaced ports per side, computed dynamically from node size. Center port is always present. Ports never sit on corners.
- **Configurable port density** — New `PortTheme.spacing` (default: 75) and `PortTheme.margin` (default: 15) control how many ports appear per side and the corner inset distance.
- **Edge endpoint dragging** — Drag the source or target handle of a selected edge to reconnect it to a different node/port, with rubber-band preview line and port snapping.

### Changed

- **Line tool removed** — The two-click line tool has been removed. Edges are now created exclusively via drag-to-connect from ports.
- **Hand tool button removed** — With only one tool remaining, the hand tool toolbar button is no longer shown. `'hand'` and `'line'` removed from `ToolbarItem` type.
- **Port system refactored** — Port IDs changed from `'top' | 'bottom' | 'left' | 'right'` to indexed strings (`'top-0'`, `'top-1'`, etc.). Legacy port IDs on existing edges remain backward compatible.
- **`findClosestPortForEdge`** now picks the closest port across all sides (not just the nearest side), improving edge routing accuracy with multiple ports.


## [1.0.7] - 2026-03-01

### Added

- **Independent toolbar/palette visibility** — Toolbar and palette now have separate `enabled` flags. Set `toolbar: { enabled: false }` or `palette: { enabled: false }` independently.
- **Configurable toolbar items** — New `ToolbarConfig.items` array controls which buttons appear. Accepts `'hand'`, `'line'`, `'zoom-in'`, `'zoom-out'`, `'layout'`, `'fit'`. Omit to show all (default).
- **Auto-dividers** — Toolbar dividers render automatically between adjacent button groups when both groups have visible items.
- **Readonly demo toggle** — Demo app now has a Readonly checkbox that hides the palette, limits toolbar to layout/fit, passes `[readonly]` to the editor, and disables import/context menu/node editing.

### Changed

- Palette height calculation now adapts when the toolbar is hidden.


## [1.0.6] - 2026-03-01

### Added

- **Comprehensive theming system** — New `ThemeConfig` sub-interfaces (`CanvasTheme`, `NodeTheme`, `EdgeTheme`, `PortTheme`, `SelectionTheme`, `FontTheme`, `ToolbarTheme`) with a `ResolvedTheme` resolver that fills sensible defaults. All hardcoded colors replaced with `--ge-*` CSS custom properties.
- **Template injection** — `ng-template` directives for custom node and edge rendering:
  - `geNodeHtml` — Render nodes as HTML inside `foreignObject`
  - `geNodeSvg` — Render nodes as native SVG elements
  - `geEdge` — Custom edge path rendering
  - Full type-safe template context via `NodeTemplateContext` and `EdgeTemplateContext`
- **Custom node components** — `NodeTypeDefinition.component` now wired up via `ngComponentOutlet` inside `foreignObject`
- **Bezier edge paths** — `edge.pathType: 'bezier'` with cubic bezier curves and control points offset from port direction
- **Step edge paths** — `edge.pathType: 'step'` with orthogonal routing through midpoints
- **Dot grid pattern** — `canvas.gridType: 'dot'` as alternative to line grid
- **Per-type node styles** — `node.typeStyles` record for per-node-type visual overrides (background, border, accent)
- **Toolbar theming** — `toolbar` config controls top toolbar, left palette, and edge direction selector appearance (background, buttons, hover/active states, dividers)
- **Demo theme presets** — 4 presets showcasing capabilities: Default (straight), Compact (bezier + dot grid + indigo), Detailed (step + amber + per-type styles + serif), Dark (bezier + dot grid + zinc + cyan + monospace)

### Fixed

- **Bezier arrow orientation** — Arrowheads on bezier edges now follow the curve tangent instead of being axis-locked
- **Arrow-to-node gap** — Marker `refX` aligned with actual arrow tip position, eliminating the visible gap between arrowhead and target node


## [1.0.5] - 2026-02-28

### Added

- **Toolbar redesign** — New two-toolbar layout:
  - Top horizontal toolbar: Hand tool, Line tool, Zoom in/out, Auto layout, Fit to screen
  - Left vertical palette: Node types for drag-and-drop (auto-wraps to multiple columns when needed)
- **Zoom controls** — New `zoomIn()` and `zoomOut()` public methods.
- **Multi-column palette** — When there are many node types, the palette automatically creates additional columns to prevent overflow.

### Changed

- Demo app header simplified — Layout/Fit buttons removed (now in library toolbar).

## [1.0.4] - 2026-02-28

### Added

- **Node resize** — Drag the SE corner handle to resize nodes when Hand tool is selected. Resized dimensions are stored per-node and persist across sessions.
- **Text containment** — Node labels now wrap intelligently within node bounds, with automatic font downsizing (14px → 9px) when text doesn't fit. Text avoids icon area based on `iconPosition` config.
- **Double-click to edit** (demo) — Double-click any node to edit its name inline via modal dialog.
- **Import/Export JSON** (demo) — Export current graph as JSON file, or import a graph by pasting JSON with validation.

### Changed

- Help popup now documents resize ("Drag corner") and edit ("Double-click") interactions.
- `GraphNode` interface now has optional `size?: { width: number; height: number }` property for per-node size overrides.

## [1.0.3] - 2026-02-28

### Changed

- **Validation panel removed from library** — The built-in validation error panel has been removed from the library template. Consumers should implement their own validation UI for full control over styling and behavior.
- **Demo app now includes validation example** — Shows how to build a custom validation panel with:
  - Validate button in header toolbar
  - Collapsible error/warning panel
  - "Show" buttons to focus on problematic nodes
  - Sample validation rules (single entry point, has end point, no orphans)

### Migration from 1.0.2

If you relied on the library's built-in validation panel, add your own UI that consumes `validationResult()` or calls `validate()` on the editor component. See the demo app for a reference implementation.

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
