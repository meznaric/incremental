import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRate, integrateRate, pruneBuffs, applyDampening, DAMPEN_AT, DAMPEN_ALPHA } from '../src/shop.js';

// Minimal state factory — only the fields integrateRate / effectiveRate read.
function makeState(over = {}) {
  return {
    basePerSecond: 0,
    flatBonus: 0,
    permMul: 1,
    buffs: { rateMul: [], gambleLuck: [], gambleCushion: [], compound: [] },
    ...over,
  };
}

test('integrateRate returns 0 when t1 <= t0', () => {
  const s = makeState({ basePerSecond: 10 });
  assert.equal(integrateRate(s, 100, 100), 0);
  assert.equal(integrateRate(s, 100, 50), 0);
});

test('integrateRate is linear with no buffs', () => {
  const s = makeState({ basePerSecond: 5, flatBonus: 3, permMul: 2 });
  // rate = (5 + 3) * 2 = 16
  assert.equal(integrateRate(s, 0, 10), 160);
  assert.equal(effectiveRate(s, 0), 16);
});

test('integrateRate stacks rateMul buffs multiplicatively while active', () => {
  const s = makeState({
    basePerSecond: 10,
    buffs: {
      rateMul: [
        { value: 2, duration: 100, expiresAt: 100 },
        { value: 3, duration: 100, expiresAt: 100 },
      ],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  // 10 * 2 * 3 = 60 per second for full 10s
  assert.equal(integrateRate(s, 0, 10), 600);
});

test('integrateRate splits at buff expiry', () => {
  const s = makeState({
    basePerSecond: 10,
    buffs: {
      rateMul: [{ value: 2, duration: 5, expiresAt: 5 }],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  // [0, 5): rate 20, [5, 10): rate 10 → 100 + 50
  assert.equal(integrateRate(s, 0, 10), 150);
});

test('integrateRate ignores buffs that expired before window', () => {
  const s = makeState({
    basePerSecond: 10,
    buffs: {
      rateMul: [{ value: 99, duration: 5, expiresAt: 5 }],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  assert.equal(integrateRate(s, 100, 110), 100);
});

test('integrateRate of single compound buff matches closed-form', () => {
  // ∫₀ᵀ B * (1+r)^t dt = B * ((1+r)^T - 1) / ln(1+r)
  const r = 0.01;
  const T = 60;
  const B = 10;
  const s = makeState({
    basePerSecond: B,
    buffs: {
      compound: [{ rate: r, duration: T, startedAt: 0, expiresAt: T }],
      rateMul: [], gambleLuck: [], gambleCushion: [],
    },
  });
  const expected = (B * (Math.pow(1 + r, T) - 1)) / Math.log(1 + r);
  assert.ok(Math.abs(integrateRate(s, 0, T) - expected) < 1e-9);
});

test('integrateRate of stacked compound buffs has exponent N*t', () => {
  // Two identical compound buffs ⇒ multiplier (1+r)^(2t) over the window.
  // ∫₀ᵀ B*(1+r)^(2t) dt = B * ((1+r)^(2T) - 1) / (2 ln(1+r)).
  const r = 0.01;
  const T = 60;
  const B = 1;
  const s = makeState({
    basePerSecond: B,
    buffs: {
      compound: [
        { rate: r, duration: T, startedAt: 0, expiresAt: T },
        { rate: r, duration: T, startedAt: 0, expiresAt: T },
      ],
      rateMul: [], gambleLuck: [], gambleCushion: [],
    },
  });
  const expected = (B * (Math.pow(1 + r, 2 * T) - 1)) / (2 * Math.log(1 + r));
  assert.ok(Math.abs(integrateRate(s, 0, T) - expected) < 1e-9);
});

// Regression: prior implementation raised (1+r) to absolute Unix timestamps
// (~1.7e9), producing Infinity, then 0 * Infinity = NaN. The save layer turns
// either of those into null → 0 on next load, silently wiping the balance.
test('integrateRate stays finite with present-day Unix timestamps', () => {
  const now = Date.now() / 1000; // ~1.7e9
  for (const r of [0.0001, 0.001, 0.01, 0.02, 0.05]) {
    const s = makeState({
      basePerSecond: 5,
      buffs: {
        compound: [{ rate: r, duration: 60, startedAt: now, expiresAt: now + 60 }],
        rateMul: [], gambleLuck: [], gambleCushion: [],
      },
    });
    // One-frame slice
    const dt = 1 / 60;
    const accrual = integrateRate(s, now, now + dt);
    assert.ok(Number.isFinite(accrual), `non-finite at r=${r}: ${accrual}`);
    assert.ok(accrual > 0, `non-positive at r=${r}: ${accrual}`);
    // Full duration
    const full = integrateRate(s, now, now + 60);
    assert.ok(Number.isFinite(full), `full non-finite at r=${r}: ${full}`);
    const expected = (5 * (Math.pow(1 + r, 60) - 1)) / Math.log(1 + r);
    assert.ok(Math.abs(full - expected) / expected < 1e-6, `full mismatch at r=${r}`);
  }
});

// Regression: prior `integral` collapsed all active compound buffs to
// active[0].rate, so a slow long-duration compound (Slow Burn / Black Sky /
// Old Carrier) running underneath a burst (Resonance Build / Storm) made
// integrateRate underestimate by ~10×. effectiveRate uses multAt directly
// and was correct, so the rate label outran balance growth at quintillion
// scale until the burst expired.
test('integrateRate of two compound buffs with different rates matches closed-form', () => {
  const r1 = 0.0002;  // slow long-duration
  const r2 = 0.05;    // burst
  const s1Start = 0;
  const s2Start = 3000; // burst bought later
  const a = 3030;
  const c = 3030 + 1 / 60;
  const B = 1;
  const s = makeState({
    basePerSecond: B,
    buffs: {
      compound: [
        { rate: r1, duration: 7200, startedAt: s1Start, expiresAt: s1Start + 7200 },
        { rate: r2, duration: 60,   startedAt: s2Start, expiresAt: s2Start + 60 },
      ],
      rateMul: [], gambleLuck: [], gambleCushion: [],
    },
  });
  const multAt = (t) => Math.pow(1 + r1, t - s1Start) * Math.pow(1 + r2, t - s2Start);
  const K = Math.log(1 + r1) + Math.log(1 + r2);
  const expected = B * (multAt(c) - multAt(a)) / K;
  const actual = integrateRate(s, a, c);
  assert.ok(Math.abs(actual - expected) / expected < 1e-9, `expected ${expected}, got ${actual}`);
});

test('integrateRate stays finite with two stacked compound buffs at modern epoch', () => {
  const now = Date.now() / 1000;
  const r = 0.01;
  const s = makeState({
    basePerSecond: 1,
    buffs: {
      compound: [
        { rate: r, duration: 60, startedAt: now,     expiresAt: now + 60 },
        { rate: r, duration: 60, startedAt: now - 5, expiresAt: now + 55 },
      ],
      rateMul: [], gambleLuck: [], gambleCushion: [],
    },
  });
  const v = integrateRate(s, now, now + 30);
  assert.ok(Number.isFinite(v));
  assert.ok(v > 30); // strictly more than the unbuffed base accrual
});

test('Ascent exponent: effectiveRate raises rate by (1+exp)', () => {
  const s = makeState({ basePerSecond: 100, ascentExp: 0.1 });
  // base = 100; ascent lifts to 100^1.1 ≈ 158.49.
  const r = effectiveRate(s, 0);
  assert.ok(Math.abs(r - Math.pow(100, 1.1)) < 1e-9);
});

test('Ascent exponent: integrateRate scales linearly with the lifted rate', () => {
  const s = makeState({ basePerSecond: 100, ascentExp: 0.1 });
  // Constant rate 100^1.1 over 10s.
  const expected = 10 * Math.pow(100, 1.1);
  assert.ok(Math.abs(integrateRate(s, 0, 10) - expected) < 1e-6);
});

test('Ascent exponent: no-op when rate <= 1', () => {
  const s = makeState({ basePerSecond: 0.5, ascentExp: 0.1 });
  assert.equal(effectiveRate(s, 0), 0.5);
});

test('Ascent exponent: no-op when exp is 0 or missing', () => {
  const s1 = makeState({ basePerSecond: 100 });
  const s2 = makeState({ basePerSecond: 100, ascentExp: 0 });
  assert.equal(effectiveRate(s1, 0), 100);
  assert.equal(effectiveRate(s2, 0), 100);
});

test('Ascent exponent: stacks on top of rateMul buffs', () => {
  const s = makeState({
    basePerSecond: 100,
    ascentExp: 0.1,
    buffs: {
      rateMul: [{ value: 2, duration: 100, expiresAt: 100 }],
      gambleLuck: [], gambleCushion: [], compound: [],
    },
  });
  // pre-ascent = 100*2 = 200; lifted = 200^1.1.
  const expected = Math.pow(200, 1.1);
  assert.ok(Math.abs(effectiveRate(s, 0) - expected) < 1e-9);
});

test('applyDampening: no-op below threshold', () => {
  assert.equal(applyDampening(0), 0);
  assert.equal(applyDampening(1e6), 1e6);
  assert.equal(applyDampening(DAMPEN_AT), DAMPEN_AT);
});

test('applyDampening: compresses each decade above threshold by alpha', () => {
  // raw = 10× threshold → dampened = threshold × 10^alpha.
  const raw = 10 * DAMPEN_AT;
  const expected = DAMPEN_AT * Math.pow(10, DAMPEN_ALPHA);
  assert.ok(Math.abs(applyDampening(raw) - expected) < 1e-3);
});

test('effectiveRate: rates well below threshold are untouched', () => {
  const s = makeState({ basePerSecond: 1e9 });
  assert.equal(effectiveRate(s, 0), 1e9);
});

test('effectiveRate: huge rates collapse via the dampening curve', () => {
  // basePerSecond pushes the raw rate well past the threshold; the HUD/integral
  // sees the dampened figure, not the runaway raw value.
  const s = makeState({ basePerSecond: 1e15 });
  const r = effectiveRate(s, 0);
  assert.ok(r < 1e15, 'huge rate should be dampened below raw');
  const expected = DAMPEN_AT * Math.pow(1e15 / DAMPEN_AT, DAMPEN_ALPHA);
  assert.ok(Math.abs(r - expected) / expected < 1e-6);
});

test('integrateRate: dampening applies segment-by-segment', () => {
  // Pure-additive state at 1e15/s → dampened rate over 10s.
  const s = makeState({ basePerSecond: 1e15 });
  const dampened = DAMPEN_AT * Math.pow(1e15 / DAMPEN_AT, DAMPEN_ALPHA);
  const expected = dampened * 10;
  assert.ok(Math.abs(integrateRate(s, 0, 10) - expected) / expected < 1e-6);
});

test('pruneBuffs drops expired entries across all keys', () => {
  const s = makeState({
    buffs: {
      rateMul:       [{ value: 2, duration: 5, expiresAt: 10 }, { value: 3, duration: 5, expiresAt: 100 }],
      gambleLuck:    [{ value: 0.1, duration: 5, expiresAt: 50 }],
      gambleCushion: [{ value: 0.1, duration: 5, expiresAt: 200 }],
      compound:      [{ rate: 0.01, duration: 5, startedAt: 0, expiresAt: 5 }],
    },
  });
  pruneBuffs(s, 60);
  assert.equal(s.buffs.rateMul.length, 1);
  assert.equal(s.buffs.rateMul[0].expiresAt, 100);
  assert.equal(s.buffs.gambleLuck.length, 0);
  assert.equal(s.buffs.gambleCushion.length, 1);
  assert.equal(s.buffs.compound.length, 0);
});
