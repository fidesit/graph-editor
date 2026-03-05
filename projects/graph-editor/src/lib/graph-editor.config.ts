import {Type} from '@angular/core';
import {EdgeStyle, Graph, Position} from './graph.model';
import {SvgIconDefinition} from './icons/workflow-icons';

export interface GraphEditorConfig {
  /** Node type definitions */
  nodes: NodesConfig;

  /** Edge configuration */
  edges: EdgesConfig;

  /** Canvas behavior */
  canvas?: CanvasConfig;

  /** Validation rules */
  validation?: ValidationConfig;

  /** Layout algorithm */
  layout?: LayoutConfig;

  /** Interaction behavior */
  interaction?: InteractionConfig;

  /** Visual theme */
  theme?: ThemeConfig;

  /** Palette configuration */
  palette?: PaletteConfig;

  /** Top toolbar configuration */
  toolbar?: ToolbarConfig;
}

/**
 * Node type configuration.
 */
export interface NodesConfig {
  types: NodeTypeDefinition[];
  defaultSize?: { width: number; height: number };  // Default: 220x100
  constrainToBounds?: boolean;                      // Prevent drag off-canvas
  /** Icon position within the node (default: 'top-left') */
  iconPosition?: 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';
}

/**
 * Node type definition.
 */
export interface NodeTypeDefinition {
  /** Unique type identifier */
  type: string;

  /** Display name in palette */
  label?: string;

  /** Icon identifier (emoji, text, or symbol for fallback display) */
  icon?: string;

  /**
   * SVG icon definition for professional node icons.
   * When set, renders an SVG icon in the node and palette instead of text/emoji.
   * Use WORKFLOW_ICONS from '@utisha/graph-editor' or provide custom SvgIconDefinition.
   * @example iconSvg: WORKFLOW_ICONS.process
   */
  iconSvg?: SvgIconDefinition;

  /** Palette category/group */
  category?: string;

  /** Angular component to render this node type */
  component: Type<any>;

  /** Optional configuration form component */
  configComponent?: Type<any>;

  /** Default data when node is created */
  defaultData: Record<string, any>;

  /**
   * Optional image URL for node icon. When set, renders an <image> element instead of text icon.
   * Can be overridden per-instance via node.data['imageUrl'].
   * Supports: SVG, PNG, JPG, data URLs, or any valid image URL.
   * @example '/assets/icons/agent.svg'
   * @example 'data:image/svg+xml;base64,...'
   */
  // imageUrl?: string;  // Set in defaultData['imageUrl']

  /** Port definitions */
  ports?: PortConfig;

  /** Connection constraints */
  constraints?: NodeConstraints;

  /** Custom size override */
  size?: { width: number; height: number };
}

/**
 * Port configuration for a node type.
 */
export interface PortConfig {
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
}

/**
 * Individual port definition.
 */
export interface PortDefinition {
  id: string;                          // Unique within node
  position: 'top' | 'bottom' | 'left' | 'right' | 'dynamic';
  offset?: { x: number; y: number };   // Offset from position anchor
  accepts?: string[];                  // Port type compatibility (for validation)
  label?: string;                      // Display label near port
}

/**
 * Node behavior constraints.
 */
export interface NodeConstraints {
  maxIncoming?: number;                // null = unlimited
  maxOutgoing?: number;                // null = unlimited
  canBeSource?: boolean;               // Default: true
  canBeTarget?: boolean;               // Default: true
  allowSelfLoop?: boolean;             // Default: false
}

/**
 * Edge configuration.
 */
export interface EdgesConfig {
  component: Type<any>;                // Edge rendering component
  allowMultiple?: boolean;             // Allow multiple edges between same nodes (default: false)
  style?: EdgeStyle;                   // Default edge style
}

/**
 * Canvas behavior configuration.
 */
export interface CanvasConfig {
  grid?: GridConfig;
  zoom?: ZoomConfig;
  pan?: PanConfig;
  minimap?: boolean;                   // Show minimap (default: false)
  background?: string;                 // Background color (default: transparent)
}

