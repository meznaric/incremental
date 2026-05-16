import { rollSlate, rerollSlot, isEligible, slotMatches, resolveUpgrade, SLOT_FILTERS } from './upgrades.js';
import { checkGamble, checkPurchase } from './interstitial.js';
import {
  patternBaseRateMul, patternRerollCostMul, patternBuffDurationMul,
  patternBuffRateMulStrength, patternGambleLuckBonus,
  patternFreeLeft, consumePatternFreePurchase,
} from './cyclePatterns.js';

export const DEFAULT_SLOTS = 2;
export const MAX_SLOTS = 10;

// Hard ceiling on the effective Hail win-chance after Carry windows + pattern
// luck stack on top of the base. A 100% guaranteed win drains the danger out
// of the loop — the dark, the static, the *might not work* is what makes
// landing a phrase mean something. Stack as much luck as you like; the last
// few percent stay on the other side.
export const GAMBLE_CHANCE_CAP = 0.85;

// Single source of truth for the win-chance a Hail card actually rolls against.
// Both the renderer (so the % the player reads matches reality) and tryBuy
// (the actual roll) walk through this. Callers pass the current `now` so an
// expiring Carry stops counting the moment it's gone — the displayed % drops
// to the next % the rig would actually roll against.
export function effectiveGambleChance(state, upgrade, now) {
  if (!upgrade || typeof upgrade.chance !== 'number') return 0;
  const luckBuffs = (state && state.buffs && state.buffs.gambleLuck) || [];
  const luck = luckBuffs.reduce((s, b) => s + (now < b.expiresAt ? b.value : 0), 0);
  const pat = patternGambleLuckBonus(state);
  return Math.min(GAMBLE_CHANCE_CAP, upgrade.chance + luck + pat);
}

// Cost to unlock the Nth slot (the slot whose index === N). Slots 0 and 1 are free.
// 10× growth starting at 1k for slot index 2.
export const SLOT_UNLOCK_COSTS = (() => {
  const arr = [0, 0];
  let c = 1000;
  for (let i = 2; i < MAX_SLOTS; i++) { arr.push(c); c *= 10; }
  return arr;
})();

export const REROLL_UNLOCK_COST = 1000;
export const REROLL_UNLOCK_AT = 1000;
export const PIN_UNLOCK_COST = 5000;
export const PIN_UNLOCK_AT = 5000;
export const REROLL_PCT_PER_SLOT = 0.015;
export const REROLL_FLOOR_SECONDS = 15;

// Reroll cost is based on the rate captured at the time the slate was rolled
// (state.shop.offeredRate), not the live rate. This keeps the displayed price
// stable as production grows. Fall back to live rate if no offered rate is set.
export function computeRerollCost(state, now, nonPinnedCount) {
  const pct = REROLL_PCT_PER_SLOT * nonPinnedCount * state.amount;
  const rate = state.shop.offeredRate != null ? state.shop.offeredRate : effectiveRate(state, now);
  const floor = REROLL_FLOOR_SECONDS * rate * nonPinnedCount;
  return Math.max(pct, floor) * patternRerollCostMul(state);
}

export function makeShopState() {
  return {
    flatBonus: 0,
    permMul: 1,
    owned: {},
    buffs: {
      rateMul:       [], // { value, duration, expiresAt }
      gambleLuck:    [], // { value, duration, expiresAt }
      gambleCushion: [], // { value, duration, expiresAt }
      compound:      [], // { rate,  duration, startedAt, expiresAt }
      // Meta-buffs ("Frames"): primes that scale subsequent buff applications
      // while active. metaStrength multiplies new rateMul `value`; metaDuration
      // multiplies every new buff's duration; metaLuck adds to new gambleLuck.
      metaStrength:  [], // { value, duration, expiresAt }
      metaDuration:  [], // { value, duration, expiresAt }
      metaLuck:      [], // { value, duration, expiresAt }
    },
    gambleCd: {},
    shop: {
      slots: Array(DEFAULT_SLOTS).fill(null),
      slotsUnlocked: DEFAULT_SLOTS,
      rerollUnlocked: false,
      pinUnlocked: false,
      pinnedSlot: null,
      offeredRate: 0,
    },
    lastResult: null,
    messages: {
      shown: {},
      queue: [],
      stats: { gambles: 0, gambleLosses: 0, allInLost: false, peakAmount: 0 },
    },
  };
}

