import {ThemeConfig, ToolbarTheme, EdgeLabelTheme} from './graph-editor.config';

/**
 * Fully-resolved theme with no optional fields.
 * Every value has a sensible default so templates can reference without null-checking.
 */
export interface ResolvedTheme {
  shadows: boolean;
  canvas: {
    background: string;
    gridType: 'line' | 'dot';
    gridColor: string;
  };
  node: {
    background: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    selectedBorderColor: string;
    selectedBorderWidth: number;
    shadowColor: string;
    labelColor: string;
    labelFont: string;
    typeStyles: Record<string, {
      background?: string;
      borderColor?: string;
      accentColor?: string;
      accentTextColor?: string;
    }>;
  };
  edge: {
    stroke: string;
    strokeWidth: number;
    selectedStroke: string;
    selectedStrokeWidth: number;
    markerColor: string;
    selectedMarkerColor: string;
    pathType: 'straight' | 'bezier' | 'step';
    label: {
      fontSize: number;
      fontFamily: string;
      fontWeight: number | string;
      color: string;
      background: string;
      borderRadius: number;
      borderColor: string;
      borderWidth: number;
      paddingX: number;
      paddingY: number;
      selectedColor: string;
      selectedBackground: string;
      position: number;
      offsetY: number;
    };
  };
  port: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    radius: number;
    hoverFill: string;
    hoverRadius: number;
  };
  selection: {
    color: string;
    boxFill: string;
    boxStroke: string;
  };
  font: {
    family: string;
    monoFamily: string;
  };
  toolbar: {
    background: string;
    borderRadius: number;
    shadow: string;
    buttonBackground: string;
    buttonBorderColor: string;
    buttonTextColor: string;
    buttonHoverBackground: string;
    buttonHoverAccent: string;
    buttonActiveBackground: string;
    buttonActiveTextColor: string;
    dividerColor: string;
  };
}

/**
 * Resolves a partial ThemeConfig into a complete ResolvedTheme with all defaults filled.
 */
export function resolveTheme(theme?: ThemeConfig): ResolvedTheme {
  const selectionColor = theme?.selection?.color ?? '#3b82f6';

  return {
    shadows: theme?.shadows !== false,
    canvas: {
      background: theme?.canvas?.background ?? '#f8f9fa',
      gridType: theme?.canvas?.gridType ?? 'line',
      gridColor: theme?.canvas?.gridColor ?? '#e0e0e0',
    },
    node: {
      background: theme?.node?.background ?? 'white',
      borderColor: theme?.node?.borderColor ?? '#e2e8f0',
      borderWidth: theme?.node?.borderWidth ?? 1.5,
      borderRadius: theme?.node?.borderRadius ?? 12,
      selectedBorderColor: theme?.node?.selectedBorderColor ?? selectionColor,
      selectedBorderWidth: theme?.node?.selectedBorderWidth ?? 2.5,
      shadowColor: theme?.node?.shadowColor ?? 'rgba(0,0,0,0.08)',
      labelColor: theme?.node?.labelColor ?? '#1e293b',
      labelFont: theme?.node?.labelFont ?? 'system-ui, -apple-system, sans-serif',
      typeStyles: theme?.node?.typeStyles ?? {},
    },
    edge: {
      stroke: theme?.edge?.stroke ?? '#94a3b8',
      strokeWidth: theme?.edge?.strokeWidth ?? 2,
      selectedStroke: theme?.edge?.selectedStroke ?? selectionColor,
      selectedStrokeWidth: theme?.edge?.selectedStrokeWidth ?? 2.5,
      markerColor: theme?.edge?.markerColor ?? '#94a3b8',
      selectedMarkerColor: theme?.edge?.selectedMarkerColor ?? selectionColor,
      pathType: theme?.edge?.pathType ?? 'straight',
      label: resolveEdgeLabel(theme?.edge?.label, selectionColor, theme?.font?.family),
    },
    port: {
      fill: theme?.port?.fill ?? '#94a3b8',
      stroke: theme?.port?.stroke ?? 'white',
      strokeWidth: theme?.port?.strokeWidth ?? 2,
      radius: theme?.port?.radius ?? 6,
      hoverFill: theme?.port?.hoverFill ?? '#2563eb',
      hoverRadius: theme?.port?.hoverRadius ?? 8,
    },
    selection: {
      color: selectionColor,
      boxFill: theme?.selection?.boxFill ?? `rgba(59, 130, 246, 0.1)`,
      boxStroke: theme?.selection?.boxStroke ?? selectionColor,
    },
    font: {
      family: theme?.font?.family ?? 'system-ui, -apple-system, sans-serif',
      monoFamily: theme?.font?.monoFamily ?? 'monospace',
    },
    toolbar: resolveToolbar(theme?.toolbar, selectionColor),
  };
}

function resolveEdgeLabel(label: EdgeLabelTheme | undefined, selectionColor: string, fontFamily?: string) {
  return {
    fontSize: label?.fontSize ?? 12,
    fontFamily: label?.fontFamily ?? fontFamily ?? 'system-ui, -apple-system, sans-serif',
    fontWeight: label?.fontWeight ?? 500,
    color: label?.color ?? '#475569',
    background: label?.background ?? 'rgba(255, 255, 255, 0.9)',
    borderRadius: label?.borderRadius ?? 4,
    borderColor: label?.borderColor ?? 'transparent',
    borderWidth: label?.borderWidth ?? 0,
    paddingX: label?.paddingX ?? 6,
    paddingY: label?.paddingY ?? 2,
    selectedColor: label?.selectedColor ?? selectionColor,
    selectedBackground: label?.selectedBackground ?? 'rgba(255, 255, 255, 0.95)',
    position: label?.position ?? 0.5,
    offsetY: label?.offsetY ?? 0,
  };
}

