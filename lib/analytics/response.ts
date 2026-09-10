import type {
  AttendanceSummary,
  CancellationSummary,
  GeneralSummary,
} from './metrics';

export type AnalyticsStatus = 'success' | 'partial' | 'failed' | 'unavailable';

export interface AnalyticsOverviewData {
  geral: GeneralSummary;
  atendimento: AttendanceSummary;
  cancelamentos: CancellationSummary;
}

export interface AnalyticsOverviewMeta {
  from: string | null;
  to: string | null;
  lastUpdatedAt: string | null;
  status: AnalyticsStatus;
  coverage: number;
}

export interface AnalyticsOverviewResponse {
  success: true;
  data: AnalyticsOverviewData;
  meta: AnalyticsOverviewMeta;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function safeDimensionList(value: unknown): Array<{ key: string; count: number }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { key?: unknown; count?: unknown };
    return typeof candidate.key === 'string'
      ? [{ key: candidate.key, count: nonNegativeInteger(candidate.count) }]
      : [];
  });
}

function serializeGeneralSummary(value: unknown): GeneralSummary {
  const candidate = value && typeof value === 'object' ? value as Partial<GeneralSummary> : {};
  return {
    leads: nonNegativeInteger(candidate.leads),
    sales: nonNegativeInteger(candidate.sales),
    contracts: nonNegativeInteger(candidate.contracts),
    preContracts: nonNegativeInteger(candidate.preContracts),
  };
}

function serializeAttendanceSummary(value: unknown): AttendanceSummary {
  const candidate = value && typeof value === 'object' ? value as Partial<AttendanceSummary> : {};
  return {
    total: nonNegativeInteger(candidate.total),
    linked: nonNegativeInteger(candidate.linked),
    unlinked: nonNegativeInteger(candidate.unlinked),
    ambiguous: nonNegativeInteger(candidate.ambiguous),
    notApplicable: nonNegativeInteger(candidate.notApplicable),
    protocolConflicts: nonNegativeInteger(candidate.protocolConflicts),
    byChannel: safeDimensionList(candidate.byChannel),
    byStatus: safeDimensionList(candidate.byStatus),
  };
}

function serializeCancellationSummary(value: unknown): CancellationSummary {
  const candidate = value && typeof value === 'object' ? value as Partial<CancellationSummary> : {};
  return {
    total: nonNegativeInteger(candidate.total),
    byReason: safeDimensionList(candidate.byReason),
    renewals: nonNegativeInteger(candidate.renewals),
    upgrades: nonNegativeInteger(candidate.upgrades),
    downgrades: nonNegativeInteger(candidate.downgrades),
  };
}

function serializeMeta(value: unknown): AnalyticsOverviewMeta {
  const candidate = value && typeof value === 'object' ? value as Partial<AnalyticsOverviewMeta> : {};
  const status: AnalyticsStatus = candidate.status === 'success'
    || candidate.status === 'partial'
    || candidate.status === 'failed'
    || candidate.status === 'unavailable'
    ? candidate.status
    : 'unavailable';
  const coverage = typeof candidate.coverage === 'number' && Number.isFinite(candidate.coverage)
    ? Math.min(1, Math.max(0, candidate.coverage))
    : 0;

  return {
    from: safeString(candidate.from),
    to: safeString(candidate.to),
    lastUpdatedAt: safeString(candidate.lastUpdatedAt),
    status,
    coverage,
  };
}

/**
 * Rebuilds the public response from an explicit allow-list. Provider errors,
 * raw payloads and accidental properties do not cross the API boundary.
 */
export function serializeAnalyticsOverview(input: AnalyticsOverviewResponse): AnalyticsOverviewResponse {
  return {
    success: true,
    data: {
      geral: serializeGeneralSummary(input?.data?.geral),
      atendimento: serializeAttendanceSummary(input?.data?.atendimento),
      cancelamentos: serializeCancellationSummary(input?.data?.cancelamentos),
    },
    meta: serializeMeta(input?.meta),
  };
}
