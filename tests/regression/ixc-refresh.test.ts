import assert from 'node:assert/strict';
import { test } from 'node:test';

import { startIxcRefresh } from '../../lib/analytics/ixc-refresh';

const hour = 60 * 60 * 1000;

test('consulta ao abrir, volta a consultar após uma hora e cancela quando a aba fecha', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals: AbortSignal[] = [];
  const stop = startIxcRefresh(async (signal) => { signals.push(signal); });
  try {
    assert.equal(signals.length, 1);
    await Promise.resolve();
    t.mock.timers.tick(hour - 1);
    assert.equal(signals.length, 1);
    t.mock.timers.tick(1);
    assert.equal(signals.length, 2);
    await Promise.resolve();
    stop();
    assert.equal(signals[1].aborted, true);
    t.mock.timers.tick(hour);
    assert.equal(signals.length, 2);
  } finally {
    stop();
  }
});

test('conta uma hora a partir do fim da leitura e evita consultas automáticas simultâneas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveRead: () => void = () => {};
  let reads = 0;
  const stop = startIxcRefresh(() => {
    reads++;
    return new Promise<void>((resolve) => { resolveRead = resolve; });
  });
  try {
    t.mock.timers.tick(hour);
    assert.equal(reads, 1);
    resolveRead();
    await Promise.resolve();
    t.mock.timers.tick(hour);
    assert.equal(reads, 2);
  } finally {
    stop();
    resolveRead();
  }
});

test('tenta atualizar de novo após uma falha temporária de consulta', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  const stop = startIxcRefresh(async () => {
    reads++;
    if (reads === 1) throw new Error('IXC indisponível');
  });
  try {
    await Promise.resolve();
    t.mock.timers.tick(hour);
    assert.equal(reads, 2);
  } finally {
    stop();
  }
});
