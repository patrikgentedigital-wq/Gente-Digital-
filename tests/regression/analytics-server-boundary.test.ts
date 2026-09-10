import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('clientes administrativos e repositório declaram fronteira server-only', () => {
  assert.match(read('lib/supabase-admin.ts'), /import ['"]server-only['"]/);
  assert.match(read('lib/analytics/repository.ts'), /import ['"]server-only['"]/);
});

test('módulo de auditoria alcançado por Client Components não importa supabase-admin', () => {
  const audit = read('lib/audit.ts');
  assert.doesNotMatch(audit, /supabase-admin/);
  assert.match(audit, /from ['"]\.\/supabase['"]/);
});

test('Client Components de leads e comissões não alcançam supabase-admin', () => {
  for (const path of ['components/views/leads.tsx', 'components/views/comissoes.tsx']) {
    assert.doesNotMatch(read(path), /supabase-admin/);
  }
});
