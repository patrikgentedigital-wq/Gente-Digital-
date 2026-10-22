import type { Point } from './types';
import { distanceMeters } from './distance';

export type NetworkCable = { id: string; name: string; points: Point[] };
export type NetworkPole = { id: string; name: string; location: Point };
export type FiberNetwork = {
  poles: NetworkPole[];
  cables: NetworkCable[];
  cableCount: number;
  complete: boolean;
  issues: string[];
  fetchedAt: string;
  diagnostics?: {
    coordinateFields?: string[]; coordinateDataFields?: string[];
    missingCables?: { id: string; name: string }[];
  };
};
export type RouteEstimate = {
  points: Point[];
  meters: number;
  startGap: number;
  endGap: number;
  confirmed: false;
};
export type RouteTarget = { id: string; location: Point };

type Segment = { index: number; a: Point; b: Point; aKey: string; bKey: string };
type Projection = { segmentIndex: number; t: number; point: Point; gap: number };
type Anchor = Projection & { id: string; queryId: string };
type Edge = { id: string; meters: number };

const maxVertices = 25_000;
const maxGraphNodes = 30_000;
const maxSnapMeters = 30;
const poleJoinMeters = 3;

const pointKey = (point: Point) => `${point.latitude}:${point.longitude}`;
const validPoint = (point: Point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

function projectToSegment(query: Point, a: Point, b: Point): { t: number; point: Point; approximateGap: number } {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(query.latitude * Math.PI / 180);
  const ax = (a.longitude - query.longitude) * longitudeScale;
  const ay = (a.latitude - query.latitude) * latitudeScale;
  const bx = (b.longitude - query.longitude) * longitudeScale;
  const by = (b.latitude - query.latitude) * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  const point = { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
  const px = ax + dx * t;
  const py = ay + dy * t;
  return { t, point, approximateGap: Math.hypot(px, py) };
}

class MinQueue {
  private values: { id: string; meters: number }[] = [];

  push(value: { id: string; meters: number }) {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (values[parent]!.meters <= value.meters) break;
      values[index] = values[parent]!;
      index = parent;
    }
    values[index] = value;
  }

  pop(): { id: string; meters: number } | undefined {
    const values = this.values;
    const first = values[0];
    const last = values.pop();
    if (!first || !last || values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= values.length) break;
      const child = right < values.length && values[right]!.meters < values[left]!.meters ? right : left;
      if (values[child]!.meters >= last.meters) break;
      values[index] = values[child]!;
      index = child;
    }
    values[index] = last;
    return first;
  }
}

function nearestProjection(point: Point, segments: Segment[]): Projection | null {
  let selected: Projection | null = null;
  let approximateGap = Infinity;
  for (const segment of segments) {
    const projected = projectToSegment(point, segment.a, segment.b);
    if (projected.approximateGap >= approximateGap) continue;
    approximateGap = projected.approximateGap;
    selected = { segmentIndex: segment.index, t: projected.t, point: projected.point, gap: 0 };
  }
  if (!selected || approximateGap > maxSnapMeters + 0.05) return null;
  const segment = segments[selected.segmentIndex]!;
  const gap = distanceMeters(point, selected.point);
  return gap <= maxSnapMeters
    ? { ...selected, t: projectToSegment(point, segment.a, segment.b).t, gap }
    : null;
}

function shortestPaths(edges: Map<string, Edge[]>, points: Map<string, Point>, startId: string) {
  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const settled = new Set<string>();
  const queue = new MinQueue();
  queue.push({ id: startId, meters: 0 });
  while (true) {
    const current = queue.pop();
    if (!current) break;
    if (settled.has(current.id) || current.meters !== distances.get(current.id)) continue;
    settled.add(current.id);
    for (const edge of edges.get(current.id) ?? []) {
      const next = current.meters + edge.meters;
      if (next < (distances.get(edge.id) ?? Infinity)) {
        distances.set(edge.id, next);
        previous.set(edge.id, current.id);
        queue.push({ id: edge.id, meters: next });
      }
    }
  }
  return { distances, previous, points };
}

/**
 * Estimates paths through the registered FiberDocs cable geometry. Shared
 * exact cable vertices and mapped poles can join segments; geometric crossings
 * without a shared vertex or pole are intentionally kept disconnected.
 */
