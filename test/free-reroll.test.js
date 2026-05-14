import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeShopState, tryReroll, etaToNextPurchase, freeRerollGrant,
  grantFreeRerollsForStall, MAX_FREE_REROLLS, FREE_REROLL_TIERS,
} from '../src/shop.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 0, freeRerolls: 0, ...makeShopState(), ...over };
}

function installSlot(state, idx, upgradeId, cost, dyn = null) {
  while (state.shop.slots.length <= idx) {
    state.shop.slots.push(null);
    state.shop.slotsUnlocked = Math.max(state.shop.slotsUnlocked, idx + 1);
  }
  const slot = { id: upgradeId, cost };
  if (dyn) slot.dyn = dyn;
  state.shop.slots[idx] = slot;
}

test('freeRerollGrant: 0 for sub-hour stalls', () => {
  assert.equal(freeRerollGrant(0), 0);
  assert.equal(freeRerollGrant(60), 0);
  assert.equal(freeRerollGrant(3599), 0);
  assert.equal(freeRerollGrant(NaN), 0);
  assert.equal(freeRerollGrant(Infinity), 3); // very stuck — max tier
});

test('freeRerollGrant: tiers at 1h, 6h, 24h', () => {
  assert.equal(freeRerollGrant(3600), 1);
  assert.equal(freeRerollGrant(5 * 3600), 1);
  assert.equal(freeRerollGrant(6 * 3600), 2);
  assert.equal(freeRerollGrant(12 * 3600), 2);
  assert.equal(freeRerollGrant(24 * 3600), 3);
  assert.equal(freeRerollGrant(48 * 3600), 3);
});

test('freeRerollGrant: max grant is the highest tier (no dozens)', () => {
  let max = 0;
  for (const t of FREE_REROLL_TIERS) max = Math.max(max, t.grant);
  assert.equal(freeRerollGrant(1e9), max);
  assert.ok(max <= 5, 'a single check should never grant more than a handful');
});

test('etaToNextPurchase: 0 when a slot is already affordable', () => {
  const s = freshState({ amount: 1000, basePerSecond: 1 });
  installSlot(s, 0, 'mult_starter', 500); // permanent
  assert.equal(etaToNextPurchase(s, 0), 0);
});

test('etaToNextPurchase: deficit / rate when balance < cost', () => {
  const s = freshState({ amount: 100, basePerSecond: 10 });
  installSlot(s, 0, 'mult_starter', 1100);
  // (1100 - 100) / 10 = 100s
  assert.equal(etaToNextPurchase(s, 0), 100);
});

test('etaToNextPurchase: uses the cheapest non-gamble slot', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  installSlot(s, 0, 'mult_starter', 5000);
  installSlot(s, 1, 'mult5',        200);
  // cheapest = 200, rate 1 → 200s
  assert.equal(etaToNextPurchase(s, 0), 200);
});

test('etaToNextPurchase: ignores gamble / gift / convert (balance-priced)', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  installSlot(s, 0, 'coin_flip', 1); // gamble — skip
  installSlot(s, 1, 'tip_jar',   2); // convert — skip
  installSlot(s, 2, 'mult5',     500); // permanent — use this
  assert.equal(etaToNextPurchase(s, 0), 500);
});

test('etaToNextPurchase: Infinity when rate is 0 and broke', () => {
  const s = freshState({ amount: 0, basePerSecond: 0 });
  installSlot(s, 0, 'mult5', 100);
  assert.equal(etaToNextPurchase(s, 0), Infinity);
});

test('etaToNextPurchase: Infinity when no priceable slot exists', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  installSlot(s, 0, 'coin_flip', 50); // gamble only
  assert.equal(etaToNextPurchase(s, 0), Infinity);
});

test('grantFreeRerollsForStall: no-op when reroll is locked', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  installSlot(s, 0, 'mult5', 36_000); // 10h ETA — would grant 2 if unlocked
  assert.equal(grantFreeRerollsForStall(s, 0), 0);
  assert.equal(s.freeRerolls, 0);
});

test('grantFreeRerollsForStall: 1h ETA grants 1 free reroll', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 3600);
  const added = grantFreeRerollsForStall(s, 0);
  assert.equal(added, 1);
  assert.equal(s.freeRerolls, 1);
});

test('grantFreeRerollsForStall: 24h ETA grants 3', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 24 * 3600);
  assert.equal(grantFreeRerollsForStall(s, 0), 3);
  assert.equal(s.freeRerolls, 3);
});

test('grantFreeRerollsForStall: stacks across calls but caps at MAX_FREE_REROLLS', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 24 * 3600); // grants 3 per call
  let total = 0;
  for (let i = 0; i < 10; i++) total += grantFreeRerollsForStall(s, 0);
  assert.equal(s.freeRerolls, MAX_FREE_REROLLS);
  assert.equal(total, MAX_FREE_REROLLS);
});

test('grantFreeRerollsForStall: short ETA grants nothing', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 60); // 60s
  assert.equal(grantFreeRerollsForStall(s, 0), 0);
  assert.equal(s.freeRerolls, 0);
});

test('tryReroll: consumes a free reroll before charging Echoes', () => {
  const s = freshState({ amount: 100, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.freeRerolls = 2;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.free, true);
  assert.equal(res.cost, 0);
  assert.equal(s.amount, 100); // untouched
  assert.equal(s.freeRerolls, 1);
});

test('tryReroll: falls back to Echo cost when freeRerolls is 0', () => {
  const s = freshState({ amount: 100_000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.freeRerolls = 0;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(res.free, undefined === res.free ? undefined : false); // not free
  assert.equal(s.freeRerolls, 0);
  assert.ok(s.amount < 100_000); // charged
});

test('tryReroll: free reroll bypasses the broke check', () => {
  const s = freshState({ amount: 0, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  s.freeRerolls = 1;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  const res = tryReroll(s, 0);
  assert.ok(res.ok);
  assert.equal(s.freeRerolls, 0);
});

test('tryReroll: still respects rerollUnlocked even with free rerolls', () => {
  const s = freshState({ amount: 100_000, basePerSecond: 0 });
  s.freeRerolls = 3;
  // reroll never unlocked
  installSlot(s, 0, 'mult5', 50);
  const res = tryReroll(s, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'locked');
  assert.equal(s.freeRerolls, 3); // not consumed
});
