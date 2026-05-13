import { integrateRate, pruneBuffs, validateSlate, MAX_SLOTS, DEFAULT_SLOTS } from './shop.js';

export const SAVE_KEY = 'incremental.save.v5';

export function nowSeconds() {
  return Date.now() / 1000;
}

export function saveState(state) {
  pruneBuffs(state, nowSeconds());
  const snapshot = {
    amount: state.amount,
    basePerSecond: state.basePerSecond,
    flatBonus: state.flatBonus,
    permMul: state.permMul,
    owned: state.owned,
    buffs: state.buffs,
    gambleCd: state.gambleCd,
    shop: {
      slots: state.shop.slots,
      slotsUnlocked: state.shop.slotsUnlocked,
      rerollUnlocked: state.shop.rerollUnlocked,
      pinUnlocked: state.shop.pinUnlocked,
      pinnedSlot: state.shop.pinnedSlot,
    },
    messages: state.messages,
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
      if (Array.isArray(s.buffs[k])) state.buffs[k] = s.buffs[k];
    }
  }
  state.gambleCd = s.gambleCd && typeof s.gambleCd === 'object' ? s.gambleCd : {};
  if (s.shop && typeof s.shop === 'object') {
    const unlocked = Number(s.shop.slotsUnlocked);
    state.shop.slotsUnlocked = Number.isFinite(unlocked)
      ? Math.max(DEFAULT_SLOTS, Math.min(MAX_SLOTS, unlocked))
      : DEFAULT_SLOTS;
    state.shop.rerollUnlocked = !!s.shop.rerollUnlocked;
    state.shop.pinUnlocked = !!s.shop.pinUnlocked;
    const pinRaw = s.shop.pinnedSlot;
    state.shop.pinnedSlot = Number.isInteger(pinRaw) && pinRaw >= 0 && pinRaw < state.shop.slotsUnlocked
      ? pinRaw
      : null;
    if (Array.isArray(s.shop.slots)) {
      state.shop.slots = s.shop.slots.slice(0, state.shop.slotsUnlocked).map((slot) => {
        if (!slot || typeof slot !== 'object') return null;
        const id = typeof slot.id === 'string' ? slot.id : null;
        const cost = Number(slot.cost);
        if (!id || !Number.isFinite(cost)) return null;
        return { id, cost };
      });
      while (state.shop.slots.length < state.shop.slotsUnlocked) state.shop.slots.push(null);
    }
  }
  if (s.messages && typeof s.messages === 'object') {
    state.messages.shown = s.messages.shown && typeof s.messages.shown === 'object' ? s.messages.shown : {};
    state.messages.queue = Array.isArray(s.messages.queue) ? s.messages.queue.slice() : [];
    if (s.messages.stats && typeof s.messages.stats === 'object') {
      Object.assign(state.messages.stats, s.messages.stats);
    }
  }

  const now = nowSeconds();
  const savedAt = Number(s.savedAt) || now;
  const offline = Math.max(0, now - savedAt);
  const earnings = offline > 0 ? integrateRate(state, savedAt, now) : 0;
  state.amount += earnings;
  validateSlate(state, now);
  return { offline, earnings };
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}
