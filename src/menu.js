import { clearSave } from './save.js';
import { sortedWorlds, getRun } from './contactLog.js';

const PIN = '0011';

export function initMenu(state) {
  const menu = document.getElementById('menu');
  const toggle = document.getElementById('menuToggle');
  const pinInput = menu.querySelector('.pin-input');
  const pinError = menu.querySelector('.pin-error');
  const clView = menu.querySelector('[data-view="contact-log"]');
  const clMetaEl = clView.querySelector('.cl-meta');
  const clListEl = clView.querySelector('.cl-list');

  let view = 'list';

  const setOpen = (open) => {
    menu.classList.toggle('open', open);
    if (!open) {
      setView('list');
      pinInput.value = '';
      pinError.classList.remove('show');
    }
  };

  const setView = (next) => {
    view = next;
    for (const v of menu.querySelectorAll('.menu-view')) {
      v.classList.toggle('active', v.dataset.view === next);
    }
    if (next === 'pin') {
      pinInput.value = '';
      pinError.classList.remove('show');
      setTimeout(() => pinInput.focus(), 0);
    }
    if (next === 'contact-log') renderContactLog();
  };

  function renderContactLog() {
    const log = state && state.contactLog;
    const worlds = log ? sortedWorlds(log) : [];
    const run = getRun(log);
    clMetaEl.textContent = `Cycle ${run} · ${worlds.length} contact${worlds.length === 1 ? '' : 's'}`;
    if (!worlds.length) {
      clView.classList.add('cl-empty-only');
      clListEl.innerHTML = '';
      return;
    }
    clView.classList.remove('cl-empty-only');
    clListEl.innerHTML = worlds.map((w) => `
      <li>
        <div>
          <div class="cl-name">${w.name}</div>
          <div class="cl-ep">ep ${w.ep}${w.run > 1 ? ` · cycle ${w.run}` : ''}</div>
        </div>
        <div class="cl-status s-${w.status.toLowerCase()}">${w.status}</div>
      </li>
    `).join('');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });

  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('open')) return;
    if (!menu.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) setOpen(false);
  });

  menu.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'open-contact-log') setView('contact-log');
    if (action === 'open-debug')       setView('pin');
    if (action === 'open-community')   setView('community');
    if (action === 'open-reset')       setView('reset');
    if (action === 'back')             setView('list');
    if (action === 'reset-confirm') {
      // Deliberately does not touch the Contact Log — that survives resets.
      clearSave();
      location.reload();
    }
  });

  pinInput.addEventListener('input', () => {
    pinError.classList.remove('show');
    if (pinInput.value.length === PIN.length) tryPin();
  });
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryPin();
  });

  function tryPin() {
    if (pinInput.value === PIN) {
      pinInput.value = '';
      setView('debug');
    } else {
      pinError.classList.add('show');
      pinInput.value = '';
    }
  }
}
