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
});
