import * as THREE from 'three';
import { formatAbbrev } from './bignum.js';

const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const COIN_GLYPH = '\ueBDB';            // ri-copper-coin-fill
const COIN_COLOR = '#d49a55';

const COLOR_AMOUNT     = '#ffffff';
const COLOR_RATE_BASE  = '#b9c1ff';
const COLOR_RATE_BUFF  = '#ff8a3a';
const COLOR_BURST      = 0xffd866;

let coinFontReady = false;
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.load('110px remixicon').then(() => { coinFontReady = true; }).catch(() => {});
}

function makeTextSprite(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.userData = { canvas, ctx, tex };
  return sprite;
}

function paintText(sprite, text, fontSize, color, glow) {
  const { canvas, ctx, tex } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 ${fontSize}px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
    ctx.fillText(text, cx, cy);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  tex.needsUpdate = true;
}

function paintTextWithCoin(sprite, text, fontSize, color, glow) {
  const { canvas, ctx, tex } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const gap = fontSize * 0.28;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.font = `700 ${fontSize}px ${FONT_MONO}`;
  const textWidth = ctx.measureText(text).width;

  let iconWidth = 0;
  if (coinFontReady) {
    ctx.font = `${fontSize}px "remixicon"`;
    iconWidth = ctx.measureText(COIN_GLYPH).width;
  }

  const total = textWidth + (iconWidth > 0 ? gap + iconWidth : 0);
  const startX = cx - total / 2;
  const textX = startX + (iconWidth > 0 ? iconWidth + gap : 0);

  if (iconWidth > 0) {
    ctx.font = `${fontSize}px "remixicon"`;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow * 0.6;
    ctx.fillStyle = color;
    ctx.fillText(COIN_GLYPH, startX, cy);
    ctx.shadowBlur = 0;
  }

  ctx.font = `700 ${fontSize}px ${FONT_MONO}`;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = color;
    ctx.fillText(text, textX, cy);
    ctx.fillText(text, textX, cy);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, textX, cy);

  tex.needsUpdate = true;
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

export class HeroDisplay {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 12;

    this.amountSprite = makeTextSprite(1024, 256);
    this.amountSprite.scale.set(13, 3.2, 1);
    this.amountSprite.position.y = 0.55;
    this.group.add(this.amountSprite);

    this.rateSprite = makeTextSprite(768, 128);
    this.rateSprite.scale.set(6.8, 1.15, 1);
    this.rateSprite.position.y = -1.45;
    this.group.add(this.rateSprite);

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

    this._amtText = null;
    this._rateText = null;
    this._renderedRateColor = null;
    this._amtPulse = 0;
    this._ratePulse = 0;
    this._burstT = 0;
    this._prevRate = 0;
    this._prevDigits = 0;
  }

  _digitsOf(amount) {
    if (amount <= 0) return 0;
    return Math.floor(Math.log10(amount)) + 1;
  }

  update(amount, rate, baseRate, dt) {
    const digits = this._digitsOf(amount);
    if (digits > this._prevDigits && this._prevDigits > 0) {
      this._burstT = 1;
      this._amtPulse = 1.0;
    }
    this._prevDigits = digits;

    if (coinFontReady && !this._fontPainted) {
      this._fontPainted = true;
      this._amtText = null;
    }

    const amtText = formatAbbrev(amount);
    if (amtText !== this._amtText) {
      this._amtText = amtText;
      paintTextWithCoin(this.amountSprite, amtText, 110, COIN_COLOR, 22);
      if (this._amtPulse < 0.25) this._amtPulse = 0.25;
    }

    const buffed = rate > baseRate * 1.001;

    if (this._prevRate > 0) {
      const ratio = rate / Math.max(this._prevRate, 1e-9);
      if (ratio > 1.4 || ratio < 0.7) this._ratePulse = 1.0;
    }
    this._prevRate = rate;

    const rateColor = buffed ? COLOR_RATE_BUFF : COLOR_RATE_BASE;
    const rateText = `${formatAbbrev(rate)}/s`;
    if (rateText !== this._rateText || rateColor !== this._renderedRateColor) {
      this._rateText = rateText;
      this._renderedRateColor = rateColor;
      paintText(this.rateSprite, rateText, 64, rateColor, 16);
    }

    this._amtPulse = Math.max(0, this._amtPulse - dt * 2.4);
    this._ratePulse = Math.max(0, this._ratePulse - dt * 2.0);

    const amtBump = 1 + this._amtPulse * 0.22;
    this.amountSprite.scale.set(13 * amtBump, 3.2 * amtBump, 1);
    this.amountSprite.position.y = 0.55 + this._amtPulse * 0.18;

    const rateBump = 1 + this._ratePulse * 0.32;
    this.rateSprite.scale.set(6.8 * rateBump, 1.15 * rateBump, 1);

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
