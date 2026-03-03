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
import {Graph, GraphEdge, GraphNode, GuideLine, Position} from './graph.model';
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
  selectedLayoutAlgorithm = signal<'dagre-tb' | 'dagre-lr' | 'force' | 'tree'>('dagre-tb');

  // Snap guides (alignment lines shown during node drag)
  snapGuides = signal<GuideLine[]>([]);

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

    // Escape: close layout dropdown, cancel edge label editing, cancel line drawing, clear selection
    if (event.key === 'Escape') {
      if (this.layoutDropdownOpen()) {
        this.layoutDropdownOpen.set(false);
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
      case 'force':    updatedNodes = this.layoutForce(graph); break;
      case 'tree':     updatedNodes = this.layoutTree(graph); break;
      default: return;
    }

    if (algorithmOverride) {
      this.selectedLayoutAlgorithm.set(algo as 'dagre-tb' | 'dagre-lr' | 'force' | 'tree');
    }

    this.applyLayoutPositions(graph, updatedNodes);
  }

  /** Dagre hierarchical layout */
  private async layoutDagre(graph: Graph, direction: 'TB' | 'LR'): Promise<GraphNode[]> {
    const dagreModule = await import('dagre');
    const dagre = dagreModule.default ?? dagreModule;
    const opts = this.config.layout?.options;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: opts?.nodesep ?? 60,
      ranksep: opts?.ranksep ?? 80,
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

    return graph.nodes.map(node => {
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
  }

  /** Force-directed layout (pure JS, no external deps) */
  private layoutForce(graph: Graph): GraphNode[] {
    const opts = this.config.layout?.options;
    const totalIterations = opts?.iterations ?? 300;
    const repulsion = opts?.repulsionStrength ?? 500;
    const attraction = opts?.attractionStrength ?? 0.01;

    // Initialize positions and sizes
    const positions = new Map<string, { x: number; y: number }>();
    const sizes = new Map<string, { width: number; height: number }>();
    for (const node of graph.nodes) {
      positions.set(node.id, { x: node.position.x, y: node.position.y });
      sizes.set(node.id, this.getNodeSize(node));
    }

    const nodeIds = graph.nodes.map(n => n.id);

    for (let iter = 0; iter < totalIterations; iter++) {
      const forces = new Map<string, { fx: number; fy: number }>();
      for (const id of nodeIds) forces.set(id, { fx: 0, fy: 0 });

      // Repulsive forces between all node pairs
      for (let a = 0; a < nodeIds.length; a++) {
        for (let b = a + 1; b < nodeIds.length; b++) {
          const idA = nodeIds[a], idB = nodeIds[b];
          const posA = positions.get(idA)!;
          const posB = positions.get(idB)!;
          const sA = sizes.get(idA)!;
          const sB = sizes.get(idB)!;
          const dx = posA.x - posB.x;
          const dy = posA.y - posB.y;
          const minDist = (sA.width + sB.width) / 2 + 20;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), minDist * 0.1);
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          forces.get(idA)!.fx += fx;
          forces.get(idA)!.fy += fy;
          forces.get(idB)!.fx -= fx;
          forces.get(idB)!.fy -= fy;
        }
      }

      // Attractive forces along edges
      for (const edge of graph.edges) {
        const posS = positions.get(edge.source);
        const posT = positions.get(edge.target);
        if (!posS || !posT) continue;
        const dx = posS.x - posT.x;
        const dy = posS.y - posT.y;
        const fx = dx * attraction;
        const fy = dy * attraction;
        const fS = forces.get(edge.source);
        const fT = forces.get(edge.target);
        if (fS) { fS.fx -= fx; fS.fy -= fy; }
        if (fT) { fT.fx += fx; fT.fy += fy; }
      }

      // Apply forces with cooling
      const cooling = 1 - iter / totalIterations;
      for (const id of nodeIds) {
        const pos = positions.get(id)!;
        const f = forces.get(id)!;
        pos.x += f.fx * cooling;
        pos.y += f.fy * cooling;
      }
    }

    return graph.nodes.map(node => ({
      ...node,
      position: { ...positions.get(node.id)! },
    }));
  }

  /** Tree layout (BFS-based, handles forests and cycles) */
  private layoutTree(graph: Graph): GraphNode[] {
    const opts = this.config.layout?.options;
    const levelSep = opts?.levelSeparation ?? 120;
    const siblingSp = opts?.siblingSpacing ?? 80;

    // Build adjacency: parent → children
    const incomingCount = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const node of graph.nodes) {
      incomingCount.set(node.id, 0);
      children.set(node.id, []);
    }
    for (const edge of graph.edges) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
      const ch = children.get(edge.source);
      if (ch) ch.push(edge.target);
    }

    // Find roots (no incoming edges)
    let roots = graph.nodes.filter(n => (incomingCount.get(n.id) ?? 0) === 0).map(n => n.id);
    if (roots.length === 0 && graph.nodes.length > 0) {
      roots = [graph.nodes[0].id]; // Cyclic: pick first node
    }

    // BFS to assign levels, handling multiple trees (forest)
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const levelNodes = new Map<number, string[]>(); // level → node ids

    let forestOffset = 0; // horizontal offset for each tree in a forest
    const treeXOffset = new Map<string, number>(); // nodeId → x offset from tree base
    const nodeTreeBase = new Map<string, number>(); // nodeId → forest offset

    for (const root of roots) {
      if (visited.has(root)) continue;

      // BFS for this tree
      const queue: string[] = [root];
      visited.add(root);
      levels.set(root, 0);
      const treeNodes: string[] = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        treeNodes.push(current);
        const level = levels.get(current)!;
        if (!levelNodes.has(level)) levelNodes.set(level, []);
        levelNodes.get(level)!.push(current);

        for (const child of children.get(current) ?? []) {
          if (!visited.has(child)) {
            visited.add(child);
            levels.set(child, level + 1);
            queue.push(child);
          }
        }
      }

      // Position nodes in this tree: center children under parent
      // First pass: assign x positions per level within this tree
      const treeLevelNodes = new Map<number, string[]>();
      for (const id of treeNodes) {
        const lvl = levels.get(id)!;
        if (!treeLevelNodes.has(lvl)) treeLevelNodes.set(lvl, []);
        treeLevelNodes.get(lvl)!.push(id);
      }

      // Simple positioning: nodes at each level get evenly spaced
      let maxWidth = 0;
      for (const [, ids] of treeLevelNodes) {
        let totalWidth = 0;
        for (const id of ids) {
          const size = this.getNodeSize(graph.nodes.find(n => n.id === id)!);
          totalWidth += size.width + siblingSp;
        }
        totalWidth -= siblingSp; // remove trailing spacing
        maxWidth = Math.max(maxWidth, totalWidth);
      }

      for (const [, ids] of treeLevelNodes) {
        let totalWidth = 0;
        for (const id of ids) {
          const size = this.getNodeSize(graph.nodes.find(n => n.id === id)!);
          totalWidth += size.width + siblingSp;
        }
        totalWidth -= siblingSp;

        let x = (maxWidth - totalWidth) / 2; // center this level
        for (const id of ids) {
          const size = this.getNodeSize(graph.nodes.find(n => n.id === id)!);
          treeXOffset.set(id, x);
          nodeTreeBase.set(id, forestOffset);
          x += size.width + siblingSp;
        }
      }

      forestOffset += maxWidth + siblingSp * 2;
    }

    // Handle disconnected nodes (not reached by any root)
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        levels.set(node.id, 0);
        treeXOffset.set(node.id, 0);
        nodeTreeBase.set(node.id, forestOffset);
        const size = this.getNodeSize(node);
        forestOffset += size.width + siblingSp;
      }
    }

    return graph.nodes.map(node => ({
      ...node,
      position: {
        x: (nodeTreeBase.get(node.id) ?? 0) + (treeXOffset.get(node.id) ?? 0),
        y: (levels.get(node.id) ?? 0) * levelSep,
      },
    }));
  }

  /** Shared post-layout: recalculate edge ports, update graph, emit change, fit to screen */
  private applyLayoutPositions(graph: Graph, updatedNodes: GraphNode[]): void {
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
    // Close layout dropdown on any canvas interaction
    this.layoutDropdownOpen.set(false);

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
        if (closestPort && closestPort.distance < 40) {
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

    // Handle drag-to-connect completion (hand tool: mousedown on port → drag → mouseup)
    if (this.connectingFrom && this.hoveredPort && this.hoveredPort.nodeId !== this.connectingFrom.nodeId) {
      const sourceNode = this.internalGraph().nodes.find(n => n.id === this.connectingFrom!.nodeId);
      const targetNode = this.internalGraph().nodes.find(n => n.id === this.hoveredPort!.nodeId);
      if (sourceNode && targetNode) {
        const sourcePort = this.connectingFrom.port;
        const targetPort = this.hoveredPort.port;

        const newEdge: GraphEdge = {
          id: this.generateEdgeId(),
          source: this.connectingFrom.nodeId,
          target: this.hoveredPort.nodeId,
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

    // Clear preview line if edge reconnection or drag-to-connect was active
    if (this.draggedEdge || this.connectingFrom) {
      this.previewLine.set(null);
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
    const SNAP_THRESHOLD = 5 / this.scale(); // 5px in screen space, adjusted for zoom
    const DISTANCE_LIMIT = 500; // Skip nodes too far away (canvas px)

    const graph = this.internalGraph();
    const otherNodes = graph.nodes.filter(n => !draggedIds.has(n.id));

    // Dragged rect reference lines
    const dragLeft = candidatePos.x;
    const dragRight = candidatePos.x + dragSize.width;
    const dragCx = candidatePos.x + dragSize.width / 2;
    const dragTop = candidatePos.y;
    const dragBottom = candidatePos.y + dragSize.height;
    const dragCy = candidatePos.y + dragSize.height / 2;

    // Collect best snaps per axis
    let bestSnapX: { delta: number; guides: GuideLine[] } | null = null;
    let bestSnapY: { delta: number; guides: GuideLine[] } | null = null;

    for (const other of otherNodes) {
      const otherSize = this.getNodeSize(other);
      const ox = other.position.x;
      const oy = other.position.y;

      // Early distance cull
      if (Math.abs(dragCx - (ox + otherSize.width / 2)) > DISTANCE_LIMIT &&
          Math.abs(dragCy - (oy + otherSize.height / 2)) > DISTANCE_LIMIT) {
        continue;
      }

      const otherLeft = ox;
      const otherRight = ox + otherSize.width;
      const otherCx = ox + otherSize.width / 2;
      const otherTop = oy;
      const otherBottom = oy + otherSize.height;
      const otherCy = oy + otherSize.height / 2;

      // Vertical alignment candidates (snap X axis)
      const vCandidates: { delta: number; dragRef: number; otherRef: number }[] = [
        { delta: otherLeft - dragLeft, dragRef: dragLeft, otherRef: otherLeft },         // left-left
        { delta: otherRight - dragRight, dragRef: dragRight, otherRef: otherRight },     // right-right
        { delta: otherLeft - dragRight, dragRef: dragRight, otherRef: otherLeft },       // right-left
        { delta: otherRight - dragLeft, dragRef: dragLeft, otherRef: otherRight },       // left-right
        { delta: otherCx - dragCx, dragRef: dragCx, otherRef: otherCx },                // center-center
      ];

      for (const vc of vCandidates) {
        const absDelta = Math.abs(vc.delta);
        if (absDelta > SNAP_THRESHOLD) continue;
        if (!bestSnapX || absDelta < Math.abs(bestSnapX.delta)) {
          // Vertical guide line at the snap X position
          const guideX = vc.otherRef;
          const minY = Math.min(dragTop + vc.delta, otherTop) - 20;
          const maxY = Math.max(dragBottom + vc.delta, otherBottom) + 20;
          bestSnapX = {
            delta: vc.delta,
            guides: [{ x1: guideX, y1: minY, x2: guideX, y2: maxY, orientation: 'vertical' }]
          };
        }
      }

      // Horizontal alignment candidates (snap Y axis)
      const hCandidates: { delta: number; dragRef: number; otherRef: number }[] = [
        { delta: otherTop - dragTop, dragRef: dragTop, otherRef: otherTop },             // top-top
        { delta: otherBottom - dragBottom, dragRef: dragBottom, otherRef: otherBottom },  // bottom-bottom
        { delta: otherTop - dragBottom, dragRef: dragBottom, otherRef: otherTop },        // bottom-top
        { delta: otherBottom - dragTop, dragRef: dragTop, otherRef: otherBottom },        // top-bottom
        { delta: otherCy - dragCy, dragRef: dragCy, otherRef: otherCy },                 // center-center
      ];

      for (const hc of hCandidates) {
        const absDelta = Math.abs(hc.delta);
        if (absDelta > SNAP_THRESHOLD) continue;
        if (!bestSnapY || absDelta < Math.abs(bestSnapY.delta)) {
          const guideY = hc.otherRef;
          const minX = Math.min(dragLeft + (bestSnapX?.delta ?? 0), otherLeft) - 20;
          const maxX = Math.max(dragRight + (bestSnapX?.delta ?? 0), otherRight) + 20;
          bestSnapY = {
            delta: hc.delta,
            guides: [{ x1: minX, y1: guideY, x2: maxX, y2: guideY, orientation: 'horizontal' }]
          };
        }
      }
    }

    const snappedPos: Position = {
      x: candidatePos.x + (bestSnapX?.delta ?? 0),
      y: candidatePos.y + (bestSnapY?.delta ?? 0)
    };

    const guides: GuideLine[] = [
      ...(bestSnapX?.guides ?? []),
      ...(bestSnapY?.guides ?? [])
    ];

    return { snappedPos, guides };
  }

  /**
   * Compute snap guides during node resize.
   * Position (top-left) is fixed; only width/height change.
   * Snaps the right edge, bottom edge, and center of the resizing node
   * to edges/centers of other nodes.
   */
  private computeResizeSnapGuides(
    nodePos: Position,
    candidateSize: { width: number; height: number },
    draggedIds: Set<string>
  ): { snappedSize: { width: number; height: number }; guides: GuideLine[] } {
    const SNAP_THRESHOLD = 5 / this.scale();
    const DISTANCE_LIMIT = 500;

    const graph = this.internalGraph();
    const otherNodes = graph.nodes.filter(n => !draggedIds.has(n.id));

    // Resizing node reference lines
    const left = nodePos.x;
    const top = nodePos.y;
    const right = left + candidateSize.width;
    const bottom = top + candidateSize.height;
    const cx = left + candidateSize.width / 2;
    const cy = top + candidateSize.height / 2;

    let bestSnapW: { delta: number; guides: GuideLine[] } | null = null;
    let bestSnapH: { delta: number; guides: GuideLine[] } | null = null;

    for (const other of otherNodes) {
      const otherSize = this.getNodeSize(other);
      const ox = other.position.x;
      const oy = other.position.y;

      if (Math.abs(cx - (ox + otherSize.width / 2)) > DISTANCE_LIMIT &&
          Math.abs(cy - (oy + otherSize.height / 2)) > DISTANCE_LIMIT) {
        continue;
      }

      const otherLeft = ox;
      const otherRight = ox + otherSize.width;
      const otherCx = ox + otherSize.width / 2;
      const otherTop = oy;
      const otherBottom = oy + otherSize.height;
      const otherCy = oy + otherSize.height / 2;

      // Width snap candidates: snap right edge or center-x to other nodes
      const wCandidates = [
        { delta: otherLeft - right, ref: otherLeft },     // right → other left
        { delta: otherRight - right, ref: otherRight },   // right → other right
        { delta: otherCx - right, ref: otherCx },         // right → other center
        { delta: otherCx - cx, ref: otherCx },            // center → other center (adjusts width by 2×delta)
      ];

      for (let i = 0; i < wCandidates.length; i++) {
        const wc = wCandidates[i];
        const absDelta = Math.abs(wc.delta);
        if (absDelta > SNAP_THRESHOLD) continue;
        // For center-center alignment, the width change is 2× the delta
        const isCenter = i === 3;
        const widthDelta = isCenter ? wc.delta * 2 : wc.delta;
        if (!bestSnapW || absDelta < Math.abs(bestSnapW.delta)) {
          const guideX = wc.ref;
          const minY = Math.min(top, otherTop) - 20;
          const maxY = Math.max(bottom + widthDelta, otherBottom) + 20;
          bestSnapW = {
            delta: widthDelta,
            guides: [{ x1: guideX, y1: minY, x2: guideX, y2: maxY, orientation: 'vertical' }]
          };
        }
      }

      // Height snap candidates: snap bottom edge or center-y to other nodes
      const hCandidates = [
        { delta: otherTop - bottom, ref: otherTop },       // bottom → other top
        { delta: otherBottom - bottom, ref: otherBottom },  // bottom → other bottom
        { delta: otherCy - bottom, ref: otherCy },          // bottom → other center
        { delta: otherCy - cy, ref: otherCy },              // center → other center (adjusts height by 2×delta)
      ];

      for (let i = 0; i < hCandidates.length; i++) {
        const hc = hCandidates[i];
        const absDelta = Math.abs(hc.delta);
        if (absDelta > SNAP_THRESHOLD) continue;
        const isCenter = i === 3;
        const heightDelta = isCenter ? hc.delta * 2 : hc.delta;
        if (!bestSnapH || absDelta < Math.abs(bestSnapH.delta)) {
          const guideY = hc.ref;
          const minX = Math.min(left, otherLeft) - 20;
          const maxX = Math.max(right + (bestSnapW?.delta ?? 0), otherRight) + 20;
          bestSnapH = {
            delta: heightDelta,
            guides: [{ x1: minX, y1: guideY, x2: maxX, y2: guideY, orientation: 'horizontal' }]
          };
        }
      }
    }

    const snappedSize = {
      width: candidateSize.width + (bestSnapW?.delta ?? 0),
      height: candidateSize.height + (bestSnapH?.delta ?? 0)
    };

    const guides: GuideLine[] = [
      ...(bestSnapW?.guides ?? []),
      ...(bestSnapH?.guides ?? [])
    ];

    return { snappedSize, guides };
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
  private cutSelection(): void {
    this.copySelection();
    if (!this.clipboard) return;

    // Reuse delete logic from the Delete key handler
    const sel = this.selection();
    const graph = this.internalGraph();
    const nodeIdsToRemove = new Set(sel.nodes);
    const edgeIdsToRemove = new Set(sel.edges);

    const removedNodes = graph.nodes.filter(n => nodeIdsToRemove.has(n.id));
    const removedEdges = graph.edges.filter(e => edgeIdsToRemove.has(e.id));

    const remainingNodes = graph.nodes.filter(n => !nodeIdsToRemove.has(n.id));
    const remainingEdges = graph.edges.filter(e =>
      !edgeIdsToRemove.has(e.id) &&
      !nodeIdsToRemove.has(e.source) &&
      !nodeIdsToRemove.has(e.target)
    );

    const additionalRemovedEdges = graph.edges.filter(e =>
      !edgeIdsToRemove.has(e.id) &&
      (nodeIdsToRemove.has(e.source) || nodeIdsToRemove.has(e.target))
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
    const offset = this.pasteCount * 30;

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

    const sourcePort = edge.sourcePort || this.findClosestPortForEdge(sourceNode, targetNode, 'source');
    const targetPort = edge.targetPort || this.findClosestPortForEdge(targetNode, sourceNode, 'target');

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

  // Port spacing/margin — resolved from theme config
  private get portSpacing(): number { return this.resolvedTheme?.port.spacing ?? 75; }
  private get portMargin(): number { return this.resolvedTheme?.port.margin ?? 15; }

  /** Extract the side name from a port ID (e.g. 'top-1' → 'top', 'left' → 'left'). */
  private getPortSide(port: string): 'top' | 'bottom' | 'left' | 'right' {
    const side = port.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
    return side;
  }

  /** Get the control point offset direction for a port (used by bezier path). */
  private getPortControlOffset(port: string, offset: number): { dx: number; dy: number } {
    const side = this.getPortSide(port);
    switch (side) {
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

  /** Compute evenly-spaced port positions along a side, always including the center. */
  private computePortPositions(sideLength: number): number[] {
    const center = sideLength / 2;
    const positions: number[] = [center];
    // Add symmetric pairs outward from center until hitting margin boundary
    let offset = this.portSpacing;
    while (center - offset >= this.portMargin && center + offset <= sideLength - this.portMargin) {
      positions.unshift(center - offset);
      positions.push(center + offset);
      offset += this.portSpacing;
    }
    return positions;
  }

  getNodePorts(node: GraphNode): Array<{ position: string; x: number; y: number }> {
    const size = this.getNodeSize(node);
    const ports: Array<{ position: string; x: number; y: number }> = [];

    const hPositions = this.computePortPositions(size.width);
    const vPositions = this.computePortPositions(size.height);

    // Top side: ports along x at y=0
    hPositions.forEach((x: number, i: number) => ports.push({ position: `top-${i}`, x, y: 0 }));
    // Bottom side: ports along x at y=height
    hPositions.forEach((x: number, i: number) => ports.push({ position: `bottom-${i}`, x, y: size.height }));
    // Left side: ports along y at x=0
    vPositions.forEach((y: number, i: number) => ports.push({ position: `left-${i}`, x: 0, y }));
    // Right side: ports along y at x=width
    vPositions.forEach((y: number, i: number) => ports.push({ position: `right-${i}`, x: size.width, y }));

    return ports;
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
    const size = this.getNodeSize(node);
    const side = this.getPortSide(port);
    const parts = port.split('-');
    const index = parts.length > 1 ? parseInt(parts[1], 10) : -1;

    // Legacy port IDs ('top', 'bottom', 'left', 'right') resolve to center of side
    if (index < 0 || isNaN(index)) {
      const legacyOffsets: Record<string, { x: number; y: number }> = {
        top: { x: size.width / 2, y: 0 },
        bottom: { x: size.width / 2, y: size.height },
        left: { x: 0, y: size.height / 2 },
        right: { x: size.width, y: size.height / 2 }
      };
      const offset = legacyOffsets[side] || { x: size.width / 2, y: 0 };
      return { x: node.position.x + offset.x, y: node.position.y + offset.y };
    }

    // New-style port IDs: compute position using shared algorithm
    let offsetX = 0;
    let offsetY = 0;
    if (side === 'top' || side === 'bottom') {
      const hPositions = this.computePortPositions(size.width);
      offsetX = hPositions[Math.min(index, hPositions.length - 1)];
      offsetY = side === 'top' ? 0 : size.height;
    } else {
      const vPositions = this.computePortPositions(size.height);
      offsetX = side === 'left' ? 0 : size.width;
      offsetY = vPositions[Math.min(index, vPositions.length - 1)];
    }

    return { x: node.position.x + offsetX, y: node.position.y + offsetY };
  }

  private findClosestPortForEdge(
    node: GraphNode,
    otherNode: GraphNode,
    endpoint: 'source' | 'target'
  ): string {
    const otherSize = this.getNodeSize(otherNode);
    const otherCenter: Position = {
      x: otherNode.position.x + otherSize.width / 2,
      y: otherNode.position.y + otherSize.height / 2
    };

    // Find the port closest to the other node's center
    const ports = this.getNodePorts(node);
    let bestPort = ports[0];
    let bestDist = Infinity;
    for (const p of ports) {
      const wx = node.position.x + p.x;
      const wy = node.position.y + p.y;
      const dx = otherCenter.x - wx;
      const dy = otherCenter.y - wy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestPort = p;
      }
    }
    return bestPort.position;
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
      const sourceSide = this.getPortSide(sourcePort);
      const targetSide = this.getPortSide(targetPort);
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
