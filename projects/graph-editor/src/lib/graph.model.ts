/**
 * Generic graph node.
 * Domain-specific data goes in the `data` payload.
 */
export interface GraphNode {
  id: string;                          // Unique identifier (UUID recommended)
  type: string;                        // User-defined type (e.g., 'process', 'decision')
  data: Record<string, any>;           // Arbitrary user data
  position: Position;                  // Canvas coordinates
  metadata?: NodeMetadata;             // Optional metadata
}

/**
 * 2D position on canvas.
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Optional node metadata (fully extensible).
 */
export interface NodeMetadata {
  label?: string;                      // Display label (if different from data)
  locked?: boolean;                    // Prevent dragging
  hidden?: boolean;                    // Hide from canvas
  [key: string]: any;                  // Custom metadata
}

/**
 * Generic graph edge (connection between nodes).
 */
export interface GraphEdge {
  id: string;                          // Unique identifier
  source: string;                      // Source node ID
  target: string;                      // Target node ID
  sourcePort?: string;                 // Optional source port identifier
  targetPort?: string;                 // Optional target port identifier
  direction?: 'forward' | 'backward' | 'bidirectional'; // Edge direction (default: forward)
  data?: Record<string, any>;          // Arbitrary user data
  metadata?: EdgeMetadata;             // Optional metadata
}

/**
 * Optional edge metadata.
 */
export interface EdgeMetadata {
  label?: string;                      // Display label
  style?: EdgeStyle;                   // Visual style overrides
  hidden?: boolean;                    // Hide from canvas
  [key: string]: any;                  // Custom metadata
}

/**
 * Edge visual style.
 */
export interface EdgeStyle {
  stroke?: string;                     // Line color (CSS color)
  strokeWidth?: number;                // Line width (px)
  strokeDasharray?: string;            // Dash pattern (e.g., '5,5')
  animated?: boolean;                  // Animated dashes
  markerEnd?: 'arrow' | 'circle' | 'none';
}

/**
 * Complete graph structure.
 */
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: GraphMetadata;
}

/**
 * Optional graph-level metadata.
 */
export interface GraphMetadata {
  name?: string;                       // Graph name
  description?: string;                // Graph description
  version?: number;                    // Version number
  [key: string]: any;                  // Custom metadata
}
