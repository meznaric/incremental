import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinTapTolerance, TAP_MOVE_TOLERANCE_PX } from '../src/tap.js';

test('zero movement is a tap', () => {
  assert.equal(isWithinTapTolerance(0, 0), true);
});

test('sub-pixel jitter counts as a tap', () => {
  assert.equal(isWithinTapTolerance(0.3, 0.4), true);
  assert.equal(isWithinTapTolerance(2, -2), true);
});

test('movement at threshold is still a tap', () => {
  assert.equal(isWithinTapTolerance(TAP_MOVE_TOLERANCE_PX, 0), true);
  assert.equal(isWithinTapTolerance(0, -TAP_MOVE_TOLERANCE_PX), true);
});

test('movement beyond threshold is a drag', () => {
  assert.equal(isWithinTapTolerance(TAP_MOVE_TOLERANCE_PX + 0.1, 0), false);
  assert.equal(isWithinTapTolerance(12, 12), false); // hypot ~17 > 15
});

test('explicit tolerance overrides the default', () => {
  assert.equal(isWithinTapTolerance(8, 0, 5), false);
  assert.equal(isWithinTapTolerance(8, 0, 10), true);
});

test('default tolerance is generous enough for finger jitter (>= 10px)', () => {
  assert.ok(TAP_MOVE_TOLERANCE_PX >= 10);
});