// Declarative table of rate-affecting buffs. Each buff key is a list of
// active instances. To add a new buff type:
//   1. Add an empty array under `state.buffs.<key>` in makeShopState().
//   2. Append a descriptor here with `multAt`, `transitions`, and (if time-varying)
//      `isContinuous` + `integral`.
//   3. Apply it in `applyBuff` below.
// `multAt(instances, t)` returns the combined multiplier at t (1 if none active).
// `transitions(instances)` returns timestamps where the multiplier changes.
// `isContinuous(instances, a, c)` returns true if the combined multiplier varies within [a, c].
// `integral(instances, a, c)` returns ∫(a→c) multAt(instances, t) dt, required when isContinuous can return true.
export const RATE_BUFFS = [
  {
    key: 'rateMul',
    transitions: (xs) => xs.map((b) => b.expiresAt),
    multAt: (xs, t) => xs.reduce((p, b) => (t < b.expiresAt ? p * b.value : p), 1),
  },
  {
    key: 'compound',
    transitions: (xs) => xs.flatMap((b) => [b.startedAt, b.expiresAt]),
    multAt: (xs, t) => xs.reduce((p, b) => (
      t >= b.startedAt && t < b.expiresAt ? p * Math.pow(1 + b.rate, t - b.startedAt) : p
    ), 1),
    isContinuous: (xs, a, c) => {
      const mid = (a + c) / 2;
      return xs.some((b) => mid >= b.startedAt && mid < b.expiresAt);
    },
    // ∏_i (1+r)^(t-s_i) = (1+r)^(N*(t-mean(s))). Integrate in relative time so
    // exponents stay bounded by buff duration — using absolute Unix seconds
    // (~1.7e9) overflows pow() to Infinity and the difference collapses to NaN.
    // Assumes all active compound buffs share the same rate (true for the current upgrade pool).
    integral: (xs, a, c) => {
      const mid = (a + c) / 2;
      const active = xs.filter((b) => mid >= b.startedAt && mid < b.expiresAt);
      if (active.length === 0) return c - a;
      const r = active[0].rate;
      const n = active.length;
      const meanS = active.reduce((s, b) => s + b.startedAt, 0) / n;
      const k = n * Math.log(1 + r);
      return (Math.pow(1 + r, n * (c - meanS)) - Math.pow(1 + r, n * (a - meanS))) / k;
    },
  },
];

// Echo Memory multiplier from the Contact Log. Scalar over the whole rate;
// state.memoryMul is derived (not persisted) and defaults to 1 if absent.
function memoryFactor(state) {
  return Number.isFinite(state.memoryMul) && state.memoryMul > 0 ? state.memoryMul : 1;
}

// Ascent exponent from Carrier Engravings. Lifts the entire effective rate to
// rate^(1+ascentExp). Stored as state.ascentExp (derived; defaults to 0).
// WHY: every existing rate term is multiplicative; once cost growth is super-
// exponential, multipliers asymptote. An exponent on the wire opens a new axis.
function ascentExp(state) {
  return Number.isFinite(state.ascentExp) && state.ascentExp > 0 ? state.ascentExp : 0;
}
function applyAscent(rate, exp) {
  if (exp <= 0 || rate <= 1) return rate;
  return Math.pow(rate, 1 + exp);
}

// Log-dampening on the final pre-ascent rate. Below DAMPEN_AT the rate is
// untouched; above, it is compressed so each decade of raw production yields
// only DAMPEN_ALPHA decades of effective production. Without this, additive
// permanents and multiplier stacks both compound past trillion into runaway.
// Tunable: dropping ALPHA tightens the cap; raising AT delays its bite.
export const DAMPEN_AT = 1e12;
export const DAMPEN_ALPHA = 0.85;
export function applyDampening(rate) {
  if (!(rate > DAMPEN_AT)) return rate;
  return DAMPEN_AT * Math.pow(rate / DAMPEN_AT, DAMPEN_ALPHA);
}

