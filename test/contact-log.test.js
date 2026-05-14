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
  echoLoopLevel, isLoopMode,
} from '../src/contactLog.js';
import { WORLDS_BY_EP } from '../src/worlds.js';

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

test('recordContact: resolves the world per the log.run → EP rotation', () => {
  const cycle1 = { run: 1, worlds: [] };
  recordContact(cycle1, 'milestone_1t', 100);
  assert.equal(cycle1.worlds[0].id, 'ahn_tar_3', 'cycle 1 climax = Ahn-Tar-3');

  const cycle2 = { run: 2, worlds: [] };
  recordContact(cycle2, 'milestone_1t', 100);
  assert.equal(cycle2.worlds[0].id, 'solunn', 'cycle 2 climax = Solunn');

  const cycle3 = { run: 3, worlds: [] };
  recordContact(cycle3, 'milestone_1t', 100);
  assert.equal(cycle3.worlds[0].id, 'vehrn_9', 'cycle 3 climax = Vehrn-9');

  const cycle8 = { run: 8, worlds: [] };
  recordContact(cycle8, 'milestone_1t', 100);
  assert.equal(cycle8.worlds[0].id, 'the_cascade', 'cycle 8 climax = The Cascade');
});

test('recordContact: tags each entry with the current run', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  advanceRun(log);
  advanceRun(log);
  // run is now 3 → EP3. milestone_1m in EP3 = esnal.
  recordContact(log, 'milestone_1m', 200);
  assert.equal(log.worlds[0].run, 1);
  assert.equal(log.worlds[1].run, 3);
  assert.equal(log.worlds[0].id, 'ish_karal');
  assert.equal(log.worlds[1].id, 'esnal');
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
  for (const ep of [1, 2, 3, 4, 5, 6, 7, 8]) {
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

test('canCloseCycle: cycle 2 can be closed with EP2 contacts (no dedupe lock)', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);   // ish_karal, cycle 1
  closeCycle(log, 0);
  assert.equal(getRun(log), 2);
  // Cycle 2 plays EP2; same milestone id resolves to a different world (mora_brae),
  // so the dedupe-by-world-id contract does NOT lock the cycle.
  const added = recordContact(log, 'milestone_1k', 200);
  assert.equal(added, true);
  assert.equal(log.worlds[1].id, 'mora_brae');
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

test('echoLoopLevel: 0 for runs 1..8, then run-8 from cycle 9 on', () => {
  for (let r = 1; r <= 8; r++) {
    assert.equal(echoLoopLevel({ run: r, worlds: [] }), 0, `run ${r}`);
  }
  assert.equal(echoLoopLevel({ run: 9,  worlds: [] }), 1);
  assert.equal(echoLoopLevel({ run: 14, worlds: [] }), 6);
});

test('isLoopMode: false before cycle 9 closes, true afterward', () => {
  assert.equal(isLoopMode({ run: 1, worlds: [] }), false);
  assert.equal(isLoopMode({ run: 8, worlds: [] }), false);
  assert.equal(isLoopMode({ run: 9, worlds: [] }), true);
});

test('canCloseCycle: Loop mode always closes (no contact required)', () => {
  // run 9 with zero current-cycle contacts — Season 1 mechanic would refuse,
  // Echo Loop allows the close.
  const log = { run: 9, worlds: [] };
  assert.equal(canCloseCycle(log), true);
});

test('memoryMul: each Echo Loop adds the same as one virtual shard', () => {
  // Same shard count, different loop level → mul scales by ECHO_MEMORY_PER_SHARD.
  const baseShards = { run: 1, worlds: [{ id: 'a' }, { id: 'b' }] };
  const oneLoop = { run: 9, worlds: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(memoryMul(baseShards), 1 + 2 * ECHO_MEMORY_PER_SHARD);
  assert.equal(memoryMul(oneLoop),    1 + 3 * ECHO_MEMORY_PER_SHARD);
});

test('closeCycle: Loop-mode close advances run and banks mass without contacts', () => {
  // Player ends cycle 8 climactically and prestiges → run = 9. The next
  // Loop close should work on the very first cycle 9 boot, before they
  // climb at all, because canCloseCycle is loop-relaxed.
  const log = { run: 9, worlds: [{ id: 'a', run: 1 }], mass: 0, engravings: {}, bestPeak: 0 };
  const banked = closeCycle(log, 1e9);
  assert.equal(banked, 7);
  assert.equal(getRun(log), 10);
  assert.equal(echoLoopLevel(log), 2);
});
