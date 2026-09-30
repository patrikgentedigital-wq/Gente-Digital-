import type {
  PostSaleDataset,
  PostSaleMetrics,
  PostSaleWindow,
} from './contracts';
import { isValidPhoneDigits, normalizePhoneDigits } from './phones';

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const CLOSED_LEAD_STATUSES = new Set(['ganho', 'perdido', 'cancelado', 'errado']);

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function localDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): string | null {
  if (!isValidCalendarDate(year, month, day)
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
    || millisecond < 0 || millisecond > 999) {
    return null;
  }

  const local = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
  const time = [
    String(hour).padStart(2, '0'),
    String(minute).padStart(2, '0'),
    String(second).padStart(2, '0'),
  ].join(':');
  const fraction = `.${String(millisecond).padStart(3, '0')}`;
  const parsed = new Date(`${local}T${time}${fraction}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Parses IXC date-only, Brazilian local, and ISO timestamps into an absolute instant. */
export function parseIxcDate(input: string | null | undefined): string | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const value = input.trim();

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return localDateTimeToIso(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value);
  if (brDate) {
    return localDateTimeToIso(
      Number(brDate[3]),
      Number(brDate[2]),
      Number(brDate[1]),
      Number(brDate[4] ?? 0),
      Number(brDate[5] ?? 0),
      Number(brDate[6] ?? 0),
      Number((brDate[7] ?? '').padEnd(3, '0') || 0),
    );
  }

  const isoDateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
  if (!isoDateTime) return null;

  const year = Number(isoDateTime[1]);
  const month = Number(isoDateTime[2]);
  const day = Number(isoDateTime[3]);
  const hour = Number(isoDateTime[4]);
  const minute = Number(isoDateTime[5]);
  const second = Number(isoDateTime[6] ?? 0);
  const millisecond = Number((isoDateTime[7] ?? '').slice(0, 3).padEnd(3, '0') || 0);
  if (!isValidCalendarDate(year, month, day)
    || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const timeZone = isoDateTime[8];
  if (!timeZone) {
    return localDateTimeToIso(year, month, day, hour, minute, second, millisecond);
  }

  const normalizedTimeZone = timeZone.toUpperCase() === 'Z'
    ? 'Z'
    : timeZone.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const isoValue = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}${normalizedTimeZone}`;
  const parsed = new Date(isoValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function businessDay(input: string | null | undefined): string | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const value = input.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1).map(Number);
    return isValidCalendarDate(year, month, day) ? value : null;
  }

  const instant = parseIxcDate(value);
  if (!instant) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function validatedRange(range: PostSaleWindow['collection']): { start: string; end: string } {
  const start = businessDay(range.start);
  const end = businessDay(range.end);
  if (!start || !end || start > end) {
    throw new RangeError('Período de pós-venda inválido.');
  }
  return { start, end };
}

function inRange(value: string | null | undefined, range: { start: string; end: string }): boolean {
  const day = businessDay(value);
  return day !== null && day >= range.start && day <= range.end;
}

export function buildPostSaleMetrics(data: PostSaleDataset, window: PostSaleWindow): PostSaleMetrics {
  const collectionRange = validatedRange(window.collection);
  const conversionRange = validatedRange(window.conversion);

  const selectedCollections = data.collections.filter((collection) => inRange(collection.createdAt, collectionRange));
  const selectedCollectionIds = new Set(selectedCollections.map((collection) => collection.id));
  const selectedContacts = data.contacts.filter((contact) => selectedCollectionIds.has(contact.collectionId));
  const validContacts = selectedContacts.filter((contact) => (
    contact.state === 'created_lead'
    && contact.leadId !== null
    && isValidPhoneDigits(normalizePhoneDigits(contact.phoneNormalized))
  ));
  const validContactIds = new Set(validContacts.map((contact) => contact.id));
  const validLeadIds = new Set(validContacts.map((contact) => contact.leadId).filter((id): id is number => id !== null));

  const periodConversions = data.conversions.filter((conversion) => inRange(conversion.activatedAt, conversionRange));
  const uniquePeriodConversions = Array.from(
    new Map(periodConversions.map((conversion) => [conversion.ixcContractId, conversion])).values(),
  );
  const pendingReviews = uniquePeriodConversions.filter((conversion) => conversion.state === 'pending_review');
  const confirmedConversions = uniquePeriodConversions.filter((conversion) => (
    conversion.state === 'confirmed' && conversion.contactId !== null
  ));
  const convertedContactIds = new Set(
    confirmedConversions
      .map((conversion) => conversion.contactId)
      .filter((contactId): contactId is string => contactId !== null && validContactIds.has(contactId)),
  );

  const responseDurations = validContacts.flatMap((contact) => {
    if (!contact.createdAt || !contact.firstAttendanceAt) return [];
    const createdAt = parseIxcDate(contact.createdAt);
    const firstAttendanceAt = parseIxcDate(contact.firstAttendanceAt);
    if (!createdAt || !firstAttendanceAt) return [];
    const minutes = (Date.parse(firstAttendanceAt) - Date.parse(createdAt)) / 60_000;
    return Number.isFinite(minutes) && minutes >= 0 ? [minutes] : [];
  });

  const progressLeadIds = new Set(
    validContacts
      .filter((contact) => {
        const status = contact.leadStatus?.trim().toLocaleLowerCase('pt-BR');
        return !!status && !CLOSED_LEAD_STATUSES.has(status);
      })
      .map((contact) => contact.leadId)
      .filter((leadId): leadId is number => leadId !== null),
  );
  const validCount = validContactIds.size;

  return {
    registeredOriginSales: new Set(selectedCollections.map((collection) => collection.id)).size,
    contactsReceived: selectedContacts.length,
    validContacts: validCount,
    duplicateContacts: selectedContacts.filter((contact) => contact.state === 'duplicate_existing').length,
    invalidContacts: selectedContacts.filter((contact) => contact.state === 'invalid').length,
    leadsInProgress: progressLeadIds.size,
    pendingReviews: pendingReviews.length,
    convertedContacts: convertedContactIds.size,
    confirmedContracts: confirmedConversions.length,
    conversionRate: validCount === 0 ? null : convertedContactIds.size / validCount,
    averageMinutesToFirstAttendance: responseDurations.length === 0
      ? null
      : responseDurations.reduce((sum, duration) => sum + duration, 0) / responseDurations.length,
  };
}
