import { parseFlexibleDate } from '../date-filters';
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

function inWindow(value: string | null, window: MetricWindow): boolean {
  const date = parseFlexibleDate(value);
  if (!date) return false;
  const from = window.from ? parseFlexibleDate(window.from) : null;
  const to = window.to ? parseFlexibleDate(window.to) : null;
  if (window.from && !from || window.to && !to) return false;
  return (!from || date >= from) && (!to || date <= to);
}

function grouped(values: readonly string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function uniqueBy<T>(records: readonly T[], key: (record: T) => string): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const value = key(record);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function summarizeAttendance(records: readonly OpaAttendanceRecord[], window: MetricWindow): AttendanceSummary {
  const filtered = records.filter((record) => inWindow(record.data_referencia, window));
  const unique = uniqueBy(filtered, (record) => record.protocolo?.trim() || `source:${record.source_id}`);
  const linked = unique.filter((record) => record.status_vinculo === 'vinculado').length;
  return {
    total: unique.length,
    linked,
    unlinked: unique.length - linked,
    byChannel: grouped(unique.flatMap((record) => record.canal ? [record.canal] : [])),
    byStatus: grouped(unique.flatMap((record) => record.status ? [record.status] : [])),
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
