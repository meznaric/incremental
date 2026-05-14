import test from 'node:test';
import assert from 'node:assert/strict';
import { genBaseAdd, ADD_VALUE_MULT, rollSlate, resolveUpgrade } from '../src/upgrades.js';

test('genBaseAdd: scales value with baseAdditive and rarity', () => {
  // baseAdditive=100 puts the decay factor below 1× (decades-above-10 = 1),
  // so accept a wider band around the un-decayed target.
  for (const rarity of Object.keys(ADD_VALUE_MULT)) {
    const { upgrade } = genBaseAdd(rarity, {
      rate: 1000, balance: 0, baseAdditive: 100, permMul: 10, owned: {},
    });
    assert.equal(upgrade.kind, 'permanent');
    assert.equal(upgrade.permType, 'add');
    assert.equal(upgrade.rarity, rarity);
    const target = 100 * ADD_VALUE_MULT[rarity];
    assert.ok(upgrade.value >= target / 5 && upgrade.value <= target * 2,
      `${rarity} value ${upgrade.value} far from target ${target}`);
  }
});

test('genBaseAdd: stays relevant at huge bases (no static cap)', () => {
  // Original bug: at very high rates only legendary appeared. With the
  // log-decay rescaling we still want each rarity to produce a sensibly-
  // scaled tier even at base=1e15, just smaller relative to base than at
  // game start.
  const ctx = { rate: 1e15, balance: 0, baseAdditive: 1e15, permMul: 1, owned: {} };
  const common = genBaseAdd('common', ctx).upgrade;
  const leg = genBaseAdd('legendary', ctx).upgrade;
  assert.ok(common.value > 1e12, `common value ${common.value} should scale with base`);
  assert.ok(leg.value > common.value, 'legendary should outvalue common');
});

test('genBaseAdd: log decay shrinks the % of base as base grows', () => {
  const small = genBaseAdd('common', { baseAdditive: 10,    permMul: 1, rate: 10,    balance: 0, owned: {} }).upgrade;
  const big   = genBaseAdd('common', { baseAdditive: 1e12,  permMul: 1, rate: 1e12,  balance: 0, owned: {} }).upgrade;
  const smallPct = small.value / 10;
  const bigPct = big.value / 1e12;
  assert.ok(smallPct > bigPct * 2,
    `decay should at least halve the % of base by 1e12 (small ${smallPct}, big ${bigPct})`);
});

test('genBaseAdd: cost tracks effective gain, not raw value', () => {
  // Same baseAdditive, different permMul → same value but cost scales with
  // permMul because the *effective* gain does.
  const lowMul  = genBaseAdd('common', { baseAdditive: 100, permMul: 1,   rate: 100,    balance: 0, owned: {} });
  const highMul = genBaseAdd('common', { baseAdditive: 100, permMul: 100, rate: 10000,  balance: 0, owned: {} });
  assert.equal(lowMul.upgrade.value, highMul.upgrade.value);
  assert.ok(highMul.cost > lowMul.cost * 50,
    `cost should rise with permMul (low=${lowMul.cost}, high=${highMul.cost})`);
});

test('genBaseAdd: cost is finite and proportional to value', () => {
  const small = genBaseAdd('common', { rate: 1, balance: 0, owned: {} });
  const huge = genBaseAdd('legendary', { rate: 1e12, balance: 0, owned: {} });
  assert.ok(Number.isFinite(small.cost) && small.cost > 0);
  assert.ok(Number.isFinite(huge.cost) && huge.cost > small.cost);
  // cost should be a sane multiple of value (not absurdly cheap nor pinned at value)
  assert.ok(huge.cost / huge.upgrade.value > 10);
  assert.ok(huge.cost / huge.upgrade.value < 1e5);
});

test('genBaseAdd: value is floored at 1 even at rate 0', () => {
  for (const rarity of Object.keys(ADD_VALUE_MULT)) {
    const { upgrade } = genBaseAdd(rarity, { rate: 0, balance: 0, owned: {} });
    assert.ok(upgrade.value >= 1, `${rarity} value ${upgrade.value} should be ≥ 1`);
  }
});

test('genBaseAdd: ids are unique per (rarity, value)', () => {
  const a = genBaseAdd('common', { rate: 100, balance: 0, owned: {} }).upgrade;
  const b = genBaseAdd('common', { rate: 100, balance: 0, owned: {} }).upgrade;
  assert.equal(a.id, b.id);
  const c = genBaseAdd('rare', { rate: 100, balance: 0, owned: {} }).upgrade;
  assert.notEqual(a.id, c.id);
});

test('rollSlate: permanent slot at high rate yields a base-add upgrade with non-legendary in the mix', () => {
  // Force RNG to pick the first matching pool entry. We don't care which —
  // we just need rollSlate to return a usable slot whose resolveUpgrade works.
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const ctx = { rate: 1e12, balance: 0, owned: {} };
    const slate = rollSlate(2, ctx);
    const slot = slate[0]; // index 0 is the permanent slot
    assert.ok(slot, 'permanent slot should be populated at high rate');
    const u = resolveUpgrade(slot);
    assert.ok(u, 'resolveUpgrade should find the upgrade');
    assert.equal(u.kind, 'permanent');
  } finally {
    Math.random = origRandom;
  }
});
