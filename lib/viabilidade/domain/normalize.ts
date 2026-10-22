import type { Point, Region, SheetCto } from './types';

export function canonicalKey(region: Region, name: string): string | null {
  let normalized = name.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
  // O cadastro CP também usa N026-1x8 LUZ ... PON ...; esses valores não são vagas.
  const technical=normalized.match(/^((?:(?:AC|CP)\s*[-–]?\s*CTO\s*)?N\s*[-–]?\s*0*\d+)\s*[-–]\s*1\s*X\d+(.*)$/);
  if(technical) {
    const rest=technical[2]!.replace(/LUZ|PON|DBM?/g,'');
    if(!/^[\d\s.,=+\-/]*$/.test(rest))return null;
    normalized=technical[1]!;
  }
  const match = normalized.match(/^(?:(AC|CP)\s*[-–]?\s*CTO\s*)?N\s*[-–]?\s*0*(\d+)(?:\s*=\s*V\d+\s*-\s*\d{2}\/\d{2}\/\d{2,4})?$/);
  if (!match?.[2] || (match[1] && match[1]!==region)) return null;
  const number = Number(match[2]);
  return Number.isSafeInteger(number) && number > 0 ? `${region}:${number}` : null;
}

function cell(row: unknown[], index: number): string {
  const value = row[index];
  return value == null ? '' : String(value).trim();
}

export function parseAvailable(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : null;
}

export function parseUpdatedOn(raw: string): string | null {
  const value = raw.trim();
  let match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return validDate(Number(year), Number(month), Number(day)) ? `${year}-${month}-${day}` : null;
  }
  match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return validDate(Number(year), Number(month), Number(day)) ? value : null;
  }
  return null;
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parsePoint(raw: string): Point | null {
  const parts = raw.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!parts) return null;
  const latitude = Number(parts[1]);
  const longitude = Number(parts[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const SHEETS = { CP: 'CTO,s CP', AC: 'CTO,s AC' } as const;
const HEADERS: Record<Region, { row: number; name: string; vacancies: string; date: string; identifiers: [number, string][] }> = {
  CP: { row: 0, name: 'GENTE', vacancies: 'VAGAS', date: 'DATA', identifiers: [[4, 'PON']] },
  AC: { row: 2, name: 'Nº CTO', vacancies: 'VAGAS', date: 'ATUALIZADO', identifiers: [[3, 'OLT'], [4, 'VLAN/PON']] }
};

export function validateSheetHeaders(region: Region, values: unknown[][]): string[] {
  const expected = HEADERS[region];
  const headers = values[expected.row] ?? [];
  const normalizeHeader = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toUpperCase();
  const normalized = headers.map(normalizeHeader);
  const issues: string[] = [];
  const positions: [number, string][] = [
    [0, expected.name], [region === 'CP' ? 3 : 2, expected.vacancies],
    [region === 'CP' ? 9 : 10, expected.date], ...expected.identifiers
  ];
  for (const [column, required] of positions) {
    if (normalized[column] !== normalizeHeader(required)) issues.push('ESQUEMA_PLANILHA_ALTERADO');
  }
  return [...new Set(issues)];
}

export function parseSheetRows(region: Region, values: unknown[][]): SheetCto[] {
  const headerIssue = validateSheetHeaders(region, values);
  if (headerIssue.length) return [];
  const headerRow = HEADERS[region].row;
  const records: SheetCto[] = [];
  for (let index = headerRow + 1; index < values.length; index++) {
    const row = values[index] ?? [];
    const originalName = cell(row, 0);
    if (!originalName) continue;
    const available = parseAvailable(cell(row, region === 'CP' ? 3 : 2));
    const split = cell(row, 1).match(/1\s*[xX]\s*(\d+)/);
    const capacity = split?.[1] ? parseAvailable(split[1]) : null;
    const updatedRaw = cell(row, region === 'CP' ? 9 : 10);
    const updatedOn = updatedRaw ? parseUpdatedOn(updatedRaw) : null;
    const location = parsePoint(cell(row, 6));
    const observationColumns = region === 'CP' ? [12, 13, 14] : [13, 14];
    const observations = [...new Set(observationColumns
      .map((column) => classifyObservation(cell(row, column)))
      .filter((code): code is string => code !== null))];
    const issues: string[] = [...observations];
    if (available === null) issues.push('VAGAS_NAO_CONFIRMADAS');
    if (!location) issues.push('COORDENADA_PLANILHA_INVALIDA');
    if (updatedRaw && !updatedOn) issues.push('DATA_ATUALIZACAO_INVALIDA');
    if (observations.length) issues.push('RESTRICAO_PENDENTE_REVISAO');
    records.push({
      originalName, region, available, capacity, location, updatedOn, observations,
      sheet: SHEETS[region], row: index + 1, issues,
      olt: region === 'AC' ? cell(row, 3) || null : null,
      pon: cell(row, 4) || null
    });
  }
  return records;
}

function classifyObservation(note: string): string | null {
  if (!note) return null;
  const normalized = note.normalize('NFKC').toLocaleLowerCase('pt-BR');
  if (/\b(loss|perda\s+de\s+sinal|sem\s+sinal|inoperante|rompid[ao])\b/.test(normalized)) return 'RESTRICAO_FIBRA_OU_SINAL';
  if (/\bsem\s+(acoplador|conector)\b/.test(normalized)) return 'RESTRICAO_SEM_ACOPLADOR';
  return 'OBSERVACAO_PENDENTE_REVISAO';
}
