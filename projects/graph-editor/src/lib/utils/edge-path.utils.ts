import { Position } from '../graph.model';

/** Extract the side name from a port ID (e.g. 'top-1' → 'top', 'left' → 'left'). */
export function getPortSide(port: string): 'top' | 'bottom' | 'left' | 'right' {
  return port.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
}

/** Get the control point offset direction for a port (used by bezier path). */
export function getPortControlOffset(port: string, offset: number): { dx: number; dy: number } {
  const side = getPortSide(port);
  switch (side) {
    case 'top': return { dx: 0, dy: -offset };
    case 'bottom': return { dx: 0, dy: offset };
    case 'left': return { dx: -offset, dy: 0 };
    case 'right': return { dx: offset, dy: 0 };
  }
}

/** Build a rounded polyline path through a series of points with smooth corners. */
export function buildRoundedPolyline(points: Position[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  const radius = 8;
  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) {
      d += ` L ${curr.x},${curr.y}`;
      continue;
    }

    const r = Math.min(radius, len1 / 2, len2 / 2);

    const startX = curr.x + (dx1 / len1) * r;
    const startY = curr.y + (dy1 / len1) * r;
    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    d += ` L ${startX},${startY}`;
    d += ` Q ${curr.x},${curr.y} ${endX},${endY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;

  return d;
}

/**
 * Build a smooth bezier curve that passes through all points using
 * Catmull-Rom to cubic bezier conversion.
 */
export function buildSmoothBezierThroughPoints(points: Position[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  if (points.length === 3) {
    const [p0, p1, p2] = points;
    const cx = 2 * p1.x - (p0.x + p2.x) / 2;
    const cy = 2 * p1.y - (p0.y + p2.y) / 2;
    return `M ${p0.x},${p0.y} Q ${cx},${cy} ${p2.x},${p2.y}`;
  }

  const tension = 0.5;
  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const t1x = tension * (p2.x - p0.x);
    const t1y = tension * (p2.y - p0.y);
    const t2x = tension * (p3.x - p1.x);
    const t2y = tension * (p3.y - p1.y);

    const cp1x = p1.x + t1x / 3;
    const cp1y = p1.y + t1y / 3;
    const cp2x = p2.x - t2x / 3;
    const cp2y = p2.y - t2y / 3;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

/**
 * Get the orthogonal corner points for a step path through waypoints.
 * All segments are strictly horizontal or vertical.
 */
export function getStepThroughPointsPolyline(points: Position[], sourcePort: string, targetPort: string): Position[] {
  if (points.length < 2) return [];

  const sourceSide = getPortSide(sourcePort);
  const targetSide = getPortSide(targetPort);

  const result: Position[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];

    if (from.x === to.x && from.y === to.y) continue;

    let horizontalFirst: boolean;

    if (i === 0) {
      horizontalFirst = sourceSide === 'left' || sourceSide === 'right';
    } else if (i === points.length - 2) {
      horizontalFirst = targetSide === 'top' || targetSide === 'bottom';
    } else {
      horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    }

    if (from.x === to.x || from.y === to.y) {
      result.push(to);
    } else if (horizontalFirst) {
      result.push({ x: to.x, y: from.y });
      result.push(to);
    } else {
      result.push({ x: from.x, y: to.y });
      result.push(to);
    }
  }

  return result;
}

/**
 * Build an orthogonal step path through waypoints.
 * All segments are strictly horizontal or vertical.
 */
export function buildStepThroughPoints(points: Position[], sourcePort: string, targetPort: string): string {
  const result = getStepThroughPointsPolyline(points, sourcePort, targetPort);
  if (result.length === 0) return '';

  let d = `M ${result[0].x},${result[0].y}`;
  for (let i = 1; i < result.length; i++) {
    d += ` L ${result[i].x},${result[i].y}`;
  }
  return d;
}

/** Build a bezier edge path (no waypoints). */
export function buildBezierPath(
  s: Position, t: Position,
  sourcePort: string, targetPort: string
): string {
  const offset = Math.max(40, Math.abs(t.x - s.x) * 0.3, Math.abs(t.y - s.y) * 0.3);
  const sc = getPortControlOffset(sourcePort, offset);
  const tc = getPortControlOffset(targetPort, offset);
  const crossBias = 0.15;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const sc1x = s.x + sc.dx + (sc.dx !== 0 ? 0 : dx * crossBias);
  const sc1y = s.y + sc.dy + (sc.dy !== 0 ? 0 : dy * crossBias);
  const tc1x = t.x + tc.dx + (tc.dx !== 0 ? 0 : dx * -crossBias);
  const tc1y = t.y + tc.dy + (tc.dy !== 0 ? 0 : dy * -crossBias);
  return `M ${s.x},${s.y} C ${sc1x},${sc1y} ${tc1x},${tc1y} ${t.x},${t.y}`;
}

/** Get the corner points for a step path (no waypoints). */
export function getStepPathPoints(
  s: Position, t: Position,
  sourcePort: string, targetPort: string
): Position[] {
  const midX = (s.x + t.x) / 2;
  const midY = (s.y + t.y) / 2;
  const sourceSide = getPortSide(sourcePort);
  const targetSide = getPortSide(targetPort);
  const isSourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
  const isTargetVertical = targetSide === 'top' || targetSide === 'bottom';

  if (isSourceVertical && isTargetVertical) {
    return [s, { x: s.x, y: midY }, { x: t.x, y: midY }, t];
  } else if (!isSourceVertical && !isTargetVertical) {
    return [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
  } else if (isSourceVertical) {
    return [s, { x: s.x, y: t.y }, t];
  } else {
    return [s, { x: t.x, y: s.y }, t];
  }
}

/** Build a step edge path (no waypoints). */
export function buildStepPath(
  s: Position, t: Position,
  sourcePort: string, targetPort: string
): string {
  const points = getStepPathPoints(s, t, sourcePort, targetPort);
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x},${points[i].y}`;
  }
  return d;
}

