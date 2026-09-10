import type { IdentifierKind, RawIdentifier } from './types';

export const ANALYTICS_TIMEZONE = 'America/Sao_Paulo';

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

const BRAZILIAN_TIMESTAMP_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:(?:T| )(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DOMAIN_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ANALYTICS_TIMEZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const MINUTE_IN_MILLISECONDS = 60 * 1000;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function preserveRawIdentifier(value: unknown): RawIdentifier {
  if (value === null || value === undefined) return { rawValue: null, kind: 'unknown' };

  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new RangeError('Inteiro não seguro para identificador; forneça o valor como string');
  }

  const rawValue = String(value).trim();
  return { rawValue: rawValue || null, kind: 'unknown' };
}

export function classifyIdentifier(value: string | null, hint?: string | null): IdentifierKind {
  if (value === null || value.trim() === '') return 'unknown';
  const normalizedHint = hint?.trim().toLowerCase();
  return (normalizedHint && HINTS[normalizedHint]) || 'unknown';
}

export function normalizeSourceTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value.toISOString() : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return isValidDate(date) ? date.toISOString() : null;
  }

  if (typeof value !== 'string') return null;

  const input = value.trim();
  if (!input) return null;

  const brazilianTimestamp = parseBrazilianTimestamp(input);
  if (brazilianTimestamp !== undefined) return brazilianTimestamp;

  // A slash-containing value belongs to the Brazilian format boundary. It must
  // not fall through to a permissive native parser.
  if (input.includes('/')) return null;

  return parseIsoTimestamp(input);
}

function parseBrazilianTimestamp(input: string): string | null | undefined {
  const match = input.match(BRAZILIAN_TIMESTAMP_PATTERN);
  if (!match) return undefined;

  const parts: CalendarParts = {
    year: Number(match[3]),
    month: Number(match[2]),
    day: Number(match[1]),
    hour: match[4] === undefined ? 12 : Number(match[4]),
    minute: match[5] === undefined ? 0 : Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
    millisecond: 0,
  };

  if (!isValidCalendarParts(parts)) return null;
  return dateFromDomainLocalParts(parts)?.toISOString() ?? null;
}

function parseIsoTimestamp(input: string): string | null {
  const match = input.match(ISO_TIMESTAMP_PATTERN);
  if (!match) return null;

  const hasTime = match[4] !== undefined;
  const parts: CalendarParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: hasTime ? Number(match[4]) : 0,
    minute: hasTime ? Number(match[5]) : 0,
    second: hasTime && match[6] !== undefined ? Number(match[6]) : 0,
    millisecond: hasTime && match[7] !== undefined ? fractionToMilliseconds(match[7]) : 0,
  };

  if (!isValidCalendarParts(parts)) return null;

  if (!hasTime) {
    return new Date(createUtcTimestamp(parts)).toISOString();
  }

  const offset = match[8];
  if (offset !== undefined) {
    const offsetMinutes = parseOffsetMinutes(offset);
    if (offsetMinutes === null) return null;
    return new Date(createUtcTimestamp(parts) - offsetMinutes * MINUTE_IN_MILLISECONDS).toISOString();
  }

  return dateFromDomainLocalParts(parts)?.toISOString() ?? null;
}

function isValidCalendarParts(parts: CalendarParts): boolean {
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) return false;
  return parts.hour >= 0 && parts.hour <= 23
    && parts.minute >= 0 && parts.minute <= 59
    && parts.second >= 0 && parts.second <= 59
    && parts.millisecond >= 0 && parts.millisecond <= 999;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function fractionToMilliseconds(fraction: string): number {
  return Number(fraction.slice(0, 3).padEnd(3, '0'));
}

function parseOffsetMinutes(offset: string): number | null {
  if (offset === 'Z') return 0;

  const match = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;

  const absoluteMinutes = hours * 60 + minutes;
  return match[1] === '+' ? absoluteMinutes : -absoluteMinutes;
}

function dateFromDomainLocalParts(parts: CalendarParts): Date | null {
  const naiveTimestamp = createUtcTimestamp(parts);
  if (!Number.isFinite(naiveTimestamp)) return null;

  const initialGuess = new Date(naiveTimestamp);
  const initialOffset = domainOffsetMinutes(initialGuess);
  let timestamp = naiveTimestamp - initialOffset * MINUTE_IN_MILLISECONDS;

  // Re-read the offset at the candidate instant so dates around a timezone
  // transition do not inherit the offset from the initial UTC guess.
  const adjustedOffset = domainOffsetMinutes(new Date(timestamp));
  if (adjustedOffset !== initialOffset) {
    timestamp = naiveTimestamp - adjustedOffset * MINUTE_IN_MILLISECONDS;
  }

  const result = new Date(timestamp);
  if (!isValidDate(result) || !sameCalendarParts(domainParts(result), parts)) return null;
  return result;
}

function domainOffsetMinutes(instant: Date): number {
  const localParts = domainParts(instant);
  return (createUtcTimestamp(localParts) - instant.getTime()) / MINUTE_IN_MILLISECONDS;
}

function domainParts(instant: Date): CalendarParts {
  const values = Object.fromEntries(
    DOMAIN_TIME_FORMATTER.formatToParts(instant)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: instant.getUTCMilliseconds(),
  };
}

function sameCalendarParts(left: CalendarParts, right: CalendarParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second
    && left.millisecond === right.millisecond;
}

function createUtcTimestamp(parts: CalendarParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}
