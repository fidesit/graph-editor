import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  Type,
  viewChild
} from '@angular/core';
import {NgTemplateOutlet, NgComponentOutlet} from '@angular/common';
// dagre is loaded dynamically in applyLayout() to avoid compile-time resolution issues
import {Graph, GraphEdge, GraphNode, Position} from './graph.model';
import {ContextMenuEvent, GraphEditorConfig, NodeTypeDefinition, SelectionState, ToolbarItem, ValidationResult} from './graph-editor.config';
import {GraphHistoryService} from './services/graph-history.service';
import {SvgIconDefinition} from './icons/workflow-icons';
import {NodeHtmlTemplateDirective, NodeSvgTemplateDirective, EdgeTemplateDirective, NodeTemplateContext, EdgeTemplateContext} from './template.directives';
import {ResolvedTheme, resolveTheme, applyThemeCssProperties} from './theme.resolver';

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
  imports: [NgTemplateOutlet, NgComponentOutlet],
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
  private readonly edgeLabelInputRef = viewChild<ElementRef>('edgeLabelInput');
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
  private didDrag = false; // Track if actual dragging occurred (to suppress click after drag)
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

  // Inline edge label editing state
  editingEdgeLabel = signal<{ edgeId: string; value: string } | null>(null);

  // Edge double-click detection (timer-based fallback for native dblclick)
  private lastEdgeClickTime = 0;
  private lastEdgeClickId: string | null = null;

  editingEdgeLabelScreenPos = computed(() => {
    const editing = this.editingEdgeLabel();
    if (!editing) return null;

    const edge = this.internalGraph().edges.find(e => e.id === editing.edgeId);
    if (!edge) return null;

    const pos = this.getEdgeLabelPosition(edge);
    if (!pos) return null;

    return {
      x: pos.x * this.scale() + this.panX(),
      y: pos.y * this.scale() + this.panY(),
    };
  });

  // Resize state (hand tool)
  private resizingNode: GraphNode | null = null;
  private resizeStartSize: { width: number; height: number } = { width: 0, height: 0 };
  private resizeStartMousePos: Position = { x: 0, y: 0 };
  private resizeMinSize: { width: number; height: number } = { width: 0, height: 0 };

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

  // Resolved theme (filled defaults)
  resolvedTheme!: ResolvedTheme;

  // Shadow configuration (derived from resolved theme)
  shadowsEnabled = computed(() => this.resolvedTheme?.shadows ?? true);

  // Template queries (signal-based contentChild)
  protected nodeHtmlTemplate = contentChild(NodeHtmlTemplateDirective);
  protected nodeSvgTemplate = contentChild(NodeSvgTemplateDirective);
  protected edgeTemplate = contentChild(EdgeTemplateDirective);

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

  private readonly hostEl = inject(ElementRef);

  constructor() {}

  ngOnChanges(changes: SimpleChanges) {
    // Sync graph input to internal signal
    if (changes['graph'] && changes['graph'].currentValue) {
      this.internalGraph.set(structuredClone(changes['graph'].currentValue));
    }
    // Re-resolve theme when config changes
    if (changes['config']) {
      this.resolvedTheme = resolveTheme(this.config.theme);
      applyThemeCssProperties(this.hostEl.nativeElement, this.resolvedTheme, this.config.theme?.variables);
    }
  }

  ngOnInit() {
    // Resolve theme (first time, in case ngOnChanges didn't fire for config)
    if (!this.resolvedTheme) {
      this.resolvedTheme = resolveTheme(this.config.theme);
      applyThemeCssProperties(this.hostEl.nativeElement, this.resolvedTheme, this.config.theme?.variables);
    }
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

    // Escape: cancel edge label editing, cancel line drawing, clear selection
    if (event.key === 'Escape') {
      if (this.editingEdgeLabel()) {
        this.cancelEdgeLabelEdit();
        event.preventDefault();
        return;
      }
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

    // Timer-based double-click detection: after the first click selects the edge
    // and Angular re-renders (adding endpoint circles, direction selector), the
    // second click may hit a different element, preventing the native dblclick
    // from firing.  Detect double-click ourselves as a reliable fallback.
    const now = Date.now();
    if (this.lastEdgeClickId === edge.id && now - this.lastEdgeClickTime < 400) {
      // Treat as double-click
      this.lastEdgeClickId = null;
      this.lastEdgeClickTime = 0;
      this.handleEdgeDoubleClick(event, edge);
      return;
    }
    this.lastEdgeClickId = edge.id;
    this.lastEdgeClickTime = now;

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
    event.preventDefault(); // Suppress native text selection & Edge mini menu
    // Clear the timer so the click handler doesn't fire a duplicate
    this.lastEdgeClickId = null;
    this.lastEdgeClickTime = 0;
    this.handleEdgeDoubleClick(event, edge);
  }

  /** Shared handler for edge double-click (called by native dblclick or timer fallback). */
  private handleEdgeDoubleClick(event: MouseEvent, edge: GraphEdge): void {
    event.preventDefault();
    this.selectEdge(edge.id);
    this.edgeDoubleClick.emit(edge);
    // Start inline label editing (works for edges with or without an existing label)
    if (!this.readonly && !this.config.interaction?.readonly) {
      this.startEdgeLabelEdit(edge);
    }
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

  zoomIn(): void {
    const zoomConfig = this.config.canvas?.zoom;
    const step = zoomConfig?.step ?? 0.1;
    const max = zoomConfig?.max ?? 2.0;
    const newScale = Math.min(max, this.scale() + step);
    this.scale.set(newScale);
  }

  zoomOut(): void {
    const zoomConfig = this.config.canvas?.zoom;
    const step = zoomConfig?.step ?? 0.1;
    const min = zoomConfig?.min ?? 0.25;
    const newScale = Math.max(min, this.scale() - step);
    this.scale.set(newScale);
  }

  getSelection(): SelectionState {
    return this.selection();
  }

  // Event handlers
  onCanvasMouseDown(event: MouseEvent): void {
    if (this.readonly) return;

    // Prevent native text selection on all canvas mousedowns (suppresses Edge mini menu)
    event.preventDefault();

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
    } else if (this.resizingNode) {
      // Node resize - calculate new size based on mouse delta
      const dx = (event.clientX - this.resizeStartMousePos.x) / this.scale();
      const dy = (event.clientY - this.resizeStartMousePos.y) / this.scale();
      
      // Calculate new size, enforcing minimum
      const newWidth = Math.max(this.resizeMinSize.width, this.resizeStartSize.width + dx);
      const newHeight = Math.max(this.resizeMinSize.height, this.resizeStartSize.height + dy);
      
      // Update node size
      const graph = this.internalGraph();
      const nodeIndex = graph.nodes.findIndex(n => n.id === this.resizingNode!.id);
      if (nodeIndex !== -1) {
        const updatedNodes = [...graph.nodes];
        updatedNodes[nodeIndex] = { 
          ...updatedNodes[nodeIndex], 
          size: { width: newWidth, height: newHeight } 
        };
        
        // Recalculate edge ports for edges connected to this node
        const updatedEdges = graph.edges.map(edge => {
          if (edge.source !== this.resizingNode!.id && edge.target !== this.resizingNode!.id) return edge;
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
    } else if (this.isPanning) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      this.panX.set(this.panX() + dx);
      this.panY.set(this.panY() + dy);
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    } else if (this.draggedNode) {
      this.didDrag = true; // Mark that dragging occurred
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
    this.resizingNode = null;
  }

  onNodeMouseDown(event: MouseEvent, node: GraphNode): void {
    if (this.readonly) return;
    event.stopPropagation(); // Always prevent canvas from seeing node mousedowns
    if (this.activeTool() !== 'hand') return;

    this.draggedNode = node;
    this.didDrag = false; // Reset - will be set true if actual movement occurs
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
      // Skip selection change if we just finished dragging
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }
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

  onResizeHandleMouseDown(event: MouseEvent, node: GraphNode): void {
    if (this.readonly) return;
    event.stopPropagation();
    
    this.resizingNode = node;
    const currentSize = this.getNodeSize(node);
    this.resizeStartSize = { ...currentSize };
    this.resizeStartMousePos = { x: event.clientX, y: event.clientY };
    
    // Use current size as minimum (from config or existing node.size)
    this.resizeMinSize = { ...currentSize };
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

  // --- Inline edge label editing ---

  /** Start inline editing of an edge label. Public API — consumers can call this. */
  startEdgeLabelEdit(edge: GraphEdge): void {
    if (this.readonly || this.config.interaction?.readonly) return;
    this.editingEdgeLabel.set({
      edgeId: edge.id,
      value: this.getEdgeLabel(edge) || '',
    });
    // Auto-focus the input after Angular renders it
    setTimeout(() => {
      const input = this.edgeLabelInputRef()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  /** Commit the current inline edge label edit. */
  commitEdgeLabelEdit(newValue: string): void {
    const editing = this.editingEdgeLabel();
    if (!editing) return;

    const trimmed = newValue.trim();
    const graph = this.internalGraph();
    const edgeIndex = graph.edges.findIndex(e => e.id === editing.edgeId);
    if (edgeIndex === -1) {
      this.editingEdgeLabel.set(null);
      return;
    }

    const updatedEdges = [...graph.edges];
    updatedEdges[edgeIndex] = {
      ...updatedEdges[edgeIndex],
      label: trimmed || undefined,
    };

    this.internalGraph.set({ ...graph, edges: updatedEdges });
    this.emitGraphChange();
    this.edgeUpdated.emit(updatedEdges[edgeIndex]);
    this.editingEdgeLabel.set(null);
  }

  /** Cancel the current inline edge label edit without saving. */
  cancelEdgeLabelEdit(): void {
    this.editingEdgeLabel.set(null);
  }

  /** Handle click on an edge label (selects the edge). */
  onEdgeLabelClick(event: MouseEvent, edge: GraphEdge): void {
    event.stopPropagation();

    // Timer-based double-click detection (same rationale as onEdgeClick)
    const now = Date.now();
    if (this.lastEdgeClickId === edge.id && now - this.lastEdgeClickTime < 400) {
      this.lastEdgeClickId = null;
      this.lastEdgeClickTime = 0;
      event.preventDefault();
      this.selectEdge(edge.id);
      this.startEdgeLabelEdit(edge);
      return;
    }
    this.lastEdgeClickId = edge.id;
    this.lastEdgeClickTime = now;

    if (event.ctrlKey || event.metaKey) {
      this.toggleEdgeSelection(edge.id);
    } else {
      this.selectEdge(edge.id);
    }
    this.edgeClick.emit(edge);
  }

  /** Handle double-click on an edge label (starts inline editing). */
  onEdgeLabelDoubleClick(event: MouseEvent, edge: GraphEdge): void {
    event.stopPropagation();
    event.preventDefault(); // Suppress native text selection & Edge mini menu
    this.lastEdgeClickId = null;
    this.lastEdgeClickTime = 0;
    this.selectEdge(edge.id);
    this.startEdgeLabelEdit(edge);
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
    // Check instance-level size override first (from resize)
    if (node.size) return node.size;
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    return nodeConfig?.size || this.config.nodes.defaultSize || { width: 220, height: 100 };
  }

  getEdgePath(edge: GraphEdge): string {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) return '';

    const sourcePort = (edge.sourcePort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = (edge.targetPort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(targetNode, sourceNode, 'target');

    const s = this.getPortWorldPosition(sourceNode, sourcePort);
    const t = this.getPortWorldPosition(targetNode, targetPort);

    const pathType = this.resolvedTheme.edge.pathType;

    if (pathType === 'bezier') {
      const offset = Math.max(40, Math.abs(t.x - s.x) * 0.3, Math.abs(t.y - s.y) * 0.3);
      const sc = this.getPortControlOffset(sourcePort, offset);
      const tc = this.getPortControlOffset(targetPort, offset);
      // Blend a small cross-axis component so the bezier tangent at endpoints
      // isn't purely axis-aligned — this makes arrowheads follow the curve naturally.
      const crossBias = 0.15;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const sc1x = s.x + sc.dx + (sc.dx !== 0 ? 0 : dx * crossBias);
      const sc1y = s.y + sc.dy + (sc.dy !== 0 ? 0 : dy * crossBias);
      const tc1x = t.x + tc.dx + (tc.dx !== 0 ? 0 : dx * -crossBias);
      const tc1y = t.y + tc.dy + (tc.dy !== 0 ? 0 : dy * -crossBias);
      return `M ${s.x},${s.y} C ${sc1x},${sc1y} ${tc1x},${tc1y} ${t.x},${t.y}`;
    }

    if (pathType === 'step') {
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const isSourceVertical = sourcePort === 'top' || sourcePort === 'bottom';
      const isTargetVertical = targetPort === 'top' || targetPort === 'bottom';

      if (isSourceVertical && isTargetVertical) {
        return `M ${s.x},${s.y} L ${s.x},${midY} L ${t.x},${midY} L ${t.x},${t.y}`;
      } else if (!isSourceVertical && !isTargetVertical) {
        return `M ${s.x},${s.y} L ${midX},${s.y} L ${midX},${t.y} L ${t.x},${t.y}`;
      } else if (isSourceVertical) {
        return `M ${s.x},${s.y} L ${s.x},${t.y} L ${t.x},${t.y}`;
      } else {
        return `M ${s.x},${s.y} L ${t.x},${s.y} L ${t.x},${t.y}`;
      }
    }

    return `M ${s.x},${s.y} L ${t.x},${t.y}`;
  }

  /** Get the control point offset direction for a port (used by bezier path). */
  private getPortControlOffset(port: 'top' | 'bottom' | 'left' | 'right', offset: number): { dx: number; dy: number } {
    switch (port) {
      case 'top': return { dx: 0, dy: -offset };
      case 'bottom': return { dx: 0, dy: offset };
      case 'left': return { dx: -offset, dy: 0 };
      case 'right': return { dx: offset, dy: 0 };
    }
  }

  getEdgeColor(edge: GraphEdge): string {
    return edge.metadata?.style?.stroke || this.resolvedTheme.edge.stroke;
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
   * Get image URL for a node icon.
   * Priority: node.data['imageUrl'] > nodeType.iconSvg (converted to data URL) > nodeType.defaultData['imageUrl']
   * Returns null if no image is configured (will render text icon instead).
   */
  getNodeImage(node: GraphNode): string | null {
    // Check instance-level image first
    if (node.data['imageUrl']) {
      return node.data['imageUrl'] as string;
    }

    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);

    // Check for iconSvg definition (convert to data URL)
    if (nodeConfig?.iconSvg) {
      return this.svgIconToDataUrl(nodeConfig.iconSvg);
    }

    // Fall back to node type default imageUrl
    if (nodeConfig?.defaultData['imageUrl']) {
      return nodeConfig.defaultData['imageUrl'] as string;
    }

    return null;
  }

  /**
   * Convert an SvgIconDefinition to a data URL for use in <image> elements.
   * Caches results to avoid repeated conversion.
   */
  private svgIconCache = new Map<SvgIconDefinition, string>();

  private svgIconToDataUrl(icon: SvgIconDefinition): string {
    // Check cache first
    const cached = this.svgIconCache.get(icon);
    if (cached) return cached;

    const viewBox = icon.viewBox || '0 0 24 24';
    const fill = icon.fill || 'none';
    const stroke = icon.stroke || '#1D6A96';
    const strokeWidth = icon.strokeWidth || 2;

    // Build SVG markup with proper path handling
    const paths = icon.path
      .split(/\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<path d="${p}"/>`)
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="${viewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

    // Encode as data URL
    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    this.svgIconCache.set(icon, dataUrl);
    return dataUrl;
  }

  /**
   * Get the SVG icon definition for a node type (for palette rendering).
   * Returns null if no iconSvg is configured.
   */
  getNodeTypeSvgIcon(nodeType: NodeTypeDefinition): SvgIconDefinition | null {
    return nodeType.iconSvg || null;
  }

  /**
   * Split SVG path data by newlines for template iteration.
   * Used to render multiple path elements from a single path string.
   */
  splitIconPaths(pathData: string): string[] {
    return pathData
      .split(/\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Split node types into columns for the palette.
   * When there are too many node types to fit vertically, creates additional columns.
   */
  getPaletteColumns(): NodeTypeDefinition[][] {
    const types = this.config.nodes.types;
    if (!types || types.length === 0) return [];
    
    // Calculate available height for palette
    // Top toolbar: 72px (12px top + 36px height + 12px gap + 12px extra)
    // Bottom padding: 12px
    // Each item: 40px (36px height + 4px gap)
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const toolbarHeight = this.config.toolbar?.enabled !== false ? 72 : 0;
    const availableHeight = viewportHeight - toolbarHeight - 12 - 12; // toolbar + gaps + bottom padding
    const itemHeight = 40;
    const maxItemsPerColumn = Math.max(1, Math.floor(availableHeight / itemHeight));
    
    // Split into columns
    const columns: NodeTypeDefinition[][] = [];
    for (let i = 0; i < types.length; i += maxItemsPerColumn) {
      columns.push(types.slice(i, i + maxItemsPerColumn));
    }
    return columns;
  }

  /**
   * Check whether a toolbar item should be shown.
   * If `config.toolbar.items` is not set, all items are visible.
   */
  showToolbarItem(item: ToolbarItem): boolean {
    const items = this.config.toolbar?.items;
    return !items || items.includes(item);
  }

  /**
   * Check whether a divider should be shown between two toolbar groups.
   * A divider is shown when at least one item from the group before and
   * at least one item from the group after are visible.
   */
  showToolbarDivider(before: ToolbarItem[], after: ToolbarItem[]): boolean {
    return before.some(i => this.showToolbarItem(i)) && after.some(i => this.showToolbarItem(i));
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

  /**
   * Get the bounding box for label text within a node.
   * This box avoids the icon area and has proper padding.
   */
  getLabelBounds(node: GraphNode): { x: number; y: number; width: number; height: number } {
    const size = this.getNodeSize(node);
    const iconPos = this.config.nodes.iconPosition || 'top-left';
    const padding = 12; // Padding from node edges
    const iconAreaSize = Math.max(this.getImageSize(node), size.height * 0.35) + 8; // Icon + gap
    
    // Default: full node minus padding
    let x = padding;
    let y = padding;
    let width = size.width - padding * 2;
    let height = size.height - padding * 2;
    
    // Adjust based on icon position
    switch (iconPos) {
      case 'top-left':
      case 'left':
      case 'bottom-left':
        // Icon on left - text area starts after icon
        x = iconAreaSize + padding / 2;
        width = size.width - iconAreaSize - padding - padding / 2;
        break;
      case 'top-right':
      case 'right':
      case 'bottom-right':
        // Icon on right - text area ends before icon
        width = size.width - iconAreaSize - padding - padding / 2;
        break;
      case 'top':
        // Icon on top - text area below icon
        y = iconAreaSize + padding / 2;
        height = size.height - iconAreaSize - padding - padding / 2;
        break;
      case 'bottom':
        // Icon on bottom - text area above icon
        height = size.height - iconAreaSize - padding - padding / 2;
        break;
    }
    
    return { x, y, width: Math.max(width, 20), height: Math.max(height, 20) };
  }

  /**
   * Get wrapped text lines and font size for a node label.
   * Uses text wrapping first, then font downsizing if needed.
   */
  getWrappedLabel(node: GraphNode): { lines: string[]; fontSize: number; lineHeight: number } {
    const text = (node.data['name'] || node.type) as string;
    const bounds = this.getLabelBounds(node);
    const baseFontSize = 14;
    const minFontSize = 9;
    const lineHeightRatio = 1.3;
    
    // Try wrapping at current font size, then reduce if needed
    for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
      const charWidth = fontSize * 0.6; // Approximate character width
      const lineHeight = fontSize * lineHeightRatio;
      const maxCharsPerLine = Math.floor(bounds.width / charWidth);
      const maxLines = Math.floor(bounds.height / lineHeight);
      
      if (maxCharsPerLine < 3 || maxLines < 1) continue;
      
      const lines = this.wrapText(text, maxCharsPerLine);
      
      // Check if text fits
      if (lines.length <= maxLines) {
        return { lines, fontSize, lineHeight };
      }
      
      // If at minimum font size, truncate
      if (fontSize === minFontSize) {
        const truncatedLines = lines.slice(0, maxLines);
        if (lines.length > maxLines && truncatedLines.length > 0) {
          // Add ellipsis to last line
          const lastLine = truncatedLines[truncatedLines.length - 1];
          if (lastLine.length > 3) {
            truncatedLines[truncatedLines.length - 1] = lastLine.slice(0, -3) + '...';
          }
        }
        return { lines: truncatedLines, fontSize, lineHeight };
      }
    }
    
    // Fallback
    return { lines: [text], fontSize: minFontSize, lineHeight: minFontSize * lineHeightRatio };
  }

  /**
   * Wrap text into lines respecting max characters per line.
   * Tries to break at word boundaries.
   */
  private wrapText(text: string, maxCharsPerLine: number): string[] {
    if (text.length <= maxCharsPerLine) {
      return [text];
    }
    
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length === 0) {
        // First word on line
        if (word.length > maxCharsPerLine) {
          // Word too long, break it
          let remaining = word;
          while (remaining.length > maxCharsPerLine) {
            lines.push(remaining.slice(0, maxCharsPerLine - 1) + '-');
            remaining = remaining.slice(maxCharsPerLine - 1);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        // Word fits on current line
        currentLine += ' ' + word;
      } else {
        // Start new line
        lines.push(currentLine);
        if (word.length > maxCharsPerLine) {
          // Word too long, break it
          let remaining = word;
          while (remaining.length > maxCharsPerLine) {
            lines.push(remaining.slice(0, maxCharsPerLine - 1) + '-');
            remaining = remaining.slice(maxCharsPerLine - 1);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  /**
   * Get the Y position for each line of wrapped text (centered vertically).
   */
  getLabelLineY(node: GraphNode, lineIndex: number, totalLines: number, lineHeight: number): number {
    const bounds = this.getLabelBounds(node);
    const totalTextHeight = totalLines * lineHeight;
    const startY = bounds.y + (bounds.height - totalTextHeight) / 2 + lineHeight / 2;
    return startY + lineIndex * lineHeight;
  }

  /**
   * Get the X position for label text (centered in bounds).
   */
  getLabelLineX(node: GraphNode): number {
    const bounds = this.getLabelBounds(node);
    return bounds.x + bounds.width / 2;
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

  /** Get the component type for a node (from NodeTypeDefinition.component, if set). */
  getNodeComponent(node: GraphNode): Type<any> | null {
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    return nodeConfig?.component ?? null;
  }

  /** Build inputs map for ngComponentOutlet when rendering a node's custom component. */
  getNodeComponentInputs(node: GraphNode): Record<string, any> {
    const size = this.getNodeSize(node);
    return {
      node,
      selected: this.selection().nodes.includes(node.id),
      width: size.width,
      height: size.height,
      config: this.config,
    };
  }

  /** Build the template context for custom node templates. */
  getNodeTemplateContext(node: GraphNode): NodeTemplateContext {
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type)!;
    const size = this.getNodeSize(node);
    return {
      $implicit: {
        node,
        type: nodeConfig,
        selected: this.selection().nodes.includes(node.id),
        width: size.width,
        height: size.height,
      },
    };
  }

  /**
   * Get the display label for an edge.
   * Priority: edge.label > edge.metadata?.label > null
   */
  getEdgeLabel(edge: GraphEdge): string | null {
    return edge.label || edge.metadata?.label || null;
  }

  /**
   * Get the position for an edge label along the edge path.
   * Evaluates the position at `t` (0=source, 1=target) on the actual path geometry.
   */
  getEdgeLabelPosition(edge: GraphEdge): Position | null {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return null;

    const sourcePort = (edge.sourcePort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = (edge.targetPort as 'top' | 'bottom' | 'left' | 'right') || this.findClosestPortForEdge(targetNode, sourceNode, 'target');

    const s = this.getPortWorldPosition(sourceNode, sourcePort);
    const t = this.getPortWorldPosition(targetNode, targetPort);
    const pathT = this.resolvedTheme.edge.label.position;
    const offsetY = this.resolvedTheme.edge.label.offsetY;
    const pathType = this.resolvedTheme.edge.pathType;

    let pos: Position;

    if (pathType === 'bezier') {
      // Evaluate cubic bezier at t
      const offset = Math.max(40, Math.abs(t.x - s.x) * 0.3, Math.abs(t.y - s.y) * 0.3);
      const sc = this.getPortControlOffset(sourcePort, offset);
      const tc = this.getPortControlOffset(targetPort, offset);
      const crossBias = 0.15;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const c1x = s.x + sc.dx + (sc.dx !== 0 ? 0 : dx * crossBias);
      const c1y = s.y + sc.dy + (sc.dy !== 0 ? 0 : dy * crossBias);
      const c2x = t.x + tc.dx + (tc.dx !== 0 ? 0 : dx * -crossBias);
      const c2y = t.y + tc.dy + (tc.dy !== 0 ? 0 : dy * -crossBias);

      // De Casteljau evaluation
      const u = 1 - pathT;
      pos = {
        x: u * u * u * s.x + 3 * u * u * pathT * c1x + 3 * u * pathT * pathT * c2x + pathT * pathT * pathT * t.x,
        y: u * u * u * s.y + 3 * u * u * pathT * c1y + 3 * u * pathT * pathT * c2y + pathT * pathT * pathT * t.y,
      };
    } else if (pathType === 'step') {
      // Evaluate piecewise linear step path at t
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const isSourceVertical = sourcePort === 'top' || sourcePort === 'bottom';
      const isTargetVertical = targetPort === 'top' || targetPort === 'bottom';

      let segments: Position[];
      if (isSourceVertical && isTargetVertical) {
        segments = [s, { x: s.x, y: midY }, { x: t.x, y: midY }, t];
      } else if (!isSourceVertical && !isTargetVertical) {
        segments = [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
      } else if (isSourceVertical) {
        segments = [s, { x: s.x, y: t.y }, t];
      } else {
        segments = [s, { x: t.x, y: s.y }, t];
      }

      pos = this.evaluatePolylineAt(segments, pathT);
    } else {
      // Straight line — simple lerp
      pos = {
        x: s.x + (t.x - s.x) * pathT,
        y: s.y + (t.y - s.y) * pathT,
      };
    }

    return { x: pos.x, y: pos.y + offsetY };
  }

  /**
   * Evaluate a position along a polyline at parameter t (0..1).
   */
  private evaluatePolylineAt(points: Position[], t: number): Position {
    if (points.length < 2) return points[0] || { x: 0, y: 0 };

    // Compute total length and per-segment lengths
    let totalLength = 0;
    const segLengths: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(len);
      totalLength += len;
    }

    if (totalLength === 0) return points[0];

    const targetDist = t * totalLength;
    let accumulated = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (accumulated + segLengths[i] >= targetDist) {
        const segT = segLengths[i] === 0 ? 0 : (targetDist - accumulated) / segLengths[i];
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * segT,
          y: points[i].y + (points[i + 1].y - points[i].y) * segT,
        };
      }
      accumulated += segLengths[i];
    }

    return points[points.length - 1];
  }

  /**
   * Get the background rect dimensions for an edge label.
   * Returns x, y, width, height centered around the label position.
   */
  getEdgeLabelRect(edge: GraphEdge): { x: number; y: number; width: number; height: number } | null {
    const label = this.getEdgeLabel(edge);
    const pos = this.getEdgeLabelPosition(edge);
    if (!label || !pos) return null;

    const theme = this.resolvedTheme.edge.label;
    const charWidth = theme.fontSize * 0.62;
    const textWidth = label.length * charWidth;
    const textHeight = theme.fontSize;
    const width = textWidth + theme.paddingX * 2;
    const height = textHeight + theme.paddingY * 2;

    return {
      x: pos.x - width / 2,
      y: pos.y - height / 2,
      width,
      height,
    };
  }

  /** Build the template context for custom edge templates. */
  getEdgeTemplateContext(edge: GraphEdge): EdgeTemplateContext {
    return {
      $implicit: {
        edge,
        path: this.getEdgePath(edge),
        selected: this.selection().edges.includes(edge.id),
      },
    };
  }
}
