// Headless game runner. Wraps the real game math (shop, contactLog,
// upgrades, network) and walks a simulated player through N cycles. NEVER
// touches localStorage — every state and contactLog is constructed inline
// so the player's real save is safe.

import {
  makeShopState, effectiveRate, integrateRate, validateSlate,
  pruneBuffs, grantFreeRerollsForStall,
} from '../shop.js';
import { getUpgrade, buildSlot } from '../upgrades.js';
import { ensureNetwork } from '../network.js';
import {
  recordContact, closeCycle, memoryMul, ascentExp, boneMemoryBonus,
  firstLightAmount, quickWakeMul, QUICK_WAKE_DURATION, cycleContactCount,
  ENGRAVINGS, getEngraving, getMass, engravingCost, canBuyEngraving, buyEngraving,
} from '../contactLog.js';
import { currentMilestones } from '../interstitial.js';
import { decide, apply, DEFAULT_POLICY } from './policy.js';
import { buildSchedule, locate, DEFAULT_SCHEDULE_CONFIG } from './schedule.js';

// Fresh contactLog with no localStorage I/O. Matches the schema in
// contactLog.js fresh() — keep these in sync if the schema grows.
function freshLog() {
  return {
    run: 1, worlds: [], mass: 0, engravings: {}, bestPeak: 0,
    cycleEp: 1,
    pattern: null, pendingPatternChoice: false, patternUsed: {}, patternCompleted: {},
    loopMode: false, loopCycles: 0,
    lastNamesSeenCount: 0, lastRigSeenMass: 0,
    // These flags only matter for the live UI's once-per-history beats; the
    // headless sim doesn't fire interstitials.
    firstCloseBeatShown: true, firstEngravingSeen: true, firstContactSeen: true,
    firstRelaySeen: true, firstConvertSeen: true, seasonCompleteShown: true,
    introSeen: true, pickedName: '',
  };
}

// Build a fresh gameplay state (the "in-cycle" half). Mirrors what main.js
// does for a fresh boot, sans DOM and persistence. Engraving effects from
// the log are applied here.
function freshState(log, t) {
  const state = {
    amount: 0,
    // The live UI seeds basePerSecond from the rate input (default 1). Mirror
    // that here so the cycle has a non-zero starter rate to integrate against
    // before the first additive permanent lands.
    basePerSecond: 1,
    freeRerolls: 0,
    patternFreeLeft: 0,
    cycleStartedAt: t,
    ...makeShopState(),
    contactLog: log,
  };
  state.memoryMul = memoryMul(log);
  state.ascentExp = ascentExp(log);
  ensureNetwork(state);

  // Engraving start-of-cycle grants (mirror main.js fresh-boot block).
  state.amount += firstLightAmount(log);
  state.flatBonus += boneMemoryBonus(log);
  if (getEngraving(log, 'patched_hands') > 0) state.shop.rerollUnlocked = true;
  if (getEngraving(log, 'open_frame') > 0 && state.shop.slotsUnlocked < 3) {
    state.shop.slotsUnlocked = 3;
    state.shop.slots.push(null);
  }

  validateSlate(state, t);

  // Seed slot 1 with the cheap starter mul (matches main.js).
  const starter = getUpgrade('mult_starter');
  if (starter) {
    const ctx = { balance: state.amount, rate: state.basePerSecond, owned: state.owned };
    state.shop.slots[1] = buildSlot(starter, ctx);
  }
  // Wake-up rateMul buff: ×3 for 20s.
  state.buffs.rateMul.push({ value: 3, duration: 20, expiresAt: t + 20, sourceId: 'wake' });
  const qw = quickWakeMul(log);
  if (qw > 1) {
    state.buffs.rateMul.push({
      value: qw, duration: QUICK_WAKE_DURATION,
      expiresAt: t + QUICK_WAKE_DURATION, sourceId: 'quick_wake',
    });
  }
  return state;
}

