// First-boot intro overlay. Two stages — a "press anything to continue" gate,
// then a year-and-location announcement — that fire once across the player's
// whole history.
//
// The overlay is not torn down when the locale stage advances — it stays as
// a black backdrop while the dramatic intro interstitial chain (intro_name,
// intro_kalen, intro_tell_us) renders above it. The backdrop hides the game
// canvas / HUD throughout the cinematic, so the player only sees the rig
// once Sera says "tell us from the beginning" and the actual game begins.
//
// API:
//   runIntroSequence({ onLocaleAdvance }) → { dismissBackdrop }
//     - onLocaleAdvance: called when the player taps past the locale screen.
//       Caller enqueues the dramatic chain and sets html.intro-chain so the
//       interstitial modal renders above the backdrop.
//     - dismissBackdrop(): fade out the overlay and reveal the game. Caller
//       invokes this when the dramatic chain has closed (intro_tell_us).
//
// Persistence: lives in contactLog.introSeen, gated upstream in main.js.

import { installTap } from './tap.js';

const LOCALE_BG_IMAGE = './docs/lore/images/intro-locale.png';
// Minimum on-screen time per stage. Prevents a held-down tap from clearing
// both screens in a single gesture, and gives the animations room to land.
const GATE_GUARD_MS = 700;
const LOCALE_GUARD_MS = 1200;
const LOCALE_BG_TIMEOUT_MS = 1200;

export function runIntroSequence({ onLocaleAdvance } = {}) {
  const root = document.getElementById('intro');
  if (!root) { onLocaleAdvance && onLocaleAdvance(); return { dismissBackdrop() {} }; }
  const gate = root.querySelector('.intro-stage[data-stage="gate"]');
  const locale = root.querySelector('.intro-stage[data-stage="locale"]');
  const bg = root.querySelector('.intro-locale-bg');
  if (!gate || !locale) { onLocaleAdvance && onLocaleAdvance(); return { dismissBackdrop() {} }; }

  // Preload the locale background. If it never materialises (offline / 404)
  // the stage still works — the gradient + tagline carry it.
  let bgReady = false;
  const img = new Image();
  img.onload = () => {
    bgReady = true;
    if (bg) bg.style.backgroundImage = `url("${LOCALE_BG_IMAGE}")`;
  };
  img.onerror = () => { bgReady = false; };
  img.src = LOCALE_BG_IMAGE;
  setTimeout(() => {}, LOCALE_BG_TIMEOUT_MS);

  let stage = 'gate';
  let guardUntil = 0;
  let onKeyBound = null;

  function show() {
    // CSS keeps html.intro-pending #intro displayed from first paint. We
    // only need to switch on the visible class + the gate stage here so the
    // transitions actually fire (the inline pre-paint state has them held).
    root.classList.add('intro-open', 'intro-visible');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      gate.classList.add('intro-stage-on');
      guardUntil = performance.now() + GATE_GUARD_MS;
    }));
  }

  function showLocale() {
    stage = 'locale';
    gate.classList.remove('intro-stage-on');
    // Brief blackout between stages so the year reveal lands clean.
    setTimeout(() => {
      gate.setAttribute('hidden', '');
      locale.removeAttribute('hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        locale.classList.add('intro-stage-on');
        if (bgReady && bg) bg.classList.add('intro-bg-on');
        guardUntil = performance.now() + LOCALE_GUARD_MS;
      }));
    }, 520);
  }

  function fadeLocaleContent() {
    // Keep the backdrop, drop the foreground. The dramatic interstitial
    // chain takes over; the player only sees the black + faint scan field
    // behind the interstitial modal.
    stage = 'chain';
    locale.classList.remove('intro-stage-on');
    if (bg) bg.classList.remove('intro-bg-on');
    // After the fade settles, hide the stage element so its hover/tap area
    // doesn't catch input meant for the interstitial below.
    setTimeout(() => { locale.setAttribute('hidden', ''); }, 600);
  }

  function tryAdvance() {
    if (performance.now() < guardUntil) return;
    if (stage === 'gate') showLocale();
    else if (stage === 'locale') {
      fadeLocaleContent();
      if (onLocaleAdvance) onLocaleAdvance();
    }
    // stage === 'chain': taps fall through to the interstitial modal.
  }

  function dismissBackdrop() {
    root.classList.remove('intro-visible');
    setTimeout(() => {
      root.classList.remove('intro-open');
      root.style.display = 'none';
      document.documentElement.classList.remove('intro-pending', 'intro-chain');
      if (onKeyBound) {
        window.removeEventListener('keydown', onKeyBound);
        onKeyBound = null;
      }
    }, 480);
  }

  installTap(root, tryAdvance);
  onKeyBound = (e) => {
    if (!root.classList.contains('intro-open')) return;
    if (e.key === 'Escape') return;
    // Don't swallow keys once the dramatic chain has taken over — the
    // interstitial modal owns input from then on.
    if (stage === 'chain') return;
    e.preventDefault();
    tryAdvance();
  };
  window.addEventListener('keydown', onKeyBound);

  show();
  return { dismissBackdrop };
}
