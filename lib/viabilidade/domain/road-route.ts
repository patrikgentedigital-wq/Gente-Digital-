import { distanceMeters } from './distance';
import type { Point, Region } from './types';

export type RoadCoverageGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export type RoadGraphNode = { id: string; location: Point };
export type RoadGraphEdge = {
  id: string;
  wayId: string;
  from: string;
  to: string;
  meters?: number;
  highway?: string;
  name?: string | null;
  access?: string | null;
};

export type RoadGraph = {
  schemaVersion: 1;
  region: Region;
  graphVersion: string;
  snapshotAt: string;
  coverage: RoadCoverageGeometry;
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
};

export type StreetRoute = {
  points: Point[];
  streetMeters: number;
  installAccessMeters: number;
  ctoAccessMeters: number;
};
export type StreetRouteFailure = 'OSM_ENCAIXE_FORA_DA_VIA' | 'OSM_SEM_CAMINHO_CONTINUO' | 'OSM_FORA_DA_COBERTURA';

export type RouteTarget = { id: string; location: Point };

type Segment = {
  index: number;
  edge: RoadGraphEdge;
  a: Point;
  b: Point;
  meters: number;
};
type Projection = { segment: Segment; t: number; point: Point; gap: number };
type SearchValue = { id: string; distance: number; priority: number };
type Neighbor = { id: string; meters: number };

const maxSnapMeters = 30;
const cellDegrees = 0.01;
const maxNodes = 200_000;
const maxEdges = 400_000;
const validPoint = (point: Point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

function pointOnRing(point: Point, ring: number[][]): boolean {
  for (let index = 1; index < ring.length; index++) {
    const first = ring[index - 1];
    const second = ring[index];
    if (!first || !second) continue;
    const projection = projectToSegment(point, { latitude: first[1]!, longitude: first[0]! },
      { latitude: second[1]!, longitude: second[0]! });
    if (projection.gap <= 0.25) return true;
  }
  return false;
}

function pointInRing(point: Point, ring: number[][]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current];
    const b = ring[previous];
    if (!a || !b) continue;
    const ax = a[0]!;
    const ay = a[1]!;
    const bx = b[0]!;
    const by = b[1]!;
    const crosses = (ay > point.latitude) !== (by > point.latitude)
      && point.longitude < ((bx - ax) * (point.latitude - ay)) / (by - ay) + ax;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Point, rings: number[][][]): boolean {
  const exterior = rings[0];
  if (!exterior || (!pointOnRing(point, exterior) && !pointInRing(point, exterior))) return false;
  return !rings.slice(1).some(ring => pointOnRing(point, ring) || pointInRing(point, ring));
}

export function isPointInRoadCoverage(graph: RoadGraph, point: Point): boolean {
  if (!validPoint(point) || !graph.coverage) return false;
  if (graph.coverage.type === 'Polygon') return pointInPolygon(point, graph.coverage.coordinates);
  if (graph.coverage.type === 'MultiPolygon') return graph.coverage.coordinates.some(polygon => pointInPolygon(point, polygon));
  return false;
}

function projectToSegment(query: Point, a: Point, b: Point): { t: number; point: Point; gap: number } {
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
  const point = {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
  return { t, point, gap: distanceMeters(query, point) };
}

function cellKey(latitude: number, longitude: number): string {
  return `${Math.floor(latitude / cellDegrees)}:${Math.floor(longitude / cellDegrees)}`;
}

function buildSegments(graph: RoadGraph): { segments: Segment[]; nodeLocations: Map<string, Point> } | null {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > maxNodes || graph.edges.length > maxEdges) return null;
  const nodeLocations = new Map<string, Point>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !validPoint(node.location) || nodeLocations.has(node.id)) return null;
    nodeLocations.set(node.id, node.location);
  }
  const segments: Segment[] = [];
  for (const edge of graph.edges) {
    const a = nodeLocations.get(edge.from);
    const b = nodeLocations.get(edge.to);
    if (!edge.id || !edge.wayId || !a || !b || edge.from === edge.to) return null;
    const meters = Number.isFinite(edge.meters) && edge.meters! >= 0 ? edge.meters! : distanceMeters(a, b);
    if (!Number.isFinite(meters) || meters <= 0) continue;
    segments.push({ index: segments.length, edge, a, b, meters });
  }
  return segments.length ? { segments, nodeLocations } : null;
}

