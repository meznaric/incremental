import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasUnreadUpdates, markAllSeen, initialiseUpdatesWatermark,
  currentUpdateDate, UPDATES,
} from '../src/updates.js';

test('UPDATES are sorted newest-first', () => {
  for (let i = 1; i < UPDATES.length; i++) {
    assert.ok(
      UPDATES[i - 1].date >= UPDATES[i].date,
      `entry ${i} (${UPDATES[i].date}) is newer than its predecessor (${UPDATES[i - 1].date})`,
    );
  }
});

test('currentUpdateDate returns the topmost entry', () => {
  assert.equal(currentUpdateDate(), UPDATES[0].date);
});

test('fresh save: initialiseUpdatesWatermark stamps the top date so the dot starts off', () => {
  const u = { lastSeenDate: null };
  assert.equal(hasUnreadUpdates(u), false, 'fresh save reads as no-unread by convention');
  const changed = initialiseUpdatesWatermark(u);
  assert.equal(changed, true);
  assert.equal(u.lastSeenDate, UPDATES[0].date);
  assert.equal(hasUnreadUpdates(u), false);
});

test('newer entry pushes hasUnreadUpdates to true', () => {
  const u = { lastSeenDate: '2000-01-01' };
  assert.equal(hasUnreadUpdates(u), true);
});

test('watermark at the top date reads as no-unread', () => {
  const u = { lastSeenDate: UPDATES[0].date };
  assert.equal(hasUnreadUpdates(u), false);
});

test('markAllSeen stamps the watermark forward and is idempotent', () => {
  const u = { lastSeenDate: '2000-01-01' };
  assert.equal(markAllSeen(u), true);
  assert.equal(u.lastSeenDate, UPDATES[0].date);
  assert.equal(markAllSeen(u), false, 'second call is a no-op');
});
