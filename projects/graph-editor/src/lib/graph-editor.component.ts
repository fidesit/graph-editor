import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
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
import {Graph, GraphEdge, GraphNode, GuideLine, Position} from './graph.model';
import {ContextMenuEvent, GraphEditorConfig, NodeTypeDefinition, SelectionState, ToolbarItem, ValidationResult} from './graph-editor.config';
import {GraphHistoryService} from './services/graph-history.service';
import {SvgIconDefinition} from './icons/workflow-icons';
import {NodeHtmlTemplateDirective, NodeSvgTemplateDirective, EdgeTemplateDirective, NodeTemplateContext, EdgeTemplateContext} from './template.directives';
import {ResolvedTheme, resolveTheme, applyThemeCssProperties} from './theme.resolver';
import {
  getPortSide, getPortControlOffset,
  buildRoundedPolyline, buildSmoothBezierThroughPoints, buildStepThroughPoints,
  buildBezierPath, buildStepPath, buildStraightPath,
  pointToSegmentDistance, evaluatePolylineAt, getEdgeHitTestPolyline
} from './utils/edge-path.utils';
import {
  getNodeImageSize, getNodeImagePosition, getNodeIconPosition,
  getNodeLabelPosition, getNodeLabelBounds, getWrappedNodeLabel, wrapText,
  IconPosition
} from './utils/node-rendering.utils';
import {
  computeSnapGuides as computeSnapGuidesUtil,
  computeResizeSnapGuides as computeResizeSnapGuidesUtil
} from './utils/snap-guide.utils';
import {
  computePortPositions, getNodePorts as getNodePortsUtil,
  getPortWorldPosition as getPortWorldPositionUtil,
  rankPortsForEdge, findClosestPortForEdge as findClosestPortForEdgeUtil
} from './utils/port-geometry.utils';
import { layoutDagre as layoutDagreUtil, layoutCompact as layoutCompactUtil } from './utils/layout-algorithms';
import { invokeAsyncHook, invokeSyncHook } from './lifecycle-hooks';

