import { Component, signal, viewChild, computed } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { GraphEditorComponent, Graph, GraphEditorConfig, NodeTypeDefinition, ContextMenuEvent } from '@utisha/graph-editor';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphEditorComponent, JsonPipe],
  template: `
    <div class="demo-container">
      <header class="demo-header">
        <h1>&#64;utisha/graph-editor</h1>
        <p>Configuration-driven visual graph editor for Angular 19+</p>
        <div class="header-actions">
          <div class="theme-group">
            <span class="theme-label">Theme</span>
            <select class="theme-select" (change)="onThemeChange($event)" [value]="currentTheme()">
              <option value="default">Default</option>
              <option value="compact">Compact</option>
              <option value="detailed">Detailed</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div class="action-divider"></div>
          <button class="action-btn" (click)="autoLayout()" title="Auto Layout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Layout</span>
          </button>
          <button class="action-btn" (click)="fitToScreen()" title="Fit to Screen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
            <span>Fit</span>
          </button>
          <button class="action-btn help-btn" (click)="showHelp.set(true)" title="Help">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>

      <main class="demo-main">
        <graph-editor
          #editor
          [config]="editorConfig()"
          [graph]="currentGraph()"
          (graphChange)="onGraphChange($event)"
          (nodeClick)="onNodeClick($event)"
          (edgeClick)="onEdgeClick($event)"
          (contextMenu)="onContextMenu($event)"
        />
      </main>

      <aside class="demo-sidebar">
        <h3>Graph Data</h3>
        <pre>{{ currentGraph() | json }}</pre>
      </aside>
    </div>

    @if (showHelp()) {
      <div class="help-overlay" (click)="showHelp.set(false)">
        <div class="help-popup" (click)="$event.stopPropagation()">
          <button class="close-btn" (click)="showHelp.set(false)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <div class="help-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </div>
          <h2>Keyboard & Mouse</h2>
          <p class="help-subtitle">Quick reference for graph editor controls</p>
          <div class="help-grid">
            <div class="help-card">
              <div class="card-icon">🖱️</div>
              <h3>Canvas</h3>
              <ul>
                <li><kbd>Scroll</kbd> <span>Zoom in/out</span></li>
                <li><kbd>Drag</kbd> <span>Pan view</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">⬡</div>
              <h3>Nodes</h3>
              <ul>
                <li><kbd>Click</kbd> <span>Select</span></li>
                <li><kbd>Drag</kbd> <span>Move</span></li>
                <li><kbd>Del</kbd> <span>Remove</span></li>
                <li><kbd>↑↓←→</kbd> <span>Nudge</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">↗</div>
              <h3>Edges</h3>
              <ul>
                <li><kbd>Line tool</kbd> <span>Draw mode</span></li>
                <li><kbd>Click → Click</kbd> <span>Connect</span></li>
                <li><kbd>Click edge</kbd> <span>Direction</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">⌨</div>
              <h3>General</h3>
              <ul>
                <li><kbd>Esc</kbd> <span>Cancel</span></li>
                <li><kbd>Shift+↑↓←→</kbd> <span>Nudge 10px</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    }

    @if (contextMenu()) {
      <div class="context-menu-overlay" (click)="closeContextMenu()">
        <div
          class="context-menu"
          [style.left.px]="contextMenu()!.position.x"
          [style.top.px]="contextMenu()!.position.y"
          (click)="$event.stopPropagation()"
        >
          @if (contextMenu()!.type === 'canvas') {
            <button class="context-menu-item" (click)="addNodeAtPosition()">
              <span class="context-menu-icon">➕</span>
              Add Node Here
            </button>
          }
          @if (contextMenu()!.type === 'node') {
            <button class="context-menu-item" (click)="duplicateNode()">
              <span class="context-menu-icon">📋</span>
              Duplicate
            </button>
            <button class="context-menu-item danger" (click)="deleteNode()">
              <span class="context-menu-icon">🗑️</span>
              Delete Node
            </button>
          }
          @if (contextMenu()!.type === 'edge') {
            <button class="context-menu-item" (click)="reverseEdge()">
              <span class="context-menu-icon">🔄</span>
              Reverse Direction
            </button>
            <button class="context-menu-item danger" (click)="deleteEdge()">
              <span class="context-menu-icon">🗑️</span>
              Delete Edge
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .demo-container {
      display: grid;
      grid-template-rows: auto 1fr;
      grid-template-columns: 1fr 300px;
      height: 100vh;
      gap: 0;
    }

    .demo-header {
      grid-column: 1 / -1;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .demo-header h1 {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .demo-header p {
      font-size: 14px;
      color: #6b7280;
    }

    .header-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .theme-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .theme-label {
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
    }

    .action-divider {
      width: 1px;
      height: 32px;
      background: #e5e7eb;
      margin: 0 8px;
    }

    .theme-select {
      padding: 8px 32px 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      color: #374151;
      appearance: none;
      -webkit-appearance: none;
    }

    .theme-select:hover {
      border-color: #d1d5db;
      background-color: #f9fafb;
    }

    .theme-select:focus {
      outline: none;
      border-color: #3b82f6;
      background-color: white;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: #f9fafb;
      border-color: #d1d5db;
      color: #111827;
    }

    .action-btn:active {
      background: #f3f4f6;
      transform: translateY(1px);
    }

    .action-btn svg {
      flex-shrink: 0;
    }

    .help-btn {
      padding: 8px;
      color: #6b7280;
    }

    .help-btn:hover {
      color: #3b82f6;
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .demo-main {
      background: #f8f9fa;
      overflow: hidden;
    }

    .demo-sidebar {
      background: white;
      border-left: 1px solid #e5e7eb;
      padding: 16px;
      overflow: auto;
    }

    .demo-sidebar h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #374151;
    }

    .demo-sidebar pre {
      font-size: 12px;
      background: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    graph-editor {
      display: block;
      width: 100%;
      height: 100%;
    }

    .help-overlay {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .help-popup {
      position: relative;
      background: white;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 520px;
      width: 90%;
      padding: 32px;
      text-align: center;
      animation: slideUp 0.2s ease-out;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: #f3f4f6;
      border: none;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #6b7280;
      transition: all 0.15s;
    }

    .close-btn:hover {
      background: #e5e7eb;
      color: #111827;
    }

    .help-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 14px;
      color: white;
      margin-bottom: 16px;
    }

    .help-popup h2 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px;
    }

    .help-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 24px;
    }

    .help-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      text-align: left;
    }

    .help-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }

    .card-icon {
      font-size: 20px;
      margin-bottom: 8px;
    }

    .help-card h3 {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin: 0 0 10px;
    }

    .help-card ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .help-card li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 6px;
    }

    .help-card li:last-child {
      margin-bottom: 0;
    }

    .help-card li span {
      color: #6b7280;
    }

    kbd {
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      color: #374151;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .context-menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }

    .context-menu {
      position: fixed;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border: 1px solid #e5e7eb;
      padding: 4px;
      min-width: 160px;
      animation: contextMenuIn 0.1s ease-out;
    }

    @keyframes contextMenuIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: none;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
      border-radius: 4px;
      text-align: left;
      transition: background 0.1s;
    }

    .context-menu-item:hover {
      background: #f3f4f6;
    }

    .context-menu-item.danger {
      color: #dc2626;
    }

    .context-menu-item.danger:hover {
      background: #fef2f2;
    }

    .context-menu-icon {
      font-size: 14px;
      width: 18px;
      text-align: center;
    }
  `]
})
export class AppComponent {
  // Theme presets
  private readonly themes: Record<string, { nodeSize: { width: number; height: number }; shadows: boolean; gridSize: number }> = {
    default: { nodeSize: { width: 180, height: 80 }, shadows: true, gridSize: 20 },
    compact: { nodeSize: { width: 140, height: 60 }, shadows: false, gridSize: 15 },
    detailed: { nodeSize: { width: 220, height: 100 }, shadows: true, gridSize: 25 },
    minimal: { nodeSize: { width: 160, height: 70 }, shadows: false, gridSize: 20 }
  };