function buildSegmentIndex(segments: Segment[]): Map<string, number[]> | null {
  const cells = new Map<string, number[]>();
  const latitudePadding = maxSnapMeters / 111_320;
  for (const segment of segments) {
    const latitude = (segment.a.latitude + segment.b.latitude) / 2;
    const longitudePadding = maxSnapMeters / Math.max(1_000, 111_320 * Math.abs(Math.cos(latitude * Math.PI / 180)));
    const minLat = Math.floor((Math.min(segment.a.latitude, segment.b.latitude) - latitudePadding) / cellDegrees);
    const maxLat = Math.floor((Math.max(segment.a.latitude, segment.b.latitude) + latitudePadding) / cellDegrees);
    const minLon = Math.floor((Math.min(segment.a.longitude, segment.b.longitude) - longitudePadding) / cellDegrees);
    const maxLon = Math.floor((Math.max(segment.a.longitude, segment.b.longitude) + longitudePadding) / cellDegrees);
    if ((maxLat - minLat + 1) * (maxLon - minLon + 1) > 2_500) continue;
    for (let lat = minLat; lat <= maxLat; lat++) {
      for (let lon = minLon; lon <= maxLon; lon++) {
        const key = `${lat}:${lon}`;
        const items = cells.get(key) ?? [];
        items.push(segment.index);
        cells.set(key, items);
      }
    }
  }
  return cells.size ? cells : null;
}

function nearestProjection(point: Point, segments: Segment[], index: Map<string, number[]>): Projection | null {
  let best: Projection | null = null;
  const choices = index.get(cellKey(point.latitude, point.longitude)) ?? [];
  for (const segmentIndex of choices) {
    const segment = segments[segmentIndex];
    if (!segment) continue;
    const projection = projectToSegment(point, segment.a, segment.b);
    if (projection.gap > maxSnapMeters) continue;
    if (!best || projection.gap < best.gap - 0.001
      || (Math.abs(projection.gap - best.gap) <= 0.001 && segment.edge.id.localeCompare(best.segment.edge.id) < 0)) {
      best = { segment, ...projection };
    }
  }
  return best;
}

class MinQueue {
  private values: SearchValue[] = [];

  push(value: SearchValue): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent]!, value) <= 0) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): SearchValue | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.compare(this.values[right]!, this.values[left]!) < 0 ? right : left;
      if (this.compare(this.values[child]!, last) >= 0) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }

  private compare(a: SearchValue, b: SearchValue): number {
    return a.priority - b.priority || a.id.localeCompare(b.id);
  }
}

function addNeighbor(adjacency: Map<string, Neighbor[]>, from: string, to: string, meters: number): void {
  if (from === to || !Number.isFinite(meters) || meters < 0) return;
  adjacency.get(from)?.push({ id: to, meters });
  adjacency.get(to)?.push({ id: from, meters });
}

function searchPaths(
  adjacency: Map<string, Neighbor[]>,
  locations: Map<string, Point>,
  startId: string,
  targetIds: string[],
): { distances: Map<string, number>; previous: Map<string, string>; settled: Set<string> } {
  const targetPoints = targetIds.map(id => locations.get(id)).filter((point): point is Point => Boolean(point));
  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const settled = new Set<string>();
  const found = new Set<string>();
  const heuristic = (point: Point) => targetPoints.length
    ? Math.min(...targetPoints.map(target => distanceMeters(point, target))) : 0;
  const queue = new MinQueue();
  queue.push({ id: startId, distance: 0, priority: heuristic(locations.get(startId)!) });
  while (true) {
    const current = queue.pop();
    if (!current) break;
    if (settled.has(current.id) || current.distance !== distances.get(current.id)) continue;
    settled.add(current.id);
    if (targetIds.includes(current.id)) {
      found.add(current.id);
      if (found.size === targetIds.length) break;
    }
    for (const neighbor of adjacency.get(current.id) ?? []) {
      const next = current.distance + neighbor.meters;
      if (next >= (distances.get(neighbor.id) ?? Infinity)) continue;
      distances.set(neighbor.id, next);
      previous.set(neighbor.id, current.id);
      queue.push({ id: neighbor.id, distance: next, priority: next + heuristic(locations.get(neighbor.id)! ) });
    }
  }
  return { distances, previous, settled };
}

function compactPoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || distanceMeters(point, points[index - 1]!) > 0.01);
}

