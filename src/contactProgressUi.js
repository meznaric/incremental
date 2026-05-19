// Contact Progress Bar — a strip below the column display, above the shop.
//
// Surfaces the same "next contact at X Echoes" math the Contact Log modal
// already shows, but rendered as a flowing signal line between two anchors:
// a planet glyph on the left (the destination world) and Kalen's radar on
// the right (the rig). The next contact's portrait floats along the wavy
// signal line — its horizontal position reflects current progress toward
// the next milestone.
//
// The signal line itself is a canvas-rendered procedural waveform tuned to
// read as a voice signal: multi-harmonic traveling waves modulated by an
// `energy` envelope. Growth of peakAmount injects energy; the envelope
// decays exponentially so the line settles to flat like a guitar string when
// the player stops climbing. Bright "carrier" sparks (the same warm amber
// glyph as the intro-gate sweep) periodically traverse the line while energy
// is non-zero, giving a sense of movement from world to rig.
//
// Visibility gate: only shown after the player has made their first contact
// in EP1 (state.contactLog.worlds.length > 0 || contactLog.firstContactSeen).
// Once every contact-bearing milestone in the current EP has been crossed
// (nextContactMilestone(state) === null) the strip swaps the traveler for a
// lore line nudging the player toward Close the Cycle.

import { worldFor } from './contactLog.js';
import { nextContactMilestone, currentMilestones } from './interstitial.js';
import { installTap } from './tap.js';

// voice: Kalen. Single line, italic. Rotated per session so a player who lingers
// on the closed cycle for hours sees the rig speak once, not every poll.
const FINALE_COPY = [
  'Every name in the cycle is on the log. The dark is, briefly, full. Close the cycle — let what was heard become mass.',
  'Ten worlds answered. Nothing else this side of the rest. Close the cycle. The rig will keep the warmth.',
  'I have heard everyone who was going to speak. The carrier is at the brim. The rest of the climb is for the engravings.',
  'The catalogue for this cycle is shut. Close it. What carries forward, carries.',
];

const AMPLITUDE_SCALE = 0.5;       // 1 means it goes to the edge of the canvas
// Wave/signal tuning. Constants live next to the code per CLAUDE.md.
const STRING_NODES = 100;           // resolution of the rendered polyline
// Guitar-string envelope: bumped hard every frame the player's peak is growing,
// decays exponentially when idle. Tuned so active climbing saturates near 1.0
// and a stall settles to a flat line in ~2s.
const ENERGY_DECAY = 1.8;
const ENERGY_GAIN_PER_GROWTH_FRAME = 0.02;
// Traveling-wave shape. Temporal × spatial frequency mix gives the wave its
// motion: cycles_per_sec advances phase in time, spatial_freq sets how many
// wavelengths fit across the strip. Bigger spatial_freq → reads more clearly
// as a wave passing through, less as a single bump.
const WAVE_CYCLES_PER_SEC = 1.66;
const WAVE_SPATIAL_FREQ = 24.0;
const CHARGE_PERIOD = 1.55;         // seconds between sparks while energising
const CHARGE_TRAVEL = 1.20;         // seconds for a spark to cross the line

