import { decide } from './domain/decide';
import { distanceMeters } from './domain/distance';
import { estimateCablePaths, type FiberNetwork, type RouteEstimate as CableRoute } from './domain/network-path';
import { estimateStreetRoutes, isPointInRoadCoverage, type RoadGraph, type StreetRouteFailure } from './domain/road-route';
import type { Decision, IxcCto, Policy, Region, Request, RouteEvidence, RouteEstimate, RouteGeometry, SheetCto, Snapshot } from './domain/types';
import type { DataSources } from './adapters/ports';

function failedSnapshot<T>(origin: 'DEMO' | 'LIVE', issue: string, now: Date): Snapshot<T> {
  return { rows: [], fetchedAt: now.toISOString(), complete: false, origin, issues: [issue] };
}

export async function evaluate(
  request: Request,
  sources: DataSources,
  policy: Policy,
  routes: RouteEvidence[],
  now: Date,
  origin: 'DEMO' | 'LIVE',
  networkSource?: (region: Region) => Promise<FiberNetwork>,
  roadGraphSource?: (region: Region) => Promise<RoadGraph | null>
): Promise<{ decision: Decision; network: FiberNetwork | null; routeGeometries: RouteGeometry[] }> {
  const results = await Promise.allSettled([
    sources.loadIxc(request.region),
    sources.loadSheets(request.region),
    networkSource ? networkSource(request.region) : Promise.resolve(null),
    roadGraphSource ? roadGraphSource(request.region) : Promise.resolve(null),
  ]);
  const ixc: Snapshot<IxcCto> = results[0]!.status === 'fulfilled'
    ? results[0]!.value : failedSnapshot(origin, 'IXC_READ_FAILED', now);
  const sheets: Snapshot<SheetCto> = results[1]!.status === 'fulfilled'
    ? results[1]!.value : failedSnapshot(origin, 'PLANILHA_READ_FAILED', now);
  const network: FiberNetwork | null = results[2]!.status === 'fulfilled' ? results[2]!.value : null;
  const roadGraph = results[3]!.status === 'fulfilled' ? results[3]!.value : null;
  const targets = ixc.rows.filter(cto => cto.region === request.region && cto.active && cto.location
    && distanceMeters(request.location, cto.location) <= policy.maxDistanceMeters)
    .map(cto => ({ id: cto.id, location: cto.location! }));
  const estimates: RouteEstimate[] = [];
  const routeGeometries: RouteGeometry[] = [];
  const routeIssues: Record<string, string> = {};
  let routeIssue = 'OSM_GRAFO_INDISPONIVEL';
  let fiberDocsUsable = false;

  if (networkSource) {
    if (!network) routeIssue = 'FIBERDOCS_LEITURA_INDISPONIVEL';
    else if (!network.cables.length || !network.cableCount) routeIssue = 'FIBERDOCS_SEM_CABOS';
    else if ((!network.complete && !(network.issues.length > 0 && network.issues.every(issue => issue === 'POSTES_SEM_COORDENADA')))
      || network.cables.length !== network.cableCount
      || network.issues.some(issue => issue !== 'POSTES_SEM_COORDENADA')) routeIssue = 'FIBERDOCS_REDE_INCOMPLETA';
    else fiberDocsUsable = true;
  }

  const fiberPaths = fiberDocsUsable && network
    ? estimateCablePaths(network.cables, request.location, targets, network.poles)
    : new Map<string, CableRoute | null>();
  for (const target of targets) {
    const fiberPath = fiberPaths.get(target.id);
    if (fiberPath) {
      const components = routeComponents(
        Math.max(0, fiberPath.meters - fiberPath.startGap - fiberPath.endGap),
        fiberPath.startGap,
        fiberPath.endGap,
      );
      estimates.push({ ctoId: target.id, location: request.location, meters: components.totalMeters,
        source: 'FIBERDOCS_ESTIMATE', components });
      routeGeometries.push({ ctoId: target.id, source: 'FIBERDOCS_ESTIMATE', points: fiberPath.points });
    }
  }

  if (roadGraph && roadGraph.region === request.region) {
    const osmTargets = targets.filter(target => !estimates.some(estimate => estimate.ctoId === target.id));
    if (osmTargets.length) {
      if (!isPointInRoadCoverage(roadGraph, request.location)) {
        for (const target of osmTargets) routeIssues[target.id] = 'OSM_FORA_DA_COBERTURA';
      } else {
        const routeFailures = new Map<string, StreetRouteFailure>();
        const streetRoutes = estimateStreetRoutes(roadGraph, request.location, osmTargets, routeFailures);
        for (const target of osmTargets) {
          const path = streetRoutes.get(target.id);
          if (!path) {
            routeIssues[target.id] = routeFailures.get(target.id)
              ?? (isPointInRoadCoverage(roadGraph, target.location) ? 'OSM_SEM_CAMINHO_CONTINUO' : 'OSM_FORA_DA_COBERTURA');
            continue;
          }
          const components = routeComponents(path.streetMeters, path.installAccessMeters, path.ctoAccessMeters);
          estimates.push({ ctoId: target.id, location: request.location, meters: components.totalMeters,
            source: 'OSM_ESTIMATE', components });
          routeGeometries.push({ ctoId: target.id, source: 'OSM_ESTIMATE', points: path.points });
        }
      }
    }
  } else if (targets.some(target => !estimates.some(estimate => estimate.ctoId === target.id))) {
    routeIssue = 'OSM_GRAFO_INDISPONIVEL';
    for (const target of targets) {
      if (!estimates.some(estimate => estimate.ctoId === target.id)) routeIssues[target.id] = routeIssue;
    }
  }

  if (fiberDocsUsable) routeIssue = 'REDE_SEM_CAMINHO_CONTINUO';
  const decision = decide(request, ixc, sheets, routes, policy, now, estimates, routeIssue, routeIssues,
    roadGraph ? { graphVersion: roadGraph.graphVersion, snapshotAt: roadGraph.snapshotAt } : undefined);
  const selectedGeometries = routeGeometries.filter(geometry => {
    const candidate = decision.candidates.find(item => item.ctoId === geometry.ctoId);
    return candidate?.routeSource === geometry.source;
  });
  return { decision, network, routeGeometries: selectedGeometries };
}

