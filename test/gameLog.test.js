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
  GAME_LOG_KEY, MAX_ENTRIES,
  loadGameLog, saveGameLog, appendEntry, recordCycleClose,
  clearGameLog, formatDuration, formatDate,
} = await import('../src/gameLog.js');

function beforeEach() { localStorage.clear(); }

test('loadGameLog returns empty array with no storage', () => {
  beforeEach();
  assert.deepEqual(loadGameLog(), []);
});

test('loadGameLog returns empty array on malformed JSON', () => {
  beforeEach();
  localStorage.setItem(GAME_LOG_KEY, 'not-json{');
  assert.deepEqual(loadGameLog(), []);
});

test('loadGameLog returns empty array when stored value is not an array', () => {
  beforeEach();
  localStorage.setItem(GAME_LOG_KEY, JSON.stringify({ not: 'an array' }));
  assert.deepEqual(loadGameLog(), []);
});

test('loadGameLog filters out malformed entries', () => {
  beforeEach();
  const mixed = [
    { endedAt: 1000, cycle: 1 },
    null,
    'string',
    { cycle: 2 }, // no endedAt
    { endedAt: 2000, cycle: 2 },
  ];
  localStorage.setItem(GAME_LOG_KEY, JSON.stringify(mixed));
  const out = loadGameLog();
  assert.equal(out.length, 2);
  assert.equal(out[0].endedAt, 1000);
  assert.equal(out[1].endedAt, 2000);
});

test('saveGameLog + loadGameLog round-trip', () => {
  beforeEach();
  const entries = [
    { endedAt: 1000, cycle: 1, runDurationS: 60, endAmount: 5000,
      peakAmount: 6000, contacts: 3, massBanked: 2, memoryShards: 3 },
  ];
  saveGameLog(entries);
  assert.deepEqual(loadGameLog(), entries);
});

test('appendEntry pushes a new sanitised entry', () => {
  const next = appendEntry([], {
    endedAt: 1000, cycle: 5, runDurationS: 3600, endAmount: 1e9,
    peakAmount: 2e9, contacts: 7, massBanked: 5, memoryShards: 12,
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].endedAt, 1000);
  assert.equal(next[0].cycle, 5);
  assert.equal(next[0].endAmount, 1e9);
  assert.equal(next[0].peakAmount, 2e9);
  assert.equal(next[0].contacts, 7);
});

test('appendEntry coerces garbage inputs to safe defaults', () => {
  const next = appendEntry([], {
    endedAt: 'bad', cycle: -3, runDurationS: NaN,
    endAmount: undefined, peakAmount: -100, contacts: 'x',
    massBanked: 'y', memoryShards: null,
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].endedAt, 0);
  assert.equal(next[0].cycle, 1);
  assert.equal(next[0].runDurationS, 0);
  assert.equal(next[0].endAmount, 0);
  assert.equal(next[0].peakAmount, 0);
  assert.equal(next[0].contacts, 0);
  assert.equal(next[0].massBanked, 0);
  assert.equal(next[0].memoryShards, 0);
});

test('appendEntry caps at MAX_ENTRIES, drops oldest', () => {
  let entries = [];
  for (let i = 0; i < MAX_ENTRIES + 5; i++) {
    entries = appendEntry(entries, { endedAt: i + 1, cycle: i + 1 });
  }
  assert.equal(entries.length, MAX_ENTRIES);
  // Oldest 5 should be gone — first entry should now be cycle 6.
  assert.equal(entries[0].cycle, 6);
  // Newest should be the last appended.
  assert.equal(entries[entries.length - 1].cycle, MAX_ENTRIES + 5);
});

test('recordCycleClose persists to storage', () => {
  beforeEach();
  recordCycleClose({ endedAt: 1000, cycle: 1, runDurationS: 60 });
  recordCycleClose({ endedAt: 2000, cycle: 2, runDurationS: 120 });
  const out = loadGameLog();
  assert.equal(out.length, 2);
  assert.equal(out[1].cycle, 2);
});

test('clearGameLog removes storage', () => {
  beforeEach();
  recordCycleClose({ endedAt: 1, cycle: 1 });
  assert.equal(loadGameLog().length, 1);
  clearGameLog();
  assert.deepEqual(loadGameLog(), []);
});

test('formatDuration covers second/minute/hour/day breakpoints', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(60), '1m');
  assert.equal(formatDuration(150), '2m 30s');
  assert.equal(formatDuration(3600), '1h');
  assert.equal(formatDuration(3720), '1h 2m');
  assert.equal(formatDuration(86400), '1d');
  assert.equal(formatDuration(90000), '1d 1h');
});

test('formatDuration handles garbage', () => {
  assert.equal(formatDuration(NaN), '0s');
  assert.equal(formatDuration(undefined), '0s');
  assert.equal(formatDuration(-100), '0s');
});

test('formatDate returns YYYY-MM-DD HH:MM string', () => {
  const out = formatDate(1700000000); // 2023-11-14 22:13:20 UTC
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('formatDate handles bad input', () => {
  assert.equal(formatDate(0), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
});
