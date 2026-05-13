import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShopState, tryBuy, tryDrop } from '../src/shop.js';
import { getUpgrade } from '../src/upgrades.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 0, ...makeShopState(), ...over };
}

// Helper: install an upgrade directly into a slot at a fixed cost, bypassing
// the random slate. Tests stay deterministic regardless of upgrade pool changes.
function installSlot(state, idx, upgradeId, cost, dropCost = 0) {
  state.shop.slots[idx] = { id: upgradeId, cost, dropCost };
}

test('permanent: deducts cost, increments owned, applies flat bonus', () => {
  const s = freshState({ amount: 1000 });
  // plus_one: permanent, permType=add, value=1
  installSlot(s, 0, 'plus_one', 100);
  const u = getUpgrade('plus_one');
  assert.equal(u.kind, 'permanent');
  const before = s.flatBonus;

  const res = tryBuy(s, 0, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, 900);
  assert.equal(s.owned.plus_one, 1);
  assert.equal(s.flatBonus, before + u.value);
});

test('permanent: applies mul to permMul', () => {
  const s = freshState({ amount: 1_000_000 });
  installSlot(s, 0, 'mult25', 100); // mult25: permanent, permType=mul, value=1.25
  const u = getUpgrade('mult25');
  assert.equal(u.permType, 'mul');
  const startMul = s.permMul;

  tryBuy(s, 0, 0);
  assert.equal(s.permMul, startMul * u.value);
});

test('permanent: refused when balance < cost', () => {
  const s = freshState({ amount: 10 });
  installSlot(s, 0, 'plus_one', 100);
  const res = tryBuy(s, 0, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'broke');
  assert.equal(s.amount, 10); // untouched
  assert.equal(s.owned.plus_one || 0, 0);
});

test('buff: deducts cost and pushes a buff entry', () => {
  const s = freshState({ amount: 1000 });
  installSlot(s, 1, 'espresso', 200); // espresso: buff, rateMul, mult=3, duration=60
  tryBuy(s, 1, 1000);
  assert.equal(s.amount, 800);
  assert.equal(s.buffs.rateMul.length, 1);
  assert.equal(s.buffs.rateMul[0].value, 3);
  assert.equal(s.buffs.rateMul[0].expiresAt, 1060);
});

test('buff: compound buffs land in the compound queue', () => {
  // Find any compound upgrade so we don't hard-code an id that may move.
  const compoundUpgrade = (() => {
    for (const id of ['snowball', 'compound', 'avalanche', 'ember', 'eclipse', 'momentum']) {
      const u = getUpgrade(id);
      if (u && u.buffType === 'compound') return u;
    }
    return null;
  })();
  assert.ok(compoundUpgrade, 'expected at least one compound buff in the pool');

  const s = freshState({ amount: 10_000 });
  installSlot(s, 1, compoundUpgrade.id, 100);
  tryBuy(s, 1, 500);
  assert.equal(s.buffs.compound.length, 1);
  assert.equal(s.buffs.compound[0].rate, compoundUpgrade.rate);
  assert.equal(s.buffs.compound[0].startedAt, 500);
});

test('convert: refused when cost is 0', () => {
  // Picking convert id from pool — they all use balance * pctCost.
  const allConvert = ['burn_perm', 'side_gig', 'empire']
    .map((id) => getUpgrade(id))
    .filter(Boolean);
  const conv = allConvert[0];
  assert.ok(conv, 'expected a convert upgrade in the pool');

  const s = freshState({ amount: 0 });
  installSlot(s, 1, conv.id, 0);
  const res = tryBuy(s, 1, 0);
  assert.equal(res.ok, false);
});

test('convert: deducts cost and adds to flatBonus', () => {
  const conv = ['burn_perm', 'side_gig', 'empire']
    .map((id) => getUpgrade(id))
    .filter(Boolean)[0];

  const s = freshState({ amount: 10_000 });
  installSlot(s, 1, conv.id, 1000);
  const flatBefore = s.flatBonus;
  tryBuy(s, 1, 0);
  assert.equal(s.amount, 9000);
  assert.equal(s.flatBonus, flatBefore + 1000 * conv.ratio);
});

test('gamble: cooldown blocks repeat buys', () => {
  const s = freshState({ amount: 10_000 });
  installSlot(s, 3, 'coin_flip', 500);
  s.gambleCd['coin_flip'] = 100; // active until t=100

  const blocked = tryBuy(s, 3, 50);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'cooldown');
  assert.equal(s.amount, 10_000);
});

test('gamble: win adds payout minus wager, sets cooldown', () => {
  // Force RNG so the gamble always wins.
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const s = freshState({ amount: 1000 });
    installSlot(s, 3, 'coin_flip', 100);
    const u = getUpgrade('coin_flip');
    const res = tryBuy(s, 3, 0);
    assert.ok(res.ok);
    assert.equal(res.result.won, true);
    // payout = cost * u.payout, delta = payout - cost
    assert.equal(s.amount, 1000 - 100 + 100 * u.payout);
    assert.ok(s.gambleCd['coin_flip'] > 0);
  } finally {
    Math.random = origRandom;
  }
});

test('gamble: loss subtracts wager, returns cushion refund if buff active', () => {
  const origRandom = Math.random;
  Math.random = () => 0.999; // always loses
  try {
    const s = freshState({ amount: 1000 });
    installSlot(s, 3, 'coin_flip', 100);
    s.buffs.gambleCushion.push({ value: 0.5, duration: 60, expiresAt: 60 });
    tryBuy(s, 3, 0);
    // lose 100, refund 50% → balance = 1000 - 100 + 50 = 950
    assert.equal(s.amount, 950);
  } finally {
    Math.random = origRandom;
  }
});

test('tryDrop: refuses when balance below drop cost', () => {
  const s = freshState({ amount: 5 });
  installSlot(s, 0, 'plus_one', 1000, 50);
  const res = tryDrop(s, 0, 0);
  assert.equal(res.ok, false);
  assert.equal(s.amount, 5);
});

test('tryDrop: deducts drop cost and replaces slot', () => {
  const s = freshState({ amount: 1000, basePerSecond: 10 });
  installSlot(s, 0, 'plus_one', 200, 50);
  const idBefore = s.shop.slots[0].id;
  const res = tryDrop(s, 0, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, 950);
  // Slot was replaced — either same id by luck or a different one, but its
  // contract (id is a string) holds.
  assert.equal(typeof s.shop.slots[0]?.id, 'string');
});