// ── Constants ──
const DOUBLE_CLICK_TIMEOUT_MS = 400;
const PORT_SNAP_DISTANCE = 40;
const EDGE_HIT_DISTANCE = 10;
const WAYPOINT_HIT_DISTANCE = 20;
const PASTE_OFFSET_PX = 30;
const DEFAULT_NODE_SIZE = { width: 220, height: 100 };
const FLY_IN_DURATION_MS = 400;
const EDGE_LABEL_CHAR_WIDTH_RATIO = 0.62;

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
  private readonly destroyRef = inject(DestroyRef);

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
  hoveredPort: { nodeId: string; port: string } | null = null;

  // Attachment points visibility
  showAttachmentPoints = signal<string | null>(null); // nodeId to show ports for

  // Active tool
  activeTool = signal<'hand'>('hand');

  // Drag-to-connect state (mousedown on attachment point → drag → mouseup on target port)
  private connectingFrom: { nodeId: string; port: string } | null = null;

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

  // Clipboard for copy/paste
  private clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;
  private pasteCount = 0; // Track successive pastes for cascading offset

  // Layout algorithm dropdown
  layoutDropdownOpen = signal(false);
  selectedLayoutAlgorithm = signal<'dagre-tb' | 'dagre-lr' | 'compact'>('dagre-tb');

  // Edge path type dropdown
  edgeTypeDropdownOpen = signal(false);
  /** Runtime override for edge path type. `null` = use theme default. */
  private edgePathTypeOverride = signal<'straight' | 'bezier' | 'step' | null>(null);

  // Fly-in animation state
  flyInNodeId = signal<string | null>(null);

  // Snap guides (alignment lines shown during node drag)
  snapGuides = signal<GuideLine[]>([]);

  // Edge waypoint interaction state
  waypointPreview = signal<{ edgeId: string; position: Position } | null>(null);
  draggingWaypoint = signal<{ edgeId: string; index: number } | null>(null);

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
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; });
  }

  ngOnChanges(changes: SimpleChanges) {
    // Re-resolve theme when config changes (before graph processing so port spacing is available)
    if (changes['config']) {
      this.resolvedTheme = resolveTheme(this.config.theme);
      applyThemeCssProperties(this.hostEl.nativeElement, this.resolvedTheme, this.config.theme?.variables);
      // Reset edge path type override so theme default takes over
      this.edgePathTypeOverride.set(null);
    }
    // Sync graph input to internal signal
    if (changes['graph'] && changes['graph'].currentValue) {
      const graph: Graph = structuredClone(changes['graph'].currentValue);
      // Recalculate edge ports with conflict avoidance so parallel edges
      // between the same node pair don't collapse onto identical ports.
      // Only assign ports to edges missing them — never overwrite user-set ports.
      const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
        graph.edges, graph.nodes, (edge) => !edge.sourcePort || !edge.targetPort
      );
      this.internalGraph.set({ ...graph, edges: updatedEdges });
    }
  }

  ngOnInit() {
    // Resolve theme (first time, in case ngOnChanges didn't fire for config)
    if (!this.resolvedTheme) {
      this.resolvedTheme = resolveTheme(this.config.theme);
      applyThemeCssProperties(this.hostEl.nativeElement, this.resolvedTheme, this.config.theme?.variables);
    }
    // Initialize with current graph value (if ngOnChanges hasn't already set it)
    if (this.graph && this.internalGraph().nodes.length === 0 && this.graph.nodes?.length > 0) {
      const graph: Graph = structuredClone(this.graph);
      const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
        graph.edges, graph.nodes, (edge) => !edge.sourcePort || !edge.targetPort
      );
      this.internalGraph.set({ ...graph, edges: updatedEdges });
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

  /** Add node triggered from palette button — plays fly-in animation from the button to the canvas. */
  async addNodeFromPalette(type: string, event: MouseEvent): Promise<void> {
    // Check beforeNodeAdd hook (user-initiated via palette)
    const allowed = await invokeAsyncHook(this.config.hooks?.beforeNodeAdd, type, this.internalGraph());
    if (!allowed) return;

    const btn = (event.target as HTMLElement).closest('.palette-item') as HTMLElement;
    const node = this.addNode(type);

    if (!btn || !this.canvasSvgRef) return;

    // -- Source rect (palette button) --
    const btnRect = btn.getBoundingClientRect();
    const containerEl = this.hostEl.nativeElement.querySelector('.graph-editor-container') as HTMLElement;
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();

    // -- Target position (node centre → screen coords) --
    const nodeSize = this.getNodeSize(node);
    const nodeCx = node.position.x + nodeSize.width / 2;
    const nodeCy = node.position.y + nodeSize.height / 2;
    const screenX = containerRect.left + nodeCx * this.scale() + this.panX();
    const screenY = containerRect.top + nodeCy * this.scale() + this.panY();

    // -- Create ghost element --
    const ghost = document.createElement('div');
    ghost.className = 'ge-fly-ghost';
    ghost.style.cssText = `
      position: fixed;
      left: ${btnRect.left + btnRect.width / 2}px;
      top: ${btnRect.top + btnRect.height / 2}px;
      width: ${btnRect.width}px;
      height: ${btnRect.height}px;
      border-radius: ${getComputedStyle(btn).borderRadius};
      background: ${getComputedStyle(btn).background};
      border: ${getComputedStyle(btn).border};
      opacity: 0.85;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%) scale(1);
      transition: all 0.35s cubic-bezier(0.4, 0, 0.15, 1);
    `;
    document.body.appendChild(ghost);

    // Mark node for CSS entrance animation
    this.flyInNodeId.set(node.id);

    // Trigger transition on next frame
    requestAnimationFrame(() => {
      ghost.style.left = `${screenX}px`;
      ghost.style.top = `${screenY}px`;
      ghost.style.transform = `translate(-50%, -50%) scale(${this.scale()})`;
      ghost.style.opacity = '0';
    });

    // Cleanup ghost + animation class
    setTimeout(() => {
      ghost.remove();
      if (!this.destroyed) this.flyInNodeId.set(null);
    }, FLY_IN_DURATION_MS);
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

    // Escape: close layout dropdown, cancel edge label editing, cancel line drawing, clear selection
    if (event.key === 'Escape') {
      if (this.layoutDropdownOpen() || this.edgeTypeDropdownOpen()) {
        this.layoutDropdownOpen.set(false);
        this.edgeTypeDropdownOpen.set(false);
        event.preventDefault();
        return;
      }
      if (this.editingEdgeLabel()) {
        this.cancelEdgeLabelEdit();
        event.preventDefault();
        return;
      }
      this.connectingFrom = null;
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

    // Copy: Ctrl+C (or Cmd+C on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      this.copySelection();
      event.preventDefault();
      return;
    }

    // Cut: Ctrl+X (or Cmd+X on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
      this.cutSelection();
      event.preventDefault();
      return;
    }

    // Paste: Ctrl+V (or Cmd+V on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      this.pasteClipboard();
      event.preventDefault();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const sel = this.selection();
      if (sel.nodes.length === 0 && sel.edges.length === 0) return;
      event.preventDefault();
      this.deleteSelection();
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

      // Recalculate edge ports for moved nodes (with conflict avoidance for parallel edges)
      const movedIds = new Set(sel.nodes);
      const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
        graph.edges, updatedNodes,
        edge => movedIds.has(edge.source) || movedIds.has(edge.target)
      );

      this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
      this.emitGraphChange();
    }
  }

  switchTool(tool: 'hand'): void {
    // Cancel any in-progress connection
    this.connectingFrom = null;
    this.previewLine.set(null);
    this.showAttachmentPoints.set(null);

    this.selection.set({ nodes: [], edges: [] });
    this.selectionChange.emit(this.selection());

    this.activeTool.set(tool);
  }

  onEdgeClick(event: MouseEvent, edge: GraphEdge): void {
    if (this.activeTool() !== 'hand') return;
    event.stopPropagation();

    // Timer-based double-click detection: after the first click selects the edge
    // and Angular re-renders (adding endpoint circles, direction selector), the
    // second click may hit a different element, preventing the native dblclick
    // from firing.  Detect double-click ourselves as a reliable fallback.
    const now = Date.now();
    if (this.lastEdgeClickId === edge.id && now - this.lastEdgeClickTime < DOUBLE_CLICK_TIMEOUT_MS) {
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
    const labelEditEnabled = this.config.interaction?.edgeLabelEditOnDoubleClick !== false;
    if (!this.readonly && !this.config.interaction?.readonly && labelEditEnabled) {
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

  // Layout — dispatcher supporting multiple algorithms
  async applyLayout(algorithmOverride?: string): Promise<void> {
    // Map legacy direction parameters to algorithm keys
    if (algorithmOverride === 'TB') algorithmOverride = 'dagre-tb';
    if (algorithmOverride === 'LR') algorithmOverride = 'dagre-lr';

    const algo = algorithmOverride ?? this.selectedLayoutAlgorithm();
    this.layoutDropdownOpen.set(false);

    const graph = this.internalGraph();
    if (graph.nodes.length === 0) return;

    let updatedNodes: GraphNode[];
    switch (algo) {
      case 'dagre-tb': updatedNodes = await this.layoutDagre(graph, 'TB'); break;
      case 'dagre-lr': updatedNodes = await this.layoutDagre(graph, 'LR'); break;
      case 'compact':  updatedNodes = await this.layoutCompact(graph); break;
      default: return;
    }

    if (algorithmOverride) {
      this.selectedLayoutAlgorithm.set(algo as 'dagre-tb' | 'dagre-lr' | 'compact');
    }

    this.applyLayoutPositions(graph, updatedNodes);
  }

  /** Dagre hierarchical layout */
  private async layoutDagre(graph: Graph, direction: 'TB' | 'LR'): Promise<GraphNode[]> {
    return layoutDagreUtil(graph, direction, n => this.getNodeSize(n), this.config.layout?.options);
  }

  /** Compact layout — grid packing via topological order to minimize total area */
  private async layoutCompact(graph: Graph): Promise<GraphNode[]> {
    return layoutCompactUtil(graph, n => this.getNodeSize(n));
  }

  /** Shared post-layout: recalculate edge ports, update graph, emit change, fit to screen */
  private applyLayoutPositions(graph: Graph, updatedNodes: GraphNode[]): void {
    const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
      graph.edges, updatedNodes, () => true
    );

    this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
    this.emitGraphChange();
    setTimeout(() => { if (!this.destroyed) this.fitToScreen(); });
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
    // CTRL+click to add waypoint on edge
    if (event.ctrlKey && this.waypointPreview()) {
      const preview = this.waypointPreview()!;
      const graph = this.internalGraph();
      const edgeIndex = graph.edges.findIndex(e => e.id === preview.edgeId);
      if (edgeIndex >= 0) {
        const edge = graph.edges[edgeIndex];
        const sourcePoint = this.getEdgeSourcePoint(edge);
        const targetPoint = this.getEdgeTargetPoint(edge);
        const existingWaypoints = edge.waypoints || [];
        const polyline = [sourcePoint, ...existingWaypoints, targetPoint];

        // Find which segment the new point falls on
        let bestSeg = 0, bestDist = Infinity;
        for (let i = 0; i < polyline.length - 1; i++) {
          const d = pointToSegmentDistance(preview.position, polyline[i], polyline[i + 1]);
          if (d < bestDist) { bestDist = d; bestSeg = i; }
        }

        // Insert after the start of that segment (index in waypoints array)
        const insertIndex = bestSeg;
        const newWaypoints = [...existingWaypoints];
        newWaypoints.splice(insertIndex, 0, preview.position);

        const updatedEdges = [...graph.edges];
        updatedEdges[edgeIndex] = { ...edge, waypoints: newWaypoints };
        this.internalGraph.set({ ...graph, edges: updatedEdges });
        this.emitGraphChange();
        this.waypointPreview.set(null);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Close dropdowns on any canvas interaction
    this.layoutDropdownOpen.set(false);
    this.edgeTypeDropdownOpen.set(false);

    // Prevent native text selection on all canvas mousedowns (suppresses Edge mini menu)
    event.preventDefault();

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

      if (!this.readonly && event.shiftKey && this.activeTool() === 'hand') {
        // Shift+drag = box selection (only with hand tool, not in readonly)
        this.isBoxSelecting = true;
        this.boxSelectStart = { x: mouseX, y: mouseY };
        this.selectionBox.set({ x: mouseX, y: mouseY, width: 0, height: 0 });
      } else {
        // Normal drag = pan (always allowed, including readonly)
        this.isPanning = true;
      }
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      if (!this.readonly) {
        this.clearSelection();
      }
    } else if (this.readonly) {
      // In readonly, block all interactive element interactions (nodes, edges, ports)
      return;
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    // Waypoint dragging (before all other drag logic)
    if (this.draggingWaypoint()) {
      const dw = this.draggingWaypoint()!;
      const svg = (event.currentTarget as SVGSVGElement);
      const rect = svg.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
      const graph = this.internalGraph();
      const edgeIndex = graph.edges.findIndex(e => e.id === dw.edgeId);
      if (edgeIndex >= 0) {
        const edge = graph.edges[edgeIndex];
        const newWaypoints = [...(edge.waypoints || [])];
        newWaypoints[dw.index] = { x: mouseX, y: mouseY };
        const updatedEdges = [...graph.edges];
        updatedEdges[edgeIndex] = { ...edge, waypoints: newWaypoints };
        this.internalGraph.set({ ...graph, edges: updatedEdges });
        this.emitGraphChange(true); // skipHistory during drag
      }
      return;
    }

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
      let newWidth = Math.max(this.resizeMinSize.width, this.resizeStartSize.width + dx);
      let newHeight = Math.max(this.resizeMinSize.height, this.resizeStartSize.height + dy);

      // Snap guides for resize: snap the right/bottom edges to other nodes
      const nodePos = this.resizingNode.position;
      const candidateSize = { width: newWidth, height: newHeight };
      const draggedIds = new Set([this.resizingNode.id]);
      const { snappedSize, guides } = this.computeResizeSnapGuides(nodePos, candidateSize, draggedIds);
      this.snapGuides.set(guides);
      newWidth = snappedSize.width;
      newHeight = snappedSize.height;

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
        const resizingId = this.resizingNode!.id;
        const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
          graph.edges, updatedNodes,
          edge => edge.source === resizingId || edge.target === resizingId
        );
        
        this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
        this.emitGraphChange(true); // Skip history during resize — pushed on mouseUp
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
        // Multi-node drag: compute bounding box for snap guides
        const draggedNodeEntries: { nodeId: string; offset: Position; nodeIndex: number }[] = [];
        let bbLeft = Infinity, bbTop = Infinity, bbRight = -Infinity, bbBottom = -Infinity;

        for (const [nodeId, offset] of this.draggedNodeOffsets) {
          const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
          if (nodeIndex === -1) continue;
          draggedNodeEntries.push({ nodeId, offset, nodeIndex });

          const candidateX = mouseX - offset.x;
          const candidateY = mouseY - offset.y;
          const size = this.getNodeSize(updatedNodes[nodeIndex]);
          bbLeft = Math.min(bbLeft, candidateX);
          bbTop = Math.min(bbTop, candidateY);
          bbRight = Math.max(bbRight, candidateX + size.width);
          bbBottom = Math.max(bbBottom, candidateY + size.height);
        }

        const bbWidth = bbRight - bbLeft;
        const bbHeight = bbBottom - bbTop;
        const draggedIds = new Set(this.draggedNodeOffsets.keys());

        // Compute snap guides based on bounding box
        const { snappedPos: snappedBB, guides } = this.computeSnapGuides(
          { x: bbLeft, y: bbTop },
          { width: bbWidth, height: bbHeight },
          draggedIds
        );
        this.snapGuides.set(guides);

        const snapDx = snappedBB.x - bbLeft;
        const snapDy = snappedBB.y - bbTop;

        // Apply snapped positions to all dragged nodes
        for (const { nodeId, offset, nodeIndex } of draggedNodeEntries) {
          let x = mouseX - offset.x + snapDx;
          let y = mouseY - offset.y + snapDy;

          // Grid snap (only when no guide snap was applied on that axis)
          if (this.config.canvas?.grid?.snap) {
            const gridSize = this.config.canvas.grid.size || 20;
            const snapThreshold = gridSize / 4;
            if (snapDx === 0) {
              const snapX = Math.round(x / gridSize) * gridSize;
              if (Math.abs(x - snapX) < snapThreshold) x = snapX;
            }
            if (snapDy === 0) {
              const snapY = Math.round(y / gridSize) * gridSize;
              if (Math.abs(y - snapY) < snapThreshold) y = snapY;
            }
          }

          updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: { x, y } };
          movedNodeIds.add(nodeId);
        }
      } else {
        // Single node drag
        let x = mouseX - this.dragOffset.x;
        let y = mouseY - this.dragOffset.y;

        const nodeSize = this.getNodeSize(this.draggedNode!);
        const draggedIds = new Set([this.draggedNode!.id]);
        const { snappedPos, guides } = this.computeSnapGuides({ x, y }, nodeSize, draggedIds);
        this.snapGuides.set(guides);

        x = snappedPos.x;
        y = snappedPos.y;

        // Grid snap (only when no guide snap was applied on that axis)
        if (this.config.canvas?.grid?.snap) {
          const gridSize = this.config.canvas.grid.size || 20;
          const snapThreshold = gridSize / 4;
          if (x === mouseX - this.dragOffset.x) { // No X guide snap
            const snapX = Math.round(x / gridSize) * gridSize;
            if (Math.abs(x - snapX) < snapThreshold) x = snapX;
          }
          if (y === mouseY - this.dragOffset.y) { // No Y guide snap
            const snapY = Math.round(y / gridSize) * gridSize;
            if (Math.abs(y - snapY) < snapThreshold) y = snapY;
          }
        }

        const nodeIndex = updatedNodes.findIndex(n => n.id === this.draggedNode!.id);
        if (nodeIndex !== -1) {
          updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: { x, y } };
          movedNodeIds.add(this.draggedNode!.id);
        }
      }

      // Recalculate ports for all edges connected to moved nodes
      const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
        graph.edges, updatedNodes,
        edge => movedNodeIds.has(edge.source) || movedNodeIds.has(edge.target)
      );

      this.internalGraph.set({ ...graph, nodes: updatedNodes, edges: updatedEdges });
      this.emitGraphChange(true); // Skip history during drag — pushed on mouseUp
    } else if (this.draggedEdge) {
      // Edge reconnection - find hovered node and closest port
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();

      // Determine the fixed endpoint (the one NOT being dragged)
      const edge = this.draggedEdge.edge;
      const fixedEndpoint = this.draggedEdge.endpoint === 'source' ? 'target' : 'source';
      const fixedNodeId = fixedEndpoint === 'source' ? edge.source : edge.target;
      const fixedNode = this.internalGraph().nodes.find(n => n.id === fixedNodeId);
      let fixedPoint: Position = { x: mouseX, y: mouseY };
      if (fixedNode) {
        const fixedPort = (fixedEndpoint === 'source' ? edge.sourcePort : edge.targetPort)
          || this.findClosestPortForEdge(fixedNode, fixedNode, fixedEndpoint);
        fixedPoint = this.getPortWorldPosition(fixedNode, fixedPort);
      }

      let dragPoint: Position = { x: mouseX, y: mouseY };

      // Find node under cursor
      const nodeId = this.findNodeAtPosition({ x: mouseX, y: mouseY });

      if (nodeId) {
        // Show attachment points for this node
        this.showAttachmentPoints.set(nodeId);

        // Find closest port
        const closestPort = this.findClosestPort(nodeId, { x: mouseX, y: mouseY });

        // Highlight port if within snap distance (40px)
        if (closestPort && closestPort.distance < PORT_SNAP_DISTANCE) {
          // Determine source and target for canConnect based on which endpoint is being dragged
          const reconnectSource = this.draggedEdge!.endpoint === 'source'
            ? { nodeId, port: closestPort.port }
            : { nodeId: edge.source, port: edge.sourcePort || '' };
          const reconnectTarget = this.draggedEdge!.endpoint === 'target'
            ? { nodeId, port: closestPort.port }
            : { nodeId: edge.target, port: edge.targetPort || '' };
          const canConn = invokeSyncHook(
            this.config.hooks?.canConnect,
            reconnectSource, reconnectTarget,
            this.internalGraph()
          );
          if (canConn) {
            this.hoveredPort = { nodeId, port: closestPort.port };
            this.hoveredNodeId = nodeId;
            // Snap drag point to port
            const hoveredNode = this.internalGraph().nodes.find(n => n.id === nodeId);
            if (hoveredNode) {
              dragPoint = this.getPortWorldPosition(hoveredNode, closestPort.port);
            }
          } else {
            this.hoveredPort = null;
            this.hoveredNodeId = null;
          }
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

      // Show rubber-band preview line from fixed endpoint to drag point
      this.previewLine.set({ source: fixedPoint, target: dragPoint });
    } else if (this.connectingFrom) {
      // Rubber-band preview for drag-to-connect (mousedown on port → drag → mouseup on target port)
      const sourceId = this.connectingFrom.nodeId;
      const sourcePort = this.connectingFrom.port;

      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();

      // Get source port position
      const sourceNode = this.internalGraph().nodes.find(n => n.id === sourceId);
      if (sourceNode) {
        const sourcePoint = this.getPortWorldPosition(sourceNode, sourcePort);

        // Check if cursor is near a node - snap to its closest port
        const hoveredNodeId = this.findNodeAtPosition({ x: mouseX, y: mouseY });
        let targetPoint: Position = { x: mouseX, y: mouseY };

        if (hoveredNodeId && hoveredNodeId !== sourceId) {
          // Show attachment points on hovered node
          this.showAttachmentPoints.set(hoveredNodeId);

          // Find and highlight closest port
          const closestPort = this.findClosestPort(hoveredNodeId, { x: mouseX, y: mouseY });
          if (closestPort && closestPort.distance < PORT_SNAP_DISTANCE) {
            // Check canConnect hook before highlighting
            const canConn = invokeSyncHook(
              this.config.hooks?.canConnect,
              { nodeId: sourceId, port: sourcePort },
              { nodeId: hoveredNodeId, port: closestPort.port },
              this.internalGraph()
            );
            if (canConn) {
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

    // CTRL+hover: show waypoint preview on nearest edge segment
    if (event.ctrlKey && !this.draggedNode && !this.isPanning && !this.resizingNode && !this.connectingFrom && !this.draggedEdge && !this.isBoxSelecting) {
      const svg = (event.currentTarget as SVGSVGElement);
      const rect = svg.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - this.panX()) / this.scale();
      const mouseY = (event.clientY - rect.top - this.panY()) / this.scale();
      const mousePos: Position = { x: mouseX, y: mouseY };

      let bestEdgeId: string | null = null;
      let bestNearest: Position | null = null;
      let bestDist = Infinity;

      const pathType = this.activeEdgePathType;
      for (const edge of this.internalGraph().edges) {
        const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
        const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) continue;

        const sourcePort = edge.sourcePort || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
        const targetPort = edge.targetPort || this.findClosestPortForEdge(targetNode, sourceNode, 'target');
        const sourcePoint = this.getEdgeSourcePoint(edge);
        const targetPoint = this.getEdgeTargetPoint(edge);
        const polyline = getEdgeHitTestPolyline(sourcePoint, targetPoint, edge.waypoints, pathType, sourcePort, targetPort);

        for (let i = 0; i < polyline.length - 1; i++) {
          const a = polyline[i];
          const b = polyline[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((mousePos.x - a.x) * dx + (mousePos.y - a.y) * dy) / len2));
          const nearest = { x: a.x + t * dx, y: a.y + t * dy };
          const dist = Math.sqrt((mousePos.x - nearest.x) ** 2 + (mousePos.y - nearest.y) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestEdgeId = edge.id;
            bestNearest = nearest;
          }
        }
      }

      if (bestDist < WAYPOINT_HIT_DISTANCE && bestEdgeId && bestNearest) {
        this.waypointPreview.set({ edgeId: bestEdgeId, position: bestNearest });
      } else {
        this.waypointPreview.set(null);
      }
    } else if (!event.ctrlKey) {
      this.waypointPreview.set(null);
    }
  }

  onCanvasMouseUp(_event: MouseEvent): void {
    // Handle waypoint drag completion
    if (this.draggingWaypoint()) {
      this.historyService.push(this.internalGraph());
      this.draggingWaypoint.set(null);
      return;
    }

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

    // Save pending connection data before cleanup clears state
    let pendingConnection: { sourceNodeId: string; sourcePort: string; targetNodeId: string; targetPort: string } | null = null;
    if (this.connectingFrom && this.hoveredPort && this.hoveredPort.nodeId !== this.connectingFrom.nodeId) {
      const sourceNode = this.internalGraph().nodes.find(n => n.id === this.connectingFrom!.nodeId);
      const targetNode = this.internalGraph().nodes.find(n => n.id === this.hoveredPort!.nodeId);
      if (sourceNode && targetNode) {
        pendingConnection = {
          sourceNodeId: this.connectingFrom.nodeId,
          sourcePort: this.connectingFrom.port,
          targetNodeId: this.hoveredPort.nodeId,
          targetPort: this.hoveredPort.port
        };
      }
    }

    // Save pending reconnection data before cleanup clears state
    let pendingReconnection: { edgeId: string; endpoint: 'source' | 'target'; nodeId: string; port: string } | null = null;
    if (this.draggedEdge && this.hoveredNodeId && this.hoveredPort) {
      pendingReconnection = {
        edgeId: this.draggedEdge.edge.id,
        endpoint: this.draggedEdge.endpoint,
        nodeId: this.hoveredNodeId,
        port: this.hoveredPort.port
      };
    }

    // Clear preview line if edge reconnection or drag-to-connect was active
    if (this.draggedEdge || this.connectingFrom) {
      this.previewLine.set(null);
    }

    // Push a single history snapshot after drag/resize completes
    if ((this.draggedNode && this.didDrag) || this.resizingNode) {
      this.historyService.push(this.internalGraph());
    }

    this.isPanning = false;
    this.draggedNode = null;
    this.draggedNodeOffsets.clear();
    this.draggedEdge = null;
    this.connectingFrom = null;
    this.hoveredNodeId = null;
    this.hoveredPort = null;
    this.showAttachmentPoints.set(null);
    this.resizingNode = null;
    this.snapGuides.set([]);

    // Complete pending connection asynchronously (after cleanup, to allow beforeEdgeAdd hook)
    if (pendingConnection) {
      this.completeConnection(
        pendingConnection.sourceNodeId, pendingConnection.sourcePort,
        pendingConnection.targetNodeId, pendingConnection.targetPort
      );
    }

    // Complete pending reconnection asynchronously (after cleanup, to allow beforeEdgeAdd hook)
    if (pendingReconnection) {
      this.completeReconnection(
        pendingReconnection.edgeId, pendingReconnection.endpoint,
        pendingReconnection.nodeId, pendingReconnection.port
      );
    }
  }

  /**
   * Complete a drag-to-connect edge creation asynchronously.
   * Re-checks canConnect and invokes beforeEdgeAdd hook before creating the edge.
   */
  private async completeConnection(
    sourceNodeId: string, sourcePort: string,
    targetNodeId: string, targetPort: string
  ): Promise<void> {
    const graph = this.internalGraph();

    // Re-check canConnect at drop time
    if (!invokeSyncHook(
      this.config.hooks?.canConnect,
      { nodeId: sourceNodeId, port: sourcePort },
      { nodeId: targetNodeId, port: targetPort },
      graph
    )) return;

    // Check beforeEdgeAdd hook
    const edgeDescriptor = { source: sourceNodeId, target: targetNodeId, sourcePort, targetPort };
    const allowed = await invokeAsyncHook(this.config.hooks?.beforeEdgeAdd, edgeDescriptor, graph);
    if (!allowed) return;

    // Create the edge
    const newEdge: GraphEdge = {
      id: this.generateEdgeId(),
      source: sourceNodeId,
      target: targetNodeId,
      sourcePort,
      targetPort
    };

    const currentGraph = this.internalGraph();
    this.internalGraph.set({
      ...currentGraph,
      edges: [...currentGraph.edges, newEdge]
    });
    this.emitGraphChange();
    this.edgeAdded.emit(newEdge);
  }

  /**
   * Complete an edge reconnection asynchronously.
   * Re-checks canConnect and invokes beforeEdgeAdd hook before committing.
   */
  private async completeReconnection(
    edgeId: string, endpoint: 'source' | 'target',
    newNodeId: string, newPort: string
  ): Promise<void> {
    const graph = this.internalGraph();
    const edgeIndex = graph.edges.findIndex(e => e.id === edgeId);
    if (edgeIndex === -1) return;

    const edge = graph.edges[edgeIndex];
    const newSource = endpoint === 'source' ? newNodeId : edge.source;
    const newSourcePort = endpoint === 'source' ? newPort : (edge.sourcePort || '');
    const newTarget = endpoint === 'target' ? newNodeId : edge.target;
    const newTargetPort = endpoint === 'target' ? newPort : (edge.targetPort || '');

    // Re-check canConnect at drop time
    if (!invokeSyncHook(
      this.config.hooks?.canConnect,
      { nodeId: newSource, port: newSourcePort },
      { nodeId: newTarget, port: newTargetPort },
      graph
    )) return;

    // Check beforeEdgeAdd hook with the reconnected edge descriptor
    const edgeDescriptor = { source: newSource, target: newTarget, sourcePort: newSourcePort, targetPort: newTargetPort };
    const allowed = await invokeAsyncHook(this.config.hooks?.beforeEdgeAdd, edgeDescriptor, graph);
    if (!allowed) return;

    // Commit reconnection
    const currentGraph = this.internalGraph();
    const currentEdgeIndex = currentGraph.edges.findIndex(e => e.id === edgeId);
    if (currentEdgeIndex === -1) return;

    const updatedEdges = [...currentGraph.edges];
    updatedEdges[currentEdgeIndex] = {
      ...updatedEdges[currentEdgeIndex],
      source: newSource,
      target: newTarget,
      sourcePort: newSourcePort,
      targetPort: newTargetPort
    };

    this.internalGraph.set({ ...currentGraph, edges: updatedEdges });
    this.emitGraphChange();
    this.edgeUpdated.emit(updatedEdges[currentEdgeIndex]);
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

  onAttachmentPointMouseDown(event: MouseEvent, node: GraphNode, port: string): void {
    event.stopPropagation();
    if (this.readonly) return;

    // In hand tool mode, start drag-to-connect
    if (this.activeTool() === 'hand') {
      this.connectingFrom = { nodeId: node.id, port };

      // Set initial preview line from port position
      const sourcePoint = this.getPortWorldPosition(node, port);
      this.previewLine.set({ source: sourcePoint, target: sourcePoint });
    }
  }

  onAttachmentPointClick(event: MouseEvent, node: GraphNode, port: string): void {
    // No-op: connections are now created via drag-to-connect (onAttachmentPointMouseDown)
    event.stopPropagation();
  }

  onEdgeEndpointMouseDown(event: MouseEvent, edge: GraphEdge, endpoint: 'source' | 'target'): void {
    if (this.readonly) return;
    event.stopPropagation();
    this.draggedEdge = { edge, endpoint };
  }

  onWaypointMouseDown(event: MouseEvent, edge: GraphEdge, index: number): void {
    if (this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    this.draggingWaypoint.set({ edgeId: edge.id, index });
  }

  onWaypointDoubleClick(event: MouseEvent, edge: GraphEdge, index: number): void {
    if (this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    const graph = this.internalGraph();
    const edgeIndex = graph.edges.findIndex(e => e.id === edge.id);
    if (edgeIndex >= 0) {
      const existingWaypoints = [...(graph.edges[edgeIndex].waypoints || [])];
      existingWaypoints.splice(index, 1);
      const updatedEdges = [...graph.edges];
      updatedEdges[edgeIndex] = { ...updatedEdges[edgeIndex], waypoints: existingWaypoints.length > 0 ? existingWaypoints : undefined };
      this.internalGraph.set({ ...graph, edges: updatedEdges });
      this.emitGraphChange();
    }
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
  private emitGraphChange(skipHistory = false): void {
    // Push to history (unless this is an undo/redo operation or explicitly skipped during drag)
    if (!skipHistory && !this.historyService.isUndoRedo()) {
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
      if (this.destroyed) return;
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
    if (this.lastEdgeClickId === edge.id && now - this.lastEdgeClickTime < DOUBLE_CLICK_TIMEOUT_MS) {
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

  private generateEdgeId(): string {
    return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Compute snap guides and snapped position for a dragged node/selection bounding box.
   * Compares edges (left, right, top, bottom) and centers of the dragged rect
   * against all other (non-dragged) nodes.
   *
   * @param candidatePos  Top-left position of the dragged rect (before snapping)
   * @param dragSize      Size of the dragged rect (single node size or multi-select bounding box)
   * @param draggedIds    IDs of nodes currently being dragged (excluded from comparison)
   * @returns             Snapped position and guide lines to display
   */
  private computeSnapGuides(
    candidatePos: Position,
    dragSize: { width: number; height: number },
    draggedIds: Set<string>
  ): { snappedPos: Position; guides: GuideLine[] } {
    return computeSnapGuidesUtil(
      candidatePos, dragSize, draggedIds,
      this.internalGraph().nodes, n => this.getNodeSize(n), this.scale()
    );
  }

  private computeResizeSnapGuides(
    nodePos: Position,
    candidateSize: { width: number; height: number },
    draggedIds: Set<string>
  ): { snappedSize: { width: number; height: number }; guides: GuideLine[] } {
    return computeResizeSnapGuidesUtil(
      nodePos, candidateSize, draggedIds,
      this.internalGraph().nodes, n => this.getNodeSize(n), this.scale()
    );
  }

  /** Copy selected nodes and their internal edges to the internal clipboard. */
  private copySelection(): void {
    const sel = this.selection();
    if (sel.nodes.length === 0 && sel.edges.length === 0) return;

    const graph = this.internalGraph();
    const selectedNodeIds = new Set(sel.nodes);

    // Deep-clone selected nodes
    const copiedNodes = graph.nodes
      .filter(n => selectedNodeIds.has(n.id))
      .map(n => structuredClone(n));

    // Include edges that are either explicitly selected OR connect two selected nodes
    const copiedEdgeIds = new Set(sel.edges);
    const copiedEdges = graph.edges
      .filter(e =>
        copiedEdgeIds.has(e.id) ||
        (selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target))
      )
      .map(e => structuredClone(e));

    this.clipboard = { nodes: copiedNodes, edges: copiedEdges };
    this.pasteCount = 0;
  }

  /** Cut selected nodes/edges: copy then delete. */
  private async cutSelection(): Promise<void> {
    this.copySelection();
    if (!this.clipboard) return;
    await this.deleteSelection();
  }

  /** Delete all currently selected nodes and edges atomically. */
  private async deleteSelection(): Promise<void> {
    const sel = this.selection();
    if (sel.nodes.length === 0 && sel.edges.length === 0) return;

    const graph = this.internalGraph();
    const nodeIdsToRemove = new Set(sel.nodes);
    const edgeIdsToRemove = new Set(sel.edges);

    const removedNodes = graph.nodes.filter(n => nodeIdsToRemove.has(n.id));

    // Collect ALL edges being removed: explicitly selected + orphaned by node removal
    const removedEdges = graph.edges.filter(e => edgeIdsToRemove.has(e.id));
    const additionalRemovedEdges = graph.edges.filter(e =>
      !edgeIdsToRemove.has(e.id) &&
      (nodeIdsToRemove.has(e.source) || nodeIdsToRemove.has(e.target))
    );
    const allEdgesToRemove = [...removedEdges, ...additionalRemovedEdges];

    // Check beforeNodeRemove hook
    if (removedNodes.length > 0) {
      const nodeAllowed = await invokeAsyncHook(this.config.hooks?.beforeNodeRemove, removedNodes, graph);
      if (!nodeAllowed) return;
    }

    // Check beforeEdgeRemove hook
    if (allEdgesToRemove.length > 0) {
      const edgeAllowed = await invokeAsyncHook(this.config.hooks?.beforeEdgeRemove, allEdgesToRemove, graph);
      if (!edgeAllowed) return;
    }

    const remainingNodes = graph.nodes.filter(n => !nodeIdsToRemove.has(n.id));
    const remainingEdges = graph.edges.filter(e =>
      !edgeIdsToRemove.has(e.id) &&
      !nodeIdsToRemove.has(e.source) &&
      !nodeIdsToRemove.has(e.target)
    );

    this.internalGraph.set({ ...graph, nodes: remainingNodes, edges: remainingEdges });
    this.emitGraphChange();

    for (const edge of removedEdges) this.edgeRemoved.emit(edge);
    for (const edge of additionalRemovedEdges) this.edgeRemoved.emit(edge);
    for (const node of removedNodes) this.nodeRemoved.emit(node);

    this.selection.set({ nodes: [], edges: [] });
    this.selectionChange.emit(this.selection());
  }

  /** Paste clipboard contents with new IDs and offset positions. */
  private pasteClipboard(): void {
    if (!this.clipboard || (this.clipboard.nodes.length === 0 && this.clipboard.edges.length === 0)) return;

    this.pasteCount++;
    const offset = this.pasteCount * PASTE_OFFSET_PX;

    // Build old-ID → new-ID mapping for nodes
    const nodeIdMap = new Map<string, string>();
    const newNodes: GraphNode[] = this.clipboard.nodes.map(n => {
      const newId = this.generateId();
      nodeIdMap.set(n.id, newId);
      return {
        ...structuredClone(n),
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset }
      };
    });

    // Remap edge source/target to new node IDs; only include edges where both endpoints exist
    const newEdges: GraphEdge[] = this.clipboard.edges
      .filter(e => nodeIdMap.has(e.source) && nodeIdMap.has(e.target))
      .map(e => ({
        ...structuredClone(e),
        id: this.generateEdgeId(),
        source: nodeIdMap.get(e.source)!,
        target: nodeIdMap.get(e.target)!
      }));

    // Add to graph atomically
    const graph = this.internalGraph();
    this.internalGraph.set({
      ...graph,
      nodes: [...graph.nodes, ...newNodes],
      edges: [...graph.edges, ...newEdges]
    });
    this.emitGraphChange();

    // Emit events for each pasted item
    for (const node of newNodes) this.nodeAdded.emit(node);
    for (const edge of newEdges) this.edgeAdded.emit(edge);

    // Select pasted items
    this.selection.set({
      nodes: newNodes.map(n => n.id),
      edges: newEdges.map(e => e.id)
    });
    this.selectionChange.emit(this.selection());
  }

  private recalculateEdgePorts(nodeId: string): void {
    const graph = this.internalGraph();
    const updatedEdges = this.recalculateEdgePortsWithConflictAvoidance(
      graph.edges, graph.nodes,
      edge => edge.source === nodeId || edge.target === nodeId
    );

    if (updatedEdges !== graph.edges && updatedEdges.some((e, i) => e !== graph.edges[i])) {
      this.internalGraph.set({ ...graph, edges: updatedEdges });
    }
  }

  getNodeSize(node: GraphNode): { width: number; height: number } {
    // Check instance-level size override first (from resize)
    if (node.size) return node.size;
    const nodeConfig = this.config.nodes.types.find(t => t.type === node.type);
    return nodeConfig?.size || this.config.nodes.defaultSize || DEFAULT_NODE_SIZE;
  }

  getEdgePath(edge: GraphEdge): string {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) return '';

    const sourcePort = edge.sourcePort || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = edge.targetPort || this.findClosestPortForEdge(targetNode, sourceNode, 'target');

    const s = this.getPortWorldPosition(sourceNode, sourcePort);
    const t = this.getPortWorldPosition(targetNode, targetPort);

    // If edge has manual waypoints, build path through them based on active path type
    if (edge.waypoints && edge.waypoints.length > 0) {
      const points = [s, ...edge.waypoints, t];
      const pathType = this.activeEdgePathType;
      if (pathType === 'bezier') return buildSmoothBezierThroughPoints(points);
      if (pathType === 'step') return buildStepThroughPoints(points, sourcePort, targetPort);
      return buildRoundedPolyline(points);
    }

    const pathType = this.activeEdgePathType;
    if (pathType === 'bezier') return buildBezierPath(s, t, sourcePort, targetPort);
    if (pathType === 'step') return buildStepPath(s, t, sourcePort, targetPort);
    return buildStraightPath(s, t);
  }

  /** Active edge path type — runtime override takes precedence over theme. */
  get activeEdgePathType(): 'straight' | 'bezier' | 'step' {
    return this.edgePathTypeOverride() ?? this.resolvedTheme.edge.pathType;
  }

  /** Change the edge path type at runtime. */
  setEdgePathType(type: 'straight' | 'bezier' | 'step'): void {
    this.edgePathTypeOverride.set(type);
    this.edgeTypeDropdownOpen.set(false);
  }

  // Port spacing/margin — resolved from theme config
  private get portSpacing(): number { return this.resolvedTheme?.port.spacing ?? 75; }
  private get portMargin(): number { return this.resolvedTheme?.port.margin ?? 15; }

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

    const sourcePort = edge.sourcePort || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    return this.getPortWorldPosition(sourceNode, sourcePort);
  }

  getEdgeTargetPoint(edge: GraphEdge): Position {
    const sourceNode = this.internalGraph().nodes.find(n => n.id === edge.source);
    const targetNode = this.internalGraph().nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };

    const targetPort = edge.targetPort || this.findClosestPortForEdge(targetNode, sourceNode, 'target');
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

  /** Resolved icon position from config (avoids repeated cast). */
  private get iconPosition(): IconPosition {
    return this.config.nodes.iconPosition || 'top-left';
  }

  /**
   * Get the position for the node image (top-left corner of image).
   * Uses same positioning logic as icon but accounts for image dimensions.
   */
  getImagePosition(node: GraphNode): Position {
    return getNodeImagePosition(this.getNodeSize(node), this.iconPosition);
  }

  /**
   * Get the size (width/height) for node images.
   * Images are rendered as squares, sized proportionally to node height.
   */
  getImageSize(node: GraphNode): number {
    return getNodeImageSize(this.getNodeSize(node));
  }

  getIconPosition(node: GraphNode): Position {
    return getNodeIconPosition(this.getNodeSize(node), this.iconPosition);
  }

  getLabelPosition(node: GraphNode): Position {
    return getNodeLabelPosition(this.getNodeSize(node), this.iconPosition);
  }

  /**
   * Get the bounding box for label text within a node.
   * This box avoids the icon area and has proper padding.
   */
  getLabelBounds(node: GraphNode): { x: number; y: number; width: number; height: number } {
    const size = this.getNodeSize(node);
    return getNodeLabelBounds(size, this.getImageSize(node), this.iconPosition);
  }

  /**
   * Get wrapped text lines and font size for a node label.
   * Uses text wrapping first, then font downsizing if needed.
   */
  getWrappedLabel(node: GraphNode): { lines: string[]; fontSize: number; lineHeight: number } {
    const text = (node.data['name'] || node.type) as string;
    const bounds = this.getLabelBounds(node);
    return getWrappedNodeLabel(text, bounds);
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
    const hitDistance = EDGE_HIT_DISTANCE;
    for (const edge of this.internalGraph().edges) {
      const sourcePoint = this.getEdgeSourcePoint(edge);
      const targetPoint = this.getEdgeTargetPoint(edge);

      // Calculate distance from point to line segment
      const dist = pointToSegmentDistance(pos, sourcePoint, targetPoint);
      if (dist < hitDistance) {
        return edge.id;
      }
    }
    return null;
  }

  getNodePorts(node: GraphNode): Array<{ position: string; x: number; y: number }> {
    return getNodePortsUtil(this.getNodeSize(node), this.portSpacing, this.portMargin);
  }

  private findClosestPort(nodeId: string, worldPos: Position): { port: string; distance: number } | null {
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

  private getPortWorldPosition(node: GraphNode, port: string): Position {
    return getPortWorldPositionUtil(node, port, this.getNodeSize(node), this.portSpacing, this.portMargin);
  }

  /**
   * Recalculate edge ports for edges matching a predicate, avoiding conflicts
   * where multiple edges between the same node pair would get identical ports.
   *
   * When `config.edges.preservePorts` is true, edges that already carry both
   * `sourcePort` and `targetPort` are never overwritten — only edges missing
   * ports get them assigned (still with conflict avoidance).
   */
  private recalculateEdgePortsWithConflictAvoidance(
    edges: GraphEdge[],
    nodes: GraphNode[],
    affectsEdge: (edge: GraphEdge) => boolean
  ): GraphEdge[] {
    const preserve = this.config.edges?.preservePorts !== false;
    const sizeFn = (n: GraphNode) => this.getNodeSize(n);
    const sp = this.portSpacing;
    const mg = this.portMargin;

    return edges.reduce<GraphEdge[]>((acc, edge) => {
      if (!affectsEdge(edge)) { acc.push(edge); return acc; }

      // When preservePorts is on, keep edges that already have both ports
      if (preserve && edge.sourcePort && edge.targetPort) {
        acc.push(edge);
        return acc;
      }

      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) { acc.push(edge); return acc; }

      const usedPortPairs = new Set<string>();
      for (const other of acc) {
        if ((other.source === edge.source && other.target === edge.target) ||
            (other.source === edge.target && other.target === edge.source)) {
          const sPort = other.sourcePort ?? '';
          const tPort = other.targetPort ?? '';
          usedPortPairs.add(`${sPort}|${tPort}`);
          usedPortPairs.add(`${tPort}|${sPort}`);
        }
      }

      const rankedSourcePorts = rankPortsForEdge(sourceNode, targetNode, sizeFn, sp, mg);
      const rankedTargetPorts = rankPortsForEdge(targetNode, sourceNode, sizeFn, sp, mg);

      let bestSourcePort = rankedSourcePorts[0];
      let bestTargetPort = rankedTargetPorts[0];
      let found = false;

      for (const sPort of rankedSourcePorts) {
        for (const tPort of rankedTargetPorts) {
          const key = `${sPort}|${tPort}`;
          if (!usedPortPairs.has(key)) {
            bestSourcePort = sPort;
            bestTargetPort = tPort;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      acc.push({ ...edge, sourcePort: bestSourcePort, targetPort: bestTargetPort });
      return acc;
    }, []);
  }

  private findClosestPortForEdge(
    node: GraphNode,
    otherNode: GraphNode,
    _endpoint: 'source' | 'target'
  ): string {
    return findClosestPortForEdgeUtil(node, otherNode, n => this.getNodeSize(n), this.portSpacing, this.portMargin);
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

    const sourcePort = edge.sourcePort || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = edge.targetPort || this.findClosestPortForEdge(targetNode, sourceNode, 'target');

    const s = this.getPortWorldPosition(sourceNode, sourcePort);
    const t = this.getPortWorldPosition(targetNode, targetPort);
    const pathT = this.resolvedTheme.edge.label.position;
    const offsetY = this.resolvedTheme.edge.label.offsetY;
    const pathType = this.activeEdgePathType;

    let pos: Position;

    if (pathType === 'bezier') {
      // Evaluate cubic bezier at t
      const offset = Math.max(40, Math.abs(t.x - s.x) * 0.3, Math.abs(t.y - s.y) * 0.3);
      const sc = getPortControlOffset(sourcePort, offset);
      const tc = getPortControlOffset(targetPort, offset);
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
      const sourceSide = getPortSide(sourcePort);
      const targetSide = getPortSide(targetPort);
      const isSourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
      const isTargetVertical = targetSide === 'top' || targetSide === 'bottom';

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

      pos = evaluatePolylineAt(segments, pathT);
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
   * Get the background rect dimensions for an edge label.
   * Returns x, y, width, height centered around the label position.
   */
  getEdgeLabelRect(edge: GraphEdge): { x: number; y: number; width: number; height: number } | null {
    const label = this.getEdgeLabel(edge);
    const pos = this.getEdgeLabelPosition(edge);
    if (!label || !pos) return null;

    const theme = this.resolvedTheme.edge.label;
    const charWidth = theme.fontSize * EDGE_LABEL_CHAR_WIDTH_RATIO;
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
