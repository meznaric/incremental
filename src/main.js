import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { HeroDisplay } from './hero.js';
import { formatAbbrev, parseAmount } from './bignum.js';
import { resolveUpgrade, KIND_THEME, kindLabel, getUpgrade, buildSlot } from './upgrades.js';
import {
  makeShopState, effectiveRate, integrateRate, tryBuy, validateSlate,
  tryReroll, tryUnlockSlot, tryUnlockReroll, tryUnlockPin, tryTogglePin,
  nextSlotUnlockCost, computeRerollCost, grantFreeRerollsForStall,
  marginalRateForPurchase, effectiveGambleChance,
  REROLL_UNLOCK_COST, REROLL_UNLOCK_AT, PIN_UNLOCK_COST, PIN_UNLOCK_AT,
} from './shop.js';
import { loadState, saveState, clearSave, nowSeconds } from './save.js';
import {
  checkStart, checkAmount, checkEngraving, enqueueFirstCloseBeat,
  scheduleTutorialIfEligible, bindEpisode, enqueueSeasonCompleteBeat,
} from './interstitial.js';
import { makeInterstitialUi } from './interstitialUi.js';
import { initMenu } from './menu.js';
import {
  loadContactLog, saveContactLog, backfillFromShown, closeCycle, memoryMul,
  ascentExp, boneMemoryBonus, quickWakeMul, firstLightAmount, getEngraving, QUICK_WAKE_DURATION,
} from './contactLog.js';
import { initContactLogUi } from './contactLogUi.js';
import { showWelcomeBack } from './welcomeBack.js';
import { initBreakdownUi } from './breakdownUi.js';
import { hasPendingPatternChoice } from './cyclePatterns.js';
import { showPatternSelect } from './patternUi.js';
import { installTap } from './tap.js';
import { fireGambleResult, isGambleFxActive } from './gambleFx.js';
import { ensureNetwork, tickNetwork, tickBleedDrip, SECTORS } from './network.js';
import { makeNetworkUi } from './networkUi.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  freeRerolls: 0,
  patternFreeLeft: 0,
  ...makeShopState(),
  // The Contact Log persists across save resets — it is the run-accumulating
  // narrative state, separate from the gameplay save.
  contactLog: loadContactLog(),
};
// Derived each session from the log. Drives Echo Memory in the rate math.
state.memoryMul = memoryMul(state.contactLog);
// Carrier Engraving — Ascent. Lifts the whole effective rate by this exponent.
state.ascentExp = ascentExp(state.contactLog);

initMenu();
// Bind the active episode's interstitials (milestone beats + cycle_open) to
// match the cycle the player is loading into. Must run before checkStart so
// any cycle_open/milestone enqueue picks up the EP's content. The active EP
// is derived from the log itself (first incomplete EP), so a cycle that
// closed early continues the same EP next time.
bindEpisode(state.contactLog);
const contactLogUi = initContactLogUi(state, {
  // "Close the Cycle" — the cycle-close action. Wipes the gameplay save, advances the
  // log's run counter so milestones can fire again, leaves the world list
  // (and therefore Echo Memory) intact, banks Carrier Mass against the
  // cycle's peakAmount, then reloads.
  onCloseCycle() {
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    const banked = closeCycle(state.contactLog, peak);
    if (banked === false) return false;
    saveContactLog(state.contactLog);
    clearSave();
    location.reload();
    return true;
  },
  onBuyEngraving(id) {
    // Live updates for engravings whose effect should bite immediately rather
    // than wait for the next cycle. Ascent applies to the rate pipeline now;
    // start-of-cycle grants (First Light, Open Frame, Patched Hands) do not
    // retroactively reshape the current run.
    state.ascentExp = ascentExp(state.contactLog);
    // checkEngraving sets log.firstEngravingSeen, so save *after*.
    checkEngraving(state, id);
    saveContactLog(state.contactLog);
  },
});
const breakdownUi = initBreakdownUi(state);
ensureNetwork(state);
const networkUi = makeNetworkUi(state, {
  openDiagnostic: (tab) => breakdownUi && breakdownUi.open && breakdownUi.open(tab),
});

const canvas = document.getElementById('canvas');
const amountInput = document.getElementById('amountInput');
const rateInput = document.getElementById('rateInput');
const slotsEl = document.getElementById('slots');
const buffsEl = document.getElementById('buffs');
const metaBuffsEl = document.getElementById('metaBuffs');
const buffModalEl = document.getElementById('buffModal');

const openBuffModal = () => buffModalEl.classList.add('open');
const closeBuffModal = () => buffModalEl.classList.remove('open');

installTap(buffModalEl, (e) => {
  if (e.target === buffModalEl || e.target.closest('.bm-close')) closeBuffModal();
});

const slotModalEl = document.getElementById('slotModal');
const slotModalTitleEl = document.getElementById('slotModalTitle');
const slotModalBodyEl = document.getElementById('slotModalBody');
const closeSlotModal = () => slotModalEl.classList.remove('open');
installTap(slotModalEl, (e) => {
  if (e.target === slotModalEl || e.target.closest('.bm-close')) { closeSlotModal(); return; }
  // Cross-link: a buff-kind upgrade card surfaces a "What's a Window?" link
  // that hands the player straight to the four-kind overview. The detail
  // modal stays open behind so they can return.
  if (e.target.closest('[data-act="open-buff-overview"]')) openBuffModal();
});
// Bridge between lore labels and mechanics. Surfaces inside the per-upgrade
// modal under the description so a player meeting "Hail" for the first time
// learns the wager / payout / cushion loop without leaving the card.
const KIND_EXPLAIN = {
  gamble:
    'Hail = wager. Spend the listed % of your balance for a roll. Win → you get back Return × wager. Miss → wager lost (active Buffer windows refund part of it). Each Hail has its own cooldown after a roll.',
  buff:
    'Window = timed boost. Stacks while it holds. Multiple Carrier windows multiply (×3 × ×3 = ×9). Multiple Carry windows add. The duration runs in real time, even when the tab is hidden.',
  convert:
    'Seed Relay = a placement token. The burn queues a relay; drop it on a hex in the Network map. It ripens (20m–2h), then carries Echoes until ComDef finds it. Sector picks risk vs reward; clustering pays more but is easier to triangulate.',
  gift:
    'Bleed = a one-shot Echo payout. Adds the listed Echoes to your balance. No ongoing effect.',
  drift:
    'Drift = permanent offline multiplier. Only fires while you are away — when you come back, the integrated rate is multiplied by your stacked Drift. Foreground Echoes/s is unchanged.',
};
function permExplain(u) {
  if (u.permType === 'mul') {
    return 'Decode = permanent rate multiplier. Stacks multiplicatively with every other Decode. Lost on cycle close — buy Engravings (Rig tab) for cross-cycle multipliers.';
  }
  return 'Relay = permanent base-rate add. Stacks additively. Lost on cycle close — Echo Memory (Names tab) is the cross-cycle base bonus.';
}