// Greedy engraving spend at cycle close. Buys the cheapest affordable
// engraving until no more fit, prioritising the unlockables (one-shots)
// before levelled upgrades.
const ENGRAVING_PRIORITY = ['first_light', 'patched_hands', 'open_frame', 'quick_wake', 'bone_memory', 'ascent'];
function spendMass(log) {
  let changed = true;
  let bought = 0;
  while (changed) {
    changed = false;
    // Two passes: priority list first, then anything else cheapest-first.
    for (const id of ENGRAVING_PRIORITY) {
      while (canBuyEngraving(log, id)) {
        buyEngraving(log, id); bought++; changed = true;
      }
    }
    let best = null;
    for (const def of ENGRAVINGS) {
      const c = engravingCost(log, def.id);
      if (!Number.isFinite(c) || c > getMass(log)) continue;
      if (!best || c < best.cost) best = { id: def.id, cost: c };
    }
    if (best) { buyEngraving(log, best.id); bought++; changed = true; }
  }
  return bought;
}

// Cross every milestone the cycle's peak has reached (in order). Each crossing
// records a contact on the log, which lifts memoryMul on the next cycle. Also
// updates state.memoryMul live since the change is cumulative within the
// session as well. Returns the count of contacts logged this call.
function recordCrossings(state, t) {
  const ms = currentMilestones(state.contactLog);
  if (!ms.length) return 0;
  const stats = state.messages.stats;
  let n = 0;
  for (const m of ms) {
    if (stats.peakAmount < m.at) break;
    // Only record once per cycle — recordContact is idempotent on world id, so
    // a world already on the log (from a previous cycle continuation) is
    // skipped. That matches the in-game beat-by-beat behaviour.
    if (recordContact(state.contactLog, m.id, t)) n++;
  }
  if (n > 0) {
    state.memoryMul = memoryMul(state.contactLog);
  }
  return n;
}

// Cycle is "complete" once every milestone in the active EP has been crossed.
function isCycleComplete(state) {
  const ms = currentMilestones(state.contactLog);
  if (!ms.length) return false;
  const peak = state.messages.stats.peakAmount;
  return ms.every((m) => peak >= m.at);
}

// Real players close cycles early when they hit a wall — the next milestone
// is hours away even at current rate. The early close banks less mass for
// the same effort but advances the EP, which is usually the higher-ROI play.
// Headless heuristic: at least one contact this cycle (mass eligible) AND
// the next milestone's ETA at current rate exceeds the threshold.
function shouldCloseEarly(state, t, etaThresholdS) {
  if (etaThresholdS <= 0 || etaThresholdS === Infinity) return false;
  if (cycleContactCount(state.contactLog) < 1) return false;
  const ms = currentMilestones(state.contactLog);
  if (!ms.length) return false;
  const peak = state.messages.stats.peakAmount;
  const next = ms.find((m) => peak < m.at);
  if (!next) return false; // already complete
  const rate = effectiveRate(state, t);
  if (!(rate > 0)) return false;
  const eta = (next.at - state.amount) / rate;
  return eta > etaThresholdS;
}

export const DEFAULT_RUNNER_CONFIG = {
  cycles: 10,
  // Hard ceiling on the run — stops a stalled cycle from looping forever.
  maxRunSeconds: 21 * 24 * 3600, // 21 days
  // Decision interval inside active windows. Smaller = more taps/min, more
  // realistic but slower to compute.
  activeTickSeconds: 4,
  // Plot sample interval. Coarser inside long idle windows; this is the floor.
  sampleSeconds: 600, // 10 min
  // Hard idle-window step size — controls how often passive accrual is
  // sampled. Bigger → faster sim, fewer chart points.
  idleStepSeconds: 600,
  closeAfterIdleSeconds: 0, // 0 = close as soon as cycle is complete
  // Early-close: if the next milestone's ETA exceeds this many seconds at
  // current rate, the simulated player closes for partial mass and advances
  // to the next EP. Real players make this tradeoff routinely. Set high to
  // disable; default 6 h matches a typical "I'm stuck, close it" feel.
  earlyCloseEtaSeconds: 6 * 3600,
};

