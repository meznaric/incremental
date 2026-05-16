import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordContact, sortedWorlds, getRun, advanceRun,
  worldFor, ALL_WORLDS, backfillFromShown,
  cycleContactCount, canCloseCycle, memoryShards, memoryMul,
  closeCycle, ECHO_MEMORY_PER_SHARD,
  massForPeak, getMass, getEngraving, ENGRAVINGS,
  engravingCost, canBuyEngraving, buyEngraving,
  ascentExp, boneMemoryBonus, quickWakeMul, firstLightAmount,
  ASCENT_PER_LEVEL, BONE_MEMORY_PER_LEVEL, FIRST_LIGHT_AMOUNT,
  echoLoopLevel, isLoopMode, activeEp, allEpsComplete, isEpComplete,
} from '../src/contactLog.js';
import { WORLDS_BY_EP } from '../src/worlds-data.js';

// Helper: log a synthetic player who has completed every world in EPs 1..n.
function logWithEpsCompleted(n) {
  const log = { run: 1, worlds: [] };
  for (let ep = 1; ep <= n; ep++) {
    for (const k of Object.keys(WORLDS_BY_EP[ep])) {
      const def = WORLDS_BY_EP[ep][k];
      log.worlds.push({ id: def.id, name: def.name, ep: def.ep, status: def.status, contactedAt: 1, run: ep });
    }
  }
  log.run = n + 1;
  return log;
}

const freshLog = () => ({ run: 1, worlds: [] });

test('recordContact: appends a world for a known milestone (EP1 by default)', () => {
  const log = freshLog();
  const added = recordContact(log, 'milestone_1k', 100);
  assert.equal(added, true);
  assert.equal(log.worlds.length, 1);
  // Cycle 1 plays EP1; milestone_1k → Ish-Karal.
  assert.equal(log.worlds[0].id, 'ish_karal');
  assert.equal(log.worlds[0].name, 'ISH-KARAL');
  assert.equal(log.worlds[0].ep, 1);
  assert.equal(log.worlds[0].status, 'SHIFTED');
  assert.equal(log.worlds[0].run, 1);
  assert.equal(log.worlds[0].contactedAt, 100);
});

test('recordContact: climactic 1t slot is the canonical EP world', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1t', 100);
  // Cycle 1 plays EP1; milestone_1t (the climax) → Ahn-Tar-3.
  assert.equal(log.worlds[0].id, 'ahn_tar_3');
  assert.equal(log.worlds[0].name, 'AHN-TAR-3');
  assert.equal(log.worlds[0].status, 'TRIGGERED');
});

test('recordContact: idempotent — does not duplicate the same world', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  const second = recordContact(log, 'milestone_1k', 200);
  assert.equal(second, false);
  assert.equal(log.worlds.length, 1);
  assert.equal(log.worlds[0].contactedAt, 100, 'first contact time is preserved');
});

test('recordContact: ignores unknown interstitial ids', () => {
  const log = freshLog();
  const added = recordContact(log, 'first_gamble', 100);
  assert.equal(added, false);
  assert.equal(log.worlds.length, 0);
});

test('recordContact: resolves the world per the log\'s active EP (first incomplete)', () => {
  // Empty log → activeEp = 1; milestone_1t → Ahn-Tar-3.
  const fresh = { run: 1, worlds: [] };
  recordContact(fresh, 'milestone_1t', 100);
  assert.equal(fresh.worlds[0].id, 'ahn_tar_3', 'EP1 active → climax is Ahn-Tar-3');

  // EP1 complete → activeEp = 2; milestone_1t → Solunn.
  const ep2 = logWithEpsCompleted(1);
  recordContact(ep2, 'milestone_1t', 100);
  assert.equal(ep2.worlds[ep2.worlds.length - 1].id, 'solunn', 'EP2 active → climax is Solunn');

  // EPs 1-7 complete → activeEp = 8; milestone_1t → The Cascade.
  const ep8 = logWithEpsCompleted(7);
  recordContact(ep8, 'milestone_1t', 100);
  assert.equal(ep8.worlds[ep8.worlds.length - 1].id, 'the_cascade', 'EP8 active → climax is The Cascade');
});

test('recordContact: continuation cycle keeps the same EP active until full', () => {
  // Player closes cycle 1 with only ish_karal logged. Next cycle is still EP1.
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);  // ish_karal
  closeCycle(log, 1e3);
  assert.equal(activeEp(log), 1, 'EP1 still active after early close');
  // milestone_1k → ish_karal again, already logged → no new entry.
  const dup = recordContact(log, 'milestone_1k', 200);
  assert.equal(dup, false);
  // milestone_10k → belnesh, fresh.
  const added = recordContact(log, 'milestone_10k', 200);
  assert.equal(added, true);
  assert.equal(log.worlds[1].id, 'belnesh');
  assert.equal(log.worlds[1].run, getRun(log), 'tagged with the current run');
});

