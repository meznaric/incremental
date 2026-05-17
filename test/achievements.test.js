import test from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  return store;
}

installLocalStorage();

const {
  ACHIEVEMENTS_KEY,
  loadAchievements, saveAchievements, clearAchievements,
  evaluateAchievements, markStat, markSeen, markAllSeen, hasUnseen,
  isUnlocked, isSeen, unlockedCount, totalCount,
} = await import('../src/achievements.js');

const { ACHIEVEMENTS, ACH_BY_ID } = await import('../src/achievements-data.js');
const { WORLDS_BY_EP } = await import('../src/worlds-data.js');

function beforeEach() { localStorage.clear(); }

function freshLog(overrides = {}) {
  return Object.assign({ run: 1, worlds: [] }, overrides);
}

function logWithEpsCompleted(n) {
  const log = freshLog();
  for (let ep = 1; ep <= n; ep++) {
    for (const k of Object.keys(WORLDS_BY_EP[ep])) {
      const def = WORLDS_BY_EP[ep][k];
      log.worlds.push({ id: def.id, name: def.name, ep: def.ep, status: def.status, contactedAt: 1, run: ep });
    }
  }
  log.run = n + 1;
  return log;
}

test('loadAchievements returns fresh shape with no storage', () => {
  beforeEach();
  const a = loadAchievements();
  assert.deepEqual(a, { unlocked: {}, seen: {}, stats: {} });
});

test('loadAchievements ignores malformed JSON', () => {
  beforeEach();
  localStorage.setItem(ACHIEVEMENTS_KEY, 'not-json{');
  const a = loadAchievements();
  assert.deepEqual(a, { unlocked: {}, seen: {}, stats: {} });
});

test('saveAchievements + loadAchievements round-trip', () => {
  beforeEach();
  const a = {
    unlocked: { cycle_1: 12345 },
    seen:     { cycle_1: true },
    stats:    { mythicSeen: true },
  };
  saveAchievements(a);
  const back = loadAchievements();
  assert.equal(back.unlocked.cycle_1, 12345);
  assert.equal(back.seen.cycle_1, true);
  assert.equal(back.stats.mythicSeen, true);
});

test('loadAchievements filters unknown ids out of unlocked/seen', () => {
  beforeEach();
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify({
    unlocked: { cycle_1: 1, totally_made_up: 2 },
    seen:     { cycle_1: true, totally_made_up: true },
    stats:    { mythicSeen: true, jibber: 'nope' },
  }));
  const a = loadAchievements();
  assert.ok(a.unlocked.cycle_1);
  assert.equal(a.unlocked.totally_made_up, undefined);
  assert.equal(a.seen.totally_made_up, undefined);
  assert.equal(a.stats.mythicSeen, true);
  assert.equal(a.stats.jibber, undefined);
});

test('clearAchievements removes the persisted entry', () => {
  beforeEach();
  saveAchievements({ unlocked: { cycle_1: 1 }, seen: {}, stats: {} });
  clearAchievements();
  assert.deepEqual(loadAchievements(), { unlocked: {}, seen: {}, stats: {} });
});

test('evaluateAchievements: cycle triggers fire at run thresholds', () => {
  beforeEach();
  const ach = loadAchievements();
  // run=1 → no cycle achievement yet (cycle_1 needs run>=2 because the run
  // counter increments on close, so closing cycle 1 makes run=2).
  evaluateAchievements(ach, { log: freshLog({ run: 1 }), buffCount: 0, peakAmount: 0 });
  assert.equal(isUnlocked(ach, 'cycle_1'), false);
  evaluateAchievements(ach, { log: freshLog({ run: 2 }), buffCount: 0, peakAmount: 0 });
  assert.equal(isUnlocked(ach, 'cycle_1'), true);
  // Idempotent — second pass returns no new ids.
  const second = evaluateAchievements(ach, { log: freshLog({ run: 2 }), buffCount: 0, peakAmount: 0 });
  assert.deepEqual(second, []);
});

test('evaluateAchievements: number tiers cross at peakAmount', () => {
  beforeEach();
  const ach = loadAchievements();
  const log = freshLog();
  // 1B unlocks echoes_1b but not 100B.
  let newly = evaluateAchievements(ach, { log, buffCount: 0, peakAmount: 1e9 });
  assert.ok(newly.includes('echoes_1b'));
  assert.equal(isUnlocked(ach, 'echoes_100b'), false);
  // Push to 1T → echoes_100b and echoes_1t unlock; idempotent on echoes_1b.
  newly = evaluateAchievements(ach, { log, buffCount: 0, peakAmount: 1e12 });
  assert.ok(newly.includes('echoes_100b'));
  assert.ok(newly.includes('echoes_1t'));
  assert.equal(newly.includes('echoes_1b'), false);
});

test('evaluateAchievements: episode and season triggers', () => {
  beforeEach();
  const ach = loadAchievements();
  const ep1Done = logWithEpsCompleted(1);
  let newly = evaluateAchievements(ach, { log: ep1Done, buffCount: 0, peakAmount: 0 });
  assert.ok(newly.includes('ep1_complete'));
  assert.equal(isUnlocked(ach, 'ep2_complete'), false);
  assert.equal(isUnlocked(ach, 'season1_complete'), false);
  // Full season → season1_complete + every ep[1..8]_complete fire.
  const ach2 = loadAchievements();
  const allDone = logWithEpsCompleted(10);
  newly = evaluateAchievements(ach2, { log: allDone, buffCount: 0, peakAmount: 0 });
  for (let ep = 1; ep <= 8; ep++) {
    assert.ok(newly.includes(`ep${ep}_complete`), `ep${ep}_complete unlocks on full season`);
  }
  assert.ok(newly.includes('season1_complete'));
});

