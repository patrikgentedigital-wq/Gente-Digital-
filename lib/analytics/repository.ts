import 'server-only';

import { isSupabaseAdminConfigured, supabaseAdmin } from '../supabase-admin';
import {
  buildIdempotentUpsert,
  sanitizeSyncError,
  type DetailedSyncRunResult,
} from './ingestion';
import { normalizeSourceBusinessDate, normalizeSourceTimestamp } from './normalizers';
import type { IxcCancellationRecord, OpaAttendanceRecord } from './types';

export type AnalyticsPersistenceTable = 'opa_attendances' | 'ixc_cancellations';

export interface OpaAttendancePersistenceRow {
  source_system: 'opa';
  source_id: string;
  protocolo: string | null;
  contato_bruto: string | null;
  tipo_identificador: OpaAttendanceRecord['tipo_identificador'];
  canal: string | null;
  status: string | null;
  status_vinculo: OpaAttendanceRecord['status_vinculo'];
  data_abertura: string | null;
  data_finalizacao: string | null;
  source_updated_at: string | null;
  synced_at: string;
  sync_run_id: string;
}

export interface IxcCancellationPersistenceRow {
  source_system: 'ixc';
  source_id: string;
  contract_source_id: string | null;
  motivo: string | null;
  tipo: IxcCancellationRecord['tipo'];
  data_cancelamento: string | null;
  source_updated_at: string | null;
  synced_at: string;
  sync_run_id: string;
}

export type AnalyticsPersistenceRow =
  | OpaAttendancePersistenceRow
  | IxcCancellationPersistenceRow;

export interface AnalyticsPersistenceUpsertOptions {
  onConflict: 'source_id';
}

export interface AnalyticsPersistenceOutcome {
  error: unknown | null;
  persisted?: number | null;
  inserted?: number;
  updated?: number;
  failed?: number;
}

export interface AnalyticsPersistenceExecutor {
  upsert(
    table: AnalyticsPersistenceTable,
    rows: readonly AnalyticsPersistenceRow[],
    options: AnalyticsPersistenceUpsertOptions,
  ): Promise<AnalyticsPersistenceOutcome>;
}

export class RepositoryUnavailableError extends Error {
  constructor() {
    super('Persistência analítica indisponível.');
    this.name = 'RepositoryUnavailableError';
  }
}

export function mapOpaAttendanceToPersistenceRow(
  record: OpaAttendanceRecord,
  runId: string,
  syncedAt: string,
): OpaAttendancePersistenceRow {
  return {
    source_system: 'opa',
    source_id: record.source_id,
    protocolo: record.protocolo,
    contato_bruto: record.contato_bruto,
    tipo_identificador: record.tipo_identificador,
    canal: record.canal,
    status: record.status,
    status_vinculo: record.status_vinculo,
    // data_referencia é a data de abertura para a projeção Opa.
    data_abertura: normalizeSourceTimestamp(record.data_referencia),
    data_finalizacao: normalizeSourceTimestamp(record.data_finalizacao),
    source_updated_at: normalizeSourceTimestamp(record.source_updated_at),
    synced_at: syncedAt,
    sync_run_id: runId,
  };
}

export function mapIxcCancellationToPersistenceRow(
  record: IxcCancellationRecord,
  runId: string,
  syncedAt: string,
): IxcCancellationPersistenceRow {
  return {
    source_system: 'ixc',
    source_id: record.source_id,
    contract_source_id: record.contract_source_id ?? null,
    motivo: record.motivo,
    tipo: record.tipo,
    // data_referencia é a data de cancelamento para a projeção IXC.
    data_cancelamento: normalizeSourceBusinessDate(record.data_referencia),
    source_updated_at: normalizeSourceTimestamp(record.source_updated_at),
    synced_at: syncedAt,
    sync_run_id: runId,
  };
}

const defaultExecutor: AnalyticsPersistenceExecutor | null = isSupabaseAdminConfigured
  ? {
    async upsert(table, rows, options) {
      const { error } = await supabaseAdmin.from(table).upsert(rows, options);
      return {
        error,
        // PostgREST confirma a operação em lote, mas não separa insert de update.
        persisted: error ? 0 : rows.length,
      };
    },
  }
  : null;

