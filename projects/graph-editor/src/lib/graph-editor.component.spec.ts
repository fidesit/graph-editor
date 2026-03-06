// Karma + Jasmine test suite

import { TestBed } from '@angular/core/testing';
import { GraphEditorComponent } from './graph-editor.component';
import { GraphEditorConfig } from './graph-editor.config';

const minimalConfig: GraphEditorConfig = {
  nodes: {
    types: [
      {
        type: 'default',
        label: 'Default',
        component: null as any,
        defaultData: {}
      }
    ]
  },
  edges: {
    component: null as any
  }
};

describe('GraphEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphEditorComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should initialize with empty graph', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    const selection = fixture.componentInstance.getSelection();
    expect(selection.nodes).toEqual([]);
    expect(selection.edges).toEqual([]);
  });

  it('should add a node', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    const node = fixture.componentInstance.addNode('default', { x: 100, y: 100 });
    expect(node).toBeTruthy();
    expect(node.type).toBe('default');
  });

  it('should remove a node', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    const node = fixture.componentInstance.addNode('default', { x: 100, y: 100 });
    fixture.componentInstance.removeNode(node.id);
    const selection = fixture.componentInstance.getSelection();
    expect(selection.nodes).toEqual([]);
  });

  it('should select and clear a node', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    const node = fixture.componentInstance.addNode('default', { x: 100, y: 100 });
    fixture.componentInstance.selectNode(node.id);
    expect(fixture.componentInstance.getSelection().nodes[0]).toBe(node.id);
    fixture.componentInstance.clearSelection();
    expect(fixture.componentInstance.getSelection().nodes).toEqual([]);
  });

  it('should validate an empty graph', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    const result = fixture.componentInstance.validate();
    expect(result).toBeTruthy();
    expect(typeof result.valid).toBe('boolean');
  });

  it('should have hand tool active by default', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTool()).toBe('hand');
  });

  it('should assign distinct ports to parallel edges on JSON load', () => {
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', minimalConfig);
    fixture.componentRef.setInput('graph', {
      nodes: [
        { id: 'a', type: 'default', data: {}, position: { x: 0, y: 0 } },
        { id: 'b', type: 'default', data: {}, position: { x: 300, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'b' },
        { id: 'e3', source: 'a', target: 'b' }
      ]
    });
    fixture.detectChanges();

    const edges = fixture.componentInstance.internalGraph().edges;
    // Every edge should have ports assigned
    for (const edge of edges) {
      expect(edge.sourcePort).toBeTruthy();
      expect(edge.targetPort).toBeTruthy();
    }
    // No two edges should share the exact same sourcePort+targetPort pair
    const portPairs = edges.map(e => `${e.sourcePort}|${e.targetPort}`);
    const uniquePairs = new Set(portPairs);
    expect(uniquePairs.size).toBe(portPairs.length);
  });

  it('should not overwrite existing ports when preservePorts is true', () => {
    const preserveConfig: GraphEditorConfig = {
      ...minimalConfig,
      edges: { ...minimalConfig.edges, preservePorts: true }
    };
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', preserveConfig);
    fixture.componentRef.setInput('graph', {
      nodes: [
        { id: 'a', type: 'default', data: {}, position: { x: 0, y: 0 } },
        { id: 'b', type: 'default', data: {}, position: { x: 300, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', sourcePort: 'top-0', targetPort: 'bottom-0' }
      ]
    });
    fixture.detectChanges();

    const edge = fixture.componentInstance.internalGraph().edges[0];
    expect(edge.sourcePort).toBe('top-0');
    expect(edge.targetPort).toBe('bottom-0');
  });

  it('should still assign ports to edges without ports even when preservePorts is true', () => {
    const preserveConfig: GraphEditorConfig = {
      ...minimalConfig,
      edges: { ...minimalConfig.edges, preservePorts: true }
    };
    const fixture = TestBed.createComponent(GraphEditorComponent);
    fixture.componentRef.setInput('config', preserveConfig);
    fixture.componentRef.setInput('graph', {
      nodes: [
        { id: 'a', type: 'default', data: {}, position: { x: 0, y: 0 } },
        { id: 'b', type: 'default', data: {}, position: { x: 300, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' }
      ]
    });
    fixture.detectChanges();

    const edge = fixture.componentInstance.internalGraph().edges[0];
    // Edge had no ports, so they should be assigned even with preservePorts
    expect(edge.sourcePort).toBeTruthy();
    expect(edge.targetPort).toBeTruthy();
  });
});
