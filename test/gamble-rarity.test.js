import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_WEIGHT, UPGRADES, rollSlate, SLOT_FILTERS, getUpgrade } from '../src/upgrades.js';
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
  // Build a context where every kind is eligible. Slot index 4 is the first
  // any-kind slot (0/1/2/3 are pinned).
  const ctx = { balance: 1e6, rate: 1e6, owned: {} };
  const N = 4000;
  const counts = { gamble: 0, permanent: 0, buff: 0, convert: 0 };
  for (let i = 0; i < N; i++) {
    const slate = rollSlate(5, ctx);
    const slot = slate[4];
    if (!slot) continue;
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

test('fresh state has no startup bonuses — player starts at base rate only', () => {
  // No startup add / mul is baked into makeShopState; main.js applies the
  // 3× / 20s starting buff and seeds slot 1 with the starter mul on fresh init.
  const s = makeShopState();
  assert.equal(s.flatBonus, 0);
  assert.equal(s.permMul, 1);
  assert.equal(s.buffs.rateMul.length, 0);
  assert.equal(s.owned['startup_add'], undefined);
  assert.equal(s.owned['startup_mul'], undefined);
});

test('SLOT_FILTERS order: [base-add][mul][buff/gift][gamble]', () => {
  assert.equal(SLOT_FILTERS.length, 4);
  // slot 0: base-add permanent
  assert.ok(SLOT_FILTERS[0]({ kind: 'permanent', permType: 'add' }));
  assert.ok(SLOT_FILTERS[0]({ kind: 'permanent', _dyn: 'add' }));
  assert.ok(!SLOT_FILTERS[0]({ kind: 'permanent', permType: 'mul' }));
  // slot 1: any-rarity mul permanent
  assert.ok(SLOT_FILTERS[1]({ kind: 'permanent', permType: 'mul' }));
  assert.ok(!SLOT_FILTERS[1]({ kind: 'permanent', permType: 'add' }));
  // slot 2: buff OR gift
  assert.ok(SLOT_FILTERS[2]({ kind: 'buff' }));
  assert.ok(SLOT_FILTERS[2]({ kind: 'gift' }));
  assert.ok(!SLOT_FILTERS[2]({ kind: 'gamble' }));
  // slot 3: gamble
  assert.ok(SLOT_FILTERS[3]({ kind: 'gamble' }));
  assert.ok(!SLOT_FILTERS[3]({ kind: 'buff' }));
});

test('mult_starter exists: common, ×1.5, baseCost ≤ 100', () => {
  const u = getUpgrade('mult_starter');
  assert.ok(u, 'mult_starter upgrade should exist');
  assert.equal(u.kind, 'permanent');
  assert.equal(u.permType, 'mul');
  assert.equal(u.rarity, 'common');
  assert.equal(u.value, 1.5);
  assert.ok(u.baseCost <= 100, `baseCost ${u.baseCost} should be ≤ 100`);
});
