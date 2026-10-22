import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Region } from './domain/types';
import type { RoadGraph, RoadGraphEdge, RoadGraphNode } from './domain/road-route';

const cache = new Map<Region, Promise<RoadGraph | null>>();
const maxCompressedBytes = 80 * 1024 * 1024;
const maxUncompressedBytes = 250 * 1024 * 1024;
const maxNodes = 200_000;
const maxEdges = 400_000;

function validGraph(value: unknown, region: Region): value is RoadGraph {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const graph = value as Partial<RoadGraph>;
  if (graph.schemaVersion !== 1 || graph.region !== region || typeof graph.graphVersion !== 'string'
    || !/^[a-f0-9]{20}$/.test(graph.graphVersion) || typeof graph.snapshotAt !== 'string'
    || !Number.isFinite(Date.parse(graph.snapshotAt)) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
    || graph.nodes.length === 0 || graph.nodes.length > maxNodes || graph.edges.length === 0 || graph.edges.length > maxEdges
    || !graph.coverage || !['Polygon', 'MultiPolygon'].includes(graph.coverage.type)) return false;
  if (graph.nodes.some((node: RoadGraphNode) => !node || typeof node.id !== 'string'
    || !Number.isFinite(node.location?.latitude) || !Number.isFinite(node.location?.longitude)
    || Math.abs(node.location.latitude) > 90 || Math.abs(node.location.longitude) > 180)) return false;
  if (graph.edges.some((edge: RoadGraphEdge) => !edge || typeof edge.id !== 'string' || typeof edge.wayId !== 'string'
    || typeof edge.from !== 'string' || typeof edge.to !== 'string' || edge.from === edge.to
    || !Number.isFinite(edge.meters) || (edge.meters ?? 0) <= 0)) return false;
  return true;
}

async function readRoadGraph(region: Region): Promise<RoadGraph | null> {
  try {
    const compressed = await readFile(resolve(process.cwd(), 'data/viabilidade/osm/graphs', `${region.toLowerCase()}.json.gz`));
    if (compressed.byteLength === 0 || compressed.byteLength > maxCompressedBytes) return null;
    const json = gunzipSync(compressed, { maxOutputLength: maxUncompressedBytes }).toString('utf8');
    const value: unknown = JSON.parse(json);
    return validGraph(value, region) ? value : null;
  } catch {
    return null;
  }
}

/** Loads only the packaged regional snapshot; evaluation never calls a public router. */
export function loadRoadGraph(region: Region): Promise<RoadGraph | null> {
  const existing = cache.get(region);
  if (existing) return existing;
  const pending = readRoadGraph(region);
  cache.set(region, pending);
  return pending;
}
