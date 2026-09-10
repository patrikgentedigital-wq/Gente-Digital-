import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeAttendance,
  summarizeCancellations,
  summarizeGeneral,
} from '../../lib/analytics/metrics';
import type { MetricWindow } from '../../lib/analytics/metrics';

const window: MetricWindow = {
  from: '2026-09-01T00:00:00-03:00',
  to: '2026-09-30T23:59:59-03:00',
  timezone: 'America/Sao_Paulo',
};

test('summarizeAttendance conta protocolos únicos e separa vínculo', () => {
  const result = summarizeAttendance([
    { source_id: 'a', protocolo: 'p-1', contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'vinculado', canal: 'whatsapp', status: 'finalizado', data_referencia: '2026-09-02T10:00:00Z' },
    { source_id: 'b', protocolo: 'p-1', contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'vinculado', canal: 'whatsapp', status: 'finalizado', data_referencia: '2026-09-02T10:01:00Z' },
    { source_id: 'c', protocolo: 'p-2', contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'nao_vinculado', canal: 'telefone', status: 'aberto', data_referencia: '2026-09-03T10:00:00Z' },
  ], window);

  assert.equal(result.total, 2);
  assert.equal(result.linked, 1);
  assert.equal(result.unlinked, 1);
  assert.deepEqual(result.byChannel, [{ key: 'telefone', count: 1 }, { key: 'whatsapp', count: 1 }]);
});

test('summarizeAttendance inclui os limites, ignora datas inválidas e ordena empates por chave', () => {
  const result = summarizeAttendance([
    { source_id: 'a', protocolo: null, contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'nao_vinculado', canal: 'z', status: 'aberto', data_referencia: '2026-09-01T03:00:00Z' },
    { source_id: 'b', protocolo: null, contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'ambiguo', canal: 'a', status: 'fechado', data_referencia: '2026-10-01T03:00:00Z' },
    { source_id: 'invalid', protocolo: 'invalid', contato_bruto: null, tipo_identificador: 'unknown', status_vinculo: 'vinculado', canal: 'a', status: 'aberto', data_referencia: 'sem-data' },
  ], window);

  assert.deepEqual(result, { total: 1, linked: 0, unlinked: 1, byChannel: [{ key: 'z', count: 1 }], byStatus: [{ key: 'aberto', count: 1 }] });
});

test('summarizeCancellations filtra a janela, deduplica source_id e conta tipos', () => {
  const result = summarizeCancellations([
    { source_id: 'c-1', motivo: 'preco', tipo: 'cancelamento', data_referencia: '2026-09-05T10:00:00Z' },
    { source_id: 'c-1', motivo: 'preco', tipo: 'cancelamento', data_referencia: '2026-09-05T10:01:00Z' },
    { source_id: 'c-2', motivo: null, tipo: 'renovacao', data_referencia: '2026-09-06T10:00:00Z' },
    { source_id: 'c-3', motivo: 'plano', tipo: 'upgrade', data_referencia: '2026-09-07T10:00:00Z' },
    { source_id: 'c-4', motivo: 'plano', tipo: 'downgrade', data_referencia: '2026-09-08T10:00:00Z' },
    { source_id: 'outside', motivo: 'mudanca', tipo: 'cancelamento', data_referencia: '2026-08-31T23:59:59Z' },
  ], window);

  assert.equal(result.total, 1);
  assert.deepEqual(result.byReason, [{ key: 'preco', count: 1 }]);
  assert.deepEqual(result, { total: 1, byReason: [{ key: 'preco', count: 1 }], renewals: 1, upgrades: 1, downgrades: 1 });
});

test('summarizeGeneral conta cada conjunto por source_id dentro da janela', () => {
  const record = (source_id: string, data_referencia: string) => ({ source_id, data_referencia });
  const result = summarizeGeneral({
    leads: [record('l-1', '2026-09-01'), record('l-1', '2026-09-02'), record('l-2', '2026-09-30')],
    sales: [record('s-1', '2026-09-10'), record('s-out', '2026-10-02')],
    contracts: [record('c-1', '2026-09-15')],
    preContracts: [record('p-1', '2026-09-20'), record('p-2', 'sem-data')],
  }, window);

  assert.deepEqual(result, { leads: 2, sales: 1, contracts: 1, preContracts: 1 });
});
