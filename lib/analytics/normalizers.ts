import { parseFlexibleDate } from '../date-filters';
import type { IdentifierKind, RawIdentifier } from './types';

const HINTS: Record<string, IdentifierKind> = {
  telefone: 'phone',
  phone: 'phone',
  celular: 'phone',
  id_cliente: 'client_id',
  cliente_id: 'client_id',
  customer_id: 'client_id',
  id_contrato: 'contract_id',
  contrato_id: 'contract_id',
  contract_id: 'contract_id',
  protocolo: 'protocol',
  protocol: 'protocol',
  metric_id: 'metric',
};

export function preserveRawIdentifier(value: unknown): RawIdentifier {
  if (value === null || value === undefined) return { rawValue: null, kind: 'unknown' };
  const rawValue = String(value).trim();
  return { rawValue: rawValue || null, kind: 'unknown' };
}

export function classifyIdentifier(value: string | null, hint?: string | null): IdentifierKind {
  if (value === null || value.trim() === '') return 'unknown';
  const normalizedHint = hint?.trim().toLowerCase();
  return (normalizedHint && HINTS[normalizedHint]) || 'unknown';
}

export function normalizeSourceTimestamp(value: unknown): string | null {
  const date = parseFlexibleDate(value as string | number | Date | null);
  return date ? date.toISOString() : null;
}
