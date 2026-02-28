import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  signal,
  computed,
  viewChild,
  ChangeDetectionStrategy,
  OnInit,
  OnChanges,
  SimpleChanges,
  effect
} from '@angular/core';
// dagre is loaded dynamically in applyLayout() to avoid compile-time resolution issues
import { Graph, GraphNode, GraphEdge, Position } from './graph.model';
import {
  GraphEditorConfig,
  SelectionState,
  ValidationResult,
  ContextMenuEvent
} from './graph-editor.config';

/**
 * Main graph editor component.
 * 
 * @example
 * <graph-editor
 *   [config]="editorConfig"
 *   [graph]="currentGraph()"
 *   (graphChange)="onGraphChange($event)"
 * />
 */
@Component({
  selector: 'graph-editor',
  standalone: true,
  imports: [],
  host: {
    'tabindex': '0',
    'style': 'outline: none;',
    '(keydown)': 'onKeyDown($event)'
  },
  template: `
    <div class="graph-editor-container">
      <!-- Canvas with overlaid palette -->
      <div class="graph-canvas-wrapper">
        <!-- Top-left horizontal palette overlay -->
        @if (config.palette?.enabled !== false) {
          <div class="graph-palette-overlay">
            <!-- Tools -->
            <button
              class="palette-item tool-item"
              [class.active]="activeTool() === 'hand'"
              title="Hand tool (move nodes)"
              (click)="switchTool('hand')"
            >
              <span class="icon">✋</span>
            </button>
            <button
              class="palette-item tool-item"
              [class.active]="activeTool() === 'line'"
              title="Line tool (draw connections)"
              (click)="switchTool('line')"
            >
              <span class="icon">∕</span>
            </button>
            
            <!-- Divider -->
            <div class="palette-divider"></div>
            
            <!-- Node types -->
            @for (nodeType of config.nodes.types; track nodeType.type) {
              <button
                class="palette-item"
                [attr.data-node-type]="nodeType.type"
                [attr.title]="nodeType.label || nodeType.type"
                (click)="addNode(nodeType.type)"
              >
                <span class="icon">{{ nodeType.icon || '●' }}</span>
              </button>
            }
          </div>
        }
        
        <svg
          #canvasSvg
          [class.tool-line]="activeTool() === 'line'"
          [attr.width]="'100%'"
          [attr.height]="'100%'"
          (mousedown)="onCanvasMouseDown($event)"
          (mousemove)="onCanvasMouseMove($event)"
          (mouseup)="onCanvasMouseUp($event)"
          (wheel)="onWheel($event)"
          (contextmenu)="onContextMenu($event)"
        >
          <!-- Arrow marker definitions -->
          <defs>
            <marker id="arrow-end" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#94a3b8"/>
            </marker>
            <marker id="arrow-end-selected" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#3b82f6"/>
            </marker>
            <marker id="arrow-start" viewBox="0 0 10 10" refX="1" refY="5"
              markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 10 1 L 2 5 L 10 9 z" fill="#94a3b8"/>
            </marker>
            <marker id="arrow-start-selected" viewBox="0 0 10 10" refX="1" refY="5"
              markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 10 1 L 2 5 L 10 9 z" fill="#3b82f6"/>
            </marker>
          </defs>

          <!-- Main transform group (pan + zoom) -->
          <g [attr.transform]="transform()">
            <!-- Grid (if enabled) -->
            <!-- Grid (if enabled) - extended to cover viewport during pan -->
            @if (config.canvas?.grid?.enabled) {
              <defs>
                <pattern
                  id="grid"
                  [attr.width]="config.canvas!.grid!.size"
                  [attr.height]="config.canvas!.grid!.size"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    [attr.d]="'M ' + config.canvas!.grid!.size + ' 0 L 0 0 0 ' + config.canvas!.grid!.size"
                    fill="none"
                    [attr.stroke]="config.canvas!.grid!.color || '#e0e0e0'"
                    stroke-width="1"
                  />
                </pattern>
              </defs>
              <!-- Extended grid background covering viewport + pan offset -->
              <rect
                [attr.x]="gridBounds().x"
                [attr.y]="gridBounds().y"
                [attr.width]="gridBounds().width"
                [attr.height]="gridBounds().height"
                fill="url(#grid)"
              />
            }

            <!-- Layer 0.5: Preview line for line tool (rubber-band) -->
            @if (previewLine()) {
              <line
                [attr.x1]="previewLine()!.source.x"
                [attr.y1]="previewLine()!.source.y"
                [attr.x2]="previewLine()!.target.x"
                [attr.y2]="previewLine()!.target.y"
                stroke="#3b82f6"
                stroke-width="2"
                stroke-dasharray="6,4"
                opacity="0.6"
              />
            }

            <!-- Layer 1: Edge paths (behind everything) -->
            @for (edge of internalGraph().edges; track edge.id) {
              <!-- Invisible wide hit-area for easier clicking (hand tool only) -->
              <path
                [attr.d]="getEdgePath(edge)"
                stroke="transparent"
                [attr.stroke-width]="16"
                fill="none"
                class="edge-hit-area"
                [attr.pointer-events]="activeTool() === 'hand' ? 'stroke' : 'none'"
                (click)="onEdgeClick($event, edge)"
                (dblclick)="onEdgeDoubleClick($event, edge)"
              />
              <!-- Visible edge line -->
              <path
                [attr.d]="getEdgePath(edge)"
                [attr.stroke]="getEdgeColor(edge)"
                [attr.stroke-width]="2"
                fill="none"
                [class.selected]="selection().edges.includes(edge.id)"
                [attr.marker-end]="getEdgeMarkerEnd(edge)"
                [attr.marker-start]="getEdgeMarkerStart(edge)"
                pointer-events="none"
              />
            }

            <!-- Layer 2: Nodes -->
            @for (node of internalGraph().nodes; track node.id) {
              <g
                [attr.transform]="'translate(' + node.position.x + ',' + node.position.y + ')'"
                class="graph-node"
                [class.selected]="selection().nodes.includes(node.id)"
                [attr.data-node-id]="node.id"
                (mousedown)="onNodeMouseDown($event, node)"
                (click)="onNodeClick($event, node)"
                (dblclick)="nodeDoubleClick.emit(node)"
              >
                <!-- Node background -->
                <rect
                  [attr.width]="getNodeSize(node).width"
                  [attr.height]="getNodeSize(node).height"
                  [attr.fill]="'white'"
                  [attr.stroke]="selection().nodes.includes(node.id) ? '#3b82f6' : '#cbd5e0'"
                  [attr.stroke-width]="selection().nodes.includes(node.id) ? 3 : 2"
                  rx="8"
                />
                
                <!-- Node type icon badge (top-left, with padding from corner) -->
                <g class="node-type-badge">
                  <circle
                    cx="28"
                    cy="28"
                    r="16"
                    fill="#f3f4f6"
                    stroke="#cbd5e0"
                    stroke-width="2"
                  />
                  <text
                    x="28"
                    y="28"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    font-size="20"
                    fill="#374151"
                  >
                    {{ getNodeTypeIcon(node) }}
                  </text>
                </g>
                
                <!-- Node label -->
                <text
                  [attr.x]="getNodeSize(node).width / 2"
                  [attr.y]="getNodeSize(node).height / 2"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="14"
                >
                  {{ node.data['name'] || node.type }}
                </text>
              </g>
            }

            <!-- Layer 3: Attachment points (on top of nodes) -->
            @for (node of internalGraph().nodes; track node.id) {
              @if (showAttachmentPoints() === node.id) {
                <g [attr.transform]="'translate(' + node.position.x + ',' + node.position.y + ')'">
                  @for (port of getNodePorts(node); track port.position) {
                    <circle
                      [attr.cx]="port.x"
                      [attr.cy]="port.y"
                      [attr.r]="hoveredPort?.nodeId === node.id && hoveredPort?.port === port.position ? 8 : 6"
                      [attr.fill]="hoveredPort?.nodeId === node.id && hoveredPort?.port === port.position ? '#2563eb' : '#94a3b8'"
                      stroke="white"
                      stroke-width="2"
                      class="attachment-point"
                      [class.hovered]="hoveredPort?.nodeId === node.id && hoveredPort?.port === port.position"
                      (mousedown)="$event.stopPropagation()"
                      (click)="onAttachmentPointClick($event, node, port.position)"
                    />
                  }
                </g>
              }
            }

            <!-- Layer 4: Edge endpoints (only visible when edge is selected) -->
            @for (edge of internalGraph().edges; track edge.id) {
              @if (selection().edges.includes(edge.id)) {
                <g>
                  <!-- Source endpoint -->
                  <circle
                    [attr.cx]="getEdgeSourcePoint(edge).x"
                    [attr.cy]="getEdgeSourcePoint(edge).y"
                    r="6"
                    fill="#3b82f6"
                    stroke="white"
                    stroke-width="2"
                    class="edge-endpoint selected"
                    (mousedown)="onEdgeEndpointMouseDown($event, edge, 'source')"
                  />
                  
                  <!-- Target endpoint -->
                  <circle
                    [attr.cx]="getEdgeTargetPoint(edge).x"
                    [attr.cy]="getEdgeTargetPoint(edge).y"
                    r="6"
                    fill="#3b82f6"
                    stroke="white"
                    stroke-width="2"
                    class="edge-endpoint selected"
                    (mousedown)="onEdgeEndpointMouseDown($event, edge, 'target')"
                  />
                </g>
              }
            }
          </g>
        </svg>
      </div>

      <!-- Edge direction selector overlay -->
      @if (selectedEdgeMidpoint()) {
        <div
          class="edge-direction-selector"
          [style.left.px]="selectedEdgeMidpoint()!.x"
          [style.top.px]="selectedEdgeMidpoint()!.y"
        >
          <button
            class="direction-btn"
            [class.active]="selectedEdgeMidpoint()!.edge.direction === 'backward'"
            title="Backward"
            (click)="setEdgeDirection('backward')"
          >←</button>
          <button
            class="direction-btn"
            [class.active]="selectedEdgeMidpoint()!.edge.direction === 'bidirectional'"
            title="Bidirectional"
            (click)="setEdgeDirection('bidirectional')"
          >↔</button>
          <button
            class="direction-btn"
            [class.active]="!selectedEdgeMidpoint()!.edge.direction || selectedEdgeMidpoint()!.edge.direction === 'forward'"
            title="Forward"
            (click)="setEdgeDirection('forward')"
          >→</button>
        </div>
      }
      <!-- Validation errors -->
      @if (validationResult() && !validationResult()!.valid) {
        <div class="validation-panel">
          <h4>Validation Errors</h4>
          @for (error of validationResult()!.errors; track error.rule) {
            <div class="error-item" [class.warning]="error.severity === 'warning'">
              {{ error.message }}
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .graph-editor-container {
      display: flex;
      width: 100%;
      height: 100%;
      position: relative;
      background: var(--graph-editor-canvas-bg, #f8f9fa);
    }

    .graph-palette-overlay {
      position: absolute;
      top: 16px;
      left: 16px;
      display: flex;
      gap: 4px;
      z-index: 10;
      background: rgba(255, 255, 255, 0.95);
      padding: 6px;
      border-radius: var(--radius-md, 8px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(4px);
    }

    .palette-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1.5px solid var(--neutral-200, #e5e7eb);
      border-radius: var(--radius-md, 8px);
      background: var(--white, #fff);
      color: var(--neutral-600, #4b5563);
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
      font-size: 20px;
    }

    .palette-item:focus-visible {
      outline: 2px solid var(--indigo-400, #818cf8);
      outline-offset: 2px;
    }

    .palette-item:hover {
      background: var(--neutral-50, #f9fafb);
      border-color: var(--interactive, #3b82f6);
      color: var(--interactive, #3b82f6);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }

    .palette-item:active {
      transform: translateY(0);
      box-shadow: none;
    }

    .palette-item.tool-item.active {
      background: var(--interactive, #3b82f6);
      border-color: var(--interactive, #3b82f6);
      color: white;
    }

    .palette-item.tool-item.active:hover {
      background: var(--interactive-hover, #2563eb);
      border-color: var(--interactive-hover, #2563eb);
      color: white;
    }

    .palette-divider {
      width: 1px;
      background: var(--neutral-200, #e5e7eb);
      align-self: stretch;
      margin: 4px 2px;
    }

    .graph-canvas-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .graph-canvas {
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    .graph-canvas:active {
      cursor: grabbing;
    }

    .graph-canvas.tool-line {
      cursor: crosshair;
    }

    .graph-canvas.tool-line .graph-node {
      cursor: crosshair;
    }

    .graph-node {
      cursor: move;
      user-select: none;
      -webkit-user-select: none;
    }

    .graph-node text {
      pointer-events: none;
    }

    .graph-node.selected rect {
      filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.4));
    }

    path.selected {
      stroke: #3b82f6 !important;
      stroke-width: 3 !important;
    }

    .edge-hit-area {
      cursor: pointer;
    }

    .edge-endpoint {
      cursor: pointer;
      transition: r 0.2s, fill 0.2s;
    }

    .edge-endpoint:hover {
      r: 8;
      fill: #2563eb;
    }

    .edge-endpoint.selected {
      fill: #2563eb;
    }

    .attachment-point {
      cursor: crosshair;
      transition: all 0.2s;
    }

    .attachment-point.hovered {
      filter: drop-shadow(0 0 4px rgba(37, 99, 235, 0.6));
    }

    .validation-panel {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: white;
      border-top: 1px solid #e5e7eb;
      padding: 16px;
    }

    .error-item {
      padding: 8px 12px;
      margin-bottom: 8px;
      background: #fee2e2;
      border-left: 3px solid #ef4444;
      border-radius: 4px;
      font-size: 14px;
    }

    .error-item.warning {
      background: #fef3c7;
      border-left-color: #f59e0b;
    }

    .edge-direction-selector {
      position: absolute;
      transform: translate(-50%, -100%);
      margin-top: -12px;
      display: flex;
      gap: 2px;
      background: rgba(255, 255, 255, 0.95);
      padding: 4px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(4px);
      z-index: 20;
      pointer-events: auto;
    }

    .direction-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.15s;
      color: #6b7280;
    }

    .direction-btn:hover {
      background: #f3f4f6;
      border-color: #3b82f6;
      color: #3b82f6;
    }

    .direction-btn.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GraphEditorComponent implements OnInit, OnChanges {
  // Inputs
  @Input({ required: true }) config!: GraphEditorConfig;
  @Input() graph: Graph = { nodes: [], edges: [] };
  @Input() readonly = false;
  @Input() visualizationMode = false;
  @Input() overlayData?: Map<string, any>;

  // Outputs
  @Output() graphChange = new EventEmitter<Graph>();
  @Output() nodeAdded = new EventEmitter<GraphNode>();
  @Output() nodeUpdated = new EventEmitter<GraphNode>();
  @Output() nodeRemoved = new EventEmitter<GraphNode>();
  @Output() edgeAdded = new EventEmitter<GraphEdge>();
  @Output() edgeUpdated = new EventEmitter<GraphEdge>();
  @Output() edgeRemoved = new EventEmitter<GraphEdge>();
  @Output() selectionChange = new EventEmitter<SelectionState>();
  @Output() validationChange = new EventEmitter<ValidationResult>();
  @Output() nodeClick = new EventEmitter<GraphNode>();
  @Output() nodeDoubleClick = new EventEmitter<GraphNode>();
  @Output() edgeClick = new EventEmitter<GraphEdge>();
  @Output() edgeDoubleClick = new EventEmitter<GraphEdge>();
  @Output() canvasClick = new EventEmitter<Position>();
  @Output() contextMenu = new EventEmitter<ContextMenuEvent>();

  private readonly canvasSvgRef = viewChild<ElementRef>('canvasSvg');

  // Internal state
  internalGraph = signal<Graph>({ nodes: [], edges: [] });
  selection = signal<SelectionState>({ nodes: [], edges: [] });
  validationResult = signal<ValidationResult | null>(null);
  
  // Pan & Zoom state
  panX = signal(0);
  panY = signal(0);
  scale = signal(1);
  
  // Dragging state
  private draggedNode: GraphNode | null = null;
  private dragOffset: Position = { x: 0, y: 0 };
  private isPanning = false;
  private lastMousePos: Position = { x: 0, y: 0 };
  private draggedEdge: { edge: GraphEdge; endpoint: 'source' | 'target' } | null = null;
  private hoveredNodeId: string | null = null;
  hoveredPort: { nodeId: string; port: 'top' | 'bottom' | 'left' | 'right' } | null = null;
  
  // Attachment points visibility
  showAttachmentPoints = signal<string | null>(null); // nodeId to show ports for

  // Active tool
  activeTool = signal<'hand' | 'line'>('hand');
  
  // Line tool state
  private pendingEdge: { sourceId: string; sourcePort: 'top' | 'bottom' | 'left' | 'right' } | null = null;

  // Preview line for line tool (rubber-band from source to cursor)
  previewLine = signal<{ source: Position; target: Position } | null>(null);

  // Computed
  transform = computed(() => 
    `translate(${this.panX()}, ${this.panY()}) scale(${this.scale()})`
  );

  gridBounds = computed(() => {
    const gridSize = this.config.canvas?.grid?.size || 20;
    const viewportWidth = 10000; // Large enough to cover any reasonable viewport
    const viewportHeight = 10000;
    
    // Calculate grid offset to align with pan
    const x = Math.floor(-this.panX() / this.scale() / gridSize) * gridSize - viewportWidth / 2;
    const y = Math.floor(-this.panY() / this.scale() / gridSize) * gridSize - viewportHeight / 2;
    
    return {
      x,
      y,
      width: viewportWidth * 2,
      height: viewportHeight * 2
    };
  });

  // Selected edge info for direction selector positioning
  selectedEdgeMidpoint = computed(() => {
    const sel = this.selection();
    if (sel.edges.length !== 1) return null;
    const edge = this.internalGraph().edges.find(e => e.id === sel.edges[0]);
    if (!edge) return null;

    const sourcePoint = this.getEdgeSourcePoint(edge);
    const targetPoint = this.getEdgeTargetPoint(edge);
    const midX = (sourcePoint.x + targetPoint.x) / 2;
    const midY = (sourcePoint.y + targetPoint.y) / 2;

    return {
      edge,
      x: midX * this.scale() + this.panX(),
      y: midY * this.scale() + this.panY()
    };
  });

  constructor() {}

  ngOnChanges(changes: SimpleChanges) {
    // Sync graph input to internal signal
    if (changes['graph'] && changes['graph'].currentValue) {
      this.internalGraph.set(structuredClone(changes['graph'].currentValue));
    }
  }

  ngOnInit() {
    // Initialize with current graph value
    if (this.graph) {
      this.internalGraph.set(structuredClone(this.graph));
    }
    this.validate();
  }

  // Node operations
  addNode(type: string, position?: Position): GraphNode {
    const nodeConfig = this.config.nodes.types.find(t => t.type === type);
    if (!nodeConfig) {
      throw new Error(`Unknown node type: ${type}`);
    }

    const newNode: GraphNode = {
      id: this.generateId(),
      type,
      data: structuredClone(nodeConfig.defaultData),
      position: position || { x: 100, y: 100 }
    };

    const graph = this.internalGraph();
    this.internalGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });

    this.emitGraphChange();
    this.nodeAdded.emit(newNode);
    this.switchTool('hand');
    return newNode;
  }

  removeNode(nodeId: string, removeAttachedEdges = false): void {
    const graph = this.internalGraph();
    const removedNode = graph.nodes.find(n => n.id === nodeId);
    this.internalGraph.set({
      ...graph,
      nodes: graph.nodes.filter(n => n.id !== nodeId),
      edges: removeAttachedEdges
        ? graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
        : graph.edges
    });
    this.selection.set({ nodes: [], edges: [] });
    this.emitGraphChange();
    if (removedNode) this.nodeRemoved.emit(removedNode);
  }

  removeEdge(edgeId: string): void {
    const graph = this.internalGraph();
    const removedEdge = graph.edges.find(e => e.id === edgeId);
    this.internalGraph.set({
      ...graph,
      edges: graph.edges.filter(e => e.id !== edgeId)
    });
    this.selection.set({ nodes: [], edges: [] });
    this.emitGraphChange();
    if (removedEdge) this.edgeRemoved.emit(removedEdge);
  }

  updateNode(nodeId: string, updates: Partial<GraphNode>): void {
    const graph = this.internalGraph();
    const nodeIndex = graph.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    const updatedNodes = [...graph.nodes];
    updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], ...updates };
    
    this.internalGraph.set({
      ...graph,
      nodes: updatedNodes
    });
    this.emitGraphChange();
  }

  // Selection
  selectNode(nodeId: string | null): void {
    if (nodeId === null) {
      this.selection.set({ nodes: [], edges: [] });
    } else {
      this.selection.set({ nodes: [nodeId], edges: [] });
    }
    this.selectionChange.emit(this.selection());
  }

  selectEdge(edgeId: string | null): void {
    if (edgeId === null) {
      this.selection.set({ nodes: [], edges: [] });
    } else {
      this.selection.set({ nodes: [], edges: [edgeId] });
    }
    this.selectionChange.emit(this.selection());
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.readonly || this.config.interaction?.readonly) return;

    // Escape: cancel line drawing, clear selection
    if (event.key === 'Escape') {
      this.pendingEdge = null;
      this.previewLine.set(null);
      this.selection.set({ nodes: [], edges: [] });
      this.selectionChange.emit(this.selection());
      this.showAttachmentPoints.set(null);
      event.preventDefault();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const sel = this.selection();

      // Delete selected edges
      if (sel.edges.length > 0) {
        for (const edgeId of sel.edges) {
          this.removeEdge(edgeId);
        }
        event.preventDefault();
        return;
      }

      // Delete selected nodes (keep attached edges)
      if (sel.nodes.length > 0) {
        for (const nodeId of sel.nodes) {
          this.removeNode(nodeId, false);
        }
        event.preventDefault();
        return;
      }
    }

    // Arrow keys: nudge selected node(s) — 1px default, 10px with Shift
    if (event.key.startsWith('Arrow')) {
      const sel = this.selection();
      if (sel.nodes.length === 0) return;

      const step = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case 'ArrowUp':    dy = -step; break;
        case 'ArrowDown':  dy = step;  break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx = step;  break;
      }

      event.preventDefault();

      const graph = this.internalGraph();
      const updatedNodes = [...graph.nodes];
      for (const nodeId of sel.nodes) {
        const idx = updatedNodes.findIndex(n => n.id === nodeId);
        if (idx === -1) continue;
        const pos = updatedNodes[idx].position;
        updatedNodes[idx] = { ...updatedNodes[idx], position: { x: pos.x + dx, y: pos.y + dy } };
      }

      // Recalculate edge ports for moved nodes (atomic update)
      const movedIds = new Set(sel.nodes);
      const updatedEdges = graph.edges.map(edge => {
        if (!movedIds.has(edge.source) && !movedIds.has(edge.target)) return edge;
        const sourceNode = updatedNodes.find(n => n.id === edge.source);
        const targetNode = updatedNodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        const newSourcePort = this.findClosestPortForEdge(sourceNode, targetNode, 'source');
        const newTargetPort = this.findClosestPortForEdge(targetNode, sourceNode, 'target');
        if (edge.sourcePort === newSourcePort && edge.targetPort === newTargetPort) return edge;
        return { ...edge, sourcePort: newSourcePort, targetPort: newTargetPort };
      });

      this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
      this.emitGraphChange();
    }
  }

  switchTool(tool: 'hand' | 'line'): void {
    const previousTool = this.activeTool();

    // Cancel any in-progress line drawing
    this.pendingEdge = null;
    this.previewLine.set(null);
    this.showAttachmentPoints.set(null);

    // Preserve node selection when switching hand → line
    if (!(previousTool === 'hand' && tool === 'line')) {
      this.selection.set({ nodes: [], edges: [] });
      this.selectionChange.emit(this.selection());
    }

    this.activeTool.set(tool);

    // Hand → line with a node selected: start edge from that node
    if (previousTool === 'hand' && tool === 'line') {
      const sel = this.selection();
      if (sel.nodes.length === 1) {
        this.pendingEdge = { sourceId: sel.nodes[0], sourcePort: 'bottom' };
      }
    }
  }

  /** @deprecated Use switchTool('line') instead */
  switchToLineTool(): void {
    this.switchTool('line');
  }

  onEdgeClick(event: MouseEvent, edge: GraphEdge): void {
    if (this.activeTool() !== 'hand') return;
    event.stopPropagation();
    this.selectEdge(edge.id);
    this.edgeClick.emit(edge);
  }

  onEdgeDoubleClick(event: MouseEvent, edge: GraphEdge): void {
    if (this.activeTool() !== 'hand') return;
    event.stopPropagation();
    this.selectEdge(edge.id);
    this.edgeDoubleClick.emit(edge);
  }

  clearSelection(): void {
    this.selection.set({ nodes: [], edges: [] });
    this.selectionChange.emit(this.selection());
  }

  // Validation
  validate(): ValidationResult {
    if (!this.config.validation) {
      const result = { valid: true, errors: [] };
      this.validationResult.set(result);
      return result;
    }

    const errors = this.config.validation!.validators.flatMap(rule =>
      rule.validator(this.internalGraph(), this.config)
    );

    const result = {
      valid: errors.filter(e => e.severity !== 'warning').length === 0,
      errors
    };

    this.validationResult.set(result);
    this.validationChange.emit(result);
    return result;
  }

  // Layout
  async applyLayout(direction: 'TB' | 'LR' = 'TB'): Promise<void> {
    const graph = this.internalGraph();
    if (graph.nodes.length === 0) return;

    // Dynamic import to avoid compile-time module resolution issues
    const dagreModule = await import('dagre');
    const dagre = dagreModule.default ?? dagreModule;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: 60,
      ranksep: 80,
      marginx: 40,
      marginy: 40,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of graph.nodes) {
      const size = this.getNodeSize(node);
      g.setNode(node.id, { width: size.width, height: size.height });
    }

    for (const edge of graph.edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const updatedNodes = graph.nodes.map(node => {
      const dagreNode = g.node(node.id);
      if (!dagreNode) return node;
      const size = this.getNodeSize(node);
      return {
        ...node,
        position: {
          x: dagreNode.x - size.width / 2,
          y: dagreNode.y - size.height / 2,
        },
      };
    });

    this.internalGraph.set({ ...graph, nodes: updatedNodes });
    this.emitGraphChange();

    setTimeout(() => this.fitToScreen());
  }

  fitToScreen(padding = 40): void {
    const nodes = this.internalGraph().nodes;
    if (nodes.length === 0) return;

    // Get SVG element dimensions
    const ref = this.canvasSvgRef();
    const svgEl: SVGSVGElement | null = ref?.nativeElement ?? ref ?? null;
    if (!svgEl || typeof svgEl.getBoundingClientRect !== 'function') return;

    const rect = svgEl.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;
    if (viewW === 0 || viewH === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const size = this.getNodeSize(node);
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + size.width);
      maxY = Math.max(maxY, node.position.y + size.height);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    // Handle single node or all nodes stacked
    if (contentW <= 0 && contentH <= 0) {
      this.scale.set(1);
      this.panX.set(viewW / 2 - (minX + 110) * 1);
      this.panY.set(viewH / 2 - (minY + 50) * 1);
      return;
    }

    // Calculate scale to fit content with padding (cap at 1 to avoid zooming in too much)
    const zoomConfig = this.config.canvas?.zoom;
    const minScale = zoomConfig?.min ?? 0.25;
    const scaleX = contentW > 0 ? (viewW - padding * 2) / contentW : 1;
    const scaleY = contentH > 0 ? (viewH - padding * 2) / contentH : 1;
    const newScale = Math.max(minScale, Math.min(1, Math.min(scaleX, scaleY)));

    // Center the content in the viewport
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = viewW / 2 - centerX * newScale;
    const newPanY = viewH / 2 - centerY * newScale;

    this.scale.set(newScale);
    this.panX.set(newPanX);
    this.panY.set(newPanY);
  }

  zoomTo(level: number): void {
    const zoomConfig = this.config.canvas?.zoom;
    const min = zoomConfig?.min ?? 0.25;
    const max = zoomConfig?.max ?? 2.0;
    this.scale.set(Math.max(min, Math.min(max, level)));
  }

  getSelection(): SelectionState {
    return this.selection();
  }

  // Event handlers
  onCanvasMouseDown(event: MouseEvent): void {
    if (this.readonly) return;
    
    // Cancel pending edge on empty space click
    if (this.pendingEdge) {
      this.pendingEdge = null;
      this.previewLine.set(null);
      this.showAttachmentPoints.set(null);
      this.hoveredPort = null;
      this.clearSelection();
    }
    
    const target = event.target as SVGElement;
    const isNode = !!target.closest('.graph-node');
    const isEdgeEndpoint = target.classList.contains('edge-endpoint');
    const isAttachmentPoint = target.classList.contains('attachment-point');
    const isHitArea = target.classList.contains('edge-hit-area');
    const isInteractive = isNode || isEdgeEndpoint || isAttachmentPoint || isHitArea;

    if (!isInteractive) {
      this.isPanning = true;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      this.clearSelection();
      event.preventDefault();
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this.isPanning) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      this.panX.set(this.panX() + dx);
      this.panY.set(this.panY() + dy);
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    } else if (this.draggedNode) {
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
      let x = mouseX - this.dragOffset.x;
      let y = mouseY - this.dragOffset.y;
      
      // Smart snap to grid
      if (this.config.canvas?.grid?.snap) {
        const gridSize = this.config.canvas.grid.size || 20;
        const snapThreshold = gridSize / 4;
        
        const snapX = Math.round(x / gridSize) * gridSize;
        const snapY = Math.round(y / gridSize) * gridSize;
        
        if (Math.abs(x - snapX) < snapThreshold) x = snapX;
        if (Math.abs(y - snapY) < snapThreshold) y = snapY;
      }
      
      // Atomic update: node position + edge port recalculation in one graph set
      const graph = this.internalGraph();
      const nodeIndex = graph.nodes.findIndex(n => n.id === this.draggedNode!.id);
      if (nodeIndex !== -1) {
        const updatedNodes = [...graph.nodes];
        updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: { x, y } };
        
        // Recalculate ports for all edges connected to this node
        const draggedId = this.draggedNode.id;
        const updatedEdges = graph.edges.map(edge => {
          if (edge.source !== draggedId && edge.target !== draggedId) return edge;
          const sourceNode = updatedNodes.find(n => n.id === edge.source);
          const targetNode = updatedNodes.find(n => n.id === edge.target);
          if (!sourceNode || !targetNode) return edge;
          const newSourcePort = this.findClosestPortForEdge(sourceNode, targetNode, 'source');
          const newTargetPort = this.findClosestPortForEdge(targetNode, sourceNode, 'target');
          if (edge.sourcePort === newSourcePort && edge.targetPort === newTargetPort) return edge;
          return { ...edge, sourcePort: newSourcePort, targetPort: newTargetPort };
        });
        
        this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
        this.emitGraphChange();
      }
    } else if (this.draggedEdge) {
      // Edge reconnection - find hovered node and closest port
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
      
      // Find node under cursor
      const nodeId = this.findNodeAtPosition({ x: mouseX, y: mouseY });
      
      if (nodeId) {
        // Show attachment points for this node
        this.showAttachmentPoints.set(nodeId);
        
        // Find closest port
        const closestPort = this.findClosestPort(nodeId, { x: mouseX, y: mouseY });
        
        // Highlight port if within snap distance (40px)
        if (closestPort && closestPort.distance < 40) {
          this.hoveredPort = { nodeId, port: closestPort.port };
          this.hoveredNodeId = nodeId;
        } else {
          this.hoveredPort = null;
          this.hoveredNodeId = null;
        }
      } else {
        // No node nearby - hide attachment points
        this.showAttachmentPoints.set(null);
        this.hoveredPort = null;
        this.hoveredNodeId = null;
      }
    } else if (this.pendingEdge && this.activeTool() === 'line') {
      // Line tool pending state - show rubber-band preview + attachment points on hovered node
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
      
      // Get source port position
      const sourceNode = this.internalGraph().nodes.find(n => n.id === this.pendingEdge!.sourceId);
      if (sourceNode) {
        const sourcePoint = this.getPortWorldPosition(sourceNode, this.pendingEdge.sourcePort);
        
        // Check if cursor is near a node - snap to its closest port
        const hoveredNodeId = this.findNodeAtPosition({ x: mouseX, y: mouseY });
        let targetPoint: Position = { x: mouseX, y: mouseY };
        
        if (hoveredNodeId && hoveredNodeId !== this.pendingEdge.sourceId) {
          // Show attachment points on hovered node
          this.showAttachmentPoints.set(hoveredNodeId);
          
          // Find and highlight closest port
          const closestPort = this.findClosestPort(hoveredNodeId, { x: mouseX, y: mouseY });
          if (closestPort && closestPort.distance < 40) {
            this.hoveredPort = { nodeId: hoveredNodeId, port: closestPort.port };
            // Snap preview line to port
            const hoveredNode = this.internalGraph().nodes.find(n => n.id === hoveredNodeId);
            if (hoveredNode) {
              targetPoint = this.getPortWorldPosition(hoveredNode, closestPort.port);
            }
          } else {
            this.hoveredPort = null;
          }
        } else {
          // Not over a valid target node - hide attachment points
          this.showAttachmentPoints.set(null);
          this.hoveredPort = null;
        }
        
        this.previewLine.set({ source: sourcePoint, target: targetPoint });
      }
    }
  }

  onCanvasMouseUp(_event: MouseEvent): void {
    // Handle edge reconnection with port snapping
    if (this.draggedEdge && this.hoveredNodeId && this.hoveredPort) {
      const graph = this.internalGraph();
      const edgeIndex = graph.edges.findIndex(e => e.id === this.draggedEdge!.edge.id);
      
      if (edgeIndex !== -1) {
        const updatedEdges = [...graph.edges];
        const updatedEdge = { ...updatedEdges[edgeIndex] };
        
        // Update node connection and store port information (non-null: guarded by if condition)
        if (this.draggedEdge.endpoint === 'source') {
          updatedEdge.source = this.hoveredNodeId!;
          updatedEdge.sourcePort = this.hoveredPort!.port;
        } else {
          updatedEdge.target = this.hoveredNodeId!;
          updatedEdge.targetPort = this.hoveredPort!.port;
        }
        
        updatedEdges[edgeIndex] = updatedEdge;
        this.internalGraph.set({ ...graph, edges: updatedEdges });
        this.emitGraphChange();
        this.edgeUpdated.emit(updatedEdge);
      }
    }
    
    this.isPanning = false;
    this.draggedNode = null;
    this.draggedEdge = null;
    this.hoveredNodeId = null;
    this.hoveredPort = null;
    this.showAttachmentPoints.set(null);
  }

  onNodeMouseDown(event: MouseEvent, node: GraphNode): void {
    if (this.readonly) return;
    event.stopPropagation(); // Always prevent canvas from seeing node mousedowns
    if (this.activeTool() !== 'hand') return;
    
    this.draggedNode = node;
    
    // Calculate offset between mouse position and node origin to prevent jump
    const svg = (event.target as SVGElement).closest('svg')!;
    const rect = svg.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
    const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
    this.dragOffset = {
      x: mouseX - node.position.x,
      y: mouseY - node.position.y
    };
  }

  onNodeClick(event: MouseEvent, node: GraphNode): void {
    if (this.activeTool() === 'line') {
      event.stopPropagation();
      
      if (!this.pendingEdge) {
        // First click - start edge from this node
        // Pick initial port based on geometry (will be recalculated on second click)
        this.pendingEdge = { sourceId: node.id, sourcePort: 'bottom' };
        this.selectNode(node.id);
      } else if (this.pendingEdge.sourceId !== node.id) {
        // Second click on different node - complete the edge
        const sourceNode = this.internalGraph().nodes.find(n => n.id === this.pendingEdge!.sourceId);
        if (sourceNode) {
          const sourcePort = this.findClosestPortForEdge(sourceNode, node, 'source');
          const targetPort = this.findClosestPortForEdge(node, sourceNode, 'target');
          
          const newEdge: GraphEdge = {
            id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: this.pendingEdge.sourceId,
            target: node.id,
            sourcePort,
            targetPort
          };
          
          const graph = this.internalGraph();
          this.internalGraph.set({
            ...graph,
            edges: [...graph.edges, newEdge]
          });
          this.emitGraphChange();
          this.edgeAdded.emit(newEdge);
        }
        this.pendingEdge = null;
        this.previewLine.set(null);
        this.showAttachmentPoints.set(null);
        this.hoveredPort = null;
        this.clearSelection();
      } else {
        // Clicked same node - cancel
        this.pendingEdge = null;
        this.previewLine.set(null);
        this.showAttachmentPoints.set(null);
        this.hoveredPort = null;
        this.clearSelection();
      }
    } else {
      // Hand tool - normal select
      this.selectNode(node.id);
    }
  }

  onAttachmentPointClick(event: MouseEvent, node: GraphNode, port: 'top' | 'bottom' | 'left' | 'right'): void {
    event.stopPropagation();
    if (this.readonly) return;
    
    if (this.activeTool() === 'line') {
      if (!this.pendingEdge) {
        // First click on attachment point - start edge from this specific port
        this.pendingEdge = { sourceId: node.id, sourcePort: port };
        this.selectNode(node.id);
      } else if (this.pendingEdge.sourceId !== node.id) {
        // Second click - complete edge to this specific port
        const sourceNode = this.internalGraph().nodes.find(n => n.id === this.pendingEdge!.sourceId);
        if (sourceNode) {
          const sourcePort = this.findClosestPortForEdge(sourceNode, node, 'source');
          
          const newEdge: GraphEdge = {
            id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: this.pendingEdge.sourceId,
            target: node.id,
            sourcePort,
            targetPort: port
          };
          
          const graph = this.internalGraph();
          this.internalGraph.set({
            ...graph,
            edges: [...graph.edges, newEdge]
          });
          this.emitGraphChange();
          this.edgeAdded.emit(newEdge);
        }
        this.pendingEdge = null;
        this.previewLine.set(null);
        this.showAttachmentPoints.set(null);
        this.hoveredPort = null;
        this.clearSelection();
      } else {
        // Clicked same node - cancel
        this.pendingEdge = null;
        this.previewLine.set(null);
        this.showAttachmentPoints.set(null);
        this.hoveredPort = null;
        this.clearSelection();
      }
    }
  }

  onEdgeEndpointMouseDown(event: MouseEvent, edge: GraphEdge, endpoint: 'source' | 'target'): void {
    if (this.readonly) return;
    event.stopPropagation();
    this.draggedEdge = { edge, endpoint };
  }

  onWheel(event: WheelEvent): void {
    const zoomConfig = this.config.canvas?.zoom;
    if (!zoomConfig?.wheelEnabled) return;

    event.preventDefault();
    const delta = -event.deltaY;
    const step = zoomConfig.step ?? 0.1;
    const newScale = Math.max(
      zoomConfig.min ?? 0.25,
      Math.min(
        zoomConfig.max ?? 2.0,
        this.scale() + (delta > 0 ? step : -step)
      )
    );
    
    this.scale.set(newScale);
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    // TODO: Show context menu
  }

  // Helper methods
  private emitGraphChange(): void {
    this.graphChange.emit(this.internalGraph());
    if (this.config.validation?.validateOnChange) {
      this.validate();
    }
  }

  private generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private recalculateEdgePorts(nodeId: string): void {
    const graph = this.internalGraph();
    let changed = false;
    const updatedEdges = graph.edges.map(edge => {
      if (edge.source !== nodeId && edge.target !== nodeId) return edge;
      
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return edge;
      
      const newSourcePort = this.findClosestPortForEdge(sourceNode, targetNode, 'source');
      const newTargetPort = this.findClosestPortForEdge(targetNode, sourceNode, 'target');
      
      if (edge.sourcePort === newSourcePort && edge.targetPort === newTargetPort) return edge;
      
      changed = true;
      return { ...edge, sourcePort: newSourcePort, targetPort: newTargetPort };
    });
    
    if (changed) {
      this.internalGraph.set({ ...graph, edges: updatedEdges });
    }
  }

  getNodeSize(node: GraphNode): { width: number; height: number } {
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    return nodeConfig?.size || this.config.nodes.defaultSize || { width: 220, height: 100 };
  }

  getEdgePath(edge: GraphEdge): string {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return '';

    // Get port positions from edge or calculate closest
    const sourcePort = (edge.sourcePort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = (edge.targetPort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(targetNode, sourceNode, 'target');
    
    const sourcePoint = this.getPortWorldPosition(sourceNode, sourcePort);
    const targetPoint = this.getPortWorldPosition(targetNode, targetPort);

    // Simple straight line
    return `M ${sourcePoint.x},${sourcePoint.y} L ${targetPoint.x},${targetPoint.y}`;
  }

  getEdgeColor(edge: GraphEdge): string {
    return edge.metadata?.style?.stroke || this.config.edges.style?.stroke || '#94a3b8';
  }

  getEdgeMarkerEnd(edge: GraphEdge): string | null {
    const dir = edge.direction || 'forward';
    const selected = this.selection().edges.includes(edge.id);
    if (dir === 'forward' || dir === 'bidirectional') {
      return selected ? 'url(#arrow-end-selected)' : 'url(#arrow-end)';
    }
    return null;
  }

  getEdgeMarkerStart(edge: GraphEdge): string | null {
    const dir = edge.direction || 'forward';
    const selected = this.selection().edges.includes(edge.id);
    if (dir === 'backward' || dir === 'bidirectional') {
      return selected ? 'url(#arrow-start-selected)' : 'url(#arrow-start)';
    }
    return null;
  }

  setEdgeDirection(direction: 'forward' | 'backward' | 'bidirectional'): void {
    const sel = this.selection();
    if (sel.edges.length !== 1) return;
    
    const graph = this.internalGraph();
    const edgeIndex = graph.edges.findIndex(e => e.id === sel.edges[0]);
    if (edgeIndex === -1) return;
    
    const updatedEdges = [...graph.edges];
    updatedEdges[edgeIndex] = { ...updatedEdges[edgeIndex], direction };
    this.internalGraph.set({ ...graph, edges: updatedEdges });
    this.emitGraphChange();
    this.edgeUpdated.emit(updatedEdges[edgeIndex]);
  }

  getEdgeSourcePoint(edge: GraphEdge): Position {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };
    
    const sourcePort = (edge.sourcePort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    return this.getPortWorldPosition(sourceNode, sourcePort);
  }

  getEdgeTargetPoint(edge: GraphEdge): Position {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };
    
    const targetPort = (edge.targetPort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(targetNode, sourceNode, 'target');
    return this.getPortWorldPosition(targetNode, targetPort);
  }

  getNodeTypeIcon(node: GraphNode): string {
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    return nodeConfig?.icon || '●';
  }

  private findNodeAtPosition(pos: Position): string | null {
    for (const node of this.internalGraph().nodes) {
      const size = this.getNodeSize(node);
      if (
        pos.x >= node.position.x &&
        pos.x <= node.position.x + size.width &&
        pos.y >= node.position.y &&
        pos.y <= node.position.y + size.height
      ) {
        return node.id;
      }
    }
    return null;
  }

  getNodePorts(node: GraphNode): Array<{ position: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number }> {
    const size = this.getNodeSize(node);
    return [
      { position: 'top', x: size.width / 2, y: 0 },
      { position: 'bottom', x: size.width / 2, y: size.height },
      { position: 'left', x: 0, y: size.height / 2 },
      { position: 'right', x: size.width, y: size.height / 2 }
    ];
  }

  private findClosestPort(nodeId: string, worldPos: Position): { port: 'top' | 'bottom' | 'left' | 'right'; distance: number } | null {
    const node = this.internalGraph().nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    const ports = this.getNodePorts(node);
    let closestPort: typeof ports[0] | null = null;
    let minDistance = Infinity;
    
    for (const port of ports) {
      const portWorldX = node.position.x + port.x;
      const portWorldY = node.position.y + port.y;
      const dx = worldPos.x - portWorldX;
      const dy = worldPos.y - portWorldY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPort = port;
      }
    }
    
    return closestPort ? { port: closestPort.position, distance: minDistance } : null;
  }

  private getPortWorldPosition(node: GraphNode, port: 'top' | 'bottom' | 'left' | 'right'): Position {
    const size = this.getNodeSize(node);
    const portOffsets = {
      top: { x: size.width / 2, y: 0 },
      bottom: { x: size.width / 2, y: size.height },
      left: { x: 0, y: size.height / 2 },
      right: { x: size.width, y: size.height / 2 }
    };
    
    const offset = portOffsets[port];
    return {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y
    };
  }

  private findClosestPortForEdge(
    node: GraphNode,
    otherNode: GraphNode,
    endpoint: 'source' | 'target'
  ): 'top' | 'bottom' | 'left' | 'right' {
    const size = this.getNodeSize(node);
    const nodeCenter = {
      x: node.position.x + size.width / 2,
      y: node.position.y + size.height / 2
    };
    const otherSize = this.getNodeSize(otherNode);
    const otherCenter = {
      x: otherNode.position.x + otherSize.width / 2,
      y: otherNode.position.y + otherSize.height / 2
    };
    
    const dx = otherCenter.x - nodeCenter.x;
    const dy = otherCenter.y - nodeCenter.y;
    
    // Determine which port is closest based on relative position
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx > absDy) {
      // Horizontal connection
      return dx > 0 ? 'right' : 'left';
    } else {
      // Vertical connection
      return dy > 0 ? 'bottom' : 'top';
    }
  }
}
