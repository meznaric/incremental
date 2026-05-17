// First-boot intro overlay. Two stages — a "tap to open carrier" gate, then a
// year/location reveal — that fire once across the player's whole history.
// Persistence lives in contactLog (introSeen flag), so the intro survives
// cycle close and never replays.
//
// Markup lives in index.html under #intro; styling in styles/intro.css. After
// both stages dismiss, the runner calls onDone() — main.js then enqueues the
// downstream interstitial chain (intro_name → intro_kalen → intro_premise
// → intro_console).

import { installTap } from './tap.js';

const LOCALE_BG_IMAGE = './docs/lore/images/intro-locale.png';
// Minimum on-screen time per stage. Prevents a held-down tap from clearing
// both screens in a single gesture, and gives the animations room to land.
const GATE_GUARD_MS = 700;
const LOCALE_GUARD_MS = 900;
// Image preflight: if the locale background never materialises (offline,
// 404, etc.) the stage still works — the gradient + tagline carry it.
const LOCALE_BG_TIMEOUT_MS = 1200;

export function runIntroSequence(onDone) {
  const root = document.getElementById('intro');
  if (!root) { onDone && onDone(); return; }
  const gate = root.querySelector('.intro-stage[data-stage="gate"]');
  const locale = root.querySelector('.intro-stage[data-stage="locale"]');
  const bg = root.querySelector('.intro-locale-bg');
  if (!gate || !locale) { onDone && onDone(); return; }

  // Preload the locale background. Showing the broken-image alt would break
  // the mood — the gradient-only fallback is intentional and just as readable.
  let bgReady = false;
  const img = new Image();
  img.onload = () => {
    bgReady = true;
    if (bg) bg.style.backgroundImage = `url("${LOCALE_BG_IMAGE}")`;
  };
  img.onerror = () => { bgReady = false; };
  img.src = LOCALE_BG_IMAGE;
  setTimeout(() => { /* timeout marker so we don't block forever */ }, LOCALE_BG_TIMEOUT_MS);

  let stage = 'gate';
  let guardUntil = 0;

  function show() {
    root.classList.add('intro-open');
    // double rAF so the transition fires after display flips to flex
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('intro-visible');
      gate.classList.add('intro-stage-on');
      guardUntil = performance.now() + GATE_GUARD_MS;
    }));
  }

  function showLocale() {
    stage = 'locale';
    gate.classList.remove('intro-stage-on');
    // Brief blackout between stages — the tagline lands clean.
    setTimeout(() => {
      gate.setAttribute('hidden', '');
      locale.removeAttribute('hidden');
      // double rAF again so the fade-in transition actually plays
      requestAnimationFrame(() => requestAnimationFrame(() => {
        locale.classList.add('intro-stage-on');
        if (bgReady && bg) bg.classList.add('intro-bg-on');
        guardUntil = performance.now() + LOCALE_GUARD_MS;
      }));
    }, 520);
  }

  function dismiss() {
    locale.classList.remove('intro-stage-on');
    root.classList.remove('intro-visible');
    setTimeout(() => {
      root.classList.remove('intro-open');
      onDone && onDone();
    }, 480);
  }

  function tryAdvance() {
    if (performance.now() < guardUntil) return;
    if (stage === 'gate') showLocale();
    else if (stage === 'locale') dismiss();
  }

  installTap(root, tryAdvance);
  function onKey(e) {
    if (!root.classList.contains('intro-open')) return;
    if (e.key === 'Escape') return; // never escape-out of the opener
    e.preventDefault();
    tryAdvance();
  }
  window.addEventListener('keydown', onKey);
  // Stage cleanup once the runner is done. main.js doesn't outlive the
  // listener but the document does — strip it so a later reload that reuses
  // the same module instance (HMR / future) doesn't double-bind.
  const wrappedDone = onDone;
  onDone = () => {
    window.removeEventListener('keydown', onKey);
    wrappedDone && wrappedDone();
  };

  show();
}