test('WORLDS_BY_EP: every entry has the required shape', () => {
  for (const [ep, milestones] of Object.entries(WORLDS_BY_EP)) {
    for (const [key, def] of Object.entries(milestones)) {
      const label = `EP${ep}/${key}`;
      assert.equal(typeof def.id, 'string', `${label}.id`);
      assert.equal(typeof def.name, 'string', `${label}.name`);
      assert.equal(typeof def.ep, 'number', `${label}.ep`);
      assert.equal(def.ep, Number(ep), `${label}.ep matches its EP key`);
      assert.ok(['TRIGGERED', 'COLLAPSED', 'SHIFTED', 'MISSING'].includes(def.status),
        `${label}.status must be one of TRIGGERED|COLLAPSED|SHIFTED|MISSING`);
    }
  }
});

test('WORLDS_BY_EP: every entry declares image and flavor', () => {
  for (const [ep, milestones] of Object.entries(WORLDS_BY_EP)) {
    for (const [key, def] of Object.entries(milestones)) {
      const label = `EP${ep}/${key}`;
      assert.ok('image' in def, `${label}.image must be declared (string or null)`);
      assert.ok(def.image === null || (typeof def.image === 'string' && def.image.endsWith('.png')),
        `${label}.image must be a .png path or null`);
      assert.equal(typeof def.flavor, 'string', `${label}.flavor`);
      assert.ok(def.flavor.length > 0, `${label}.flavor non-empty`);
    }
  }
});

test('WORLDS_BY_EP: world ids are unique across all EPs', () => {
  const seen = new Map();
  for (const [ep, milestones] of Object.entries(WORLDS_BY_EP)) {
    for (const def of Object.values(milestones)) {
      const prev = seen.get(def.id);
      assert.equal(prev, undefined,
        `duplicate world id ${def.id} appears in EP${ep} and EP${prev}`);
      seen.set(def.id, ep);
    }
  }
});

test('WORLDS_BY_EP: every EP fills the 10 milestone slots', () => {
  const required = [
    'milestone_1k', 'milestone_10k', 'milestone_100k',
    'milestone_1m', 'milestone_10m', 'milestone_100m',
    'milestone_1b', 'milestone_10b', 'milestone_100b',
    'milestone_1t',
  ];
  for (const ep of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const slot of required) {
      assert.ok(WORLDS_BY_EP[ep][slot], `EP${ep}.${slot} missing`);
    }
  }
});

test('worldFor: returns null for unknown milestone id', () => {
  assert.equal(worldFor({ run: 1, worlds: [] }, 'not_a_milestone'), null);
});

test('ALL_WORLDS: every entry is keyed by its world id', () => {
  for (const [key, def] of Object.entries(ALL_WORLDS)) {
    assert.equal(def.id, key, `ALL_WORLDS[${key}].id mismatch`);
  }
});

test('sortedWorlds: newest contact first', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);  // ish_karal
  recordContact(log, 'milestone_1m', 200);  // daouns_reach
  recordContact(log, 'milestone_1b', 50);   // halun_veth
  const sorted = sortedWorlds(log);
  assert.deepEqual(sorted.map((w) => w.id), ['daouns_reach', 'ish_karal', 'halun_veth']);
});

test('getRun: defaults to 1 on a fresh or malformed log', () => {
  assert.equal(getRun(null), 1);
  assert.equal(getRun(undefined), 1);
  assert.equal(getRun({}), 1);
  assert.equal(getRun({ run: 4 }), 4);
});

test('backfillFromShown: adds entries for every legacy contact-bearing shown id', () => {
  const log = freshLog();
  const shown = {
    welcome: true,        // not a contact — ignored
    first_gamble: true,   // not a contact — ignored
    milestone_1k: true,
    milestone_1m: true,
    milestone_1qa: true,  // legacy id from before the EP rotation
  };
  const added = backfillFromShown(log, shown, 500);
  assert.equal(added, 3);
  assert.equal(log.worlds.length, 3);
  const ids = log.worlds.map((w) => w.id).sort();
  // Backfill uses the pre-rotation mapping: 1k→Ahn-Tar-3, 1m→Solunn, 1qa→Lehl.
  assert.deepEqual(ids, ['ahn_tar_3', 'lehl', 'solunn']);
});

