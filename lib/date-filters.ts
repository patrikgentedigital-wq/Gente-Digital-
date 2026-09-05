export type DatePeriodType = 
  | 'all' 
  | 'this_month' 
  | 'last_month' 
  | 'specific_month'
  | 'last_30_days' 
  | 'this_year' 
  | 'custom';

export interface DateFilterState {
  period: DatePeriodType;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  month?: number;     // 0-indexed: 0 = Janeiro, 11 = Dezembro
  year?: number;      // Ex: 2025, 2026
}

export const MONTH_NAMES_BR = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Converte de forma resiliente qualquer formato de data (ISO 8601, pt-BR DD/MM/YYYY, timestamp ou Date)
 * para um objeto Date válido. Retorna null se a data for inválida ou inexistente.
 */
export function parseFlexibleDate(dateInput?: string | number | Date | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(dateInput).trim();
  if (!str) return null;

  // Formato brasileiro: DD/MM/YYYY ou DD/MM/YYYY HH:mm ou DD/MM/YYYY, HH:mm:ss
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1; // 0-indexed
    const year = parseInt(brMatch[3], 10);
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 12;
    const min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const sec = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  // Formato ISO (ex: "2026-09-05T12:00:00Z", "2025-02-15 14:30:00+00", "2026-09-05")
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

/**
 * Retorna se uma data está dentro do intervalo do filtro selecionado.
 * Aceita qualquer formato de data (ISO ou pt-BR) e qualquer período.
 */
export function matchesDateFilter(
  dateInput?: string | number | Date | null,
  filter?: DateFilterState | null,
  referenceDate: Date = new Date()
): boolean {
  if (!filter || filter.period === 'all') return true;

  const itemDate = parseFlexibleDate(dateInput);
  if (!itemDate) return false;

  const now = referenceDate;

  switch (filter.period) {
    case 'this_month': {
      return (
        itemDate.getFullYear() === now.getFullYear() &&
        itemDate.getMonth() === now.getMonth()
      );
    }
    case 'last_month': {
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return (
        itemDate.getFullYear() === lastYear &&
        itemDate.getMonth() === lastMonth
      );
    }
    case 'specific_month': {
      const targetMonth = filter.month !== undefined ? filter.month : now.getMonth();
      const targetYear = filter.year !== undefined ? filter.year : now.getFullYear();
      return (
        itemDate.getFullYear() === targetYear &&
        itemDate.getMonth() === targetMonth
      );
    }
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return itemDate >= thirtyDaysAgo && itemDate <= now;
    }
    case 'this_year': {
      return itemDate.getFullYear() === now.getFullYear();
    }
    case 'custom': {
      if (filter.startDate) {
        const start = parseFlexibleDate(`${filter.startDate}T00:00:00`) || new Date(`${filter.startDate}T00:00:00`);
        if (!isNaN(start.getTime()) && itemDate < start) {
          return false;
        }
      }
      if (filter.endDate) {
        const end = parseFlexibleDate(`${filter.endDate}T23:59:59.999`) || new Date(`${filter.endDate}T23:59:59.999`);
        if (!isNaN(end.getTime()) && itemDate > end) {
          return false;
        }
      }
      return true;
    }
    default:
      return true;
  }
}

/**
 * Retorna rótulo legível em português para o período ativo.
 */
export function getPeriodLabel(filter: DateFilterState): string {
  switch (filter.period) {
    case 'all': return 'Todo o período';
    case 'this_month': return 'Este mês';
    case 'last_month': return 'Mês anterior';
    case 'specific_month': {
      const monthIdx = filter.month !== undefined ? filter.month : new Date().getMonth();
      const year = filter.year !== undefined ? filter.year : new Date().getFullYear();
      const monthName = MONTH_NAMES_BR[monthIdx] || 'Mês';
      return `${monthName} / ${year}`;
    }
    case 'last_30_days': return 'Últimos 30 dias';
    case 'this_year': return 'Este ano';
    case 'custom': {
      if (filter.startDate && filter.endDate) {
        return `${formatDateBR(filter.startDate)} até ${formatDateBR(filter.endDate)}`;
      }
      if (filter.startDate) return `A partir de ${formatDateBR(filter.startDate)}`;
      if (filter.endDate) return `Até ${formatDateBR(filter.endDate)}`;
      return 'Período personalizado';
    }
    default: return 'Período';
  }
}

function formatDateBR(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export interface AvailableMonthOption {
  key: string;      // "2026-8"
  month: number;    // 0 a 11
  year: number;     // 2025, 2026
  label: string;    // "Setembro / 2026"
  count: number;    // número de ocorrências
}

/**
 * Extrai a lista de meses reais em que existem registros no banco de dados,
 * ordenados do mais recente para o mais antigo.
 */
export function extractAvailableMonths(dateStrings: (string | number | Date | null | undefined)[]): AvailableMonthOption[] {
  const monthMap: Record<string, { month: number; year: number; count: number }> = {};

  dateStrings.forEach(dStr => {
    const d = parseFlexibleDate(dStr);
    if (!d) return;
    const year = d.getFullYear();
    const month = d.getMonth();
    const key = `${year}-${month}`;
    if (!monthMap[key]) {
      monthMap[key] = { month, year, count: 0 };
    }
    monthMap[key].count += 1;
  });

  return Object.entries(monthMap)
    .map(([key, info]) => ({
      key,
      month: info.month,
      year: info.year,
      label: `${MONTH_NAMES_BR[info.month]} / ${info.year}`,
      count: info.count,
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
}
