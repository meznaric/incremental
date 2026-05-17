// Achievements UI — modal listing, toast notifications, menu wiring.
// Pure DOM. The pure half lives in achievements.js.
//
// Entry: initAchievementsUi(state) returns:
//   open()                 — show the modal
//   close()                — hide the modal
//   refresh()              — re-render the list (e.g. after an unlock)
//   showUnlocks(ids)       — pop a stack of toasts for the given ids
//   updateAffordance()     — toggle the menu-toggle + menu-item pulse
//   markAllSeen()          — flip every unlocked id to seen + persist
//
// Persistence is owned by this module: every state mutation calls saveAchievements
// before yielding back. Reads from state.achievements (mounted by main.js).

import {
  saveAchievements, markAllSeen as pureMarkAllSeen, markSeen, hasUnseen,
  isUnlocked, isSeen, unlockedCount, totalCount,
} from './achievements.js';
import { ACHIEVEMENTS, CATEGORY_ORDER, CATEGORY_LABELS, ACH_BY_ID } from './achievements-data.js';
import { installTap } from './tap.js';

const TOAST_DURATION_MS = 4200;
const TOAST_REMOVE_MS = 5000;

export function initAchievementsUi(state) {
  const modal = document.getElementById('achievementsModal');
  const menu = document.getElementById('menu');
  const menuToggle = document.getElementById('menuToggle');
  const menuItem = document.querySelector('[data-action="open-achievements"]');
  const toastsEl = document.getElementById('toasts');
  if (!modal) return stubApi();
  const body = modal.querySelector('.ach-body');
  const listEl = modal.querySelector('.ach-list');
  const summaryEl = modal.querySelector('.ach-summary');

  function getAch() { return state.achievements; }

  function persist() { saveAchievements(getAch()); }

  function render() {
    const ach = getAch();
    const total = totalCount();
    const done = unlockedCount(ach);
    if (summaryEl) {
      summaryEl.innerHTML = `<strong>${done}</strong> of <strong>${total}</strong> recorded.`;
    }
    // Group by category, in CATEGORY_ORDER. Inside each group, declaration order
    // is preserved so number tiers read low → high.
    const groups = new Map();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const def of ACHIEVEMENTS) {
      if (!groups.has(def.category)) groups.set(def.category, []);
      groups.get(def.category).push(def);
    }
    const sections = [];
    for (const cat of [...CATEGORY_ORDER, ...[...groups.keys()].filter((k) => !CATEGORY_ORDER.includes(k))]) {
      const list = groups.get(cat) || [];
      if (!list.length) continue;
      const groupDone = list.filter((d) => isUnlocked(ach, d.id)).length;
      const rows = list.map((d) => renderEntry(d, ach)).join('');
      sections.push(`
        <section class="ach-group">
          <div class="ach-group-head">
            <span class="ach-group-name">${CATEGORY_LABELS[cat] || cat}</span>
            <span class="ach-group-count">${groupDone} / ${list.length}</span>
          </div>
          <ul class="ach-group-list">${rows}</ul>
        </section>
      `);
    }
    listEl.innerHTML = sections.join('');
  }

  function renderEntry(def, ach) {
    const unlocked = isUnlocked(ach, def.id);
    const seen = isSeen(ach, def.id);
    const cls = ['ach-entry'];
    if (unlocked) cls.push('is-unlocked');
    else cls.push('is-locked');
    if (unlocked && !seen) cls.push('is-fresh');
    const title = unlocked ? def.name : 'Locked';
    const desc = unlocked ? (def.desc || '') : (def.hint || '');
    const stamp = unlocked ? formatStamp(ach.unlocked[def.id]) : '';
    return `
      <li class="${cls.join(' ')}">
        <div class="ach-entry-head">
          <span class="ach-entry-name">${escapeHtml(title)}</span>
          ${stamp ? `<span class="ach-entry-stamp">${stamp}</span>` : ''}
        </div>
        <div class="ach-entry-desc">${escapeHtml(desc)}</div>
      </li>
    `;
  }

  function formatStamp(sec) {
    const ms = (Number(sec) || 0) * 1000;
    if (!ms) return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function open() {
    render();
    modal.classList.add('open');
    // Opening the modal clears the unseen indicator. The flag flip is
    // persisted immediately so a reload mid-view does not re-pulse.
    if (pureMarkAllSeen(getAch())) {
      persist();
      updateAffordance();
    }
  }

  function close() { modal.classList.remove('open'); }

  function markAllSeenAndPersist() {
    if (pureMarkAllSeen(getAch())) {
      persist();
      updateAffordance();
    }
  }

  function updateAffordance() {
    const unseen = hasUnseen(getAch());
    if (menuToggle) menuToggle.classList.toggle('has-unseen', unseen);
    if (menuItem) menuItem.classList.toggle('has-unseen', unseen);
  }

  function showUnlocks(ids) {
    if (!toastsEl || !ids || !ids.length) return;
    for (const id of ids) {
      const def = ACH_BY_ID.get(id);
      if (!def) continue;
      const t = document.createElement('div');
      t.className = 'toast ach-toast';
      t.innerHTML = `
        <div class="ach-toast-label">Achievement unlocked</div>
        <div class="ach-toast-name">${escapeHtml(def.name)}</div>
      `;
      // Tapping the toast opens the modal directly. installTap handles iOS
      // pointer-cancel correctly even with the auto-remove timer pending.
      installTap(t, () => {
        if (t.parentNode) t.remove();
        // Open the menu's hamburger panel briefly? No — go straight to the
        // modal. That is the single-tap experience the player expects.
        open();
      });
      toastsEl.appendChild(t);
      requestAnimationFrame(() => t.classList.add('toast-in'));
      setTimeout(() => { t.classList.remove('toast-in'); t.classList.add('toast-out'); }, TOAST_DURATION_MS);
      setTimeout(() => { if (t.parentNode) t.remove(); }, TOAST_REMOVE_MS);
    }
  }

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  // The hamburger menu's tap handler in menu.js dispatches data-actions but
  // does not know about ours. Hook the menu-item directly the same way the
  // Past Cycles UI does (gameLogUi.js).
  if (menuItem) installTap(menuItem, () => {
    if (menu) menu.classList.remove('open');
    open();
  });

  // First paint of the menu-toggle pulse for players who load with unseen
  // achievements (e.g. unlocks fired during offline accrual on the prior
  // session and the modal was never opened).
  updateAffordance();

  return {
    open, close, refresh: render, showUnlocks, updateAffordance,
    markAllSeen: markAllSeenAndPersist,
  };
}

function stubApi() {
  const noop = () => {};
  return {
    open: noop, close: noop, refresh: noop,
    showUnlocks: noop, updateAffordance: noop, markAllSeen: noop,
  };
}