function resolveExecutor(executor: AnalyticsPersistenceExecutor | null | undefined): AnalyticsPersistenceExecutor | null {
  return executor === undefined ? defaultExecutor : executor;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPersistenceUnavailable(error: unknown): boolean {
  if (error instanceof RepositoryUnavailableError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return ['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST106'].includes(String(candidate.code))
    || [404, 503].includes(Number(candidate.status ?? candidate.statusCode));
}

function errorMessage(error: unknown): string {
  return error instanceof RepositoryUnavailableError
    ? error.message
    : sanitizeSyncError(error);
}

function latestSourceUpdatedAt<T extends { source_updated_at?: string | null }>(records: readonly T[]): string | null {
  return records.reduce<string | null>((latest, record) => {
    const normalized = normalizeSourceTimestamp(record.source_updated_at);
    if (normalized === null) return latest;
    return latest === null || normalized > latest ? normalized : latest;
  }, null);
}

function baseResult<T extends { source_updated_at?: string | null }>(
  source: 'opa' | 'ixc',
  records: readonly T[],
  deduplicated: readonly T[],
): DetailedSyncRunResult {
  return {
    source,
    status: 'unavailable',
    received: records.length,
    inserted: 0,
    updated: 0,
    failed: deduplicated.length,
    lastSourceUpdatedAt: latestSourceUpdatedAt(deduplicated),
    persisted: 0,
    countsKnown: true,
    errorMessage: null,
  };
}

async function upsertBatchDetailed<T extends { source_id: string; source_updated_at?: string | null }>(
  source: 'opa' | 'ixc',
  table: AnalyticsPersistenceTable,
  records: readonly T[],
  runId: string,
  mapRow: (record: T, runId: string, syncedAt: string) => AnalyticsPersistenceRow,
  executor: AnalyticsPersistenceExecutor | null | undefined,
  now: string,
): Promise<DetailedSyncRunResult> {
  const deduplicated = buildIdempotentUpsert(records);
  const result = baseResult(source, records, deduplicated);
  const persistenceExecutor = resolveExecutor(executor);

  if (persistenceExecutor === null) {
    result.errorMessage = new RepositoryUnavailableError().message;
    return result;
  }

  if (deduplicated.length === 0) {
    return {
      ...result,
      status: 'success',
      failed: 0,
      persisted: 0,
      countsKnown: true,
      errorMessage: null,
    };
  }

  const rows = deduplicated.map((record) => mapRow(record, runId, now));
  let outcome: AnalyticsPersistenceOutcome;
  try {
    outcome = await persistenceExecutor.upsert(table, rows, { onConflict: 'source_id' });
  } catch (error) {
    return {
      ...result,
      status: isPersistenceUnavailable(error) ? 'unavailable' : 'failed',
      errorMessage: errorMessage(error),
    };
  }

  if (outcome.error !== null) {
    const failed = isCount(outcome.failed) && outcome.failed > 0
      ? Math.min(outcome.failed, deduplicated.length)
      : deduplicated.length;
    return {
      ...result,
      status: isPersistenceUnavailable(outcome.error) ? 'unavailable' : 'failed',
      errorMessage: errorMessage(outcome.error),
      failed,
    };
  }

  const countsKnown = isCount(outcome.inserted) && isCount(outcome.updated);
  const failed = isCount(outcome.failed) ? Math.min(outcome.failed, deduplicated.length) : 0;
  const persisted = isCount(outcome.persisted)
    ? outcome.persisted
    : countsKnown
      ? outcome.inserted! + outcome.updated!
      : null;

  return {
    ...result,
    status: failed > 0 || !countsKnown ? 'partial' : 'success',
    inserted: countsKnown ? outcome.inserted! : 0,
    updated: countsKnown ? outcome.updated! : 0,
    failed,
    persisted,
    countsKnown,
    errorMessage: failed > 0
      ? 'Falha parcial na persistência analítica.'
      : countsKnown
        ? null
        : 'Contagens de inserção e atualização indisponíveis no executor.',
  };
}

export function upsertOpaAttendanceBatchDetailed(
  records: readonly OpaAttendanceRecord[],
  runId: string,
  executor?: AnalyticsPersistenceExecutor | null,
  now = new Date().toISOString(),
): Promise<DetailedSyncRunResult> {
  return upsertBatchDetailed(
    'opa',
    'opa_attendances',
    records,
    runId,
    mapOpaAttendanceToPersistenceRow,
    executor,
    now,
  );
}

export function upsertIxcCancellationBatchDetailed(
  records: readonly IxcCancellationRecord[],
  runId: string,
  executor?: AnalyticsPersistenceExecutor | null,
  now = new Date().toISOString(),
): Promise<DetailedSyncRunResult> {
  return upsertBatchDetailed(
    'ixc',
    'ixc_cancellations',
    records,
    runId,
    mapIxcCancellationToPersistenceRow,
    executor,
    now,
  );
}

async function upsertWithCompatibleResult(result: Promise<DetailedSyncRunResult>): Promise<number> {
  const outcome = await result;
  if (outcome.status === 'unavailable') throw new RepositoryUnavailableError();
  if (outcome.status === 'failed' || outcome.failed > 0 || outcome.persisted === null) {
    throw new Error(outcome.errorMessage ?? sanitizeSyncError(null));
  }
  return outcome.persisted ?? 0;
}

export function upsertOpaAttendanceBatch(
  records: readonly OpaAttendanceRecord[],
  runId: string,
  executor?: AnalyticsPersistenceExecutor | null,
): Promise<number> {
  return upsertWithCompatibleResult(upsertOpaAttendanceBatchDetailed(records, runId, executor));
}

export function upsertIxcCancellationBatch(
  records: readonly IxcCancellationRecord[],
  runId: string,
  executor?: AnalyticsPersistenceExecutor | null,
): Promise<number> {
  return upsertWithCompatibleResult(upsertIxcCancellationBatchDetailed(records, runId, executor));
}