function openSlotModal(idx) {
  const slot = state.shop.slots[idx];
  const u = slot ? resolveUpgrade(slot) : null;
  if (!u || !slot) return;
  const theme = KIND_THEME[u.kind] || {};
  slotModalTitleEl.textContent = u.name;
  const costCell = u.kind === 'gift' ? 'FREE' : `<span class="cc">${ECHO_ICON}${formatAbbrev(slot.cost)}</span>`;
  const rows = [`<div class="slot-modal-row"><span>Cost</span><span>${costCell}</span></div>`];
  if (u.kind === 'gamble') {
    const effChance = effectiveGambleChance(state, u, nowSeconds());
    rows.push(
      `<div class="slot-modal-row"><span>Carry chance</span><span>${fmtPct(effChance)}</span></div>`,
      `<div class="slot-modal-row"><span>Return</span><span>${u.payout}× wager</span></div>`,
      `<div class="slot-modal-row"><span>Cooldown</span><span>${u.cooldown}s</span></div>`,
    );
  } else if (u.kind === 'convert') {
    // Token-style preview: this purchase queues a placement, not a /s bump.
    // Show what the token carries; sector and clustering multipliers land later.
    const tokenYield = slot.cost * u.ratio;
    rows.push(
      `<div class="slot-modal-row"><span>Token tier</span><span>${u.rarity}</span></div>`,
      `<div class="slot-modal-row"><span>Base yield</span><span>+${formatAbbrev(tokenYield)}/s (before sector × cluster)</span></div>`,
      `<div class="slot-modal-row"><span>On purchase</span><span>Queue for placement on the Network map</span></div>`,
    );
  } else if (u.kind === 'permanent' && u.permType === 'add') {
    const eff = marginalRateForPurchase(state, slot, nowSeconds());
    rows.push(
      `<div class="slot-modal-row"><span>Effective gain</span><span>+${formatAbbrev(eff)} Echoes/s</span></div>`,
      `<div class="slot-modal-row"><span>Base added</span><span>+${formatAbbrev(u.value)}/s before multipliers</span></div>`,
    );
  } else if (u.kind === 'permanent' && u.permType === 'mul') {
    const eff = marginalRateForPurchase(state, slot, nowSeconds());
    rows.push(
      `<div class="slot-modal-row"><span>Effective gain</span><span>+${formatAbbrev(eff)} Echoes/s</span></div>`,
      `<div class="slot-modal-row"><span>Multiplier</span><span>×${u.value}</span></div>`,
    );
  } else if (u.kind === 'buff') {
    rows.push(`<div class="slot-modal-row"><span>Duration</span><span>${u.duration}s</span></div>`);
  } else if (u.kind === 'drift') {
    const newMul = (state.offlineMul || 1) * u.value;
    rows.push(
      `<div class="slot-modal-row"><span>Multiplier</span><span>×${u.value}</span></div>`,
      `<div class="slot-modal-row"><span>Total offline mul (after buy)</span><span>×${newMul.toFixed(2)}</span></div>`,
      `<div class="slot-modal-row"><span>Effect</span><span>Applies only to offline earnings.</span></div>`,
    );
  } else if (u.kind === 'gift') {
    rows.push(`<div class="slot-modal-row"><span>Returns</span><span class="cc">${ECHO_ICON}+${formatAbbrev(u.reward)}</span></div>`);
  }
  const explain = u.kind === 'permanent' ? permExplain(u) : (KIND_EXPLAIN[u.kind] || '');
  const crossLink = u.kind === 'buff'
    ? `<button type="button" class="bm-link" data-act="open-buff-overview">View all four Window kinds <i class="ri ri-arrow-right-s-line"></i></button>`
    : '';
  slotModalBodyEl.innerHTML = `
    <span class="slot-modal-tag rarity-${u.rarity}">${u.rarity} · ${kindLabel(u)}</span>
    <p class="slot-modal-desc">${u.desc}</p>
    ${explain ? `<p class="slot-modal-explain">${explain}</p>` : ''}
    ${rows.join('')}
    ${crossLink}
  `;
  slotModalEl.classList.add('open');
}

amountInput.value = '0';
rateInput.value = '1';
state.amount = parseAmount(amountInput.value);
state.basePerSecond = parseAmount(rateInput.value);

const loaded = loadState(state);
// Back-fill the Contact Log from any milestones already marked shown by an
// older code version. One-time, idempotent.
if (loaded && backfillFromShown(state.contactLog, state.messages.shown, nowSeconds()) > 0) {
  saveContactLog(state.contactLog);
}
// Existing players whose log already has worlds predate the First Contact
// beat. Don't surface it retroactively — first contact already happened.
if (state.contactLog.worlds.length > 0 && !state.contactLog.firstContactSeen) {
  state.contactLog.firstContactSeen = true;
  saveContactLog(state.contactLog);
}
checkStart(state, !loaded, loaded ? loaded.offline : 0);
// First close beat — fires once across the player's whole history, on the
// very first fresh boot of a cycle >= 2. The log is the gate (the gameplay
// save is wiped by Close the Cycle, so messages.shown can't carry the flag).
if (!loaded && (state.contactLog.run || 1) >= 2) {
  enqueueFirstCloseBeat(state);
  saveContactLog(state.contactLog);
}
// Season-finale cinematic — fires once across the player's whole history,
// on the first fresh boot after they close cycle 8 (run advances to 9, the
// log enters Echo Loop mode). enqueueSeasonCompleteBeat is the gate; it
// flips the persisted seasonCompleteShown flag and queues the interstitial.
if (!loaded) {
  enqueueSeasonCompleteBeat(state);
  saveContactLog(state.contactLog);
}
if (loaded) {
  amountInput.value = formatAbbrev(state.amount);
  rateInput.value = formatAbbrev(state.basePerSecond);
  checkAmount(state, state.amount);
  if (loaded.offline > 1) {
    console.log(`[save] welcome back — ${loaded.offline.toFixed(0)}s away, +${formatAbbrev(loaded.earnings)}`);
  }
  if (loaded.networkLosses > 0 && loaded.offline < 60) {
    // Short absences (< 60s) skip the Signal Lock screen entirely, so the
    // toast is the only feedback. Long absences surface losses inside the
    // welcomeBack panel — see showWelcomeBack below.
    const n = loaded.networkLosses;
    setTimeout(() => showToast(`ComDef pulled ${n} relay${n === 1 ? '' : 's'} while you were away.`), 0);
  }
  // Signal Lock — celebratory accounting of what came in while away. Earnings
  // are already credited inside loadState; this screen only displays them.
  showWelcomeBack({
    state,
    offline: loaded.offline,
    // Headline number = everything that landed during the away window —
    // integrated foreground rate (already Drift-multiplied) plus ambient
    // mesh bleed. The breakdown rows explain where each part came from.
    earnings: (loaded.earnings || 0) + (loaded.networkBleed || 0),
    savedAt: loaded.savedAt,
    networkBleed: loaded.networkBleed || 0,
    networkLosses: loaded.networkLosses || 0,
    networkLossDetails: loaded.networkLossDetails || [],
    offlineMul: loaded.offlineMul || 1,
  });
}

