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
//   contactLog.patternCompleted     : { [patternId]: count } – pattern was
//                                     active when the cycle closed. Drives the
//                                     completion badge and the all-patterns
//                                     achievement.
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
  // voice: Sera. "Five bands are free, and five re-tunes ride for nothing. Past that the rig charges double for the privilege."
  { id: 'patched_frame',
    name: 'Patched Frame',
    voice: 'sera',
    desc: 'Five bands ride free at cycle open and the sweep grants five free re-tunes. After that, every purchase and every re-tune bills double.',
    gameplay: 'First 5 non-hail purchases are free. 5 free re-tunes granted. Purchase and re-tune costs ×2 thereafter.',
    freePurchases: 5,
    freeRerolls: 5,
    rerollCostMul: 2.0,
    purchaseCostMul: 2.0,
  },
  // voice: Sera. "Quiet base. Loud windows. The hails carry further this run."
  // Bumped: base less harsh (0.5 → 0.6), buffs come in stronger (+25%), hail
  // luck +8% (was +5%). Still a real tradeoff, but the upside finally bites.
  { id: 'bare_wire',
    name: 'Bare Wire',
    voice: 'sera',
    desc: 'Base listening runs lean, but every window holds twice as long, lands stronger, and every hail carries eight points further.',
    gameplay: '×0.6 base rate. Window durations ×2, strength ×1.25. Hail carry-chance +8%.',
    baseRateMul: 0.6,
    buffDurationMul: 2.0,
    buffRateMulStrength: 1.25,
    gambleLuckBonus: 0.08,
  },
  // voice: Sera. "The mesh sings double this cycle. Live on it; the rig itself barely listens."
  // Network-oriented. Every placed relay contributes double, but the base
  // listening yield is halved — the player has to commit to converts + sector
  // placement to outpace the cycle.
  { id: 'echo_loom',
    name: 'Echo Loom',
    voice: 'sera',
    desc: 'The mesh sings double this cycle. The rig itself barely listens — live on the carrier you place.',
    gameplay: 'Network contribution ×2. Base listening ×0.5.',
    networkYieldMul: 2.0,
    baseRateMul: 0.5,
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

// Pattern multiplier on the cost of any charged purchase (permanent, buff,
// convert, drift, coil). Gambles and gifts are excluded by the caller — gambles
// have their own wager economy; gifts are free. Identity (1) when no pattern
// is active or the pattern doesn't touch purchase cost.
export function patternPurchaseCostMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.purchaseCostMul) && p.purchaseCostMul > 0) ? p.purchaseCostMul : 1;
}

export function patternRerollCostMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.rerollCostMul) && p.rerollCostMul > 0) ? p.rerollCostMul : 1;
}

// Pattern multiplier on Seed-Relay yield. Applied inside networkContribution
// so coverage and adjacency stay correctly composed before the boost lands.
export function patternNetworkYieldMul(state) {
  const p = getActivePattern(state);
  return (p && Number.isFinite(p.networkYieldMul) && p.networkYieldMul > 0) ? p.networkYieldMul : 1;
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
// Seeds any one-time effects (buffs, free-purchase counter, free re-tunes) so
// the player can see the pattern at work the moment the Console comes up.
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
  if (Number.isFinite(p.freeRerolls) && p.freeRerolls > 0) {
    state.freeRerolls = Math.max(state.freeRerolls || 0, p.freeRerolls);
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

// Increment the completion counter for whichever pattern was active on this
// log. Called from closeCycle *before* the pattern is cleared. No-op if no
// pattern was set (legacy logs, or a cycle closed without ever picking).
export function markPatternCompleted(log) {
  if (!log || typeof log.pattern !== 'string' || !BY_ID.has(log.pattern)) return false;
  log.patternCompleted = log.patternCompleted || {};
  log.patternCompleted[log.pattern] = (log.patternCompleted[log.pattern] || 0) + 1;
  return true;
}

export function isPatternCompleted(log, id) {
  if (!log || !log.patternCompleted) return false;
  const n = log.patternCompleted[id];
  return Number.isFinite(n) && n > 0;
}

// True when every defined pattern has at least one completion recorded.
// Drives the all-patterns achievement.
export function allPatternsCompleted(log) {
  if (!log || !log.patternCompleted) return false;
  for (const p of PATTERNS) {
    if (!isPatternCompleted(log, p.id)) return false;
  }
  return true;
}