function resolveToolbar(toolbar: ToolbarTheme | undefined, selectionColor: string) {
  return {
    background: toolbar?.background ?? 'rgba(255, 255, 255, 0.95)',
    borderRadius: toolbar?.borderRadius ?? 8,
    shadow: toolbar?.shadow ?? '0 2px 8px rgba(0, 0, 0, 0.1)',
    buttonBackground: toolbar?.buttonBackground ?? '#ffffff',
    buttonBorderColor: toolbar?.buttonBorderColor ?? '#e5e7eb',
    buttonTextColor: toolbar?.buttonTextColor ?? '#4b5563',
    buttonHoverBackground: toolbar?.buttonHoverBackground ?? '#f9fafb',
    buttonHoverAccent: toolbar?.buttonHoverAccent ?? selectionColor,
    buttonActiveBackground: toolbar?.buttonActiveBackground ?? selectionColor,
    buttonActiveTextColor: toolbar?.buttonActiveTextColor ?? '#ffffff',
    dividerColor: toolbar?.dividerColor ?? '#e5e7eb',
  };
}

/**
 * Applies resolved theme values as CSS custom properties on a host element.
 * This enables consumer templates to use `var(--ge-*)` in their CSS.
 */
export function applyThemeCssProperties(host: HTMLElement, t: ResolvedTheme, userVars?: Record<string, string>): void {
  const style = host.style;

  // Canvas
  style.setProperty('--ge-canvas-bg', t.canvas.background);
  style.setProperty('--ge-grid-color', t.canvas.gridColor);

  // Node
  style.setProperty('--ge-node-bg', t.node.background);
  style.setProperty('--ge-node-border', t.node.borderColor);
  style.setProperty('--ge-node-border-width', `${t.node.borderWidth}px`);
  style.setProperty('--ge-node-border-radius', `${t.node.borderRadius}px`);
  style.setProperty('--ge-node-selected-border', t.node.selectedBorderColor);
  style.setProperty('--ge-node-selected-border-width', `${t.node.selectedBorderWidth}px`);
  style.setProperty('--ge-node-shadow', t.node.shadowColor);
  style.setProperty('--ge-node-label-color', t.node.labelColor);
  style.setProperty('--ge-node-label-font', t.node.labelFont);

  // Edge
  style.setProperty('--ge-edge-stroke', t.edge.stroke);
  style.setProperty('--ge-edge-stroke-width', `${t.edge.strokeWidth}px`);
  style.setProperty('--ge-edge-selected-stroke', t.edge.selectedStroke);

  // Edge label
  style.setProperty('--ge-edge-label-font-size', `${t.edge.label.fontSize}px`);
  style.setProperty('--ge-edge-label-font-family', t.edge.label.fontFamily);
  style.setProperty('--ge-edge-label-font-weight', `${t.edge.label.fontWeight}`);
  style.setProperty('--ge-edge-label-color', t.edge.label.color);
  style.setProperty('--ge-edge-label-bg', t.edge.label.background);
  style.setProperty('--ge-edge-label-border-radius', `${t.edge.label.borderRadius}px`);
  style.setProperty('--ge-edge-label-selected-color', t.edge.label.selectedColor);

  // Port
  style.setProperty('--ge-port-fill', t.port.fill);
  style.setProperty('--ge-port-hover-fill', t.port.hoverFill);

  // Selection
  style.setProperty('--ge-selection-color', t.selection.color);

  // Font
  style.setProperty('--ge-font-family', t.font.family);
  style.setProperty('--ge-font-mono', t.font.monoFamily);

  // Toolbar
  style.setProperty('--ge-toolbar-bg', t.toolbar.background);
  style.setProperty('--ge-toolbar-radius', `${t.toolbar.borderRadius}px`);
  style.setProperty('--ge-toolbar-shadow', t.toolbar.shadow);
  style.setProperty('--ge-toolbar-btn-bg', t.toolbar.buttonBackground);
  style.setProperty('--ge-toolbar-btn-border', t.toolbar.buttonBorderColor);
  style.setProperty('--ge-toolbar-btn-color', t.toolbar.buttonTextColor);
  style.setProperty('--ge-toolbar-btn-hover-bg', t.toolbar.buttonHoverBackground);
  style.setProperty('--ge-toolbar-btn-hover-accent', t.toolbar.buttonHoverAccent);
  style.setProperty('--ge-toolbar-btn-active-bg', t.toolbar.buttonActiveBackground);
  style.setProperty('--ge-toolbar-btn-active-color', t.toolbar.buttonActiveTextColor);
  style.setProperty('--ge-toolbar-divider', t.toolbar.dividerColor);

  // Backward compat: --graph-editor-canvas-bg
  style.setProperty('--graph-editor-canvas-bg', t.canvas.background);

  // User-provided custom variables
  if (userVars) {
    for (const [key, value] of Object.entries(userVars)) {
      style.setProperty(key.startsWith('--') ? key : `--${key}`, value);
    }
  }
}
