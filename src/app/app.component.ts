import { Component, signal } from '@angular/core';
import { GraphEditorComponent, Graph, GraphEditorConfig } from '@utisha/graph-editor';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphEditorComponent],
  template: `
    <div class="demo-container">
      <header class="demo-header">
        <h1>@anthropic-ai/graph-editor</h1>
        <p>Configuration-driven visual graph editor for Angular 19+</p>
        <div class="header-actions">
          <button (click)="addProcessNode()">Add Process</button>
          <button (click)="addDecisionNode()">Add Decision</button>
          <button (click)="autoLayout()">Auto Layout</button>
          <button (click)="fitToScreen()">Fit to Screen</button>
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
          size: { width: 120, height: 60 }
        },
        {
          type: 'end',
          label: 'End',
          icon: '⏹️',
          component: null as any,
          defaultData: { name: 'End' },
          size: { width: 120, height: 60 }
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

  private editor: any;

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
    // Would call editor.applyLayout() if we had a ViewChild reference
    console.log('Auto layout - implement ViewChild to access editor');
  }

  fitToScreen(): void {
    // Would call editor.fitToScreen() if we had a ViewChild reference
    console.log('Fit to screen - implement ViewChild to access editor');
  }
}
