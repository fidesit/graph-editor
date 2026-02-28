// Main component
export { GraphEditorComponent } from './lib/graph-editor.component';

// Data model - use 'export type' for re-exports when isolatedModules is enabled
export type {
  Graph,
  GraphNode,
  GraphEdge,
  Position,
  NodeMetadata,
  EdgeMetadata,
  EdgeStyle,
  GraphMetadata
} from './lib/graph.model';

// Configuration - use 'export type' for re-exports
export type {
  GraphEditorConfig,
  NodesConfig,
  EdgesConfig,
  CanvasConfig,
  ValidationConfig,
  LayoutConfig,
  InteractionConfig,
  ThemeConfig,
  PaletteConfig,
  NodeTypeDefinition,
  PortConfig,
  PortDefinition,
  NodeConstraints,
  GridConfig,
  ZoomConfig,
  PanConfig,
  ValidationRule,
  ValidationError,
  LayoutOptions,
  ContextMenuConfig,
  ContextMenuItem,
  ContextMenuContext,
  SelectionState,
  ValidationResult,
  ContextMenuEvent
} from './lib/graph-editor.config';