import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS, getPattern, getActivePattern, setActivePattern, clearActivePattern,
  hasPendingPatternChoice, markPendingPatternChoice,
  patternBaseRateMul, patternRerollCostMul,
  patternBuffDurationMul, patternBuffRateMulStrength, patternGambleLuckBonus,
  patternFreeLeft, consumePatternFreePurchase, applyPatternOnFreshBoot,
  patternPurchaseCostMul, patternNetworkYieldMul,
  markPatternCompleted, isPatternCompleted, allPatternsCompleted,
} from '../src/cyclePatterns.js';
import {
  makeShopState, effectiveRate, integrateRate, tryBuy, tryReroll,
  computeRerollCost,
} from '../src/shop.js';
import { getUpgrade } from '../src/upgrades.js';
import { closeCycle, recordContact } from '../src/contactLog.js';
import { ensureNetwork, placeRelay, queueToken, networkContribution } from '../src/network.js';

function freshLog() {
  return {
    run: 1, worlds: [], mass: 0, engravings: {}, bestPeak: 0,
    pattern: null, pendingPatternChoice: false, patternUsed: {}, patternCompleted: {},
  };
}
function freshState(over = {}) {
  return {
    amount: 0, basePerSecond: 0, patternFreeLeft: 0,
    ...makeShopState(),
    contactLog: freshLog(),
    ...over,
  };
}
function installSlot(state, idx, upgradeId, cost) {
  while (state.shop.slots.length <= idx) {
    state.shop.slots.push(null);
    state.shop.slotsUnlocked = Math.max(state.shop.slotsUnlocked, idx + 1);
  }
  state.shop.slots[idx] = { id: upgradeId, cost };
}

test('PATTERNS: registry has at least four distinct patterns with required fields', () => {
  assert.ok(PATTERNS.length >= 4, `expected ≥4 patterns, got ${PATTERNS.length}`);
  const ids = new Set();
  for (const p of PATTERNS) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    assert.equal(typeof p.desc, 'string');
    assert.equal(typeof p.gameplay, 'string');
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
  }
});

test('getPattern: returns null for unknown id', () => {
  assert.equal(getPattern('nope'), null);
  assert.equal(getPattern(null), null);
});

test('setActivePattern: stores id and clears pendingPatternChoice', () => {
  const log = freshLog();
  markPendingPatternChoice(log);
  assert.equal(hasPendingPatternChoice(log), true);
  const ok = setActivePattern(log, 'surge_tide');
  assert.equal(ok, true);
  assert.equal(log.pattern, 'surge_tide');
  assert.equal(hasPendingPatternChoice(log), false);
  assert.equal(log.patternUsed.surge_tide, 1);
});

test('setActivePattern: refuses unknown id', () => {
  const log = freshLog();
  assert.equal(setActivePattern(log, 'nope'), false);
  assert.equal(log.pattern, null);
});

test('clearActivePattern: nulls pattern field', () => {
  const log = freshLog();
  setActivePattern(log, 'cold_sky');
  clearActivePattern(log);
  assert.equal(log.pattern, null);
});

test('closeCycle: clears pattern and marks pending choice', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  setActivePattern(log, 'surge_tide');
  assert.equal(log.pattern, 'surge_tide');
  closeCycle(log, 10_000);
  assert.equal(log.pattern, null);
  assert.equal(hasPendingPatternChoice(log), true);
});

test('no active pattern: hooks return identity values', () => {
  const s = freshState();
  assert.equal(patternBaseRateMul(s), 1);
  assert.equal(patternRerollCostMul(s), 1);
  assert.equal(patternBuffDurationMul(s), 1);
  assert.equal(patternBuffRateMulStrength(s), 1);
  assert.equal(patternGambleLuckBonus(s), 0);
  assert.equal(patternFreeLeft(s), 0);
});

test('surge_tide: baseRateMul lifts effectiveRate by 0.6', () => {
  const s = freshState({ basePerSecond: 100 });
  setActivePattern(s.contactLog, 'surge_tide');
  assert.equal(effectiveRate(s, 0), 60);
});

test('surge_tide: baseRateMul also affects integrateRate linearly', () => {
  const s = freshState({ basePerSecond: 100 });
  setActivePattern(s.contactLog, 'surge_tide');
  // 60/s over 10s
  assert.equal(integrateRate(s, 0, 10), 600);
});

test('surge_tide: applyPatternOnFreshBoot seeds a 5-minute rateMul buff', () => {
  const s = freshState();
  setActivePattern(s.contactLog, 'surge_tide');
  applyPatternOnFreshBoot(s, 1000);
  const b = s.buffs.rateMul.find((x) => x.sourceId === 'surge_tide');
  assert.ok(b, 'expected surge_tide buff to be seeded');
  assert.equal(b.duration, 300);
  assert.ok(b.value > 4 && b.value < 4.2);
  assert.equal(b.expiresAt, 1300);
});

