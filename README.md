# @utisha/graph-editor

[![npm version](https://badge.fury.io/js/@utisha%2Fgraph-editor.svg)](https://www.npmjs.com/package/@utisha/graph-editor)
[![CI](https://github.com/fidesit/graph-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/fidesit/graph-editor/actions/workflows/ci.yml)
[![Deploy](https://github.com/fidesit/graph-editor/actions/workflows/pages.yml/badge.svg)](https://fidesit.github.io/graph-editor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/fidesit/graph-editor)

Configuration-driven visual graph editor for Angular 19+.

**[Live Demo](https://fidesit.github.io/graph-editor)** | **[Try on StackBlitz](https://stackblitz.com/github/fidesit/graph-editor)**

![Graph Editor Demo](docs/demo.gif)

## Features

- ⚙️ **Configuration-driven** — No hardcoded domain logic
- 🎯 **Type-safe** — Full TypeScript support with strict mode
- 🎭 **Themeable** — CSS custom properties + optional shadows
- ⌨️ **Keyboard shortcuts** — Delete, arrow keys, escape built-in
- 📦 **Lightweight** — Only Angular + dagre dependencies
- 🔌 **Framework-agnostic data** — Works with any backend/state management

## Installation

```bash
npm install @utisha/graph-editor
```

## Quick Start

### 1. Import the component

```typescript
import { Component, signal } from '@angular/core';
import { GraphEditorComponent, Graph, GraphEditorConfig } from '@utisha/graph-editor';

@Component({
  selector: 'app-my-editor',
  standalone: true,
  imports: [GraphEditorComponent],
  template: `
    <graph-editor
      [config]="editorConfig"
      [graph]="currentGraph()"
      (graphChange)="onGraphChange($event)"
    />
  `
})
export class MyEditorComponent {
  // See configuration below
}
```

### 2. Configure the editor

```typescript
editorConfig: GraphEditorConfig = {
  nodes: {
    types: [
      {
        type: 'process',
        label: 'Process',
        icon: '⚙️',
        component: null, // Uses default rendering, or provide your own component
        defaultData: { name: 'New Process' },
        size: { width: 180, height: 80 }
      },
      {
        type: 'decision',
        label: 'Decision',
        icon: '🔀',
        component: null,
        defaultData: { name: 'Decision' },
        size: { width: 180, height: 80 }
      }
    ]
  },
  edges: {
    component: null, // Uses default rendering
    style: {
      stroke: '#94a3b8',
      strokeWidth: 2,
      markerEnd: 'arrow'
    }
  },
  canvas: {
    grid: {
      enabled: true,
      size: 20,
      snap: true
    },
    zoom: {
      enabled: true,
      min: 0.25,
      max: 2.0,
      wheelEnabled: true
    },
    pan: {
      enabled: true
    }
  },
  palette: {
    enabled: true,
    position: 'left'
  }
};
```

### 3. Initialize your graph

```typescript
currentGraph = signal<Graph>({
  nodes: [
    { id: '1', type: 'process', data: { name: 'Start' }, position: { x: 100, y: 100 } },
    { id: '2', type: 'decision', data: { name: 'Check' }, position: { x: 300, y: 100 } }
  ],
  edges: [
    { id: 'e1', source: '1', target: '2' }
  ]
});

onGraphChange(graph: Graph): void {
  this.currentGraph.set(graph);
  // Save to backend, update state, etc.
}
```

## Configuration

### GraphEditorConfig

| Property | Type | Description |
|----------|------|-------------|
| `nodes` | `NodesConfig` | Node type definitions + icon position |
| `edges` | `EdgesConfig` | Edge configuration |
| `canvas` | `CanvasConfig` | Canvas behavior (grid, zoom, pan) |
| `validation` | `ValidationConfig` | Validation rules |
| `palette` | `PaletteConfig` | Node palette configuration |
| `layout` | `LayoutConfig` | Layout algorithm (dagre) |
| `theme` | `ThemeConfig` | Visual theme (shadows, CSS variables) |

### Node Type Definition

```typescript
interface NodeTypeDefinition {
  type: string;           // Unique identifier
  label?: string;         // Display name in palette
  icon?: string;          // Icon (emoji or Material icon)
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

## API

### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `config` | `GraphEditorConfig` | Editor configuration (required) |
| `graph` | `Graph` | Current graph data |
| `readonly` | `boolean` | Disable editing |
| `visualizationMode` | `boolean` | Display only mode |

### Outputs

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

### Methods

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
applyLayout(direction?: 'TB' | 'LR'): Promise<void>;
fitToScreen(padding?: number): void;
zoomTo(level: number): void;

// Validation
validate(): ValidationResult;
```

## Theming

Customize the editor appearance using CSS custom properties:

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

## Validation

Add custom validation rules:

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

## Development

```bash
# Clone the repository
git clone https://github.com/fidesit/graph-editor.git
cd graph-editor

# Install dependencies
npm install

# Build the library
npm run build

# Run the demo app
npm run start

# Run tests
npm test
```

## Roadmap

- [ ] Custom node components via `foreignObject`
- [ ] Port-based connections with type checking
- [x] ~~Context menus~~ — Event emits on right-click (see demo for example UI)
- [ ] Multi-select with box selection
- [x] ~~Keyboard shortcuts~~ — Implemented (Del, arrows, Esc)
- [ ] Undo/redo
- [ ] Minimap
- [ ] Accessibility improvements

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) © Utisha / Fides IT