// Apply Carrier Engravings (persistent cross-cycle boosts) on a fresh boot.
// Must run before validateSlate so Open Frame's extra band is filled by it.
if (!loaded) {
  state.amount += firstLightAmount(state.contactLog);
  state.flatBonus += boneMemoryBonus(state.contactLog);
  if (getEngraving(state.contactLog, 'patched_hands') > 0) {
    state.shop.rerollUnlocked = true;
  }
  if (getEngraving(state.contactLog, 'open_frame') > 0 && state.shop.slotsUnlocked < 3) {
    state.shop.slotsUnlocked = 3;
    state.shop.slots.push(null);
  }
}

// Fill any empty slots and reroll any items that no longer fit (kind/rate gate).
// Existing slots keep their frozen cost.
validateSlate(state, nowSeconds());

// First-roll seed: slot 1 starts as the cheap starter mul (×1.5, cost ≤ 100).
// Subsequent rerolls/buys fall back to any rarity mul per SLOT_FILTERS.
// Also grant one starting buff: 3× rate for 20 seconds, plus Quick Wake if cut.
if (!loaded) {
  const ctx = { balance: state.amount, rate: state.basePerSecond, owned: state.owned };
  const starterMul = getUpgrade('mult_starter');
  if (starterMul) state.shop.slots[1] = buildSlot(starterMul, ctx);
  const t0 = nowSeconds();
  state.buffs.rateMul.push({ value: 3, duration: 20, expiresAt: t0 + 20, sourceId: 'wake' });
  const qw = quickWakeMul(state.contactLog);
  if (qw > 1) {
    state.buffs.rateMul.push({ value: qw, duration: QUICK_WAKE_DURATION, expiresAt: t0 + QUICK_WAKE_DURATION, sourceId: 'quick_wake' });
  }
  amountInput.value = formatAbbrev(state.amount);
  rateInput.value = formatAbbrev(state.basePerSecond);
}

// Cycle Pattern chooser — runs on EVERY boot, fresh or loaded. closeCycle sets
// pendingPatternChoice; the only way to clear it is for the player to pick.
// If we gated on !loaded, a reload mid-chooser would lock the player out.
// applyPatternOnFreshBoot is called inside the click handler so seed effects
// land exactly once (the moment of the pick), regardless of fresh/loaded path.
if (hasPendingPatternChoice(state.contactLog)) {
  showPatternSelect(state, () => {
    saveState(state);
  });
}

amountInput.addEventListener('input', () => {
  state.amount = parseAmount(amountInput.value);
});
rateInput.addEventListener('input', () => {
  state.basePerSecond = parseAmount(rateInput.value);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a14, 0.025);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 18);
camera.lookAt(0, 6, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 8, 8);
scene.add(key);
const fill = new THREE.PointLight(0x88aaff, 70, 60);
fill.position.set(-6, 0, 6);
scene.add(fill);
const rim = new THREE.PointLight(0xff66cc, 50, 60);
rim.position.set(6, 4, -4);
scene.add(rim);

const display = new MagnitudeDisplay();
scene.add(display.group);

// Map viewport-centre to a world point on the z=0 plane for FX attractors.
// Unprojecting NDC(0,0) gives a ray from the camera; we intersect z=0 along it.
const _attractor = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function unprojectScreenCenterToZ0() {
  _attractor.set(0, 0, 0.5).unproject(camera);
  _camDir.copy(_attractor).sub(camera.position).normalize();
  const tHit = -camera.position.z / _camDir.z;
  _attractor.copy(camera.position).addScaledVector(_camDir, tHit);
  return _attractor;
}

const hero = new HeroDisplay();
scene.add(hero.group);

const shopEl = document.getElementById('shop');
function onResize() {
  const shopRect = shopEl.getBoundingClientRect();
  const shopTop = shopRect.height ? shopRect.top : window.innerHeight;
  document.documentElement.style.setProperty('--shop-h', shopRect.height + 'px');
  const w = window.innerWidth;
  const h = Math.max(240, shopTop - 8);
  renderer.setSize(w, h);
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  display.setVisibleColumns(w <= 820 ? 3 : 5);
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(shopEl);

// Echo glyph — broadcast-fill reads as concentric arcs (a signal returning).
// Kept tagged `.cc-icon` (warm tungsten) so it pops against the cool UI.
const ECHO_ICON = '<i class="ri-broadcast-fill cc-icon"></i>';

function fmtPct(p) {
  const v = p * 100;
  if (v < 1) return `${v.toFixed(2)}%`;
  if (v < 10) return `${v.toFixed(1)}%`;
  return `${v.toFixed(0)}%`;
}

function fmtDuration(s) {
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  const d = s / 86400;
  return `${d.toFixed(1)} day${d >= 2 ? 's' : ''}`;
}

// Skip innerHTML assignment when content is unchanged. Avoids tearing down
// child nodes between mousedown and mouseup, which would silently eat clicks.
function setHtmlIfChanged(el, html) {
  if (el._lastHtml === html) return;
  el._lastHtml = html;
  el.innerHTML = html;
}

// Re-trigger a one-shot animation class. Strip stale fx classes, force reflow, re-add.
function playSlotFx(el, cls) {
  el.classList.remove('fx-buy', 'fx-drop', 'fx-reject');
  // Force reflow so re-adding the class restarts the animation.
  // eslint-disable-next-line no-unused-expressions
  void el.offsetWidth;
  el.classList.add(cls);
}
// On purchase: fly the current card up + out, then run renderShop and fly the
// new card in from below. The slot DOM is reused, so we gate renderShop on the
// fx-fly-up class to keep the outgoing content stable mid-animation.
function flyOutAndReplace(el) {
  el.classList.remove('fx-content', 'fx-fly-up');
  void el.offsetWidth;
  el.classList.add('fx-fly-up');
  setTimeout(() => {
    el.classList.remove('fx-fly-up');
    renderShop();
    markContentFresh(el);
  }, 170);
}
function markContentFresh(el) {
  el.classList.remove('fx-content');
  void el.offsetWidth;
  el.classList.add('fx-content');
}
function spawnEchoBurn(el) {
  const c = document.createElement('i');
  c.className = 'ri-broadcast-fill echo-burn';
  el.appendChild(c);
  c.addEventListener('animationend', () => c.remove(), { once: true });
  // Safety fallback if animationend doesn't fire (reduced motion hides it).
  setTimeout(() => { if (c.parentNode) c.remove(); }, 600);
}

// Hail win burst — a wave of carrier returning. The card pulses, a triple-arc
// glyph blooms outward, twelve ringed dots radiate, the page rim glows once.
// All DOM, all CSS-keyframed, self-collected under one container so a single
// remove() tears the whole thing down. Total wall-clock budget: 1.2s.
const winFxRootId = 'winFxRoot';
function ensureWinFxRoot() {
  let r = document.getElementById(winFxRootId);
  if (!r) {
    r = document.createElement('div');
    r.id = winFxRootId;
    document.body.appendChild(r);
  }
  return r;
}
function fireWinBurst(slotEl) {
  const root = ensureWinFxRoot();
  const burst = document.createElement('div');
  burst.className = 'win-burst';
  // Anchor the burst at the centre of the card the player just tapped, so the
  // wave feels like it came *from* the Hail, not from the page.
  const rect = slotEl.getBoundingClientRect();
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  // Build the parts: a central glyph, three expanding rings, twelve radiating
  // motes. innerHTML keeps the markup terse — there is no per-element JS.
  const motes = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    return `<span class="wb-mote" style="--a:${angle}deg; --d:${80 + (i % 3) * 30}ms"></span>`;
  }).join('');
  burst.innerHTML = `
    <span class="wb-flash"></span>
    <i class="wb-glyph ri-broadcast-fill"></i>
    <span class="wb-ring wb-ring-1"></span>
    <span class="wb-ring wb-ring-2"></span>
    <span class="wb-ring wb-ring-3"></span>
    ${motes}
  `;
  root.appendChild(burst);
  // Card-level kick: a glow halo on the slot itself so the card stays a
  // present, on-stage object inside the burst.
  slotEl.classList.add('fx-win-glow');
  setTimeout(() => slotEl.classList.remove('fx-win-glow'), 900);
  // Cleanup after the longest sub-animation. setTimeout guards against
  // animationend not firing under reduced-motion or backgrounded tabs.
  setTimeout(() => { if (burst.parentNode) burst.remove(); }, 1300);
}

