import { GraphNode, Position } from '../graph.model';

type Size = { width: number; height: number };
type PortEntry = { position: string; x: number; y: number };
type NodeSizeFn = (node: GraphNode) => Size;

/** Compute evenly-spaced port positions along a side, always including the center. */
export function computePortPositions(sideLength: number, spacing: number, margin: number): number[] {
  if (spacing <= 0) return [sideLength / 2];
  const center = sideLength / 2;
  const positions: number[] = [center];
  let offset = spacing;
  while (center - offset >= margin && center + offset <= sideLength - margin) {
    positions.unshift(center - offset);
    positions.push(center + offset);
    offset += spacing;
  }
  return positions;
}

/** Get all ports for a node (top, bottom, left, right). */
export function getNodePorts(nodeSize: Size, spacing: number, margin: number): PortEntry[] {
  const ports: PortEntry[] = [];

  const hPositions = computePortPositions(nodeSize.width, spacing, margin);
  const vPositions = computePortPositions(nodeSize.height, spacing, margin);

  hPositions.forEach((x: number, i: number) => ports.push({ position: `top-${i}`, x, y: 0 }));
  hPositions.forEach((x: number, i: number) => ports.push({ position: `bottom-${i}`, x, y: nodeSize.height }));
  vPositions.forEach((y: number, i: number) => ports.push({ position: `left-${i}`, x: 0, y }));
  vPositions.forEach((y: number, i: number) => ports.push({ position: `right-${i}`, x: nodeSize.width, y }));

  return ports;
}

/** Get the world position of a specific port on a node. */
export function getPortWorldPosition(
  node: GraphNode, port: string,
  nodeSize: Size, spacing: number, margin: number
): Position {
  const side = port.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
  const parts = port.split('-');
  const index = parts.length > 1 ? parseInt(parts[1], 10) : -1;

  if (index < 0 || isNaN(index)) {
    const legacyOffsets: Record<string, { x: number; y: number }> = {
      top: { x: nodeSize.width / 2, y: 0 },
      bottom: { x: nodeSize.width / 2, y: nodeSize.height },
      left: { x: 0, y: nodeSize.height / 2 },
      right: { x: nodeSize.width, y: nodeSize.height / 2 }
    };
    const offset = legacyOffsets[side] || { x: nodeSize.width / 2, y: 0 };
    return { x: node.position.x + offset.x, y: node.position.y + offset.y };
  }

  let offsetX = 0;
  let offsetY = 0;
  if (side === 'top' || side === 'bottom') {
    const hPositions = computePortPositions(nodeSize.width, spacing, margin);
    offsetX = hPositions[Math.min(index, hPositions.length - 1)];
    offsetY = side === 'top' ? 0 : nodeSize.height;
  } else {
    const vPositions = computePortPositions(nodeSize.height, spacing, margin);
    offsetX = side === 'left' ? 0 : nodeSize.width;
    offsetY = vPositions[Math.min(index, vPositions.length - 1)];
  }

  return { x: node.position.x + offsetX, y: node.position.y + offsetY };
}

/**
 * Rank all ports on a node by how well they face another node.
 * Returns port position strings ordered best-to-worst.
 */
export function rankPortsForEdge(
  node: GraphNode, otherNode: GraphNode,
  getNodeSize: NodeSizeFn, spacing: number, margin: number
): string[] {
  const nodeSize = getNodeSize(node);
  const otherSize = getNodeSize(otherNode);
  const nodeCenter: Position = {
    x: node.position.x + nodeSize.width / 2,
    y: node.position.y + nodeSize.height / 2
  };
  const otherCenter: Position = {
    x: otherNode.position.x + otherSize.width / 2,
    y: otherNode.position.y + otherSize.height / 2
  };

  const dirX = otherCenter.x - nodeCenter.x;
  const dirY = otherCenter.y - nodeCenter.y;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const normDirX = dirX / dirLen;
  const normDirY = dirY / dirLen;

  const sideNormals: Record<string, { nx: number; ny: number }> = {
    top: { nx: 0, ny: -1 },
    bottom: { nx: 0, ny: 1 },
    left: { nx: -1, ny: 0 },
    right: { nx: 1, ny: 0 }
  };

  const ports = getNodePorts(nodeSize, spacing, margin);
  const scored: Array<{ position: string; score: number }> = [];

  for (const p of ports) {
    const side = p.position.split('-')[0];
    const normal = sideNormals[side];
    const dot = normal.nx * normDirX + normal.ny * normDirY;
    const wx = node.position.x + p.x;
    const wy = node.position.y + p.y;
    const dx = otherCenter.x - wx;
    const dy = otherCenter.y - wy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    scored.push({ position: p.position, score: dot + 1 / dist });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.position);
}

/** Find the best port for an edge on a given node. */
export function findClosestPortForEdge(
  node: GraphNode, otherNode: GraphNode,
  getNodeSize: NodeSizeFn, spacing: number, margin: number
): string {
  return rankPortsForEdge(node, otherNode, getNodeSize, spacing, margin)[0];
}