/** Build a straight edge path. */
export function buildStraightPath(s: Position, t: Position): string {
  return `M ${s.x},${s.y} L ${t.x},${t.y}`;
}

/** Distance from a point to a line segment. */
export function pointToSegmentDistance(point: Position, lineStart: Position, lineEnd: Position): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/** Evaluate a position along a polyline at parameter t (0..1). */
export function evaluatePolylineAt(points: Position[], t: number): Position {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };

  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return points[0];

  const targetDist = t * totalLength;
  let accumulated = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (accumulated + segLengths[i] >= targetDist) {
      const segT = segLengths[i] === 0 ? 0 : (targetDist - accumulated) / segLengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * segT,
        y: points[i].y + (points[i + 1].y - points[i].y) * segT,
      };
    }
    accumulated += segLengths[i];
  }

  return points[points.length - 1];
}

/** Sample a cubic bezier curve into a polyline of evenly-spaced points. */
export function sampleCubicBezier(
  p0: Position, cp1: Position, cp2: Position, p3: Position, samples: number
): Position[] {
  const result: Position[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    result.push({
      x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p3.y,
    });
  }
  return result;
}

/**
 * Sample a quadratic bezier curve into a polyline.
 * Q(t) = (1-t)^2*p0 + 2*(1-t)*t*cp + t^2*p2
 */
function sampleQuadraticBezier(
  p0: Position, cp: Position, p2: Position, samples: number
): Position[] {
  const result: Position[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    result.push({
      x: u * u * p0.x + 2 * u * t * cp.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * cp.y + t * t * p2.y,
    });
  }
  return result;
}

/**
 * Build a polyline approximation of the rendered edge path, suitable for hit-testing.
 * Returns Position[] that closely follows the visual path for any path type.
 */
export function getEdgeHitTestPolyline(
  sourcePoint: Position,
  targetPoint: Position,
  waypoints: Position[] | undefined,
  pathType: 'straight' | 'bezier' | 'step',
  sourcePort: string,
  targetPort: string
): Position[] {
  const hasWaypoints = waypoints && waypoints.length > 0;

  if (pathType === 'straight') {
    return [sourcePoint, ...(waypoints || []), targetPoint];
  }

  if (pathType === 'step') {
    if (hasWaypoints) {
      const points = [sourcePoint, ...waypoints!, targetPoint];
      return getStepThroughPointsPolyline(points, sourcePort, targetPort);
    }
    return getStepPathPoints(sourcePoint, targetPoint, sourcePort, targetPort);
  }

  // pathType === 'bezier'
  if (hasWaypoints) {
    const points = [sourcePoint, ...waypoints!, targetPoint];
    return sampleSmoothBezierThroughPoints(points);
  }
  return sampleBezierPath(sourcePoint, targetPoint, sourcePort, targetPort);
}

/** Sample the single-segment cubic bezier from buildBezierPath into a polyline. */
function sampleBezierPath(
  s: Position, t: Position,
  sourcePort: string, targetPort: string
): Position[] {
  const offset = Math.max(40, Math.abs(t.x - s.x) * 0.3, Math.abs(t.y - s.y) * 0.3);
  const sc = getPortControlOffset(sourcePort, offset);
  const tc = getPortControlOffset(targetPort, offset);
  const crossBias = 0.15;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const cp1: Position = {
    x: s.x + sc.dx + (sc.dx !== 0 ? 0 : dx * crossBias),
    y: s.y + sc.dy + (sc.dy !== 0 ? 0 : dy * crossBias),
  };
  const cp2: Position = {
    x: t.x + tc.dx + (tc.dx !== 0 ? 0 : dx * -crossBias),
    y: t.y + tc.dy + (tc.dy !== 0 ? 0 : dy * -crossBias),
  };
  return sampleCubicBezier(s, cp1, cp2, t, 20);
}

/** Sample the Catmull-Rom spline from buildSmoothBezierThroughPoints into a polyline. */
function sampleSmoothBezierThroughPoints(points: Position[]): Position[] {
  if (points.length < 2) return points.slice();
  if (points.length === 2) return [points[0], points[1]];

  if (points.length === 3) {
    // Quadratic bezier — mirrors buildSmoothBezierThroughPoints 3-point case
    const [p0, p1, p2] = points;
    const cp: Position = {
      x: 2 * p1.x - (p0.x + p2.x) / 2,
      y: 2 * p1.y - (p0.y + p2.y) / 2,
    };
    return sampleQuadraticBezier(p0, cp, p2, 20);
  }

  // Catmull-Rom to cubic bezier — mirrors the 4+ point case
  const tension = 0.5;
  const samplesPerSegment = 8;
  const result: Position[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const t1x = tension * (p2.x - p0.x);
    const t1y = tension * (p2.y - p0.y);
    const t2x = tension * (p3.x - p1.x);
    const t2y = tension * (p3.y - p1.y);

    const cp1: Position = { x: p1.x + t1x / 3, y: p1.y + t1y / 3 };
    const cp2: Position = { x: p2.x - t2x / 3, y: p2.y - t2y / 3 };

    // Sample this segment (skip t=0 to avoid duplicate with previous segment end)
    const segmentSamples = sampleCubicBezier(p1, cp1, cp2, p2, samplesPerSegment);
    for (let j = 1; j < segmentSamples.length; j++) {
      result.push(segmentSamples[j]);
    }
  }

  return result;
}