test('evaluateAchievements: buffCount triggers boost_combo at 3', () => {
  beforeEach();
  const ach = loadAchievements();
  const log = freshLog();
  evaluateAchievements(ach, { log, buffCount: 2, peakAmount: 0 });
  assert.equal(isUnlocked(ach, 'boost_combo'), false);
  evaluateAchievements(ach, { log, buffCount: 3, peakAmount: 0 });
  assert.equal(isUnlocked(ach, 'boost_combo'), true);
});

test('evaluateAchievements: flag triggers read messages.stats counters', () => {
  beforeEach();
  const ach = loadAchievements();
  const state = {
    contactLog: freshLog(),
    messages: { stats: { permanentsBought: 1, convertsBought: 0 } },
  };
  const newly = evaluateAchievements(ach, { state, buffCount: 0 });
  assert.ok(newly.includes('first_permanent'));
  assert.equal(isUnlocked(ach, 'first_seed'), false);
});

test('evaluateAchievements: flag triggers read achievements.stats observations', () => {
  beforeEach();
  const ach = loadAchievements();
  markStat(ach, 'mythicSeen');
  markStat(ach, 'bleedDripsSeen');
  const newly = evaluateAchievements(ach, {
    state: { contactLog: freshLog(), messages: { stats: {} } },
    buffCount: 0,
  });
  assert.ok(newly.includes('mythic_relay'));
  assert.ok(newly.includes('isolated_bleed'));
});

test('evaluateAchievements: logFlag triggers read contactLog fields', () => {
  beforeEach();
  const ach = loadAchievements();
  const state = {
    contactLog: freshLog({ firstEngravingSeen: true, patternEverChosen: true }),
    messages: { stats: {} },
  };
  const newly = evaluateAchievements(ach, { state, buffCount: 0 });
  assert.ok(newly.includes('first_engraving'));
  assert.ok(newly.includes('first_pattern'));
});

test('evaluateAchievements: patternEverChosen back-derives from log.pattern', () => {
  beforeEach();
  const ach = loadAchievements();
  const state = {
    contactLog: freshLog({ pattern: 'surge_tide' }),
    messages: { stats: {} },
  };
  const newly = evaluateAchievements(ach, { state, buffCount: 0 });
  assert.ok(newly.includes('first_pattern'));
});

test('markStat returns false on duplicate', () => {
  beforeEach();
  const ach = loadAchievements();
  assert.equal(markStat(ach, 'mythicSeen'), true);
  assert.equal(markStat(ach, 'mythicSeen'), false);
});

test('seen/markAllSeen/hasUnseen lifecycle', () => {
  beforeEach();
  const ach = loadAchievements();
  evaluateAchievements(ach, { log: freshLog({ run: 2 }), buffCount: 0, peakAmount: 0 });
  assert.equal(hasUnseen(ach), true);
  assert.equal(isSeen(ach, 'cycle_1'), false);
  markSeen(ach, 'cycle_1');
  assert.equal(isSeen(ach, 'cycle_1'), true);
  assert.equal(hasUnseen(ach), false);
  // markAllSeen with no unseen → no change.
  assert.equal(markAllSeen(ach), false);
});

test('markAllSeen flips every unseen unlocked id', () => {
  beforeEach();
  const ach = loadAchievements();
  evaluateAchievements(ach, { log: freshLog({ run: 2 }), buffCount: 0, peakAmount: 1e12 });
  assert.equal(hasUnseen(ach), true);
  assert.equal(markAllSeen(ach), true);
  assert.equal(hasUnseen(ach), false);
});

test('counts: totalCount equals catalogue length; unlockedCount tracks unlocks', () => {
  beforeEach();
  const ach = loadAchievements();
  assert.equal(totalCount(), ACHIEVEMENTS.length);
  assert.equal(unlockedCount(ach), 0);
  evaluateAchievements(ach, { log: freshLog({ run: 2 }), buffCount: 0, peakAmount: 0 });
  assert.equal(unlockedCount(ach), 1);
});

test('catalogue: every definition has the required shape', () => {
  for (const def of ACHIEVEMENTS) {
    assert.equal(typeof def.id, 'string', `${def.id}.id`);
    assert.equal(typeof def.name, 'string', `${def.id}.name`);
    assert.equal(typeof def.desc, 'string', `${def.id}.desc`);
    assert.equal(typeof def.hint, 'string', `${def.id}.hint`);
    assert.equal(typeof def.category, 'string', `${def.id}.category`);
    assert.equal(typeof def.trigger, 'object', `${def.id}.trigger`);
    assert.equal(typeof def.trigger.kind, 'string', `${def.id}.trigger.kind`);
  }
});

test('catalogue: ids are unique', () => {
  const seen = new Set();
  for (const def of ACHIEVEMENTS) {
    assert.equal(seen.has(def.id), false, `duplicate id ${def.id}`);
    seen.add(def.id);
  }
  assert.equal(ACH_BY_ID.size, ACHIEVEMENTS.length);
});
