// Cycle Patterns — strategy modifiers chosen at the start of every cycle from
// cycle 2 onward. A Pattern is one cut Kalen makes into the next run before
// the rig boots: it skews the carrier in one direction and starves it in
// another. Each Pattern applies only to the current cycle and is cleared the
// next time the cycle closes.
//
// All effects are looked up via the hook helpers below — no scattered
// conditionals in shop.js / save.js. The Pattern record itself is the only
// place an effect's numbers live.
//
// State shape (lives on the Contact Log so it survives clearSave):
//   contactLog.pattern              : pattern id (string) or null
//   contactLog.pendingPatternChoice : true between closeCycle and the player's
//                                     next pick. Gates the chooser modal.
//   contactLog.patternUsed          : { [patternId]: count } – kept around for
//                                     possible future stats; not consumed yet.
// The mutable per-run "free purchases remaining" counter is mirrored onto the
// gameplay save under state.patternFreeLeft so it persists across reloads in
// the same cycle.

export const PATTERNS = [
  // voice: Sera. "The pour comes early. Catch what you can before the line goes thin."
  { id: 'surge_tide',
    name: 'Surge Tide',
    voice: 'sera',
    desc: 'The carrier pours hot for the first five minutes. After that it runs lean for the rest of the cycle.',
    gameplay: '×2.5 effective rate for 5 minutes. ×0.6 thereafter.',
    // Always-on base multiplier and a one-time rateMul buff seeded at cycle open.
    baseRateMul: 0.6,
    seedRateMulBuff: { value: 4.1667, duration: 300, sourceId: 'surge_tide' },
  },
  // voice: Sera. "Open sky is rare this cycle. When it comes, ride it hard."
  { id: 'cold_sky',
    name: 'Cold Sky',
    voice: 'sera',
    desc: 'Carrier windows arrive shorter than usual, but every one of them lands with twice the bonus.',
    gameplay: 'Purchased rate windows: bonus ×2 (e.g. +5% → +10%), duration ×0.5.',
    buffDurationMul: 0.5,
    buffRateMulStrength: 2.0,
  },
  // voice: Sera. "Three bands are free. After that the band-sweep gets expensive."
  { id: 'patched_frame',
    name: 'Patched Frame',
    voice: 'sera',
    desc: 'Three bands ride free at cycle open. Every re-roll after that bills double.',
    gameplay: 'First three non-hail purchases are free. Re-roll costs are doubled.',
    freePurchases: 3,
    rerollCostMul: 2.0,
  },
  // voice: Sera. "Quiet base. Loud windows. The hails carry further this run."
  { id: 'bare_wire',
    name: 'Bare Wire',
    voice: 'sera',
    desc: 'Base listening runs half-strength, but windows hold twice as long and every hail carries five points further.',
    gameplay: '×0.5 base rate. Window durations doubled. Hail carry-chance +5%.',
    baseRateMul: 0.5,
    buffDurationMul: 2.0,
    gambleLuckBonus: 0.05,
  },
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

export function getPattern(id) {
  return BY_ID.get(id) || null;
}

function getActiveLog(state) {
  return state && state.contactLog;
}

export function getActivePatternId(state) {
  const log = getActiveLog(state);
  return (log && typeof log.pattern === 'string') ? log.pattern : null;
}

export function getActivePattern(state) {
  return getPattern(getActivePatternId(state));
}

// — Hook helpers. Each returns the identity value when no pattern is active. —

export function patternBaseRateMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.baseRateMul) && p.baseRateMul > 0) ? p.baseRateMul : 1;
}

export function patternCostMul(state, _kind) {
  // Reserved for future patterns that scale upgrade costs by kind.
  return 1;
}

export function patternRerollCostMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.rerollCostMul) && p.rerollCostMul > 0) ? p.rerollCostMul : 1;
}

export function patternBuffDurationMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.buffDurationMul) && p.buffDurationMul > 0) ? p.buffDurationMul : 1;
}

export function patternBuffRateMulStrength(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.buffRateMulStrength) && p.buffRateMulStrength > 0) ? p.buffRateMulStrength : 1;
}

export function patternGambleLuckBonus(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.gambleLuckBonus) && p.gambleLuckBonus !== 0) ? p.gambleLuckBonus : 0;
}

// Free non-hail purchases granted by the active pattern. The remaining count
// rides on state.patternFreeLeft (gameplay save) so it persists across reloads
// inside the same cycle.
export function patternFreeLeft(state) {
  const v = state && state.patternFreeLeft;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function consumePatternFreePurchase(state) {
  if (!state) return false;
  if (!(state.patternFreeLeft > 0)) return false;
  state.patternFreeLeft -= 1;
  return true;
}

// Called once on a fresh cycle boot (no save loaded) when a pattern is active.
// Seeds any one-time effects (buffs, free-purchase counter) so the player can
// see the pattern at work the moment the Console comes up.
export function applyPatternOnFreshBoot(state, now) {
  const p = getActivePattern(state);
  if (!p) return;
  if (p.seedRateMulBuff && Number.isFinite(p.seedRateMulBuff.value) && p.seedRateMulBuff.value > 0) {
    const dur = p.seedRateMulBuff.duration;
    state.buffs.rateMul.push({
      value: p.seedRateMulBuff.value,
      duration: dur,
      expiresAt: now + dur,
      sourceId: p.seedRateMulBuff.sourceId || `pattern_${p.id}`,
    });
  }
  if (Number.isFinite(p.freePurchases) && p.freePurchases > 0) {
    state.patternFreeLeft = p.freePurchases;
  }
}

// Log mutations — these write to the persisted Contact Log. Callers must
// saveContactLog afterwards.
export function clearActivePattern(log) {
  if (!log) return;
  log.pattern = null;
}

export function markPendingPatternChoice(log) {
  if (!log) return;
  log.pendingPatternChoice = true;
}

export function setActivePattern(log, id) {
  if (!log) return false;
  if (!BY_ID.has(id)) return false;
  log.pattern = id;
  log.pendingPatternChoice = false;
  log.patternUsed = log.patternUsed || {};
  log.patternUsed[id] = (log.patternUsed[id] || 0) + 1;
  return true;
}

export function hasPendingPatternChoice(log) {
  return !!(log && log.pendingPatternChoice);
}
