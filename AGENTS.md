# AGENTS.md — @utisha/graph-editor

**Stack**: Angular 19, TypeScript 5.6, SVG, dagre, ng-packagr  
**Published**: `@utisha/graph-editor` on npm (version `1.0.0-beta.1`)  
**Status**: Beta — no tests written yet, context menus stubbed

---

## STRUCTURE

```
projects/graph-editor/src/lib/   ← ALL library source (1 component, 2 model files)
projects/graph-editor/src/       ← public-api.ts (public surface), index.ts
dist/graph-editor/               ← build output — publish from here
src/app/                         ← demo app only, not part of the library
.github/workflows/               ← ci.yml (build+test), publish.yml (npm release)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| All library logic | `projects/graph-editor/src/lib/graph-editor.component.ts` (1566 lines) |
| Public API exports | `projects/graph-editor/src/public-api.ts` |
| Config interfaces | `projects/graph-editor/src/lib/graph-editor.config.ts` |
| Data models | `projects/graph-editor/src/lib/graph.model.ts` |
| Demo app | `src/app/app.component.ts` |
| Library package.json | `projects/graph-editor/package.json` (version lives here) |

---

## ARCHITECTURE

**Configuration-driven**: all behavior flows from `GraphEditorConfig`. No hardcoded domain logic.  
**Signal-based state**: uses Angular 19 `signal()`, `computed()`, `effect()` — no RxJS in library.  
**Single-component library**: everything is in `GraphEditorComponent`. No services, no sub-components.  
**Custom rendering**: node/edge components injected via `component: Type<any>` in config — **not yet implemented**, currently `null as any` is used.

---

## PUBLIC API

### Inputs
- `config: GraphEditorConfig` — required
- `graph: Graph` — default `{ nodes: [], edges: [] }`
- `readonly: boolean` — disables all editing
- `visualizationMode: boolean` — display only
- `overlayData?: Map<string, any>`

### Outputs
`graphChange`, `nodeAdded`, `nodeUpdated`, `nodeRemoved`, `edgeAdded`, `edgeUpdated`, `edgeRemoved`, `selectionChange`, `validationChange`, `nodeClick`, `nodeDoubleClick`, `edgeClick`, `edgeDoubleClick`, `canvasClick`, `contextMenu`

### Methods (via ViewChild)
```typescript
addNode(type, position?)       removeNode(id, removeEdges?)   updateNode(id, updates)
selectNode(id)                 selectEdge(id)                 clearSelection()
getSelection()                 applyLayout(dir?)              fitToScreen(padding?)
zoomTo(level)                  validate()                     removeEdge(id)
setEdgeDirection(dir)          switchTool('hand'|'line')
```

### Exported Types
`Graph`, `GraphNode`, `GraphEdge`, `Position`, `GraphEditorConfig`, `NodesConfig`, `EdgesConfig`, `CanvasConfig`, `ValidationConfig`, `LayoutConfig`, `PaletteConfig`, `NodeTypeDefinition`, `PortConfig`, `NodeConstraints`, `SelectionState`, `ValidationResult`, `ValidationError`, `ValidationRule`, `ContextMenuConfig`, `ContextMenuItem`, `ContextMenuEvent`

---

## DATA MODEL

```typescript
Graph      { nodes: GraphNode[], edges: GraphEdge[], metadata? }
GraphNode  { id, type, data, position: {x,y}, metadata? }
GraphEdge  { id, source, target, sourcePort?, targetPort?, data?, metadata? }
// metadata: [key: string]: any  — extensible by design, any is justified here
```

---

## CONVENTIONS

- **2-space indent, LF line endings** (.editorconfig)
- **Strict TypeScript**: `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` all enabled
- **Strict Angular templates**: `strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`
- **isolatedModules: true** — use `export type` for type-only re-exports (already done in public-api.ts)
- **Component selector prefix**: `graph-` (e.g. `graph-editor`)
- **CSS variable prefix**: `--graph-editor-*`
- **CSS class prefix**: `graph-*`
- **Node/edge IDs**: auto-generated as `node_${timestamp}_${random}` — recommend UUIDs in user data

---

## ANTI-PATTERNS

- **Do not use `as any` or `@ts-ignore`** — strict mode is on; find the right type
- **Do not add `null as any` for `component` fields** — this is a known gap, fix it properly when implementing custom component rendering
- **Do not import from `dist/`** — always import from `projects/graph-editor/src/`
- **Do not publish with `npm publish dist/graph-editor`** — use `npm publish ./dist/graph-editor` (the `./` prefix matters)
- **Do not add business logic to the library** — it is intentionally domain-agnostic
- **Do not use RxJS** in library code — signals only

---

## KNOWN GAPS (do not assume these work)

- **Context menus**: stubbed at line 1349 with `// TODO: Show context menu`
- **Custom component rendering**: `component: Type<any>` in config is never used for rendering
- **Tests**: zero spec files exist — test infrastructure is ready (Karma/Jasmine) but nothing written
- **ESLint/Prettier**: not configured

---

## COMMANDS

```bash
npm run build          # dev build (library only)
npm run build:prod     # production build → dist/graph-editor/
npm run watch          # watch mode
npm start              # serve demo app at localhost:4200
npm test               # run tests (ChromeHeadless, watch=false)
npm run test:coverage  # coverage report

# Publish (after build:prod)
npm publish ./dist/graph-editor --access public
```

### CI
- **ci.yml**: triggers on push/PR to main → `npm ci` → `build:prod` → `test --watch=false --browsers=ChromeHeadless`
- **publish.yml**: triggers on GitHub Release published → build → publish to npm
- Token: set `NPM_TOKEN` in GitHub repo secrets

### Release flow
1. Bump version in `projects/graph-editor/package.json`
2. `npm run build:prod`
3. Push + create GitHub Release with tag `vX.Y.Z`
4. publish.yml fires automatically
