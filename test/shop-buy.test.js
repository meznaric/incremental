import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeShopState, tryBuy, tryReroll, tryUnlockSlot, tryUnlockReroll,
  tryUnlockPinTier, tryTogglePin, isSlotPinned, nextPinTierCost,
  SLOT_UNLOCK_COSTS, REROLL_UNLOCK_COST, PIN_TIER_COSTS, MAX_PIN_SLOTS,
  REROLL_PCT_PER_SLOT, REROLL_FLOOR_SECONDS, DEFAULT_SLOTS,
} from '../src/shop.js';
import { getUpgrade, genBaseAdd, genGift, GIFT_SECONDS, convertYieldFor } from '../src/upgrades.js';

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
  const u = getUpgrade('espresso'); // rateMul buff — exact mult/duration may retune over time
  installSlot(s, 1, 'espresso', 200);
  tryBuy(s, 1, 1000);
  assert.equal(s.amount, 800);
  assert.equal(s.buffs.rateMul.length, 1);
  assert.equal(s.buffs.rateMul[0].value, u.mult);
  assert.equal(s.buffs.rateMul[0].expiresAt, 1000 + u.duration);
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

test('convert: deducts cost and queues a placement token (no flatBonus delta)', () => {
  const conv = ['burn_perm', 'side_gig', 'empire']
    .map((id) => getUpgrade(id))
    .filter(Boolean)[0];

  const s = freshState({ amount: 10_000 });
  installSlot(s, 1, conv.id, 1000);
  const flatBefore = s.flatBonus;
  tryBuy(s, 1, 0);
  assert.equal(s.amount, 9000);
  // flatBonus no longer moves on a convert purchase — the burn buys a token
  // the player drops on a hex; yield is realized after placement + ripening.
  assert.equal(s.flatBonus, flatBefore);
  assert.ok(s.network, 'convert should ensure network state exists');
  assert.equal(s.network.queued.length, 1);
  assert.equal(s.network.queued[0].tier, conv.rarity);
  // Yield is capped at CONVERT_BOOST_CAP[tier] × baseAdditive (see
  // convertYieldFor). basePerSecond defaults to 0; the cap floors at the
  // minimum baseAdd of 1, so for low rarities the cap usually bites here.
  const baseAdd = (s.basePerSecond || 0) + (s.flatBonus || 0);
  assert.equal(s.network.queued[0].baseYield, convertYieldFor(conv, 1000, baseAdd));
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
    s.buffs.gambleCushion.push({ value: 0.05, duration: 60, expiresAt: 60 });
    tryBuy(s, 3, 0);
    // lose 100, refund 5% → balance = 1000 - 100 + 5 = 905
    assert.equal(s.amount, 905);
  } finally {
    Math.random = origRandom;
  }
});

test('gamble: cushion stacks with diminishing returns, capped at 15%', () => {
  const origRandom = Math.random;
  Math.random = () => 0.999;
  try {
    const s = freshState({ amount: 1000 });
    installSlot(s, 3, 'coin_flip', 100);
    // five 50% buffs would be 100% additively, but diminishing gives 1 - 0.5^5 ≈ 0.969, capped at 0.15
    for (let i = 0; i < 5; i++) s.buffs.gambleCushion.push({ value: 0.5, duration: 60, expiresAt: 60 });
    tryBuy(s, 3, 0);
    assert.equal(s.amount, 1000 - 100 + 15);
  } finally {
    Math.random = origRandom;
  }
});

test('gamble: single cushion keeps coin_flip EV negative', () => {
  const u = getUpgrade('insurance'); // common: refund 0.03
  const cf = getUpgrade('coin_flip');
  // EV/cost = p*(M-1) - (1-p)*(1-c). With c=0.03: 0.5*0.95 - 0.5*0.97 = -0.01
  const ev = cf.chance * (cf.payout - 1) - (1 - cf.chance) * (1 - u.refund);
  assert.ok(ev < 0, `expected negative EV, got ${ev}`);
});

test('gamble: max-stacked cushions still leave the house ahead', () => {
  // Worst case for the house: every cushion buff stacked, *and* the chance
  // shading on coin_flip (now 0.47, was 0.5). The 15% cushion cap is the
  // backstop — even at max cushion, EV per unit wager must stay negative so
  // farming the loop forever can't print Echoes.
  const cushionIds = ['insurance', 'steady', 'iron_will', 'bastion', 'last_stand'];
  let lose = 1;
  for (const id of cushionIds) lose *= 1 - getUpgrade(id).refund;
  const c = Math.min(0.15, 1 - lose);
  const cf = getUpgrade('coin_flip');
  const ev = cf.chance * (cf.payout - 1) - (1 - cf.chance) * (1 - c);
  assert.ok(ev < 0, `expected house-edge EV, got ${ev}`);
});

