import { Workbook, type Font, type Worksheet } from 'exceljs';
import type { IndicatorReport, ReportColumn } from '../analytics/indicator-report';

const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const teal = 'FF39D3CF';
const ink = 'FF111918';
const textFont: Partial<Font> = { name: 'Inter', size: 11, color: { argb: ink } };
const generatedDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const formats = { text: '@', number: '#,##0', percent: '0.0%', date: 'dd/mm/yyyy' };

function periodLabel(period: IndicatorReport['period']) {
  return [period.from, period.to].map(date => date.split('-').reverse().join('/')).join(' a ');
}

function sheetName(title: string, workbook: Workbook) {
  const cleaned = title.replace(/[:\\/?*[\]]/g, ' ').replace(/'/g, '’').trim();
  const base = cleaned && cleaned.toLowerCase() !== 'history' ? cleaned : 'Dados';
  let name = base.slice(0, 31);
  const existing = new Set(workbook.worksheets.map(sheet => sheet.name.toLowerCase()));
  for (let index = 2; existing.has(name.toLowerCase()); index++) {
    const suffix = ' (' + index + ')';
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  return name;
}

function addBanner(sheet: Worksheet, text: string, columnCount: number, fontSize: number) {
  const row = sheet.addRow([text]);
  if (columnCount > 1) sheet.mergeCells(row.number, 1, row.number, columnCount);
  const cell = row.getCell(1);
  cell.font = { ...textFont, size: fontSize, bold: fontSize > 11 };
  cell.alignment = { vertical: 'middle', wrapText: true };
  const availableWidth = sheet.columns.reduce((sum, column) => sum + (column.width ?? 15), 0);
  const lines = text.split('\n').reduce((sum, line) =>
    sum + Math.max(1, Math.ceil((line.length * fontSize / 10) / Math.max(1, availableWidth - 3))), 0);
  row.height = Math.max(fontSize === 17 ? 34 : 21, lines * (fontSize + 5) + 5);
}

function excelValue(value: string | number | null, type: ReportColumn['type']) {
  if (value == null) return null;
  if (type === 'date' && typeof value === 'string') return new Date(value + 'T00:00:00.000Z');
  return type === 'text' ? String(value) : value;
}

export async function createIndicatorXlsx(report: IndicatorReport): Promise<Blob> {
  const workbook = new Workbook();
  workbook.creator = 'Gente Digital';
  workbook.title = report.title;
  workbook.created = new Date(report.generatedAt);

  for (const [index, table] of report.tables.entries()) {
    const sheet = workbook.addWorksheet(sheetName(table.title, workbook), {
      properties: { defaultRowHeight: 17, tabColor: { argb: teal } },
    });
    const columnCount = table.columns.length;
    sheet.columns = table.columns.map((column, columnIndex) => {
      let width = Math.max(14, column.label.length + 5);
      if (column.type === 'text') {
        for (const row of table.rows) width = Math.max(width, String(row[columnIndex] ?? '').length + 3);
      }
      return { width: Math.min(64, width), style: { font: textFont, numFmt: formats[column.type] } };
    });

    if (index === 0) {
      addBanner(sheet, report.title, columnCount, 17);
      addBanner(sheet, 'Período de ' + periodLabel(report.period), columnCount, 11);
      if (report.compared) addBanner(sheet, 'Comparação com ' + periodLabel(report.compared), columnCount, 11);
      addBanner(sheet, 'Gerado em ' + generatedDate.format(workbook.created) + ' (Fortaleza)', columnCount, 11);
    }
    const header = sheet.addRow(table.columns.map(column => column.label));
    header.height = 24;
    header.eachCell(cell => {
      cell.font = { ...textFont, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: teal } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    for (const values of table.rows) {
      const row = sheet.addRow(values.map((value, i) => excelValue(value, table.columns[i].type)));
      for (const [i, value] of values.entries()) {
        if (table.columns[i].type === 'number' && typeof value === 'number' && !Number.isInteger(value)) {
          row.getCell(i + 1).numFmt = '#,##0.0#';
        }
        if (typeof value === 'string' && table.columns[i].type === 'text') {
          const width = sheet.getColumn(i + 1).width ?? 14;
          if (value.length + 2 > width || value.includes('\n')) {
            row.getCell(i + 1).alignment = { wrapText: true, vertical: 'top' };
            const lines = value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width - 2))), 0);
            row.height = Math.min(409, Math.max(row.height ?? 17, lines * 17));
          }
        }
      }
    }
    sheet.views = [{ state: 'frozen', ySplit: header.number, showGridLines: false }];
    sheet.autoFilter = {
      from: { row: header.number, column: 1 },
      to: { row: header.number + table.rows.length, column: columnCount },
    };
    if (index === 0 && report.notes.length) {
      sheet.addRow([]);
      addBanner(sheet, 'Notas da consulta', columnCount, 12);
      for (const note of report.notes) addBanner(sheet, note, columnCount, 11);
    }
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], { type: xlsxMime });
}
