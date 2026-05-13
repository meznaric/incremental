import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordContact, sortedWorlds, getRun, advanceRun,
  WORLD_FOR_INTERSTITIAL, backfillFromShown,
  cycleContactCount, canCloseCycle, memoryShards, memoryMul,
  closeCycle, ECHO_MEMORY_PER_SHARD,
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
  assert.equal(closeCycle(log), false);
  assert.equal(getRun(log), 1, 'run does not advance');
});

test('closeCycle: advances the run and keeps the world list intact', () => {
  const log = freshLog();
  recordContact(log, 'milestone_1k', 100);
  recordContact(log, 'milestone_1m', 110);
  const ok = closeCycle(log);
  assert.equal(ok, true);
  assert.equal(getRun(log), 2);
  assert.equal(log.worlds.length, 2, 'worlds survive prestige');
  // Echo Memory carries forward — shards persist.
  assert.equal(memoryShards(log), 2);
});
