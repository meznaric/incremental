import test from 'node:test';
import assert from 'node:assert/strict';
import { breakdownRate } from '../src/breakdown.js';
import { effectiveRate } from '../src/shop.js';

function makeState(over = {}) {
  return {
    basePerSecond: 0,
    flatBonus: 0,
    permMul: 1,
    buffs: { rateMul: [], gambleLuck: [], gambleCushion: [], compound: [] },
    ...over,
  };
}

function lastRow(rows) {
  return rows[rows.length - 1];
}

test('breakdown total matches effectiveRate with no buffs or engravings', () => {
  const s = makeState({ basePerSecond: 10, flatBonus: 5, permMul: 2 });
  const rows = breakdownRate(s, 100);
  assert.equal(lastRow(rows).kind, 'total');
  assert.equal(lastRow(rows).factor, effectiveRate(s, 100));
});

test('breakdown emits a base row even when no other factors apply', () => {
  const s = makeState({ basePerSecond: 7 });
  const rows = breakdownRate(s, 0);
  // base + total
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'base');
  assert.equal(rows[0].factor, 7);
  assert.equal(lastRow(rows).factor, 7);
});

test('breakdown includes rateMul buffs and matches effectiveRate', () => {
  const s = makeState({
    basePerSecond: 10,
    permMul: 2,
    buffs: {
      rateMul: [
        { value: 2, duration: 100, expiresAt: 100 },
        { value: 3, duration: 100, expiresAt: 100 },
      ],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  const rows = breakdownRate(s, 50);
  assert.equal(lastRow(rows).factor, effectiveRate(s, 50));
  const carrier = rows.find((r) => r.label.startsWith('Carrier window'));
  assert.ok(carrier);
  assert.equal(carrier.factor, 6);
});

test('breakdown skips expired rateMul buffs', () => {
  const s = makeState({
    basePerSecond: 10,
    buffs: {
      rateMul: [{ value: 5, duration: 10, expiresAt: 10 }],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  const rows = breakdownRate(s, 50);
  assert.equal(rows.find((r) => r.label.startsWith('Carrier')), undefined);
  assert.equal(lastRow(rows).factor, 10);
});

test('breakdown surfaces Echo Memory when memoryMul > 1', () => {
  const s = makeState({ basePerSecond: 10, memoryMul: 1.5 });
  const rows = breakdownRate(s, 0);
  const mem = rows.find((r) => r.label === 'Echo Memory');
  assert.ok(mem);
  assert.equal(mem.factor, 1.5);
  assert.equal(lastRow(rows).factor, effectiveRate(s, 0));
});

test('breakdown applies Ascent exponent when set, matching effectiveRate', () => {
  const s = makeState({ basePerSecond: 100, permMul: 2, ascentExp: 0.04 });
  // linear = 200, exponent = 1.04, final = 200^1.04
  const rows = breakdownRate(s, 0);
  const exp = rows.find((r) => r.kind === 'exp');
  assert.ok(exp);
  assert.equal(exp.factor, 1.04);
  assert.equal(lastRow(rows).factor, effectiveRate(s, 0));
});

test('breakdown omits Ascent row when exp is 0', () => {
  const s = makeState({ basePerSecond: 10, ascentExp: 0 });
  const rows = breakdownRate(s, 0);
  assert.equal(rows.find((r) => r.kind === 'exp'), undefined);
});
