import { canonicalKey } from './domain/normalize';
import { matchCto } from './domain/match';
import type { FiberNetwork } from './domain/network-path';
import type { IxcCto, Region, SheetCto, SheetMatchEvidence, Snapshot } from './domain/types';

export type RegionDiagnosticsInput = {
  ixc: Snapshot<IxcCto>;
  sheets: Snapshot<SheetCto>;
  network: FiberNetwork | null;
};

export type RegionDiagnostics = {
  sources: {
    ixc: { complete: boolean; records: number; active: number; missingCoordinates: number; fetchedAt: string; issues: string[] };
    sheets: { complete: boolean; records: number; fetchedAt: string; issues: string[] };
  };
  sheet: {
    rows: number; recognizedCodes: number; ambiguousCodes: number; rowsInAmbiguousCodes: number;
    unrecognizedRows: number; missingCoordinates: number; missingVacancies: number; missingCapacity: number;
    aboveCapacity: number; noVacancies: number;
    ambiguousExamples: { code: string; rows: SheetMatchEvidence[] }[];
  };
  matching: { unique: number; ambiguous: number; missing: number; unrecognized: number };
  fiberDocs: {
    complete: boolean; poles: number; cableCount: number; cablesWithGeometry: number;
    missingCableCount: number; missingCables: { id: string; name: string }[]; issues: string[]; fetchedAt: string | null;
  };
};

export type ViabilityDiagnostics = { checkedAt: string; regions: Record<Region, RegionDiagnostics> };

function summarizeRegion(input: RegionDiagnosticsInput): RegionDiagnostics {
  const { ixc, sheets, network } = input;
  const groups = new Map<string, SheetCto[]>();
  let unrecognizedRows = 0;
  for (const row of sheets.rows) {
    const key = canonicalKey(row.region, row.originalName);
    if (!key) { unrecognizedRows++; continue; }
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const ambiguousGroups = [...groups.values()].filter(rows => rows.length > 1);
  const matching = { unique: 0, ambiguous: 0, missing: 0, unrecognized: 0 };
  for (const cto of ixc.rows.filter(row => row.active)) {
    const result = matchCto(cto, sheets.rows);
    if (result.row) matching.unique++;
    else if (result.reasons.includes('CTO_AMBIGUA')) matching.ambiguous++;
    else if (result.reasons.includes('CTO_AUSENTE_NA_PLANILHA')) matching.missing++;
    else matching.unrecognized++;
  }
  const networkDiagnostics = network?.diagnostics;
  const missingCableCount = network ? Math.max(0, network.cableCount - network.cables.length) : 0;
  const ambiguousExamples = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(([a], [b]) => Number(a.split(':')[1]) - Number(b.split(':')[1]) || a.localeCompare(b))
    .slice(0, 10)
    .map(([key, rows]) => ({
      code: 'N-' + key.split(':')[1],
      rows: rows.map((row): SheetMatchEvidence => ({
        originalName: row.originalName, sheet: row.sheet, row: row.row, olt: row.olt ?? null,
        pon: row.pon ?? null, available: row.available, capacity: row.capacity, updatedOn: row.updatedOn
      }))
    }));
  return {
    sources: {
      ixc: {
        complete: ixc.complete, records: ixc.rows.length, active: ixc.rows.filter(row => row.active).length,
        missingCoordinates: ixc.rows.filter(row => row.active && !row.location).length,
        fetchedAt: ixc.fetchedAt, issues: [...ixc.issues]
      },
      sheets: { complete: sheets.complete, records: sheets.rows.length, fetchedAt: sheets.fetchedAt, issues: [...sheets.issues] }
    },
    sheet: {
      rows: sheets.rows.length, recognizedCodes: groups.size, ambiguousCodes: ambiguousGroups.length,
      rowsInAmbiguousCodes: ambiguousGroups.reduce((sum, rows) => sum + rows.length, 0),
      unrecognizedRows,
      missingCoordinates: sheets.rows.filter(row => !row.location).length,
      missingVacancies: sheets.rows.filter(row => row.available === null).length,
      missingCapacity: sheets.rows.filter(row => row.capacity === null).length,
      aboveCapacity: sheets.rows.filter(row => row.available !== null && row.capacity !== null && row.available > row.capacity).length,
      noVacancies: sheets.rows.filter(row => row.available === 0).length,
      ambiguousExamples
    },
    matching,
    fiberDocs: {
      complete: network?.complete ?? false,
      poles: network?.poles.length ?? 0,
      cableCount: network?.cableCount ?? 0,
      cablesWithGeometry: network?.cables.length ?? 0,
      missingCableCount,
      missingCables: (networkDiagnostics?.missingCables ?? []).slice(0, 100).map(cable => ({ id: cable.id, name: cable.name })),
      issues: network ? [...network.issues] : ['FIBERDOCS_LEITURA_INDISPONIVEL'],
      fetchedAt: network?.fetchedAt ?? null
    }
  };
}

export function buildViabilityDiagnostics(regions: Record<Region, RegionDiagnosticsInput>, checkedAt = new Date()): ViabilityDiagnostics {
  return {
    checkedAt: checkedAt.toISOString(),
    regions: { AC: summarizeRegion(regions.AC), CP: summarizeRegion(regions.CP) }
  };
}
