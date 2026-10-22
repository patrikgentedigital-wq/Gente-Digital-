import type { IxcCto, Region, SheetCto, Snapshot } from '../domain/types';
import type { DataSources } from './ports';

const asOf = () => new Date();
const location = { latitude: 12.345, longitude: 45.678 };
const ixcRows: IxcCto[] = [
  { id: 'DEMO-AC-01', originalName: 'AC-CTO N01', region: 'AC', active: true, capacity: 16, location },
  { id: 'DEMO-AC-02', originalName: 'AC-CTO N02', region: 'AC', active: true, capacity: 16, location: { latitude: 12.355, longitude: 45.678 } }
];
const sheetRows: SheetCto[] = [
  { originalName: 'N-01', region: 'AC', available: 4, capacity: 16, location, updatedOn: '2026-09-03',
    observations: [], sheet: 'CTO,s AC', row: 4, issues: [] },
  { originalName: 'N-02', region: 'AC', available: 0, capacity: 16, location: { latitude: 12.355, longitude: 45.678 },
    updatedOn: '2026-09-03', observations: [], sheet: 'CTO,s AC', row: 5, issues: [] }
];

export function createDemoSources(now: () => Date = asOf): DataSources {
  return {
    async loadIxc(region: Region): Promise<Snapshot<IxcCto>> {
      return { rows: ixcRows.filter((row) => row.region === region), fetchedAt: now().toISOString(), complete: true, origin: 'DEMO', issues: [] };
    },
    async loadSheets(region: Region): Promise<Snapshot<SheetCto>> {
      const fetchedAt = now();
      const updatedOn = new Date(fetchedAt.getTime() - 86_400_000).toISOString().slice(0, 10);
      return {
        rows: sheetRows.filter((row) => row.region === region).map((row) => ({ ...row, updatedOn })),
        fetchedAt: fetchedAt.toISOString(), complete: true, origin: 'DEMO', issues: []
      };
    }
  };
}
