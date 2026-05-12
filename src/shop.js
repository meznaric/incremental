import { getUpgrade, costFor, rollSlate, rerollSlot, sortSlate } from './upgrades.js';

export function makeShopState() {
  return {
    flatBonus: 0,
    permMul: 1,
    owned: {},
    buffs: {
      rateMul:        { value: 1, expiresAt: 0 },
      gambleLuck:     { value: 0, expiresAt: 0 },
      gambleCushion:  { value: 0, expiresAt: 0 },
      compound:       { rate: 0, startedAt: 0, expiresAt: 0 },
    },
    gambleCd: {},
    shop: { slots: rollSlate(4) },
    lastResult: null,
  };
}

export function effectiveRate(state, now) {
  let rate = (state.basePerSecond || 0) + state.flatBonus;
  rate *= state.permMul;
  const b = state.buffs;
  if (now < b.rateMul.expiresAt) rate *= b.rateMul.value;
  if (now < b.compound.expiresAt) rate *= Math.pow(1 + b.compound.rate, now - b.compound.startedAt);
  return rate;
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
    b.rateMul.expiresAt = now + u.duration;
  } else if (u.buffType === 'gambleLuck') {
    b.gambleLuck.value = u.bonus;
    b.gambleLuck.expiresAt = now + u.duration;
  } else if (u.buffType === 'gambleCushion') {
    b.gambleCushion.value = u.refund;
    b.gambleCushion.expiresAt = now + u.duration;
  } else if (u.buffType === 'compound') {
    b.compound.rate = u.rate;
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
