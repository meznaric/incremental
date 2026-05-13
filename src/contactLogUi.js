import { sortedWorlds, getRun } from './contactLog.js';

// Wires the always-visible top-right Contact Log button to its modal.
// Re-renders content every time the modal opens, so newly recorded contacts
// always show without needing to listen for state changes.
export function initContactLogUi(state) {
  const btn = document.getElementById('contactLogBtn');
  const modal = document.getElementById('contactLogModal');
  const closeBtn = modal.querySelector('.bm-close');
  const body = modal.querySelector('.cl-body');
  const metaEl = modal.querySelector('.cl-meta');
  const listEl = modal.querySelector('.cl-list');

  function render() {
    const log = state.contactLog;
    const worlds = log ? sortedWorlds(log) : [];
    const run = getRun(log);
    metaEl.textContent = `Cycle ${run} · ${worlds.length} contact${worlds.length === 1 ? '' : 's'}`;
    if (!worlds.length) {
      body.classList.add('is-empty');
      listEl.innerHTML = '';
      return;
    }
    body.classList.remove('is-empty');
    listEl.innerHTML = worlds.map((w) => `
      <li>
        <div>
          <div class="cl-name">${w.name}</div>
          <div class="cl-ep">ep ${w.ep}${w.run > 1 ? ` · cycle ${w.run}` : ''}</div>
        </div>
        <div class="cl-status s-${w.status.toLowerCase()}">${w.status}</div>
      </li>
    `).join('');
  }

  const open = () => { render(); modal.classList.add('open'); };
  const close = () => modal.classList.remove('open');

  btn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.bm-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close };
}