export interface GridConfig {
  enabled: boolean;                    // Show grid
  size: number;                        // Grid cell size (px)
  snap: boolean;                       // Snap nodes to grid
  color?: string;                      // Grid line color
}

export interface ZoomConfig {
  enabled: boolean;                    // Enable zoom (default: true)
  min: number;                         // Min zoom level (default: 0.25)
  max: number;                         // Max zoom level (default: 2.0)
  step: number;                        // Zoom step (default: 0.1)
  wheelEnabled: boolean;               // Mouse wheel zoom (default: true)
}

export interface PanConfig {
  enabled: boolean;                    // Enable pan (default: true)
  mouseButton?: 'left' | 'middle' | 'right';  // Drag button (default: left on empty canvas)
}

/**
 * Validation configuration.
 */
export interface ValidationConfig {
  validators: ValidationRule[];
  validateOnChange?: boolean;          // Validate on every graph change (default: false)
  mode?: 'strict' | 'warn';            // 'strict' = block invalid, 'warn' = allow with warnings
}

export interface ValidationRule {
  id: string;                          // Unique rule identifier
  message: string;                     // Error message template
  validator: (graph: Graph, config: GraphEditorConfig) => ValidationError[];
}

export interface ValidationError {
  rule: string;                        // Rule ID that failed
  message: string;                     // User-facing error message
  nodeId?: string;                     // Node involved (if applicable)
  edgeId?: string;                     // Edge involved (if applicable)
  severity?: 'error' | 'warning';      // Default: 'error'
}

/**
 * Layout configuration.
 */
export interface LayoutConfig {
  algorithm: 'dagre' | 'compact' | 'manual'; // Layout algorithm
  options?: LayoutOptions;
}

export interface LayoutOptions {
  // Dagre-specific options
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'; // Direction (default: 'TB')
  ranksep?: number;                    // Separation between ranks (default: 80)
  nodesep?: number;                    // Separation between nodes (default: 40)
  edgesep?: number;                    // Separation between edges (default: 10)
}

/**
 * Interaction configuration.
 */
export interface InteractionConfig {
  readonly?: boolean;                  // Disable all editing (default: false)
  dragNodes?: boolean;                 // Enable node dragging (default: true)
  drawEdges?: boolean;                 // Enable edge drawing (default: true)
  deleteNodes?: boolean;               // Enable node deletion (default: true)
  deleteEdges?: boolean;               // Enable edge deletion (default: true)
  multiSelect?: boolean;               // Enable multi-select (default: true)
  contextMenu?: ContextMenuConfig;
}

export interface ContextMenuConfig {
  enabled: boolean;                    // Show context menus (default: true)
  canvas?: ContextMenuItem[];          // Canvas right-click menu
  node?: ContextMenuItem[];            // Node right-click menu
  edge?: ContextMenuItem[];            // Edge right-click menu
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: (context: ContextMenuContext) => void;
  disabled?: (context: ContextMenuContext) => boolean;
}

export interface ContextMenuContext {
  graph: Graph;
  nodeId?: string;
  edgeId?: string;
  position?: Position;
}

/**
 * Theme configuration.
 */
export interface ThemeConfig {
  /** CSS custom property values (applied to host element) */
  variables?: Record<string, string>;
  /** Enable drop shadows on nodes and edges (default: true) */
  shadows?: boolean;
  /** Canvas theming */
  canvas?: CanvasTheme;
  /** Node theming */
  node?: NodeTheme;
  /** Edge theming */
  edge?: EdgeTheme;
  /** Port/attachment point theming */
  port?: PortTheme;
  /** Selection theming */
  selection?: SelectionTheme;
  /** Font configuration */
  font?: FontTheme;
  /** Toolbar & palette chrome theming */
  toolbar?: ToolbarTheme;
}

/**
 * Canvas visual theme.
 */
export interface CanvasTheme {
  /** Canvas background color (default: '#f8f9fa') */
  background?: string;
  /** Grid pattern type (default: 'line') */
  gridType?: 'line' | 'dot';
  /** Grid line/dot color (default: '#e0e0e0') */
  gridColor?: string;
}

/**
 * Node visual theme.
 */
