import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Workbook, ValueType } from 'exceljs';
import type { IndicatorReport } from '../../lib/analytics/indicator-report';
import { createIndicatorXlsx } from '../../lib/reports/indicator-xlsx';

test('exporta Excel nativo com datas, percentuais e IDs preservados, incluindo todas as linhas', async () => {
  const columns = [
    { label: 'Registro IXC', type: 'text' },
    { label: 'Data', type: 'date' },
    { label: 'Participação', type: 'percent' },
    { label: 'Quantidade', type: 'number' },
    { label: 'Canal', type: 'text' },
  ] as const;
  const report: IndicatorReport = {
    title: 'Vendas e cancelamentos', period: { from: '2026-11-01', to: '2026-11-26' },
    compared: { from: '2026-10-01', to: '2026-10-26' }, generatedAt: '2026-11-26T14:45:00Z',
    notes: ['Comparação parcial.'],
    tables: [
      { title: 'Resumo', columns: [...columns], rows: [
        ['000241', '2026-11-26', 0.175, 0, '=1+2'],
        ['000242', '2026-11-25', null, null, null],
      ] },
      { title: 'Motivos/IXC', columns: [...columns], rows: [] },
      { title: 'motivos:ixc', columns: [...columns], rows: [] },
    ],
  };
  const file = await createIndicatorXlsx(report);
  assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Resumo', 'Motivos IXC', 'motivos ixc (2)']);
  const summary = book.worksheets[0];
  assert.equal(summary.getCell('A1').value, 'Vendas e cancelamentos');
  assert.match(String(summary.getCell('A4').value), /11:45/);
  assert.equal(summary.views[0].state, 'frozen');
  assert.equal(summary.autoFilter, 'A5:E7');
  assert.equal(summary.getCell('A6').value, '000241');
  assert.equal(summary.getCell('B6').type, ValueType.Date);
  assert.equal((summary.getCell('B6').value as Date).toISOString(), '2026-11-26T00:00:00.000Z');
  assert.equal(summary.getCell('C6').value, 0.175);
  assert.equal(summary.getCell('C6').numFmt, '0.0%');
  assert.equal(summary.getCell('D6').value, 0);
  assert.equal(summary.getCell('E6').type, ValueType.String);
  assert.equal(summary.getCell('E6').value, '=1+2');
  assert.equal(summary.getCell('C7').value, null);
  assert.equal(summary.getCell('A10').value, 'Comparação parcial.');
  assert.equal(book.worksheets[1].autoFilter, 'A1:E1');
});