// Lightweight toast — used by the stall-help grant. Stacks bottom-right; each
// row fades itself out after a few seconds. No queue, no priority, no state.
const toastsEl = document.getElementById('toasts');
function showToast(text) {
  if (!toastsEl) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  toastsEl.appendChild(t);
  // Trigger the entrance transition on the next frame.
  requestAnimationFrame(() => t.classList.add('toast-in'));
  setTimeout(() => { t.classList.remove('toast-in'); t.classList.add('toast-out'); }, 4200);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 5000);
}

// After a purchase, wait 5–10s and check whether the cheapest next slot is
// far enough out to warrant a free Re-tune. The delay is deliberate: the
// grant should *feel* like Sera reaching across the gap rather than a reward
// dispensed by the click.
let pendingFreeRerollTimer = null;
function scheduleFreeRerollCheck() {
  if (!state.shop.rerollUnlocked) return;
  if (pendingFreeRerollTimer != null) {
    clearTimeout(pendingFreeRerollTimer);
    pendingFreeRerollTimer = null;
  }
  const delay = 5000 + Math.floor(Math.random() * 5000);
  pendingFreeRerollTimer = setTimeout(() => {
    pendingFreeRerollTimer = null;
    const added = grantFreeRerollsForStall(state, nowSeconds());
    if (added > 0) {
      // voice: Sera. Second person, procedural, periods only. She has read
      // the wait off the rig; the grant is an observation, not a reward.
      const msg = added === 1
        ? 'Your carrier is sitting on a long wait. One free reroll is on the file.'
        : `Your carrier is sitting on a long wait. ${added} free rerolls are on the file.`;
      showToast(msg);
      renderShop();
    }
  }, delay);
}
// Single delegated handler to clear fx classes after they finish so they don't leak.
slotsEl.addEventListener('animationend', (e) => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  if (e.animationName === 'slot-buy' || e.animationName === 'slot-flash') slot.classList.remove('fx-buy');
  if (e.animationName === 'slot-drop' || e.animationName === 'slot-flash') slot.classList.remove('fx-drop');
  if (e.animationName === 'slot-reject' || e.animationName === 'slot-flash') slot.classList.remove('fx-reject');
  if (e.animationName === 'slot-content-in') {
    slot.classList.remove('fx-content');
  }
  if (e.animationName === 'slot-content-out') {
    slot.classList.remove('fx-fly-up');
  }
});

const slotsLeftBtn = document.getElementById('slotsLeft');
const slotsRightBtn = document.getElementById('slotsRight');
function updateSlotsNav() {
  const max = slotsEl.scrollWidth - slotsEl.clientWidth;
  const overflow = max > 1;
  slotsLeftBtn.classList.toggle('hidden', !overflow || slotsEl.scrollLeft <= 0);
  slotsRightBtn.classList.toggle('hidden', !overflow || slotsEl.scrollLeft >= max - 1);
}
function scrollSlotsBy(dir) {
  const step = Math.max(slotsEl.clientWidth * 0.8, 200);
  slotsEl.scrollBy({ left: dir * step, behavior: 'smooth' });
}
installTap(slotsLeftBtn, () => scrollSlotsBy(-1));
installTap(slotsRightBtn, () => scrollSlotsBy(1));
slotsEl.addEventListener('scroll', updateSlotsNav, { passive: true });
slotsEl.addEventListener('wheel', (e) => {
  const dy = e.deltaY;
  if (!dy) return;
  const max = slotsEl.scrollWidth - slotsEl.clientWidth;
  if (max <= 1) return;
  e.preventDefault();
  slotsEl.scrollLeft += dy;
}, { passive: false });
new ResizeObserver(updateSlotsNav).observe(slotsEl);

const toolbarEl = document.getElementById('shopToolbar');

