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
import { installTap } from './tap.js';

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

  // Route through installTap so iOS pointercancel-as-tap-completion works and
  // the pointerdown's resolved element is what we match against (DOM under
  // the modal can churn between down and up). Bind once; route via a swappable
  // closure ref so re-shows of the modal hit their own picker.
  modal._patHandle = (downTarget) => {
    const btn = downTarget && downTarget.closest && downTarget.closest('.pat-item');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!setActivePattern(state.contactLog, id)) return;
    saveContactLog(state.contactLog);
    applyPatternOnFreshBoot(state, nowSeconds());
    modal.classList.remove('open');
    modal._patHandle = null;
    if (typeof onPicked === 'function') onPicked(id);
  };
  if (!modal._patTapBound) {
    modal._patTapBound = true;
    installTap(modal, (_e, downTarget) => {
      if (typeof modal._patHandle === 'function') modal._patHandle(downTarget);
    });
  }
  modal.classList.add('open');
  return true;
}
