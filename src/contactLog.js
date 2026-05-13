// The Contact Log — Kalen's accumulating record of contacted worlds.
//
// This file is the *narrative* prestige currency. It survives gameplay save
// resets on purpose: when Kalen "starts over" he loses the Echoes but keeps
// the names. Run N+1 then plays the next episode against a heavier log.
//
// Wire-up:
//   * Persisted under its own key (CONTACT_LOG_KEY), independent of the gameplay save.
//   * Mutated only via recordContact(), which is keyed on world.id so the
//     same world is not appended twice across reloads.
//   * advanceRun() bumps the run counter — call this when a prestige reset
//     happens. Until prestige ships, runs stay at 1 and the log just grows.
//
// Schema:
//   { run: number,
//     worlds: [
//       { id, name, ep, status, contactedAt: <unix seconds>, run: <run that added it> },
//       ...
//     ] }

export const CONTACT_LOG_KEY = 'eots.contactlog.v1';

// World ↔ interstitial mapping. The status comes from docs/lore/episodes.md.
// Keys are interstitial ids; values describe the world recorded when that
// interstitial first fires.
export const WORLD_FOR_INTERSTITIAL = {
  milestone_1k:  { id: 'ahn_tar_3',    name: 'AHN-TAR-3',    ep: 1, status: 'TRIGGERED' },
  milestone_1m:  { id: 'solunn',       name: 'SOLUNN',       ep: 2, status: 'TRIGGERED' },
  milestone_1b:  { id: 'vehrn_9',      name: 'VEHRN-9',      ep: 3, status: 'TRIGGERED' },
  milestone_1t:  { id: 'tarsus_minor', name: 'TARSUS MINOR', ep: 4, status: 'COLLAPSED' },
  milestone_1qa: { id: 'lehl',         name: 'LEHL',         ep: 5, status: 'SHIFTED' },
  // Ep 6 — the world Kalen was contacting when he was caught. He cannot
  // find it. The status reads MISSING, the name reads as a placeholder. The
  // offline-returner beat is what surfaces it.
  offline_returner: { id: 'designation_withheld', name: '[DESIGNATION WITHHELD]', ep: 6, status: 'MISSING' },
};

export const STATUS_COLOR = {
  TRIGGERED: '#ff8a3a',
  COLLAPSED: '#ff5a6e',
  SHIFTED:   '#9d6ee0',
  MISSING:   '#4ea8ff',
};

const fresh = () => ({ run: 1, worlds: [] });

// Returns a plain object always — never null. Defensive against corrupted or
// missing localStorage entries (which can happen if a user wipes site data
// mid-session, or if private-mode quota refuses our write).
export function loadContactLog() {
  let raw;
  try { raw = localStorage.getItem(CONTACT_LOG_KEY); } catch (e) { return fresh(); }
  if (!raw) return fresh();
  let s;
  try { s = JSON.parse(raw); } catch (e) { return fresh(); }
  if (!s || typeof s !== 'object') return fresh();
  const run = Number.isFinite(s.run) && s.run >= 1 ? Math.floor(s.run) : 1;
  const worlds = Array.isArray(s.worlds) ? s.worlds.filter((w) =>
    w && typeof w === 'object' && typeof w.id === 'string' && typeof w.name === 'string'
  ) : [];
  return { run, worlds };
}

export function saveContactLog(log) {
  try { localStorage.setItem(CONTACT_LOG_KEY, JSON.stringify(log)); return true; }
  catch (e) { return false; }
}

// Backfill the Contact Log from a gameplay save's `messages.shown` map.
// Existing players already had milestones fire under the old code; their
// log would otherwise be empty until they crossed a *new* threshold. Run
// this once on load. Returns the number of entries added.
export function backfillFromShown(log, shown, now) {
  if (!shown || typeof shown !== 'object') return 0;
  let added = 0;
  for (const id of Object.keys(WORLD_FOR_INTERSTITIAL)) {
    if (shown[id] && recordContact(log, id, now)) added++;
  }
  return added;
}

// Append a world only if its id is not already present. Mutates and returns
// the log; returns true if a new entry landed, false if it was a no-op.
export function recordContact(log, interstitialId, now) {
  const def = WORLD_FOR_INTERSTITIAL[interstitialId];
  if (!def) return false;
  if (log.worlds.some((w) => w.id === def.id)) return false;
  log.worlds.push({
    id: def.id,
    name: def.name,
    ep: def.ep,
    status: def.status,
    contactedAt: typeof now === 'number' ? now : Date.now() / 1000,
    run: log.run,
  });
  return true;
}

// Sort worlds for display: most recent contact at the top.
export function sortedWorlds(log) {
  return log.worlds.slice().sort((a, b) => (b.contactedAt || 0) - (a.contactedAt || 0));
}

export function getRun(log) {
  return (log && log.run) || 1;
}

// Called by the (future) prestige action to start the next run. The world
// list survives; only the run counter advances. Until prestige ships this
// function exists only for tests and forward-compat.
export function advanceRun(log) {
  log.run = (log.run || 1) + 1;
  return log;
}

// Hard-erase the log. Reserved for an explicit user action (deep reset).
// Normal "Reset save" should NOT clear this — that's the whole point.
export function clearContactLog() {
  try { localStorage.removeItem(CONTACT_LOG_KEY); } catch (e) { /* noop */ }
}
