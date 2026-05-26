// Updates UI — modal listing, menu wiring, unseen-dot affordance.
// Mirrors achievementsUi.js: pure logic in updates.js, this file owns DOM.
//
// Entry: initUpdatesUi() returns { open, close, refresh, updateAffordance,
// markAllSeen }. Self-contained — no game state, no save dependency.

import {
  UPDATES, currentUpdateDate, loadUpdates, saveUpdates,
  hasUnreadUpdates, markAllSeen as pureMarkAllSeen,
  initialiseUpdatesWatermark,
} from './updates.js';
import { installTap } from './tap.js';

export function initUpdatesUi() {
  const modal = document.getElementById('updatesModal');
  const menu = document.getElementById('menu');
  const menuToggle = document.getElementById('menuToggle');
  const menuItem = document.querySelector('[data-action="open-updates"]');
  if (!modal) return stubApi();
  const listEl = modal.querySelector('.up-list');
  const versionEl = modal.querySelector('.up-version');
  const labelEl = menuItem ? menuItem.querySelector('.menu-item-label') : null;

  // Hold the watermark in module scope so refresh() and updateAffordance()
  // share one source of truth. Persistence is owned here: any mutation flows
  // through persist() so a reload always reflects what was last shown.
  let u = loadUpdates();
  if (initialiseUpdatesWatermark(u)) persist();

  function persist() { saveUpdates(u); }

  function render() {
    const v = currentUpdateDate();
    if (versionEl) versionEl.textContent = v ? `Version ${v}` : '';
    if (!listEl) return;
    if (!UPDATES.length) {
      listEl.innerHTML = '<p class="up-empty">No updates yet.</p>';
      return;
    }
    const watermark = u.lastSeenDate;
    listEl.innerHTML = UPDATES.map((entry) => {
      const fresh = !watermark || entry.date > watermark;
      const cls = ['up-entry'];
      if (entry.highlight) cls.push('is-highlight');
      if (fresh) cls.push('is-fresh');
      return `
        <article class="${cls.join(' ')}">
          <header class="up-entry-head">
            <span class="up-entry-date">${escapeHtml(entry.date)}</span>
            <span class="up-entry-title">${escapeHtml(entry.title)}</span>
            ${fresh ? '<span class="up-entry-new">NEW</span>' : ''}
          </header>
          <p class="up-entry-body">${escapeHtml(entry.body)}</p>
        </article>
      `;
    }).join('');
  }

  function open() {
    render();
    modal.classList.add('open');
    if (pureMarkAllSeen(u)) {
      persist();
      updateAffordance();
      // Drop the NEW chips off the just-opened list without a re-render flicker.
      for (const el of listEl.querySelectorAll('.up-entry.is-fresh')) {
        el.classList.remove('is-fresh');
        const chip = el.querySelector('.up-entry-new');
        if (chip) chip.remove();
      }
    }
  }

  function close() { modal.classList.remove('open'); }

  function updateAffordance() {
    const unread = hasUnreadUpdates(u);
    if (menuItem) menuItem.classList.toggle('has-unseen', unread);
    if (labelEl) labelEl.textContent = unread ? 'New Updates' : 'Updates';
    // Use a distinct class on the menu-toggle so achievementsUi's
    // .has-unseen toggle (which clobbers on every refresh) doesn't fight
    // ours. styles/updates.css carries a parallel pulse rule for this class.
    if (menuToggle) menuToggle.classList.toggle('has-unseen-up', unread);
  }

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  if (menuItem) installTap(menuItem, () => {
    if (menu) menu.classList.remove('open');
    open();
  });

  updateAffordance();

  return { open, close, refresh: render, updateAffordance, markAllSeen: () => {
    if (pureMarkAllSeen(u)) { persist(); updateAffordance(); }
  } };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stubApi() {
  const noop = () => {};
  return { open: noop, close: noop, refresh: noop, updateAffordance: noop, markAllSeen: noop };
}
