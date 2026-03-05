import { Graph, GraphNode } from '../graph.model';

type Size = { width: number; height: number };
type NodeSizeFn = (node: GraphNode) => Size;

/** Dagre-based hierarchical layout. */
export async function layoutDagre(
  graph: Graph, direction: 'TB' | 'LR',
  getNodeSize: NodeSizeFn,
  options?: { nodesep?: number; ranksep?: number }
): Promise<GraphNode[]> {
  const dagreModule = await import('dagre');
  const dagre = dagreModule.default ?? dagreModule;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: options?.nodesep ?? 60,
    ranksep: options?.ranksep ?? 80,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    const size = getNodeSize(node);
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return graph.nodes.map(node => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;
    const size = getNodeSize(node);
    return {
      ...node,
      position: {
        x: dagreNode.x - size.width / 2,
        y: dagreNode.y - size.height / 2,
      },
    };
  });
}

/** Compact layout — grid packing via topological order to minimize total area. */
export async function layoutCompact(
  graph: Graph, getNodeSize: NodeSizeFn
): Promise<GraphNode[]> {
  if (graph.nodes.length === 0) return [];

  // Build adjacency for topological sort
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    children.set(node.id, []);
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }

  // Kahn's algorithm — topological sort (BFS)
  const queue: string[] = [];
  for (const node of graph.nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) queue.push(node.id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const child of children.get(id) ?? []) {
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }
  // Append any remaining nodes (cycles)
  for (const node of graph.nodes) {
    if (!sorted.includes(node.id)) sorted.push(node.id);
  }

  // Compute max node dimensions for uniform grid cells
  const sizes = new Map<string, { width: number; height: number }>();
  let maxW = 0, maxH = 0;
  for (const node of graph.nodes) {
    const size = getNodeSize(node);
    sizes.set(node.id, size);
    maxW = Math.max(maxW, size.width);
    maxH = Math.max(maxH, size.height);
  }

  const cols = Math.max(1, Math.round(Math.sqrt(sorted.length)));
  const gapX = 30;
  const gapY = 40;
  const cellW = maxW + gapX;
  const cellH = maxH + gapY;

  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = sizes.get(sorted[i])!;
    positions.set(sorted[i], {
      x: col * cellW + (maxW - size.width) / 2,
      y: row * cellH + (maxH - size.height) / 2,
    });
  }

  return graph.nodes.map(node => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}
