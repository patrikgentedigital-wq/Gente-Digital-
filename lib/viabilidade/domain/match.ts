import { canonicalKey } from './normalize';
import type { IxcCto, SheetCto } from './types';
import { distanceMeters } from './distance';

// Cadastros diferentes (IXC e planilha) raramente coincidem ao metro; acima disso a CTO é tratada como divergente.
export const COORDINATE_TOLERANCE_METERS = 25;

export function matchCto(cto: IxcCto, rows: SheetCto[]): { row: SheetCto | null; rows: SheetCto[]; reasons: string[] } {
  const key = canonicalKey(cto.region, cto.originalName);
  if (!key) return { row: null, rows: [], reasons: ['CTO_NAO_RECONHECIDA'] };
  const matches = rows.filter((row) => canonicalKey(row.region, row.originalName) === key);
  if (matches.length > 1) return { row: null, rows: matches, reasons: ['CTO_AMBIGUA'] };
  if (matches.length === 0) return { row: null, rows: [], reasons: ['CTO_AUSENTE_NA_PLANILHA'] };
  const row = matches[0]!;
  if (cto.location && row.location && distanceMeters(cto.location, row.location) > COORDINATE_TOLERANCE_METERS) {
    return { row, rows: matches, reasons: ['COORDENADAS_DIVERGENTES'] };
  }
  return { row, rows: matches, reasons: [] };
}
