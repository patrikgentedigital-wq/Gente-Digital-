import type { Region, Snapshot, IxcCto, SheetCto } from '../domain/types';
import type { DataSources, FetchLike, GoogleTokenProvider, IxcReadClient } from './ports';
import { createIxcAdapter } from './ixc';
import { createSheetsAdapter } from './sheets';

export function createLiveSources(options: {
  ixcClient: IxcReadClient;
  spreadsheetId: string;
  googleTokenProvider: GoogleTokenProvider;
  fetcher?: FetchLike;
}): DataSources {
  const ixc = createIxcAdapter(options.ixcClient);
  const sheets = createSheetsAdapter(options.spreadsheetId, options.googleTokenProvider, options.fetcher);
  return {
    loadIxc: (region: Region) => ixc.loadIxc(region),
    loadSheets: (region: Region) => sheets.loadSheets(region)
  };
}

export function unavailableIxcSnapshot(region: Region, now = new Date()): Snapshot<IxcCto> {
  return {
    rows: [], fetchedAt: now.toISOString(), complete: false,
    origin: 'LIVE', issues: ['IXC_API_ROUTE_UNVERIFIED:' + region]
  };
}

export function unavailableSheetSnapshot(region: Region, now = new Date()): Snapshot<SheetCto> {
  return {
    rows: [], fetchedAt: now.toISOString(), complete: false,
    origin: 'LIVE', issues: ['GOOGLE_SERVICE_ACCESS_UNAVAILABLE:' + region]
  };
}
