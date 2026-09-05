'use client';

import { useMemo, useState } from 'react';
import { X, Download, Calendar, DollarSign, Award, CheckCircle2, Clock, AlertCircle, Phone, Tag } from 'lucide-react';
import Avatar from 'boring-avatars';
import { Colaborador, Lead } from '@/lib/supabase';
import { PROGRAM_RULES } from '@/lib/rules';
import { DateFilterState, matchesDateFilter, getPeriodLabel, AvailableMonthOption, extractAvailableMonths } from '@/lib/date-filters';
import { DateRangeFilter } from '@/components/date-range-filter';
import { sanitizeCsvField } from '@/lib/utils';

interface ColaboradorExtratoModalProps {
  colaborador: Colaborador;
  allLeads: Lead[];
  initialFilter?: DateFilterState;
  availableMonths?: AvailableMonthOption[];
  onClose: () => void;
}

export function ColaboradorExtratoModal({
  colaborador,
  allLeads,
  initialFilter = { period: 'this_month' },
  availableMonths,
  onClose,
}: ColaboradorExtratoModalProps) {
  const [dateFilter, setDateFilter] = useState<DateFilterState>(initialFilter);

  const normalizeStr = (str?: string) =>
    str ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';

  const colabIdNorm = normalizeStr(colaborador.id);
  const colabNameNorm = normalizeStr(colaborador.name);

  // Filtra apenas os leads associados a este técnico/colaborador
  const colabLeads = useMemo(() => {
    return allLeads.filter(lead => {
      const refNorm = normalizeStr(lead.ref);
      return refNorm === colabIdNorm || refNorm === colabNameNorm;
    });
  }, [allLeads, colabIdNorm, colabNameNorm]);

  const effectiveAvailableMonths = useMemo(() => {
    if (availableMonths && availableMonths.length > 0) return availableMonths;
    return extractAvailableMonths(colabLeads.map(l => l.created_at));
  }, [availableMonths, colabLeads]);

  // Filtra pelo período de apuração de data
  const filteredLeads = useMemo(() => {
    return colabLeads.filter(lead => matchesDateFilter(lead.created_at, dateFilter));
  }, [colabLeads, dateFilter]);

  // Métricas do período
  const totalIndicacoes = filteredLeads.length;
  const vendasGanhas = filteredLeads.filter(l => l.status === 'Ganho').length;
  const emAndamento = filteredLeads.filter(l => ['Pendente', 'Contato inicial', 'Em negociação'].includes(l.status)).length;
  const erros = filteredLeads.filter(l => l.status === 'Errado').length;

  // Cálculo de comissão
  const taxaPorVenda = vendasGanhas >= PROGRAM_RULES.colaborador.volumeThreshold
    ? PROGRAM_RULES.colaborador.taxaVolume
    : PROGRAM_RULES.colaborador.taxaPorVenda;

  const totalComissao = vendasGanhas * taxaPorVenda;
  const atingiuMetaBonus = vendasGanhas >= PROGRAM_RULES.bonusTop.minimoIndicacoes;

  const handleExportCSV = () => {
    const headers = [
      'ID Lead',
      'Cliente',
      'Telefone',
      'Data da Indicacao',
      'Status',
      'Valor Venda (R$)',
      'Origem',
      'Motivo Perda/Erro',
      'Comissao Prevista (R$)'
    ];

    const rows = filteredLeads.map(l => [
      sanitizeCsvField(l.id),
      sanitizeCsvField(l.name),
      sanitizeCsvField(l.phone),
      sanitizeCsvField(l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '-'),
      sanitizeCsvField(l.status),
      sanitizeCsvField(l.value || 0),
      sanitizeCsvField(l.source || 'link_indicacao'),
      sanitizeCsvField(l.loss_reason || '-'),
      sanitizeCsvField(l.status === 'Ganho' ? taxaPorVenda : 0)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `extrato_${colaborador.id}_${colaborador.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Ganho':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
      case 'Errado':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20';
      case 'Em negociação':
        return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20';
      case 'Contato inicial':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3.5">
            {colaborador.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={colaborador.photo_url}
                alt={colaborador.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-amber-400 shadow-sm"
              />
            ) : (
              <Avatar size={48} name={colaborador.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB']} />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl font-bold text-zinc-900 dark:text-white">{colaborador.name}</h3>
                <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-600 dark:text-amber-400 font-mono text-xs font-bold border border-amber-400/30">
                  {colaborador.id}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{colaborador.email} • Extrato detalhado de indicações</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-amber-400 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-bold transition-all shadow-xs"
              title="Exportar extrato do técnico em CSV"
            >
              <Download className="w-4 h-4 text-amber-500" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar de Filtro por Data */}
        <div className="px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-50/20 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Período de Apuração da Comissão:</span>
          </div>
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} availableMonths={effectiveAvailableMonths} />
        </div>

        {/* Cards de Métricas do Período */}
        <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50/30 dark:bg-zinc-900/50">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">Indicações</span>
            <span className="font-display text-2xl font-bold text-zinc-900 dark:text-white mt-1 block">{totalIndicacoes}</span>
            <span className="text-[10px] text-zinc-400">no período</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Vendas Ganhas</span>
            <span className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">{vendasGanhas}</span>
            <span className="text-[10px] text-zinc-400">instaladas</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">Taxa Aplicada</span>
            <span className="font-display text-2xl font-bold text-zinc-900 dark:text-white mt-1 block">
              R$ {taxaPorVenda},00
            </span>
            <span className="text-[10px] text-zinc-400">
              {vendasGanhas >= PROGRAM_RULES.colaborador.volumeThreshold ? 'Volume (10+ vendas)' : 'Padrão (1 a 9 vendas)'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-400/10 to-transparent border border-amber-500/30 shadow-xs">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Comissão PIX</span>
            <span className="font-display text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalComissao)}
            </span>
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
              {atingiuMetaBonus ? '🎉 Bônus Top Liberado!' : `Faltam ${Math.max(0, PROGRAM_RULES.bonusTop.minimoIndicacoes - vendasGanhas)} p/ bônus`}
            </span>
          </div>
        </div>

        {/* Tabela de Indicações */}
        <div className="flex-1 overflow-y-auto p-6 pt-2">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-zinc-100/70 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 uppercase font-bold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Cliente (Lead)</th>
                  <th className="px-4 py-3">Data Indicação</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Valor / Plano</th>
                  <th className="px-4 py-3">Canal Origem</th>
                  <th className="px-4 py-3 text-right">Comissão PIX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                      Nenhuma indicação deste colaborador no período selecionado ({getPeriodLabel(dateFilter)}).
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map(lead => (
                    <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold">
                        <div className="text-zinc-900 dark:text-white font-bold">{lead.name}</div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{lead.phone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {lead.created_at ? (
                          <>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                              {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="block text-[10px] text-zinc-400">
                              {new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${getStatusBadge(lead.status)}`}>
                          {lead.status}
                        </span>
                        {lead.loss_reason && (
                          <span className="block text-[10px] text-red-500 dark:text-red-400 mt-1 truncate max-w-[140px]" title={lead.loss_reason}>
                            Motivo: {lead.loss_reason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {lead.value && lead.value > 0 ? (
                          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value)
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                          <Tag className="w-2.5 h-2.5" />
                          {lead.source === 'ms_forms'
                            ? 'MS Forms'
                            : lead.source === 'manual'
                            ? 'Manual'
                            : 'Link do Técnico'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold">
                        {lead.status === 'Ganho' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            R$ {taxaPorVenda},00
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-[11px] font-normal">Pendente venda</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-center justify-between text-xs text-zinc-500">
          <span>Mostrando {filteredLeads.length} indicação(ões) de {colaborador.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-xl transition-colors shadow-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