test('surge_tide: combined first-5-min rate equals 2.5x base', () => {
  const s = freshState({ basePerSecond: 100 });
  setActivePattern(s.contactLog, 'surge_tide');
  applyPatternOnFreshBoot(s, 0);
  // base 100 * 0.6 * 4.1667 ≈ 250
  const r = effectiveRate(s, 10);
  assert.ok(Math.abs(r - 250) < 0.5, `expected ~250, got ${r}`);
});

test('cold_sky: rateMul bonus doubled (additive) and duration halved at apply time', () => {
  const s = freshState({ amount: 10_000 });
  setActivePattern(s.contactLog, 'cold_sky');
  const u = getUpgrade('espresso'); // rateMul buff; exact mult retunes over time
  installSlot(s, 1, 'espresso', 200);
  const ok = tryBuy(s, 1, 1000);
  assert.ok(ok.ok);
  assert.equal(s.buffs.rateMul.length, 1);
  // cold_sky doubles the *bonus* (mult - 1), so 2.4 → 1 + 1.4×2 = 3.8.
  // Multiplying the raw mult instead would yield 4.8 — by design, no.
  assert.equal(s.buffs.rateMul[0].value, 1 + (u.mult - 1) * 2);
  assert.equal(s.buffs.rateMul[0].duration, u.duration * 0.5);
});

