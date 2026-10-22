import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buffer as turfBuffer } from '@turf/buffer';

const root = process.cwd();
const coveragePath = resolve(root, 'data/viabilidade/osm/coverage.json');
const outputDirectory = resolve(root, 'data/viabilidade/osm/graphs');
const bufferMeters = 500;
const generatorVersion = '1.0.0';
const overpassUrl = process.env.OVERPASS_API_URL?.trim() || 'https://overpass-api.de/api/interpreter';
const includedHighways = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street',
  'service', 'road', 'track',
];

function parseJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function coordinatePairs(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push(value);
    return output;
  }
  for (const child of value) coordinatePairs(child, output);
  return output;
}

function geometryOf(feature) {
  const geometry = feature?.geometry ?? feature;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
    throw new Error('OSM_COVERAGE_GEOMETRY_INVALID');
  }
  return geometry;
}

function combineCoverage(features) {
  const polygons = [];
  for (const feature of features) {
    const geometry = geometryOf(feature.feature);
    if (geometry.type === 'Polygon') polygons.push(geometry.coordinates);
    else polygons.push(...geometry.coordinates);
  }
  if (!polygons.length) throw new Error('OSM_COVERAGE_EMPTY');
  return { type: 'MultiPolygon', coordinates: polygons };
}

