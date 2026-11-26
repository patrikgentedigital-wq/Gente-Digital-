import { useState } from 'react';
import { PROGRAM_RULES } from '@/lib/rules';
import { getPeriodLabel, parseFlexibleDate, type DateFilterState } from '@/lib/date-filters';
import type { Lead } from '@/lib/supabase';

const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const number = new Intl.NumberFormat('pt-BR');
const statusOrder = ['Pendente', 'Contato inicial', 'Em negociação', 'Ganho', 'Errado'];
const seriesColors = ['#94aaa8', 'var(--gd-turquoise)', 'var(--gd-yellow)', 'var(--gd-teal-mid)', '#a84b44'];

interface Leader {
  id: string;
  name: string;
  conversions: number;
  points: number;
  totalReferred: number;
}

interface Props {
  leads: Lead[];
  filtered: Lead[];
  period: DateFilterState;
  team: Leader[];
  clients: Leader[];
}

function monthlyHistory(leads: Lead[], period: DateFilterState) {
  const today = new Date();
  const end = period.period === 'specific_month'
    ? new Date(period.year ?? today.getFullYear(), period.month ?? today.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth() - (period.period === 'last_month' ? 1 : 0), 1);
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(end.getFullYear(), end.getMonth() - 5 + index, 1);
    return { date, name: monthName.format(date).replace('.', ''), key: date.getFullYear() * 12 + date.getMonth(), leads: 0, won: 0, byStatus: new Map<string, number>() };
  });
  for (const lead of leads) {
    const date = parseFlexibleDate(lead.created_at);
    if (!date) continue;
    const month = buckets[date.getFullYear() * 12 + date.getMonth() - buckets[0].key];
    if (!month) continue;
    month.leads++;
    if (lead.status === 'Ganho') month.won++;
    const status = lead.status || 'Sem situação';
    month.byStatus.set(status, (month.byStatus.get(status) ?? 0) + 1);
  }
  return buckets;
}

export function ReferralCharts({ leads, filtered, period, team, clients }: Props) {
  const [metric, setMetric] = useState<'leads' | 'won'>('leads');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [group, setGroup] = useState<'team' | 'clients'>('team');
  const buckets = monthlyHistory(leads, period);
  const previous = buckets[4];
  const latest = buckets[5];
  const current = buckets.find(month => month.key === selectedMonth) ?? latest;
  const max = Math.max(4, ...buckets.map(month => month[metric]));
  const unit = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max / (unit / 2)) * (unit / 2);
  const ranked = group === 'team' ? team : clients;
  const counts = new Map<string, number>();
  for (const lead of filtered) {
    const status = lead.status || 'Sem situação';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const statuses = [...statusOrder, ...Array.from(counts.keys()).filter(status => !statusOrder.includes(status))];
  const rate = (month: typeof latest) => month.leads ? month.won / month.leads : null;
  const asPercent = (n: number | null) => n === null ? '—' : n.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const seriesName = metric === 'won' ? 'conversões' : 'leads';

  return (
    <div className="referral-overview">
      <section>
        <h3>Evolução das indicações</h3>
        <p className="program-note">{buckets[0].name}/{buckets[0].date.getFullYear()} a {latest.name}/{latest.date.getFullYear()}</p>
        <div className="referral-chart-toolbar">
          <p aria-live="polite"><strong>{number.format(current[metric])}</strong> {seriesName} em {current.name}.</p>
          <div className="program-switch" role="group" aria-label="Métrica da evolução">
            <button type="button" aria-pressed={metric === 'leads'} onClick={() => setMetric('leads')}>Leads</button>
            <button type="button" aria-pressed={metric === 'won'} onClick={() => setMetric('won')}>Ganhos</button>
          </div>
        </div>
        <div className="referral-plot" aria-label={'Evolução de ' + seriesName}>
          <div className="referral-axis" aria-hidden="true"><span>{number.format(ceiling)}</span><span>{number.format(Math.round(ceiling / 2))}</span><span>0</span></div>
          {buckets.map(month => (
            <button type="button" key={month.key} className="referral-column" aria-pressed={month.key === current.key} onClick={() => setSelectedMonth(month.key)}
              aria-label={month.name + ' de ' + month.date.getFullYear() + ', ' + month[metric] + ' ' + seriesName}
              title={Array.from(month.byStatus.entries()).map(([s, n]) => s + ': ' + n).join(' · ')}>
              <span className="referral-track"><span className="referral-fill" data-low={month[metric] / ceiling < 0.15 || undefined} style={{ height: (100 * month[metric] / ceiling) + '%' }}><b>{number.format(month[metric])}</b></span></span>
              <span>{month.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Ranking de indicações</h3><p className="program-note">Pontuação no período selecionado.</p>
        <div className="program-switch referral-ranking-switch" role="group" aria-label="Grupo do ranking">
          <button type="button" onClick={() => setGroup('team')} aria-pressed={group === 'team'}>Colaboradores</button>
          <button type="button" onClick={() => setGroup('clients')} aria-pressed={group === 'clients'}>Clientes</button>
        </div>
        {ranked.length ? <ol className="referral-ranking">{ranked.map((person, i) => (
          <li key={person.id}><span className="program-note">{i + 1}º</span>
            <span className="referral-initial" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
            <div><p>{person.name}</p><small>{person.totalReferred} indicações · {person.conversions} ganhos</small></div>
            <b>{number.format(person.points)} <small>pts</small></b>
          </li>
        ))}</ol> : <p className="program-note">Nenhuma indicação para este grupo no período.</p>}
        <p className="program-note referral-key">{PROGRAM_RULES.pontos.porIndicacao} pts por indicação · {PROGRAM_RULES.pontos.porConversao} pts por conversão</p>
      </section>
      <section><h3>Leads por situação</h3><p className="program-note">{getPeriodLabel(period)} · {number.format(filtered.length)} leads</p>
        {!!filtered.length && <div className="referral-stack" aria-hidden="true">{statuses.map((status,i) => counts.has(status) && <span key={status} style={{flex:counts.get(status),background:seriesColors[i] ?? 'var(--gd-teal-ink)'}} />)}</div>}
        <ul className="referral-breakdown">{statuses.map((status,i) => <li key={status}><i style={{background:seriesColors[i] ?? 'var(--gd-teal-ink)'}} />{status}<b>{number.format(counts.get(status) ?? 0)}</b></li>)}</ul>
      </section>
      <section><h3>Comparação mensal</h3><p className="program-note">Últimos dois meses do gráfico.</p>
        <table className="referral-comparison"><thead><tr><th scope="col">Indicador</th><th scope="col">{previous.name}/{previous.date.getFullYear()}</th><th scope="col">{latest.name}/{latest.date.getFullYear()}</th></tr></thead>
          <tbody><tr><th scope="row">Leads</th><td>{number.format(previous.leads)}</td><td>{number.format(latest.leads)}</td></tr>
          <tr><th scope="row">Conversões</th><td>{number.format(previous.won)}</td><td>{number.format(latest.won)}</td></tr>
          <tr><th scope="row">Taxa de conversão</th><td>{asPercent(rate(previous))}</td><td>{asPercent(rate(latest))}</td></tr></tbody></table>
      </section>
    </div>
  );
}