  currentTheme = signal<string>('default');

  // Base node types (size will be applied from theme)
  private readonly nodeTypes: Omit<NodeTypeDefinition, 'size'>[] = [
    { type: 'process', label: 'Process', icon: '⚙️', component: null as any, defaultData: { name: 'New Process' } },
    { type: 'decision', label: 'Decision', icon: '🔀', component: null as any, defaultData: { name: 'Decision' } },
    { type: 'start', label: 'Start', icon: '▶️', component: null as any, defaultData: { name: 'Start' } },
    { type: 'end', label: 'End', icon: '⏹️', component: null as any, defaultData: { name: 'End' } }
  ];

  // Computed config based on theme
  editorConfig = computed<GraphEditorConfig>(() => {
    const theme = this.themes[this.currentTheme()];
    return {
      nodes: {
        types: this.nodeTypes.map(t => ({ ...t, size: theme.nodeSize })),
        defaultSize: theme.nodeSize,
        iconPosition: 'top-left'
      },
      edges: {
        component: null as any,
        style: { stroke: '#94a3b8', strokeWidth: 2, markerEnd: 'arrow' }
      },
      canvas: {
        grid: { enabled: true, size: theme.gridSize, snap: true, color: '#e5e7eb' },
        zoom: { enabled: true, min: 0.25, max: 2.0, step: 0.1, wheelEnabled: true },
        pan: { enabled: true }
      },
      palette: { enabled: true, position: 'left' },
      theme: { shadows: theme.shadows }
    };
  });