function bboxOf(geometry) {
  const pairs = coordinatePairs(geometry.coordinates);
  if (!pairs.length) throw new Error('OSM_COVERAGE_BBOX_EMPTY');
  return pairs.reduce((bbox, point) => [
    Math.min(bbox[0], point[0]), Math.min(bbox[1], point[1]),
    Math.max(bbox[2], point[0]), Math.max(bbox[3], point[1]),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
}

function pointInRing([longitude, latitude], ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLon, currentLat] = ring[current] ?? [];
    const [previousLon, previousLat] = ring[previous] ?? [];
    if (![currentLon, currentLat, previousLon, previousLat].every(Number.isFinite)) continue;
    if ((currentLat > latitude) !== (previousLat > latitude)
      && longitude < ((previousLon - currentLon) * (latitude - currentLat)) / (previousLat - currentLat) + currentLon) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon([longitude, latitude], rings) {
  const [outer, ...holes] = rings;
  return Boolean(outer && pointInRing([longitude, latitude], outer)
    && !holes.some(ring => pointInRing([longitude, latitude], ring)));
}

function pointInCoverage(point, coverage) {
  const polygon = coverage.type === 'Polygon' ? [coverage.coordinates] : coverage.coordinates;
  return polygon.some(rings => pointInPolygon(point, rings));
}

function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * rad;
  const longitudeDelta = (b.longitude - a.longitude) * rad;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function queryForBox([west, south, east, north]) {
  const classes = includedHighways.join('|');
  return `[out:json][timeout:240];\nway["highway"~"^(${classes})$"]["area"!="yes"](${south},${west},${north},${east});\nout body geom;`;
}

async function fetchOverpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(overpassUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'GenteDigital-ViabilidadeSnapshot/1.0 (+https://gentedigital.com.br)',
          accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(270_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`OVERPASS_HTTP_${response.status}: ${text.slice(0, 300)}`);
      const data = parseJson(text);
      if (!Array.isArray(data.elements) || !data.osm3s?.timestamp_osm_base) throw new Error('OVERPASS_RESPONSE_INVALID');
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolveTimeout => setTimeout(resolveTimeout, 1_500 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error('OVERPASS_UNAVAILABLE');
}

function graphFromWays(region, coverage, coverageFeatures, response) {
  const nodesById = new Map();
  const edges = [];
  const classes = new Set(includedHighways);
  const ways = response.elements.filter(element => element.type === 'way')
    .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  for (const way of ways) {
    const tags = way.tags ?? {};
    if (!classes.has(tags.highway) || tags.area === 'yes' || !Array.isArray(way.nodes) || !Array.isArray(way.geometry)
      || way.nodes.length !== way.geometry.length || way.nodes.length < 2) continue;
    const locations = way.geometry.map(point => ({ latitude: point.lat, longitude: point.lon }));
    if (locations.some(point => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) continue;
    for (let index = 0; index < way.nodes.length; index++) {
      if (index === 0) continue;
      const from = String(way.nodes[index - 1]);
      const to = String(way.nodes[index]);
      const fromLocation = locations[index - 1];
      const toLocation = locations[index];
      if (!pointInCoverage([fromLocation.longitude, fromLocation.latitude], coverage)
        || !pointInCoverage([toLocation.longitude, toLocation.latitude], coverage)) continue;
      const meters = haversineMeters(locations[index - 1], locations[index]);
      if (from === to || meters <= 0) continue;
      nodesById.set(from, fromLocation);
      nodesById.set(to, toLocation);
      edges.push({
        id: `${way.id}:${index - 1}`,
        wayId: String(way.id),
        from,
        to,
        meters: Math.round(meters * 1_000) / 1_000,
        highway: tags.highway,
        name: typeof tags.name === 'string' ? tags.name : null,
        access: typeof tags.access === 'string' ? tags.access : null,
      });
    }
  }
  if (!edges.length) throw new Error(`OSM_GRAPH_EMPTY_${region}`);
  const nodes = [...nodesById.entries()].map(([id, location]) => ({ id, location }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  edges.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const coverageSources = coverageFeatures.map(({ feature }) => ({
    osmType: feature.properties.osm_type,
    osmId: String(feature.properties.osm_id),
    name: feature.properties.name,
  }));
  const graphPayload = { region, coverage, nodes, edges };
  const graphVersion = createHash('sha256').update(JSON.stringify(graphPayload)).digest('hex').slice(0, 20);
  return {
    schemaVersion: 1,
    region,
    snapshotAt: response.osm3s.timestamp_osm_base,
    graphVersion,
    generatorVersion,
    coverageSource: 'OpenStreetMap contributors; regional administrative polygons buffered 500 m',
    coverageSources,
    coverage,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };
}

async function buildRegion(region, allFeatures) {
  const coverageFeatures = allFeatures.filter(item => item.region === region);
  if (!coverageFeatures.length) throw new Error(`OSM_COVERAGE_MISSING_${region}`);
  const bufferedFeatures = coverageFeatures.map(item => {
    const feature = item.feature;
    const buffered = turfBuffer(feature, bufferMeters, { units: 'meters' });
    if (!buffered) throw new Error(`OSM_COVERAGE_BUFFER_FAILED_${region}`);
    return buffered;
  });
  const coverage = combineCoverage(bufferedFeatures.map(feature => ({ region, feature })));
  const bbox = bboxOf(coverage);
  const response = await fetchOverpass(queryForBox(bbox));
  const graph = graphFromWays(region, coverage, coverageFeatures, response);
  const body = Buffer.from(JSON.stringify(graph));
  const compressed = gzipSync(body, { level: 9, mtime: 0 });
  const output = resolve(outputDirectory, `${region.toLowerCase()}.json.gz`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, compressed);
  return {
    region,
    graphVersion: graph.graphVersion,
    snapshotAt: graph.snapshotAt,
    nodes: graph.nodeCount,
    edges: graph.edgeCount,
    compressedBytes: compressed.byteLength,
    uncompressedBytes: body.byteLength,
    output,
  };
}

const coverageText = await readFile(coveragePath, 'utf8');
const coverageFile = parseJson(coverageText);
if (coverageFile.schemaVersion !== 1 || !Array.isArray(coverageFile.features) || coverageFile.bufferMeters !== bufferMeters) {
  throw new Error('OSM_COVERAGE_FILE_INVALID');
}
await mkdir(outputDirectory, { recursive: true });
const summaries = [];
for (const region of ['AC', 'CP']) summaries.push(await buildRegion(region, coverageFile.features));
process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
