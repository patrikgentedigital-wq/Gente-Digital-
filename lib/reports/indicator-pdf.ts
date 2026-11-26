import { jsPDF } from 'jspdf';
import { autoTable, type Styles } from 'jspdf-autotable';
import type { IndicatorReport, ReportColumn } from '@/lib/analytics/indicator-report';

const margin = 15;
const top = 32;
const bottom = 18;
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});

function dateLabel(iso: string) {
  return iso.split('-').reverse().join('/');
}

function periodLabel(period: IndicatorReport['period']) {
  return dateLabel(period.from) + ' a ' + dateLabel(period.to);
}

function formatCell(value: string | number | null, column: ReportColumn) {
  if (value == null) return '—';
  if (typeof value === 'number') return column.type === 'percent' ? percent.format(value) : number.format(value);
  return column.type === 'date' ? dateLabel(value) : value;
}

async function loadAsset(filename: string) {
  const response = await fetch('/reports/' + filename, { redirect: 'error' });
  if (!response.ok) throw new Error('Não foi possível carregar os recursos do PDF. Tente novamente.');
  return new Uint8Array(await response.arrayBuffer());
}

export async function createIndicatorPdf(report: IndicatorReport): Promise<Blob> {
  const [regular, semibold, logo] = await Promise.all([
    loadAsset('inter-regular.ttf'), loadAsset('inter-semibold.ttf'), loadAsset('gente-digital.png'),
  ]);
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true, putOnlyUsedFonts: true });
  for (const [style, font] of [['normal', regular], ['bold', semibold]] as const) {
    const file = 'Inter-' + style + '.ttf';
    doc.addFileToVFS(file, Array.from(font, byte => String.fromCharCode(byte)).join(''));
    doc.addFont(file, 'Inter', style);
  }
  doc.setProperties({ title: report.title, subject: periodLabel(report.period), author: 'Gente Digital' });
  doc.setLanguage('pt-BR');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = top + 4;
  function ensureSpace(height: number) {
    if (y + height > pageHeight - bottom) {
      doc.addPage();
      y = top;
    }
  }
  function paragraph(text: string, size: number, weight: 'normal' | 'bold', gap = 2) {
    doc.setFont('Inter', weight).setFontSize(size).setTextColor(29, 47, 45);
    const lineHeight = size * 0.46;
    const lines: string[] = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  }

  paragraph(report.title, 20, 'bold', 3);
  paragraph('Período de ' + periodLabel(report.period), 11, 'bold', 1);
  if (report.compared) paragraph('Comparação com ' + periodLabel(report.compared), 9, 'normal', 1);
  paragraph('Gerado em ' + time.format(new Date(report.generatedAt)) + ' (horário de Fortaleza)', 9, 'normal');
  for (const note of report.notes) paragraph(note, 8.5, 'normal', 0.8);
  y += 2;

  for (const table of report.tables) {
    ensureSpace(31);
    const weights = table.columns.map(column => column.type === 'text' && !/^id\b/i.test(column.label) ? 1.65 : 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const columnStyles: Record<number, Partial<Styles>> = {};
    table.columns.forEach((_, index) => {
      columnStyles[index] = { cellWidth: contentWidth * weights[index] / totalWeight };
    });
    autoTable(doc, {
      startY: y, margin: { top, left: margin, right: margin, bottom },
      theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
      head: [
        [{ content: table.title, colSpan: table.columns.length, styles: {
          fontSize: 13, fillColor: [255, 255, 255], cellPadding: { top: 1, bottom: 3, left: 0, right: 0 },
        } }],
        table.columns.map(column => column.label),
      ],
      body: table.rows.length
        ? table.rows.map(row => table.columns.map((column, i) => formatCell(row[i], column)))
        : [[{ content: 'Nenhum registro no período.', colSpan: table.columns.length }]],
      styles: {
        font: 'Inter', fontSize: 9, overflow: 'linebreak', cellPadding: 2, valign: 'middle',
        textColor: [23, 39, 37],
      },
      headStyles: { fontStyle: 'bold', fillColor: [222, 246, 245] },
      alternateRowStyles: { fillColor: [245, 249, 248] },
      columnStyles,
      didParseCell: ({ cell, column }) => {
        const type = table.columns[column.index].type;
        if (cell.colSpan === 1 && (type === 'number' || type === 'percent')) cell.styles.halign = 'right';
      },
      didDrawPage: ({ cursor }) => { if (cursor) y = cursor.y + 7; },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.addImage(logo, 'PNG', margin, 9, 27, 27 * 594 / 1367, 'gente-digital');
    doc.setFont('Inter', 'bold').setFontSize(10).setTextColor(18, 34, 33);
    doc.text('Indique e Ganhe', pageWidth - margin, 14, { align: 'right' });
    doc.setFont('Inter', 'normal').setFontSize(8);
    doc.text(periodLabel(report.period), pageWidth - margin, 19, { align: 'right' });
    doc.setLineWidth(0.6).setDrawColor(57, 211, 207).line(margin, 25, pageWidth - margin, 25);
    doc.setLineWidth(0.2).setDrawColor(211, 226, 224).line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    doc.setFontSize(8).setTextColor(67, 86, 84);
    doc.text('Gente Digital', margin, pageHeight - 8);
    doc.text('Página ' + page + ' de ' + pages, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  return doc.output('blob');
}