test('tryReroll: refused when reroll is locked', () => {
  const s = freshState({ amount: 1000 });
  installSlot(s, 0, 'mult5', 100);
  const res = tryReroll(s, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'locked');
  assert.equal(s.amount, 1000);
});

test('tryReroll: deducts cost (max of pct and 15s of rate) and replaces slots', () => {
  // basePerSecond 0 → 15s × rate × N collapses to 0, so pct dominates: 2 × 1.5% × 100000 = 3000
  const s = freshState({ amount: 100000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.rerolled, 2);
  assert.equal(s.amount, 100000 - 3000);
  assert.equal(typeof s.shop.slots[0]?.id, 'string');
  assert.equal(typeof s.shop.slots[1]?.id, 'string');
});

test('tryReroll: pinned slot is preserved and not charged', () => {
  const s = freshState({ amount: 100000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.shop.pinSlots = 1;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  s.shop.pinnedSlots = [0];
  const before = s.shop.slots[0];
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.rerolled, 1);
  // 1 slot × 1.5% × 100000 = 1500
  assert.equal(s.amount, 100000 - 1500);
  assert.equal(s.shop.slots[0], before);
});

test('tryReroll: cost floor is REROLL_FLOOR_SECONDS of offered rate per non-pinned slot', () => {
  // Floor must dominate the pct term. Pick a rate big enough that the floor
  // also exceeds the balance, so the reroll is refused.
  const rate = 10000;
  const balance = 1000;
  const s = freshState({ amount: balance, basePerSecond: rate });
  s.shop.rerollUnlocked = true;
  s.shop.offeredRate = rate;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  // floor = REROLL_FLOOR_SECONDS × rate × 2 ≫ balance → refused.
  const res = tryReroll(s, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'broke');
});

test('tryReroll: cost uses offered rate, not live rate', () => {
  // Live rate explodes but offeredRate was frozen low. Cost should reflect
  // the frozen rate via the floor term.
  const offered = 1000;
  const balance = 100000;
  const s = freshState({ amount: balance, basePerSecond: 1000000 });
  s.shop.rerollUnlocked = true;
  s.shop.offeredRate = offered;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const expectedFloor = REROLL_FLOOR_SECONDS * offered * 2;
  const expectedPct = REROLL_PCT_PER_SLOT * 2 * balance;
  const expected = Math.max(expectedFloor, expectedPct);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.cost, expected);
  assert.equal(s.amount, balance - expected);
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

test('tryTogglePin: toggles only when at least one pin tier is unlocked', () => {
  const s = freshState({ amount: 0 });
  installSlot(s, 0, 'mult5', 50);
  assert.equal(tryTogglePin(s, 0).ok, false);

  s.amount = PIN_TIER_COSTS[0];
  tryUnlockPinTier(s);
  assert.equal(s.shop.pinSlots, 1);

  tryTogglePin(s, 0);
  assert.deepEqual(s.shop.pinnedSlots, [0]);
  assert.equal(isSlotPinned(s, 0), true);
  tryTogglePin(s, 0);
  assert.deepEqual(s.shop.pinnedSlots, []);
  assert.equal(isSlotPinned(s, 0), false);
});

test('tryBuy: purchasing a pinned slot clears the pin', () => {
  const s = freshState({ amount: 1000 });
  s.shop.pinSlots = 1;
  const u = installDynAdd(s, 0, 'common', { rate: 10, balance: 1000, owned: {} }, 100);
  tryTogglePin(s, 0);
  assert.equal(isSlotPinned(s, 0), true);
  const res = tryBuy(s, 0, 0);
  assert.ok(res.ok);
  assert.equal(s.owned[u.id], 1);
  assert.equal(isSlotPinned(s, 0), false);
  assert.deepEqual(s.shop.pinnedSlots, []);
});

test('tryUnlockPinTier: walks the cost ladder and respects the cap', () => {
  // Enough Echoes to buy every tier.
  const total = PIN_TIER_COSTS.reduce((a, b) => a + b, 0);
  const s = freshState({ amount: total });
  for (let i = 0; i < MAX_PIN_SLOTS; i++) {
    assert.equal(nextPinTierCost(s), PIN_TIER_COSTS[i], `tier ${i + 1} cost matches the ladder`);
    const res = tryUnlockPinTier(s);
    assert.ok(res.ok, `tier ${i + 1} buy succeeds`);
    assert.equal(s.shop.pinSlots, i + 1);
  }
  // Past the cap → maxed, no spend.
  assert.equal(s.amount, 0);
  assert.equal(nextPinTierCost(s), null);
  const res = tryUnlockPinTier(s);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'maxed');
});

test('tryTogglePin: respects pinSlots capacity (FIFO when full)', () => {
  const s = freshState({ amount: 0 });
  s.shop.pinSlots = 2;
  for (let i = 0; i < 3; i++) installSlot(s, i, `mult5`, 50);
  tryTogglePin(s, 0);
  tryTogglePin(s, 1);
  assert.deepEqual(s.shop.pinnedSlots, [0, 1]);
  // Pinning slot 2 pushes slot 0 out — capacity is 2.
  tryTogglePin(s, 2);
  assert.deepEqual(s.shop.pinnedSlots, [1, 2]);
});

test('tryReroll: multiple pinned slots all stay; cost charges only non-pinned', () => {
  const s = freshState({ amount: 100000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.shop.pinSlots = 2;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  installSlot(s, 2, 'mult5', 50);
  s.shop.pinnedSlots = [0, 2];
  const a = s.shop.slots[0], c = s.shop.slots[2];
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  // Only slot 1 is rerollable — cost = 1 × 1.5% × 100000 = 1500.
  assert.equal(res.rerolled, 1);
  assert.equal(s.amount, 100000 - 1500);
  assert.equal(s.shop.slots[0], a);
  assert.equal(s.shop.slots[2], c);
});

// Reference the imported constant so unused-import lint stays quiet.
test('REROLL_PCT_PER_SLOT is 1.5%', () => {
  assert.equal(REROLL_PCT_PER_SLOT, 0.015);
});

function installDynGift(state, idx, rarity, ctx) {
  const { upgrade, cost } = genGift(rarity, ctx);
  installSlot(state, idx, upgrade.id, cost, upgrade);
  return upgrade;
}

test('gift: cost 0, adds reward to balance, rerolls slot', () => {
  const s = freshState({ amount: 100, basePerSecond: 10 });
  const ctx = { rate: 10, balance: 100, owned: {} };
  const u = installDynGift(s, 3, 'common', ctx);
  assert.equal(u.kind, 'gift');
  const slotBefore = s.shop.slots[3];
  assert.equal(slotBefore.cost, 0);

  const res = tryBuy(s, 3, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, 100 + u.reward);
  // slot got replaced (id differs, or fell to null if pool empty)
  assert.notEqual(s.shop.slots[3], slotBefore);
});

test('gift: legendary reward dwarfs common at the same rate', () => {
  const ctx = { rate: 100, balance: 0, owned: {} };
  const common = genGift('common', ctx).upgrade;
  const leg = genGift('legendary', ctx).upgrade;
  assert.ok(leg.reward >= common.reward * 10,
    `legendary ${leg.reward} should be much bigger than common ${common.reward}`);
});

test('gift: reward roughly equals rate × GIFT_SECONDS by rarity', () => {
  const rate = 100;
  for (const rarity of Object.keys(GIFT_SECONDS)) {
    const { upgrade, cost } = genGift(rarity, { rate, balance: 0, owned: {} });
    assert.equal(cost, 0);
    const target = rate * GIFT_SECONDS[rarity];
    // niceRound can land within a factor of ~2.5 either way
    assert.ok(upgrade.reward >= target / 3 && upgrade.reward <= target * 3,
      `${rarity} reward ${upgrade.reward} far from target ${target}`);
  }
});

test('drift: buy multiplies offlineMul and increments owned count', () => {
  const drift = ['drift_starter', 'drift_band', 'drift_lock']
    .map((id) => getUpgrade(id))
    .filter(Boolean)[0];
  const s = freshState({ amount: 100_000 });
  installSlot(s, 5, drift.id, 1000);
  const before = s.offlineMul;
  const res = tryBuy(s, 5, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, 99_000);
  assert.ok(Math.abs(s.offlineMul - before * drift.value) < 1e-9,
    `offlineMul ${s.offlineMul} should be ${before * drift.value}`);
  assert.equal(s.owned[drift.id], 1);
});

test('drift: two buys stack multiplicatively', () => {
  const drift = getUpgrade('drift_starter');
  const s = freshState({ amount: 1e9 });
  installSlot(s, 5, drift.id, 100);
  tryBuy(s, 5, 0);
  installSlot(s, 5, drift.id, 100);
  tryBuy(s, 5, 0);
  // value² since two purchases.
  assert.ok(Math.abs(s.offlineMul - drift.value * drift.value) < 1e-9);
});

test('drift: never touches foreground rate', () => {
  const drift = getUpgrade('drift_band');
  const s = freshState({ amount: 1e7, basePerSecond: 10 });
  const rateBefore = (s.basePerSecond + s.flatBonus) * s.permMul;
  installSlot(s, 5, drift.id, 100);
  tryBuy(s, 5, 0);
  const rateAfter = (s.basePerSecond + s.flatBonus) * s.permMul;
  assert.equal(rateBefore, rateAfter);
});
