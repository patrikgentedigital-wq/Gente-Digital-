import { supabaseAdmin } from '@/lib/supabase-admin';

export interface IxcConfig {
  domain: string;
  token: string;
  cleanDomain: string;
  authHeader: string;
  hasCredentials: boolean;
}

/**
 * Limpa e formata o domínio do IXC (remove http://, https://, www. e barras finais).
 */
export function cleanIxcDomain(domain: string): string {
  if (!domain) return '';
  return domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').trim();
}

/**
 * Gera a string de Basic Auth em base64 para autenticação na API do IXC.
 */
export function getIxcBasicAuthHeader(token: string): string {
  if (!token) return '';
  return `Basic ${Buffer.from(token).toString('base64')}`;
}

/**
 * Mascara o token para exibição segura em telas de configuração ou logs.
 */
export function maskIxcToken(token: string): string {
  if (!token) return '';
  if (token.length <= 6) return '****';
  return '*'.repeat(token.length - 4) + token.slice(-4);
}

/**
 * Formata a data no padrão esperado pelo IXC Soft (YYYY-MM-DD HH:MM:SS) em horário local.
 */
export function formatIxcDate(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Executa uma requisição HTTP com timeout seguro e cancelamento automático via AbortController.
 */
export async function fetchIxcWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Busca credenciais do IXC a partir da tabela 'settings' do Supabase com fallback para variáveis de ambiente.
 */
export async function getIxcCredentials(): Promise<IxcConfig> {
  const envDomain = process.env.IXC_DOMAIN || '';
  const envToken = process.env.IXC_TOKEN || '';

  let dbDomain = '';
  let dbToken = '';

  try {
    const { data: settingsData, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['ixc_domain', 'ixc_token']);

    if (!error && settingsData) {
      for (const row of settingsData) {
        if (row.key === 'ixc_domain') dbDomain = row.value || '';
        if (row.key === 'ixc_token') dbToken = row.value || '';
      }
    }
  } catch (err) {
    console.warn('Aviso ao consultar credenciais do IXC na tabela settings:', err);
  }

  const domain = dbDomain || envDomain;
  const token = dbToken || envToken;
  const cleanDomain = cleanIxcDomain(domain);
  const authHeader = getIxcBasicAuthHeader(token);

  return {
    domain,
    token,
    cleanDomain,
    authHeader,
    hasCredentials: !!(cleanDomain && token),
  };
}
