import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { HeroDisplay } from './hero.js';
import { formatAbbrev, parseAmount } from './bignum.js';
import { resolveUpgrade, KIND_THEME, kindLabel, getUpgrade, buildSlot } from './upgrades.js';
import {
  makeShopState, effectiveRate, integrateRate, tryBuy, validateSlate,
  tryReroll, tryUnlockSlot, tryUnlockReroll, tryUnlockPin, tryTogglePin,
  nextSlotUnlockCost, computeRerollCost,
  REROLL_UNLOCK_COST, REROLL_UNLOCK_AT, PIN_UNLOCK_COST, PIN_UNLOCK_AT,
} from './shop.js';
import { loadState, saveState, nowSeconds } from './save.js';
import { checkStart, checkAmount } from './interstitial.js';
import { makeInterstitialUi } from './interstitialUi.js';
import { initMenu } from './menu.js';
import { loadContactLog, saveContactLog, backfillFromShown } from './contactLog.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  ...makeShopState(),
  // The Contact Log persists across save resets — it is the run-accumulating
  // narrative state, separate from the gameplay save.
  contactLog: loadContactLog(),
};

initMenu(state);

const canvas = document.getElementById('canvas');
const amountInput = document.getElementById('amountInput');
const rateInput = document.getElementById('rateInput');
const slotsEl = document.getElementById('slots');
const buffsEl = document.getElementById('buffs');
const buffModalEl = document.getElementById('buffModal');
const resultEl = document.getElementById('result');

const openBuffModal = () => buffModalEl.classList.add('open');
const closeBuffModal = () => buffModalEl.classList.remove('open');
buffsEl.addEventListener('click', (e) => {
  if (e.target.closest('.buff-info')) openBuffModal();
});
buffModalEl.addEventListener('click', (e) => {
  if (e.target === buffModalEl || e.target.closest('.bm-close')) closeBuffModal();
});

