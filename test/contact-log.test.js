import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordContact, sortedWorlds, getRun, advanceRun,
  WORLD_FOR_INTERSTITIAL, backfillFromShown,
  cycleContactCount, canCloseCycle, memoryShards, memoryMul,
  closeCycle, ECHO_MEMORY_PER_SHARD,
  massForPeak, getMass, getEngraving, ENGRAVINGS,
  engravingCost, canBuyEngraving, buyEngraving,
  ascentExp, boneMemoryBonus, quickWakeMul, firstLightAmount,
  ASCENT_PER_LEVEL, BONE_MEMORY_PER_LEVEL, FIRST_LIGHT_AMOUNT,
} from '../src/contactLog.js';

const freshLog = () => ({ run: 1, worlds: [] });

test('recordContact: appends a world for a known interstitial', () => {
  const log = freshLog();
  const added = recordContact(log, 'milestone_1k', 100);
  assert.equal(added, true);
  assert.equal(log.worlds.length, 1);
  assert.equal(log.worlds[0].id, 'ahn_tar_3');
  assert.equal(log.worlds[0].name, 'AHN-TAR-3');
  assert.equal(log.worlds[0].ep, 1);
  assert.equal(log.worlds[0].status, 'TRIGGERED');
  assert.equal(log.worlds[0].run, 1);
  assert.equal(log.worlds[0].contactedAt, 100);
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

test('recordContact: tags each entry with the current run', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  advanceRun(log);
  advanceRun(log);
  recordContact(log, 'milestone_1m', 200);
  assert.equal(log.worlds[0].run, 1);
  assert.equal(log.worlds[1].run, 3);
});

test('WORLD_FOR_INTERSTITIAL: every entry has the required shape', () => {
  for (const [key, def] of Object.entries(WORLD_FOR_INTERSTITIAL)) {
    assert.equal(typeof def.id, 'string', `${key}.id`);
    assert.equal(typeof def.name, 'string', `${key}.name`);
    assert.equal(typeof def.ep, 'number', `${key}.ep`);
    assert.ok(['TRIGGERED', 'COLLAPSED', 'SHIFTED', 'MISSING'].includes(def.status),
      `${key}.status must be one of TRIGGERED|COLLAPSED|SHIFTED|MISSING`);
  }
});

test('sortedWorlds: newest contact first', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  recordContact(log, 'milestone_1m', 200);
  recordContact(log, 'milestone_1b', 50);
  const sorted = sortedWorlds(log);
  assert.deepEqual(sorted.map((w) => w.id), ['solunn', 'ahn_tar_3', 'vehrn_9']);
});

test('getRun: defaults to 1 on a fresh or malformed log', () => {
  assert.equal(getRun(null), 1);
  assert.equal(getRun(undefined), 1);
  assert.equal(getRun({}), 1);
  assert.equal(getRun({ run: 4 }), 4);
});

test('backfillFromShown: adds entries for every contact-bearing shown id', () => {
  const log = freshLog();
  const shown = {
    welcome: true,        // not a contact — ignored
    first_gamble: true,   // not a contact — ignored
    milestone_1k: true,
    milestone_1m: true,
    milestone_1qa: true,
  };
  const added = backfillFromShown(log, shown, 500);
  assert.equal(added, 3);
  assert.equal(log.worlds.length, 3);
  const ids = log.worlds.map((w) => w.id).sort();
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
  // Echo Memory carries forward — shards persist.
  assert.equal(memoryShards(log), 2);
});

// — Carrier Mass —

test('massForPeak: zero below 1k', () => {
  assert.equal(massForPeak(0), 0);
  assert.equal(massForPeak(999), 0);
  assert.equal(massForPeak(NaN), 0);
});

test('massForPeak: log10(peak) - 2, floored', () => {
  assert.equal(massForPeak(1e3), 1);      // log10 = 3 → 1
  assert.equal(massForPeak(1e6), 4);      // 6 - 2 = 4
  assert.equal(massForPeak(1e9), 7);
  assert.equal(massForPeak(1e12), 10);
  assert.equal(massForPeak(5e6), 4);      // floor(6.7) - 2 = 4
});

test('closeCycle: banks mass against peak, persists across closes', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  closeCycle(log, 1e6);                    // +4 kg
  assert.equal(getMass(log), 4);
  recordContact(log, 'milestone_1m', 200);
  closeCycle(log, 1e9);                    // +7 kg
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
  // First Light is one-time, cost 1.
  assert.equal(engravingCost(log, 'first_light'), 1);
  // Bone Memory at lvl 0 → 2; one buy → lvl 1, next cost 4.
  log.mass = 100;
  assert.equal(engravingCost(log, 'bone_memory'), 2);
  buyEngraving(log, 'bone_memory');
  assert.equal(engravingCost(log, 'bone_memory'), 4);
});

test('engravingCost: Infinity once maxed', () => {
  const log = freshLog();
  log.mass = 10;
  buyEngraving(log, 'first_light');                  // max 1
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