export function effectiveRate(state, now) {
  let rate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  rate *= patternBaseRateMul(state);
  for (const desc of RATE_BUFFS) rate *= desc.multAt(state.buffs[desc.key] || [], now);
  rate *= memoryFactor(state);
  rate = applyDampening(rate);
  return applyAscent(rate, ascentExp(state));
}

// Closed-form integral of effective rate from t0 to t1. Splits the window at every
// buff transition (start or expiry), then for each segment multiplies all
// piecewise-constant buff factors at the midpoint with the segment's time integral.
// If a buff has a continuous multiplier (e.g. compound), its analytical integral
// replaces the (c - a) factor. Assumes at most one continuous descriptor is active
// per segment; extending to more would require generalized numerical integration.
export function integrateRate(state, t0, t1) {
  if (t1 <= t0) return 0;
  const transitions = new Set([t0, t1]);
  for (const desc of RATE_BUFFS) {
    const xs = state.buffs[desc.key] || [];
    for (const tr of desc.transitions(xs)) {
      if (tr > t0 && tr < t1) transitions.add(tr);
    }
  }
  const sorted = [...transitions].sort((x, y) => x - y);
  const base = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul
    * patternBaseRateMul(state) * memoryFactor(state);
  const exp = ascentExp(state);
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], c = sorted[i + 1];
    if (c <= a) continue;
    let factor = 1;
    let timeIntegral = c - a;
    let continuousFound = false;
    for (const desc of RATE_BUFFS) {
      const xs = state.buffs[desc.key] || [];
      if (desc.isContinuous && desc.isContinuous(xs, a, c)) {
        if (!continuousFound) {
          timeIntegral = desc.integral(xs, a, c);
          continuousFound = true;
        } else {
          factor *= desc.multAt(xs, (a + c) / 2);
        }
      } else {
        factor *= desc.multAt(xs, (a + c) / 2);
      }
    }
    // Log-dampening + Ascent both apply to the segment's rate. Discrete
    // segments dampen exactly; continuous (compound) segments dampen the
    // segment-average rate, which is the strictest closed-form available
    // without numerical integration. Ascent stacks on top of dampening.
    const linearBase = base * factor;
    if (linearBase > 0) {
      const dt = c - a;
      let segmentTotal;
      if (continuousFound && dt > 0) {
        const avgRate = linearBase * (timeIntegral / dt);
        const dampened = applyDampening(avgRate);
        const lifted = exp > 0 ? applyAscent(dampened, exp) : dampened;
        segmentTotal = lifted * dt;
      } else {
        const dampened = applyDampening(linearBase);
        const lifted = exp > 0 ? applyAscent(dampened, exp) : dampened;
        segmentTotal = lifted * timeIntegral;
      }
      total += segmentTotal;
    }
  }
  return total;
}

export function rollContext(state, now) {
  return {
    balance: state.amount,
    rate: effectiveRate(state, now),
    baseAdditive: (state.basePerSecond || 0) + state.flatBonus,
    permMul: state.permMul || 1,
    owned: state.owned,
  };
}

// Synchronous "what would my rate be if I bought this slot?" — mutates the
// state in-place, reads effectiveRate, then restores. Buffs and ascent flow
// through so the number on the card matches the immediate post-buy reality.
export function marginalRateForPurchase(state, slot, now) {
  if (!slot) return 0;
  const u = resolveUpgrade(slot);
  if (!u) return 0;
  const before = effectiveRate(state, now);
  let after = before;
  if (u.kind === 'permanent' && u.permType === 'add') {
    const orig = state.flatBonus;
    state.flatBonus = orig + u.value;
    after = effectiveRate(state, now);
    state.flatBonus = orig;
  } else if (u.kind === 'permanent' && u.permType === 'mul') {
    const orig = state.permMul;
    state.permMul = orig * u.value;
    after = effectiveRate(state, now);
    state.permMul = orig;
  } else if (u.kind === 'convert') {
    const orig = state.flatBonus;
    state.flatBonus = orig + slot.cost * u.ratio;
    after = effectiveRate(state, now);
    state.flatBonus = orig;
  }
  return Math.max(0, after - before);
}

