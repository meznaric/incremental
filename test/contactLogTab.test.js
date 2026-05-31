import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogTimeline } from '../src/contactLogTab.js';

// EP1 slot mapping (from worlds-data.js / episodes.js):
//   milestone_1k → ish_karal  (2 Kalen lines)
//   milestone_1t → ahn_tar_3  (Sera,Sera,Sera,Kalen — 4 lines)

test('empty log yields an empty timeline', () => {
  assert.deepEqual(buildLogTimeline({ worlds: [] }), []);
  assert.deepEqual(buildLogTimeline({}), []);
  assert.deepEqual(buildLogTimeline(null), []);
});

test('only logged worlds appear — no invented content for un-met worlds', () => {
  const log = {
    worlds: [
      { id: 'ish_karal', name: 'ISH-KARAL', ep: 1, status: 'SHIFTED', contactedAt: 100, run: 1 },
    ],
  };
  const tl = buildLogTimeline(log);
  assert.equal(tl.length, 1);
  assert.equal(tl[0].id, 'ish_karal');
  assert.equal(tl[0].name, 'ISH-KARAL');
  assert.equal(tl[0].ep, 1);
  assert.equal(tl[0].status, 'SHIFTED');
});

test('transcript lines come from the contact interstitial steps', () => {
  const log = {
    worlds: [
      { id: 'ish_karal', name: 'ISH-KARAL', ep: 1, status: 'SHIFTED', contactedAt: 100, run: 1 },
    ],
  };
  const [entry] = buildLogTimeline(log);
  // ish_karal has two Kalen lines in EP1.
  assert.equal(entry.lines.length, 2);
  for (const ln of entry.lines) {
    assert.equal(ln.voice, 'K');
    assert.equal(ln.speaker, 'Kalen');
    assert.ok(typeof ln.text === 'string' && ln.text.length > 0);
  }
});

test('multi-voice climax transcript carries each speaker', () => {
  const log = {
    worlds: [
      { id: 'ahn_tar_3', name: 'AHN-TAR-3', ep: 1, status: 'TRIGGERED', contactedAt: 200, run: 1 },
    ],
  };
  const [entry] = buildLogTimeline(log);
  // ahn_tar_3 (milestone_1t) is Sera×3 then Kalen.
  assert.equal(entry.lines.length, 4);
  assert.deepEqual(entry.lines.map((l) => l.voice), ['S', 'S', 'S', 'K']);
  assert.equal(entry.lines[3].speaker, 'Kalen');
  assert.equal(entry.lines[0].speaker, 'Sera');
});

test('ordering is chronological: run ascending, then contactedAt ascending', () => {
  const log = {
    worlds: [
      { id: 'ahn_tar_3', name: 'AHN-TAR-3', ep: 1, status: 'TRIGGERED', contactedAt: 300, run: 1 },
      { id: 'ish_karal', name: 'ISH-KARAL', ep: 1, status: 'SHIFTED', contactedAt: 100, run: 1 },
    ],
  };
  const tl = buildLogTimeline(log);
  assert.deepEqual(tl.map((e) => e.id), ['ish_karal', 'ahn_tar_3']);
});

test('earlier run sorts before later run regardless of contactedAt', () => {
  const log = {
    worlds: [
      { id: 'ahn_tar_3', name: 'AHN-TAR-3', ep: 1, status: 'TRIGGERED', contactedAt: 10, run: 2 },
      { id: 'ish_karal', name: 'ISH-KARAL', ep: 1, status: 'SHIFTED', contactedAt: 999, run: 1 },
    ],
  };
  const tl = buildLogTimeline(log);
  assert.deepEqual(tl.map((e) => e.id), ['ish_karal', 'ahn_tar_3']);
});

test('a world with no matching interstitial script yields zero lines, not a crash', () => {
  const log = {
    worlds: [
      { id: 'does_not_exist', name: 'PHANTOM', ep: 1, status: 'MISSING', contactedAt: 1, run: 1 },
    ],
  };
  const [entry] = buildLogTimeline(log);
  assert.equal(entry.name, 'PHANTOM');
  assert.deepEqual(entry.lines, []);
});
