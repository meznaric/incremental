import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, getUpgrade, costFor, totalMulOwned,
  ADD_VALUE_MULT, GIFT_SECONDS, MUL_CATEGORY_GROWTH, genBaseAdd, genGift,
} from '../src/upgrades.js';

test('mythic exists in rarity-indexed tables', () => {
  assert.ok('mythic' in ADD_VALUE_MULT, 'ADD_VALUE_MULT has mythic');
  assert.ok('mythic' in GIFT_SECONDS, 'GIFT_SECONDS has mythic');
  assert.ok(ADD_VALUE_MULT.mythic > ADD_VALUE_MULT.legendary, 'mythic add-value > legendary');
  assert.ok(GIFT_SECONDS.mythic > GIFT_SECONDS.legendary, 'mythic gift > legendary');
});

test('mythic dynamic add and gift produce values when rolled', () => {
  const ctx = { rate: 1e6, balance: 0, owned: {} };
  const add = genBaseAdd('mythic', ctx).upgrade;
  const gift = genGift('mythic', ctx).upgrade;
  assert.equal(add.rarity, 'mythic');
  assert.equal(gift.rarity, 'mythic');
  assert.ok(add.value > 0);
  assert.ok(gift.reward > 0);
});

test('mythic-rarity upgrades exist in the static pool', () => {
  const mythics = UPGRADES.filter((u) => u.rarity === 'mythic' && u.id);
  assert.ok(mythics.length >= 5, `expected ≥5 mythic upgrades, got ${mythics.length}`);
  assert.ok(mythics.some((u) => u.kind === 'buff'));
  assert.ok(mythics.some((u) => u.kind === 'permanent' && u.permType === 'mul'));
});

test('long-duration buffs exist: at least one day+ and one week+', () => {
  const buffs = UPGRADES.filter((u) => u.kind === 'buff');
  const day = 86400;
  const week = 604800;
  assert.ok(buffs.some((b) => b.duration >= day), 'some buff lasts ≥ 1 day');
  assert.ok(buffs.some((b) => b.duration >= week), 'some buff lasts ≥ 1 week');
  // Week-plus durations should be gated behind legendary or mythic only.
  for (const b of buffs) {
    if (b.duration >= week) {
      assert.ok(b.rarity === 'legendary' || b.rarity === 'mythic',
        `${b.id} ${b.duration}s should be legendary/mythic, got ${b.rarity}`);
    }
  }
});

test("Friend's Bet: fair 50/50, EV = 0", () => {
  const u = getUpgrade('friend_bet');
  assert.ok(u, "friend_bet exists");
  assert.equal(u.kind, 'gamble');
  assert.equal(u.chance, 0.5);
  assert.equal(u.payout, 2);
  const ev = u.chance * u.payout - 1; // per-unit-wager expected value, fair when 0
  assert.equal(ev, 0, `expected EV=0, got ${ev}`);
});

test('mul cost scales with total mul owned (category-wide ramp)', () => {
  const u = getUpgrade('mult_starter');
  const base = costFor(u, { balance: 0, rate: 0, owned: {} });
  const withOne = costFor(u, { balance: 0, rate: 0, owned: { mult5: 1 } });
  const withThree = costFor(u, { balance: 0, rate: 0, owned: { mult5: 1, mult10: 1, mult25: 1 } });
  // Owning mult_starter itself also counts toward the category ramp AND its
  // own growth; the test scopes to siblings to isolate the category effect.
  assert.ok(withOne > base, `cost should rise after owning one other mul, ${withOne} vs ${base}`);
  assert.ok(withThree > withOne, 'cost rises with more siblings owned');
  // Stacked-exponential category ramp: factor at N total muls is GROWTH^(N+N²/40).
  // N=1 → 1.35^(1 + 1/40) = 1.35^1.025.
  const expected = Math.pow(MUL_CATEGORY_GROWTH, 1 + 1 / 40);
  const ratio = withOne / base;
  assert.ok(Math.abs(ratio - expected) < 1e-9,
    `ratio ${ratio} should equal ${expected}`);
});

test('totalMulOwned counts only mul permanents', () => {
  assert.equal(totalMulOwned({}), 0);
  assert.equal(totalMulOwned({ mult5: 2, mult10: 1 }), 3);
  // non-mul ids must be ignored
  assert.equal(totalMulOwned({ mult5: 1, vending: 99, friend_bet: 99 }), 1);
});

test('mul cost ramp does not affect non-mul permanents', () => {
  // Non-mul permanents (add) are dynamic so we test the costFor formula directly
  // by constructing a fake permanent upgrade with permType='add'.
  const fakeAdd = { kind: 'permanent', permType: 'add', baseCost: 100, growth: 2 };
  const a = costFor(fakeAdd, { balance: 0, rate: 0, owned: {} });
  const b = costFor(fakeAdd, { balance: 0, rate: 0, owned: { mult5: 5 } });
  assert.equal(a, b, 'add-permanent cost should not change with mul owned count');
});
