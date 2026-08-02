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

export async function fetchIxc(path: string, token: string, body: unknown) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(`https://${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(token).toString('base64')}`,
        'Content-Type': 'application/json',
        ixcsoft: 'listar',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
