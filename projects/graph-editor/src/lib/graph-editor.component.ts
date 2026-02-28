import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  viewChild
} from '@angular/core';
// dagre is loaded dynamically in applyLayout() to avoid compile-time resolution issues
import {Graph, GraphEdge, GraphNode, Position} from './graph.model';
import {ContextMenuEvent, GraphEditorConfig, SelectionState, ValidationResult} from './graph-editor.config';
import {GraphHistoryService} from './services/graph-history.service';

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
  providers: [GraphHistoryService],
  host: {
    'tabindex': '0',
    'style': 'outline: none;',
    '(keydown)': 'onKeyDown($event)'
  },
  templateUrl: './graph-editor.component.html',
  styleUrl: './graph-editor.component.scss',
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
  private readonly historyService = inject(GraphHistoryService);

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
  private draggedNodeOffsets: Map<string, Position> = new Map(); // For multi-node drag
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

  // Box selection state (Shift+drag)
  private isBoxSelecting = false;
  private boxSelectStart: Position = { x: 0, y: 0 };
  selectionBox = signal<{ x: number; y: number; width: number; height: number } | null>(null);

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

  // Shadow configuration (defaults to true)
  shadowsEnabled = computed(() => this.config.theme?.shadows !== false);

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
    // Initialize history with starting state
    this.historyService.init(this.internalGraph());
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

  /** Toggle a node in/out of the current selection (for Ctrl+Click) */
  toggleNodeSelection(nodeId: string): void {
    const sel = this.selection();
    const isSelected = sel.nodes.includes(nodeId);
    if (isSelected) {
      // Remove from selection
      this.selection.set({
        nodes: sel.nodes.filter(id => id !== nodeId),
        edges: sel.edges
      });
    } else {
      // Add to selection
      this.selection.set({
        nodes: [...sel.nodes, nodeId],
        edges: sel.edges
      });
    }
    this.selectionChange.emit(this.selection());
  }

  /** Toggle an edge in/out of the current selection (for Ctrl+Click) */
  toggleEdgeSelection(edgeId: string): void {
    const sel = this.selection();
    const isSelected = sel.edges.includes(edgeId);
    if (isSelected) {
      // Remove from selection
      this.selection.set({
        nodes: sel.nodes,
        edges: sel.edges.filter(id => id !== edgeId)
      });
    } else {
      // Add to selection
      this.selection.set({
        nodes: sel.nodes,
        edges: [...sel.edges, edgeId]
      });
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

    // Undo: Ctrl+Z (or Cmd+Z on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      if (this.undo()) {
        event.preventDefault();
      }
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Y / Cmd+Shift+Z on Mac)
    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
      if (this.redo()) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const sel = this.selection();
      if (sel.nodes.length === 0 && sel.edges.length === 0) return;

      // Batch delete: remove all selected items atomically (single history entry)
      const graph = this.internalGraph();
      const nodeIdsToRemove = new Set(sel.nodes);
      const edgeIdsToRemove = new Set(sel.edges);

      // Collect removed items for events
      const removedNodes = graph.nodes.filter(n => nodeIdsToRemove.has(n.id));
      const removedEdges = graph.edges.filter(e => edgeIdsToRemove.has(e.id));

      // Filter out selected nodes
      const remainingNodes = graph.nodes.filter(n => !nodeIdsToRemove.has(n.id));

      // Filter out selected edges AND edges connected to deleted nodes
      const remainingEdges = graph.edges.filter(e =>
        !edgeIdsToRemove.has(e.id) &&
        !nodeIdsToRemove.has(e.source) &&
        !nodeIdsToRemove.has(e.target)
      );

      // Find edges that were removed because they connected to deleted nodes
      const additionalRemovedEdges = graph.edges.filter(e =>
        !edgeIdsToRemove.has(e.id) &&
        (nodeIdsToRemove.has(e.source) || nodeIdsToRemove.has(e.target))
      );

      // Update graph atomically (single history push)
      this.internalGraph.set({ ...graph, nodes: remainingNodes, edges: remainingEdges });
      this.emitGraphChange();

      // Emit removal events
      for (const edge of removedEdges) {
        this.edgeRemoved.emit(edge);
      }
      for (const edge of additionalRemovedEdges) {
        this.edgeRemoved.emit(edge);
      }
      for (const node of removedNodes) {
        this.nodeRemoved.emit(node);
      }

      // Clear selection
      this.selection.set({ nodes: [], edges: [] });
      this.selectionChange.emit(this.selection());

      event.preventDefault();
      return;
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
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: toggle edge in selection
      this.toggleEdgeSelection(edge.id);
    } else {
      // Normal click: replace selection with this edge
      this.selectEdge(edge.id);
    }
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

    // Recalculate edge ports based on new node positions
    const updatedEdges = graph.edges.map(edge => {
      const sourceNode = updatedNodes.find(n => n.id === edge.source);
      const targetNode = updatedNodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return edge;
      const newSourcePort = this.findClosestPortForEdge(sourceNode, targetNode, 'source');
      const newTargetPort = this.findClosestPortForEdge(targetNode, sourceNode, 'target');
      return { ...edge, sourcePort: newSourcePort, targetPort: newTargetPort };
    });

    this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
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
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();

      if (event.shiftKey && this.activeTool() === 'hand') {
        // Shift+drag = box selection (only with hand tool)
        this.isBoxSelecting = true;
        this.boxSelectStart = { x: mouseX, y: mouseY };
        this.selectionBox.set({ x: mouseX, y: mouseY, width: 0, height: 0 });
      } else {
        // Normal drag = pan
        this.isPanning = true;
      }
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      this.clearSelection();
      event.preventDefault();
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this.isBoxSelecting) {
      // Update selection box
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();

      const x = Math.min(this.boxSelectStart.x, mouseX);
      const y = Math.min(this.boxSelectStart.y, mouseY);
      const width = Math.abs(mouseX - this.boxSelectStart.x);
      const height = Math.abs(mouseY - this.boxSelectStart.y);

      this.selectionBox.set({ x, y, width, height });
    } else if (this.isPanning) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      this.panX.set(this.panX() + dx);
      this.panY.set(this.panY() + dy);
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    } else if (this.draggedNode) {
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();

      const graph = this.internalGraph();
      const updatedNodes = [...graph.nodes];
      const movedNodeIds = new Set<string>();

      // Check if we're dragging multiple selected nodes
      if (this.draggedNodeOffsets.size > 1) {
        // Multi-node drag: move all selected nodes
        for (const [nodeId, offset] of this.draggedNodeOffsets) {
          const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
          if (nodeIndex === -1) continue;

          let x = mouseX - offset.x;
          let y = mouseY - offset.y;

          // Smart snap to grid
          if (this.config.canvas?.grid?.snap) {
            const gridSize = this.config.canvas.grid.size || 20;
            const snapThreshold = gridSize / 4;
            const snapX = Math.round(x / gridSize) * gridSize;
            const snapY = Math.round(y / gridSize) * gridSize;
            if (Math.abs(x - snapX) < snapThreshold) x = snapX;
            if (Math.abs(y - snapY) < snapThreshold) y = snapY;
          }

          updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: { x, y } };
          movedNodeIds.add(nodeId);
        }
      } else {
        // Single node drag
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

        const nodeIndex = updatedNodes.findIndex(n => n.id === this.draggedNode!.id);
        if (nodeIndex !== -1) {
          updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: { x, y } };
          movedNodeIds.add(this.draggedNode!.id);
        }
      }

      // Recalculate ports for all edges connected to moved nodes
      const updatedEdges = graph.edges.map(edge => {
        if (!movedNodeIds.has(edge.source) && !movedNodeIds.has(edge.target)) return edge;
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
    // Handle box selection completion
    if (this.isBoxSelecting) {
      const box = this.selectionBox();
      if (box && (box.width > 5 || box.height > 5)) {
        // Find all nodes within the selection box
        const selectedNodes: string[] = [];
        for (const node of this.internalGraph().nodes) {
          const size = this.getNodeSize(node);
          const nodeRight = node.position.x + size.width;
          const nodeBottom = node.position.y + size.height;
          const boxRight = box.x + box.width;
          const boxBottom = box.y + box.height;

          // Check if node intersects with selection box
          if (node.position.x < boxRight &&
              nodeRight > box.x &&
              node.position.y < boxBottom &&
              nodeBottom > box.y) {
            selectedNodes.push(node.id);
          }
        }

        if (selectedNodes.length > 0) {
          // Also select edges where both source and target are selected
          const selectedEdges: string[] = [];
          for (const edge of this.internalGraph().edges) {
            if (selectedNodes.includes(edge.source) && selectedNodes.includes(edge.target)) {
              selectedEdges.push(edge.id);
            }
          }
          this.selection.set({ nodes: selectedNodes, edges: selectedEdges });
          this.selectionChange.emit(this.selection());
        }
      }
      this.isBoxSelecting = false;
      this.selectionBox.set(null);
    }

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
    this.draggedNodeOffsets.clear();
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

    // If this node is part of a multi-selection, calculate offsets for all selected nodes
    const sel = this.selection();
    this.draggedNodeOffsets.clear();
    if (sel.nodes.includes(node.id) && sel.nodes.length > 1) {
      const graph = this.internalGraph();
      for (const nodeId of sel.nodes) {
        const n = graph.nodes.find(nd => nd.id === nodeId);
        if (n) {
          this.draggedNodeOffsets.set(nodeId, {
            x: mouseX - n.position.x,
            y: mouseY - n.position.y
          });
        }
      }
    }
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
      // Hand tool - select or toggle selection
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd+Click: toggle node in selection
        this.toggleNodeSelection(node.id);
      } else {
        // Normal click: replace selection with this node
        this.selectNode(node.id);
      }
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

    const svgRect = this.canvasSvgRef()?.nativeElement.getBoundingClientRect();
    if (!svgRect) return;

    // Calculate position in graph coordinates
    const x = (event.clientX - svgRect.left - this.panX()) / this.scale();
    const y = (event.clientY - svgRect.top - this.panY()) / this.scale();

    // Check if clicking on a node
    const nodeId = this.findNodeAtPosition({ x, y });
    if (nodeId) {
      this.contextMenu.emit({
        type: 'node',
        position: { x: event.clientX, y: event.clientY },
        nodeId
      });
      return;
    }

    // Check if clicking on an edge (use hit area logic)
    const edgeId = this.findEdgeAtPosition({ x, y });
    if (edgeId) {
      this.contextMenu.emit({
        type: 'edge',
        position: { x: event.clientX, y: event.clientY },
        edgeId
      });
      return;
    }

    // Canvas click
    this.contextMenu.emit({
      type: 'canvas',
      position: { x: event.clientX, y: event.clientY }
    });
  }

  // Helper methods
  private emitGraphChange(): void {
    // Push to history (unless this is an undo/redo operation)
    if (!this.historyService.isUndoRedo()) {
      this.historyService.push(this.internalGraph());
    }
    this.graphChange.emit(this.internalGraph());
    if (this.config.validation?.validateOnChange) {
      this.validate();
    }
  }

  /** Undo the last action (Ctrl+Z) */
  undo(): boolean {
    const state = this.historyService.undo();
    if (!state) {
      return false;
    }
    
    this.internalGraph.set(state);
    this.graphChange.emit(this.internalGraph());
    this.historyService.completeUndoRedo();
    
    // Clear selection after undo
    this.selection.set({ nodes: [], edges: [] });
    this.selectionChange.emit(this.selection());
    
    return true;
  }

  /** Redo the last undone action (Ctrl+Y / Ctrl+Shift+Z) */
  redo(): boolean {
    const state = this.historyService.redo();
    if (!state) {
      return false;
    }
    
    this.internalGraph.set(state);
    this.graphChange.emit(this.internalGraph());
    this.historyService.completeUndoRedo();
    
    // Clear selection after redo
    this.selection.set({ nodes: [], edges: [] });
    this.selectionChange.emit(this.selection());
    
    return true;
  }

  /** Check if undo is available */
  canUndo(): boolean {
    return this.historyService.canUndo();
  }

  /** Check if redo is available */
  canRedo(): boolean {
    return this.historyService.canRedo();
  }

  /** Clear history and reset to current state */
  clearHistory(): void {
    this.historyService.clear(this.internalGraph());
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

  /**
   * Get custom image URL for a node.
   * Checks node.data['imageUrl'] first, then falls back to nodeType.defaultData['imageUrl'].
   * Returns null if no image is configured (will render text icon instead).
   */
  getNodeImage(node: GraphNode): string | null {
    // Check instance-level image first
    if (node.data['imageUrl']) {
      return node.data['imageUrl'] as string;
    }
    // Fall back to node type default
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    if (nodeConfig?.defaultData['imageUrl']) {
      return nodeConfig.defaultData['imageUrl'] as string;
    }
    return null;
  }

  /**
   * Get the position for the node image (top-left corner of image).
   * Uses same positioning logic as icon but accounts for image dimensions.
   */
  getImagePosition(node: GraphNode): Position {
    const size = this.getNodeSize(node);
    const imageSize = this.getImageSize(node);
    const pos = this.config.nodes.iconPosition || 'top-left';
    const padding = 8;

    const positions: Record<string, Position> = {
      'top-left': { x: padding, y: padding },
      'top': { x: (size.width - imageSize) / 2, y: padding },
      'top-right': { x: size.width - imageSize - padding, y: padding },
      'right': { x: size.width - imageSize - padding, y: (size.height - imageSize) / 2 },
      'bottom-right': { x: size.width - imageSize - padding, y: size.height - imageSize - padding },
      'bottom': { x: (size.width - imageSize) / 2, y: size.height - imageSize - padding },
      'bottom-left': { x: padding, y: size.height - imageSize - padding },
      'left': { x: padding, y: (size.height - imageSize) / 2 }
    };

    return positions[pos] || positions['top-left'];
  }

  /**
   * Get the size (width/height) for node images.
   * Images are rendered as squares, sized proportionally to node height.
   */
  getImageSize(node: GraphNode): number {
    const size = this.getNodeSize(node);
    // Image takes up ~40% of node height, with min 24px and max 64px
    return Math.min(64, Math.max(24, size.height * 0.4));
  }

  getIconPosition(node: GraphNode): Position {
    const size = this.getNodeSize(node);
    const pos = this.config.nodes.iconPosition || 'top-left';
    const padding = size.height * 0.25;
    const iconSize = size.height * 0.28;

    const positions: Record<string, Position> = {
      'top-left': { x: padding, y: padding },
      'top': { x: size.width / 2, y: padding },
      'top-right': { x: size.width - padding, y: padding },
      'right': { x: size.width - padding, y: size.height / 2 },
      'bottom-right': { x: size.width - padding, y: size.height - padding },
      'bottom': { x: size.width / 2, y: size.height - padding },
      'bottom-left': { x: padding, y: size.height - padding },
      'left': { x: padding, y: size.height / 2 }
    };

    return positions[pos] || positions['left'];
  }

  getLabelPosition(node: GraphNode): Position {
    const size = this.getNodeSize(node);
    const pos = this.config.nodes.iconPosition || 'top-left';
    const padding = size.height * 0.25;

    // Label position adjusts based on icon position
    const labelPositions: Record<string, Position> = {
      'top-left': { x: size.width / 2 + padding / 2, y: size.height / 2 + 4 },
      'top': { x: size.width / 2, y: size.height / 2 + padding / 2 },
      'top-right': { x: size.width / 2 - padding / 2, y: size.height / 2 + 4 },
      'right': { x: size.width / 2 - padding / 2, y: size.height / 2 },
      'bottom-right': { x: size.width / 2 - padding / 2, y: size.height / 2 - 4 },
      'bottom': { x: size.width / 2, y: size.height / 2 - padding / 2 },
      'bottom-left': { x: size.width / 2 + padding / 2, y: size.height / 2 - 4 },
      'left': { x: size.width / 2 + padding / 2, y: size.height / 2 }
    };

    return labelPositions[pos] || labelPositions['top-left'];
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

  private findEdgeAtPosition(pos: Position): string | null {
    const hitDistance = 10; // pixels tolerance
    for (const edge of this.internalGraph().edges) {
      const sourcePoint = this.getEdgeSourcePoint(edge);
      const targetPoint = this.getEdgeTargetPoint(edge);

      // Calculate distance from point to line segment
      const dist = this.pointToSegmentDistance(pos, sourcePoint, targetPoint);
      if (dist < hitDistance) {
        return edge.id;
      }
    }
    return null;
  }

  private pointToSegmentDistance(point: Position, lineStart: Position, lineEnd: Position): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Line segment is a point
      return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    // Project point onto line segment
    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
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
