function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function buildIdempotentUpsert<T extends { source_id: string; source_updated_at?: string | null }>(records: readonly T[]): T[] {
  const selected = new Map<string, T>();

  for (const record of records) {
    const current = selected.get(record.source_id);
    if (!current) {
      selected.set(record.source_id, record);
      continue;
    }

    const currentTime = validTimestamp(current.source_updated_at) ? Date.parse(current.source_updated_at) : null;
    const nextTime = validTimestamp(record.source_updated_at) ? Date.parse(record.source_updated_at) : null;
    if ((nextTime !== null && currentTime === null) || (nextTime !== null && currentTime !== null && nextTime >= currentTime) || (nextTime === null && currentTime === null)) {
      selected.set(record.source_id, record);
    }
  }

  return [...selected.values()];
}

export function sanitizeSyncError(_error: unknown): string {
  return 'Falha na sincronização analítica.';
}
