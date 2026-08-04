import { supabaseAdmin } from '@/lib/supabase-admin';

function configuredAllowedHosts() {
  return new Set(
    [process.env.IXC_ALLOWED_HOSTS || '', process.env.IXC_DOMAIN || '']
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
      .filter(Boolean),
  );
}

export function normalizeIxcHost(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 253) return null;

  const input = value.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const allowedHosts = configuredAllowedHosts();

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !host.includes('.') ||
    (process.env.NODE_ENV === 'production' && !allowedHosts.has(host))
  ) return null;

  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.)/.test(host)) return null;
  if (host === '::1' || host.includes(':')) return null;

  return host;
}

export async function getIxcConfig() {
  const config: Record<string, string> = {
    ixc_domain: process.env.IXC_DOMAIN || '',
    ixc_token: process.env.IXC_TOKEN || '',
  };

  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', ['ixc_domain', 'ixc_token']);

  if (error) throw error;
  data?.forEach((row) => {
    if (row.key === 'ixc_domain' || row.key === 'ixc_token') config[row.key] = row.value;
  });

  const host = normalizeIxcHost(config.ixc_domain);
  if (!host || !config.ixc_token) return null;
  return { host, token: config.ixc_token };
}

export type IxcRequestMode = 'list' | 'insert';

export function formatIxcDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== 'literal') accumulator[part.type] = part.value;
    return accumulator;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export async function fetchIxc(path: string, token: string, body: unknown, mode: IxcRequestMode = 'list') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(token).toString('base64')}`,
      'Content-Type': 'application/json',
    };
    if (mode === 'list') headers.ixcsoft = 'listar';

    return await fetch(`https://${path}`, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
