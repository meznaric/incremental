import { integrateRate, pruneBuffs, validateSlate, MAX_SLOTS, DEFAULT_SLOTS } from './shop.js';
import { ensureNetwork, reconcileOffline, reconcileOfflineBleeds, getHexAt } from './network.js';

export const SAVE_KEY = 'incremental.save.v14';

export function nowSeconds() {
  return Date.now() / 1000;
}

let suppressed = false;

export function saveState(state) {
  if (suppressed) return false;
  pruneBuffs(state, nowSeconds());
  const snapshot = {
    amount: state.amount,
    basePerSecond: state.basePerSecond,
    flatBonus: state.flatBonus,
    permMul: state.permMul,
    offlineMul: state.offlineMul || 1,
    freeRerolls: state.freeRerolls || 0,
    patternFreeLeft: state.patternFreeLeft || 0,
    owned: state.owned,
    buffs: state.buffs,
    gambleCd: state.gambleCd,
    shop: {
      slots: state.shop.slots,
      slotsUnlocked: state.shop.slotsUnlocked,
      rerollUnlocked: state.shop.rerollUnlocked,
      pinSlots: state.shop.pinSlots || 0,
      pinnedSlots: Array.isArray(state.shop.pinnedSlots) ? state.shop.pinnedSlots.slice() : [],
      offeredRate: state.shop.offeredRate,
    },
    network: state.network ? {
      relays: state.network.relays,
      queued: state.network.queued,
      lostCount: state.network.lostCount || 0,
    } : null,
    messages: state.messages,
    cycleStartedAt: state.cycleStartedAt,
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
  const om = Number(s.offlineMul);
  state.offlineMul = Number.isFinite(om) && om > 0 ? om : 1;
  const fr = Number(s.freeRerolls);
  state.freeRerolls = Number.isFinite(fr) && fr > 0 ? Math.floor(fr) : 0;
  const pfl = Number(s.patternFreeLeft);
  state.patternFreeLeft = Number.isFinite(pfl) && pfl > 0 ? Math.floor(pfl) : 0;
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
    const offered = Number(s.shop.offeredRate);
    state.shop.offeredRate = Number.isFinite(offered) ? offered : 0;
    // Pin migration — two legacy shapes feed the new (pinSlots, pinnedSlots)
    // pair:
    //   1. { pinUnlocked: bool, pinnedSlot: number|null }   — pre-tiered pin
    //   2. { pinSlots: number,  pinnedSlots: number[] }     — current shape
    // Old `pinUnlocked: true` becomes pinSlots = 1; old `pinnedSlot: n`
    // becomes pinnedSlots = [n] (if n still fits the slate). New schema is
    // taken verbatim, capped at MAX_PIN_SLOTS for safety.
    const rawSlots = Number(s.shop.pinSlots);
    if (Number.isInteger(rawSlots) && rawSlots > 0) {
      state.shop.pinSlots = Math.min(rawSlots, 5);
    } else {
      state.shop.pinSlots = s.shop.pinUnlocked ? 1 : 0;
    }
    if (Array.isArray(s.shop.pinnedSlots)) {
      state.shop.pinnedSlots = s.shop.pinnedSlots
        .filter((i) => Number.isInteger(i) && i >= 0 && i < state.shop.slotsUnlocked)
        .slice(0, state.shop.pinSlots);
    } else if (Number.isInteger(s.shop.pinnedSlot)
        && s.shop.pinnedSlot >= 0
        && s.shop.pinnedSlot < state.shop.slotsUnlocked) {
      state.shop.pinnedSlots = [s.shop.pinnedSlot];
    } else {
      state.shop.pinnedSlots = [];
    }
    if (Array.isArray(s.shop.slots)) {
      state.shop.slots = s.shop.slots.slice(0, state.shop.slotsUnlocked).map((slot) => {
        if (!slot || typeof slot !== 'object') return null;
        const id = typeof slot.id === 'string' ? slot.id : null;
        const cost = Number(slot.cost);
        if (!id || !Number.isFinite(cost)) return null;
        const out = { id, cost };
        if (slot.dyn && typeof slot.dyn === 'object') out.dyn = slot.dyn;
        return out;
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

  // Network state: relays + queued tokens. Hex layout is derived; only the
  // placement record needs to persist. Sanitize because the snapshot may have
  // come from a different (older or future) schema.
  const net = ensureNetwork(state);
  if (s.network && typeof s.network === 'object') {
    const now0 = nowSeconds();
    const relays = Array.isArray(s.network.relays) ? s.network.relays : [];
    net.relays = relays.map((r) => {
      if (!r || typeof r !== 'object') return null;
      const q = Number(r.hex && r.hex.q);
      const rr = Number(r.hex && r.hex.r);
      if (!Number.isFinite(q) || !Number.isFinite(rr)) return null;
      if (!getHexAt(q, rr)) return null;
      const plantedAt = Number(r.plantedAt);
      const ripensAt = Number(r.ripensAt);
      return {
        id: String(r.id || `r_${Math.floor(now0 * 1000)}_${Math.random()}`),
        tier: typeof r.tier === 'string' ? r.tier : 'common',
        baseYield: Math.max(0, Number(r.baseYield) || 0),
        hex: { q, r: rr },
        sector: typeof r.sector === 'string' ? r.sector : 'frontier',
        plantedAt: Number.isFinite(plantedAt) ? plantedAt : now0,
        ripensAt: Number.isFinite(ripensAt) ? ripensAt : now0,
      };
    }).filter(Boolean);
    const queued = Array.isArray(s.network.queued) ? s.network.queued : [];
    net.queued = queued.map((t) => ({
      tier: typeof t.tier === 'string' ? t.tier : 'common',
      baseYield: Math.max(0, Number(t.baseYield) || 0),
    }));
    net.lostCount = Math.max(0, Number(s.network.lostCount) || 0);
  }

  const now = nowSeconds();
  const savedAt = Number(s.savedAt) || now;
  const offline = Math.max(0, now - savedAt);
  // Pre-existing saves predate cycle-start tracking — anchor to the most
  // recent savedAt so duration figures land plausibly low rather than 0.
  const cs = Number(s.cycleStartedAt);
  state.cycleStartedAt = Number.isFinite(cs) && cs > 0 ? cs : savedAt;
  // Reconcile discovery losses across the offline window *before* integrating
  // the rate — the integral samples networkContribution at t1, so anything
  // lost while away should already be gone by then.
  const offlineLosses = offline > 0 ? reconcileOffline(state, offline, now) : [];
  const rawEarnings = offline > 0 ? integrateRate(state, savedAt, now) : 0;
  // Drift multiplier — offline-only. Lifts foreground earnings but not the
  // ambient Bleed (Bleeds are unique drops, not /s integral, by design).
  const offlineMul = Math.max(1, Number(state.offlineMul) || 1);
  const earnings = rawEarnings * offlineMul;
  // Bleed drips are isolated-relay ambient gifts. Closed-form expectation over
  // the offline window — see reconcileOfflineBleeds. Credited as a flat sum.
  // Also side-effects state.freeRerolls if any Patient Coils are owned, so
  // capture the pre-call value to surface the gain on the welcomeBack screen.
  const rerollsBefore = state.freeRerolls || 0;
  const offlineBleed = offline > 0 ? reconcileOfflineBleeds(state, offline, now) : 0;
  const rerollsGained = Math.max(0, (state.freeRerolls || 0) - rerollsBefore);
  state.amount += earnings + offlineBleed;
  validateSlate(state, now);
  return {
    offline, earnings, savedAt, now,
    rawEarnings,
    offlineMul,
    networkLosses: offlineLosses.length,
    networkLossDetails: offlineLosses.map((r) => ({ tier: r.tier, sector: r.sector })),
    networkBleed: offlineBleed,
    networkRerollsGained: rerollsGained,
  };
}

export function clearSave() {
  suppressed = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}
