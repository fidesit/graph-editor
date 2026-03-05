import { GraphNode, GuideLine, Position } from '../graph.model';

type Size = { width: number; height: number };
type NodeSizeFn = (node: GraphNode) => Size;

/**
 * Compute snap guides during node drag.
 * Returns a snapped position and guide lines to render.
 */
export function computeSnapGuides(
  candidatePos: Position,
  dragSize: Size,
  draggedIds: Set<string>,
  nodes: GraphNode[],
  getNodeSize: NodeSizeFn,
  scale: number
): { snappedPos: Position; guides: GuideLine[] } {
  const SNAP_THRESHOLD = 5 / scale;
  const DISTANCE_LIMIT = 500;

  const otherNodes = nodes.filter(n => !draggedIds.has(n.id));

  const dragLeft = candidatePos.x;
  const dragRight = candidatePos.x + dragSize.width;
  const dragCx = candidatePos.x + dragSize.width / 2;
  const dragTop = candidatePos.y;
  const dragBottom = candidatePos.y + dragSize.height;
  const dragCy = candidatePos.y + dragSize.height / 2;

  let bestSnapX: { delta: number; guides: GuideLine[] } | null = null;
  let bestSnapY: { delta: number; guides: GuideLine[] } | null = null;

  for (const other of otherNodes) {
    const otherSize = getNodeSize(other);
    const ox = other.position.x;
    const oy = other.position.y;

    if (Math.abs(dragCx - (ox + otherSize.width / 2)) > DISTANCE_LIMIT &&
        Math.abs(dragCy - (oy + otherSize.height / 2)) > DISTANCE_LIMIT) {
      continue;
    }

    const otherLeft = ox;
    const otherRight = ox + otherSize.width;
    const otherCx = ox + otherSize.width / 2;
    const otherTop = oy;
    const otherBottom = oy + otherSize.height;
    const otherCy = oy + otherSize.height / 2;

    const vCandidates: { delta: number; dragRef: number; otherRef: number }[] = [
      { delta: otherLeft - dragLeft, dragRef: dragLeft, otherRef: otherLeft },
      { delta: otherRight - dragRight, dragRef: dragRight, otherRef: otherRight },
      { delta: otherLeft - dragRight, dragRef: dragRight, otherRef: otherLeft },
      { delta: otherRight - dragLeft, dragRef: dragLeft, otherRef: otherRight },
      { delta: otherCx - dragCx, dragRef: dragCx, otherRef: otherCx },
    ];

    for (const vc of vCandidates) {
      const absDelta = Math.abs(vc.delta);
      if (absDelta > SNAP_THRESHOLD) continue;
      if (!bestSnapX || absDelta < Math.abs(bestSnapX.delta)) {
        const guideX = vc.otherRef;
        const minY = Math.min(dragTop + vc.delta, otherTop) - 20;
        const maxY = Math.max(dragBottom + vc.delta, otherBottom) + 20;
        bestSnapX = {
          delta: vc.delta,
          guides: [{ x1: guideX, y1: minY, x2: guideX, y2: maxY, orientation: 'vertical' }]
        };
      }
    }

    const hCandidates: { delta: number; dragRef: number; otherRef: number }[] = [
      { delta: otherTop - dragTop, dragRef: dragTop, otherRef: otherTop },
      { delta: otherBottom - dragBottom, dragRef: dragBottom, otherRef: otherBottom },
      { delta: otherTop - dragBottom, dragRef: dragBottom, otherRef: otherTop },
      { delta: otherBottom - dragTop, dragRef: dragTop, otherRef: otherBottom },
      { delta: otherCy - dragCy, dragRef: dragCy, otherRef: otherCy },
    ];

    for (const hc of hCandidates) {
      const absDelta = Math.abs(hc.delta);
      if (absDelta > SNAP_THRESHOLD) continue;
      if (!bestSnapY || absDelta < Math.abs(bestSnapY.delta)) {
        const guideY = hc.otherRef;
        const minX = Math.min(dragLeft + (bestSnapX?.delta ?? 0), otherLeft) - 20;
        const maxX = Math.max(dragRight + (bestSnapX?.delta ?? 0), otherRight) + 20;
        bestSnapY = {
          delta: hc.delta,
          guides: [{ x1: minX, y1: guideY, x2: maxX, y2: guideY, orientation: 'horizontal' }]
        };
      }
    }
  }

  const snappedPos: Position = {
    x: candidatePos.x + (bestSnapX?.delta ?? 0),
    y: candidatePos.y + (bestSnapY?.delta ?? 0)
  };

  const guides: GuideLine[] = [
    ...(bestSnapX?.guides ?? []),
    ...(bestSnapY?.guides ?? [])
  ];

  return { snappedPos, guides };
}