const slotModalEl = document.getElementById('slotModal');
const slotModalTitleEl = document.getElementById('slotModalTitle');
const slotModalBodyEl = document.getElementById('slotModalBody');
const closeSlotModal = () => slotModalEl.classList.remove('open');
slotModalEl.addEventListener('click', (e) => {
  if (e.target === slotModalEl || e.target.closest('.bm-close')) closeSlotModal();
});
function openSlotModal(idx) {
  const slot = state.shop.slots[idx];
  const u = slot ? resolveUpgrade(slot) : null;
  if (!u || !slot) return;
  const theme = KIND_THEME[u.kind] || {};
  slotModalTitleEl.textContent = u.name;
  const costCell = u.kind === 'gift' ? 'FREE' : `<span class="cc">${ECHO_ICON}${formatAbbrev(slot.cost)}</span>`;
  const rows = [`<div class="slot-modal-row"><span>Cost</span><span>${costCell}</span></div>`];
  if (u.kind === 'gamble') {
    rows.push(
      `<div class="slot-modal-row"><span>Carry chance</span><span>${fmtPct(u.chance)}</span></div>`,
      `<div class="slot-modal-row"><span>Return</span><span>${u.payout}× wager</span></div>`,
      `<div class="slot-modal-row"><span>Cooldown</span><span>${u.cooldown}s</span></div>`,
    );
  } else if (u.kind === 'convert') {
    rows.push(`<div class="slot-modal-row"><span>Yields</span><span>+${formatAbbrev(slot.cost * u.ratio)} Echoes/s</span></div>`);
  } else if (u.kind === 'buff') {
    rows.push(`<div class="slot-modal-row"><span>Duration</span><span>${u.duration}s</span></div>`);
  } else if (u.kind === 'gift') {
    rows.push(`<div class="slot-modal-row"><span>Returns</span><span class="cc">${ECHO_ICON}+${formatAbbrev(u.reward)}</span></div>`);
  }
  slotModalBodyEl.innerHTML = `
    <span class="slot-modal-tag rarity-${u.rarity}">${u.rarity} · ${kindLabel(u)}</span>
    <p class="slot-modal-desc">${u.desc}</p>
    ${rows.join('')}
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
checkStart(state, !loaded, loaded ? loaded.offline : 0);
if (loaded) {
  amountInput.value = formatAbbrev(state.amount);
  rateInput.value = formatAbbrev(state.basePerSecond);
  checkAmount(state, state.amount);
  if (loaded.offline > 1) {
    console.log(`[save] welcome back — ${loaded.offline.toFixed(0)}s away, +${formatAbbrev(loaded.earnings)}`);
  }
}

// Fill any empty slots and reroll any items that no longer fit (kind/rate gate).
// Existing slots keep their frozen cost.
validateSlate(state, nowSeconds());

// First-roll seed: slot 1 starts as the cheap starter mul (×1.5, cost ≤ 100).
// Subsequent rerolls/buys fall back to any rarity mul per SLOT_FILTERS.
// Also grant one starting buff: 3× rate for 20 seconds.
if (!loaded) {
  const ctx = { balance: state.amount, rate: state.basePerSecond, owned: state.owned };
  const starterMul = getUpgrade('mult_starter');
  if (starterMul) state.shop.slots[1] = buildSlot(starterMul, ctx);
  const t0 = nowSeconds();
  state.buffs.rateMul.push({ value: 3, duration: 20, expiresAt: t0 + 20 });
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
function markContentFresh(el) {
  el.classList.remove('fx-content');
  void el.offsetWidth;
  el.classList.add('fx-content');
}
function spawnCoinBurn(el) {
  const c = document.createElement('i');
  c.className = 'ri-broadcast-fill coin-burn';
  el.appendChild(c);
  c.addEventListener('animationend', () => c.remove(), { once: true });
  // Safety fallback if animationend doesn't fire (reduced motion hides it).
  setTimeout(() => { if (c.parentNode) c.remove(); }, 600);
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
slotsLeftBtn.addEventListener('click', () => scrollSlotsBy(-1));
slotsRightBtn.addEventListener('click', () => scrollSlotsBy(1));
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
    el.addEventListener('click', (e) => {
      const idx = slotEls.indexOf(el);
      if (e.target.closest('.pin')) {
        e.stopPropagation();
        const r = tryTogglePin(state, idx);
        if (r.ok) renderShop();
        return;
      }
      if (e.target.closest('.slot-info')) { openSlotModal(idx); return; }
      const res = tryBuy(state, idx, nowSeconds());
      if (res.ok) { playSlotFx(el, 'fx-buy'); spawnCoinBurn(el); renderShop(); markContentFresh(el); }
      else { playSlotFx(el, 'fx-reject'); }
    });
    slotsEl.appendChild(el);
    slotEls.push(el);
  }
  while (slotEls.length > state.shop.slotsUnlocked) {
    const el = slotEls.pop();
    el.remove();
  }
}

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
  'unlock-slot':   makeTbBtn('unlock-slot',   'ri-add-line'),
  'reroll':        makeTbBtn('reroll',        'ri-refresh-line'),
  'unlock-reroll': makeTbBtn('unlock-reroll', 'ri-refresh-line'),
  'unlock-pin':    makeTbBtn('unlock-pin',    'ri-pushpin-2-fill'),
};
function setTbBtn(act, visible, locked, label) {
  const b = tbButtons[act];
  b.style.display = visible ? '' : 'none';
  if (!visible) return;
  b.classList.toggle('locked', !!locked);
  setHtmlIfChanged(b.querySelector('.tb-label'), label);
}

function renderToolbar() {
  const slotCost = nextSlotUnlockCost(state);
  const slotVisible = slotCost != null;
  setTbBtn('unlock-slot', slotVisible, slotVisible && state.amount < slotCost,
    slotVisible ? `Slot ${state.shop.slotsUnlocked + 1} · <span class="cc">${ECHO_ICON}${formatAbbrev(slotCost)}</span>` : '');

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

  const pinVisible = state.shop.rerollUnlocked && !state.shop.pinUnlocked && state.amount >= PIN_UNLOCK_AT;
  setTbBtn('unlock-pin', pinVisible, pinVisible && state.amount < PIN_UNLOCK_COST,
    `Unlock Pin · <span class="cc">${ECHO_ICON}${formatAbbrev(PIN_UNLOCK_COST)}</span>`);

  const anyVisible = slotVisible || rerollUnlockVisible || rerollVisible || pinVisible;
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

toolbarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  let res;
  if (act === 'unlock-slot') res = tryUnlockSlot(state, nowSeconds());
  else if (act === 'unlock-reroll') res = tryUnlockReroll(state);
  else if (act === 'unlock-pin') res = tryUnlockPin(state);
  else if (act === 'reroll') {
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
    el.style.display = '';
    const cost = slot.cost;
    const cdLeft = u.kind === 'gamble' ? (state.gambleCd[u.id] || 0) - now : 0;
    const theme = KIND_THEME[u.kind] || {};
    el.dataset.kind = u.kind;
    el.querySelector('.kind-icon').className = `kind-icon ri ${theme.icon || ''}`;
    el.querySelector('.rarity').textContent = `${u.rarity} · ${kindLabel(u)}`;
    el.querySelector('.rarity').className = `rarity rarity-${u.rarity}`;
    el.querySelector('.name').textContent = u.name;
    el.querySelector('.desc').textContent = u.desc;
    const costHtml = u.kind === 'gift' ? 'FREE' : `${ECHO_ICON}${formatAbbrev(cost)}`;
    setHtmlIfChanged(el.querySelector('.cost'), costHtml);

    let outcomes = '';
    if (u.kind === 'gamble') {
      const winNet = cost * (u.payout - 1);
      const winPct = fmtPct(u.chance);
      const losePct = fmtPct(1 - u.chance);
      outcomes =
        `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> <span class="cc">${ECHO_ICON}+${formatAbbrev(winNet)}</span> · ${winPct}</div>` +
        `<div class="outcome lose"><i class="ri ri-arrow-down-line"></i> <span class="cc">${ECHO_ICON}−${formatAbbrev(cost)}</span> · ${losePct}</div>`;
    } else if (u.kind === 'convert') {
      outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> +${formatAbbrev(cost * u.ratio)}/s permanent</div>`;
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
  updateSlotsNav();
}