test('backfillFromShown: idempotent on a second call', () => {
  const log = freshLog();
  backfillFromShown(log, { milestone_1k: true }, 500);
  const second = backfillFromShown(log, { milestone_1k: true }, 600);
  assert.equal(second, 0);
  assert.equal(log.worlds.length, 1);
});

test('advanceRun: increments the run counter monotonically', () => {
  const log = freshLog();
  assert.equal(getRun(log), 1);
  advanceRun(log);
  assert.equal(getRun(log), 2);
  advanceRun(log);
  advanceRun(log);
  assert.equal(getRun(log), 4);
});

test('cycleContactCount: only counts contacts tagged with the current run', () => {
  const log = freshLog();
  assert.equal(cycleContactCount(log), 0);
  recordContact(log, 'milestone_1k', 100);
  recordContact(log, 'milestone_1m', 110);
  assert.equal(cycleContactCount(log), 2);
  advanceRun(log);
  assert.equal(cycleContactCount(log), 0, 'old run contacts no longer count');
  recordContact(log, 'milestone_1b', 200);
  assert.equal(cycleContactCount(log), 1);
});

test('canCloseCycle: false on a fresh log, true once a contact lands this cycle', () => {
  const log = freshLog();
  assert.equal(canCloseCycle(log), false);
  recordContact(log, 'milestone_1k', 100);
  assert.equal(canCloseCycle(log), true);
});

test('canCloseCycle: false again immediately after closing, until next contact', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  closeCycle(log);
  assert.equal(canCloseCycle(log), false, 'new cycle starts empty');
});

test('canCloseCycle: cycle 2 can be closed with the next EP\'s 1k slot once EP1 is full', () => {
  // Fill EP1 across one cycle, then close.
  const log = freshLog();
  for (const k of Object.keys(WORLDS_BY_EP[1])) recordContact(log, k, 100);
  assert.equal(activeEp(log), 2, 'EP1 done → EP2 active');
  closeCycle(log, 0);
  assert.equal(getRun(log), 2);
  // Cycle 2 plays EP2; milestone_1k now resolves to mora_brae.
  const added = recordContact(log, 'milestone_1k', 200);
  assert.equal(added, true);
  assert.equal(log.worlds[log.worlds.length - 1].id, 'mora_brae');
  assert.equal(canCloseCycle(log), true);
});

test('memoryShards: counts every world ever logged across all cycles', () => {
  const log = freshLog();
  assert.equal(memoryShards(log), 0);
  recordContact(log, 'milestone_1k', 100);
  recordContact(log, 'milestone_1m', 110);
  advanceRun(log);
  recordContact(log, 'milestone_1b', 200);
  assert.equal(memoryShards(log), 3);
});

test('memoryMul: 1 + ECHO_MEMORY_PER_SHARD * shards', () => {
  const log = freshLog();
  assert.equal(memoryMul(log), 1);
  recordContact(log, 'milestone_1k', 100);
  assert.equal(memoryMul(log), 1 + ECHO_MEMORY_PER_SHARD);
  recordContact(log, 'milestone_1m', 110);
  recordContact(log, 'milestone_1b', 120);
  assert.equal(memoryMul(log), 1 + 3 * ECHO_MEMORY_PER_SHARD);
});

test('closeCycle: refuses to close an empty cycle', () => {
  const log = freshLog();
  assert.equal(closeCycle(log, 0), false);
  assert.equal(getRun(log), 1, 'run does not advance');
});

test('closeCycle: advances the run and keeps the world list intact', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  recordContact(log, 'milestone_1m', 110);
  const banked = closeCycle(log, 1e6); // 1M peak → log10(1e6) - 2 = 4 kg
  assert.equal(banked, 4);
  assert.equal(getRun(log), 2);
  assert.equal(log.worlds.length, 2, 'worlds survive prestige');
  assert.equal(memoryShards(log), 2);
});

// — Carrier Mass —

test('massForPeak: zero below 1k', () => {
  assert.equal(massForPeak(0), 0);
  assert.equal(massForPeak(999), 0);
  assert.equal(massForPeak(NaN), 0);
});

test('massForPeak: log10(peak) - 2, floored', () => {
  assert.equal(massForPeak(1e3), 1);
  assert.equal(massForPeak(1e6), 4);
  assert.equal(massForPeak(1e9), 7);
  assert.equal(massForPeak(1e12), 10);
  assert.equal(massForPeak(5e6), 4);
});

test('closeCycle: banks mass against peak, persists across closes', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  closeCycle(log, 1e6);
  assert.equal(getMass(log), 4);
  recordContact(log, 'milestone_1m', 200);
  closeCycle(log, 1e9);
  assert.equal(getMass(log), 11);
});

