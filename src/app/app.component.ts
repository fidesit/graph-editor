import { Component, signal, viewChild } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { GraphEditorComponent, Graph, GraphEditorConfig } from '@utisha/graph-editor';

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
          <button (click)="addProcessNode()">Add Process</button>
          <button (click)="addDecisionNode()">Add Decision</button>
          <button (click)="autoLayout()">Auto Layout</button>
          <button (click)="fitToScreen()">Fit to Screen</button>
          <button (click)="showHelp.set(true)">Help</button>
        </div>
      </header>

      <main class="demo-main">
        <graph-editor
          #editor
          [config]="editorConfig"
          [graph]="currentGraph()"
          (graphChange)="onGraphChange($event)"
          (nodeClick)="onNodeClick($event)"
          (edgeClick)="onEdgeClick($event)"
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
      gap: 8px;
    }

    .header-actions button {
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .header-actions button:hover {
      background: #f9fafb;
      border-color: #3b82f6;
      color: #3b82f6;
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
  `]
})
export class AppComponent {
  editorConfig: GraphEditorConfig = {
    nodes: {
      types: [
        {
          type: 'process',
          label: 'Process',
          icon: '⚙️',
          component: null as any, // Using default rendering
          defaultData: { name: 'New Process' },
          size: { width: 180, height: 80 }
        },
        {
          type: 'decision',
          label: 'Decision',
          icon: '🔀',
          component: null as any,
          defaultData: { name: 'Decision' },
          size: { width: 180, height: 80 }
        },
        {
          type: 'start',
          label: 'Start',
          icon: '▶️',
          component: null as any,
          defaultData: { name: 'Start' },
          size: { width: 180, height: 80 }
        },
        {
          type: 'end',
          label: 'End',
          icon: '⏹️',
          component: null as any,
          defaultData: { name: 'End' },
          size: { width: 180, height: 80 }
        }
      ],
      defaultSize: { width: 180, height: 80 }
    },
    edges: {
      component: null as any,
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
        snap: true,
        color: '#e5e7eb'
      },
      zoom: {
        enabled: true,
        min: 0.25,
        max: 2.0,
        step: 0.1,
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

  onGraphChange(graph: Graph): void {
    this.currentGraph.set(graph);
  }

  onNodeClick(node: any): void {
    console.log('Node clicked:', node);
  }

  onEdgeClick(edge: any): void {
    console.log('Edge clicked:', edge);
  }

  addProcessNode(): void {
    const graph = this.currentGraph();
    const newNode = {
      id: `process_${Date.now()}`,
      type: 'process',
      data: { name: 'New Process' },
      position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 }
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
  }

  addDecisionNode(): void {
    const graph = this.currentGraph();
    const newNode = {
      id: `decision_${Date.now()}`,
      type: 'decision',
      data: { name: 'New Decision' },
      position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 }
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
  }

  autoLayout(): void {
    this.editor().applyLayout();
  }

  fitToScreen(): void {
    this.editor().fitToScreen();
  }
}
