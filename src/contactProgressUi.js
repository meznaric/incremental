// Contact Progress Bar — a strip below the column display, above the shop.
//
// Surfaces the same "next contact at X Echoes" math the Contact Log modal
// already shows, but rendered as a flowing signal line between two anchors:
// a planet glyph on the left (the destination world) and Kalen's radar on
// the right (the rig). The next contact's portrait floats along the wavy
// signal line — its horizontal position reflects current progress toward
// the next milestone.
//
// Visibility gate: only shown after the player has made their first contact
// in EP1 (state.contactLog.worlds.length > 0 || contactLog.firstContactSeen).
// Once every contact-bearing milestone in the current EP has been crossed
// (nextContactMilestone(state) === null) the strip swaps the traveler for a
// lore line nudging the player toward Close the Cycle.

import { worldFor } from './contactLog.js';
import { nextContactMilestone, currentMilestones } from './interstitial.js';

// voice: Kalen. Single line, italic. Rotated per session so a player who lingers
// on the closed cycle for hours sees the rig speak once, not every poll.
const FINALE_COPY = [
  'Every name in the cycle is on the log. The dark is, briefly, full. Close the cycle — let what was heard become mass.',
  'Ten worlds answered. Nothing else this side of the rest. Close the cycle. The rig will keep the warmth.',
  'I have heard everyone who was going to speak. The carrier is at the brim. The rest of the climb is for the engravings.',
  'The catalogue for this cycle is shut. Close it. What carries forward, carries.',
];

export function initContactProgressUi(state) {
  let root = document.getElementById('contactProgress');
  if (!root) {
    root = document.createElement('div');
    root.id = 'contactProgress';
    document.body.appendChild(root);
  }
  root.className = 'cp-root';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="cp-edge cp-edge-left" aria-hidden="true">
      <div class="cp-edge-glow"></div>
      <i class="ri ri-planet-line"></i>
    </div>
    <div class="cp-track">
      <div class="cp-wave" aria-hidden="true"></div>
      <div class="cp-traveler">
        <div class="cp-traveler-bob">
          <img class="cp-traveler-img" alt="" />
          <div class="cp-traveler-fallback" aria-hidden="true"></div>
        </div>
      </div>
      <div class="cp-finale" aria-hidden="true"></div>
    </div>
    <div class="cp-edge cp-edge-right" aria-hidden="true">
      <div class="cp-edge-glow"></div>
      <i class="ri ri-radar-line"></i>
    </div>
  `;

  const travelerEl = root.querySelector('.cp-traveler');
  const travelerImg = root.querySelector('.cp-traveler-img');
  const travelerFallback = root.querySelector('.cp-traveler-fallback');
  const finaleEl = root.querySelector('.cp-finale');

  let lastNextId = null;
  let finaleCopy = null;

  function shouldShow() {
    const log = state.contactLog;
    if (!log) return false;
    const hasWorlds = Array.isArray(log.worlds) && log.worlds.length > 0;
    return hasWorlds || !!log.firstContactSeen;
  }

  function update() {
    const visible = shouldShow();
    root.classList.toggle('cp-visible', visible);
    if (!visible) return;

    const next = nextContactMilestone(state);
    if (!next) {
      // Cycle catalogue exhausted — swap the traveller for a single lore line.
      // Rotate the line on first hit per session so a long lingerer doesn't
      // stare at the same sentence.
      if (!finaleCopy) finaleCopy = FINALE_COPY[Math.floor(Math.random() * FINALE_COPY.length)];
      root.classList.add('cp-finale-on');
      finaleEl.textContent = finaleCopy;
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
  }

  return { update };
}
