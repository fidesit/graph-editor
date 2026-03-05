import { Position } from '../graph.model';

type Size = { width: number; height: number };
export type IconPosition = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';

/** Get the image size for a node (square, proportional to height). */
export function getNodeImageSize(nodeSize: Size): number {
  return Math.min(64, Math.max(24, nodeSize.height * 0.4));
}

/** Get the position for the node image (top-left corner). */
export function getNodeImagePosition(nodeSize: Size, iconPosition: IconPosition): Position {
  const imageSize = getNodeImageSize(nodeSize);
  const padding = 8;

  const positions: Record<string, Position> = {
    'top-left': { x: padding, y: padding },
    'top': { x: (nodeSize.width - imageSize) / 2, y: padding },
    'top-right': { x: nodeSize.width - imageSize - padding, y: padding },
    'right': { x: nodeSize.width - imageSize - padding, y: (nodeSize.height - imageSize) / 2 },
    'bottom-right': { x: nodeSize.width - imageSize - padding, y: nodeSize.height - imageSize - padding },
    'bottom': { x: (nodeSize.width - imageSize) / 2, y: nodeSize.height - imageSize - padding },
    'bottom-left': { x: padding, y: nodeSize.height - imageSize - padding },
    'left': { x: padding, y: (nodeSize.height - imageSize) / 2 }
  };

  return positions[iconPosition] || positions['top-left'];
}

/** Get the position for the node icon (emoji). */
export function getNodeIconPosition(nodeSize: Size, iconPosition: IconPosition): Position {
  const padding = nodeSize.height * 0.25;

  const positions: Record<string, Position> = {
    'top-left': { x: padding, y: padding },
    'top': { x: nodeSize.width / 2, y: padding },
    'top-right': { x: nodeSize.width - padding, y: padding },
    'right': { x: nodeSize.width - padding, y: nodeSize.height / 2 },
    'bottom-right': { x: nodeSize.width - padding, y: nodeSize.height - padding },
    'bottom': { x: nodeSize.width / 2, y: nodeSize.height - padding },
    'bottom-left': { x: padding, y: nodeSize.height - padding },
    'left': { x: padding, y: nodeSize.height / 2 }
  };

  return positions[iconPosition] || positions['top-left'];
}

/** Get the label position within a node. */
export function getNodeLabelPosition(nodeSize: Size, iconPosition: IconPosition): Position {
  const padding = nodeSize.height * 0.25;

  const labelPositions: Record<string, Position> = {
    'top-left': { x: nodeSize.width / 2 + padding / 2, y: nodeSize.height / 2 + 4 },
    'top': { x: nodeSize.width / 2, y: nodeSize.height / 2 + padding / 2 },
    'top-right': { x: nodeSize.width / 2 - padding / 2, y: nodeSize.height / 2 + 4 },
    'right': { x: nodeSize.width / 2 - padding / 2, y: nodeSize.height / 2 },
    'bottom-right': { x: nodeSize.width / 2 - padding / 2, y: nodeSize.height / 2 - 4 },
    'bottom': { x: nodeSize.width / 2, y: nodeSize.height / 2 - padding / 2 },
    'bottom-left': { x: nodeSize.width / 2 + padding / 2, y: nodeSize.height / 2 - 4 },
    'left': { x: nodeSize.width / 2 + padding / 2, y: nodeSize.height / 2 }
  };

  return labelPositions[iconPosition] || labelPositions['top-left'];
}

/** Get the bounding box for label text within a node, avoiding the icon area. */
export function getNodeLabelBounds(
  nodeSize: Size, imageSize: number, iconPosition: IconPosition
): { x: number; y: number; width: number; height: number } {
  const padding = 12;
  const iconAreaSize = Math.max(imageSize, nodeSize.height * 0.35) + 8;

  let x = padding;
  let y = padding;
  let width = nodeSize.width - padding * 2;
  let height = nodeSize.height - padding * 2;

  switch (iconPosition) {
    case 'top-left':
    case 'left':
    case 'bottom-left':
      x = iconAreaSize + padding / 2;
      width = nodeSize.width - iconAreaSize - padding - padding / 2;
      break;
    case 'top-right':
    case 'right':
    case 'bottom-right':
      width = nodeSize.width - iconAreaSize - padding - padding / 2;
      break;
    case 'top':
      y = iconAreaSize + padding / 2;
      height = nodeSize.height - iconAreaSize - padding - padding / 2;
      break;
    case 'bottom':
      height = nodeSize.height - iconAreaSize - padding - padding / 2;
      break;
  }

  return { x, y, width: Math.max(width, 20), height: Math.max(height, 20) };
}

/** Wrap text into lines respecting max characters per line. */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine <= 0) return [text];
  if (text.length <= maxCharsPerLine) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      if (word.length > maxCharsPerLine) {
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
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      if (word.length > maxCharsPerLine) {
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

/** Get wrapped text lines and font size for a node label. */
export function getWrappedNodeLabel(
  text: string,
  bounds: { width: number; height: number }
): { lines: string[]; fontSize: number; lineHeight: number } {
  const baseFontSize = 14;
  const minFontSize = 9;
  const lineHeightRatio = 1.3;

  for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * lineHeightRatio;
    const maxCharsPerLine = Math.floor(bounds.width / charWidth);
    const maxLines = Math.floor(bounds.height / lineHeight);

    if (maxCharsPerLine < 3 || maxLines < 1) continue;

    const lines = wrapText(text, maxCharsPerLine);

    if (lines.length <= maxLines) {
      return { lines, fontSize, lineHeight };
    }

    if (fontSize === minFontSize) {
      const truncatedLines = lines.slice(0, maxLines);
      if (lines.length > maxLines && truncatedLines.length > 0) {
        const lastLine = truncatedLines[truncatedLines.length - 1];
        if (lastLine.length > 3) {
          truncatedLines[truncatedLines.length - 1] = lastLine.slice(0, -3) + '...';
        }
      }
      return { lines: truncatedLines, fontSize, lineHeight };
    }
  }

  return { lines: [text], fontSize: minFontSize, lineHeight: minFontSize * lineHeightRatio };
}