test('closeCycle: refusal does not bank mass', () => {
  const log = freshLog();
  const banked = closeCycle(log, 1e9);
  assert.equal(banked, false);
  assert.equal(getMass(log), 0);
});

// — Carrier Engravings —

test('ENGRAVINGS: every entry has the required shape', () => {
  for (const e of ENGRAVINGS) {
    assert.equal(typeof e.id, 'string', `engraving id`);
    assert.equal(typeof e.name, 'string', `engraving name`);
    assert.equal(typeof e.desc, 'string', `engraving desc`);
    assert.equal(typeof e.cost, 'function', `engraving cost fn`);
    assert.ok(e.max && e.max >= 1, `engraving max`);
  }
});

test('engravingCost: returns the entry cost at current level', () => {
  const log = freshLog();
  assert.equal(engravingCost(log, 'first_light'), 1);
  log.mass = 100;
  assert.equal(engravingCost(log, 'bone_memory'), 2);
  buyEngraving(log, 'bone_memory');
  assert.equal(engravingCost(log, 'bone_memory'), 4);
});

test('engravingCost: Infinity once maxed', () => {
  const log = freshLog();
  log.mass = 10;
  buyEngraving(log, 'first_light');
  assert.equal(engravingCost(log, 'first_light'), Infinity);
});

test('canBuyEngraving + buyEngraving: gated by mass', () => {
  const log = freshLog();
  assert.equal(canBuyEngraving(log, 'first_light'), false);
  log.mass = 1;
  assert.equal(canBuyEngraving(log, 'first_light'), true);
  assert.equal(buyEngraving(log, 'first_light'), true);
  assert.equal(getMass(log), 0);
  assert.equal(getEngraving(log, 'first_light'), 1);
});

test('buyEngraving: ignored when broke', () => {
  const log = freshLog();
  assert.equal(buyEngraving(log, 'bone_memory'), false);
  assert.equal(getEngraving(log, 'bone_memory'), 0);
});

test('ascentExp: 0 when no levels, +ASCENT_PER_LEVEL per level', () => {
  const log = freshLog();
  assert.equal(ascentExp(log), 0);
  log.mass = 10000;
  buyEngraving(log, 'ascent');
  assert.equal(ascentExp(log), ASCENT_PER_LEVEL);
  buyEngraving(log, 'ascent');
  assert.ok(Math.abs(ascentExp(log) - 2 * ASCENT_PER_LEVEL) < 1e-12);
});

test('boneMemoryBonus: scales with level', () => {
  const log = freshLog();
  assert.equal(boneMemoryBonus(log), 0);
  log.mass = 100;
  buyEngraving(log, 'bone_memory');
  assert.equal(boneMemoryBonus(log), BONE_MEMORY_PER_LEVEL);
});

test('quickWakeMul: 0 at level 0, 1+level otherwise', () => {
  const log = freshLog();
  assert.equal(quickWakeMul(log), 0);
  log.mass = 100;
  buyEngraving(log, 'quick_wake');
  assert.equal(quickWakeMul(log), 2);
  buyEngraving(log, 'quick_wake');
  assert.equal(quickWakeMul(log), 3);
});

test('firstLightAmount: 0 by default, FIRST_LIGHT_AMOUNT once cut', () => {
  const log = freshLog();
  assert.equal(firstLightAmount(log), 0);
  log.mass = 1;
  buyEngraving(log, 'first_light');
  assert.equal(firstLightAmount(log), FIRST_LIGHT_AMOUNT);
});

// — Echo Loop mode (post-season prestige) —

test('isLoopMode: false until every EP is complete, true afterward', () => {
  assert.equal(isLoopMode({ run: 1, worlds: [] }), false);
  assert.equal(isLoopMode(logWithEpsCompleted(9)), false, '9 EPs done is not enough');
  const allDone = logWithEpsCompleted(10);
  assert.equal(isLoopMode(allDone), true);
});

test('echoLoopLevel: tracks loopCycles, not the raw run counter', () => {
  // Fresh log — never closed, never in loop mode.
  assert.equal(echoLoopLevel({ run: 1, worlds: [] }), 0);
  // A log that just entered loop mode (loopCycles still 0).
  const fresh = { ...logWithEpsCompleted(8), mass: 0, engravings: {}, loopMode: true, loopCycles: 0 };
  assert.equal(echoLoopLevel(fresh), 0, 'transition cycle does not bump');
  // Two loop cycles closed.
  fresh.loopCycles = 2;
  assert.equal(echoLoopLevel(fresh), 2);
});