export function initContactProgressUi(state, deps = {}) {
  const { openNames, openCycle, openRig, getAffordance } = deps;
  let root = document.getElementById('contactProgress');
  if (!root) {
    root = document.createElement('div');
    root.id = 'contactProgress';
    document.body.appendChild(root);
  }
  root.className = 'cp-root';
  // The strip's three segments are interactive tab targets — drop the
  // aria-hidden so screen readers can reach them via the named buttons.
  root.removeAttribute('aria-hidden');
  root.innerHTML = `
    <button type="button" class="cp-edge cp-edge-left" aria-label="Open Names">
      <div class="cp-edge-glow"></div>
      <i class="ri ri-planet-line"></i>
    </button>
    <button type="button" class="cp-track" aria-label="Open Cycle">
      <canvas class="cp-wave" aria-hidden="true"></canvas>
      <div class="cp-traveler" aria-hidden="true">
        <div class="cp-traveler-bob">
          <img class="cp-traveler-img" alt="" />
          <div class="cp-traveler-fallback" aria-hidden="true"></div>
        </div>
      </div>
      <div class="cp-finale" aria-hidden="true"></div>
    </button>
    <button type="button" class="cp-edge cp-edge-right" aria-label="Open Rig">
      <div class="cp-edge-glow"></div>
      <i class="ri ri-radar-line"></i>
    </button>
  `;
  const leftEl = root.querySelector('.cp-edge-left');
  const trackEl = root.querySelector('.cp-track');
  const rightEl = root.querySelector('.cp-edge-right');
  if (typeof openNames === 'function') installTap(leftEl, openNames);
  if (typeof openCycle === 'function') installTap(trackEl, openCycle);
  if (typeof openRig === 'function')   installTap(rightEl, openRig);

  const travelerEl = root.querySelector('.cp-traveler');
  const travelerImg = root.querySelector('.cp-traveler-img');
  const travelerFallback = root.querySelector('.cp-traveler-fallback');
  const finaleEl = root.querySelector('.cp-finale');
  const canvas = root.querySelector('canvas.cp-wave');
  const ctx = canvas.getContext('2d');

  let lastNextId = null;
  let finaleCopy = null;
  let energy = 0;
  let lastPeak = -1;
  let timeAcc = 0;
  let nextChargeAt = CHARGE_PERIOD;
  const charges = [];
  let dpr = 1;
  // Normalised traveller position [0..1] inside the strip. Drives the wave's
  // right boundary and the spark travel distance — the wave is the energy
  // pushing the traveller, so it stops at it rather than running past.
  let travelerPct = 0;
  // Live "current" position. Tracks state.amount (which can dip after a Hail
  // loss); traveler tracks peak (which is monotonic). The current dot rides
  // the wave at this x so the player sees where their live balance sits
  // relative to the high-water mark the traveller represents.
  let currentPct = 0;

  function shouldShow() {
    const log = state.contactLog;
    if (!log) return false;
    const hasWorlds = Array.isArray(log.worlds) && log.worlds.length > 0;
    return hasWorlds || !!log.firstContactSeen;
  }

  // Canvas backing-store sync — read CSS box, scale by DPR for crisp lines.
  function syncCanvas() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;
    }
    return true;
  }

  // Procedural traveling wave. The signal only exists from planet (x=0) up
  // to the traveler (x=travelerPct) — the traveler is the right anchor that
  // the wave is "pushing into." Past it the line stays flat, since that
  // segment hasn't been reached yet. A dominant carrier sine plus a small
  // higher harmonic for richness; both share a phase that advances in time
  // and propagates +x. The taper uses the position normalised within the
  // active 0..travelerPct segment so the wave always fades into the planet
  // and the traveler regardless of how far along the traveler has crawled.
  function sample(xNorm) {
    if (energy < 0.005) return 0;
    if (xNorm >= travelerPct || travelerPct < 0.01) return 0;
    const local = xNorm / travelerPct;
    const taper = Math.min(1, local * 5) * Math.min(1, (1 - local) * 5);
    // Wavelength stays fixed in global space so the wave reads as a moving
    // signal flowing through, not a stretched standing pattern.
    const phase = (timeAcc * WAVE_CYCLES_PER_SEC - xNorm * WAVE_SPATIAL_FREQ) * Math.PI * 2;
    const w = Math.sin(phase) * 0.92 + Math.sin(phase * 2.3 + 1.7) * 0.18;
    return w * taper * energy;
  }

  function step(dt) {
    timeAcc += dt;
    // The whole point of the wave is to surface "we're climbing right now."
    // peakAmount is monotonic across the cycle, so growing-frame detection is
    // equivalent to "the player's number has just gone up." Constant-bump
    // drive while growing → energy saturates near 1; exponential decay when
    // idle → the string rings down and settles flat.
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    if (lastPeak < 0) lastPeak = peak;
    if (peak > lastPeak) {
      energy = Math.min(1, energy + ENERGY_GAIN_PER_GROWTH_FRAME);
    }
    lastPeak = peak;
    energy *= Math.exp(-dt * ENERGY_DECAY);

    // Sparks: only fire while there's signal to ride.
    if (energy > 0.04 && timeAcc > nextChargeAt) {
      charges.push({ t: 0 });
      nextChargeAt = timeAcc + CHARGE_PERIOD;
    }
    for (let i = charges.length - 1; i >= 0; i--) {
      charges[i].t += dt;
      if (charges[i].t > CHARGE_TRAVEL) charges.splice(i, 1);
    }
  }

  function render() {
    if (!syncCanvas()) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!root.classList.contains('cp-visible') || root.classList.contains('cp-finale-on')) return;

    const midY = H / 2;
    // The canvas is intentionally taller than the strip (see contactProgress.css)
    // so the wave can swing well past the strip's box. Amplitude caps just
    // shy of the canvas half-height so peaks never clip.
    const amp = H * 0.25 * AMPLITUDE_SCALE;

    // Single stroke — keep the wave line simple so the sparks read as the
    // brighter element. shadowBlur gives the warm bloom around the line.
    ctx.lineWidth = 1.4 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(212, 154, 85, 0.85)';
    ctx.shadowColor = 'rgba(212, 154, 85, 0.55)';
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    for (let i = 0; i < STRING_NODES; i++) {
      const xNorm = i / (STRING_NODES - 1);
      const px = xNorm * W;
      const py = midY + sample(xNorm) * amp;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Live "current" dot — sits where state.amount maps onto the same
    // milestone band as the traveller. Tracks the wave's y so it bobs with
    // the signal. Kept small and bright; reads as "where am I right now"
    // distinct from the bigger traveller portrait that marks the high mark.
    if (currentPct > 0.005) {
      const px = currentPct * W;
      const py = midY + sample(currentPct) * amp;
      const haloR = 8 * dpr;
      const halo = ctx.createRadialGradient(px, py, 0, px, py, haloR);
      halo.addColorStop(0, 'rgba(255, 235, 200, 0.9)');
      halo.addColorStop(1, 'rgba(212, 154, 85, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(px - haloR, py - haloR, haloR * 2, haloR * 2);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 248, 220, 0.98)';
      ctx.arc(px, py, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sparks — palette matches the intro-gate sweep so the visual cue carries
    // over. Each spark is a radial glow with a tight hot core, riding the
    // wave's current y so it actually feels "on" the signal. Travel ends at
    // the traveler position — sparks visibly feed into the portrait, not past it.
    for (const c of charges) {
      const p = Math.min(1, c.t / CHARGE_TRAVEL);
      const xNorm = p * travelerPct;
      const px = xNorm * W;
      const py = midY + sample(xNorm) * amp;
      const alpha = Math.sin(Math.PI * p); // ease-in/out fade
      const r = 14 * dpr;
      const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, `rgba(255, 235, 195, ${alpha * 0.95})`);
      grd.addColorStop(0.35, `rgba(255, 200, 130, ${alpha * 0.55})`);
      grd.addColorStop(1, 'rgba(255, 180, 100, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
      // Hot core dot so the spark reads as a discrete charge, not just blur.
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 245, 220, ${alpha * 0.95})`;
      ctx.arc(px, py, 1.8 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function update(dt) {
    const visible = shouldShow();
    root.classList.toggle('cp-visible', visible);
    if (!visible) return;

    // Affordance pulse states pulled fresh per tick from contactLogUi.
    // cycleReady drives the center wave pulse; namesUnread drives the left
    // planet pulse. Missing affordance source = silent strip, no pulses.
    if (typeof getAffordance === 'function') {
      const a = getAffordance() || {};
      trackEl.classList.toggle('is-ready', !!a.cycleReady);
      leftEl.classList.toggle('is-unread', !!a.namesUnread);
    }

    const next = nextContactMilestone(state);
    if (!next) {
      // Cycle catalogue exhausted — swap the traveller for a single lore line.
      // Rotate the line on first hit per session so a long lingerer doesn't
      // stare at the same sentence.
      if (!finaleCopy) finaleCopy = FINALE_COPY[Math.floor(Math.random() * FINALE_COPY.length)];
      root.classList.add('cp-finale-on');
      finaleEl.textContent = finaleCopy;
      step(dt || 0);
      render();
      return;
    }
    root.classList.remove('cp-finale-on');
    finaleCopy = null;

    const def = worldFor(state.contactLog, next.id);
    if (def && def.id !== lastNextId) {
      lastNextId = def.id;
      if (def.image) {
        travelerImg.src = def.image;
        travelerImg.alt = def.name || '';
        travelerImg.style.display = '';
        travelerFallback.style.display = 'none';
        travelerImg.onerror = () => {
          travelerImg.style.display = 'none';
          travelerFallback.style.display = '';
        };
      } else {
        travelerImg.removeAttribute('src');
        travelerImg.style.display = 'none';
        travelerFallback.style.display = '';
      }
    }

    // Same calc as cl-progress in contactLogUi: measure peak against the
    // previous milestone, not zero, so the bar resets at each contact.
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    let prev = 0;
    for (const m of currentMilestones(state.contactLog)) {
      if (m.id === next.id) break;
      if (worldFor(state.contactLog, m.id)) prev = m.at;
    }
    const span = Math.max(1, next.at - prev);
    const pct = Math.max(0, Math.min(1, (peak - prev) / span));
    travelerEl.style.left = (pct * 100).toFixed(2) + '%';
    travelerPct = pct;
    // currentPct shares the same milestone band so it sits on the same axis
    // as the traveller. Clamped to [0, travelerPct] — by definition the live
    // balance can't be ahead of the peak that the traveller represents.
    const liveAmount = state.amount || 0;
    currentPct = Math.max(0, Math.min(travelerPct, (liveAmount - prev) / span));

    step(dt || 0);
    render();
  }

  return { update };
}
