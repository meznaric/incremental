import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { formatAbbrev, formatGrouped, parseAmount } from './bignum.js';
import { getUpgrade, costFor } from './upgrades.js';
import { makeShopState, effectiveRate, tryBuy, tryDrop, DROP_PCT } from './shop.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  ...makeShopState(),
};

const canvas = document.getElementById('canvas');
const amountInput = document.getElementById('amountInput');
const rateInput = document.getElementById('rateInput');
const dbgAbbrev = document.getElementById('dbgAbbrev');
const dbgGrouped = document.getElementById('dbgGrouped');
const dbgScientific = document.getElementById('dbgScientific');
const dbgRate = document.getElementById('dbgRate');
const slotsEl = document.getElementById('slots');
const buffsEl = document.getElementById('buffs');
const resultEl = document.getElementById('result');

amountInput.value = '0';
rateInput.value = '5';
state.amount = parseAmount(amountInput.value);
state.basePerSecond = parseAmount(rateInput.value);

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

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

const slotEls = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `
    <div class="rarity"></div>
    <div class="name"></div>
    <div class="desc"></div>
    <div class="cost"></div>
    <div class="meta"></div>
    <button class="drop" type="button"></button>
  `;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.drop')) return;
    const now = performance.now() / 1000;
    tryBuy(state, i, now);
    renderShop();
  });
  el.querySelector('.drop').addEventListener('click', (e) => {
    e.stopPropagation();
    tryDrop(state, i);
    renderShop();
  });
  slotsEl.appendChild(el);
  slotEls.push(el);
}

function renderShop() {
  const now = performance.now() / 1000;
  const rate = effectiveRate(state, now);
  for (let i = 0; i < 4; i++) {
    const id = state.shop.slots[i];
    const u = getUpgrade(id);
    const el = slotEls[i];
    if (!u) { el.style.display = 'none'; continue; }
    el.style.display = '';
    const cost = costFor(u, { balance: state.amount, rate, owned: state.owned });
    const cdLeft = u.kind === 'gamble' ? (state.gambleCd[u.id] || 0) - now : 0;
    el.querySelector('.rarity').textContent = u.rarity;
    el.querySelector('.rarity').className = `rarity rarity-${u.rarity}`;
    el.querySelector('.name').textContent = u.name;
    el.querySelector('.desc').textContent = u.desc;
    el.querySelector('.cost').textContent = `cost ${formatAbbrev(cost)}`;
    let meta = '';
    if (u.kind === 'gamble' && cdLeft > 0) meta = `cooldown ${cdLeft.toFixed(1)}s`;
    else if (u.kind === 'permanent' && state.owned[u.id]) meta = `owned ×${state.owned[u.id]}`;
    el.querySelector('.meta').textContent = meta;
    el.querySelector('.drop').textContent = `drop ${formatAbbrev(state.amount * DROP_PCT)}`;
    const canAfford = state.amount >= cost;
    el.classList.toggle('locked', !canAfford || cdLeft > 0);
  }
}

function renderBuffs(now) {
  const rows = [];
  const b = state.buffs;
  if (now < b.rateMul.expiresAt) rows.push([`rate ×${b.rateMul.value}`, b.rateMul.expiresAt - now]);
  if (now < b.gambleLuck.expiresAt) rows.push([`luck +${Math.round(b.gambleLuck.value * 100)}%`, b.gambleLuck.expiresAt - now]);
  if (now < b.gambleCushion.expiresAt) rows.push([`cushion ${Math.round(b.gambleCushion.value * 100)}%`, b.gambleCushion.expiresAt - now]);
  if (now < b.compound.expiresAt) {
    const cur = Math.pow(1 + b.compound.rate, now - b.compound.startedAt);
    rows.push([`compound ×${cur.toFixed(2)}`, b.compound.expiresAt - now]);
  }
  buffsEl.style.display = rows.length ? '' : 'none';
  buffsEl.innerHTML = rows.map(([name, t]) =>
    `<div class="buff-row"><span>${name}</span><span class="time">${t.toFixed(1)}s</span></div>`
  ).join('');
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

let last = performance.now();
let lastHud = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  const rate = effectiveRate(state, t);
  state.amount += rate * dt;

  display.update(state.amount, t, dt);

  if (now - lastHud > 100) {
    dbgAbbrev.textContent = formatAbbrev(state.amount);
    dbgGrouped.textContent = formatGrouped(state.amount);
    dbgScientific.textContent = state.amount.toExponential(3);
    dbgRate.textContent = formatAbbrev(rate) + '/s';
    renderShop();
    renderBuffs(t);
    renderResult(t);
    lastHud = now;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