const slotEls = [];
function ensureSlotEls() {
  while (slotEls.length < state.shop.slotsUnlocked) {
    const i = slotEls.length;
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = `
      <button class="pin" type="button" aria-label="Pin"><i class="ri ri-pushpin-2-fill"></i></button>
      <div class="head">
        <i class="kind-icon"></i>
        <div class="rarity"></div>
      </div>
      <div class="name"></div>
      <div class="desc"></div>
      <div class="cost"></div>
      <div class="outcomes"></div>
      <div class="meta"></div>
      <div class="foot">
        <button class="slot-info" type="button" aria-label="Details"><i class="ri ri-information-line"></i></button>
      </div>
    `;
    installTap(el, (_e, target) => {
      const idx = slotEls.indexOf(el);
      if (target.closest('.pin')) {
        const r = tryTogglePin(state, idx);
        if (r.ok) renderShop();
        return;
      }
      if (target.closest('.slot-info')) { openSlotModal(idx); return; }
      // Block taps on a gamble slot while a WIN/LOSS banner is on screen —
      // double-rolling through the reveal is jarring and lets the player
      // stack overlapping bursts. Non-gamble slots still buy through.
      if (isGambleFxActive()) {
        const slot = state.shop.slots[idx];
        const u = slot ? resolveUpgrade(slot) : null;
        if (u && u.kind === 'gamble') return;
      }
      const res = tryBuy(state, idx, nowSeconds());
      if (res.ok) {
        // Gambles get the dramatic centred reveal flow — gravity pull, hold,
        // then a WIN/LOSS banner with a green burst or a quiet fall. The
        // ordinary fly-up/fly-in card swap is replaced by an onMid callback
        // that triggers renderShop midway through the burst so the new card
        // appears while the banner is the focal point. Non-gamble purchases
        // keep the existing per-card fly-up animation.
        if (res.result) {
          // Skip the local fx-buy scale-pulse and echo-glyph float — both
          // would scribble over the inline transforms the gravity pull
          // applies to this card. The centred banner is the feedback.
          const won = !!res.result.won;
          const deltaText = formatAbbrev(Math.abs(res.result.delta || 0));
          fireGambleResult({
            tappedEl: el,
            won,
            deltaText,
            onMid: () => { renderShop(); markContentFresh(el); },
            onStart: () => {
              const attractor = unprojectScreenCenterToZ0();
              display.triggerGambleFx({ won, durationMs: 1400, attractorWorld: attractor, now: nowSeconds() });
            },
          });
          // Keep the card-anchored ring burst as a secondary flourish on
          // wins — it blooms around the tapped card while the central
          // banner pops, composing rather than competing.
          if (won) fireWinBurst(el);
        } else {
          playSlotFx(el, 'fx-buy'); spawnEchoBurn(el); flyOutAndReplace(el);
        }
        scheduleFreeRerollCheck();
      } else { playSlotFx(el, 'fx-reject'); }
    });
    if (unlockSlotEl && unlockSlotEl.parentNode === slotsEl) {
      slotsEl.insertBefore(el, unlockSlotEl);
    } else {
      slotsEl.appendChild(el);
    }
    slotEls.push(el);
    // Fly the brand-new slot in from below on first paint.
    requestAnimationFrame(() => markContentFresh(el));
  }
  while (slotEls.length > state.shop.slotsUnlocked) {
    const el = slotEls.pop();
    el.remove();
  }
}

// Preview of what kind of upgrade slot N will roll. Mirrors SLOT_FILTERS in
// upgrades.js. Slots past the pinned set ("any") show a neutral wildcard.
const SLOT_PREVIEW = [
  { icon: KIND_THEME.permanent.icon, color: KIND_THEME.permanent.color, label: KIND_THEME.permanent.label },
  { icon: KIND_THEME.permanent.icon, color: KIND_THEME.permanent.color, label: KIND_THEME.permanent.permLabel },
  { icon: KIND_THEME.buff.icon,      color: KIND_THEME.buff.color,      label: KIND_THEME.buff.label },
  { icon: KIND_THEME.gamble.icon,    color: KIND_THEME.gamble.color,    label: KIND_THEME.gamble.label },
  { icon: KIND_THEME.buff.icon,      color: KIND_THEME.buff.color,      label: 'Surge' },
];
const SLOT_PREVIEW_ANY = { icon: 'ri-shuffle-line', color: '#8aa0ff', label: 'Any' };
function slotPreview(idx) { return SLOT_PREVIEW[idx] || SLOT_PREVIEW_ANY; }

const unlockSlotEl = document.createElement('div');
unlockSlotEl.className = 'slot slot-unlock';
unlockSlotEl.innerHTML = `
  <div class="head">
    <i class="kind-icon"></i>
    <div class="rarity">Locked</div>
  </div>
  <div class="name"></div>
  <div class="desc">Open a new band. The next card lands here.</div>
  <div class="cost"></div>
  <div class="outcomes"></div>
  <div class="meta"></div>
  <div class="foot"></div>
`;
installTap(unlockSlotEl, () => {
  const res = tryUnlockSlot(state, nowSeconds());
  if (res.ok) { playSlotFx(unlockSlotEl, 'fx-buy'); renderShop(); }
  else { playSlotFx(unlockSlotEl, 'fx-reject'); }
});
slotsEl.appendChild(unlockSlotEl);

const SHOP_UNLOCK_AT = 100;
let shopUnlocked = state.amount > SHOP_UNLOCK_AT;

// Stable toolbar buttons. Rewriting innerHTML every HUD tick would race with
// mousedown/mouseup and prevent clicks from firing.
function makeTbBtn(act, icon) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tb-btn';
  b.dataset.act = act;
  b.innerHTML = `<i class="ri ${icon}"></i><span class="tb-label"></span>`;
  toolbarEl.appendChild(b);
  return b;
}
const tbButtons = {
  'free-reroll':   makeTbBtn('free-reroll',   'ri-refresh-line'),
  'reroll':        makeTbBtn('reroll',        'ri-refresh-line'),
  'unlock-reroll': makeTbBtn('unlock-reroll', 'ri-refresh-line'),
  'unlock-pin':    makeTbBtn('unlock-pin',    'ri-pushpin-2-fill'),
};
tbButtons['free-reroll'].classList.add('tb-free');
function setTbBtn(act, visible, locked, label) {
  const b = tbButtons[act];
  b.style.display = visible ? '' : 'none';
  if (!visible) return;
  b.classList.toggle('locked', !!locked);
  setHtmlIfChanged(b.querySelector('.tb-label'), label);
}

function renderToolbar() {
  const rerollUnlockVisible = !state.shop.rerollUnlocked && state.amount >= REROLL_UNLOCK_AT;
  const rerollVisible = state.shop.rerollUnlocked;
  setTbBtn('unlock-reroll', rerollUnlockVisible,
    rerollUnlockVisible && state.amount < REROLL_UNLOCK_COST,
    `Unlock Reroll · <span class="cc">${ECHO_ICON}${formatAbbrev(REROLL_UNLOCK_COST)}</span>`);
  if (rerollVisible) {
    const n = countRerollableForUi();
    const cost = computeRerollCost(state, nowSeconds(), n);
    setTbBtn('reroll', true, !(n > 0 && state.amount >= cost && state.amount > 0),
      `Reroll ${n} · <span class="cc">${ECHO_ICON}${formatAbbrev(cost)}</span>`);
  } else {
    setTbBtn('reroll', false, false, '');
  }

  const freeCount = state.freeRerolls || 0;
  const freeVisible = rerollVisible && freeCount > 0;
  const freeN = freeVisible ? countRerollableForUi() : 0;
  setTbBtn('free-reroll', freeVisible, freeVisible && freeN === 0,
    `<i class="ri ri-gift-fill"></i> Free Reroll (${freeCount})`);

  const pinVisible = state.shop.rerollUnlocked && !state.shop.pinUnlocked && state.amount >= PIN_UNLOCK_AT;
  setTbBtn('unlock-pin', pinVisible, pinVisible && state.amount < PIN_UNLOCK_COST,
    `Unlock Pin · <span class="cc">${ECHO_ICON}${formatAbbrev(PIN_UNLOCK_COST)}</span>`);

  const anyVisible = rerollUnlockVisible || rerollVisible || pinVisible || freeVisible;
  toolbarEl.style.display = anyVisible ? '' : 'none';
}

