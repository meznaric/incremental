import { integrateRate } from './shop.js';

export const SAVE_KEY = 'incremental.save.v1';

export function nowSeconds() {
  return Date.now() / 1000;
}

export function saveState(state) {
  const snapshot = {
    amount: state.amount,
    basePerSecond: state.basePerSecond,
    flatBonus: state.flatBonus,
    permMul: state.permMul,
    owned: state.owned,
    buffs: state.buffs,
    gambleCd: state.gambleCd,
    shopSlots: state.shop.slots,
    savedAt: nowSeconds(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

// Loads into `state` in place. Returns null if no save, else
// { offline: seconds idle, earnings: amount granted while away }.
export function loadState(state) {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch (e) { return null; }
  if (!s || typeof s !== 'object') return null;

  state.amount = Number(s.amount) || 0;
  state.basePerSecond = Number(s.basePerSecond) || 0;
  state.flatBonus = Number(s.flatBonus) || 0;
  state.permMul = Number(s.permMul) || 1;
  state.owned = s.owned && typeof s.owned === 'object' ? s.owned : {};
  if (s.buffs && typeof s.buffs === 'object') {
    for (const k of Object.keys(state.buffs)) {
      if (s.buffs[k]) Object.assign(state.buffs[k], s.buffs[k]);
    }
  }
  state.gambleCd = s.gambleCd && typeof s.gambleCd === 'object' ? s.gambleCd : {};
  if (Array.isArray(s.shopSlots) && s.shopSlots.length === 4) {
    state.shop.slots = s.shopSlots.slice();
  }

  const now = nowSeconds();
  const savedAt = Number(s.savedAt) || now;
  const offline = Math.max(0, now - savedAt);
  const earnings = offline > 0 ? integrateRate(state, savedAt, now) : 0;
  state.amount += earnings;
  return { offline, earnings };
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}
