import { normalizeSourceTimestamp } from './normalizers';

export interface SyncRunInput {
  source: 'opa' | 'ixc';
  periodStart: string;
  periodEnd: string;
  requestId: string;
}

export interface SyncRunResult {
  source: 'opa' | 'ixc';
  status: 'success' | 'partial' | 'failed' | 'unavailable';
  received: number;
  inserted: number;
  updated: number;
  failed: number;
  lastSourceUpdatedAt: string | null;
}

export interface DetailedSyncRunResult extends SyncRunResult {
  persisted: number | null;
  countsKnown: boolean;
  errorMessage: string | null;
}

function normalizedTimestamp(value: unknown): string | null {
  return normalizeSourceTimestamp(value);
}

function canonicalSerialize(value: unknown, ancestors = new Set<unknown>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (value === Number.POSITIVE_INFINITY) return 'number:+Infinity';
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity';
    return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  }
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'symbol') return `symbol:${String(value)}`;
  if (typeof value === 'function') return `function:${String(value)}`;
  if (value instanceof Date) return `date:${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}`;

  if (ancestors.has(value)) return 'circular';
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item, nextAncestors)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalSerialize(object[key], nextAncestors)}`).join(',')}}`;
}

function compareSourceId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareCandidates<T extends { source_id: string; source_updated_at?: string | null }>(left: T, right: T): number {
  const leftTimestamp = normalizedTimestamp(left.source_updated_at);
  const rightTimestamp = normalizedTimestamp(right.source_updated_at);

  if (leftTimestamp === null && rightTimestamp !== null) return -1;
  if (leftTimestamp !== null && rightTimestamp === null) return 1;
  if (leftTimestamp !== null && rightTimestamp !== null) {
    const timestampComparison = leftTimestamp < rightTimestamp ? -1 : leftTimestamp > rightTimestamp ? 1 : 0;
    if (timestampComparison !== 0) return timestampComparison;
  }

  const leftSerialized = canonicalSerialize(left);
  const rightSerialized = canonicalSerialize(right);
  // O menor envelope canônico vence o empate, sem depender da ordem recebida.
  if (leftSerialized < rightSerialized) return 1;
  if (leftSerialized > rightSerialized) return -1;
  return 0;
}

export function buildIdempotentUpsert<T extends { source_id: string; source_updated_at?: string | null }>(records: readonly T[]): T[] {
  const selected = new Map<string, T>();

  for (const record of records) {
    const current = selected.get(record.source_id);
    if (!current || compareCandidates(record, current) > 0) {
      selected.set(record.source_id, record);
    }
  }

  return [...selected.values()].sort((left, right) => compareSourceId(left.source_id, right.source_id));
}

export function sanitizeSyncError(_error: unknown): string {
  return 'Falha na sincronização analítica.';
}
