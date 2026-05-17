import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, getUpgrade, costFor, totalMulOwned, isEligible,
  ADD_VALUE_MULT, GIFT_SECONDS, MUL_CATEGORY_GROWTH, CONVERT_BOOST_CAP,
  genBaseAdd, genGift,
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

test("Friend's Bet: small house edge, EV per unit wager < 0", () => {
  // Was a fair 50/50; the band-floor now takes a small slice off every Hail
  // (see chance shading in upgrades.js). Test asserts the *direction* of the
  // edge, not a fixed magnitude, so future tuning can move the dial.
  const u = getUpgrade('friend_bet');
  assert.ok(u, "friend_bet exists");
  assert.equal(u.kind, 'gamble');
  assert.equal(u.payout, 2);
  assert.ok(u.chance < 0.5, `expected chance shaded below 0.5, got ${u.chance}`);
  const ev = u.chance * u.payout - 1; // per-unit-wager expected value
  assert.ok(ev < 0, `expected negative EV, got ${ev}`);
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

test('mul perms phase out past their maxRate', () => {
  // Weak mul commons used to linger past maxRate on a rate-aware cost path.
  // The resulting offers were both unaffordable and useless (×1.05 priced at
  // Qi-scale once category ramp landed), so they now filter out like every
  // other kind.
  const u = getUpgrade('mult_starter'); // ×1.5, maxRate 500
  assert.ok(isEligible(u, { rate: 50,   owned: {} }), 'should be offered below maxRate');
  assert.ok(isEligible(u, { rate: 499,  owned: {} }), 'should be offered just under maxRate');
  assert.ok(!isEligible(u, { rate: 500, owned: {} }), 'filters out at maxRate');
  assert.ok(!isEligible(u, { rate: 1e8, owned: {} }), 'and stays filtered out far above');
});

test('mul cost no longer depends on rate (no rate-aware floor)', () => {
  // After the filter flip, mul cost is just baseCost × growth^(n+n²/25) ×
  // category ramp. Rate doesn't enter the math anymore — by the time the
  // upgrade is offered, it's known to be in-band.
  const u = getUpgrade('mult_starter'); // ×1.5, baseCost 50
  const lowRate  = costFor(u, { balance: 0, rate: 100,  owned: {} });
  const midRate  = costFor(u, { balance: 0, rate: 1e8,  owned: {} });
  const highRate = costFor(u, { balance: 0, rate: 1e15, owned: {} });
  assert.equal(lowRate,  50);
  assert.equal(midRate,  50);
  assert.equal(highRate, 50);
});

test('convert cost is capped by baseAdditive × CONVERT_BOOST_CAP', () => {
  // Late-game pattern: balance is many orders of magnitude bigger than
  // baseAdditive. Without the cap, empire would convert into a 100× rate jump.
  const empire = getUpgrade('empire'); // legendary, pctCost 1.0, ratio 0.01
  const ctx = { balance: 1e15, rate: 1e9, baseAdditive: 1e6, owned: {} };
  const cost = costFor(empire, ctx);
  const uncappedSpend = ctx.balance * empire.pctCost; // 1e15
  const expectedCap = CONVERT_BOOST_CAP.legendary * ctx.baseAdditive / empire.ratio;
  assert.ok(cost < uncappedSpend, 'cap should kick in when balance >> baseAdditive');
  assert.equal(cost, expectedCap);
  // The yield (cost × ratio) is the flatBonus delta — bounded at CAP × baseAdditive.
  assert.equal(cost * empire.ratio, CONVERT_BOOST_CAP.legendary * ctx.baseAdditive);
});

test('convert cost stays at balance × pctCost when below the cap', () => {
  // Early/mid game: balance is small relative to baseAdditive, so the cap
  // shouldn't bite — the convert keeps its "burn X% of balance" identity.
  const tipJar = getUpgrade('tip_jar'); // common, pctCost 0.05, ratio 0.0002
  const ctx = { balance: 1000, rate: 10, baseAdditive: 10, owned: {} };
  assert.equal(costFor(tipJar, ctx), ctx.balance * tipJar.pctCost);
});
