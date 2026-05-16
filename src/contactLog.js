// The Contact Log — Kalen's accumulating record of contacted worlds.
//
// This file is the *narrative* cycle-close currency. It survives gameplay save
// wipes on purpose: when Kalen "starts over" he loses the Echoes but keeps
// the names. Run N+1 then plays the next episode against a heavier log.
//
// Wire-up:
//   * Persisted under its own key (CONTACT_LOG_KEY), independent of the
//     gameplay save.
//   * Mutated only via recordContact(), which is keyed on world.id so the
//     same world is not appended twice across reloads.
//   * advanceRun() bumps the run counter — call this when a cycle close
//     happens. The episode in play is derived from log contents, not the run
//     counter — see activeEp() below; closing a cycle early keeps the same
//     EP active next cycle with the remaining names still available.
//
// Schema:
//   { run: number,
//     worlds: [
//       { id, name, ep, status, contactedAt: <unix seconds>, run: <run that added it> },
//       ...
//     ],
//     mass: number,              // Carrier Mass — persistent cycle-close currency.
//     engravings: { [id]: lvl }, // Carrier Engravings owned across cycles.
//     bestPeak: number,          // Highest peakAmount of any past cycle (for stats).
//   }

import { WORLDS_BY_EP, WORLD_DETAIL } from './worlds.js';

export const CONTACT_LOG_KEY = 'eots.contactlog.v2';

// Episode order is the natural EP key order: 1..10. Once every world in an
// EP is on the log, that EP is "done" and the next incomplete one becomes
// active. EP9/EP10 land post-finale: the Cascade itself is the cliffhanger.
const EP_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// True if every world defined for `ep` is already in the log. The check is on
// world id, which is unique across EPs.
export function isEpComplete(log, ep) {
  const block = WORLDS_BY_EP[ep];
  if (!block) return false;
  const ids = new Set((log && log.worlds) ? log.worlds.map((w) => w.id) : []);
  for (const def of Object.values(block)) {
    if (!ids.has(def.id)) return false;
  }
  return true;
}

// Lowest-numbered EP whose ten worlds are not all on the log. Null once every
// EP is complete (Echo Loop territory). This — not the run counter — is what
// drives milestone resolution. A cycle that closes early continues the same
// EP next time, with the remaining names still available.
export function activeEp(log) {
  for (const ep of EP_ORDER) {
    if (!isEpComplete(log, ep)) return ep;
  }
  return null;
}

export function allEpsComplete(log) {
  return activeEp(log) === null;
}

// Resolve the world definition for a given milestone id, scoped to the log's
// active EP. The active EP is the first incomplete EP in the log, so an early
// close re-binds the same EP next cycle until its 10 worlds are all logged.
export function worldFor(log, milestoneId) {
  const ep = activeEp(log);
  if (ep == null) return null;
  return WORLDS_BY_EP[ep]?.[milestoneId] || null;
}

// Per-world lore detail — surfaces only when the player taps a contact in the
// log. Defined per world id in worlds.js so the same lookup serves every EP.
export function worldDetail(id) {
  return WORLD_DETAIL[id] || null;
}

// Compatibility shim — used by callers (mainly contactLogUi.js + tests) that
// want to enumerate every world the game knows about. Iterates every EP and
// flattens into { worldId: worldDef } so the keys are stable across EPs.
// Note: the per-EP milestone id is *not* used as a key here, because the
// same milestone id appears in every EP — use worldFor(log, milestoneId)
// when you need the EP-scoped lookup.
export const ALL_WORLDS = Object.freeze(
  Object.fromEntries(
    Object.values(WORLDS_BY_EP).flatMap((ep) =>
      Object.values(ep).map((w) => [w.id, w])
    )
  )
);

export const STATUS_COLOR = {
  TRIGGERED: '#ff8a3a',
  COLLAPSED: '#ff5a6e',
  SHIFTED:   '#9d6ee0',
  MISSING:   '#4ea8ff',
};

