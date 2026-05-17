// Achievements — pure logic. Persisted under its own localStorage key so the
// set survives every Cycle close and every gameplay-save wipe. Lives next to
// the Contact Log in the "two persistence keys" pattern (see CLAUDE.md).
//
// Schema:
//   { unlocked: { [id]: <unix seconds when unlocked> },
//     seen:     { [id]: true },
//     stats:    { mythicSeen?, bleedDripsSeen? } }
//
// Why a `stats` sub-object: a few trigger flags (mythicSeen, bleedDripsSeen)
// are observed from in-cycle events that the gameplay save would lose at
// close. They live here so the achievement stays earnable across cycles.

import { ACHIEVEMENTS, ACH_BY_ID } from './achievements-data.js';
import { isEpComplete, allEpsComplete, getRun } from './contactLog.js';

export const ACHIEVEMENTS_KEY = 'eots.achievements.v1';

const fresh = () => ({ unlocked: {}, seen: {}, stats: {} });

export function loadAchievements() {
  let raw;
  try { raw = localStorage.getItem(ACHIEVEMENTS_KEY); } catch (e) { return fresh(); }
  if (!raw) return fresh();
  let s;
  try { s = JSON.parse(raw); } catch (e) { return fresh(); }
  if (!s || typeof s !== 'object') return fresh();
  const unlocked = (s.unlocked && typeof s.unlocked === 'object')
    ? Object.fromEntries(Object.entries(s.unlocked).filter(
        ([k, v]) => typeof k === 'string' && Number.isFinite(v) && ACH_BY_ID.has(k)))
    : {};
  const seen = (s.seen && typeof s.seen === 'object')
    ? Object.fromEntries(Object.entries(s.seen).filter(
        ([k, v]) => typeof k === 'string' && v === true && ACH_BY_ID.has(k)))
    : {};
  const stats = (s.stats && typeof s.stats === 'object')
    ? Object.fromEntries(Object.entries(s.stats).filter(
        ([k, v]) => typeof k === 'string' && (v === true || Number.isFinite(v))))
    : {};
  return { unlocked, seen, stats };
}

export function saveAchievements(ach) {
  try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(ach)); return true; }
  catch (e) { return false; }
}

export function clearAchievements() {
  try { localStorage.removeItem(ACHIEVEMENTS_KEY); } catch (e) { /* noop */ }
}

// Record a transient observation that an achievement trigger reads.
// Idempotent — second call with the same key is a no-op.
export function markStat(ach, key) {
  if (!ach.stats) ach.stats = {};
  if (ach.stats[key]) return false;
  ach.stats[key] = true;
  return true;
}

// Read a flag from either the state.messages.stats counter (e.g.
// permanentsBought >= 1) or the achievements.stats observation.
function readFlag(ctx, flag) {
  const s = ctx.messageStats || {};
  if (Number.isFinite(s[flag]) && s[flag] > 0) return true;
  const a = ctx.ach.stats || {};
  if (a[flag]) return true;
  return false;
}

function readLogFlag(ctx, flag) {
  const log = ctx.log;
  if (!log) return false;
  if (log[flag]) return true;
  // Special-case: patternEverChosen back-derives from the per-cycle pattern
  // record so a player who picked a pattern before this flag existed still
  // earns the achievement. The flag is set sticky elsewhere; this is the
  // read-time fallback.
  if (flag === 'patternEverChosen') {
    if (typeof log.pattern === 'string' && log.pattern.length > 0) return true;
    if (log.patternUsed && Object.keys(log.patternUsed).length > 0) return true;
  }
  return false;
}

function triggerFired(def, ctx) {
  const t = def.trigger;
  if (!t) return false;
  switch (t.kind) {
    case 'cycle':      return getRun(ctx.log) >= t.at;
    case 'amount':     return (ctx.peakAmount || 0) >= t.at;
    case 'episode':    return isEpComplete(ctx.log, t.ep);
    case 'season':     return allEpsComplete(ctx.log);
    case 'flag':       return readFlag(ctx, t.flag);
    case 'logFlag':    return readLogFlag(ctx, t.flag);
    case 'buffCount':  return (ctx.buffCount || 0) >= t.at;
    default:           return false;
  }
}

// Walks every definition, unlocks any whose trigger fires, returns the ids of
// newly-unlocked achievements (in declaration order). Idempotent: a second
// call with the same context returns []. Mutates `ach` in place — the caller
// is responsible for persisting (saveAchievements) after.
//
// ctx shape (all optional, all read-only):
//   { state, log, messageStats, peakAmount, buffCount, now }
export function evaluateAchievements(ach, ctx) {
  const newly = [];
  const c = Object.assign({}, ctx);
  if (!c.log && c.state) c.log = c.state.contactLog;
  if (!c.messageStats && c.state) c.messageStats = c.state.messages && c.state.messages.stats;
  if (!Number.isFinite(c.peakAmount)) {
    const s = c.messageStats || {};
    if (Number.isFinite(s.peakAmount)) c.peakAmount = s.peakAmount;
    else if (c.state && Number.isFinite(c.state.amount)) c.peakAmount = c.state.amount;
    else c.peakAmount = 0;
  }
  c.ach = ach;
  const now = Number.isFinite(c.now) ? c.now : (Date.now() / 1000);
  for (const def of ACHIEVEMENTS) {
    if (ach.unlocked[def.id]) continue;
    if (!triggerFired(def, c)) continue;
    ach.unlocked[def.id] = now;
    newly.push(def.id);
  }
  return newly;
}

export function isUnlocked(ach, id) {
  return !!(ach.unlocked && ach.unlocked[id]);
}

export function isSeen(ach, id) {
  return !!(ach.seen && ach.seen[id]);
}

// Mark every currently-unlocked achievement as seen. Returns true if any
// previously-unseen id was flipped (so the caller can decide whether to save).
export function markAllSeen(ach) {
  let changed = false;
  for (const id of Object.keys(ach.unlocked || {})) {
    if (!ach.seen[id]) {
      ach.seen[id] = true;
      changed = true;
    }
  }
  return changed;
}

// Mark a single id as seen — used after the toast fades or when the player
// opens the modal directly to a specific row.
export function markSeen(ach, id) {
  if (!ach.unlocked[id]) return false;
  if (ach.seen[id]) return false;
  ach.seen[id] = true;
  return true;
}

// True if any unlocked achievement has not yet been seen — drives the
// menu-toggle pulse.
export function hasUnseen(ach) {
  for (const id of Object.keys(ach.unlocked || {})) {
    if (!ach.seen[id]) return true;
  }
  return false;
}

export function unlockedCount(ach) {
  return Object.keys(ach.unlocked || {}).length;
}

export function totalCount() {
  return ACHIEVEMENTS.length;
}
