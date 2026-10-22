import type { IxcCto, Region, SheetCto, Snapshot } from '../domain/types';

export interface DataSources {
  loadIxc(region: Region): Promise<Snapshot<IxcCto>>;
  loadSheets(region: Region): Promise<Snapshot<SheetCto>>;
}

export type IxcPage = { rows: IxcCto[]; nextPageToken?: string };
export interface IxcReadClient {
  listCaixas(region: Region, pageToken: string | undefined, signal: AbortSignal): Promise<IxcPage>;
}

export type GoogleTokenProvider = () => Promise<string>;
export type FetchLike = typeof fetch;
