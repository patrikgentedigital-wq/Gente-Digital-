import { isSupabaseAdminConfigured, supabaseAdmin } from '../supabase-admin';
import { buildIdempotentUpsert, sanitizeSyncError } from './ingestion';
import type { IxcCancellationRecord, OpaAttendanceRecord } from './types';

export class RepositoryUnavailableError extends Error {
  constructor() {
    super('Persistência analítica indisponível.');
    this.name = 'RepositoryUnavailableError';
  }
}

function assertAdminAvailable(): void {
  if (!isSupabaseAdminConfigured) throw new RepositoryUnavailableError();
}

async function upsertBatch<T extends { source_id: string; source_updated_at?: string | null }>(table: string, records: readonly T[], runId: string): Promise<number> {
  assertAdminAvailable();
  const rows = buildIdempotentUpsert(records).map((record) => ({
    ...record,
    source_system: table.startsWith('opa_') ? 'opa' : 'ixc',
    sync_run_id: runId,
    synced_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabaseAdmin.from(table).upsert(rows, { onConflict: 'source_id' });
  if (error) throw new Error(sanitizeSyncError(error));
  return rows.length;
}

export function upsertOpaAttendanceBatch(records: readonly OpaAttendanceRecord[], runId: string): Promise<number> {
  return upsertBatch('opa_attendances', records, runId);
}

export function upsertIxcCancellationBatch(records: readonly IxcCancellationRecord[], runId: string): Promise<number> {
  return upsertBatch('ixc_cancellations', records, runId);
}