// One-phrase plain-English meaning of each status label. Surfaced inline
// under each contacted world and as the row in the Contact Log status legend.
export const STATUS_MEANING = {
  TRIGGERED: 'Set off a cascade',
  COLLAPSED: 'World ended',
  SHIFTED:   'Trajectory bent',
  MISSING:   'Gone from records',
};

const fresh = () => ({
  run: 1, worlds: [], mass: 0, engravings: {}, bestPeak: 0,
  pattern: null, pendingPatternChoice: false, patternUsed: {},
  loopMode: false, loopCycles: 0,
});

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
  const mass = Number.isFinite(s.mass) && s.mass >= 0 ? s.mass : 0;
  const engravings = s.engravings && typeof s.engravings === 'object'
    ? Object.fromEntries(Object.entries(s.engravings).filter(
        ([k, v]) => typeof k === 'string' && Number.isFinite(v) && v > 0))
    : {};
  const bestPeak = Number.isFinite(s.bestPeak) && s.bestPeak >= 0 ? s.bestPeak : 0;
  const firstCloseBeatShown = !!s.firstCloseBeatShown;
  const firstEngravingSeen = !!s.firstEngravingSeen;
  const firstContactSeen = !!s.firstContactSeen;
  const seasonCompleteShown = !!s.seasonCompleteShown;
  const pattern = typeof s.pattern === 'string' && s.pattern.length > 0 ? s.pattern : null;
  const pendingPatternChoice = !!s.pendingPatternChoice;
  const patternUsed = s.patternUsed && typeof s.patternUsed === 'object'
    ? Object.fromEntries(Object.entries(s.patternUsed).filter(
        ([k, v]) => typeof k === 'string' && Number.isFinite(v) && v > 0))
    : {};
  // Loop-mode bookkeeping. New saves carry both fields directly. Legacy
  // saves (no fields) are migrated: only true loop if every EP in the
  // current EP_ORDER is logged. Old players who "finished" the 8-EP version
  // will now see EP9/EP10 content because those EPs are now part of the run.
  const partial = { run, worlds };
  const legacyAllDone = EP_ORDER.every((ep) => isEpComplete(partial, ep));
  const loopMode = typeof s.loopMode === 'boolean' ? s.loopMode : legacyAllDone;
  const loopCycles = Number.isFinite(s.loopCycles) && s.loopCycles >= 0
    ? Math.floor(s.loopCycles)
    : 0;
  return {
    run, worlds, mass, engravings, bestPeak,
    firstCloseBeatShown, firstEngravingSeen, firstContactSeen, seasonCompleteShown,
    pattern, pendingPatternChoice, patternUsed,
    loopMode, loopCycles,
  };
}

export function saveContactLog(log) {
  try { localStorage.setItem(CONTACT_LOG_KEY, JSON.stringify(log)); return true; }
  catch (e) { return false; }
}

// Legacy milestone-id → world mapping. The pre-EP-rotation code packed all
// ten S1 worlds into a single run keyed by milestone_1k..milestone_30qa.
// Existing saves carry these ids in their `messages.shown` map; backfilling
// reattaches the corresponding worlds to the log so old players' history is
// not silently dropped after the rotation lands.
const LEGACY_BACKFILL_WORLDS = {
  milestone_1k:   { id: 'ahn_tar_3',    name: 'AHN-TAR-3',    ep: 1, status: 'TRIGGERED' },
  milestone_30k:  { id: 'korv_shen',    name: 'KORV-SHEN',    ep: 1, status: 'TRIGGERED' },
  milestone_1m:   { id: 'solunn',       name: 'SOLUNN',       ep: 2, status: 'TRIGGERED' },
  milestone_30m:  { id: 'mora_brae',    name: 'MORA-BRAE',    ep: 2, status: 'SHIFTED'   },
  milestone_1b:   { id: 'vehrn_9',      name: 'VEHRN-9',      ep: 3, status: 'TRIGGERED' },
  milestone_30b:  { id: 'theran',       name: 'THERAN',       ep: 3, status: 'COLLAPSED' },
  milestone_1t:   { id: 'tarsus_minor', name: 'TARSUS MINOR', ep: 4, status: 'COLLAPSED' },
  milestone_30t:  { id: 'pellan_toth',  name: 'PELLAN-TOTH',  ep: 3, status: 'SHIFTED'   },
  milestone_1qa:  { id: 'lehl',         name: 'LEHL',         ep: 5, status: 'SHIFTED'   },
  milestone_30qa: { id: 'iyarra_vell',  name: 'IYARRA-VELL',  ep: 4, status: 'SHIFTED'   },
};

