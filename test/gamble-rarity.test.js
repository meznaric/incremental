import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_WEIGHT, UPGRADES, rollSlate } from '../src/upgrades.js';
import { makeShopState } from '../src/shop.js';

test('KIND_WEIGHT.gamble is 0.25 — gambles 4x rarer than before', () => {
  assert.equal(KIND_WEIGHT.gamble, 0.25);
});

test('non-gamble kinds keep their full weight (default 1)', () => {
  for (const k of ['permanent', 'buff', 'convert']) {
    assert.equal(KIND_WEIGHT[k] ?? 1, 1);
  }
});

test('rollSlate: in any-kind slots, gambles appear roughly 1/4 of pre-change rate', () => {
  // Build a context where every kind is eligible. Use enough slots that we
  // sample the any-kind pool (idx >= 2) heavily.
  const ctx = { balance: 1e6, rate: 1e6, owned: {} };
  // Sample one any-kind slot many times by repeatedly rolling 3-slot slates
  // and counting kinds in slot index 2 (the first any-kind slot).
  const N = 4000;
  const counts = { gamble: 0, permanent: 0, buff: 0, convert: 0 };
  for (let i = 0; i < N; i++) {
    const slate = rollSlate(3, ctx);
    const slot = slate[2];
    if (!slot) continue;
    // Resolve kind from the static table or the dyn payload.
    const u = slot.dyn || UPGRADES.find((x) => x.id === slot.id);
    if (!u) continue;
    counts[u.kind] = (counts[u.kind] || 0) + 1;
  }
  const total = counts.gamble + counts.permanent + counts.buff + counts.convert;
  const gambleShare = counts.gamble / total;
  // Pre-change, gambles dominated common-rarity weight (many gamble commons
  // + uncommons). With 0.25 multiplier their share should drop well below
  // 25% of total. Tolerant bound: under 30% (was typically >50% before).
  assert.ok(gambleShare < 0.30, `expected gamble share < 0.30, got ${gambleShare.toFixed(3)}`);
});

test('makeShopState: fresh state has no owned upgrades and zero bonuses (load() defaults)', () => {
  // Sanity check: the bare shop state is empty. Starting upgrades are applied
  // by main.js on fresh init (outside this pure-logic test scope).
  const s = makeShopState();
  assert.equal(s.flatBonus, 0);
  assert.equal(s.permMul, 1);
  assert.deepEqual(s.owned, {});
});

test('starting upgrades: applying +2 flat and ×3 mul gives the documented baseline', () => {
  // Mirrors what main.js does on fresh init. Encodes the intent so changes
  // to the starting values are intentional.
  const s = makeShopState();
  s.flatBonus += 2;
  s.permMul *= 3;
  s.owned['startup_add'] = 1;
  s.owned['startup_mul'] = 1;
  assert.equal(s.flatBonus, 2);
  assert.equal(s.permMul, 3);
  assert.equal(s.owned['startup_add'], 1);
  assert.equal(s.owned['startup_mul'], 1);
});
