import { normalizeSourceTimestamp } from './normalizers';
import type {
  DateStampedMetricRecord,
  GeneralMetricInput,
  IxcCancellationRecord,
  OpaAttendanceRecord,
} from './types';

export interface MetricWindow {
  from: string | null;
  to: string | null;
  timezone: 'America/Sao_Paulo';
}

export interface AttendanceSummary {
  total: number;
  linked: number;
  unlinked: number;
  ambiguous: number;
  notApplicable: number;
  protocolConflicts: number;
  byChannel: Array<{ key: string; count: number }>;
  byStatus: Array<{ key: string; count: number }>;
}

export interface CancellationSummary {
  total: number;
  byReason: Array<{ key: string; count: number }>;
  renewals: number;
  upgrades: number;
  downgrades: number;
}

export interface GeneralSummary {
  leads: number;
  sales: number;
  contracts: number;
  preContracts: number;
}

function normalizeAnalyticsTimestamp(value: string | null, timezone: MetricWindow['timezone']): string | null {
  if (!value || timezone !== 'America/Sao_Paulo') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim())) return null;
  return normalizeSourceTimestamp(value);
}

function inWindow(value: string | null, window: MetricWindow): boolean {
  const normalized = normalizeAnalyticsTimestamp(value, window.timezone);
  const date = normalized ? Date.parse(normalized) : Number.NaN;
  if (Number.isNaN(date)) return false;
  const fromValue = normalizeAnalyticsTimestamp(window.from, window.timezone);
  const toValue = normalizeAnalyticsTimestamp(window.to, window.timezone);
  const from = fromValue ? Date.parse(fromValue) : null;
  const to = toValue ? Date.parse(toValue) : null;
  if (window.from && from === null || window.to && to === null) return false;
  return (from === null || date >= from) && (to === null || date <= to);
}

function grouped(values: readonly string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function uniqueBy<T>(records: readonly T[], key: (record: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const value = key(record);
    groups.set(value, [...(groups.get(value) ?? []), record]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) =>
    [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))[0]);
}

function attendanceDimensionKey(record: OpaAttendanceRecord): string {
  return JSON.stringify({
    canal: record.canal,
    status: record.status,
    status_vinculo: record.status_vinculo,
  });
}

function deduplicateAttendance(records: readonly OpaAttendanceRecord[]): {
  total: number;
  dimensional: OpaAttendanceRecord[];
  protocolConflicts: number;
} {
  const groups = new Map<string, OpaAttendanceRecord[]>();
  for (const record of records) {
    const key = record.protocolo?.trim()
      ? `protocol:${record.protocolo.trim()}`
      : `source:${record.source_id}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const dimensional: OpaAttendanceRecord[] = [];
  let protocolConflicts = 0;
  for (const [key, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const dimensions = new Set(group.map(attendanceDimensionKey));
    if (key.startsWith('protocol:') && dimensions.size > 1) {
      protocolConflicts += 1;
      continue;
    }
    dimensional.push(group[0]);
  }

  return { total: groups.size, dimensional, protocolConflicts };
}

export function summarizeAttendance(records: readonly OpaAttendanceRecord[], window: MetricWindow): AttendanceSummary {
  const filtered = records.filter((record) => inWindow(record.data_referencia, window));
  const { total, dimensional, protocolConflicts } = deduplicateAttendance(filtered);
  const linked = dimensional.filter((record) => record.status_vinculo === 'vinculado').length;
  const unlinked = dimensional.filter((record) => record.status_vinculo === 'nao_vinculado').length;
  return {
    total,
    linked,
    unlinked,
    ambiguous: dimensional.filter((record) => record.status_vinculo === 'ambiguo').length,
    notApplicable: dimensional.filter((record) => record.status_vinculo === 'nao_aplicavel').length,
    protocolConflicts,
    byChannel: grouped(dimensional.flatMap((record) => record.canal ? [record.canal] : [])),
    byStatus: grouped(dimensional.flatMap((record) => record.status ? [record.status] : [])),
  };
}

export function summarizeCancellations(records: readonly IxcCancellationRecord[], window: MetricWindow): CancellationSummary {
  const unique = uniqueBy(records.filter((record) => inWindow(record.data_referencia, window)), (record) => record.source_id);
  const cancellations = unique.filter((record) => record.tipo === 'cancelamento');
  return {
    total: cancellations.length,
    byReason: grouped(cancellations.flatMap((record) => record.motivo ? [record.motivo] : [])),
    renewals: unique.filter((record) => record.tipo === 'renovacao').length,
    upgrades: unique.filter((record) => record.tipo === 'upgrade').length,
    downgrades: unique.filter((record) => record.tipo === 'downgrade').length,
  };
}

function countMetrics(records: readonly DateStampedMetricRecord[], window: MetricWindow): number {
  return uniqueBy(records.filter((record) => inWindow(record.data_referencia, window)), (record) => record.source_id).length;
}

export function summarizeGeneral(input: GeneralMetricInput, window: MetricWindow): GeneralSummary {
  return {
    leads: countMetrics(input.leads, window),
    sales: countMetrics(input.sales, window),
    contracts: countMetrics(input.contracts, window),
    preContracts: countMetrics(input.preContracts, window),
  };
}
