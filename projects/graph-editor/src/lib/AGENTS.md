# AGENTS.md — projects/graph-editor/src/lib

This directory contains **all library source**. Three files, no sub-components.

---

## FILES

| File | Lines | Purpose |
|------|-------|---------|
| `graph-editor.component.ts` | 1566 | Everything — rendering, interaction, layout, validation |
| `graph-editor.config.ts` | ~261 | All configuration interfaces (GraphEditorConfig and subtypes) |
| `graph.model.ts` | ~84 | Data model interfaces (Graph, GraphNode, GraphEdge, Position) |

---

## COMPONENT INTERNALS

**State** (all signals):
- `nodes`, `edges` — derived from `@Input() graph`
- `selectedNodeId`, `selectedEdgeId` — selection
- `transform` — `{ x, y, scale }` for pan/zoom
- `activeTool` — `'hand'`
- `validationResult` — current validation state

**Rendering**: pure SVG. Nodes are `<g>` groups, edges are `<path>` elements. No Canvas API.

**Layout**: dagre is dynamically imported inside `applyLayout()` — not a top-level import.

**Keyboard shortcuts** (bound via `@HostListener`):
- `Delete`/`Backspace` — remove selected node or edge
- `Escape` — cancel line tool, clear selection
- `Arrow keys` — nudge selected node 1px (10px with Shift)

---

## KNOWN STUBS

```typescript
// line 1349 — onContextMenu() — not implemented
event.preventDefault();
// TODO: Show context menu
```

Custom component rendering (`component: Type<any>` in config) is defined in interfaces but **never wired up** in the template. Do not assume it works.

---

## ADDING FEATURES

1. **New config option**: add to `graph-editor.config.ts`, consume via `input()` or read from `this.config`
2. **New public method**: add as a regular method, document in root AGENTS.md public API table
3. **New output event**: declare as `@Output() name = new EventEmitter<T>()`, add to root AGENTS.md outputs list
4. **New node interaction**: hook into existing `onNodeMouseDown/Click/DoubleClick` handlers
5. **Tests**: create `graph-editor.component.spec.ts` in this directory — infrastructure is ready

---

## DO NOT

- Add sub-components or services — single-component design is intentional
- Use RxJS — signals only (`signal`, `computed`, `effect`)
- Import from `@angular/forms` or other Angular modules not already in the component's `imports: []`
- Break the `GraphEditorConfig` shape — it is the public contract
