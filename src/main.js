import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { formatAbbrev, formatGrouped, parseAmount } from './bignum.js';

const state = {
  amount: 0,
  perSecond: 0,
};

const canvas = document.getElementById('canvas');
const amountInput = document.getElementById('amountInput');
const rateInput = document.getElementById('rateInput');
const dbgAbbrev = document.getElementById('dbgAbbrev');
const dbgGrouped = document.getElementById('dbgGrouped');
const dbgScientific = document.getElementById('dbgScientific');

amountInput.value = '0';
rateInput.value = '5';
state.amount = parseAmount(amountInput.value);
state.perSecond = parseAmount(rateInput.value);

amountInput.addEventListener('input', () => {
  state.amount = parseAmount(amountInput.value);
});
rateInput.addEventListener('input', () => {
  state.perSecond = parseAmount(rateInput.value);
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

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  state.amount += state.perSecond * dt;

  display.update(state.amount, t, dt);

  dbgAbbrev.textContent = formatAbbrev(state.amount);
  dbgGrouped.textContent = formatGrouped(state.amount);
  dbgScientific.textContent = state.amount.toExponential(3);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