export function tryBuy(state, slotIdx, now) {
  const slot = state.shop.slots[slotIdx];
  if (!slot) return { ok: false, reason: 'invalid' };
  const u = resolveUpgrade(slot);
  if (!u) return { ok: false, reason: 'invalid' };
  const cost = slot.cost;
  // Pattern: free-purchase charges cover any non-hail, non-bleed purchase.
  // Gambles and gifts are excluded — gambles take a real wager, gifts are
  // already free.
  const isCharged = u.kind !== 'gamble' && u.kind !== 'gift';
  const usePatternFree = isCharged && patternFreeLeft(state) > 0;

  if (u.kind === 'gamble') {
    if (now < (state.gambleCd[slot.id] || 0)) return { ok: false, reason: 'cooldown' };
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    const won = Math.random() < effectiveGambleChance(state, u, now);
    let result;
    if (won) {
      const payout = cost * u.payout;
      state.amount += payout;
      result = { id: slot.id, won: true, delta: payout - cost };
    } else {
      let lose = 1;
      for (const b of state.buffs.gambleCushion) if (now < b.expiresAt) lose *= 1 - Math.max(0, Math.min(1, b.value));
      const cushion = Math.min(0.1, 1 - lose);
      const refund = cost * cushion;
      state.amount += refund;
      result = { id: slot.id, won: false, delta: -(cost - refund) };
    }
    state.gambleCd[slot.id] = now + u.cooldown;
    state.lastResult = { ...result, at: now };
    checkGamble(state, { won: result.won, isAllIn: u.wagerPct >= 1, balanceAfter: state.amount });
    replaceSlot(state, slotIdx, now);
    return { ok: true, result };
  }

  if (u.kind === 'buff') {
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    applyBuff(state, u, now);
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'permanent') {
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    if (u.permType === 'add') state.flatBonus += u.value;
    if (u.permType === 'mul') state.permMul *= u.value;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'convert') {
    // Convert burns the *current cost* into flatBonus. A free-purchase charge
    // covers the spend but the planted yield still scales with the slot's cost.
    if (!usePatternFree && (cost <= 0 || state.amount < cost)) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    state.flatBonus += cost * u.ratio;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'gift') {
    state.amount += u.reward;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }
  return { ok: false, reason: 'unknown' };
}

// After buying, replace the slot. The pinned slot also rerolls on purchase
// (since the bought upgrade is gone); we keep the pin pointing at the same
// index so the new upgrade lands pre-pinned.
function replaceSlot(state, slotIdx, now) {
  const ctx = rollContext(state, now);
  state.shop.slots[slotIdx] = rerollSlot(state.shop.slots, slotIdx, ctx);
  state.shop.offeredRate = ctx.rate;
}

export function pruneBuffs(state, now) {
  for (const k of Object.keys(state.buffs)) {
    state.buffs[k] = state.buffs[k].filter((b) => b.expiresAt > now);
  }
}

// Combined live multiplier from a list of meta-buffs. Each active entry's
// value compounds (so two ×1.5 strength frames give ×2.25); inactives return 1.
function metaMulAt(list, now) {
  if (!list || !list.length) return 1;
  let m = 1;
  for (const x of list) if (now < x.expiresAt) m *= x.value;
  return m;
}
// Additive bonus from a list of meta-buffs (used by metaLuck). Stacks linearly.
function metaSumAt(list, now) {
  if (!list || !list.length) return 0;
  let s = 0;
  for (const x of list) if (now < x.expiresAt) s += x.value;
  return s;
}