export interface NodeTheme {
  /** Node background fill (default: 'white') */
  background?: string;
  /** Node border color (default: '#e2e8f0') */
  borderColor?: string;
  /** Node border width in px (default: 1.5) */
  borderWidth?: number;
  /** Node corner radius in px (default: 12) */
  borderRadius?: number;
  /** Border color when selected (default: selection.color) */
  selectedBorderColor?: string;
  /** Border width when selected in px (default: 2.5) */
  selectedBorderWidth?: number;
  /** Shadow color (default: 'rgba(0,0,0,0.08)') */
  shadowColor?: string;
  /** Label text color (default: '#1e293b') */
  labelColor?: string;
  /** Label font family (default: 'system-ui, -apple-system, sans-serif') */
  labelFont?: string;
  /**
   * Per-type visual overrides. Keys are node type identifiers.
   * @example { 'llm-call': { accentColor: '#1D6A96' } }
   */
  typeStyles?: Record<string, NodeTypeStyle>;
}

/**
 * Per-node-type visual overrides.
 */
export interface NodeTypeStyle {
  /** Node background for this type */
  background?: string;
  /** Node border color for this type */
  borderColor?: string;
  /** Accent/header background color */
  accentColor?: string;
  /** Accent/header text color */
  accentTextColor?: string;
}

/**
 * Edge visual theme.
 */
export interface EdgeTheme {
  /** Edge stroke color (default: '#94a3b8') */
  stroke?: string;
  /** Edge stroke width in px (default: 2) */
  strokeWidth?: number;
  /** Edge stroke color when selected (default: selection.color) */
  selectedStroke?: string;
  /** Edge stroke width when selected in px (default: 2.5) */
  selectedStrokeWidth?: number;
  /** Arrow marker fill color (default: '#94a3b8') */
  markerColor?: string;
  /** Arrow marker fill color when selected (default: selection.color) */
  selectedMarkerColor?: string;
  /** Edge path routing algorithm (default: 'straight') */
  pathType?: 'straight' | 'bezier' | 'step';
  /** Edge label styling */
  label?: EdgeLabelTheme;
}

/**
 * Edge label visual theme.
 * Controls the appearance of text labels displayed on edges.
 */
export interface EdgeLabelTheme {
  /** Label font size in px (default: 12) */
  fontSize?: number;
  /** Label font family (default: inherits from font.family) */
  fontFamily?: string;
  /** Label font weight (default: 500) */
  fontWeight?: number | string;
  /** Label text color (default: '#475569') */
  color?: string;
  /** Label background color (default: 'rgba(255, 255, 255, 0.9)') */
  background?: string;
  /** Label background corner radius in px (default: 4) */
  borderRadius?: number;
  /** Label background border color (default: 'transparent') */
  borderColor?: string;
  /** Label background border width in px (default: 0) */
  borderWidth?: number;
  /** Horizontal padding inside label background in px (default: 6) */
  paddingX?: number;
  /** Vertical padding inside label background in px (default: 2) */
  paddingY?: number;
  /** Label text color when edge is selected (default: selection.color) */
  selectedColor?: string;
  /** Label background when edge is selected (default: 'rgba(255, 255, 255, 0.95)') */
  selectedBackground?: string;
  /** Position along the edge path, 0 = source, 1 = target (default: 0.5) */
  position?: number;
  /** Vertical offset from the edge path in px (default: 0, negative = above) */
  offsetY?: number;
}

/**
 * Port/attachment point visual theme.
 */
export interface PortTheme {
  /** Port fill color (default: '#94a3b8') */
  fill?: string;
  /** Port border color (default: 'white') */
  stroke?: string;
  /** Port border width in px (default: 2) */
  strokeWidth?: number;
  /** Port radius in px (default: 6) */
  radius?: number;
  /** Port fill color on hover (default: '#2563eb') */
  hoverFill?: string;
  /** Port radius on hover in px (default: 8) */
  hoverRadius?: number;
  /** Minimum pixels between adjacent ports on a node side (default: 75). Lower = more ports. */
  spacing?: number;
  /** Minimum pixels from corner to nearest port (default: 15). Ports never sit on corners. */
  margin?: number;
}

