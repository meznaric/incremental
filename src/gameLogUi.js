import { loadGameLog, formatDuration, formatDate } from './gameLog.js';
import { formatAbbrev } from './bignum.js';
import { installTap } from './tap.js';

// Past Cycles — read-only retrospective. Renders on open from localStorage so
// the list always reflects the latest entry written at Cycle close.
export function initGameLogUi() {
  const modal = document.getElementById('gameLogModal');
  if (!modal) return { open: () => {}, close: () => {} };
  const body = modal.querySelector('.gl-body');
  const listEl = modal.querySelector('.gl-list');

  const render = () => {
    const entries = loadGameLog().slice().sort((a, b) => b.endedAt - a.endedAt);
    body.classList.toggle('is-empty', entries.length === 0);
    if (entries.length === 0) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = entries.map((e) => {
      const rows = [];
      rows.push(['Duration', formatDuration(e.runDurationS), '']);
      rows.push(['End balance', formatAbbrev(e.endAmount), 'cc']);
      rows.push(['Peak', formatAbbrev(e.peakAmount), 'cc']);
      rows.push(['Contacts', String(e.contacts), '']);
      if (e.massBanked > 0) rows.push(['Mass banked', `${e.massBanked} kg`, 'mass']);
      if (e.memoryShards > 0) rows.push(['Memory shards', String(e.memoryShards), 'memory']);
      const statsHtml = rows.map(([label, value, cls]) => `
        <div class="gl-stat">
          <span class="gl-stat-label">${label}</span>
          <span class="gl-stat-value${cls ? ' ' + cls : ''}">${value}</span>
        </div>
      `).join('');
      return `
        <li class="gl-entry">
          <div class="gl-entry-head">
            <span class="gl-cycle">Cycle ${e.cycle}</span>
            <span class="gl-date">${formatDate(e.endedAt)}</span>
          </div>
          <div class="gl-stats">${statsHtml}</div>
        </li>
      `;
    }).join('');
  };

  const open = () => { render(); modal.classList.add('open'); };
  const close = () => { modal.classList.remove('open'); };

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) close();
  });

  // The hamburger menu's tap handler in menu.js routes [data-action] clicks
  // but has no case for ours. Hook the menu-item directly so we run first
  // and close the panel before opening the modal — otherwise it would stay
  // open behind the overlay.
  const menuItem = document.querySelector('[data-action="open-game-log"]');
  const menuEl = document.getElementById('menu');
  if (menuItem) installTap(menuItem, () => {
    if (menuEl) menuEl.classList.remove('open');
    open();
  });

  return { open, close, render };
}
