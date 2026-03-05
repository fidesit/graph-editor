# API Reference

Full API documentation for `@utisha/graph-editor`.

## Configuration

### GraphEditorConfig

| Property | Type | Description |
|----------|------|-------------|
| `nodes` | `NodesConfig` | Node type definitions + icon position |
| `edges` | `EdgesConfig` | Edge configuration |
| `canvas` | `CanvasConfig` | Canvas behavior (grid, zoom, pan) |
| `validation` | `ValidationConfig` | Validation rules |
| `palette` | `PaletteConfig` | Node palette configuration |
| `layout` | `LayoutConfig` | Layout algorithm (dagre, compact) |
| `theme` | `ThemeConfig` | Visual theme (shadows, CSS variables) |
| `toolbar` | `ToolbarConfig` | Top toolbar visibility and button selection |
| `hooks` | `LifecycleHooks` | Lifecycle guards to intercept/cancel user actions |

### Node Type Definition

```typescript
interface NodeTypeDefinition {
  type: string;           // Unique identifier
  label?: string;         // Display name in palette
  icon?: string;          // Fallback icon (emoji or text)
  iconSvg?: SvgIconDefinition;  // Professional SVG icon (preferred)
  component: Type<any>;   // Angular component to render
  defaultData: Record<string, any>;
  size?: { width: number; height: number };
  ports?: PortConfig;     // Connection ports
  constraints?: NodeConstraints;
}
```

### Canvas Configuration

```typescript
interface CanvasConfig {
  grid?: {
    enabled: boolean;
    size: number;      // Grid cell size in pixels
    snap: boolean;     // Snap nodes to grid
    color?: string;
  };
  zoom?: {
    enabled: boolean;
    min: number;       // Minimum zoom level
    max: number;       // Maximum zoom level
    step: number;      // Zoom increment
    wheelEnabled: boolean;
  };
  pan?: {
    enabled: boolean;
  };
}
```

## Inputs

| Input | Type | Description |
|-------|------|-------------|
| `config` | `GraphEditorConfig` | Editor configuration (required) |
| `graph` | `Graph` | Current graph data |
| `readonly` | `boolean` | Disable editing |
| `visualizationMode` | `boolean` | Display only mode |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `graphChange` | `EventEmitter<Graph>` | Emitted on any graph mutation |
| `nodeClick` | `EventEmitter<GraphNode>` | Node clicked |
| `nodeDoubleClick` | `EventEmitter<GraphNode>` | Node double-clicked |
| `edgeClick` | `EventEmitter<GraphEdge>` | Edge clicked |
| `edgeDoubleClick` | `EventEmitter<GraphEdge>` | Edge double-clicked |
| `selectionChange` | `EventEmitter<SelectionState>` | Selection changed |
| `validationChange` | `EventEmitter<ValidationResult>` | Validation state changed |
| `contextMenu` | `EventEmitter<ContextMenuEvent>` | Right-click on canvas/node/edge |

## Methods

```typescript
// Node operations
addNode(type: string, position?: Position): GraphNode;
removeNode(nodeId: string): void;
updateNode(nodeId: string, updates: Partial<GraphNode>): void;

// Selection
selectNode(nodeId: string | null): void;
selectEdge(edgeId: string | null): void;
clearSelection(): void;
getSelection(): SelectionState;

// Layout
applyLayout(algorithm?: 'dagre-tb' | 'dagre-lr' | 'compact'): Promise<void>;
fitToScreen(padding?: number): void;
zoomTo(level: number): void;

// Validation
validate(): ValidationResult;
```

## Custom Node Images

Nodes can display custom images instead of emoji icons. Set `imageUrl` in `defaultData` or per-instance in `node.data['imageUrl']`:

```typescript
// In node type definition (applies to all nodes of this type)
{
  type: 'agent',
  label: 'AI Agent',
  icon: '🤖',  // Fallback if imageUrl fails to load
  component: null,
  defaultData: {
    name: 'Agent',
    imageUrl: '/assets/icons/agent.svg'  // Custom image URL
  }
}

// Or per-instance (overrides type default)
const node: GraphNode = {
  id: '1',
  type: 'agent',
  data: {
    name: 'Custom Agent',
    imageUrl: 'https://example.com/custom-icon.png'  // Instance-specific
  },
  position: { x: 100, y: 100 }
};
```

Supported formats: SVG, PNG, JPG, data URLs, or any valid image URL.

**Icon priority:** `node.data['imageUrl']` → `nodeType.iconSvg` → `nodeType.defaultData['imageUrl']` → `nodeType.icon` (emoji fallback)

## Custom SVG Icons

Define your own SVG icons using the `SvgIconDefinition` interface. This allows you to use professional vector icons that match your design system:

```typescript
import { SvgIconDefinition, NodeTypeDefinition } from '@utisha/graph-editor';

// Define your icon set
const MY_ICONS: Record<string, SvgIconDefinition> = {
  process: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#6366f1',  // Your brand color
    strokeWidth: 1.75,
    path: `M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z
           M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06...`
  },
  decision: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#8b5cf6',
    strokeWidth: 1.75,
    path: `M12 3L21 12L12 21L3 12L12 3Z
           M12 8v4
           M12 16h.01`
  },
  start: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#22c55e',  // Semantic: green for start
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2...
           M10 8l6 4-6 4V8Z`
  }
};

// Use in node types
const nodeTypes: NodeTypeDefinition[] = [
  { type: 'process', label: 'Process', iconSvg: MY_ICONS.process, component: null, defaultData: { name: 'Process' } },
  { type: 'decision', label: 'Decision', iconSvg: MY_ICONS.decision, component: null, defaultData: { name: 'Decision' } },
  { type: 'start', label: 'Start', iconSvg: MY_ICONS.start, component: null, defaultData: { name: 'Start' } },
];
```

## Theming

Customize the editor appearance using `ThemeConfig` or CSS custom properties:

```css
:root {
  --graph-editor-canvas-bg: #f8f9fa;
  --graph-editor-grid-color: #e0e0e0;
  --graph-editor-node-bg: #ffffff;
  --graph-editor-node-border: #cbd5e0;
  --graph-editor-node-selected: #3b82f6;
  --graph-editor-edge-stroke: #94a3b8;
  --graph-editor-edge-selected: #3b82f6;
}
```

`ThemeConfig` provides full programmatic control over 7 sub-interfaces: `CanvasTheme`, `NodeTheme`, `EdgeTheme`, `PortTheme`, `SelectionTheme`, `FontTheme`, and `ToolbarTheme`.

## Validation

Add custom validation rules that run on demand or automatically on graph changes:

```typescript
const config: GraphEditorConfig = {
  // ...
  validation: {
    validateOnChange: true,
    validators: [
      {
        id: 'no-orphans',
        message: 'All nodes must be connected',
        validator: (graph) => {
          const orphans = findOrphanNodes(graph);
          return orphans.map(node => ({
            rule: 'no-orphans',
            message: `Node "${node.data.name}" is not connected`,
            nodeId: node.id,
            severity: 'warning'
          }));
        }
      }
    ]
  }
};
```

## Lifecycle Hooks

Lifecycle hooks let you intercept and cancel user-initiated graph mutations.
Configure them via the `hooks` property on `GraphEditorConfig`.

> **Note:** Hooks only apply to user-initiated actions (palette add, keyboard delete/cut, drag-to-connect).
> Programmatic API calls (`addNode()`, `removeNode()`, `removeEdge()`) do **not** trigger hooks.

### Hook Types

| Hook | Sync/Async | When |
|------|-----------|------|
| `canConnect` | **Sync** | Every mousemove during drag-to-connect and edge reconnection |
| `beforeNodeAdd` | Async | Before a node is added via the palette |
| `beforeNodeRemove` | Async | Before nodes are deleted (Delete/Backspace/Cut) |
| `beforeEdgeAdd` | Async | Before an edge is created via drag-to-connect |
| `beforeEdgeRemove` | Async | Before edges are deleted (Delete/Backspace/Cut) |

All async hooks accept a return type of `boolean | Promise<boolean>`. Returning (or resolving) `false` cancels the operation. If a hook throws an error, the operation is also cancelled.

### Example

```typescript
import { GraphEditorConfig, LifecycleHooks } from '@utisha/graph-editor';

const hooks: LifecycleHooks = {
  // Sync — called on every mousemove, must return immediately
  canConnect: (source, target, graph) => {
    // No self-loops
    if (source.nodeId === target.nodeId) return false;
    // No duplicate edges
    return !graph.edges.some(
      e => e.source === source.nodeId && e.target === target.nodeId
    );
  },

  // Async — can show confirmation dialogs or call a server
  beforeNodeRemove: async (nodes, graph) => {
    const critical = nodes.filter(n => n.type === 'start');
    if (critical.length > 0) {
      return confirm('Delete the Start node?');
    }
    return true;
  },

  beforeNodeAdd: (type, graph) => {
    // Only one Start node allowed
    if (type === 'start' && graph.nodes.some(n => n.type === 'start')) {
      return false;
    }
    return true;
  },

  beforeEdgeAdd: (edge, graph) => true,
  beforeEdgeRemove: (edges, graph) => true,
};

const config: GraphEditorConfig = {
  // ...nodes, edges, canvas, etc.
  hooks
};
```

### Demo

The [live demo](https://fidesit.github.io/graph-editor) includes a **Guards** toggle
that enables workflow-level lifecycle hooks with toast notifications:

- `canConnect` — prevents self-loops, duplicate edges, incoming to Start, outgoing from End
- `beforeNodeAdd` — enforces max 1 Start and 1 End node (with toast notification)
- `beforeNodeRemove` — shows `confirm()` dialog when deleting Start/End nodes
- `beforeEdgeAdd` — limits non-Decision nodes to 2 outgoing edges (with toast)

Toggle it off to compare unrestricted editing.