function countRerollableForUi() {
  let n = 0;
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.pinnedSlot === i) continue;
    if (state.shop.slots[i]) n++;
  }
  return n;
}

// Tap-stable: the toolbar buttons (reroll, unlock-pin, unlock-reroll) share
// the same iOS Chrome failure mode as the upgrade cards — renderShop rewrites
// their innerHTML every 100ms, and a tap whose pointerdown lands on a child
// that gets replaced before pointerup drops the synthetic click.
installTap(toolbarEl, (_e, target) => {
  const btn = target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  let res;
  if (act === 'unlock-reroll') res = tryUnlockReroll(state);
  else if (act === 'unlock-pin') res = tryUnlockPin(state);
  else if (act === 'reroll' || act === 'free-reroll') {
    res = tryReroll(state, nowSeconds());
    if (res.ok) {
      for (let i = 0; i < slotEls.length; i++) {
        if (state.shop.pinnedSlot === i) continue;
        markContentFresh(slotEls[i]);
      }
    }
  }
  if (res && res.ok) renderShop();
});

// Per-buffType swatch for the shop card. Mirrors the glyph + colour the live
// buff renders with (BUFF_ICONS below + the .kind-* CSS), so buying a Hunch
// previews the same red sparkles you'll see in the buff bar a moment later.
const BUFF_TYPE_THEME = {
  rateMul:       { icon: 'ri-flashlight-fill',  color: '#9d6ee0' },
  gambleLuck:    { icon: 'ri-sparkling-2-fill', color: '#ff5a6e' },
  gambleCushion: { icon: 'ri-shield-fill',      color: '#ff8a8a' },
  compound:      { icon: 'ri-stack-fill',       color: '#f5d34a' },
  metaStrength:  { icon: 'ri-flashlight-line',  color: '#c084ff' },
  metaDuration:  { icon: 'ri-time-line',        color: '#9d6ee0' },
  metaLuck:      { icon: 'ri-sparkling-2-line', color: '#d8a5f0' },
};

function renderShop() {
  const now = nowSeconds();
  if (!shopUnlocked && state.amount > SHOP_UNLOCK_AT) shopUnlocked = true;
  shopEl.style.display = shopUnlocked ? '' : 'none';
  if (!shopUnlocked) return;
  ensureSlotEls();
  renderToolbar();
  for (let i = 0; i < state.shop.slotsUnlocked; i++) {
    const slot = state.shop.slots[i];
    const u = slot ? resolveUpgrade(slot) : null;
    const el = slotEls[i];
    if (!u || !slot) { el.style.display = 'none'; continue; }
    // While the card is flying up after a purchase, freeze its rendering so the
    // outgoing content stays put. renderShop fires every 100ms; without this the
    // mid-animation HUD tick would swap in the new card under the fly-up motion.
    if (el.classList.contains('fx-fly-up')) continue;
    el.style.display = '';
    const cost = slot.cost;
    const cdLeft = u.kind === 'gamble' ? (state.gambleCd[u.id] || 0) - now : 0;
    const theme = KIND_THEME[u.kind] || {};
    const buffTheme = u.kind === 'buff' ? BUFF_TYPE_THEME[u.buffType] : null;
    el.dataset.kind = u.kind;
    const iconEl = el.querySelector('.kind-icon');
    iconEl.className = `kind-icon ri ${(buffTheme || theme).icon || ''}`;
    iconEl.style.color = buffTheme ? buffTheme.color : '';
    el.querySelector('.rarity').textContent = `${u.rarity} · ${kindLabel(u)}`;
    el.querySelector('.rarity').className = `rarity rarity-${u.rarity}`;
    el.querySelector('.name').textContent = u.name;
    el.querySelector('.desc').textContent = u.desc;
    // Pattern free-purchase coverage applies to any non-hail, non-bleed slot.
    // Surface it as "FREE" on the cost cell so the player sees the charge being
    // used before they tap.
    const patternFree = (state.patternFreeLeft || 0) > 0 && u.kind !== 'gamble' && u.kind !== 'gift';
    const costHtml = u.kind === 'gift'
      ? 'FREE'
      : patternFree
        ? `<span class="cc">FREE</span> <span class="cc-strike">${ECHO_ICON}${formatAbbrev(cost)}</span>`
        : `${ECHO_ICON}${formatAbbrev(cost)}`;
    setHtmlIfChanged(el.querySelector('.cost'), costHtml);

    let outcomes = '';
    if (u.kind === 'gamble') {
      const winNet = cost * (u.payout - 1);
      // Effective chance: base + active Carry windows + pattern luck bonus, clamped at CAP.
      // This is the same number tryBuy rolls against, so what the player reads is reality.
      const effChance = effectiveGambleChance(state, u, now);
      const winPct = fmtPct(effChance);
      const losePct = fmtPct(1 - effChance);
      outcomes =
        `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> <span class="cc">${ECHO_ICON}+${formatAbbrev(winNet)}</span> · ${winPct}</div>` +
        `<div class="outcome lose"><i class="ri ri-arrow-down-line"></i> <span class="cc">${ECHO_ICON}−${formatAbbrev(cost)}</span> · ${losePct}</div>`;
    } else if (u.kind === 'convert') {
      // Convert no longer credits flatBonus on purchase — the burn buys a
      // placement token. Preview what the token will be worth before sector
      // and clustering multipliers.
      const tokenYield = cost * u.ratio;
      outcomes = `<div class="outcome win"><i class="ri ri-add-circle-line"></i> Queue token · +${formatAbbrev(tokenYield)}/s base</div>`;
    } else if (u.kind === 'permanent' && (u.permType === 'add' || u.permType === 'mul')) {
      const eff = marginalRateForPurchase(state, slot, now);
      outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> +${formatAbbrev(eff)}/s effective</div>`;
    } else if (u.kind === 'drift') {
      // Drift previews the offline-only multiplier — never lies about a
      // foreground /s gain (it doesn't move foreground rate).
      const pct = Math.round((u.value - 1) * 100);
      outcomes = `<div class="outcome win"><i class="ri ri-moon-line"></i> +${pct}% offline gain</div>`;
    } else if (u.kind === 'gift') {
      outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> <span class="cc">${ECHO_ICON}+${formatAbbrev(u.reward)}</span></div>`;
    }
    setHtmlIfChanged(el.querySelector('.outcomes'), outcomes);

    let meta = '';
    if (u.kind === 'gamble' && cdLeft > 0) meta = `cooldown ${cdLeft.toFixed(1)}s`;
    else if (u.kind === 'permanent' && state.owned[u.id]) meta = `owned ×${state.owned[u.id]}`;
    el.querySelector('.meta').textContent = meta;
    const pinEl = el.querySelector('.pin');
    pinEl.style.display = state.shop.pinUnlocked ? '' : 'none';
    el.classList.toggle('pinned', state.shop.pinnedSlot === i);
    const canAfford = state.amount >= cost;
    el.classList.toggle('locked', !canAfford || cdLeft > 0);
  }
  renderUnlockSlot();
  updateSlotsNav();
}