const BUFF_ICONS = {
  rate:     'ri-flashlight-fill',
  luck:     'ri-sparkling-2-fill',
  cushion:  'ri-shield-fill',
  compound: 'ri-stack-fill',
};

function renderBuffs(now) {
  const cards = [];
  const b = state.buffs;
  const push = (kind, name, value, remain, duration) => {
    const pct = Math.max(0, Math.min(1, remain / duration));
    const icon = BUFF_ICONS[kind] || '';
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
  };
  const active = (list) => list.filter((x) => x.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
  for (const x of active(b.rateMul))       push('rate',     'Carrier',   `×${x.value}`,                          x.expiresAt - now, x.duration);
  for (const x of active(b.gambleLuck))    push('luck',     'Carry',     `+${Math.round(x.value * 100)}%`,       x.expiresAt - now, x.duration);
  for (const x of active(b.gambleCushion)) push('cushion',  'Buffer',    `${Math.round(x.value * 100)}%`,        x.expiresAt - now, x.duration);
  for (const x of active(b.compound))      push('compound', 'Resonance', `×${Math.pow(1 + x.rate, now - x.startedAt).toFixed(2)}`, x.expiresAt - now, x.duration);
  buffsEl.style.display = cards.length ? 'flex' : 'none';
  buffsEl.innerHTML = cards.join('');
}

function renderResult(now) {
  const r = state.lastResult;
  if (!r) { resultEl.style.display = 'none'; return; }
  const age = now - r.at;
  if (age > 2.5) { resultEl.style.display = 'none'; return; }
  resultEl.style.display = '';
  resultEl.style.opacity = String(Math.max(0, 1 - age / 2.5));
  resultEl.className = `result ${r.won ? 'win' : 'lose'}`;
  const sign = r.delta >= 0 ? '+' : '−';
  resultEl.textContent = `${r.won ? 'WIN' : 'LOSS'} ${sign}${formatAbbrev(Math.abs(r.delta))}`;
}

renderShop();

const interstitialUi = makeInterstitialUi(state);
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

  display.update(state.amount, rate, t, dt);
  hero.update(state.amount, rate, baseRate, dt);
  interstitialUi.tick(dtMs);
  interstitialUi.drain();

  if (raf - lastHud > 100) {
    renderShop();
    renderBuffs(t);
    renderResult(t);
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