function applyBuff(state, u, now) {
  pruneBuffs(state, now);
  const b = state.buffs;
  const dMul = patternBuffDurationMul(state);
  const sMul = patternBuffRateMulStrength(state);
  // Meta-buffs are *primes* — they don't fire themselves; they just sit on the
  // file and scale anything applied while they hold. They have to compose with
  // pattern modifiers, not replace them.
  if (u.buffType === 'metaStrength' || u.buffType === 'metaDuration' || u.buffType === 'metaLuck') {
    const duration = u.duration * dMul;
    b[u.buffType].push({ value: u.value, duration, expiresAt: now + duration });
    return;
  }
  const metaDur = metaMulAt(b.metaDuration, now);
  const metaStr = metaMulAt(b.metaStrength, now);
  const metaLuck = metaSumAt(b.metaLuck, now);
  const duration = u.duration * dMul * metaDur;
  if (u.buffType === 'rateMul') {
    b.rateMul.push({ value: u.mult * sMul * metaStr, duration, expiresAt: now + duration });
  } else if (u.buffType === 'gambleLuck') {
    b.gambleLuck.push({ value: u.bonus + metaLuck, duration, expiresAt: now + duration });
  } else if (u.buffType === 'gambleCushion') {
    b.gambleCushion.push({ value: u.refund, duration, expiresAt: now + duration });
  } else if (u.buffType === 'compound') {
    b.compound.push({ rate: u.rate, duration, startedAt: now, expiresAt: now + duration });
  }
}

export function validateSlate(state, now) {
  const ctx = rollContext(state, now);
  const target = state.shop.slotsUnlocked;
  while (state.shop.slots.length < target) state.shop.slots.push(null);
  if (state.shop.slots.length > target) state.shop.slots.length = target;
  let rerolled = false;
  for (let i = 0; i < state.shop.slots.length; i++) {
    const slot = state.shop.slots[i];
    const u = slot ? resolveUpgrade(slot) : null;
    // Pinned slots (those with a SLOT_FILTERS entry) skip the eligibility gate
    // so a seeded fresh-game upgrade (e.g. mult_starter) isn't wiped on reload.
    const pinned = i < SLOT_FILTERS.length;
    const bad = !u || !slotMatches(u, i) || (!pinned && !isEligible(u, ctx));
    if (bad) {
      state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
      rerolled = true;
    }
  }
  if (state.shop.pinnedSlot != null && state.shop.pinnedSlot >= state.shop.slots.length) {
    state.shop.pinnedSlot = null;
  }
  if (rerolled || state.shop.offeredRate == null) state.shop.offeredRate = ctx.rate;
}

export function rerollCost(state, now) {
  return computeRerollCost(state, now, countRerollable(state));
}

function countRerollable(state) {
  let n = 0;
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.pinnedSlot === i) continue;
    if (state.shop.slots[i]) n++;
  }
  return n;
}

export function tryReroll(state, now) {
  if (!state.shop.rerollUnlocked) return { ok: false, reason: 'locked' };
  const n = countRerollable(state);
  if (n === 0) return { ok: false, reason: 'empty' };
  // Free rerolls bypass the Echo cost. Consumed before charging.
  const usingFree = (state.freeRerolls || 0) > 0;
  let cost = 0;
  if (!usingFree) {
    cost = computeRerollCost(state, now, n);
    if (state.amount < cost || state.amount <= 0) return { ok: false, reason: 'broke' };
    state.amount -= cost;
  } else {
    state.freeRerolls = Math.max(0, (state.freeRerolls || 0) - 1);
  }
  const ctx = rollContext(state, now);
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.pinnedSlot === i) continue;
    state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
  }
  state.shop.offeredRate = ctx.rate;
  return { ok: true, cost, rerolled: n, free: usingFree };
}

