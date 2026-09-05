export type DatePeriodType = 
  | 'all' 
  | 'this_month' 
  | 'last_month' 
  | 'last_30_days' 
  | 'this_year' 
  | 'custom';

export interface DateFilterState {
  period: DatePeriodType;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

/**
 * Retorna se uma data ISO ou string de data está dentro do intervalo do filtro selecionado.
 */
export function matchesDateFilter(
  dateString?: string | null,
  filter?: DateFilterState | null,
  referenceDate: Date = new Date()
): boolean {
  if (!filter || filter.period === 'all') return true;
  if (!dateString) return false;

  const itemDate = new Date(dateString);
  if (isNaN(itemDate.getTime())) return false;

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
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return itemDate >= thirtyDaysAgo && itemDate <= now;
    }
    case 'this_year': {
      return itemDate.getFullYear() === now.getFullYear();
    }
    case 'custom': {
      if (filter.startDate) {
        const start = new Date(`${filter.startDate}T00:00:00`);
        if (!isNaN(start.getTime()) && itemDate < start) {
          return false;
        }
      }
      if (filter.endDate) {
        const end = new Date(`${filter.endDate}T23:59:59.999`);
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
