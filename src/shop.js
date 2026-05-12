import { getUpgrade, costFor, rollSlate, rerollSlot, sortSlate } from './upgrades.js';

export function makeShopState() {
  return {
    flatBonus: 0,
    permMul: 1,
    owned: {},
    buffs: {
      rateMul:        { value: 1, duration: 0, expiresAt: 0 },
      gambleLuck:     { value: 0, duration: 0, expiresAt: 0 },
      gambleCushion:  { value: 0, duration: 0, expiresAt: 0 },
      compound:       { rate: 0, duration: 0, startedAt: 0, expiresAt: 0 },
    },
    gambleCd: {},
    shop: { slots: rollSlate(4) },
    lastResult: null,
  };
}

// Declarative table of rate-affecting buffs. To add a new one:
//   1. Add a `state.buffs.<key>` entry in makeShopState() with `expiresAt`.
//   2. Append a descriptor here with `multAt`, `transitions`, and (if time-varying) `isContinuous` + `integral`.
//   3. Apply it in `applyBuff` below.
// `multAt(b, t)` returns the current multiplier (1 if inactive).
// `transitions(b)` returns timestamps where the multiplier changes.
// `isContinuous(b, a, c)` returns true if the multiplier varies within [a, c] (default: false → piecewise-constant).
// `integral(b, a, c)` returns ∫(a→c) multAt(b, t) dt, required when isContinuous can return true.
export const RATE_BUFFS = [
  {
    key: 'rateMul',
    transitions: (b) => [b.expiresAt],
    multAt: (b, t) => (t < b.expiresAt ? b.value : 1),
  },
  {
    key: 'compound',
    transitions: (b) => [b.expiresAt],
    multAt: (b, t) => (t >= b.startedAt && t < b.expiresAt ? Math.pow(1 + b.rate, t - b.startedAt) : 1),
    isContinuous: (b, a, c) => {
      const mid = (a + c) / 2;
      return mid >= b.startedAt && mid < b.expiresAt;
    },
    integral: (b, a, c) => {
      const r = b.rate;
      const k = Math.log(1 + r);
      return (Math.pow(1 + r, c - b.startedAt) - Math.pow(1 + r, a - b.startedAt)) / k;
    },
  },
];

export function effectiveRate(state, now) {
  let rate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  for (const desc of RATE_BUFFS) rate *= desc.multAt(state.buffs[desc.key], now);
  return rate;
}

// Closed-form integral of effective rate from t0 to t1. Splits the window at every
// buff expiry, then for each segment multiplies all piecewise-constant buff factors
// at the midpoint with the segment's time integral. If a buff has a continuous
// multiplier (e.g. compound), its analytical integral replaces the (c - a) factor.
// Assumes at most one continuous buff is active per segment; extending to more
// would require generalized numerical integration.
export function integrateRate(state, t0, t1) {
  if (t1 <= t0) return 0;
  const transitions = new Set([t0, t1]);
  for (const desc of RATE_BUFFS) {
    const bs = state.buffs[desc.key];
    if (!bs) continue;
    for (const tr of desc.transitions(bs)) {
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
      const bs = state.buffs[desc.key];
      if (!bs) continue;
      if (desc.isContinuous && desc.isContinuous(bs, a, c)) {
        if (!continuousFound) {
          timeIntegral = desc.integral(bs, a, c);
          continuousFound = true;
        } else {
          factor *= desc.multAt(bs, (a + c) / 2);
        }
      } else {
        factor *= desc.multAt(bs, (a + c) / 2);
      }
    }
    total += base * factor * timeIntegral;
  }
  return total;
}

export function tryBuy(state, slotIdx, now) {
  const id = state.shop.slots[slotIdx];
  const u = getUpgrade(id);
  if (!u) return { ok: false, reason: 'invalid' };
  const rate = effectiveRate(state, now);
  const cost = costFor(u, { balance: state.amount, rate, owned: state.owned });

  if (u.kind === 'gamble') {
    if (now < (state.gambleCd[id] || 0)) return { ok: false, reason: 'cooldown' };
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    const luck = now < state.buffs.gambleLuck.expiresAt ? state.buffs.gambleLuck.value : 0;
    const won = Math.random() < Math.min(1, u.chance + luck);
    let result;
    if (won) {
      const payout = cost * u.payout;
      state.amount += payout;
      result = { id, won: true, delta: payout - cost };
    } else {
      const refund = now < state.buffs.gambleCushion.expiresAt ? cost * state.buffs.gambleCushion.value : 0;
      state.amount += refund;
      result = { id, won: false, delta: -(cost - refund) };
    }
    state.gambleCd[id] = now + u.cooldown;
    state.lastResult = { ...result, at: now };
    state.shop.slots = rollSlate(4);
    return { ok: true, result };
  }

  if (u.kind === 'buff') {
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    applyBuff(state, u, now);
    state.shop.slots = rollSlate(4);
    return { ok: true };
  }

  if (u.kind === 'permanent') {
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    if (u.permType === 'add') state.flatBonus += u.value;
    if (u.permType === 'mul') state.permMul *= u.value;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    state.shop.slots = rollSlate(4);
    return { ok: true };
  }
  return { ok: false, reason: 'unknown' };
}

function applyBuff(state, u, now) {
  const b = state.buffs;
  if (u.buffType === 'rateMul') {
    b.rateMul.value = u.mult;
    b.rateMul.duration = u.duration;
    b.rateMul.expiresAt = now + u.duration;
  } else if (u.buffType === 'gambleLuck') {
    b.gambleLuck.value = u.bonus;
    b.gambleLuck.duration = u.duration;
    b.gambleLuck.expiresAt = now + u.duration;
  } else if (u.buffType === 'gambleCushion') {
    b.gambleCushion.value = u.refund;
    b.gambleCushion.duration = u.duration;
    b.gambleCushion.expiresAt = now + u.duration;
  } else if (u.buffType === 'compound') {
    b.compound.rate = u.rate;
    b.compound.duration = u.duration;
    b.compound.startedAt = now;
    b.compound.expiresAt = now + u.duration;
  }
}

export const DROP_PCT = 0.01;

export function tryDrop(state, slotIdx) {
  const cost = state.amount * DROP_PCT;
  if (state.amount < cost || state.amount <= 0) return { ok: false };
  state.amount -= cost;
  state.shop.slots[slotIdx] = rerollSlot(state.shop.slots, slotIdx);
  sortSlate(state.shop.slots);
  return { ok: true };
}
