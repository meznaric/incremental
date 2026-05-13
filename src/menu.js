import { clearSave } from './save.js';

const PIN = '0011';

export function initMenu() {
  const menu = document.getElementById('menu');
  const toggle = document.getElementById('menuToggle');
  const pinInput = menu.querySelector('.pin-input');
  const pinError = menu.querySelector('.pin-error');

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
  };

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
    if (action === 'open-debug')     setView('pin');
    if (action === 'open-community') setView('community');
    if (action === 'open-reset')     setView('reset');
    if (action === 'back')           setView('list');
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