function routeComponents(lineMeters: number, installAccessMeters: number, ctoAccessMeters: number) {
  const reserveMeters = 20;
  return {
    lineMeters,
    installAccessMeters,
    ctoAccessMeters,
    reserveMeters,
    totalMeters: lineMeters + installAccessMeters + ctoAccessMeters + reserveMeters,
  };
}

export function parseRequestBody(value: unknown): { request: Request | null; error: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { request: null, error: 'JSON_OBJECT_REQUIRED' };
  const body = value as Record<string, unknown>;
  const allowed = new Set(['region', 'latitude', 'longitude', 'address']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { request: null, error: 'UNKNOWN_FIELDS' };
  if (body.region !== 'AC' && body.region !== 'CP') return { request: null, error: 'REGION_REQUIRED' };
  if (typeof body.latitude !== 'number' || !Number.isFinite(body.latitude)
    || Math.abs(body.latitude) > 90
    || typeof body.longitude !== 'number' || !Number.isFinite(body.longitude)
    || Math.abs(body.longitude) > 180) return { request: null, error: 'VALID_COORDINATES_REQUIRED' };
  if (body.address !== undefined && (typeof body.address !== 'string' || body.address.length > 240)) {
    return { request: null, error: 'INVALID_ADDRESS' };
  }
  return {
    request: {
      region: body.region, location: { latitude: body.latitude, longitude: body.longitude },
      ...(typeof body.address === 'string' ? { address: body.address } : {})
    },
    error: null
  };
}