// Public entry point. Returns:
// {
//   samples: [{ t, amount, rate, memoryMul, cycle, active }],
//   cycles:  [{ index, startT, endT, peak, mass, contactsThisCycle, ... }],
//   log:     final contactLog state,
//   schedule: active windows used,
//   total:   { activeSeconds, idleSeconds, decisions, buys, rerolls, ... }
// }
// Seeded Math.random override. shop.js / upgrades.js / network.js / tryBuy
// all call the global Math.random for slate rolls, weighted picks, gamble
// resolution. To get a reproducible sim from a single seed knob we have to
// install a seeded PRNG over Math.random for the duration of the run and
// restore it after — the alternative would be threading rng through every
// pure function, which would touch every shop/upgrades caller.
function withSeededRandom(seed, fn) {
  const original = Math.random;
  let s = (seed | 0) || 1;
  Math.random = function seededRandom() {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); }
  finally { Math.random = original; }
}

export function runSim({ runnerConfig, scheduleConfig, policy, startingLog }) {
  const cfg = { ...DEFAULT_RUNNER_CONFIG, ...(runnerConfig || {}) };
  const schedConfig = { ...DEFAULT_SCHEDULE_CONFIG, ...(scheduleConfig || {}) };
  const pol = { ...DEFAULT_POLICY, ...(policy || {}) };
  return withSeededRandom(schedConfig.seed, () => runSimInner(cfg, schedConfig, pol, startingLog));
}