// Seconds until the cheapest currently-offered slot becomes affordable at the
// live effective rate. Returns 0 if any slot is already affordable, Infinity
// if rate <= 0 or no slot has a positive cost. Gambles and gifts (whose cost
// scales with balance, or is zero) are skipped — the player isn't "stuck"
// behind them.
export function etaToNextPurchase(state, now) {
  const rate = effectiveRate(state, now);
  let minCost = Infinity;
  for (const slot of state.shop.slots) {
    if (!slot) continue;
    const u = resolveUpgrade(slot);
    if (!u) continue;
    if (u.kind === 'gamble' || u.kind === 'gift' || u.kind === 'convert') continue;
    const cost = slot.cost;
    if (!(cost > 0)) continue;
    if (cost < minCost) minCost = cost;
  }
  if (!isFinite(minCost)) return Infinity;
  const deficit = minCost - state.amount;
  if (deficit <= 0) return 0;
  if (!(rate > 0)) return Infinity;
  return deficit / rate;
}

// How many free rerolls to grant for a given ETA-to-next-purchase. Capped at
// MAX_FREE_REROLL_GRANT so a single check can't dump dozens on the player.
export const FREE_REROLL_TIERS = [
  { atSeconds: 24 * 3600, grant: 3 },
  { atSeconds:  6 * 3600, grant: 2 },
  { atSeconds:      3600, grant: 1 },
];
export const MAX_FREE_REROLLS = 9;

export function freeRerollGrant(etaSeconds) {
  if (Number.isNaN(etaSeconds) || etaSeconds <= 0) return 0;
  // Infinity = no priceable slot, or rate=0 and broke — most-stuck case.
  // Granting the top tier lets a re-tune potentially produce a cheap slot.
  if (!isFinite(etaSeconds)) return FREE_REROLL_TIERS[0].grant;
  for (const t of FREE_REROLL_TIERS) {
    if (etaSeconds >= t.atSeconds) return t.grant;
  }
  return 0;
}

// Bumps state.freeRerolls by the grant for the current ETA. Returns the
// number actually added (0 if no grant or already at cap). Pure-ish: mutates
// state.freeRerolls; no scheduling, no UI.
export function grantFreeRerollsForStall(state, now) {
  if (!state.shop.rerollUnlocked) return 0;
  const eta = etaToNextPurchase(state, now);
  const want = freeRerollGrant(eta);
  if (want <= 0) return 0;
  const current = state.freeRerolls || 0;
  const next = Math.min(MAX_FREE_REROLLS, current + want);
  const added = next - current;
  state.freeRerolls = next;
  return added;
}

export function nextSlotUnlockCost(state) {
  const idx = state.shop.slotsUnlocked;
  if (idx >= MAX_SLOTS) return null;
  return SLOT_UNLOCK_COSTS[idx];
}

export function tryUnlockSlot(state, now) {
  const idx = state.shop.slotsUnlocked;
  if (idx >= MAX_SLOTS) return { ok: false, reason: 'maxed' };
  const cost = SLOT_UNLOCK_COSTS[idx];
  if (state.amount < cost) return { ok: false, reason: 'broke' };
  state.amount -= cost;
  state.shop.slotsUnlocked += 1;
  state.shop.slots.push(null);
  validateSlate(state, now);
  return { ok: true };
}

export function tryUnlockReroll(state) {
  if (state.shop.rerollUnlocked) return { ok: false, reason: 'owned' };
  if (state.amount < REROLL_UNLOCK_COST) return { ok: false, reason: 'broke' };
  state.amount -= REROLL_UNLOCK_COST;
  state.shop.rerollUnlocked = true;
  return { ok: true };
}

export function tryUnlockPin(state) {
  if (state.shop.pinUnlocked) return { ok: false, reason: 'owned' };
  if (state.amount < PIN_UNLOCK_COST) return { ok: false, reason: 'broke' };
  state.amount -= PIN_UNLOCK_COST;
  state.shop.pinUnlocked = true;
  return { ok: true };
}

export function tryTogglePin(state, slotIdx) {
  if (!state.shop.pinUnlocked) return { ok: false, reason: 'locked' };
  if (slotIdx < 0 || slotIdx >= state.shop.slots.length) return { ok: false, reason: 'invalid' };
  state.shop.pinnedSlot = state.shop.pinnedSlot === slotIdx ? null : slotIdx;
  return { ok: true };
}
