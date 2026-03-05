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
  GraphMetadata,
  GuideLine
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
  ToolbarConfig,
  ToolbarItem,
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
  ContextMenuEvent,
  CanvasTheme,
  NodeTheme,
  NodeTypeStyle,
  EdgeTheme,
  EdgeLabelTheme,
  PortTheme,
  SelectionTheme,
  FontTheme,
  ToolbarTheme
} from './lib/graph-editor.config';

// SVG icon utilities
export type { SvgIconDefinition } from './lib/icons/workflow-icons';
export { renderIconSvg, iconToDataUrl } from './lib/icons/workflow-icons';

// Template directives & context types
export { NodeHtmlTemplateDirective, NodeSvgTemplateDirective, EdgeTemplateDirective } from './lib/template.directives';
export type { NodeTemplateContext, EdgeTemplateContext } from './lib/template.directives';

// Lifecycle hooks
export type { LifecycleHooks, ConnectionEndpoint } from './lib/lifecycle-hooks';

// Theme resolver
export type { ResolvedTheme } from './lib/theme.resolver';