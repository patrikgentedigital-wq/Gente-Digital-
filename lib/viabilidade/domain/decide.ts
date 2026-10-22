import { randomUUID } from 'node:crypto';
import { distanceMeters } from './distance';
import { matchCto } from './match';
import { canonicalKey } from './normalize';
import type { Candidate, Decision, IxcCto, Policy, Request, RouteEvidence, RouteEstimate, Snapshot, Status } from './types';

export function decide(
  request: Request,
  ixc: Snapshot<IxcCto>,
  sheets: Snapshot<import('./types').SheetCto>,
  routes: RouteEvidence[],
  policy: Policy,
  now: Date,
  routeEstimates: RouteEstimate[] = [],
  routeIssue?: string,
  routeIssues: Record<string, string> = {},
  roadGraphMetadata?: { graphVersion: string; snapshotAt: string }
): Decision {
  const reasons: string[] = [];
  if (!ixc.complete) reasons.push('FONTE_IXC_INCOMPLETA');
  if (!sheets.complete) reasons.push('FONTE_PLANILHA_INCOMPLETA');
  if (ixc.origin !== sheets.origin) reasons.push('ORIGEM_DAS_FONTES_DIVERGENTE');
  const currentSnapshot=policy.freshnessMode==='CURRENT_SNAPSHOT';
  if (policy.maxUpdateAgeDays === null && !currentSnapshot) reasons.push('REGRA_VALIDADE_NAO_CONFIGURADA');
  if (!policy.regionalCoverageConfirmed) reasons.push('COBERTURA_REGIONAL_NAO_CONFIRMADA');
  const sourceReady = ixc.complete && sheets.complete && ixc.origin === sheets.origin
    && (policy.maxUpdateAgeDays !== null || currentSnapshot) && policy.regionalCoverageConfirmed;

  const ctos = ixc.rows.filter((cto) => cto.region === request.region && cto.active);
  const candidates = ctos.map((cto): Candidate => {
    const geographicMeters = cto.location ? distanceMeters(request.location, cto.location) : null;
    const candidate: Candidate = {
      ctoId: cto.id, key: null, status: 'ANALISE_TECNICA', geographicMeters,
      routeMeters: null, routeSource: null, routeComponents: null, available: null, ixcCapacity: cto.capacity,
      sheetCapacity: null, updatedOn: null, sheetCtoName: null, sheet: null, row: null, sheetMatches: [], reasons: []
    };
    if (geographicMeters === null) {
      candidate.reasons.push('COORDENADA_IXC_AUSENTE');
      return candidate;
    }
    if (geographicMeters > policy.maxDistanceMeters) {
      candidate.status = 'INVIAVEL';
      candidate.reasons.push('CTO_FORA_DO_LIMITE');
      return candidate;
    }
    const matchingRoutes = routes.filter((evidence) => evidence.ctoId === cto.id
      && evidence.location.latitude === request.location.latitude
      && evidence.location.longitude === request.location.longitude
      && Number.isFinite(evidence.meters) && evidence.meters >= 0
      && Number.isFinite(Date.parse(evidence.confirmedAt)) && Boolean(evidence.reference.trim()));
    const matchingEstimates = routeEstimates.filter((estimate) => estimate.ctoId === cto.id
      && estimate.location.latitude === request.location.latitude
      && estimate.location.longitude === request.location.longitude
      && Number.isFinite(estimate.meters) && estimate.meters >= 0);
    if (matchingRoutes.length === 1) {
      candidate.routeMeters = matchingRoutes[0]!.meters;
      candidate.routeSource = 'CONFIRMED';
    } else if (matchingRoutes.length === 0) {
      const fiberDocsEstimates = matchingEstimates.filter(estimate => (estimate.source ?? 'FIBERDOCS_ESTIMATE') === 'FIBERDOCS_ESTIMATE');
      const osmEstimates = matchingEstimates.filter(estimate => estimate.source === 'OSM_ESTIMATE');
      const selectedEstimate = fiberDocsEstimates.length === 1 ? fiberDocsEstimates[0]
        : fiberDocsEstimates.length === 0 && osmEstimates.length === 1 ? osmEstimates[0] : null;
      if (selectedEstimate) {
        candidate.routeMeters = selectedEstimate.meters;
        candidate.routeSource = selectedEstimate.source ?? 'FIBERDOCS_ESTIMATE';
        candidate.routeComponents = selectedEstimate.components ?? null;
        candidate.reasons.push(candidate.routeSource === 'OSM_ESTIMATE' ? 'TRAJETO_ESTIMADO_OSM' : 'TRAJETO_ESTIMADO_FIBERDOCS');
      }
    }
    if (candidate.routeMeters === null) candidate.reasons.push(routeIssues[cto.id] ?? routeIssue ?? 'TRAJETO_NAO_CONFIRMADO');
    else if (candidate.routeMeters > policy.maxDistanceMeters) {
      candidate.reasons.push(candidate.routeSource === 'OSM_ESTIMATE' ? 'OSM_ESTIMATIVA_ACIMA_DO_LIMITE' : 'TRAJETO_FORA_DO_LIMITE');
    }

    const matched = matchCto(cto, sheets.rows.filter((row) => row.region === request.region));
    candidate.sheetMatches = matched.rows.map(row => ({
      originalName: row.originalName, sheet: row.sheet, row: row.row, olt: row.olt ?? null, pon: row.pon ?? null,
      available: row.available, capacity: row.capacity, updatedOn: row.updatedOn
    }));
    if (!matched.row) {
      candidate.reasons.unshift(...matched.reasons);
      return candidate;
    }
    const row = matched.row;
    candidate.key = canonicalKey(request.region, row.originalName);
    candidate.available = row.available;
    candidate.sheetCapacity = row.capacity;
    candidate.updatedOn = row.updatedOn;
    candidate.sheetCtoName = row.originalName;
    candidate.sheet = row.sheet;
    candidate.row = row.row;
    candidate.reasons.push(...matched.reasons, ...row.issues);

    if (!sourceReady) {
      candidate.reasons.push(...reasons);
      return candidate;
    }

    if (row.available === null) candidate.reasons.push('VAGAS_NAO_CONFIRMADAS');
    else if (row.available === 0) candidate.reasons.push('SEM_VAGAS');
    const capacity = row.capacity ?? cto.capacity;
    if (row.capacity !== null && cto.capacity !== null && row.capacity !== cto.capacity) {
      candidate.reasons.push('CAPACIDADE_DIVERGENTE');
    } else if (row.available !== null && capacity !== null && row.available > capacity) {
      candidate.reasons.push('VAGAS_ACIMA_DA_CAPACIDADE');
    }
    if (!currentSnapshot && !row.updatedOn) candidate.reasons.push('DATA_ATUALIZACAO_AUSENTE');
    else if (!currentSnapshot && row.updatedOn! > now.toISOString().slice(0, 10)) candidate.reasons.push('DATA_ATUALIZACAO_FUTURA');
    else if (!currentSnapshot && policy.maxUpdateAgeDays !== null) {
      const today = now.toISOString().slice(0, 10);
      const ageDays = (Date.parse(today + 'T00:00:00.000Z') - Date.parse(row.updatedOn + 'T00:00:00.000Z')) / 86_400_000;
      if (ageDays > policy.maxUpdateAgeDays) candidate.reasons.push('DADOS_DESATUALIZADOS');
    }
    if (candidate.reasons.some((reason) => reason.startsWith('RESTRICAO_') || reason === 'OBSERVACAO_PENDENTE_REVISAO')) {
      candidate.reasons.push('RESTRICAO_PENDENTE_REVISAO');
    }

    const blocking = new Set([
      'CTO_AMBIGUA', 'CTO_AUSENTE_NA_PLANILHA', 'CTO_NAO_RECONHECIDA', 'COORDENADAS_DIVERGENTES',
      'ESQUEMA_PLANILHA_ALTERADO', 'VAGAS_NAO_CONFIRMADAS', 'CAPACIDADE_DIVERGENTE',
      'VAGAS_ACIMA_DA_CAPACIDADE', 'DATA_ATUALIZACAO_INVALIDA', 'DATA_ATUALIZACAO_AUSENTE',
      'DATA_ATUALIZACAO_FUTURA', 'DADOS_DESATUALIZADOS', 'RESTRICAO_PENDENTE_REVISAO'
    ]);
    if(currentSnapshot)blocking.delete('DATA_ATUALIZACAO_INVALIDA');
    if (candidate.reasons.some((reason) => blocking.has(reason))) return candidate;
    if (row.available === 0) {
      candidate.status = 'INVIAVEL';
      return candidate;
    }

    if (candidate.routeMeters === null || matchingRoutes.length > 1
      || (matchingRoutes.length === 0 && matchingEstimates.length > 1)) return candidate;
    // Uma estimativa baseada apenas em vias do OSM não comprova fibra instalada,
    // ocupação nem autorização para passagem, portanto exige revisão técnica.
    if (candidate.routeSource === 'OSM_ESTIMATE') return candidate;
    if (candidate.routeMeters > policy.maxDistanceMeters) {
      candidate.status = 'INVIAVEL';
      return candidate;
    }
    if (row.available !== null) candidate.status = 'VIAVEL';
    return candidate;
  });

  const cannotApprove = reasons.length > 0;
  let status: Status;
  let recommendedCtoId: string | null = null;
  const viable = candidates.filter((candidate) => candidate.status === 'VIAVEL');
  if (viable.length && !cannotApprove) {
    viable.sort((a, b) => a.routeMeters! - b.routeMeters! || b.available! - a.available! || a.ctoId.localeCompare(b.ctoId));
    recommendedCtoId = viable[0]!.ctoId;
    status = 'VIAVEL';
  } else if (candidates.some((candidate) => candidate.status === 'ANALISE_TECNICA')) {
    status = 'ANALISE_TECNICA';
    reasons.push('CANDIDATA_COM_DADOS_INSUFICIENTES');
  } else if (policy.regionalCoverageConfirmed && ixc.complete && sheets.complete
    && ixc.origin === sheets.origin && reasons.length === 0) {
    status = 'INVIAVEL';
    if (!candidates.length) reasons.push('SEM_CTO_ATIVA_NA_REGIAO');
    else if (candidates.every((candidate) => candidate.reasons.includes('CTO_FORA_DO_LIMITE'))) reasons.push('SEM_CTO_ELEGIVEL');
    else if (candidates.every((candidate) => candidate.reasons.includes('SEM_VAGAS'))) reasons.push('SEM_VAGAS_NA_REGIAO');
    else reasons.push('SEM_CTO_ELEGIVEL');
  } else {
    status = 'ANALISE_TECNICA';
  }

  return {
    region: request.region,
    id: randomUUID(), evaluatedAt: now.toISOString(), origin: ixc.origin === sheets.origin ? ixc.origin : 'DEMO',
    status, recommendedCtoId, candidates, reasons: [...new Set(reasons)], policyVersion: policy.version,
    sources: {
      ixcFetchedAt: ixc.fetchedAt, sheetsFetchedAt: sheets.fetchedAt,
      ...(roadGraphMetadata && candidates.some(candidate => candidate.routeSource === 'OSM_ESTIMATE')
        ? { roadGraphVersion: roadGraphMetadata.graphVersion, roadGraphUpdatedAt: roadGraphMetadata.snapshotAt } : {})
    }
  };
}
