// Covers the patterns added alongside the True North baseline: that they exist,
// resolve through the hook helpers, and use only already-wired modifier fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PATTERNS, getPattern,
  patternBaseRateMul, patternNetworkYieldMul, patternPurchaseCostMul,
  patternRerollCostMul, patternBuffDurationMul, patternBuffRateMulStrength,
  patternGambleLuckBonus, applyPatternOnFreshBoot, setActivePattern,
} from '../src/cyclePatterns.js';

// The complete set of fields the existing helper functions actually consume.
// A new pattern must not introduce a field outside this allow-list, or it would
// silently require new wiring in shop.js / save.js.
const WIRED_FIELDS = new Set([
  'id', 'name', 'voice', 'desc', 'gameplay',
  'baseRateMul', 'networkYieldMul', 'purchaseCostMul', 'rerollCostMul',
  'buffDurationMul', 'buffRateMulStrength', 'gambleLuckBonus',
  'freePurchases', 'freeRerolls', 'seedRateMulBuff',
]);

function stateWith(id) {
  return { contactLog: { pattern: id }, patternFreeLeft: 0, freeRerolls: 0, buffs: { rateMul: [] } };
}

test('new pattern ids all exist', () => {
  for (const id of ['true_north', 'open_market', 'steady_sky', 'hot_band']) {
    assert.ok(getPattern(id), `${id} should be defined`);
  }
});

test('every pattern uses only wired modifier fields', () => {
  for (const p of PATTERNS) {
    for (const k of Object.keys(p)) {
      assert.ok(WIRED_FIELDS.has(k), `pattern ${p.id} uses unwired field "${k}"`);
    }
    if (p.seedRateMulBuff) {
      for (const k of Object.keys(p.seedRateMulBuff)) {
        assert.ok(['value', 'duration', 'sourceId'].includes(k),
          `pattern ${p.id} seedRateMulBuff has unexpected key "${k}"`);
      }
    }
  }
});

test('True North is fully neutral — every helper returns identity', () => {
  const s = stateWith('true_north');
  assert.equal(patternBaseRateMul(s), 1);
  assert.equal(patternNetworkYieldMul(s), 1);
  assert.equal(patternPurchaseCostMul(s), 1);
  assert.equal(patternRerollCostMul(s), 1);
  assert.equal(patternBuffDurationMul(s), 1);
  assert.equal(patternBuffRateMulStrength(s), 1);
  assert.equal(patternGambleLuckBonus(s), 0);
  // Fresh boot must seed nothing for the neutral pattern.
  applyPatternOnFreshBoot(s, 1000);
  assert.equal(s.buffs.rateMul.length, 0);
  assert.equal(s.patternFreeLeft, 0);
});

test('True North resolves identically to no pattern at all', () => {
  const none = { contactLog: { pattern: null } };
  const tn = stateWith('true_north');
  assert.equal(patternBaseRateMul(tn), patternBaseRateMul(none));
  assert.equal(patternPurchaseCostMul(tn), patternPurchaseCostMul(none));
  assert.equal(patternBuffRateMulStrength(tn), patternBuffRateMulStrength(none));
});

test('Open Market: cheap bands + cheap sweep, lean base', () => {
  const s = stateWith('open_market');
  assert.equal(patternPurchaseCostMul(s), 0.6);
  assert.equal(patternRerollCostMul(s), 0.5);
  assert.equal(patternBaseRateMul(s), 0.85);
});

test('Steady Sky: seeds a 2h standing carrier, weak short windows', () => {
  const s = stateWith('steady_sky');
  assert.equal(patternBuffRateMulStrength(s), 0.5);
  applyPatternOnFreshBoot(s, 1000);
  assert.equal(s.buffs.rateMul.length, 1);
  const b = s.buffs.rateMul[0];
  assert.equal(b.value, 2.0);
  assert.equal(b.duration, 7200);
  assert.equal(b.expiresAt, 1000 + 7200);
  assert.equal(b.sourceId, 'steady_sky');
});

test('Hot Band: hot base, far hails, double cost', () => {
  const s = stateWith('hot_band');
  assert.equal(patternBaseRateMul(s), 1.5);
  assert.equal(patternGambleLuckBonus(s), 0.10);
  assert.equal(patternPurchaseCostMul(s), 2.0);
  assert.equal(patternRerollCostMul(s), 2.0);
});

test('setActivePattern accepts each new pattern id', () => {
  for (const id of ['true_north', 'open_market', 'steady_sky', 'hot_band']) {
    const log = {};
    assert.equal(setActivePattern(log, id), true);
    assert.equal(log.pattern, id);
  }
  assert.equal(setActivePattern({}, 'not_a_pattern'), false);
});
