import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS, getPattern, getActivePattern, setActivePattern, clearActivePattern,
  hasPendingPatternChoice, markPendingPatternChoice,
  patternBaseRateMul, patternRerollCostMul,
  patternBuffDurationMul, patternBuffRateMulStrength, patternGambleLuckBonus,
  patternFreeLeft, consumePatternFreePurchase, applyPatternOnFreshBoot,
} from '../src/cyclePatterns.js';
import {
  makeShopState, effectiveRate, integrateRate, tryBuy, tryReroll,
  computeRerollCost,
} from '../src/shop.js';
import { getUpgrade } from '../src/upgrades.js';
import { closeCycle, recordContact } from '../src/contactLog.js';

function freshLog() {
  return {
    run: 1, worlds: [], mass: 0, engravings: {}, bestPeak: 0,
    pattern: null, pendingPatternChoice: false, patternUsed: {},
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

test('PATTERNS: registry has 3-4 distinct patterns with required fields', () => {
  assert.ok(PATTERNS.length >= 3 && PATTERNS.length <= 4, 'expected 3-4 patterns');
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

test('cold_sky: rateMul buff value is doubled and duration halved at apply time', () => {
  const s = freshState({ amount: 10_000 });
  setActivePattern(s.contactLog, 'cold_sky');
  installSlot(s, 1, 'espresso', 200); // espresso: rateMul, mult=3, duration=60
  const ok = tryBuy(s, 1, 1000);
  assert.ok(ok.ok);
  assert.equal(s.buffs.rateMul.length, 1);
  // Strength: 3 * 2 = 6. Duration: 60 * 0.5 = 30.
  assert.equal(s.buffs.rateMul[0].value, 6);
  assert.equal(s.buffs.rateMul[0].duration, 30);
});

test('patched_frame: free-purchase covers buff cost without spending Echoes', () => {
  const s = freshState({ amount: 100 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  assert.equal(patternFreeLeft(s), 3);
  installSlot(s, 1, 'espresso', 200); // cost > balance, but free covers it
  const before = s.amount;
  const res = tryBuy(s, 1, 0);
  assert.ok(res.ok);
  assert.equal(s.amount, before, 'balance untouched on a free pattern purchase');
  assert.equal(patternFreeLeft(s), 2);
  // Buff still landed.
  assert.equal(s.buffs.rateMul.length, 1);
});

test('patched_frame: free purchases run out after 3, then cost is charged', () => {
  const s = freshState({ amount: 0 });
  setActivePattern(s.contactLog, 'patched_frame');
  applyPatternOnFreshBoot(s, 0);
  assert.equal(patternFreeLeft(s), 3);
  for (let i = 0; i < 3; i++) {
    installSlot(s, 1, 'espresso', 200);
    const r = tryBuy(s, 1, 0);
    assert.ok(r.ok, `purchase ${i} should succeed for free`);
  }
  assert.equal(patternFreeLeft(s), 0);
  installSlot(s, 1, 'espresso', 200);
  const r = tryBuy(s, 1, 0);
  assert.equal(r.ok, false, 'fourth purchase should fail when broke');
  assert.equal(r.reason, 'broke');
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
  // Without pattern: 2 slots × 3% × 100k = 6000
  const baseline = computeRerollCost(s, 0, 2);
  assert.equal(baseline, 6000);
  setActivePattern(s.contactLog, 'patched_frame');
  assert.equal(computeRerollCost(s, 0, 2), 12_000);
});

test('bare_wire: base rate halved, gamble luck +5%, durations doubled', () => {
  const s = freshState({ basePerSecond: 100, amount: 1000 });
  setActivePattern(s.contactLog, 'bare_wire');
  assert.equal(effectiveRate(s, 0), 50);
  assert.equal(patternGambleLuckBonus(s), 0.05);
  // Buy a rate buff: duration should be doubled.
  installSlot(s, 1, 'espresso', 100); // duration 60
  tryBuy(s, 1, 1000);
  assert.equal(s.buffs.rateMul[0].duration, 120);
});

test('bare_wire: gamble luck bonus tips a coinflip win when forced', () => {
  // A coin_flip with chance 0.5; force RNG just above 0.5 so the bonus
  // (which adds 0.05) lifts the player into the win bracket.
  const origRandom = Math.random;
  Math.random = () => 0.52;
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
