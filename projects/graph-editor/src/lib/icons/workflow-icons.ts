/**
 * Professional SVG icons for workflow node types.
 * Designed to match utisha design spec: institutional calm, deep indigo palette.
 *
 * Colors from utisha design spec:
 * - Primary: #1D6A96 (indigo-600)
 * - Accent: #2178A8 (indigo-500)
 * - Dark: #0B2240 (indigo-900)
 *
 * Icon design guidelines:
 * - Stroke-based, 24x24 viewBox
 * - 1.5-2px stroke width for clarity at small sizes
 * - Rounded line caps for approachability
 * - Minimal, clear shapes
 */

export interface SvgIconDefinition {
  /** SVG path data (d attribute) or full SVG markup */
  path: string;
  /** ViewBox dimensions (default: '0 0 24 24') */
  viewBox?: string;
  /** Fill color (default: 'none' for stroke-based icons) */
  fill?: string;
  /** Stroke color (default: '#1D6A96') */
  stroke?: string;
  /** Stroke width (default: 2) */
  strokeWidth?: number;
}

/**
 * Built-in workflow node icons.
 * Use these as `iconSvg` values in NodeTypeDefinition.
 */
export const WORKFLOW_ICONS = {
  /**
   * Process node - gear/cog icon
   * Represents a processing step, action, or task
   */
  process: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z
           M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z`
  },

  /**
   * Decision node - diamond/branch icon
   * Represents a conditional branch or decision point
   */
  decision: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M12 3L21 12L12 21L3 12L12 3Z
           M12 8v4
           M12 16h.01`
  },

  /**
   * Start node - play/begin icon
   * Represents the entry point of a workflow
   */
  start: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#198754', // success green
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M10 8l6 4-6 4V8Z`
  },

  /**
   * End node - stop/finish icon
   * Represents the exit point of a workflow
   */
  end: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#DC3545', // error red
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M8 8h8v8H8V8Z`
  },

  /**
   * Database node - cylinder icon
   * Represents data storage or retrieval
   */
  database: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M12 5c4.418 0 8 1.12 8 2.5v9c0 1.38-3.582 2.5-8 2.5s-8-1.12-8-2.5v-9C4 6.12 7.582 5 12 5Z
           M4 7.5c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5
           M4 12c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5`
  },

  /**
   * API node - connection/integration icon
   * Represents an API call or external integration
   */
  api: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M4 12h4l2-6 4 12 2-6h4
           M2 12h2
           M20 12h2`
  },

  /**
   * Transform node - filter/convert icon
   * Represents data transformation
   */
  transform: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M22 3H2l8 9.46V19l4 2v-8.54L22 3Z`
  },

  /**
   * Notification node - bell icon
   * Represents alerts or notifications
   */
  notification: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9
           M13.73 21a2 2 0 0 1-3.46 0`
  },

  /**
   * Wait/delay node - clock icon
   * Represents a pause or scheduled delay
   */
  wait: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M12 6v6l4 2`
  },

  /**
   * Human/approval node - user check icon
   * Represents human review or approval step
   */
  approval: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2
           M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z
           M16 11l2 2 4-4`
  },

  /**
   * Loop/repeat node - refresh icon
   * Represents iteration or retry logic
   */
  loop: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M1 4v6h6
           M23 20v-6h-6
           M20.49 9A9 9 0 0 0 5.64 5.64L1 10
           M23 14l-4.64 4.36A9 9 0 0 1 3.51 15`
  },

  /**
   * Parallel/fork node - split icon
   * Represents parallel execution branches
   */
  parallel: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M16 3h5v5
           M8 3H3v5
           M12 22V12
           M12 12L21 3
           M12 12L3 3`
  },

  /**
   * Merge/join node - converge icon
   * Represents joining parallel branches
   */
  merge: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M8 21h5v-5
           M16 21h5v-5
           M12 2v10
           M12 12l5 9
           M12 12l-5 9`
  },

  /**
   * Error/exception node - alert triangle
   * Represents error handling
   */
  error: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#DC3545',
    strokeWidth: 1.75,
    path: `M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z
           M12 9v4
           M12 17h.01`
  },

  /**
   * Email node - mail icon
   * Represents email sending
   */
  email: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Z
           M22 6l-10 7L2 6`
  },

  /**
   * Code/script node - code brackets
   * Represents custom code execution
   */
  code: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M16 18l6-6-6-6
           M8 6l-6 6 6 6`
  },

  /**
   * Document node - file text
   * Represents document processing
   */
  document: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#1D6A96',
    strokeWidth: 1.75,
    path: `M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z
           M14 2v6h6
           M16 13H8
           M16 17H8
           M10 9H8`
  },

  /**
   * AI/Agent node - sparkles/brain icon
   * Represents AI agent or LLM processing
   */
  agent: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#2178A8',
    strokeWidth: 1.75,
    path: `M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z
           M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z
           M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17Z`
  }
} as const;

/**
 * Type for built-in icon names
 */
export type WorkflowIconName = keyof typeof WORKFLOW_ICONS;

/**
 * Get SVG icon definition by name
 */
export function getWorkflowIcon(name: WorkflowIconName): SvgIconDefinition {
  return WORKFLOW_ICONS[name];
}

/**
 * Generate inline SVG markup for an icon (for use in palette/toolbar)
 */
export function renderIconSvg(icon: SvgIconDefinition, size: number = 24): string {
  const viewBox = icon.viewBox || '0 0 24 24';
  const fill = icon.fill || 'none';
  const stroke = icon.stroke || '#1D6A96';
  const strokeWidth = icon.strokeWidth || 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${icon.path.split('\n').map(p => `<path d="${p.trim()}"/>`).join('')}</svg>`;
}

/**
 * Generate data URL for an icon (for use as image source)
 */
export function iconToDataUrl(icon: SvgIconDefinition, size: number = 48): string {
  const svg = renderIconSvg(icon, size);
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
