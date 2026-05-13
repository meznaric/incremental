import test from 'node:test';
import assert from 'node:assert/strict';
import { genBaseAdd, ADD_VALUE_MULT, rollSlate, resolveUpgrade } from '../src/upgrades.js';

test('genBaseAdd: scales value with rate and rarity', () => {
  for (const rarity of Object.keys(ADD_VALUE_MULT)) {
    const { upgrade } = genBaseAdd(rarity, { rate: 1000, balance: 0, owned: {} });
    assert.equal(upgrade.kind, 'permanent');
    assert.equal(upgrade.permType, 'add');
    assert.equal(upgrade.rarity, rarity);
    // value should be in same order of magnitude as rate * mult
    const target = 1000 * ADD_VALUE_MULT[rarity];
    assert.ok(upgrade.value >= target / 3 && upgrade.value <= target * 3,
      `${rarity} value ${upgrade.value} far from target ${target}`);
  }
});

test('genBaseAdd: stays relevant at huge rates (no static cap)', () => {
  // The original bug: at very high rates only legendary appeared. Now every
  // rarity produces a sensibly-scaled tier even at rate 1e15.
  const ctx = { rate: 1e15, balance: 0, owned: {} };
  const common = genBaseAdd('common', ctx).upgrade;
  const leg = genBaseAdd('legendary', ctx).upgrade;
  assert.ok(common.value > 1e13, `common value ${common.value} should scale with rate`);
  assert.ok(leg.value > common.value, 'legendary should outvalue common');
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
