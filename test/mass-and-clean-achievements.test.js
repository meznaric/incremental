// Covers three of the recent backend changes:
//  - massForPeak doubling (contactLog)
//  - the flag trigger unlocking mythic_relay (achievements)
//  - the peakClean trigger for the four "clean run" achievements
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { massForPeak } from '../src/contactLog.js';
import { markStat, evaluateAchievements } from '../src/achievements.js';

function freshAch() {
  return { unlocked: {}, seen: {}, stats: {} };
}
function baseCtx(over = {}) {
  return Object.assign({
    log: { run: 1, worlds: [] },
    messageStats: {},
    peakAmount: 0,
    buffCount: 0,
  }, over);
}

test('massForPeak is doubled', () => {
  // floor(log10(peak)) - 2, then ×2.
  assert.equal(massForPeak(0), 0);
  assert.equal(massForPeak(999), 0);           // below 1000 floor → 0
  assert.equal(massForPeak(1000), 2);          // floor(log10(1000))=3 → (3-2)*2 = 2
  assert.equal(massForPeak(1e5), 6);           // floor(5)-2 = 3 → ×2 = 6
  assert.equal(massForPeak(1e9), 14);          // 9-2 = 7 → ×2 = 14
  assert.equal(massForPeak(1e12), 20);         // 12-2 = 10 → ×2 = 20
  // never negative
  assert.equal(massForPeak(10), 0);
  assert.equal(massForPeak(Infinity), 0);
  assert.equal(massForPeak(NaN), 0);
});

test('massForPeak is exactly twice the old single formula', () => {
  for (const p of [1e3, 1e4, 1e5, 1e6, 1e10, 1e20]) {
    const single = Math.max(0, Math.floor(Math.log10(p)) - 2);
    assert.equal(massForPeak(p), single * 2);
  }
});

test('flag trigger unlocks mythic_relay once the stat is marked', () => {
  const ach = freshAch();
  // Before the stat is observed, the achievement stays locked.
  let newly = evaluateAchievements(ach, baseCtx());
  assert.ok(!newly.includes('mythic_relay'), 'should not unlock before mythic seen');
  assert.ok(!ach.unlocked.mythic_relay);

  // markStat records the transient observation the flag trigger reads.
  assert.equal(markStat(ach, 'mythicSeen'), true);
  assert.equal(ach.stats.mythicSeen, true);

  newly = evaluateAchievements(ach, baseCtx());
  assert.ok(newly.includes('mythic_relay'), 'flag trigger should fire after markStat');
  assert.ok(ach.unlocked.mythic_relay);

  // Idempotent — a second evaluate does not re-unlock.
  const again = evaluateAchievements(ach, baseCtx());
  assert.ok(!again.includes('mythic_relay'));
});

test('mythicSeen survives reload via the stats bag and still fires', () => {
  // Simulate a persisted achievements object that carries the stat but never
  // got the unlock written (the original bug shape).
  const ach = { unlocked: {}, seen: {}, stats: { mythicSeen: true } };
  const newly = evaluateAchievements(ach, baseCtx());
  assert.ok(newly.includes('mythic_relay'));
});

test('peakClean (no hail) fires only when threshold met and clean', () => {
  // Below threshold → no.
  let ach = freshAch();
  let newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e29, messageStats: {} }));
  assert.ok(!newly.includes('clean_quintillion_nohail'));

  // At threshold, clean → yes.
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: {} }));
  assert.ok(newly.includes('clean_quintillion_nohail'));

  // At threshold but a hail was used → no.
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: { usedHail: true } }));
  assert.ok(!newly.includes('clean_quintillion_nohail'));

  // A used window does not block the no-hail achievement.
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: { usedWindow: true } }));
  assert.ok(newly.includes('clean_quintillion_nohail'));
});

test('peakClean (no window) fires only when threshold met and clean', () => {
  let ach = freshAch();
  let newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: {} }));
  assert.ok(newly.includes('clean_quintillion_nowindow'));

  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: { usedWindow: true } }));
  assert.ok(!newly.includes('clean_quintillion_nowindow'));

  // A used hail does not block the no-window achievement.
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: { usedHail: true } }));
  assert.ok(newly.includes('clean_quintillion_nowindow'));
});

test('the 1e60 clean tiers require the higher threshold', () => {
  // 1e30 clean does NOT unlock the 1e60 tiers.
  let ach = freshAch();
  let newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e30, messageStats: {} }));
  assert.ok(!newly.includes('clean_undecillion_nohail'));
  assert.ok(!newly.includes('clean_undecillion_nowindow'));

  // 1e60 clean unlocks both 1e60 tiers (and both 1e30 tiers too).
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e60, messageStats: {} }));
  assert.ok(newly.includes('clean_undecillion_nohail'));
  assert.ok(newly.includes('clean_undecillion_nowindow'));
  assert.ok(newly.includes('clean_quintillion_nohail'));
  assert.ok(newly.includes('clean_quintillion_nowindow'));

  // 1e60 but used a hail → only the no-window tiers fire.
  ach = freshAch();
  newly = evaluateAchievements(ach, baseCtx({ peakAmount: 1e60, messageStats: { usedHail: true } }));
  assert.ok(!newly.includes('clean_undecillion_nohail'));
  assert.ok(newly.includes('clean_undecillion_nowindow'));
});
