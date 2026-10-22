import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Porta fechada: qualquer consulta ao banco falha na hora, sem depender de rede externa.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
process.env.ADMIN_EMAILS = '';
process.env.KV_REST_API_URL = 'https://redis.example.test';
process.env.KV_REST_API_TOKEN = 'redis-test-token';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('user_metadata editável pelo usuário nunca concede papel de admin', async () => {
  const { getUserRole } = await import('@/lib/auth-server');

  assert.equal(getUserRole.length, 2, 'getUserRole não deve receber metadados do usuário');

  const forged = getUserRole as unknown as (id: string, email: string, metadata: unknown) => Promise<string>;
  const role = await forged('user-comum', 'vendedor@example.test', { role: 'admin' });
  assert.equal(role, 'vendedor');
});

test('nenhum chamador repassa user_metadata para decidir papel', () => {
  for (const path of ['lib/auth-server.ts', 'app/api/commissions/route.ts', 'app/api/users/me/route.ts']) {
    const source = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(source, /user_metadata|userMetadata/, `${path} não deve usar user_metadata`);
  }
});

test('/api/audit recusa requisição sem sessão com 401', async () => {
  const { NextRequest } = await import('next/server');
  const { POST } = await import('@/app/api/audit/route');

  const response = await POST(new NextRequest('http://localhost/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'Exclusão de Lead', details: 'forjado', user_email: 'diretor@empresa.test' }),
  }));

  assert.equal(response.status, 401);
});

test('/api/audit grava o e-mail da sessão e ignora user_email do corpo', () => {
  const source = read('app/api/audit/route.ts');

  assert.match(source, /getAuthenticatedUser\(req\)/);
  assert.match(source, /user_email\s*=\s*\(user\.email/);
  assert.doesNotMatch(source, /body\??\.user_email/);
  assert.match(source, /checkRateLimit\(`audit_\$\{user\.id\}`/);
});

test('rate limit usa uma instância por combinação de limite e janela', async () => {
  const { getRatelimitInstance } = await import('@/lib/ratelimit');

  const referrals = getRatelimitInstance(5, 60);
  const trackClick = getRatelimitInstance(10, 60);
  const longWindow = getRatelimitInstance(5, 120);

  assert.notStrictEqual(referrals, trackClick, 'limites diferentes não podem compartilhar o limiter');
  assert.notStrictEqual(referrals, longWindow, 'janelas diferentes não podem compartilhar o limiter');
  assert.strictEqual(getRatelimitInstance(5, 60), referrals, 'mesma configuração reaproveita a instância');
});
