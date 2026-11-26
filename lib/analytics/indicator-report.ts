import type { CancellationRecord, CommercialMetrics, CommercialPeriod, CommercialRecord, DirectCancellationMetrics } from './commercial-ixc';
import { sortCommercialRecordsByDate } from './commercial-detail';
import { countCommercialDays } from './commercial-panorama';
import { businessToday, comparisonPeriod } from './ixc-period';

export type ReportScope = 'vendas' | 'cancelamentos' | 'consolidado';
export interface ReportColumn { label: string; type: 'text' | 'number' | 'percent' | 'date' }
export interface ReportTable { title: string; columns: ReportColumn[]; rows: (string | number | null)[][] }
export interface IndicatorReport {
  title: string;
  period: CommercialPeriod;
  compared: CommercialPeriod | null;
  generatedAt: string;
  notes: string[];
  tables: ReportTable[];
}

const commercialLabels = { leads: 'Leads recebidos', sales: 'Vendas fechadas', contracts: 'Contratos criados' } as const;
const commercialKeys = ['leads', 'sales', 'contracts'] as const;
const titles = {
  vendas: 'Relatório de vendas',
  cancelamentos: 'Relatório de cancelamentos',
  consolidado: 'Relatório de vendas e cancelamentos',
};
const day = 86_400_000;
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' });

type Reading<M> = { metrics: M; readAt: string };
type CancellationDetails = DirectCancellationMetrics & { records: CancellationRecord[] };
type CommercialSummary = Partial<Record<keyof CommercialMetrics, number | null>>;
type DataSection = Exclude<ReportScope, 'consolidado'>;

class AccessError extends Error {}

async function read<M>(period: CommercialPeriod, section: DataSection, signal: AbortSignal, summary = false): Promise<Reading<M>> {
  const params = new URLSearchParams({ ...period });
  if (section === 'cancelamentos') params.set('section', section);
  if (summary) params.set('summary', '1');
  else if (section === 'cancelamentos') params.set('details', '1');
  const response = await fetch('/api/analytics/commercial?' + params, { cache: 'no-store', signal });
  if (response.status === 401 || response.status === 403 || (response.redirected && new URL(response.url).pathname === '/login')) {
    throw new AccessError('Entre com uma conta administrativa para gerar o relatório.');
  }
  if (!response.ok) throw new Error('Não foi possível consultar ' + section + ' no IXC. Tente novamente.');
  const reading: Reading<M> = await response.json();
  if (reading.metrics == null || !Number.isFinite(Date.parse(reading.readAt))) {
    throw new Error('A consulta de ' + section + ' retornou dados incompletos. Tente novamente.');
  }
  return reading;
}

async function previousReading<M>(period: CommercialPeriod, section: DataSection, signal: AbortSignal) {
  try {
    return (await read<M>(period, section, signal, true)).metrics;
  } catch (cause) {
    if (cause instanceof AccessError || signal.aborted) throw cause;
    return null;
  }
}