function renderUnlockSlot() {
  const cost = nextSlotUnlockCost(state);
  if (cost == null) { unlockSlotEl.style.display = 'none'; return; }
  unlockSlotEl.style.display = '';
  const idx = state.shop.slotsUnlocked;
  const p = slotPreview(idx);
  unlockSlotEl.style.setProperty('--kind-color', p.color);
  unlockSlotEl.style.setProperty('--kind-border', p.color);
  unlockSlotEl.style.setProperty('--kind-glow', p.color);
  unlockSlotEl.querySelector('.kind-icon').className = `kind-icon ri ${p.icon}`;
  const rarityEl = unlockSlotEl.querySelector('.rarity');
  rarityEl.textContent = `Slot ${idx + 1} · ${p.label}`;
  rarityEl.className = 'rarity';
  unlockSlotEl.querySelector('.name').textContent = 'Unlock';
  setHtmlIfChanged(unlockSlotEl.querySelector('.cost'),
    `${ECHO_ICON}${formatAbbrev(cost)}`);
  unlockSlotEl.classList.toggle('locked', state.amount < cost);
}

const BUFF_ICONS = {
  rate:     'ri-flashlight-fill',
  luck:     'ri-sparkling-2-fill',
  cushion:  'ri-shield-fill',
  compound: 'ri-stack-fill',
};

// Kind → category copy reused by the per-buff detail modal. Mirrors the
// #buffModal blurbs but tightened for the single-effect view — the "How"
// line bridges the lore label to the mechanic so a player meeting an
// effect for the first time knows what to do with it.
const BUFF_KIND_DESC = {
  rate:     'A Carrier window. Production multiplies for the duration. Multiple Carriers stack multiplicatively (×3 × ×3 = ×9).',
  luck:     'A Carry window. Adds % to Hail win-chance for the duration. Stacks additively with other Carries.',
  cushion:  'A Buffer window. Returns % of a failed Hail wager. Stacks additively with other Buffers, capped at 100%.',
  compound: 'A Resonance window. Your multiplier climbs from ×1 every second it holds. The shown value is the current state.',
};

// Named provenance for distinctive buffs minted outside the upgrade-purchase
// path. Keyed by the `sourceId` we stamp onto the buff record at spawn time.
// Falls back to the kind-category labels.
const BUFF_SOURCES = {
  wake:       { name: 'Wake',       desc: 'A standing nudge at every cycle open — the rig pings itself awake.' },
  quick_wake: { name: 'Quick Wake', desc: 'A Carrier Engraving. Each new cycle opens with the carrier already warm.' },
};

function kindName(kind) {
  if (kind === 'rate') return 'Carrier';
  if (kind === 'luck') return 'Carry';
  if (kind === 'cushion') return 'Buffer';
  if (kind === 'compound') return 'Resonance';
  return '';
}
function buffDescriptor(kind, source) {
  if (source && BUFF_SOURCES[source]) return BUFF_SOURCES[source];
  return { name: kindName(kind), desc: BUFF_KIND_DESC[kind] || '' };
}

const buffDetailModalEl = document.getElementById('buffDetailModal');
const buffDetailTitleEl = document.getElementById('buffDetailTitle');
const buffDetailBodyEl = document.getElementById('buffDetailBody');
const closeBuffDetailModal = () => buffDetailModalEl.classList.remove('open');
installTap(buffDetailModalEl, (e) => {
  if (e.target === buffDetailModalEl || e.target.closest('.bm-close')) { closeBuffDetailModal(); return; }
  if (e.target.closest('[data-act="open-buff-overview"]')) openBuffModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && buffDetailModalEl.classList.contains('open')) closeBuffDetailModal();
});

// Snapshots of the active buffs in the order they were rendered. A tap on
// a collapsed tile reads its `data-idx` and pulls the matching record.
let renderedBuffs = [];

function openBuffDetail(idx) {
  const b = renderedBuffs[idx];
  if (!b) return;
  const remain = Math.max(0, b.expiresAt - nowSeconds());
  const dur = b.duration;
  const pct = Math.max(0, Math.min(1, remain / dur));
  buffDetailTitleEl.textContent = b.title;
  buffDetailBodyEl.innerHTML = `
    <section class="bm-section kind-${b.kind}">
      <div class="bm-section-head">
        <i class="ri ${BUFF_ICONS[b.kind]}"></i>
        <span class="bm-section-name">${kindName(b.kind)}</span>
      </div>
      <p class="bm-section-desc">${b.desc}</p>
      <div class="slot-modal-row"><span>Current</span><span class="buff-val">${b.value}</span></div>
      <div class="slot-modal-row"><span>Time left</span><span>${fmtDuration(remain)}</span></div>
      <div class="slot-modal-row"><span>Duration</span><span>${fmtDuration(dur)}</span></div>
      <div class="buff-bar" style="margin-top:10px;"><div class="buff-bar-fill" style="width:${pct * 100}%"></div></div>
    </section>
    <button type="button" class="bm-link" data-act="open-buff-overview">Compare all four Window kinds <i class="ri ri-arrow-right-s-line"></i></button>
  `;
  buffDetailModalEl.classList.add('open');
}

// Tap-stable: buff-tile and buff-info both live inside #buffs and get their
// innerHTML rewritten by renderBuffs on each 100ms tick.
installTap(buffsEl, (_e, target) => {
  if (target.closest('.buff-info')) { openBuffModal(); return; }
  const tile = target.closest('.buff-tile');
  if (!tile) return;
  const idx = Number(tile.dataset.idx);
  if (Number.isInteger(idx)) openBuffDetail(idx);
});

