import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeShopState, tryBuy, tryReroll, tryUnlockSlot, tryUnlockReroll,
  tryUnlockPin, tryTogglePin, SLOT_UNLOCK_COSTS, REROLL_UNLOCK_COST,
  PIN_UNLOCK_COST, REROLL_PCT_PER_SLOT, DEFAULT_SLOTS,
} from '../src/shop.js';
import { getUpgrade, genBaseAdd } from '../src/upgrades.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 0, ...makeShopState(), ...over };
}

// Helper: install an upgrade directly into a slot at a fixed cost, bypassing
// the random slate. Tests stay deterministic regardless of upgrade pool changes.
function installSlot(state, idx, upgradeId, cost, dyn = null) {
  while (state.shop.slots.length <= idx) {
    state.shop.slots.push(null);
    state.shop.slotsUnlocked = Math.max(state.shop.slotsUnlocked, idx + 1);
  }
  const slot = { id: upgradeId, cost };
  if (dyn) slot.dyn = dyn;
  state.shop.slots[idx] = slot;
}

// Install a freshly generated dynamic additive permanent at a known cost.
function installDynAdd(state, idx, rarity, ctx, cost) {
  const { upgrade } = genBaseAdd(rarity, ctx);
  installSlot(state, idx, upgrade.id, cost, upgrade);
  return upgrade;
}

test('permanent: deducts cost, increments owned, applies flat bonus', () => {
  const s = freshState({ amount: 1000 });
  const u = installDynAdd(s, 0, 'common', { rate: 10, balance: 1000, owned: {} }, 100);
  assert.equal(u.kind, 'permanent');
  const before = s.flatBonus;

  const res = tryBuy(s, 0, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, 900);
  assert.equal(s.owned[u.id], 1);
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
  const u = installDynAdd(s, 0, 'common', { rate: 10, balance: 10, owned: {} }, 100);
  const res = tryBuy(s, 0, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'broke');
  assert.equal(s.amount, 10); // untouched
  assert.equal(s.owned[u.id] || 0, 0);
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

test('tryReroll: refused when reroll is locked', () => {
  const s = freshState({ amount: 1000 });
  installSlot(s, 0, 'mult5', 100);
  const res = tryReroll(s, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'locked');
  assert.equal(s.amount, 1000);
});

test('tryReroll: deducts cost (max of pct and 60s of rate) and replaces slots', () => {
  // basePerSecond 0 → 60s × rate × N collapses to 0, so pct dominates: 2 × 3% × 100000 = 6000
  const s = freshState({ amount: 100000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.rerolled, 2);
  assert.equal(s.amount, 100000 - 6000);
  assert.equal(typeof s.shop.slots[0]?.id, 'string');
  assert.equal(typeof s.shop.slots[1]?.id, 'string');
});

test('tryReroll: pinned slot is preserved and not charged', () => {
  const s = freshState({ amount: 100000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.shop.pinUnlocked = true;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  s.shop.pinnedSlot = 0;
  const before = s.shop.slots[0];
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.rerolled, 1);
  // 1 slot × 3% × 100000 = 3000
  assert.equal(s.amount, 100000 - 3000);
  assert.equal(s.shop.slots[0], before);
});

test('tryReroll: cost floor is 30s of offered rate per non-pinned slot', () => {
  // offeredRate frozen at 100/s: 30s × 100/s × 2 slots = 6000 > 3% × 2 × 1000 = 60
  const s = freshState({ amount: 1000, basePerSecond: 100 });
  s.shop.rerollUnlocked = true;
  s.shop.offeredRate = 100;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  // Cost would be 6000 but balance is 1000 — reroll refused.
  const res = tryReroll(s, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'broke');
});

test('tryReroll: cost uses offered rate, not live rate', () => {
  // Live rate explodes (basePerSecond=10000) but offeredRate was frozen at 10/s.
  // Floor = 30s × 10/s × 2 = 600, pct = 3% × 2 × 1000 = 60 → cost 600.
  const s = freshState({ amount: 1000, basePerSecond: 10000 });
  s.shop.rerollUnlocked = true;
  s.shop.offeredRate = 10;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.cost, 600);
  assert.equal(s.amount, 400);
});

test('tryUnlockSlot: deducts cost and grows the slate', () => {
  const s = freshState({ amount: 5000, basePerSecond: 10 });
  const cost = SLOT_UNLOCK_COSTS[DEFAULT_SLOTS];
  const before = s.shop.slotsUnlocked;
  const res = tryUnlockSlot(s, 0);
  assert.ok(res.ok);
  assert.equal(s.shop.slotsUnlocked, before + 1);
  assert.equal(s.shop.slots.length, before + 1);
  assert.equal(s.amount, 5000 - cost);
});

test('tryUnlockReroll: refused when broke; succeeds and flips flag', () => {
  const s = freshState({ amount: REROLL_UNLOCK_COST - 1 });
  assert.equal(tryUnlockReroll(s).ok, false);
  assert.equal(s.shop.rerollUnlocked, false);

  s.amount = REROLL_UNLOCK_COST + 500;
  const res = tryUnlockReroll(s);
  assert.ok(res.ok);
  assert.equal(s.shop.rerollUnlocked, true);
  assert.equal(s.amount, 500);
});

test('tryTogglePin: toggles only when pin is unlocked', () => {
  const s = freshState({ amount: 0 });
  installSlot(s, 0, 'mult5', 50);
  assert.equal(tryTogglePin(s, 0).ok, false);

  s.amount = PIN_UNLOCK_COST;
  tryUnlockPin(s);
  assert.equal(s.shop.pinUnlocked, true);

  tryTogglePin(s, 0);
  assert.equal(s.shop.pinnedSlot, 0);
  tryTogglePin(s, 0);
  assert.equal(s.shop.pinnedSlot, null);
});

// Reference the imported constant so unused-import lint stays quiet.
test('REROLL_PCT_PER_SLOT is 3%', () => {
  assert.equal(REROLL_PCT_PER_SLOT, 0.03);
});