  currentGraph = signal<Graph>({
    nodes: [
      { id: 'start', type: 'start', data: { name: 'Start' }, position: { x: 100, y: 100 } },
      { id: 'process1', type: 'process', data: { name: 'Process Data' }, position: { x: 300, y: 100 } },
      { id: 'decision1', type: 'decision', data: { name: 'Is Valid?' }, position: { x: 500, y: 100 } },
      { id: 'end', type: 'end', data: { name: 'End' }, position: { x: 700, y: 100 } }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'process1' },
      { id: 'e2', source: 'process1', target: 'decision1' },
      { id: 'e3', source: 'decision1', target: 'end' }
    ]
  });

  private editor = viewChild.required<GraphEditorComponent>('editor');
  showHelp = signal(false);
  contextMenu = signal<ContextMenuEvent | null>(null);

  onGraphChange(graph: Graph): void {
    this.currentGraph.set(graph);
  }

  onNodeClick(node: any): void {
    console.log('Node clicked:', node);
  }

  onEdgeClick(edge: any): void {
    console.log('Edge clicked:', edge);
  }

  onThemeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentTheme.set(select.value);
  }


  autoLayout(): void {
    this.editor().applyLayout();
  }

  fitToScreen(): void {
    this.editor().fitToScreen();
  }

  // Context menu handlers
  onContextMenu(event: ContextMenuEvent): void {
    this.contextMenu.set(event);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  addNodeAtPosition(): void {
    const menu = this.contextMenu();
    if (!menu) return;
    const graph = this.currentGraph();
    const newNode = {
      id: `node_${Date.now()}`,
      type: 'process',
      data: { name: 'New Process' },
      position: menu.position
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
    this.closeContextMenu();
  }

  duplicateNode(): void {
    const menu = this.contextMenu();
    if (!menu?.nodeId) return;
    const graph = this.currentGraph();
    const node = graph.nodes.find(n => n.id === menu.nodeId);
    if (!node) return;
    const newNode = {
      ...node,
      id: `node_${Date.now()}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 }
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
    this.closeContextMenu();
  }

  deleteNode(): void {
    const menu = this.contextMenu();
    if (!menu?.nodeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      nodes: graph.nodes.filter(n => n.id !== menu.nodeId),
      edges: graph.edges.filter(e => e.source !== menu.nodeId && e.target !== menu.nodeId)
    });
    this.closeContextMenu();
  }

  reverseEdge(): void {
    const menu = this.contextMenu();
    if (!menu?.edgeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      ...graph,
      edges: graph.edges.map(e => 
        e.id === menu.edgeId
          ? { ...e, source: e.target, target: e.source }
          : e
      )
    });
    this.closeContextMenu();
  }

  deleteEdge(): void {
    const menu = this.contextMenu();
    if (!menu?.edgeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      ...graph,
      edges: graph.edges.filter(e => e.id !== menu.edgeId)
    });
    this.closeContextMenu();
  }
}
