import test from 'node:test';
import assert from 'node:assert/strict';
import { breakdownRate } from '../src/breakdown.js';
import { effectiveRate } from '../src/shop.js';
import { makeNetworkState, queueToken, placeRelay } from '../src/network.js';

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

test('breakdown surfaces log dampening row above threshold and totals match effectiveRate', () => {
  const s = makeState({ basePerSecond: 1e15 });
  const rows = breakdownRate(s, 0);
  const damp = rows.find((r) => r.label === 'Log dampening');
  assert.ok(damp, 'dampening row should appear at huge rates');
  assert.ok(damp.factor < 1, 'dampening factor compresses the running product');
  assert.equal(lastRow(rows).factor, effectiveRate(s, 0));
});

test('breakdown omits dampening row below threshold', () => {
  const s = makeState({ basePerSecond: 1e9 });
  const rows = breakdownRate(s, 0);
  assert.equal(rows.find((r) => r.label === 'Log dampening'), undefined);
});

test('breakdown emits a Seed mesh row when relays are online and total matches effectiveRate', () => {
  const s = makeState({ basePerSecond: 10, permMul: 2, network: makeNetworkState() });
  queueToken(s, 'common', 100);
  // Place at origin (Core), then advance past the ripen window so the relay is online.
  const placed = placeRelay(s, { q: 0, r: 0 }, 0);
  assert.ok(placed, 'relay should place at (0,0)');
  const now = placed.ripensAt + 1;
  const rows = breakdownRate(s, now);
  const base = rows.find((r) => r.kind === 'base');
  // Base row is just core + flat now; mesh is its own row.
  assert.equal(base.factor, 10, 'base stays at core + flat');
  const mesh = rows.find((r) => r.kind === 'add' && r.label === 'Seed mesh');
  assert.ok(mesh, 'a Seed mesh row should appear when a relay is online');
  assert.ok(mesh.factor > 0, 'mesh row carries a positive contribution');
  assert.ok(mesh.note && /\d+ online relay/.test(mesh.note), 'note should mention online relay count');
  // An isolated Core relay also drips Echo Bleed — should appear as an info row (display-only).
  const bleed = rows.find((r) => r.kind === 'info');
  assert.ok(bleed, 'isolated relay should add an Echo Bleed info row');
  assert.equal(rows[rows.length - 1].factor, effectiveRate(s, now));
});