// Backfill the Contact Log from a gameplay save's `messages.shown` map.
// Pre-EP-rotation players already had milestones fire under the old code;
// their log would otherwise lose those names after this PR. Run this once
// on load. Legacy ids are looked up against LEGACY_BACKFILL_WORLDS so the
// shape stays stable across the milestone-id rename. All backfilled entries
// land under cycle 1 because that is the run they were originally tagged to.
// Returns the number of entries added.
export function backfillFromShown(log, shown, now) {
  if (!shown || typeof shown !== 'object') return 0;
  const t = typeof now === 'number' ? now : Date.now() / 1000;
  let added = 0;
  for (const [oldId, def] of Object.entries(LEGACY_BACKFILL_WORLDS)) {
    if (!shown[oldId]) continue;
    if (log.worlds.some((w) => w.id === def.id)) continue;
    log.worlds.push({
      id: def.id, name: def.name, ep: def.ep, status: def.status,
      contactedAt: t, run: 1,
    });
    added++;
  }
  // A backfill means the player already crossed at least one contact in the
  // past; the First Contact beat would have nothing to introduce. Flip the
  // flag so it never surfaces retroactively.
  if (added > 0 && !log.firstContactSeen) log.firstContactSeen = true;
  return added;
}

// Append a world only if its id is not already present. Mutates and returns
// the log; returns true if a new entry landed, false if it was a no-op.
// The milestone id is resolved against the *current* run's EP, so the same
// id (e.g. milestone_1k) records different worlds in different cycles.
export function recordContact(log, milestoneId, now) {
  const def = worldFor(log, milestoneId);
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

// Called by the cycle-close action ("Close the Cycle") to start the next run.
// The world list survives; only the run counter advances.
export function advanceRun(log) {
  log.run = (log.run || 1) + 1;
  return log;
}

// Hard-erase the log. Reserved for the burger-menu "Reset save" action, which
// is a full wipe. The cycle-close action (Close the Cycle) must not call this.
export function clearContactLog() {
  try { localStorage.removeItem(CONTACT_LOG_KEY); } catch (e) { /* noop */ }
}

// — Echo Memory & cycle-close eligibility —
//
// Each contact ever recorded is a "memory shard." Memory shards add a
// flat +ECHO_MEMORY_PER_SHARD multiplier to base Echo accrual, and that
// multiplier carries across cycles. Pushing further in a single cycle
// means more shards earned, which means a stronger carrier next cycle.
export const ECHO_MEMORY_PER_SHARD = 0.10;

export function cycleContactCount(log) {
  if (!log || !Array.isArray(log.worlds)) return 0;
  const run = getRun(log);
  let n = 0;
  for (const w of log.worlds) if ((w.run || 1) === run) n++;
  return n;
}

// — Echo Loop mode (post-season) —
//
// Once every EP's worlds are all on the log, the game shifts into Echo Loop
// mode: a holding pattern where Kalen listens back. No new contacts can be
// logged (EP catalogue is exhausted), but each loop close still banks Carrier
// Mass and adds a "Loop Resonance" multiplier to Echo Memory.
//
// Loop level = number of cycles closed in loop mode. The cycle that *enters*
// loop mode (the close that completes the last EP) does not count — the
// counter starts at 0, then bumps on each subsequent close.
export function echoLoopLevel(log) {
  return (log && Number.isFinite(log.loopCycles)) ? log.loopCycles : 0;
}

export function isLoopMode(log) {
  if (!log) return false;
  if (log.loopMode) return true;
  return allEpsComplete(log);
}

// At least one contact in the current cycle is required to close it —
// except in Loop mode, where there are no contacts to fire and the close
// is the whole mechanic. Thematically: Kalen needs someone on the line
// before he can let a Season 1 cycle go; in Loop mode the line is silent
// and the close is the prayer.
export function canCloseCycle(log) {
  if (isLoopMode(log)) return true;
  return cycleContactCount(log) > 0;
}

export function memoryShards(log) {
  return log && Array.isArray(log.worlds) ? log.worlds.length : 0;
}

// Echo Memory multiplier. Each shard adds ECHO_MEMORY_PER_SHARD; each
// completed Echo Loop adds the same again as a virtual shard, so Loop
// Resonance reads on the same dial without a parallel pipeline.
export function memoryMul(log) {
  return 1 + ECHO_MEMORY_PER_SHARD * (memoryShards(log) + echoLoopLevel(log));
}

// Performs the cycle-close bookkeeping on the log itself. Callers are still
// responsible for wiping the gameplay save and reloading the page.
// Returns false if the cycle is not eligible to close.
// `peakAmount` is the highest Echo count this cycle hit; it determines how
// much Carrier Mass the close banks.
export function closeCycle(log, peakAmount) {
  if (!canCloseCycle(log)) return false;
  const banked = massForPeak(peakAmount);
  log.mass = (log.mass || 0) + banked;
  if ((peakAmount || 0) > (log.bestPeak || 0)) log.bestPeak = peakAmount || 0;
  // Loop bookkeeping. If we were already in loop mode at the *start* of this
  // close, this close was a loop cycle → bump the counter. Then re-check
  // completion: the close that just completed the final EP flips loopMode on
  // for next time without bumping loopCycles for the transition itself.
  if (log.loopMode) log.loopCycles = (log.loopCycles || 0) + 1;
  if (allEpsComplete(log)) log.loopMode = true;
  advanceRun(log);
  // Patterns are per-cycle. Clear the previous pick and flag the next run as
  // owing the player a fresh choice. The chooser modal in main.js gates play
  // until they pick one.
  log.pattern = null;
  log.pendingPatternChoice = true;
  return banked;
}

// — Carrier Mass & Carrier Engravings —
//
// Carrier Mass is the *second* persistent cycle-close currency. Where Echo Memory
// is broad (every name ever logged adds a flat multiplier), Mass is bankable
// and spendable — it buys Engravings, upgrades that survive every cycle close
// because they're literally cut into Kalen's listening rig.
//
// WHY a separate currency: shards count names; Mass counts magnitude. Pushing
// further in a single cycle is what mints Mass.
//
// Formula: floor(log10(peakAmount)) − 2. A cycle that peaks at 1k bites zero;
// 100k bites 3 kg; 1B bites 7 kg; 1T bites 10 kg. Tuned so the first cycle close
// (which under the new wall lands around 100k–1M) gives 3–4 kg — enough for
// First Light, Bone Memory level 1, and a head start on Quick Wake.
export function massForPeak(peakAmount) {
  if (!Number.isFinite(peakAmount) || peakAmount < 1000) return 0;
  return Math.max(0, Math.floor(Math.log10(peakAmount)) - 2);
}

export function getMass(log) {
  return (log && Number.isFinite(log.mass)) ? log.mass : 0;
}

export function getEngraving(log, id) {
  return (log && log.engravings && Number.isFinite(log.engravings[id])) ? log.engravings[id] : 0;
}

// Carrier Engravings — the persistent tier of upgrades bought with Mass.
// Each entry: { id, name, desc, cost(level) → kg, max, voice/lore notes }.
// All in-world names canonicalised in docs/lore/naming-conventions.md.
export const ENGRAVINGS = [
  // One-time. Mass starts modest so the first cycle close can afford one.
  { id: 'first_light',  name: 'First Light',
    desc: 'A pilot tone burned into the rig. Each cycle starts with 1k Echoes already on the carrier.',
    cost: () => 1, max: 1 },
  // Leveled. Persistent flat additive to base listening yield.
  // Cost doubles per level. Effect: +0.5 Echoes/s per level, permanent.
  { id: 'bone_memory',  name: 'Bone Memory',
    desc: 'Solder-traces that remember the last cycle. +0.5 base Echoes/s per level. Persists.',
    cost: (lvl) => Math.pow(2, lvl + 1), max: 12 },
  // Leveled. Boots a 60s rate window at cycle open.
  { id: 'quick_wake',   name: 'Quick Wake',
    desc: 'The carrier wakes faster each cycle. First 60s of every cycle: ×(1 + level) effective rate.',
    cost: (lvl) => 3 * Math.pow(2, lvl), max: 8 },
  // One-time. Reroll comes pre-unlocked next cycle.
  { id: 'patched_hands', name: 'Patched Hands',
    desc: 'Worn tuning gloves; the band-sweep already knows the way. Re-tune is unlocked from cycle open.',
    cost: () => 8, max: 1 },
  // One-time. Third band patched in from the start.
  { id: 'open_frame',    name: 'Open Frame',
    desc: 'A third band, permanently patched into the rig.',
    cost: () => 15, max: 1 },
  // Leveled. The *new mathematical variable*. Each level adds +0.02 to the
  // exponent on effective rate: rate becomes max(rate, 1) ^ (1 + 0.02 * level).
  // WHY exponent and not mult: multipliers crowd at the top under the super-
  // exponential cost wall. An exponent on the rate breaks that ceiling open
  // — every additional decade of base rate becomes a decade-plus on the wire.
  { id: 'ascent',        name: 'Ascent',
    desc: 'A new dimension of carrier. Effective rate is raised by +0.02 per level (rate^1.02… and beyond).',
    cost: (lvl) => 25 * Math.pow(2, lvl), max: 10 },
];

const ENG_BY_ID = new Map(ENGRAVINGS.map((e) => [e.id, e]));

export function engravingCost(log, id) {
  const def = ENG_BY_ID.get(id);
  if (!def) return Infinity;
  const lvl = getEngraving(log, id);
  if (lvl >= (def.max || Infinity)) return Infinity;
  return def.cost(lvl);
}

export function canBuyEngraving(log, id) {
  const c = engravingCost(log, id);
  return Number.isFinite(c) && getMass(log) >= c;
}

export function buyEngraving(log, id) {
  if (!canBuyEngraving(log, id)) return false;
  const c = engravingCost(log, id);
  log.mass = getMass(log) - c;
  log.engravings = log.engravings || {};
  log.engravings[id] = getEngraving(log, id) + 1;
  return true;
}

// Ascent exponent applied to effective rate. The exponent on the rate itself
// only makes physical sense once rate ≥ 1; the consumer guards that.
export const ASCENT_PER_LEVEL = 0.02;
export function ascentExp(log) {
  return ASCENT_PER_LEVEL * getEngraving(log, 'ascent');
}

// Bone Memory: each level adds 0.5 to base listening yield, permanent across
// cycles. Applied at load time so it shows up in the existing rate pipeline.
export const BONE_MEMORY_PER_LEVEL = 0.5;
export function boneMemoryBonus(log) {
  return BONE_MEMORY_PER_LEVEL * getEngraving(log, 'bone_memory');
}

// Quick Wake: a 60-second rate-mul buff seeded at cycle open. Multiplier is
// (1 + level), e.g. lvl 3 → ×4 for 60s.
export const QUICK_WAKE_DURATION = 60;
export function quickWakeMul(log) {
  const lvl = getEngraving(log, 'quick_wake');
  return lvl > 0 ? 1 + lvl : 0;
}

// First Light: starting Echoes per cycle.
export const FIRST_LIGHT_AMOUNT = 1000;
export function firstLightAmount(log) {
  return getEngraving(log, 'first_light') > 0 ? FIRST_LIGHT_AMOUNT : 0;
}
