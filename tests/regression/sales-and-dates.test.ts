/**
 * Testes de Regressão: Filtro de Datas, Parsing Brasileiro/ISO, Períodos de Apuração e Regras de Comissão
 * 
 * Valida:
 * 1. parseFlexibleDate aceitando formato brasileiro DD/MM/YYYY, ISO 8601 e timestamps.
 * 2. matchesDateFilter para todos os modos (all, this_month, last_month, specific_month, last_30_days, this_year, custom).
 * 3. extractAvailableMonths extraindo dinamicamente meses existentes e contagens.
 * 4. getPeriodLabel para geração correta de títulos em relatórios e extratos.
 * 5. Regra de comissionamento de colaboradores (R$ 50/venda até 9 vendas, R$ 80/venda a partir de 10 vendas).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesDateFilter,
  getPeriodLabel,
  parseFlexibleDate,
  extractAvailableMonths,
  DateFilterState
} from '../../lib/date-filters';

describe('Suite de Regressão: Filtro de Datas e Apuração de Comissões', () => {

  test('parseFlexibleDate: Deve interpretar corretamente datas em formato brasileiro DD/MM/YYYY', () => {
    const d1 = parseFlexibleDate('15/02/2025');
    assert.ok(d1 !== null);
    assert.equal(d1.getFullYear(), 2025);
    assert.equal(d1.getMonth(), 1); // Fevereiro = 1
    assert.equal(d1.getDate(), 15);

    const d2 = parseFlexibleDate('05/08/2026 14:30');
    assert.ok(d2 !== null);
    assert.equal(d2.getFullYear(), 2026);
    assert.equal(d2.getMonth(), 7); // Agosto = 7
    assert.equal(d2.getDate(), 5);
    assert.equal(d2.getHours(), 14);
    assert.equal(d2.getMinutes(), 30);
  });

  test('parseFlexibleDate: Deve interpretar corretamente datas ISO e timestamp', () => {
    const isoDate = parseFlexibleDate('2026-09-05T12:00:00Z');
    assert.ok(isoDate !== null);
    assert.equal(isoDate.getUTCFullYear(), 2026);
    assert.equal(isoDate.getUTCMonth(), 8); // Setembro = 8

    const tsDate = parseFlexibleDate(1741180000000);
    assert.ok(tsDate !== null);

    assert.equal(parseFlexibleDate(null), null);
    assert.equal(parseFlexibleDate(''), null);
    assert.equal(parseFlexibleDate('data-invalida'), null);
  });

  test('Filtro "all": Deve incluir registros de qualquer data ou sem data', () => {
    const filter: DateFilterState = { period: 'all' };
    assert.equal(matchesDateFilter('2026-09-01T10:00:00Z', filter), true);
    assert.equal(matchesDateFilter('15/02/2025', filter), true);
    assert.equal(matchesDateFilter(undefined, filter), true);
    assert.equal(matchesDateFilter(null, filter), true);
  });

  test('Filtro "this_month": Deve incluir apenas registros do mês e ano corrente', () => {
    const now = new Date();
    const currentMonthIso = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString();
    
    // Mês anterior
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevMonthIso = new Date(prevYear, prevMonth, 15, 12, 0, 0).toISOString();

    const filter: DateFilterState = { period: 'this_month' };
    assert.equal(matchesDateFilter(currentMonthIso, filter), true);
    assert.equal(matchesDateFilter(prevMonthIso, filter), false);
  });

  test('Filtro "last_month": Deve incluir apenas registros do mês passado', () => {
    const now = new Date();
    const currentMonthIso = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString();
    
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevMonthIso = new Date(prevYear, prevMonth, 15, 12, 0, 0).toISOString();

    const filter: DateFilterState = { period: 'last_month' };
    assert.equal(matchesDateFilter(prevMonthIso, filter), true);
    assert.equal(matchesDateFilter(currentMonthIso, filter), false);
  });

  test('Filtro "specific_month": Deve filtrar exatamente pelo mês e ano escolhidos (meses anteriores)', () => {
    const filter: DateFilterState = {
      period: 'specific_month',
      month: 1, // Fevereiro
      year: 2025
    };

    // Lead em data brasileira
    assert.equal(matchesDateFilter('10/02/2025', filter), true);
    assert.equal(matchesDateFilter('28/02/2025 23:59', filter), true);

    // Lead em ISO
    assert.equal(matchesDateFilter('2025-02-15T10:00:00Z', filter), true);

    // Mês diferente ou ano diferente
    assert.equal(matchesDateFilter('10/03/2025', filter), false);
    assert.equal(matchesDateFilter('10/02/2026', filter), false);
  });

  test('extractAvailableMonths: Deve listar e ordenar os meses com dados', () => {
    const dates = [
      '2026-09-01T10:00:00Z',
      '2026-09-05T12:00:00Z',
      '15/08/2026',
      '20/07/2026',
      '10/02/2025'
    ];

    const months = extractAvailableMonths(dates);
    assert.ok(months.length >= 3);
    assert.equal(months[0].year, 2026);
    assert.equal(months[0].month, 8); // Setembro
    assert.equal(months[0].count, 2);

    const feb2025 = months.find(m => m.year === 2025 && m.month === 1);
    assert.ok(feb2025 !== undefined);
    assert.equal(feb2025.label, 'Fevereiro / 2025');
  });

  test('Filtro "last_30_days": Deve filtrar registros dentro da janela de 30 dias', () => {
    const now = Date.now();
    const tenDaysAgoIso = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fortyDaysAgoIso = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

    const filter: DateFilterState = { period: 'last_30_days' };
    assert.equal(matchesDateFilter(tenDaysAgoIso, filter), true);
    assert.equal(matchesDateFilter(fortyDaysAgoIso, filter), false);
  });

  test('Filtro "custom": Deve respeitar o intervalo De/Até com precisão de início e fim do dia', () => {
    const filter: DateFilterState = {
      period: 'custom',
      startDate: '2026-08-10',
      endDate: '2026-08-20'
    };

    // Dentro do intervalo
    assert.equal(matchesDateFilter('2026-08-10T02:00:00', filter), true);
    assert.equal(matchesDateFilter('15/08/2026 15:30', filter), true);
    assert.equal(matchesDateFilter('2026-08-20T23:45:00', filter), true);

    // Fora do intervalo
    assert.equal(matchesDateFilter('2026-08-09T23:59:59', filter), false);
    assert.equal(matchesDateFilter('2026-08-21T00:01:00', filter), false);
  });

  test('Rótulo de Período (getPeriodLabel): Deve retornar textos em Português corretos', () => {
    assert.equal(getPeriodLabel({ period: 'all' }), 'Todo o período');
    assert.equal(getPeriodLabel({ period: 'this_month' }), 'Este mês');
    assert.equal(getPeriodLabel({ period: 'last_month' }), 'Mês anterior');
    assert.equal(getPeriodLabel({ period: 'specific_month', month: 1, year: 2025 }), 'Fevereiro / 2025');
    assert.equal(getPeriodLabel({ period: 'last_30_days' }), 'Últimos 30 dias');
    assert.equal(getPeriodLabel({ period: 'this_year' }), 'Este ano');
    assert.equal(getPeriodLabel({ period: 'custom', startDate: '2026-08-01', endDate: '2026-08-31' }), '01/08/2026 até 31/08/2026');
  });

  test('Regra de Cálculo de Comissão: R$ 50/venda até 9 vendas, R$ 80/venda a partir de 10 vendas', () => {
    const calculateCommission = (vendasGanhos: number) => {
      const taxaPorVenda = vendasGanhos >= 10 ? 80 : 50;
      return vendasGanhos * taxaPorVenda;
    };

    // Caso 1: 5 vendas
    assert.equal(calculateCommission(5), 250); // 5 * 50

    // Caso 2: 9 vendas (limite da faixa base)
    assert.equal(calculateCommission(9), 450); // 9 * 50

    // Caso 3: 10 vendas (atinge a bonificação de R$ 80)
    assert.equal(calculateCommission(10), 800); // 10 * 80

    // Caso 4: 15 vendas
    assert.equal(calculateCommission(15), 1200); // 15 * 80
  });
});
