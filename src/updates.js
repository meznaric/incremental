// Updates — pure logic for the player-facing changelog. Tracks which date the
// player has seen via its own localStorage key, separate from the gameplay
// save and from the Contact Log. Cycle close does not wipe it: a player who
// just closed a cycle should still know what changed since they last played.

import { UPDATES, currentUpdateDate } from './updates-data.js';

export const UPDATES_KEY = 'eots.updates.v1';

// Schema: { lastSeenDate: 'YYYY-MM-DD' | null }. We persist the most-recent
// date the player has acknowledged, not a per-entry seen map — the entries
// are append-only and ordered by date, so a single watermark is enough.

export function loadUpdates() {
  let raw;
  try { raw = localStorage.getItem(UPDATES_KEY); } catch (e) { return fresh(); }
  if (!raw) return fresh();
  let s;
  try { s = JSON.parse(raw); } catch (e) { return fresh(); }
  if (!s || typeof s !== 'object') return fresh();
  const d = typeof s.lastSeenDate === 'string' ? s.lastSeenDate : null;
  return { lastSeenDate: d };
}

export function saveUpdates(u) {
  try { localStorage.setItem(UPDATES_KEY, JSON.stringify(u)); return true; }
  catch (e) { return false; }
}

function fresh() { return { lastSeenDate: null }; }

// Player has unread updates when *any* entry's date is strictly newer than
// the watermark. First-time players (lastSeenDate === null) see the dot iff
// there are any updates published before the moment they sat down.
// Convention: a fresh save records the current top date so first-launch
// players don't see a pulse for history they were never around for; see
// initialiseUpdatesWatermark() below.
export function hasUnreadUpdates(u) {
  if (!UPDATES.length) return false;
  const top = UPDATES[0].date;
  if (!u || !u.lastSeenDate) return false; // see initialiseUpdatesWatermark
  return top > u.lastSeenDate;
}

// Stamp the watermark forward to the most recent entry. Called when the
// player opens the Updates modal.
export function markAllSeen(u) {
  const top = currentUpdateDate();
  if (!top) return false;
  if (u.lastSeenDate === top) return false;
  u.lastSeenDate = top;
  return true;
}

// On a fresh save (lastSeenDate === null) we want the dot to be off — the
// player just opened the game, they shouldn't be told everything is "new".
// Subsequent releases will move the top date past this watermark and the
// dot will light up. Caller is responsible for persisting after.
export function initialiseUpdatesWatermark(u) {
  if (u.lastSeenDate) return false;
  const top = currentUpdateDate();
  if (!top) return false;
  u.lastSeenDate = top;
  return true;
}

export { UPDATES, currentUpdateDate };