/**
 * Selection visual theme.
 */
export interface SelectionTheme {
  /** Primary selection color — also used as default for node/edge selected states (default: '#3b82f6') */
  color?: string;
  /** Box selection fill (default: 'rgba(59, 130, 246, 0.1)') */
  boxFill?: string;
  /** Box selection stroke (default: selection.color) */
  boxStroke?: string;
}

/**
 * Font theme.
 */
export interface FontTheme {
  /** Primary font family (default: 'system-ui, -apple-system, sans-serif') */
  family?: string;
  /** Monospace font family (default: 'monospace') */
  monoFamily?: string;
}

/**
 * Toolbar & palette chrome theme.
 * Controls the top toolbar, left palette, and edge direction selector.
 */
export interface ToolbarTheme {
  /** Panel background (default: 'rgba(255, 255, 255, 0.95)') */
  background?: string;
  /** Panel border radius in px (default: 8) */
  borderRadius?: number;
  /** Panel box shadow (default: '0 2px 8px rgba(0, 0, 0, 0.1)') */
  shadow?: string;
  /** Button background (default: '#ffffff') */
  buttonBackground?: string;
  /** Button border color (default: '#e5e7eb') */
  buttonBorderColor?: string;
  /** Button text/icon color (default: '#4b5563') */
  buttonTextColor?: string;
  /** Button hover background (default: '#f9fafb') */
  buttonHoverBackground?: string;
  /** Button hover border & text color — matches selection.color by default */
  buttonHoverAccent?: string;
  /** Active (pressed) tool button background (default: selection.color) */
  buttonActiveBackground?: string;
  /** Active tool button text color (default: '#ffffff') */
  buttonActiveTextColor?: string;
  /** Divider line color between button groups (default: '#e5e7eb') */
  dividerColor?: string;
  /** Dropdown panel background (default: toolbar background) */
  dropdownBackground?: string;
  /** Dropdown panel border color (default: button border color) */
  dropdownBorderColor?: string;
  /** Dropdown panel border radius in px (default: toolbar border radius) */
  dropdownBorderRadius?: number;
  /** Dropdown panel shadow (default: toolbar shadow) */
  dropdownShadow?: string;
  /** Dropdown item text color (default: button text color) */
  dropdownItemColor?: string;
  /** Dropdown item hover background (default: button hover background) */
  dropdownItemHoverBackground?: string;
  /** Dropdown active/selected item color (default: button hover accent) */
  dropdownItemActiveColor?: string;
}

/**
 * Palette configuration.
 */
export interface PaletteConfig {
  enabled: boolean;                    // Show palette (default: true)
  position?: 'left' | 'right';         // Palette position (default: 'left')
  collapsible?: boolean;               // Allow collapse (default: true)
  groupByCategory?: boolean;           // Group node types by category (default: false)
}

/**
 * Toolbar item identifiers for the top toolbar.
 * - `'zoom-in'` — Zoom in
 * - `'zoom-out'` — Zoom out
 * - `'layout'` — Auto layout
 * - `'fit'` — Fit to screen
 * - `'undo'` — Undo last action
 * - `'redo'` — Redo last undone action
 * - `'edge-type'` — Edge path type switcher (straight / bezier / step)
 */
export type ToolbarItem = 'zoom-in' | 'zoom-out' | 'layout' | 'fit' | 'undo' | 'redo' | 'edge-type';

/**
 * Top toolbar configuration.
 * Controls visibility of the top toolbar and which buttons are shown.
 */
export interface ToolbarConfig {
  /** Show the top toolbar (default: true) */
  enabled?: boolean;
  /** Which toolbar buttons to show. If omitted, all buttons are shown. */
  items?: ToolbarItem[];
}

/**
 * Selection state.
 */
export interface SelectionState {
  nodes: string[];         // Selected node IDs
  edges: string[];         // Selected edge IDs
}

/**
 * Validation result.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Context menu event.
 */
export interface ContextMenuEvent {
  type: 'canvas' | 'node' | 'edge';
  position: Position;
  nodeId?: string;
  edgeId?: string;
}
