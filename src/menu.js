import { clearSave } from './save.js';
import { clearContactLog } from './contactLog.js';
import { clearAchievements } from './achievements.js';
import { installTap } from './tap.js';

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

  installTap(toggle, () => {
    setOpen(!menu.classList.contains('open'));
  });

  // Outside-click closes the menu. The toggle's tap fires on pointerup before
  // this listener sees the synthetic click, and the click that does bubble has
  // its target inside #menu (so the contains() check skips it).
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('open')) return;
    if (!menu.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) setOpen(false);
  });

  installTap(menu, (_e, target) => {
    const action = target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'open-debug')     setView('pin');
    if (action === 'open-community') setView('community');
    if (action === 'open-reset')     setView('reset');
    if (action === 'back')           setView('list');
    if (action === 'reset-confirm') {
      // Full wipe — gameplay save AND the Contact Log. The thematic soft
      // reset ("Close the Cycle") is in the Contact Log modal; that one
      // preserves the log and banks Echo Memory.
      clearSave();
      clearContactLog();
      clearAchievements();
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
