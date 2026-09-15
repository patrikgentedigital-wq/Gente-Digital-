import type {
  AttendanceSummary,
  CancellationSummary,
  GeneralSummary,
} from './metrics';

export type AnalyticsStatus = 'success' | 'partial' | 'failed' | 'unavailable';

export interface AnalyticsSectionStatuses {
  geral: AnalyticsStatus;
  atendimento: AnalyticsStatus;
  cancelamentos: AnalyticsStatus;
}

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
  sections: AnalyticsSectionStatuses;
}

export interface AnalyticsOverviewResponse {
  success: true;
  data: AnalyticsOverviewData;
  meta: AnalyticsOverviewMeta;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeInteger(value);
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
    leads: nonNegativeIntegerOrNull(candidate.leads),
    sales: nonNegativeIntegerOrNull(candidate.sales),
    contracts: nonNegativeIntegerOrNull(candidate.contracts),
    preContracts: nonNegativeIntegerOrNull(candidate.preContracts),
  };
}

function serializeAttendanceSummary(value: unknown): AttendanceSummary {
  const candidate = value && typeof value === 'object' ? value as Partial<AttendanceSummary> : {};
  return {
    total: nonNegativeIntegerOrNull(candidate.total),
    linked: nonNegativeIntegerOrNull(candidate.linked),
    unlinked: nonNegativeIntegerOrNull(candidate.unlinked),
    ambiguous: nonNegativeIntegerOrNull(candidate.ambiguous),
    notApplicable: nonNegativeIntegerOrNull(candidate.notApplicable),
    protocolConflicts: nonNegativeIntegerOrNull(candidate.protocolConflicts),
    linkMetricsAvailable: candidate.linkMetricsAvailable === true,
    byChannel: safeDimensionList(candidate.byChannel),
    byStatus: safeDimensionList(candidate.byStatus),
  };
}

function serializeCancellationSummary(value: unknown): CancellationSummary {
  const candidate = value && typeof value === 'object' ? value as Partial<CancellationSummary> : {};
  return {
    total: nonNegativeIntegerOrNull(candidate.total),
    byReason: safeDimensionList(candidate.byReason),
    renewals: nonNegativeIntegerOrNull(candidate.renewals),
    upgrades: nonNegativeIntegerOrNull(candidate.upgrades),
    downgrades: nonNegativeIntegerOrNull(candidate.downgrades),
  };
}

function serializeStatus(value: unknown): AnalyticsStatus {
  return value === 'success'
    || value === 'partial'
    || value === 'failed'
    || value === 'unavailable'
    ? value
    : 'unavailable';
}

function serializeSectionStatuses(value: unknown): AnalyticsSectionStatuses {
  const candidate = value && typeof value === 'object'
    ? value as Partial<AnalyticsSectionStatuses>
    : {};
  return {
    geral: serializeStatus(candidate.geral),
    atendimento: serializeStatus(candidate.atendimento),
    cancelamentos: serializeStatus(candidate.cancelamentos),
  };
}

function serializeMeta(value: unknown): AnalyticsOverviewMeta {
  const candidate = value && typeof value === 'object' ? value as Partial<AnalyticsOverviewMeta> : {};
  const status = serializeStatus(candidate.status);
  const coverage = typeof candidate.coverage === 'number' && Number.isFinite(candidate.coverage)
    ? Math.min(1, Math.max(0, candidate.coverage))
    : 0;

  return {
    from: safeString(candidate.from),
    to: safeString(candidate.to),
    lastUpdatedAt: safeString(candidate.lastUpdatedAt),
    status,
    coverage,
    sections: serializeSectionStatuses(candidate.sections),
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
