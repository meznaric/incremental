import * as THREE from 'three';
import { formatAbbrev } from './bignum.js';
import { PERIODS } from './periods-data.js';

const COLOR_BURST = 0xffd866;

function periodNameFor(amount) {
  if (!isFinite(amount) || amount < 1000) return '';
  let p = 0;
  let n = amount;
  while (n >= 1000 && p < PERIODS.length - 1) { n /= 1000; p++; }
  return PERIODS[p]?.name || '';
}

function makeRadialTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0,    `rgba(${rgb}, 1)`);
  g.addColorStop(0.35, `rgba(${rgb}, 0.45)`);
  g.addColorStop(1,    `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// HeroDisplay drives the top HUD (amount + rate, in the DOM) and a 3D burst
// flash that pulses when the magnitude crosses a digit boundary. The text
// itself lives in #topHud so it lays out predictably below the topbar buttons
// and can be styled / aligned per breakpoint.
export class HeroDisplay {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 12;

    this.burst = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTexture(COLOR_BURST),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      opacity: 0,
    }));
    this.burst.position.z = -0.15;
    this.burst.scale.set(0.1, 0.1, 1);
    this.group.add(this.burst);

    this.amountMainEl   = typeof document !== 'undefined' ? document.querySelector('#topHud .th-amount-main') : null;
    this.amountNumEl    = typeof document !== 'undefined' ? document.querySelector('#topHud .th-amount-num') : null;
    this.amountPeriodEl = typeof document !== 'undefined' ? document.querySelector('#topHud .th-amount-period') : null;
    this.rateEl         = typeof document !== 'undefined' ? document.querySelector('#topHud .th-rate') : null;

    this._amtText = null;
    this._periodText = null;
    this._rateText = null;
    this._burstT = 0;
    this._prevRate = 0;
    this._prevDigits = 0;
  }

  _digitsOf(amount) {
    if (amount <= 0) return 0;
    return Math.floor(Math.log10(amount)) + 1;
  }

  _restartAnimation(el, cls) {
    if (!el) return;
    el.classList.remove('th-pulse', 'th-pulse-strong');
    void el.offsetWidth;
    el.classList.add(cls);
  }

  update(amount, rate, baseRate, dt) {
    const digits = this._digitsOf(amount);
    const crossed = digits > this._prevDigits && this._prevDigits > 0;
    if (crossed) {
      this._burstT = 1;
      this._restartAnimation(this.amountMainEl, 'th-pulse-strong');
    }
    this._prevDigits = digits;

    const amtText = formatAbbrev(amount);
    if (amtText !== this._amtText) {
      this._amtText = amtText;
      if (this.amountNumEl) this.amountNumEl.textContent = amtText;
      if (!crossed) this._restartAnimation(this.amountMainEl, 'th-pulse');
    }

    const periodText = periodNameFor(amount);
    if (periodText !== this._periodText) {
      this._periodText = periodText;
      if (this.amountPeriodEl) this.amountPeriodEl.textContent = periodText;
    }

    const buffed = rate > baseRate * 1.001;
    if (this.rateEl) this.rateEl.classList.toggle('buffed', buffed);

    if (this._prevRate > 0) {
      const ratio = rate / Math.max(this._prevRate, 1e-9);
      if (ratio > 1.4 || ratio < 0.7) this._restartAnimation(this.rateEl, 'th-pulse');
    }
    this._prevRate = rate;

    const rateText = `${formatAbbrev(rate)}/s`;
    if (rateText !== this._rateText) {
      this._rateText = rateText;
      if (this.rateEl) this.rateEl.textContent = rateText;
    }

    if (this._burstT > 0) {
      this._burstT = Math.max(0, this._burstT - dt * 1.3);
      const t = 1 - this._burstT;
      const size = 5 + t * 28;
      this.burst.scale.set(size, size * 0.5, 1);
      this.burst.material.opacity = this._burstT * 0.95;
    } else if (this.burst.material.opacity !== 0) {
      this.burst.material.opacity = 0;
    }
  }
}
