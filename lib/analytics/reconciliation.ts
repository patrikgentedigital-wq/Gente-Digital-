export type ReconciliationValue = number | string | null;
export type ReconciliationStatus = 'match' | 'mismatch' | 'not_comparable';

export interface ReconciliationResult {
  metricId: string;
  expected: ReconciliationValue;
  actual: ReconciliationValue;
  difference: number | string;
  status: ReconciliationStatus;
  reason: string | null;
}

function isComparable(value: ReconciliationValue): boolean {
  if (value === null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return value.trim().length > 0;
}

function normalizeReason(reason: string | null | undefined): string | null {
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/**
 * Compares two already-apurados values without coercion or implicit tolerance.
 * The caller must provide an evidence-based reason when explaining a mismatch.
 */
export function compareMetric(
  metricId: string,
  expected: ReconciliationValue,
  actual: ReconciliationValue,
  reason?: string | null,
): ReconciliationResult {
  if (!isComparable(expected) || !isComparable(actual)) {
    return {
      metricId,
      expected,
      actual,
      difference: 'valor ausente',
      status: 'not_comparable',
      reason: 'expected ou actual não disponível',
    };
  }

  if (typeof expected === 'number' && typeof actual === 'number') {
    const difference = actual - expected;
    return {
      metricId,
      expected,
      actual,
      difference,
      status: difference === 0 ? 'match' : 'mismatch',
      reason: difference === 0 ? null : normalizeReason(reason),
    };
  }

  const isEqual = typeof expected === 'string'
    && typeof actual === 'string'
    && expected === actual;
  return {
    metricId,
    expected,
    actual,
    difference: isEqual ? 0 : `${String(expected)} != ${String(actual)}`,
    status: isEqual ? 'match' : 'mismatch',
    reason: isEqual ? null : normalizeReason(reason),
  };
}
