import type { IxcCto, Region, Snapshot } from '../domain/types';
import type { IxcReadClient } from './ports';

const MAX_PAGES = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

async function listPageWithTimeout(
  client: IxcReadClient,
  region: Region,
  pageToken: string | undefined,
  timeoutMs: number
) {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('IXC_TIMEOUT'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([client.listCaixas(region, pageToken, controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createIxcAdapter(
  client: IxcReadClient,
  now: () => Date = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Timeout IXC inválido.');
  return {
    async loadIxc(region: Region): Promise<Snapshot<IxcCto>> {
      const rows: IxcCto[] = [];
      const seenTokens = new Set<string>();
      const seenIds = new Set<string>();
      let pageToken: string | undefined;
      try {
        for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
          const page = await listPageWithTimeout(client, region, pageToken, timeoutMs);
          if (!page || !Array.isArray(page.rows)) throw new Error('IXC_SCHEMA_ERROR');
          for (const row of page.rows) {
            if (!row || typeof row.id !== 'string' || !row.id.trim()
              || typeof row.originalName !== 'string' || row.region !== region
              || typeof row.active !== 'boolean'
              || !(row.capacity === null || (Number.isSafeInteger(row.capacity) && row.capacity >= 0))
              || !(row.location === null || (Number.isFinite(row.location?.latitude)
                && Number.isFinite(row.location?.longitude)
                && Math.abs(row.location.latitude) <= 90 && Math.abs(row.location.longitude) <= 180))) {
              throw new Error('IXC_SCHEMA_ERROR');
            }
            if (seenIds.has(row.id)) throw new Error('IXC_DUPLICATE_ID');
            seenIds.add(row.id);
            rows.push(row);
          }
          if (!page.nextPageToken) {
            return { rows, fetchedAt: now().toISOString(), complete: true, origin: 'LIVE', issues: [] };
          }
          if (seenTokens.has(page.nextPageToken)) throw new Error('IXC_REPEATED_PAGE');
          seenTokens.add(page.nextPageToken);
          pageToken = page.nextPageToken;
        }
        return { rows, fetchedAt: now().toISOString(), complete: false, origin: 'LIVE', issues: ['IXC_MAX_PAGES_EXCEEDED'] };
      } catch {
        return { rows, fetchedAt: now().toISOString(), complete: false, origin: 'LIVE', issues: ['IXC_READ_FAILED'] };
      }
    }
  };
}
