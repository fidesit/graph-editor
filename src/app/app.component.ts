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
          <div class="help-header">
            <h2>Keyboard & Mouse</h2>
            <button class="close-btn" (click)="showHelp.set(false)">×</button>
          </div>
          <div class="help-content">
            <section>
              <h3>Canvas</h3>
              <ul>
                <li><kbd>Scroll</kbd> Zoom in/out</li>
                <li><kbd>Drag</kbd> on canvas — Pan</li>
              </ul>
            </section>
            <section>
              <h3>Nodes</h3>
              <ul>
                <li><kbd>Click</kbd> Select node</li>
                <li><kbd>Drag</kbd> Move node</li>
                <li><kbd>Delete</kbd> Remove selected</li>
                <li><kbd>Arrow keys</kbd> Nudge 1px (+ Shift = 10px)</li>
              </ul>
            </section>
            <section>
              <h3>Edges</h3>
              <ul>
                <li>Use <b>Line tool</b> in left palette</li>
                <li><kbd>Click</kbd> source node, then target</li>
                <li><kbd>Click</kbd> edge to select & change direction</li>
              </ul>
            </section>
            <section>
              <h3>General</h3>
              <ul>
                <li><kbd>Escape</kbd> Cancel / clear selection</li>
              </ul>
            </section>
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
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .help-popup {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      max-width: 420px;
      width: 90%;
    }

    .help-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
    }

    .help-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #6b7280;
      line-height: 1;
    }

    .close-btn:hover {
      color: #111827;
    }

    .help-content {
      padding: 16px 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .help-content section h3 {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      margin: 0 0 8px;
    }

    .help-content ul {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 13px;
    }

    .help-content li {
      margin-bottom: 6px;
      color: #374151;
    }

    kbd {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 12px;
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