function runSimInner(cfg, schedConfig, pol, startingLog) {
  const windows = buildSchedule(schedConfig);

  const log = startingLog ? JSON.parse(JSON.stringify(startingLog)) : freshLog();
  let state = freshState(log, 0);

  const samples = [];
  const cycles = [];
  let cycleIdx = 0;
  let cycleStartT = 0;
  let cycleStartContacts = log.worlds.length;
  let cycleStartMass = log.mass;
  const stats = { decisions: 0, buys: 0, rerolls: 0, unlocks: 0, gambles: 0,
                  activeSeconds: 0, idleSeconds: 0, sessions: windows.length };

  let t = 0;
  let lastSampleT = -Infinity;
  let lastFreeRerollCheck = 0;

  function sample(active) {
    if (t - lastSampleT < cfg.sampleSeconds && t !== 0) return;
    const r = effectiveRate(state, t);
    samples.push({
      t, amount: state.amount, rate: r,
      memoryMul: state.memoryMul, mass: log.mass,
      cycle: cycleIdx, active: !!active,
      etaNext: 0, // filled below by chart math if needed
    });
    lastSampleT = t;
  }

  function advanceTo(target, active) {
    if (target <= t) return;
    const dt = target - t;
    // Closed-form accrual via integrateRate. Multiplied by offlineMul during
    // idle stretches — that's exactly how reconcileOffline applies Drift.
    const raw = integrateRate(state, t, target);
    const mul = active ? 1 : (state.offlineMul || 1);
    const delta = raw * mul;
    if (Number.isFinite(delta)) state.amount += delta;
    if (active) stats.activeSeconds += dt; else stats.idleSeconds += dt;
    t = target;
    // peakAmount maintenance — interstitial.js bumps this on checkAmount;
    // we emulate it explicitly so milestones cross correctly.
    if (state.amount > state.messages.stats.peakAmount) {
      state.messages.stats.peakAmount = state.amount;
    }
    recordCrossings(state, t);
    pruneBuffs(state, t);
    sample(active);
  }

  while (cycleIdx < cfg.cycles && t < cfg.maxRunSeconds) {
    const loc = locate(windows, t);
    if (loc.inside) {
      // Active session: tick decisions every activeTickSeconds.
      const winEnd = Math.min(loc.inside.end, cycleStartT + cfg.maxRunSeconds - t + t);
      while (t < winEnd) {
        const nextDecisionT = Math.min(t + cfg.activeTickSeconds, winEnd);
        advanceTo(nextDecisionT, true);
        // Take as many actions as we can on this decision tick — loop until
        // the policy says 'idle' or two unsuccessful actions in a row. This
        // matches a real player firing taps a few times per second.
        let consecutiveNop = 0;
        for (let step = 0; step < 8; step++) {
          stats.decisions++;
          const action = decide(state, pol, t);
          if (action.action === 'idle') break;
          const res = apply(state, action, t);
          if (!res || !res.ok) { consecutiveNop++; if (consecutiveNop >= 2) break; continue; }
          consecutiveNop = 0;
          if (action.action === 'buy') {
            stats.buys++;
            // Detect a gamble via the result shape (tryBuy returns .result for gambles).
            if (res.result) stats.gambles++;
          } else if (action.action === 'reroll') stats.rerolls++;
          else stats.unlocks++;
          // Re-sample post-action so the chart shows the bumps.
          sample(true);
        }
        // Stall-grant — mirror the live game's once-per-N check.
        if (t - lastFreeRerollCheck >= 60) {
          grantFreeRerollsForStall(state, t);
          lastFreeRerollCheck = t;
        }
        if (isCycleComplete(state)) break;
        // Early-close — only evaluated once per decision tick so the cost of
        // re-running effectiveRate stays bounded.
        if (shouldCloseEarly(state, t, cfg.earlyCloseEtaSeconds)) break;
      }
    } else {
      // Idle — jump to whichever comes first: next session start, next chart
      // sample boundary, or maxRunSeconds.
      const nextSampleT = lastSampleT + cfg.sampleSeconds;
      let target = Math.min(
        loc.next ? loc.next.start : cfg.maxRunSeconds,
        Math.max(nextSampleT, t + cfg.idleStepSeconds),
        cfg.maxRunSeconds,
      );
      // Don't skip past a milestone boundary blindly — milestones are
      // checked at each sample so coarse jumps may delay close detection by
      // one chart tick. That's acceptable; the chart resolution is the
      // ground truth for the inspection use case.
      advanceTo(target, false);
    }

    const wantsEarlyClose = !isCycleComplete(state) && shouldCloseEarly(state, t, cfg.earlyCloseEtaSeconds);
    if (isCycleComplete(state) || wantsEarlyClose) {
      // Close — log cycle stats, run closeCycle on the contact log, spend
      // mass on engravings, then rebuild state for the next cycle.
      const peak = state.messages.stats.peakAmount;
      const banked = closeCycle(log, peak) || 0;
      const contactsThisCycle = log.worlds.length - cycleStartContacts;
      cycles.push({
        index: cycleIdx,
        startT: cycleStartT, endT: t, durationS: t - cycleStartT,
        peak, endAmount: state.amount,
        contactsThisCycle, totalContacts: log.worlds.length,
        massBanked: banked, totalMass: log.mass,
        memoryMul: memoryMul(log),
        engravingsBefore: { ...log.engravings },
        earlyClose: wantsEarlyClose,
      });
      const _bought = spendMass(log);
      cycles[cycles.length - 1].engravingsAfter = { ...log.engravings };
      cycles[cycles.length - 1].engravingsBought = _bought;
      cycles[cycles.length - 1].massLeft = log.mass;
      // Pattern picking is forced after close (the live game gates input on
      // it). Headless = pick the no-op default (no pattern) — clear the
      // pending flag so the next cycle starts clean.
      log.pendingPatternChoice = false;
      log.pattern = null;
      cycleIdx++;
      cycleStartT = t;
      cycleStartContacts = log.worlds.length;
      cycleStartMass = log.mass;
      state = freshState(log, t);
      sample(false);
      continue;
    }
  }

  // If we ran out of time mid-cycle, record an "in-progress" pseudo-cycle so
  // the table / diagnostics surface what was happening when the clock stopped.
  // The contact log + state are still authoritative for everything outside.
  if (cycleIdx < cfg.cycles && t > cycleStartT) {
    const peak = state.messages.stats.peakAmount;
    const ms = currentMilestones(log);
    const peakIdx = ms.findIndex((m) => peak < m.at);
    const nextThreshold = peakIdx >= 0 ? ms[peakIdx].at : null;
    cycles.push({
      index: cycleIdx,
      startT: cycleStartT, endT: t, durationS: t - cycleStartT,
      peak, endAmount: state.amount,
      contactsThisCycle: log.worlds.length - cycleStartContacts,
      totalContacts: log.worlds.length,
      massBanked: 0, totalMass: log.mass,
      memoryMul: memoryMul(log),
      engravingsBefore: { ...log.engravings },
      engravingsAfter: { ...log.engravings },
      engravingsBought: 0,
      massLeft: log.mass,
      inProgress: true,
      nextThreshold,
      contactsToFill: ms.length - (log.worlds.length - cycleStartContacts),
    });
  }

  return {
    samples, cycles, log,
    schedule: windows,
    total: stats,
  };
}
