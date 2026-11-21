import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadCommercialMetrics, parseCommercialPeriod } from '../../lib/analytics/commercial-ixc';

test('prioriza as três leituras de indicadores antes dos catálogos de nomes', async () => {
  const metricTables = ['contato', 'crm_negociacoes', 'cliente_contrato'];
  const completedMetrics = new Set<string>();
  const startedCatalogs: string[] = [];
  const result = await loadCommercialMetrics(
    { from: '2026-10-01', to: '2026-10-31' },
    async (table) => {
      if (metricTables.includes(table)) {
        await Promise.resolve();
        completedMetrics.add(table);
      } else {
        startedCatalogs.push(table);
        assert.deepEqual(completedMetrics, new Set(metricTables));
      }
      return { total: '0' };
    },
  );
  assert.deepEqual(result, { leads: [], sales: [], contracts: [] });
  assert.deepEqual(startedCatalogs, []);
});

test('criação usa a data de cadastro e inclui o último dia do período', async () => {
  const result = await loadCommercialMetrics(
    { from: '2026-10-01', to: '2026-10-31' },
    async (table, body) => {
      if (table !== 'cliente_contrato') return { total: '0' };
      assert.equal(body.qtype, 'cliente_contrato.data_cadastro_sistema');
      assert.deepEqual(JSON.parse(body.grid_param), [
        { TB: 'cliente_contrato.data_cadastro_sistema', OP: '<', P: '2026-11-01' },
      ]);
      return { total: '1', registros: [{
        id: '10', id_vendedor: '7', data_cadastro_sistema: '2026-10-31',
        data_ativacao: '2026-11-02', id_cliente: '123',
      }] };
    },
  );
  assert.deepEqual(result.contracts, [{ id: '10', date: '2026-10-31', channel: null, channelName: null, responsible: '7', responsibleName: null }]);
  assert.deepEqual(result.sales, []);
});

test('uma resposta parcial não vira total válido e as outras métricas continuam disponíveis', async () => {
  const result = await loadCommercialMetrics(
    { from: '2026-10-01', to: '2026-10-31' },
    async (table) => table === 'contato'
      ? { total: '2', registros: [{ id: '10', data_cadastro: '2026-10-31' }] }
      : { total: '0' },
  );
  assert.equal(result.leads, null);
  assert.deepEqual(result.contracts, []);
});

test('rejeita datas inexistentes e intervalos invertidos', () => {
  assert.throws(() => parseCommercialPeriod(new URLSearchParams('from=2026-02-30&to=2026-03-01')));
  assert.throws(() => parseCommercialPeriod(new URLSearchParams('from=2026-10-02&to=2026-10-01')));
});


test('pagina por ID até completar o total e preserva o dia local dos leads', async () => {
  const pages: string[] = [];
  const result = await loadCommercialMetrics(
    { from: '2026-10-01', to: '2026-10-31' },
    async (table, body) => {
      if (table !== 'contato') return { total: '0' };
      pages.push(body.page);
      assert.equal(body.sortname, 'contato.id');
      const ids = body.page === '1'
        ? Array.from({ length: 250 }, (_, index) => index + 1)
        : [251];
      return { total: '251', registros: ids.map((id) => ({
        id, data_cadastro: '2026-10-31 23:58:00', id_candidato_tipo: '12',
      })) };
    },
  );
  assert.deepEqual(pages, ['1', '2']);
  assert.equal(result.leads?.length, 251);
  assert.deepEqual(result.leads?.at(-1), {
    id: '251', date: '2026-10-31', channel: '12', channelName: null, responsible: null, responsibleName: null,
  });
});

test('resolve canal e responsável pelos catálogos corretos mesmo quando os IDs são iguais', async () => {
  const replies: Record<string, unknown> = {
    contato: { total: 1, registros: [{ id: '4', data_cadastro: '2026-10-31', id_candidato_tipo: '7', id_responsavel: '8' }] },
    crm_negociacoes: { total: 1, registros: [{ id: '5', data_vencemos: '2026-10-31', id_canal_origem: '7', id_responsavel: '8' }] },
    cliente_contrato: { total: 1, registros: [{ id: '6', data_cadastro_sistema: '2026-10-31', id_vendedor: '8' }] },
    crm_tipo_candidato: { total: 1, registros: [{ id: '7', tipo: ' Indicação ', ativo: 'N' }] },
    funcionarios: { total: 1, registros: [{ id: '8', funcionario: 'Ana Lima', nome_mae: 'Campo privado' }] },
    vendedor: { total: 1, registros: [{ id: '8', nome: 'Rui Silva' }] },
  };
  const result = await loadCommercialMetrics(
    { from: '2026-10-01', to: '2026-10-31' }, async (table) => replies[table],
  );
  assert.deepEqual(result.leads?.[0], {
    id: '4', date: '2026-10-31', channel: '7', channelName: 'Indicação',
    responsible: '8', responsibleName: 'Ana Lima',
  });
  assert.equal(result.sales?.[0]?.channelName, 'Indicação');
  assert.equal(result.sales?.[0]?.responsibleName, 'Ana Lima');
  assert.equal(result.contracts?.[0]?.responsibleName, 'Rui Silva');
});
