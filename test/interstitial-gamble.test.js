import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGamble, INTERSTITIALS } from '../src/interstitial.js';

// Minimal state: contactLog null so bumpAnomaly / worldFor no-op, leaving the
// gamble-failure beats as the only thing checkGamble enqueues.
function mkState(losses) {
  return {
    contactLog: null,
    messages: {
      shown: {},
      queue: [],
      stats: { gambles: losses, gambleLosses: losses, allInLost: false, peakAmount: 0 },
    },
  };
}

// checkGamble increments gambleLosses, so seed at N-1 then report a loss to
// cross exactly N.
function lossAt(n) {
  const s = mkState(n - 1);
  checkGamble(s, { won: false, isAllIn: false, balanceAfter: 1 });
  return s;
}

test('hundredth_loss interstitial block exists', () => {
  assert.ok(INTERSTITIALS.hundredth_loss);
  assert.ok(Array.isArray(INTERSTITIALS.hundredth_loss.steps));
});

test('hundredth_loss enqueues on the 100th loss', () => {
  const s = lossAt(100);
  assert.ok(s.messages.queue.includes('hundredth_loss'));
});

test('tenth_loss enqueues on the 10th loss', () => {
  const s = lossAt(10);
  assert.ok(s.messages.queue.includes('tenth_loss'));
});

// Persistent store survives cycle close (fresh state, shown:{} reset). The
// in-memory fallback used under Node mirrors the localStorage behaviour: once
// a beat has fired it never fires again, even across a brand-new state.
test('gamble-failure beats fire only once ever, across cycles', () => {
  // First crossing of each threshold already happened in the tests above
  // (shared module-level seen store). A fresh state re-crossing must NOT
  // re-enqueue them.
  const s10 = lossAt(10);
  assert.equal(s10.messages.queue.includes('tenth_loss'), false);
  const s100 = lossAt(100);
  assert.equal(s100.messages.queue.includes('hundredth_loss'), false);
});