function renderBuffs(now) {
  const items = [];
  const cards = [];
  const tiles = [];
  const b = state.buffs;
  const push = (kind, value, remain, duration, sourceId) => {
    const pct = Math.max(0, Math.min(1, remain / duration));
    const icon = BUFF_ICONS[kind] || '';
    const { name, desc } = buffDescriptor(kind, sourceId);
    const idx = items.length;
    items.push({ kind, value, duration, expiresAt: now + remain, title: name, desc });
    cards.push(`
      <div class="buff-card kind-${kind}">
        <div class="buff-head">
          <span class="buff-name"><i class="ri ri-fw ${icon}"></i>${name}</span>
          <button type="button" class="buff-info" aria-label="What does this do?"><i class="ri ri-information-line"></i></button>
          <span class="buff-val">${value}</span>
        </div>
        <div class="buff-time"><i class="ri ri-fw ri-time-line"></i> ${fmtDuration(remain)}</div>
        <div class="buff-bar"><div class="buff-bar-fill" style="width:${pct * 100}%"></div></div>
      </div>
    `);
    // Collapsed tile: background bar uses transform: scaleX so the fill is the
    // tile background itself, not a stacked element. Glyph + multiplier overlay.
    // The whole tile is the touch target.
    tiles.push(`
      <button type="button" class="buff-tile kind-${kind}" data-idx="${idx}" aria-label="${name} ${value}">
        <div class="buff-tile-bar" style="transform: scaleX(${pct});"></div>
        <div class="buff-tile-fg">
          <i class="ri ri-fw ${icon} buff-tile-glyph"></i>
          <span class="buff-tile-val">${value}</span>
        </div>
      </button>
    `);
  };
  const active = (list) => list.filter((x) => x.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
  for (const x of active(b.rateMul))       push('rate',     `×${x.value}`,                                          x.expiresAt - now, x.duration, x.sourceId);
  for (const x of active(b.gambleLuck))    push('luck',     `+${Math.round(x.value * 100)}%`,                       x.expiresAt - now, x.duration, x.sourceId);
  for (const x of active(b.gambleCushion)) push('cushion',  `${Math.round(x.value * 100)}%`,                        x.expiresAt - now, x.duration, x.sourceId);
  for (const x of active(b.compound))      push('compound', `×${Math.pow(1 + x.rate, now - x.startedAt).toFixed(2)}`, x.expiresAt - now, x.duration, x.sourceId);
  renderedBuffs = items;
  buffsEl.style.display = items.length ? 'flex' : 'none';
  buffsEl.innerHTML = cards.join('') + tiles.join('');
}

const META_DEFS = {
  metaStrength: { kind: 'strength', icon: 'ri-flashlight-line',    fmt: (v) => `×${v}` },
  metaDuration: { kind: 'duration', icon: 'ri-time-line',          fmt: (v) => `×${v}` },
  metaLuck:     { kind: 'luck',     icon: 'ri-sparkling-2-line',   fmt: (v) => `+${Math.round(v * 100)}%` },
};

function renderMetaBuffs(now) {
  const b = state.buffs;
  if (!b.metaStrength && !b.metaDuration && !b.metaLuck) {
    metaBuffsEl.style.display = 'none';
    return;
  }
  const pills = [];
  for (const key of ['metaStrength', 'metaDuration', 'metaLuck']) {
    const def = META_DEFS[key];
    const list = (b[key] || []).filter((x) => x.expiresAt > now)
      .sort((a, c) => a.expiresAt - c.expiresAt);
    for (const x of list) {
      const remain = Math.max(0, x.expiresAt - now);
      const pct = Math.max(0, Math.min(1, remain / x.duration));
      pills.push(`
        <span class="meta-pill kind-${def.kind}">
          <span class="meta-bar" style="transform: scaleX(${pct});"></span>
          <span class="meta-fg">
            <i class="ri ${def.icon}"></i>
            <span class="meta-val">${def.fmt(x.value)}</span>
            <span class="meta-time">${fmtDuration(remain)}</span>
          </span>
        </span>
      `);
    }
  }
  metaBuffsEl.style.display = pills.length ? 'flex' : 'none';
  setHtmlIfChanged(metaBuffsEl, pills.join(''));
}

const anomalyEl = document.getElementById('anomalyCounter');
let _anomalyLast = -1;
function renderAnomaly() {
  if (!anomalyEl) return;
  const n = (state.messages && state.messages.stats && state.messages.stats.anomaly) || 0;
  if (n === _anomalyLast) return;
  _anomalyLast = n;
  // Zero-padded 4 digits: visually quiet, escalates without changing layout.
  anomalyEl.textContent = n > 0 ? String(n).padStart(4, '0') : '';
}

renderShop();

const interstitialUi = makeInterstitialUi(state, (id) => {
  // After the welcome set closes, schedule the in-theme tutorial. Also fires
  // on every other close — but scheduleTutorialIfEligible is idempotent and
  // gated on welcome.shown && !tutorial_open.shown && cycle === 1, so it is
  // a no-op once the tutorial has been seen.
  if (id === 'welcome') scheduleTutorialIfEligible(state);
});
// Returning players who saw welcome on a previous session but never reached
// the tutorial beat: schedule it now. (The gate inside the scheduler refuses
// to fire it twice.)
scheduleTutorialIfEligible(state);
interstitialUi.drain();

let last = performance.now();
let lastWall = nowSeconds();
let lastHud = 0;
let lastSave = 0;
const SAVE_INTERVAL_MS = 5000;
function tick(raf) {
  const dt = Math.min(0.1, (raf - last) / 1000);
  const dtMs = raf - last;
  last = raf;
  const t = nowSeconds();
  const wallDt = Math.max(0, t - lastWall);
  lastWall = t;

  // Network discovery + ripening pass runs before rate integration so any
  // status changes are reflected in this frame's accrual.
  const losses = tickNetwork(state, wallDt, t);
  for (const r of losses) {
    const sLabel = (SECTORS[r.sector] && SECTORS[r.sector].label) || r.sector;
    showToast(`ComDef pulled a relay in ${sLabel}.`);
  }
  // Sparse-only Bleed drip — isolated relays drop ambient Echoes per their
  // tier's period. Credited directly to balance, no permMul. Visual feedback
  // through the chip so the player sees the sparse-only payoff land.
  const drip = tickBleedDrip(state, wallDt, t);
  if (drip > 0) {
    state.amount += drip;
    networkUi.flashBleed(drip);
  }

  const rate = effectiveRate(state, t);
  const baseRate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  // Use closed-form integral over wall-clock so backgrounded tabs (where rAF
  // throttles to ~1Hz) and resumes from sleep don't undercount production.
  // Also handles buff start/expiry transitions inside the window.
  // Guard against non-finite accrual — JSON.stringify turns NaN/Infinity into
  // null, so a single bad tick would wipe the balance to 0 on next load.
  const accrual = integrateRate(state, t - wallDt, t);
  if (Number.isFinite(accrual)) state.amount += accrual;
  else console.warn('integrateRate produced non-finite value', accrual);
  checkAmount(state, state.amount);
  // Reflect cycle-complete on the top-right contact-log button. Cheap; just
  // a class toggle. Drives the green pulse + the "ready" hint inside the modal.
  contactLogUi.updateAffordance();

  display.update(state.amount, rate, t, dt);
  hero.update(state.amount, rate, baseRate, dt);
  // Belt-and-braces: an exception inside the interstitial system must not
  // kill the rAF loop. A frozen game-loop ("things stop flowing until I
  // reload") was previously possible if a bad def or step-text producer
  // threw inside tick/drain.
  try { interstitialUi.tick(dtMs); } catch (e) { console.warn('interstitial tick threw', e); }
  try { interstitialUi.drain(); } catch (e) { console.warn('interstitial drain threw', e); }

  if (raf - lastHud > 100) {
    renderShop();
    renderBuffs(t);
    renderMetaBuffs(t);
    renderAnomaly();
    networkUi.refresh();
    lastHud = raf;
  }
  if (raf - lastSave > SAVE_INTERVAL_MS) {
    saveState(state);
    lastSave = raf;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener('beforeunload', () => saveState(state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveState(state);
});
