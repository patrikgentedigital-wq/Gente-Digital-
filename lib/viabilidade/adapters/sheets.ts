import { createSign } from 'node:crypto';
import type { Region, SheetCto, Snapshot } from '../domain/types';
import { parseSheetRows, validateSheetHeaders } from '../domain/normalize';
import type { FetchLike, GoogleTokenProvider } from './ports';

const API_ROOT = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ROWS_PER_CHUNK = 400;
const SHEET_TITLE: Record<Region, string> = { CP: 'CTO,s CP', AC: 'CTO,s AC' };
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createServiceAccountTokenProvider(
  credentialsJson: string,
  fetcher: FetchLike = fetch,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
): GoogleTokenProvider {
  let account: ServiceAccount;
  try {
    const parsed = JSON.parse(credentialsJson) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string'
      || (parsed.token_uri !== undefined && typeof parsed.token_uri !== 'string')) throw new Error();
    account = {
      client_email: parsed.client_email, private_key: parsed.private_key,
      ...(parsed.token_uri ? { token_uri: parsed.token_uri } : {})
    };
  } catch {
    throw new Error('Credenciais de serviço Google inválidas.');
  }
  const tokenUri = account.token_uri ?? TOKEN_URL;
  if (new URL(tokenUri).href !== TOKEN_URL) throw new Error('Emissor OAuth Google não permitido.');
  let cached: { value: string; expiresAt: number } | undefined;
  return async () => {
    const now = nowSeconds();
    if (cached && cached.expiresAt > now + 60) return cached.value;
    const issuedAt = now;
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
      iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: tokenUri, iat: issuedAt, exp: issuedAt + 3500
    }));
    const unsigned = header + '.' + claims;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + '.' + signer.sign(account.private_key, 'base64url');
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    });
    let response: Response;
    try {
      response = await fetcher(tokenUri, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body, redirect: 'error', signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new Error('Autenticação Google indisponível.');
    }
    if (!response.ok) throw new Error('Autenticação Google recusada.');
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== 'string' || !payload.access_token
      || typeof payload.expires_in !== 'number' || payload.expires_in <= 0) {
      throw new Error('Resposta OAuth Google inválida.');
    }
    cached = { value: payload.access_token, expiresAt: now + payload.expires_in };
    return cached.value;
  };
}

async function safeGoogleGet(url: string, token: string, fetcher: FetchLike): Promise<unknown> {
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== 'sheets.googleapis.com' || parsedUrl.protocol !== 'https:') {
    throw new Error('Destino Google Sheets não permitido.');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(parsedUrl, {
        headers: { authorization: 'Bearer ' + token },
        redirect: 'error', signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) return await response.json() as unknown;
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
      throw new Error('Leitura Google Sheets recusada.');
    } catch (error) {
      if (attempt === 0 && !(error instanceof Error && error.message.includes('recusada'))) continue;
      throw new Error('Leitura Google Sheets indisponível.');
    }
  }
  throw new Error('Leitura Google Sheets indisponível.');
}

type SpreadsheetMetadata = { sheets?: Array<{ properties?: { title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }> };
type ValueResponse = { values?: unknown[][] };
const nowIso = (now: () => Date) => now().toISOString();

export function createSheetsAdapter(
  spreadsheetId: string,
  tokenProvider: GoogleTokenProvider,
  fetcher: FetchLike = fetch,
  now: () => Date = () => new Date()
) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) throw new Error('ID da planilha inválido.');
  return {
    async loadSheets(region: Region): Promise<Snapshot<SheetCto>> {
      const fetchedAt = nowIso(now);
      try {
        const token = await tokenProvider();
        const metadataUrl = API_ROOT + '/' + encodeURIComponent(spreadsheetId)
          + '?fields=' + encodeURIComponent('sheets(properties(title,gridProperties(rowCount,columnCount)))');
        const metadata = await safeGoogleGet(metadataUrl, token, fetcher) as SpreadsheetMetadata;
        const sheet = metadata.sheets?.find((item) => item.properties?.title === SHEET_TITLE[region]);
        const rowCount = sheet?.properties?.gridProperties?.rowCount;
        const columnCount = sheet?.properties?.gridProperties?.columnCount;
        if (!sheet || !Number.isSafeInteger(rowCount) || rowCount! <= 0
          || !Number.isSafeInteger(columnCount) || columnCount! < 15) {
          return { rows: [], fetchedAt, complete: false, origin: 'LIVE', issues: ['PLANILHA_ESQUEMA_INDISPONIVEL'] };
        }
        const matrix: unknown[][] = [];
        for (let start = 1; start <= rowCount!; start += ROWS_PER_CHUNK) {
          const end = Math.min(rowCount!, start + ROWS_PER_CHUNK - 1);
          const range = "'" + SHEET_TITLE[region] + "'!A" + start + ':O' + end;
          const rangePath = encodeURIComponent(range).replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());
          const valuesUrl = API_ROOT + '/' + encodeURIComponent(spreadsheetId) + '/values/' + rangePath;
          const payload = await safeGoogleGet(valuesUrl, token, fetcher) as ValueResponse;
          if (payload.values !== undefined && !Array.isArray(payload.values)) {
            return { rows: [], fetchedAt, complete: false, origin: 'LIVE', issues: ['PLANILHA_RESPOSTA_INVALIDA'] };
          }
          for (const [offset, row] of (payload.values ?? []).entries()) {
            if (!Array.isArray(row)) return { rows: [], fetchedAt, complete: false, origin: 'LIVE', issues: ['PLANILHA_RESPOSTA_INVALIDA'] };
            matrix[start - 1 + offset] = row;
          }
        }
        const headerIssues = validateSheetHeaders(region, matrix);
        if (headerIssues.length) return { rows: [], fetchedAt, complete: false, origin: 'LIVE', issues: headerIssues };
        const rows = parseSheetRows(region, matrix);
        return { rows, fetchedAt, complete: true, origin: 'LIVE', issues: [] };
      } catch {
        return { rows: [], fetchedAt, complete: false, origin: 'LIVE', issues: ['PLANILHA_READ_FAILED'] };
      }
    }
  };
}
