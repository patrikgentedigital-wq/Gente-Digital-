import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('script clean usa uma operação suportada pelo Node', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    scripts?: Record<string, string>;
  };

  assert.match(packageJson.scripts?.clean ?? '', /node -e/);
  assert.notEqual(packageJson.scripts?.clean, 'next clean');
});