/** Finds deterministic, bidirectional street paths; OSM node IDs alone define junctions. */
export function estimateStreetRoutes(
  graph: RoadGraph,
  start: Point,
  targets: RouteTarget[],
  failures = new Map<string, StreetRouteFailure>(),
): Map<string, StreetRoute | null> {
  const result = new Map<string, StreetRoute | null>(targets.map(target => [target.id, null]));
  if (!targets.length) return result;
  for (const target of targets) {
    if (!validPoint(target.location) || !isPointInRoadCoverage(graph, target.location)) {
      failures.set(target.id, 'OSM_FORA_DA_COBERTURA');
    }
  }
  if (!validPoint(start) || !isPointInRoadCoverage(graph, start)) {
    for (const target of targets) failures.set(target.id, 'OSM_FORA_DA_COBERTURA');
    return result;
  }
  const built = buildSegments(graph);
  if (!built) {
    for (const target of targets) if (!failures.has(target.id)) failures.set(target.id, 'OSM_SEM_CAMINHO_CONTINUO');
    return result;
  }
  const { segments, nodeLocations } = built;
  const spatialIndex = buildSegmentIndex(segments);
  if (!spatialIndex) return result;

  const allQueries = [{ id: 'query:start', location: start, projection: nearestProjection(start, segments, spatialIndex) },
    ...targets.map((target, index) => ({
      id: `query:target:${index}`, location: target.location,
      projection: isPointInRoadCoverage(graph, target.location) ? nearestProjection(target.location, segments, spatialIndex) : null,
    }))];
  const startQuery = allQueries[0]!;
  if (!startQuery.projection) {
    for (const target of targets) if (!failures.has(target.id)) failures.set(target.id, 'OSM_ENCAIXE_FORA_DA_VIA');
    return result;
  }
  for (const [index, query] of allQueries.slice(1).entries()) {
    const target = targets[index]!;
    if (!query.projection && !failures.has(target.id)) failures.set(target.id, 'OSM_ENCAIXE_FORA_DA_VIA');
  }
  const snappedTargets = allQueries.slice(1).filter(query => query.projection);
  if (!snappedTargets.length) return result;

  const adjacency = new Map<string, Neighbor[]>([...nodeLocations.keys()].map(id => [id, []]));
  for (const segment of segments) addNeighbor(adjacency, segment.edge.from, segment.edge.to, segment.meters);
  const locations = new Map(nodeLocations);
  const projectionNodes = new Map<string, { query: typeof startQuery; nodeId: string }>();
  for (const query of [startQuery, ...snappedTargets]) {
    const projection = query.projection!;
    const nodeId = `${query.id}:projection`;
    locations.set(query.id, query.location);
    locations.set(nodeId, projection.point);
    adjacency.set(query.id, []);
    adjacency.set(nodeId, []);
    addNeighbor(adjacency, query.id, nodeId, projection.gap);
    addNeighbor(adjacency, nodeId, projection.segment.edge.from, projection.t * projection.segment.meters);
    addNeighbor(adjacency, nodeId, projection.segment.edge.to, (1 - projection.t) * projection.segment.meters);
    projectionNodes.set(query.id, { query, nodeId });
  }
  const projectionsByEdge = new Map<string, { t: number; nodeId: string; meters: number }[]>();
  for (const { query, nodeId } of projectionNodes.values()) {
    const projection = query.projection!;
    const group = projectionsByEdge.get(projection.segment.edge.id) ?? [];
    group.push({ t: projection.t, nodeId, meters: projection.segment.meters });
    projectionsByEdge.set(projection.segment.edge.id, group);
  }
  for (const projections of projectionsByEdge.values()) {
    projections.sort((a, b) => a.t - b.t || a.nodeId.localeCompare(b.nodeId));
    for (let index = 1; index < projections.length; index++) {
      const before = projections[index - 1]!;
      const after = projections[index]!;
      addNeighbor(adjacency, before.nodeId, after.nodeId, (after.t - before.t) * before.meters);
    }
  }

  const snappedTargetIds = targets.flatMap((_, index) => allQueries[index + 1]!.projection ? [allQueries[index + 1]!.id] : []);
  const paths = searchPaths(adjacency, locations, startQuery.id, snappedTargetIds);
  for (let index = 0; index < targets.length; index++) {
    const query = allQueries[index + 1]!;
    const projection = query.projection;
    if (!projection) continue;
    const targetId = query.id;
    const target = targets[index]!;
    const meters = paths.distances.get(targetId);
    if (meters === undefined || !paths.settled.has(targetId)) {
      failures.set(target.id, 'OSM_SEM_CAMINHO_CONTINUO');
      continue;
    }
    const pathIds: string[] = [targetId];
    let cursor = targetId;
    while (cursor !== startQuery.id) {
      const previous = paths.previous.get(cursor);
      if (!previous) { pathIds.length = 0; break; }
      cursor = previous;
      pathIds.push(cursor);
    }
    if (!pathIds.length) continue;
    const points = compactPoints(pathIds.reverse().map(id => locations.get(id)!).filter(Boolean));
    result.set(target.id, {
      points,
      streetMeters: Math.max(0, meters - startQuery.projection!.gap - projection.gap),
      installAccessMeters: startQuery.projection!.gap,
      ctoAccessMeters: projection.gap,
    });
  }
  return result;
}
