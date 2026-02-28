import {Type} from '@angular/core';
import {EdgeStyle, Graph, Position} from './graph.model';

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
}

/**
 * Node type configuration.
 */
export interface NodesConfig {
  types: NodeTypeDefinition[];
  defaultSize?: { width: number; height: number };  // Default: 220x100
  constrainToBounds?: boolean;                      // Prevent drag off-canvas
}

/**
 * Node type definition.
 */
export interface NodeTypeDefinition {
  /** Unique type identifier */
  type: string;

  /** Display name in palette */
  label?: string;

  /** Icon identifier (Material Icons, custom, etc.) */
  icon?: string;

  /** Palette category/group */
  category?: string;

  /** Angular component to render this node type */
  component: Type<any>;

  /** Optional configuration form component */
  configComponent?: Type<any>;

  /** Default data when node is created */
  defaultData: Record<string, any>;

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
  algorithm: 'dagre' | 'manual';       // Layout algorithm
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
  /** CSS custom property values */
  variables?: Record<string, string>;
  /** Enable drop shadows on nodes and edges (default: true) */
  shadows?: boolean;
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