const column = (label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({ label, type });

function categoryName(row: CommercialRecord, dimension: 'channel' | 'responsible'): string {
  const name = dimension === 'channel' ? row.channelName : row.responsibleName;
  return name || (row[dimension] ? 'Nome indisponível (ref. ' + row[dimension] + ')'
    : dimension === 'channel' ? 'Sem canal informado' : 'Sem responsável informado');
}

function distribution(commercial: CommercialMetrics, dimension: 'channel' | 'responsible'): ReportTable {
  const label = dimension === 'channel' ? 'Canal' : 'Responsável';
  const result: ReportTable = {
    title: 'Por ' + label.toLocaleLowerCase('pt-BR'),
    columns: [column('Indicador'), column('ID IXC'), column(label), column('Quantidade', 'number'), column('Participação', 'percent')],
    rows: [],
  };
  for (const key of commercialKeys) {
    if (key === 'contracts' && dimension === 'channel') continue;
    const records = commercial[key]!;
    const groups = new Map<string | null, { label: string; count: number }>();
    for (const row of records) {
      const id = row[dimension];
      const group = groups.get(id);
      if (group) group.count += 1;
      else groups.set(id, { label: categoryName(row, dimension), count: 1 });
    }
    const ranked = [...groups.entries()].sort(([, a], [, b]) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
    for (const [id, group] of ranked) {
      result.rows.push([commercialLabels[key], id, group.label, group.count, group.count / records.length]);
    }
  }
  return result;
}

export async function loadIndicatorReport(period: CommercialPeriod, scope: ReportScope, signal: AbortSignal): Promise<IndicatorReport> {
  const compared = comparisonPeriod(period, businessToday());
  if (!compared || !(scope in titles)) throw new Error('Selecione o relatório e um período válido de até 92 dias.');
  const salesIncluded = scope !== 'cancelamentos';
  const cancellationsIncluded = scope !== 'vendas';
  const [sales, cancellations] = await Promise.all([
    salesIncluded ? read<CommercialMetrics>(period, 'vendas', signal) : null,
    cancellationsIncluded ? read<CancellationDetails>(period, 'cancelamentos', signal) : null,
  ]);
  if (sales && commercialKeys.some(key => !Array.isArray(sales.metrics[key]))) {
    throw new Error('O IXC retornou dados parciais de vendas. Tente novamente para gerar o relatório completo.');
  }
  if (cancellations) {
    const { records, total, byReason } = cancellations.metrics;
    if (!Array.isArray(records) || records.length !== total || !Array.isArray(byReason)
      || byReason.reduce((sum, reason) => sum + reason.count, 0) !== total) {
      throw new Error('O detalhamento de cancelamentos ou seus motivos está incompleto no IXC. Tente novamente.');
    }
  }
  const [previousSales, previousCancellations] = await Promise.all([
    salesIncluded ? previousReading<CommercialSummary>(compared, 'vendas', signal) : null,
    cancellationsIncluded ? previousReading<{ total: number | null }>(compared, 'cancelamentos', signal) : null,
  ]);
  signal.throwIfAborted();

  const notes: string[] = [];
  const series: { label: string; rows: readonly { date: string }[]; previous?: number | null }[] = [];
  const details: ReportTable[] = [];
  const distributions: ReportTable[] = [];
  if (sales) {
    notes.push('Vendas · leitura do IXC em ' + dateTime.format(new Date(sales.readAt)) + ' (Bragança/PA).',
      'Leads seguem a data de cadastro, vendas fechadas a data de vitória e contratos criados a data de cadastro do contrato.');
    for (const key of commercialKeys) {
      const rows = sales.metrics[key]!;
      series.push({ label: commercialLabels[key], rows, previous: previousSales?.[key] });
      const channel = key !== 'contracts';
      const idLabel = { leads: 'ID do contato', sales: 'ID da negociação', contracts: 'ID do contrato' }[key];
      details.push({
        title: commercialLabels[key],
        columns: [column(idLabel), column('Data', 'date'), ...(channel ? [column('Canal')] : []), column('Responsável')],
        rows: sortCommercialRecordsByDate(rows, 'ascending').map(row => [
          row.id, row.date, ...(channel ? [categoryName(row, 'channel')] : []), categoryName(row, 'responsible'),
        ]),
      });
    }
    distributions.push(distribution(sales.metrics, 'channel'), distribution(sales.metrics, 'responsible'));
  }
  if (cancellations) {
    const { records, byReason, total } = cancellations.metrics;
    notes.push('Cancelamentos · leitura do IXC em ' + dateTime.format(new Date(cancellations.readAt)) + ' (Bragança/PA).',
      'Cancelamentos seguem a data de cancelamento do contrato, independentemente do status atual.');
    series.push({ label: 'Cancelamentos', rows: records, previous: previousCancellations?.total });
    distributions.push({
      title: 'Motivos de cancelamento',
      columns: [column('Motivo'), column('Quantidade', 'number'), column('Participação', 'percent')],
      rows: byReason!.map(reason => [reason.key, reason.count, reason.count / total]),
    });
    details.push({
      title: 'Cancelamentos', columns: [column('ID do contrato'), column('Data', 'date'), column('Motivo')],
      rows: sortCommercialRecordsByDate(records, 'ascending').map(row => [row.id, row.date, row.reason]),
    });
  }

  const summary: ReportTable = {
    title: 'Resumo',
    columns: [column('Indicador'), column('Atual', 'number'), column('Anterior', 'number'), column('Diferença', 'number'),
      column('Variação', 'percent'), column('Média diária atual', 'number')],
    rows: [],
  };
  const days = (Date.parse(period.to) - Date.parse(period.from)) / day + 1;
  const unavailable: string[] = [];
  for (const { label, rows, previous } of series) {
    const current = rows.length;
    const before = typeof previous === 'number' && Number.isSafeInteger(previous) && previous >= 0 ? previous : null;
    const delta = before === null ? null : current - before;
    summary.rows.push([label, current, before, delta, before ? (current - before) / before : null, current / days]);
    if (before === null) unavailable.push(label);
  }
  if (unavailable.length) notes.push('Comparação indisponível para ' + unavailable.join(', ') + '.');
  if (series.some(metric => metric.previous === 0)) notes.push('Variação percentual indefinida quando o período anterior tem zero registros.');
  const counts = series.map(metric => new Map(countCommercialDays(metric.rows).map(item => [item.date, item.count])));
  const daily: ReportTable = {
    title: 'Evolução diária',
    columns: [column('Data', 'date'), ...series.map(metric => column(metric.label, 'number'))],
    rows: Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.parse(period.from) + index * day).toISOString().slice(0, 10);
      return [date, ...counts.map(items => items.get(date) ?? 0)];
    }),
  };
  return { title: titles[scope], period, compared, generatedAt: new Date().toISOString(), notes,
    tables: [summary, daily, ...distributions, ...details] };
}