/**
 * Compute snap guides during node resize.
 * Position (top-left) is fixed; only width/height change.
 */
export function computeResizeSnapGuides(
  nodePos: Position,
  candidateSize: Size,
  draggedIds: Set<string>,
  nodes: GraphNode[],
  getNodeSize: NodeSizeFn,
  scale: number
): { snappedSize: Size; guides: GuideLine[] } {
  const SNAP_THRESHOLD = 5 / scale;
  const DISTANCE_LIMIT = 500;

  const otherNodes = nodes.filter(n => !draggedIds.has(n.id));

  const left = nodePos.x;
  const top = nodePos.y;
  const right = left + candidateSize.width;
  const bottom = top + candidateSize.height;
  const cx = left + candidateSize.width / 2;
  const cy = top + candidateSize.height / 2;

  let bestSnapW: { delta: number; guides: GuideLine[] } | null = null;
  let bestSnapH: { delta: number; guides: GuideLine[] } | null = null;

  for (const other of otherNodes) {
    const otherSize = getNodeSize(other);
    const ox = other.position.x;
    const oy = other.position.y;

    if (Math.abs(cx - (ox + otherSize.width / 2)) > DISTANCE_LIMIT &&
        Math.abs(cy - (oy + otherSize.height / 2)) > DISTANCE_LIMIT) {
      continue;
    }

    const otherLeft = ox;
    const otherRight = ox + otherSize.width;
    const otherCx = ox + otherSize.width / 2;
    const otherTop = oy;
    const otherBottom = oy + otherSize.height;
    const otherCy = oy + otherSize.height / 2;

    const wCandidates = [
      { delta: otherLeft - right, ref: otherLeft },
      { delta: otherRight - right, ref: otherRight },
      { delta: otherCx - right, ref: otherCx },
      { delta: otherCx - cx, ref: otherCx },
    ];

    for (let i = 0; i < wCandidates.length; i++) {
      const wc = wCandidates[i];
      const absDelta = Math.abs(wc.delta);
      if (absDelta > SNAP_THRESHOLD) continue;
      const isCenter = i === 3;
      const widthDelta = isCenter ? wc.delta * 2 : wc.delta;
      if (!bestSnapW || absDelta < Math.abs(bestSnapW.delta)) {
        const guideX = wc.ref;
        const minY = Math.min(top, otherTop) - 20;
        const maxY = Math.max(bottom + widthDelta, otherBottom) + 20;
        bestSnapW = {
          delta: widthDelta,
          guides: [{ x1: guideX, y1: minY, x2: guideX, y2: maxY, orientation: 'vertical' }]
        };
      }
    }

    const hCandidates = [
      { delta: otherTop - bottom, ref: otherTop },
      { delta: otherBottom - bottom, ref: otherBottom },
      { delta: otherCy - bottom, ref: otherCy },
      { delta: otherCy - cy, ref: otherCy },
    ];

    for (let i = 0; i < hCandidates.length; i++) {
      const hc = hCandidates[i];
      const absDelta = Math.abs(hc.delta);
      if (absDelta > SNAP_THRESHOLD) continue;
      const isCenter = i === 3;
      const heightDelta = isCenter ? hc.delta * 2 : hc.delta;
      if (!bestSnapH || absDelta < Math.abs(bestSnapH.delta)) {
        const guideY = hc.ref;
        const minX = Math.min(left, otherLeft) - 20;
        const maxX = Math.max(right + (bestSnapW?.delta ?? 0), otherRight) + 20;
        bestSnapH = {
          delta: heightDelta,
          guides: [{ x1: minX, y1: guideY, x2: maxX, y2: guideY, orientation: 'horizontal' }]
        };
      }
    }
  }

  const snappedSize = {
    width: candidateSize.width + (bestSnapW?.delta ?? 0),
    height: candidateSize.height + (bestSnapH?.delta ?? 0)
  };

  const guides: GuideLine[] = [
    ...(bestSnapW?.guides ?? []),
    ...(bestSnapH?.guides ?? [])
  ];

  return { snappedSize, guides };
}
