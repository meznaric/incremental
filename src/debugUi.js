// Debug menu — extra knobs behind the PIN. amount/rate are still wired in
// mainUi.js (historical placement); everything else added here. Pure UI: poke
// state, save where needed, lean on the next HUD/network tick to re-render.

import { formatAbbrev, parseAmount } from './bignum.js';
import { saveContactLog } from './contactLog.js';
import { nowSeconds } from './save.js';
import { queueToken, ensureNetwork } from './network.js';
import { MAX_SLOTS, MAX_PIN_SLOTS, validateSlate } from './shop.js';
import { installTap } from './tap.js';

export function initDebugUi(state, deps) {
  const { onCloseCycle, showToast, refreshShop, refreshNetwork } = deps || {};

  const flatEl = document.getElementById('dbgFlatInput');
  const permEl = document.getElementById('dbgPermInput');
  const memEl = document.getElementById('dbgMemInput');
  const massEl = document.getElementById('dbgMassInput');
  const freeRerollsEl = document.getElementById('dbgFreeRerollsInput');
  if (!flatEl) return { sync() {} };

  function fmt(n) {
    if (!Number.isFinite(n)) return '0';
    return formatAbbrev(n);
  }

  function sync() {
    flatEl.value = fmt(state.flatBonus || 0);
    permEl.value = (state.permMul || 1).toString();
    memEl.value = (state.memoryMul || 1).toString();
    massEl.value = fmt((state.contactLog && state.contactLog.mass) || 0);
    freeRerollsEl.value = String(state.freeRerolls || 0);
  }
  sync();

  flatEl.addEventListener('input', () => { state.flatBonus = Math.max(0, parseAmount(flatEl.value)); });
  permEl.addEventListener('input', () => {
    const v = parseAmount(permEl.value);
    state.permMul = Number.isFinite(v) && v > 0 ? v : 1;
  });
  memEl.addEventListener('input', () => {
    const v = parseAmount(memEl.value);
    state.memoryMul = Number.isFinite(v) && v > 0 ? v : 1;
  });
  massEl.addEventListener('input', () => {
    if (!state.contactLog) return;
    state.contactLog.mass = Math.max(0, parseAmount(massEl.value));
    saveContactLog(state.contactLog);
  });
  freeRerollsEl.addEventListener('input', () => {
    const v = parseAmount(freeRerollsEl.value);
    state.freeRerolls = Math.max(0, Math.floor(Number.isFinite(v) ? v : 0));
  });

  function spawnBuff(kind) {
    const t = nowSeconds();
    const dur = 60;
    state.buffs = state.buffs || { rateMul: [], gambleLuck: [], gambleCushion: [], compound: [] };
    if (kind === 'carrier') {
      state.buffs.rateMul.push({ value: 5, duration: dur, expiresAt: t + dur, sourceId: 'debug' });
    } else if (kind === 'resonance') {
      // Compound: rate=ln(2)/30 means doubles every 30s while it holds.
      state.buffs.compound.push({ rate: Math.log(2) / 30, duration: dur, startedAt: t, expiresAt: t + dur, sourceId: 'debug' });
    } else if (kind === 'carry') {
      state.buffs.gambleLuck.push({ value: 0.30, duration: dur, expiresAt: t + dur, sourceId: 'debug' });
    } else if (kind === 'buffer') {
      state.buffs.gambleCushion.push({ value: 0.50, duration: dur, expiresAt: t + dur, sourceId: 'debug' });
    }
    if (showToast) showToast(`debug · ${kind} buff for ${dur}s`);
  }

  function ripenAll() {
    const net = ensureNetwork(state);
    const t = nowSeconds();
    let n = 0;
    for (const r of net.relays) {
      if (r.ripensAt > t) { r.ripensAt = t; n++; }
    }
    if (showToast) showToast(`debug · ripened ${n} relay${n === 1 ? '' : 's'}`);
    if (refreshNetwork) refreshNetwork();
  }

  function clearRelays() {
    const net = ensureNetwork(state);
    const n = net.relays.length;
    net.relays = [];
    net.queued = [];
    if (showToast) showToast(`debug · cleared ${n} relay${n === 1 ? '' : 's'} and queue`);
    if (refreshNetwork) refreshNetwork();
  }

  function queueSeed(tier) {
    // Yield scaled to current rate so the relay actually shifts the meter.
    const baseYield = Math.max(10, (state.basePerSecond || 0) + (state.flatBonus || 0) || 1000);
    queueToken(state, tier, baseYield * (tier === 'mythic' ? 5 : 1));
    if (showToast) showToast(`debug · queued ${tier} seed (+${formatAbbrev(baseYield)}/s base)`);
    if (refreshNetwork) refreshNetwork();
  }

  function unlockShop() {
    state.shop = state.shop || {};
    state.shop.rerollUnlocked = true;
    state.shop.pinSlots = MAX_PIN_SLOTS;
    const target = MAX_SLOTS;
    state.shop.slots = state.shop.slots || [];
    while (state.shop.slots.length < target) state.shop.slots.push(null);
    state.shop.slotsUnlocked = target;
    validateSlate(state, nowSeconds());
    if (refreshShop) refreshShop();
    if (showToast) showToast(`debug · all ${MAX_SLOTS} slots + ${MAX_PIN_SLOTS} lock tiers unlocked`);
  }

  // One delegated handler for every action button. installTap → iOS-safe.
  installTap(document.querySelector('.menu-view[data-view="debug"]'), (_e, target) => {
    const act = target.closest('[data-debug]')?.dataset.debug;
    if (!act) return;
    switch (act) {
      case 'buff-carrier':   spawnBuff('carrier');   break;
      case 'buff-resonance': spawnBuff('resonance'); break;
      case 'buff-carry':     spawnBuff('carry');     break;
      case 'buff-buffer':    spawnBuff('buffer');    break;
      case 'ripen-all':      ripenAll();             break;
      case 'queue-rare':     queueSeed('rare');      break;
      case 'queue-mythic':   queueSeed('mythic');    break;
      case 'clear-relays':   clearRelays();          break;
      case 'unlock-shop':    unlockShop();           break;
      case 'close-cycle':    if (onCloseCycle) onCloseCycle(); break;
    }
    sync();
  });

  return { sync };
}