test('patched_frame: free-purchase covers buff cost without spending Echoes', () => {
  const s = freshState({ amount: 100 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  assert.equal(patternFreeLeft(s), 5);
  installSlot(s, 1, 'espresso', 200); // cost > balance, but free covers it
  const before = s.amount;
  const res = tryBuy(s, 1, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, before, 'balance untouched on a free pattern purchase');
  assert.equal(patternFreeLeft(s), 4);
  // Buff still landed.
  assert.equal(s.buffs.rateMul.length, 1);
});

test('patched_frame: free purchases run out after 5, then cost is charged at doubled rate', () => {
  const s = freshState({ amount: 0 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  assert.equal(patternFreeLeft(s), 5);
  for (let i = 0; i < 5; i++) {
    installSlot(s, 1, 'espresso', 200);
    const r = tryBuy(s, 1, 0);
    assert.ok(r.ok, `purchase ${i} should succeed for free`);
  }
  assert.equal(patternFreeLeft(s), 0);
  installSlot(s, 1, 'espresso', 200);
  const r = tryBuy(s, 1, 0);
  assert.equal(r.ok, false, 'sixth purchase should fail when broke');
  assert.equal(r.reason, 'broke');
  // Affording the rolled cost (200) is not enough — the pattern doubles it to 400.
  s.amount = 200;
  installSlot(s, 1, 'espresso', 200);
  assert.equal(tryBuy(s, 1, 0).ok, false, '200 Echoes should not cover the 2× cost');
  s.amount = 400;
  installSlot(s, 1, 'espresso', 200);
  const r2 = tryBuy(s, 1, 0);
  assert.ok(r2.ok, '400 Echoes covers the 2× cost');
  assert.equal(s.amount, 0, 'pattern doubled the deducted price');
});

test('patched_frame: applyPatternOnFreshBoot grants 5 free re-tunes', () => {
  const s = freshState({ freeRerolls: 0 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  assert.equal(s.freeRerolls, 5);
});

test('patched_frame: existing free-reroll bank is not reduced by the grant', () => {
  const s = freshState({ freeRerolls: 7 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  // Player already had more than 5 — grant should not shrink the bank.
  assert.equal(s.freeRerolls, 7);
});

test('patternPurchaseCostMul: identity outside Patched Frame, 2 under it', () => {
  const s = freshState();
  assert.equal(patternPurchaseCostMul(s), 1);
  setActivePattern(s.contactLog, 'patched_frame');
  assert.equal(patternPurchaseCostMul(s), 2);
});

test('patched_frame: gambles are excluded from free-purchase coverage', () => {
  const origRandom = Math.random;
  Math.random = () => 0.999; // always lose
  try {
    const s = freshState({ amount: 100 });
    setActivePattern(s.contactLog, 'patched_frame');
    applyPatternOnFreshBoot(s, 0);
    installSlot(s, 3, 'coin_flip', 50);
    const before = patternFreeLeft(s);
    const r = tryBuy(s, 3, 0);
    assert.ok(r.ok);
    assert.equal(s.amount, 50, 'gamble still deducts the wager');
    assert.equal(patternFreeLeft(s), before, 'gamble must not consume a free purchase');
  } finally {
    Math.random = origRandom;
  }
});

test('patched_frame: reroll cost is doubled', () => {
  const s = freshState({ amount: 100_000, basePerSecond: 0 });
  s.shop.rerollUnlocked = true;
  installSlot(s, 0, 'mult5', 50);
  installSlot(s, 1, 'coin_flip', 100);
  // Without pattern: 2 slots × 1.5% × 100k = 3000
  const baseline = computeRerollCost(s, 0, 2);
  assert.equal(baseline, 3000);
  setActivePattern(s.contactLog, 'patched_frame');
  assert.equal(computeRerollCost(s, 0, 2), 6_000);
});

test('bare_wire: base rate ×0.6, gamble luck +8%, durations ×2, buff strength ×1.25', () => {
  const s = freshState({ basePerSecond: 100, amount: 10_000 });
  setActivePattern(s.contactLog, 'bare_wire');
  assert.equal(Number(effectiveRate(s, 0).toFixed(6)), 60);
  assert.equal(patternGambleLuckBonus(s), 0.08);
  // Buy a rate buff: duration ×2, bonus ×1.25 (e.g. mult 2.4 → 1 + 1.4×1.25 = 2.75).
  const u = getUpgrade('espresso');
  installSlot(s, 1, 'espresso', 100);
  tryBuy(s, 1, 1000);
  assert.equal(s.buffs.rateMul[0].duration, u.duration * 2);
  assert.equal(Number(s.buffs.rateMul[0].value.toFixed(6)), Number((1 + (u.mult - 1) * 1.25).toFixed(6)));
});

test('bare_wire: gamble luck bonus tips a coinflip win when forced', () => {
  // coin_flip now sits at chance 0.47 (the band-floor takes a small slice);
  // force RNG just above 0.47 so the bare_wire +0.08 luck bonus lifts the
  // player into the win bracket. Effective threshold: 0.55.
  const origRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const s = freshState({ amount: 1000 });
    setActivePattern(s.contactLog, 'bare_wire');
    installSlot(s, 3, 'coin_flip', 100);
    const r = tryBuy(s, 3, 0);
    assert.ok(r.ok);
    assert.equal(r.result.won, true, 'pattern luck bonus should have lifted the roll into a win');
  } finally {
    Math.random = origRandom;
  }
});

test('echo_loom: networkYieldMul doubles mesh contribution, base halved', () => {
  const s = freshState({ basePerSecond: 100 });
  setActivePattern(s.contactLog, 'echo_loom');
  assert.equal(patternNetworkYieldMul(s), 2);
  assert.equal(patternBaseRateMul(s), 0.5);
  // No relays placed → only base * 0.5 applies. 100 * 0.5 = 50.
  assert.equal(effectiveRate(s, 0), 50);
});

test('echo_loom: with a placed online relay, contribution is doubled', () => {
  const s = freshState({ basePerSecond: 0 });
  ensureNetwork(s);
  queueToken(s, 'common', 100);
  // Place far enough in the past that ripening completes by `now`.
  placeRelay(s, { q: 0, r: 0 }, 0);
  // Hop forward past the ripen window.
  const now = 1e6;
  const raw = networkContribution(s, now);
  assert.ok(raw > 0, 'baseline network contribution should be positive');
  // Bare networkContribution does not include the pattern multiplier — the
  // multiplier lands inside effectiveRate's additiveBase.
  setActivePattern(s.contactLog, 'echo_loom');
  // effectiveRate = (base + net*2) * patternBaseRateMul. base=0, base mul=0.5.
  assert.equal(Number(effectiveRate(s, now).toFixed(6)), Number((raw * 2 * 0.5).toFixed(6)));
});

test('markPatternCompleted: bumps counter for the active pattern', () => {
  const log = freshLog();
  setActivePattern(log, 'surge_tide');
  assert.equal(isPatternCompleted(log, 'surge_tide'), false);
  assert.ok(markPatternCompleted(log));
  assert.equal(isPatternCompleted(log, 'surge_tide'), true);
  assert.equal(log.patternCompleted.surge_tide, 1);
});

test('markPatternCompleted: no-op when no pattern is set', () => {
  const log = freshLog();
  assert.equal(markPatternCompleted(log), false);
  assert.deepEqual(log.patternCompleted || {}, {});
});

test('closeCycle: records the active pattern as completed', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  setActivePattern(log, 'bare_wire');
  closeCycle(log, 10_000);
  assert.equal(isPatternCompleted(log, 'bare_wire'), true);
});

test('allPatternsCompleted: true only after every PATTERN id is completed', () => {
  const log = freshLog();
  assert.equal(allPatternsCompleted(log), false);
  for (const p of PATTERNS) {
    log.pattern = p.id;
    markPatternCompleted(log);
  }
  assert.equal(allPatternsCompleted(log), true);
});

test('consumePatternFreePurchase: no-op when none remain', () => {
  const s = freshState();
  assert.equal(consumePatternFreePurchase(s), false);
  s.patternFreeLeft = 1;
  assert.equal(consumePatternFreePurchase(s), true);
  assert.equal(s.patternFreeLeft, 0);
  assert.equal(consumePatternFreePurchase(s), false);
});

test('getActivePattern: returns null when log has no pattern set', () => {
  const s = freshState();
  assert.equal(getActivePattern(s), null);
});
