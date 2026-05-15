// Cycle Pattern selector — the post-cycle-close choice screen.
//
// Shown on a fresh cycle boot when the Contact Log carries
// `pendingPatternChoice`. Blocks input until the player taps a card. After a
// pick, the chosen pattern's one-time effects are seeded (free purchases,
// rate-mul buffs) and the modal closes.
//
// voice: Sera (procedural, second person). The introductory line is hers.
import { PATTERNS, setActivePattern, applyPatternOnFreshBoot } from './cyclePatterns.js';
import { saveContactLog } from './contactLog.js';
import { nowSeconds } from './save.js';

export function showPatternSelect(state, onPicked) {
  const modal = document.getElementById('patternModal');
  if (!modal) return false;
  const introEl = modal.querySelector('.pat-intro');
  const listEl = modal.querySelector('.pat-list');

  if (introEl) {
    // Sera. Two procedural sentences. The frame the rig comes up in is hers
    // to call this run — she lays out the four cuts and lets Kalen pick.
    introEl.textContent =
      'The rig boots cold and the wires still hold the shape of the last cycle. '
      + 'Choose a Pattern for this one.';
  }

  if (listEl) {
    listEl.innerHTML = PATTERNS.map((p) => `
      <li>
        <button type="button" class="pat-item" data-id="${p.id}">
          <span class="pat-name">${p.name}</span>
          <span class="pat-desc">${p.desc}</span>
          <span class="pat-effect">${p.gameplay}</span>
        </button>
      </li>
    `).join('');
  }

  function onClick(e) {
    const btn = e.target.closest('.pat-item');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!setActivePattern(state.contactLog, id)) return;
    saveContactLog(state.contactLog);
    // Seed one-time effects (buffs, free-purchase charges) now that we know
    // the pick. nowSeconds() so any seeded buff aligns with the live clock.
    applyPatternOnFreshBoot(state, nowSeconds());
    modal.classList.remove('open');
    modal.removeEventListener('click', onClick);
    if (typeof onPicked === 'function') onPicked(id);
  }
  modal.addEventListener('click', onClick);
  modal.classList.add('open');
  return true;
}
