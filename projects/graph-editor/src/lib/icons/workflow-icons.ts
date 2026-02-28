/**
 * SVG icon definition interface for custom node icons.
 * Use this to define your own icons that match your design system.
 *
 * Example usage:
 *   const myIcons = {
 *     process: {
 *       viewBox: '0 0 24 24',
 *       fill: 'none',
 *       stroke: '#1D6A96',
 *       strokeWidth: 1.75,
 *       path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z...'
 *     }
 *   };
 */
export interface SvgIconDefinition {
  /** SVG path data (d attribute) or full SVG markup */
  path: string;
  /** ViewBox dimensions (default: '0 0 24 24') */
  viewBox?: string;
  /** Fill color (default: 'none' for stroke-based icons) */
  fill?: string;
  /** Stroke color (default: currentColor) */
  stroke?: string;
  /** Stroke width (default: 2) */
  strokeWidth?: number;
}

/**
 * Generate inline SVG markup for an icon (for use in palette/toolbar)
 */
export function renderIconSvg(icon: SvgIconDefinition, size: number = 24): string {
  const viewBox = icon.viewBox || '0 0 24 24';
  const fill = icon.fill || 'none';
  const stroke = icon.stroke || 'currentColor';
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
