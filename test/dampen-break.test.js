import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeShopState, tryBuy,
  applyDampening, effectiveDampenAlpha, effectiveRate,
  DAMPEN_AT, DAMPEN_ALPHA, DAMPEN_ALPHA_MAX,
} from '../src/shop.js';
import { getUpgrade, isEligible } from '../src/upgrades.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 0, ...makeShopState(), ...over };
}

function installSlot(state, idx, upgradeId, cost) {
  while (state.shop.slots.length <= idx) {
    state.shop.slots.push(null);
    state.shop.slotsUnlocked = Math.max(state.shop.slotsUnlocked, idx + 1);
  }
  state.shop.slots[idx] = { id: upgradeId, cost };
}

test('applyDampening: defaults to baseline α when no state', () => {
  const raw = 1e20;
  const out = applyDampening(raw);
  const expected = DAMPEN_AT * Math.pow(raw / DAMPEN_AT, DAMPEN_ALPHA);
  assert.equal(out, expected);
});

test('applyDampening: accepts a custom α', () => {
  const raw = 1e20;
  const out = applyDampening(raw, 0.95);
  const expected = DAMPEN_AT * Math.pow(raw / DAMPEN_AT, 0.95);
  assert.equal(out, expected);
});

test('effectiveDampenAlpha: bumps per copy and caps at the ceiling', () => {
  const s0 = freshState();
  assert.equal(effectiveDampenAlpha(s0), DAMPEN_ALPHA);
  s0.dampenBreaks = { mythic: 1, legendary: 0 };
  assert.equal(effectiveDampenAlpha(s0).toFixed(4), '0.9500');
  s0.dampenBreaks = { mythic: 1, legendary: 1 };
  assert.equal(effectiveDampenAlpha(s0).toFixed(4), '0.9650');
  // Push past the cap — should clamp at DAMPEN_ALPHA_MAX (0.99).
  s0.dampenBreaks = { mythic: 4, legendary: 4 };
  assert.equal(effectiveDampenAlpha(s0), DAMPEN_ALPHA_MAX);
});

test('Quiet-Law Bypass: tryBuy lifts α and dampenBreakMul', () => {
  const u = getUpgrade('quiet_law_bypass');
  assert.ok(u, 'quiet_law_bypass upgrade exists in catalogue');
  const s = freshState({ amount: 1e9, basePerSecond: 1 });
  installSlot(s, 0, u.id, 1e6);
  const r = tryBuy(s, 0, 100);
  assert.equal(r.ok, true);
  assert.equal(s.dampenBreaks.mythic, 1);
  assert.equal(s.dampenBreakMul, 10);
  assert.equal(s.owned[u.id], 1);
});

test('Channel Leak: tryBuy lifts α by 0.015 and ×5 mul', () => {
  const u = getUpgrade('channel_leak');
  assert.ok(u);
  const s = freshState({ amount: 1e9, basePerSecond: 1 });
  installSlot(s, 0, u.id, 5e5);
  const r = tryBuy(s, 0, 100);
  assert.equal(r.ok, true);
  assert.equal(s.dampenBreaks.legendary, 1);
  assert.equal(s.dampenBreakMul, 5);
  assert.equal(effectiveDampenAlpha(s).toFixed(4), '0.9350');
});

test('unlockLadder: gates the Nth copy behind a higher rate', () => {
  const u = getUpgrade('quiet_law_bypass');
  // No copies owned, rate below the floor — not eligible.
  assert.equal(isEligible(u, { rate: 1e37, owned: {} }), false);
  // At the unlock floor, eligible for the first copy.
  assert.equal(isEligible(u, { rate: 1e38, owned: {} }), true);
  // First copy owned but rate hasn't climbed enough — not eligible yet.
  assert.equal(isEligible(u, { rate: 1e38, owned: { [u.id]: 1 } }), false);
  // Reach the 2nd-copy threshold — eligible again.
  assert.equal(isEligible(u, { rate: 1e54, owned: { [u.id]: 1 } }), true);
  // Past the last ladder rung — never appears again.
  assert.equal(isEligible(u, { rate: 1e120, owned: { [u.id]: 4 } }), false);
});

test('effectiveRate: dampenBreakMul rides the rate pipeline at α-cliff scale', () => {
  // Small rate (below DAMPEN_AT) — dampenBreakMul lands clean as a ×10
  // multiplier, no curve in play.
  const s = freshState({ basePerSecond: 100 });
  s.permMul = 1;
  const before = effectiveRate(s, 0);
  s.dampenBreakMul = 10;
  const after = effectiveRate(s, 0);
  assert.equal(after / before, 10);
});

test('effectiveRate: α relief softens the cliff past DAMPEN_AT', () => {
  // Construct a state past the dampening threshold and confirm α lift yields
  // a higher post-dampening rate.
  const s = freshState({ basePerSecond: 1e50 });
  s.permMul = 1;
  const baseRate = effectiveRate(s, 0);
  s.dampenBreaks = { mythic: 3, legendary: 0 };
  const liftedRate = effectiveRate(s, 0);
  assert.ok(liftedRate > baseRate * 100, `expected >100× lift at deep dampening, got ${liftedRate / baseRate}×`);
});