test('canCloseCycle: Loop mode always closes (no contact required)', () => {
  // All EPs done, zero contacts this cycle — Season 1 mechanic would refuse,
  // Echo Loop allows the close.
  const log = { ...logWithEpsCompleted(8), loopMode: true, loopCycles: 0, mass: 0, engravings: {} };
  assert.equal(canCloseCycle(log), true);
});

test('memoryMul: each Echo Loop adds the same as one virtual shard', () => {
  const baseShards = { run: 1, worlds: [{ id: 'a' }, { id: 'b' }], loopCycles: 0 };
  const oneLoop = { run: 1, worlds: [{ id: 'a' }, { id: 'b' }], loopCycles: 1 };
  assert.equal(memoryMul(baseShards), 1 + 2 * ECHO_MEMORY_PER_SHARD);
  assert.equal(memoryMul(oneLoop),    1 + 3 * ECHO_MEMORY_PER_SHARD);
});

test('closeCycle: Loop-mode close advances run and banks mass without contacts', () => {
  // Player just completed EP8 last cycle → loopMode true, loopCycles 0. The
  // first Loop close should work even with zero current-cycle contacts.
  const log = { ...logWithEpsCompleted(8), mass: 0, engravings: {}, bestPeak: 0,
    loopMode: true, loopCycles: 0 };
  const startRun = getRun(log);
  const banked = closeCycle(log, 1e9);
  assert.equal(banked, 7);
  assert.equal(getRun(log), startRun + 1);
  assert.equal(echoLoopLevel(log), 1, 'first loop close bumps to 1');
});

test('closeCycle: the close that completes the final EP enters loop mode without bumping loopCycles', () => {
  // Fill EPs 1..9 and 9 of EP10. The 10th EP10 contact lands this cycle, then close.
  const log = logWithEpsCompleted(9);
  log.mass = 0; log.engravings = {}; log.bestPeak = 0;
  log.loopMode = false; log.loopCycles = 0;
  // Log nine EP10 worlds.
  const ep10Keys = Object.keys(WORLDS_BY_EP[10]);
  for (let i = 0; i < 9; i++) recordContact(log, ep10Keys[i], 100);
  assert.equal(activeEp(log), 10, 'still EP10 with one slot to go');
  // Final EP10 contact this cycle.
  recordContact(log, ep10Keys[9], 100);
  assert.equal(allEpsComplete(log), true);
  closeCycle(log, 1e6);
  assert.equal(log.loopMode, true, 'transition close flips loopMode');
  assert.equal(echoLoopLevel(log), 0, 'loopCycles unchanged on the transition close');
});

test('isEpComplete + activeEp: track EP fill against the world list', () => {
  const log = freshLog();
  assert.equal(activeEp(log), 1);
  assert.equal(isEpComplete(log, 1), false);
  for (const k of Object.keys(WORLDS_BY_EP[1])) recordContact(log, k, 100);
  assert.equal(isEpComplete(log, 1), true);
  assert.equal(activeEp(log), 2);
  assert.equal(allEpsComplete(log), false);
});

// — Per-EP threshold scaling —

import { thresholdsForEp, currentMilestones, MILESTONE_SLOT_IDS } from '../src/interstitial.js';

test('thresholdsForEp: EP1 matches the historical 10^3..10^12 flat table', () => {
  const ts = thresholdsForEp(1);
  assert.deepEqual(ts.map((t) => t.at), [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12]);
  assert.deepEqual(ts.map((t) => t.id), MILESTONE_SLOT_IDS);
});

test('thresholdsForEp: EP2 starts at 10^4 and steps 2 periods', () => {
  const ts = thresholdsForEp(2).map((t) => Math.log10(t.at));
  assert.deepEqual(ts, [4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
});

test('thresholdsForEp: EP10 climax reaches roughly 10^100', () => {
  const ts = thresholdsForEp(10).map((t) => Math.log10(t.at));
  assert.deepEqual(ts, [12, 22, 32, 42, 52, 62, 72, 82, 92, 102]);
});

test('currentMilestones: scales to the log\'s active EP', () => {
  const ep2Log = logWithEpsCompleted(1);
  const ms = currentMilestones(ep2Log).map((m) => m.at);
  assert.equal(ms[0], 1e4, 'EP2 first contact at 10^4');
  assert.equal(ms[9], 1e22, 'EP2 climax at 10^22');
});

test('currentMilestones: empty in loop mode', () => {
  const log = logWithEpsCompleted(10);
  log.loopMode = true;
  assert.deepEqual(currentMilestones(log), []);
});
