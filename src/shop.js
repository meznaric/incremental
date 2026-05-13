import { getUpgrade, rollSlate, rerollSlot, isEligible, slotMatches } from './upgrades.js';
import { checkGamble } from './interstitial.js';

export const DEFAULT_SLOTS = 2;
export const MAX_SLOTS = 10;

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
export const REROLL_PCT_PER_SLOT = 0.01;

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
    },
    gambleCd: {},
    shop: {
      slots: Array(DEFAULT_SLOTS).fill(null),
      slotsUnlocked: DEFAULT_SLOTS,
      rerollUnlocked: false,
      pinUnlocked: false,
      pinnedSlot: null,
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

export function effectiveRate(state, now) {
  let rate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  for (const desc of RATE_BUFFS) rate *= desc.multAt(state.buffs[desc.key] || [], now);
  return rate;
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
  const base = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
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
    total += base * factor * timeIntegral;
  }
  return total;
}

export function rollContext(state, now) {
  return {
    balance: state.amount,
    rate: effectiveRate(state, now),
    owned: state.owned,
  };
}

export function tryBuy(state, slotIdx, now) {
  const slot = state.shop.slots[slotIdx];
  if (!slot) return { ok: false, reason: 'invalid' };
  const u = getUpgrade(slot.id);
  if (!u) return { ok: false, reason: 'invalid' };
  const cost = slot.cost;

  if (u.kind === 'gamble') {
    if (now < (state.gambleCd[slot.id] || 0)) return { ok: false, reason: 'cooldown' };
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    const luck = state.buffs.gambleLuck.reduce((s, b) => s + (now < b.expiresAt ? b.value : 0), 0);
    const won = Math.random() < Math.min(1, u.chance + luck);
    let result;
    if (won) {
      const payout = cost * u.payout;
      state.amount += payout;
      result = { id: slot.id, won: true, delta: payout - cost };
    } else {
      const cushion = Math.min(1, state.buffs.gambleCushion.reduce((s, b) => s + (now < b.expiresAt ? b.value : 0), 0));
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
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    applyBuff(state, u, now);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'permanent') {
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    if (u.permType === 'add') state.flatBonus += u.value;
    if (u.permType === 'mul') state.permMul *= u.value;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'convert') {
    if (cost <= 0 || state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    state.flatBonus += cost * u.ratio;
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }
  return { ok: false, reason: 'unknown' };
}

// After buying, replace the slot. The pinned slot also rerolls on purchase
// (since the bought upgrade is gone); we keep the pin pointing at the same
// index so the new upgrade lands pre-pinned.
function replaceSlot(state, slotIdx, now) {
  state.shop.slots[slotIdx] = rerollSlot(state.shop.slots, slotIdx, rollContext(state, now));
}

export function pruneBuffs(state, now) {
  for (const k of Object.keys(state.buffs)) {
    state.buffs[k] = state.buffs[k].filter((b) => b.expiresAt > now);
  }
}

function applyBuff(state, u, now) {
  pruneBuffs(state, now);
  const b = state.buffs;
  if (u.buffType === 'rateMul') {
    b.rateMul.push({ value: u.mult, duration: u.duration, expiresAt: now + u.duration });
  } else if (u.buffType === 'gambleLuck') {
    b.gambleLuck.push({ value: u.bonus, duration: u.duration, expiresAt: now + u.duration });
  } else if (u.buffType === 'gambleCushion') {
    b.gambleCushion.push({ value: u.refund, duration: u.duration, expiresAt: now + u.duration });
  } else if (u.buffType === 'compound') {
    b.compound.push({ rate: u.rate, duration: u.duration, startedAt: now, expiresAt: now + u.duration });
  }
}

export function validateSlate(state, now) {
  const ctx = rollContext(state, now);
  const target = state.shop.slotsUnlocked;
  while (state.shop.slots.length < target) state.shop.slots.push(null);
  if (state.shop.slots.length > target) state.shop.slots.length = target;
  for (let i = 0; i < state.shop.slots.length; i++) {
    const slot = state.shop.slots[i];
    const u = slot ? getUpgrade(slot.id) : null;
    if (!u || !isEligible(u, ctx) || !slotMatches(u, i)) {
      state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
    }
  }
  if (state.shop.pinnedSlot != null && state.shop.pinnedSlot >= state.shop.slots.length) {
    state.shop.pinnedSlot = null;
  }
}

export function rerollCost(state) {
  const n = countRerollable(state);
  return state.amount * REROLL_PCT_PER_SLOT * n;
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
  const cost = state.amount * REROLL_PCT_PER_SLOT * n;
  if (state.amount < cost || state.amount <= 0) return { ok: false, reason: 'broke' };
  state.amount -= cost;
  const ctx = rollContext(state, now);
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.pinnedSlot === i) continue;
    state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
  }
  return { ok: true, cost, rerolled: n };
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
