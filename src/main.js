import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { HeroDisplay } from './hero.js';
import { formatAbbrev, parseAmount } from './bignum.js';
import { getUpgrade, KIND_THEME } from './upgrades.js';
import { makeShopState, effectiveRate, tryBuy, tryDrop, validateSlate } from './shop.js';
import { loadState, saveState, nowSeconds } from './save.js';
import { checkStart, checkAmount } from './interstitial.js';
import { makeInterstitialUi } from './interstitialUi.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  ...makeShopState(),
};

const canvas = document.getElementById('canvas');
const amountInput = document.getElementById('amountInput');
const rateInput = document.getElementById('rateInput');
const slotsEl = document.getElementById('slots');
const buffsEl = document.getElementById('buffs');
const resultEl = document.getElementById('result');

amountInput.value = '0';
rateInput.value = '5';
state.amount = parseAmount(amountInput.value);
state.basePerSecond = parseAmount(rateInput.value);

const loaded = loadState(state);
checkStart(state, !loaded);
if (loaded) {
  amountInput.value = formatAbbrev(state.amount);
  rateInput.value = formatAbbrev(state.basePerSecond);
  checkAmount(state, state.amount);
  if (loaded.offline > 1) {
    console.log(`[save] welcome back — ${loaded.offline.toFixed(0)}s away, +${formatAbbrev(loaded.earnings)}`);
  }
} else {
  const STARTUP_BUFF_MULT = 10;
  const STARTUP_BUFF_DURATION = 6;
  const initNow = nowSeconds();
  state.buffs.rateMul.push({
    value: STARTUP_BUFF_MULT,
    duration: STARTUP_BUFF_DURATION,
    expiresAt: initNow + STARTUP_BUFF_DURATION,
  });
}

// Fill any empty slots and reroll any items that no longer fit (kind/rate gate).
// Existing slots keep their frozen cost.
validateSlate(state, nowSeconds());

amountInput.addEventListener('input', () => {
  state.amount = parseAmount(amountInput.value);
});
rateInput.addEventListener('input', () => {
  state.basePerSecond = parseAmount(rateInput.value);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a14, 0.025);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4.5, 26);
camera.lookAt(0, 4.5, 0);

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

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

const COIN = '<i class="ri-copper-coin-fill cc-icon"></i>';

const COIN = '<i class="ri-copper-coin-fill cc-icon"></i>';

function fmtPct(p) {
  const v = p * 100;
  if (v < 1) return `${v.toFixed(2)}%`;
  if (v < 10) return `${v.toFixed(1)}%`;
  return `${v.toFixed(0)}%`;
}

const slotEls = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `
    <div class="head">
      <i class="kind-icon"></i>
      <div class="rarity"></div>
    </div>
    <div class="name"></div>
    <div class="desc"></div>
    <div class="cost"></div>
    <div class="outcomes"></div>
    <div class="meta"></div>
    <button class="drop" type="button"></button>
  `;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.drop')) return;
    tryBuy(state, i, nowSeconds());
    renderShop();
  });
  el.querySelector('.drop').addEventListener('click', (e) => {
    e.stopPropagation();
    tryDrop(state, i, nowSeconds());
    renderShop();
  });
  slotsEl.appendChild(el);
  slotEls.push(el);
}

function renderShop() {
  const now = nowSeconds();
  for (let i = 0; i < 4; i++) {
    const slot = state.shop.slots[i];
    const u = slot ? getUpgrade(slot.id) : null;
    const el = slotEls[i];
    if (!u || !slot) { el.style.display = 'none'; continue; }
    el.style.display = '';
    const cost = slot.cost;
    const cdLeft = u.kind === 'gamble' ? (state.gambleCd[u.id] || 0) - now : 0;
    const theme = KIND_THEME[u.kind] || {};
    el.dataset.kind = u.kind;
    el.querySelector('.kind-icon').className = `kind-icon ri ${theme.icon || ''}`;
    el.querySelector('.rarity').textContent = `${u.rarity} · ${theme.label || u.kind}`;
    el.querySelector('.rarity').className = `rarity rarity-${u.rarity}`;
    el.querySelector('.name').textContent = u.name;
    el.querySelector('.desc').textContent = u.desc;
    el.querySelector('.cost').innerHTML = `${COIN}${formatAbbrev(cost)} cc`;

    let outcomes = '';
    if (u.kind === 'gamble') {
      const winNet = cost * (u.payout - 1);
      const winPct = fmtPct(u.chance);
      const losePct = fmtPct(1 - u.chance);
      outcomes =
        `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> +${formatAbbrev(winNet)} cc · ${winPct}</div>` +
        `<div class="outcome lose"><i class="ri ri-arrow-down-line"></i> −${formatAbbrev(cost)} cc · ${losePct}</div>`;
    } else if (u.kind === 'convert') {
      outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> +${formatAbbrev(cost * u.ratio)}/s permanent</div>`;
    }
    el.querySelector('.outcomes').innerHTML = outcomes;

    let meta = '';
    if (u.kind === 'gamble' && cdLeft > 0) meta = `cooldown ${cdLeft.toFixed(1)}s`;
    else if (u.kind === 'permanent' && state.owned[u.id]) meta = `owned ×${state.owned[u.id]}`;
    el.querySelector('.meta').textContent = meta;
    el.querySelector('.drop').innerHTML = `drop ${COIN}${formatAbbrev(slot.dropCost)} cc`;
    const canAfford = state.amount >= cost;
    el.classList.toggle('locked', !canAfford || cdLeft > 0);
  }
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
        <div class="buff-head"><span class="buff-name"><i class="ri ri-fw ${icon}"></i>${name}</span><span class="buff-val">${value}</span></div>
        <div class="buff-time"><i class="ri ri-fw ri-time-line"></i> ${remain.toFixed(1)}s</div>
        <div class="buff-bar"><div class="buff-bar-fill" style="width:${pct * 100}%"></div></div>
      </div>
    `);
  };
  const active = (list) => list.filter((x) => x.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
  for (const x of active(b.rateMul))       push('rate',     'Rate',     `×${x.value}`,                          x.expiresAt - now, x.duration);
  for (const x of active(b.gambleLuck))    push('luck',     'Luck',     `+${Math.round(x.value * 100)}%`,       x.expiresAt - now, x.duration);
  for (const x of active(b.gambleCushion)) push('cushion',  'Cushion',  `${Math.round(x.value * 100)}%`,        x.expiresAt - now, x.duration);
  for (const x of active(b.compound))      push('compound', 'Compound', `×${Math.pow(1 + x.rate, now - x.startedAt).toFixed(2)}`, x.expiresAt - now, x.duration);
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
let lastHud = 0;
let lastSave = 0;
const SAVE_INTERVAL_MS = 5000;
function tick(raf) {
  const dt = Math.min(0.1, (raf - last) / 1000);
  const dtMs = raf - last;
  last = raf;
  const t = nowSeconds();

  const rate = effectiveRate(state, t);
  const baseRate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  state.amount += rate * dt;
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