export function estimateCablePaths(
  cables: NetworkCable[],
  start: Point,
  targets: RouteTarget[],
  poles: NetworkPole[] = []
): Map<string, RouteEstimate | null> {
  const result = new Map<string, RouteEstimate | null>(targets.map(target => [target.id, null]));
  if (!validPoint(start) || !targets.length || cables.length === 0 || targets.some(target => !validPoint(target.location))) return result;

  const segments: Segment[] = [];
  const cableVertices = new Map<string, Point>();
  let vertexCount = 0;
  for (const [cableIndex, cable] of cables.entries()) {
    if (cable.points.some(point => !validPoint(point))) return result;
    vertexCount += cable.points.length;
    if (vertexCount > maxVertices) return result;
    const vertexKeys = cable.points.map((point, index) => {
      const endpoint = index === 0 || index === cable.points.length - 1;
      const key = endpoint ? `endpoint:${pointKey(point)}` : `line:${cableIndex}:${index}`;
      cableVertices.set(key, point);
      return key;
    });
    for (let index = 1; index < cable.points.length; index++) {
      const a = cable.points[index - 1]!;
      const b = cable.points[index]!;
      segments.push({ index: segments.length, a, b, aKey: vertexKeys[index - 1]!, bKey: vertexKeys[index]! });
    }
  }
  if (!segments.length) return result;

  const startProjection = nearestProjection(start, segments);
  if (!startProjection) return result;
  const targetProjections = new Map<string, Projection>();
  for (const target of targets) {
    const projection = nearestProjection(target.location, segments);
    if (projection) targetProjections.set(target.id, projection);
  }

  const anchorsBySegment = new Map<number, Anchor[]>();
  const addAnchor = (queryId: string, projection: Projection) => {
    const anchor: Anchor = { ...projection, queryId, id: `anchor:${queryId}` };
    const list = anchorsBySegment.get(projection.segmentIndex) ?? [];
    list.push(anchor);
    anchorsBySegment.set(projection.segmentIndex, list);
  };
  addAnchor('start', startProjection);
  for (const [id, projection] of targetProjections) addAnchor(`target:${id}`, projection);

  const points = new Map<string, Point>();
  const edges = new Map<string, Edge[]>();
  const projectionNodeIds = new Map<string, string>();
  const ensureNode = (id: string, point: Point) => {
    if (!points.has(id)) points.set(id, point);
    if (!edges.has(id)) edges.set(id, []);
  };
  const addEdge = (a: string, b: string, meters: number) => {
    if (a === b || !Number.isFinite(meters) || meters < 0) return;
    edges.get(a)!.push({ id: b, meters });
    edges.get(b)!.push({ id: a, meters });
  };

  for (const [id, point] of cableVertices) ensureNode(`vertex:${id}`, point);
  for (const segment of segments) {
    const segmentAnchors = anchorsBySegment.get(segment.index) ?? [];
    const anchors = [...segmentAnchors]
      .filter(anchor => anchor.t > 1e-9 && anchor.t < 1 - 1e-9)
      .sort((a, b) => a.t - b.t);
    const ordered: { t: number; id: string; point: Point }[] = [
      { t: 0, id: `vertex:${segment.aKey}`, point: segment.a },
      ...anchors.map(anchor => ({ t: anchor.t, id: anchor.id, point: anchor.point })),
      { t: 1, id: `vertex:${segment.bKey}`, point: segment.b },
    ];
    const compact: typeof ordered = [];
    for (const anchor of ordered) {
      const previous = compact.at(-1);
      if (previous && Math.abs(previous.t - anchor.t) < 1e-9) {
        continue;
      }
      compact.push(anchor);
      ensureNode(anchor.id, anchor.point);
    }
    for (let index = 1; index < compact.length; index++) {
      const a = compact[index - 1]!;
      const b = compact[index]!;
      addEdge(a.id, b.id, distanceMeters(a.point, b.point));
    }
    for (const anchor of segmentAnchors) {
      const node = compact.find(item => item.id === anchor.id || Math.abs(item.t - anchor.t) < 1e-9);
      if (node) projectionNodeIds.set(anchor.queryId, node.id);
    }
  }

  // A mapped pole is a real junction hint. Join only cable vertices within 3 m.
  for (const pole of poles) {
    if (!validPoint(pole.location)) continue;
    const poleId = `pole:${pole.id}`;
    ensureNode(poleId, pole.location);
    for (const [key, vertex] of cableVertices) {
      const latitudeDelta = Math.abs(vertex.latitude - pole.location.latitude) * 111_320;
      if (latitudeDelta > poleJoinMeters) continue;
      const longitudeDelta = Math.abs(vertex.longitude - pole.location.longitude)
        * 111_320 * Math.cos(pole.location.latitude * Math.PI / 180);
      if (longitudeDelta > poleJoinMeters) continue;
      const meters = distanceMeters(vertex, pole.location);
      if (meters <= poleJoinMeters) addEdge(poleId, `vertex:${key}`, meters);
    }
  }

  const startId = 'query:start';
  ensureNode(startId, start);
  const startNodeId = projectionNodeIds.get('start')!;
  if (!points.has(startNodeId)) ensureNode(startNodeId, startProjection.point);
  addEdge(startId, startNodeId, startProjection.gap);

  const targetNodeIds = new Map<string, { queryId: string; nodeId: string; projection: Projection; location: Point }>();
  for (const target of targets) {
    const projection = targetProjections.get(target.id);
    if (!projection) continue;
    const projectedNodeId = projectionNodeIds.get(`target:${target.id}`);
    if (!projectedNodeId) continue;
    const queryId = `query:target:${target.id}`;
    ensureNode(queryId, target.location);
    if (!points.has(projectedNodeId)) ensureNode(projectedNodeId, projection.point);
    addEdge(queryId, projectedNodeId, projection.gap);
    targetNodeIds.set(target.id, { queryId, nodeId: projectedNodeId, projection, location: target.location });
  }

  if (points.size > maxGraphNodes) return result;
  const paths = shortestPaths(edges, points, startId);
  for (const [id, target] of targetNodeIds) {
    const meters = paths.distances.get(target.queryId);
    if (meters === undefined) continue;
    const path: Point[] = [];
    let cursor = target.queryId;
    path.push(paths.points.get(cursor)!);
    while (cursor !== startId) {
      const prior = paths.previous.get(cursor);
      if (!prior) { path.length = 0; break; }
      cursor = prior;
      path.push(paths.points.get(cursor)!);
    }
    if (!path.length) continue;
    const ordered = path.reverse();
    const compact = ordered.filter((point, index) => index === 0 || distanceMeters(point, ordered[index - 1]!) > 0.01);
    result.set(id, { points: compact, meters, startGap: startProjection.gap, endGap: target.projection.gap, confirmed: false });
  }
  return result;
}

export function estimateCablePath(
  cables: NetworkCable[],
  start: Point,
  end: Point,
  poles: NetworkPole[] = []
): RouteEstimate | null {
  return estimateCablePaths(cables, start, [{ id: 'destination', location: end }], poles).get('destination') ?? null;
}
