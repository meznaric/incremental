// Hail result drama. The reveal of WIN/LOSS is the loudest single moment in
// the game — everything on the shelf gravitates to the centre, holds a beat,
// then either bursts back out in green (win) or sags and dims (loss). The
// centred WIN/LOSS text is the headline; the card-anchored ring burst stays
// as a secondary flourish on wins only.
//
// All DOM/CSS. One overlay + per-card transforms. Single timer chain so a
// teardown call always wipes the cards' inline transforms even if the page is
// backgrounded mid-flow.

const OVERLAY_ID = 'gambleFxOverlay';
const CARD_TRANSITION = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), filter 280ms ease-out, opacity 280ms ease-out';
const SPRING_TRANSITION = 'transform 460ms cubic-bezier(0.18, 0.9, 0.3, 1.25), filter 460ms ease-out, opacity 460ms ease-out';
const FALL_TRANSITION = 'transform 520ms cubic-bezier(0.4, 0.05, 0.55, 1), filter 520ms ease-out, opacity 520ms ease-out';
const SETTLE_TRANSITION = 'transform 220ms ease-out, filter 220ms ease-out, opacity 220ms ease-out';

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureOverlay() {
  let o = document.getElementById(OVERLAY_ID);
  if (!o) {
    o = document.createElement('div');
    o.id = OVERLAY_ID;
    document.body.appendChild(o);
  }
  return o;
}

function collectCards(slotsEl) {
  return Array.from(slotsEl.querySelectorAll('.slot'));
}

// Per-card pull vector toward viewport centre. Magnetised — far cards travel
// further. The tapped card gets a stronger pull and a scale-up so it reads as
// the focus.
function applyPull(cards, tappedEl) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (const el of cards) {
    const rect = el.getBoundingClientRect();
    const rx = rect.left + rect.width / 2;
    const ry = rect.top + rect.height / 2;
    const dx = (cx - rx) * 0.55;
    const dy = (cy - ry) * 0.55;
    const isTap = el === tappedEl;
    const scale = isTap ? 1.06 : 0.92;
    el.style.transition = CARD_TRANSITION;
    el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale})`;
    el.style.filter = isTap ? 'brightness(1.15) saturate(1.1)' : 'brightness(0.7) saturate(0.6)';
    el.style.zIndex = isTap ? '5' : '2';
    el.style.willChange = 'transform, filter';
  }
}

function releaseWin(cards) {
  for (const el of cards) {
    el.style.transition = SPRING_TRANSITION;
    el.style.transform = '';
    el.style.filter = 'brightness(1.25) saturate(1.2)';
  }
}

function releaseLoss(cards, tappedEl) {
  for (const el of cards) {
    const isTap = el === tappedEl;
    el.style.transition = FALL_TRANSITION;
    el.style.transform = `translateY(${isTap ? 28 : 14}px)`;
    el.style.filter = 'brightness(0.55) saturate(0.4)';
    el.style.opacity = '0.75';
  }
}

function clearCards(cards) {
  for (const el of cards) {
    el.style.transition = SETTLE_TRANSITION;
    el.style.transform = '';
    el.style.filter = '';
    el.style.opacity = '';
    el.style.zIndex = '';
    el.style.willChange = '';
  }
  // Strip the transition once it has settled so future taps inherit the
  // stylesheet's default.
  setTimeout(() => {
    for (const el of cards) el.style.transition = '';
  }, 260);
}

function buildBanner(won, deltaText) {
  const banner = document.createElement('div');
  banner.className = `gx-banner ${won ? 'gx-win' : 'gx-loss'}`;
  const sign = won ? '+' : '−';
  banner.innerHTML = `
    <div class="gx-label">${won ? 'WIN' : 'LOSS'}</div>
    <div class="gx-delta"><span class="gx-sign">${sign}</span>${deltaText}</div>
  `;
  return banner;
}

function spawnWinMotes(overlay) {
  const n = 18;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 360 + (Math.random() * 8 - 4);
    const dist = 220 + Math.random() * 120;
    const delay = Math.random() * 80;
    const mote = document.createElement('span');
    mote.className = 'gx-mote-win';
    mote.style.setProperty('--a', `${angle}deg`);
    mote.style.setProperty('--d', `${dist}px`);
    mote.style.animationDelay = `${delay}ms`;
    frag.appendChild(mote);
  }
  overlay.appendChild(frag);
}

function spawnLossDrift(overlay) {
  const n = 10;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 260;
    const delay = Math.random() * 220;
    const mote = document.createElement('span');
    mote.className = 'gx-mote-loss';
    mote.style.setProperty('--x', `${x.toFixed(1)}px`);
    mote.style.animationDelay = `${delay}ms`;
    frag.appendChild(mote);
  }
  overlay.appendChild(frag);
}

// Run the full sequence. `onMid` is called once we are past the reveal pop
// and the cards are about to clear — that is the moment to swap the bought
// card for the new roll, so it appears as the dust settles.
export function fireGambleResult({ slotsEl, tappedEl, won, deltaText, onMid }) {
  const overlay = ensureOverlay();
  // Reduced motion: skip the gravity pull and motes. Show the banner only.
  if (prefersReducedMotion()) {
    const banner = buildBanner(won, deltaText);
    banner.classList.add('gx-reduced');
    overlay.appendChild(banner);
    setTimeout(() => { if (typeof onMid === 'function') onMid(); }, 120);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 1200);
    return;
  }

  const cards = collectCards(slotsEl);
  // The shelf clips overflow-y so cards pulled toward the screen centre would
  // get sliced. Unlock the clip for the duration of the burst; restore on
  // teardown. Save the previous inline values so we don't trample a future
  // override.
  const prevOverflow = slotsEl.style.overflow;
  const prevOverflowX = slotsEl.style.overflowX;
  const prevOverflowY = slotsEl.style.overflowY;
  slotsEl.style.overflow = 'visible';
  // Phase 1: gravity pull. ~300ms.
  applyPull(cards, tappedEl);

  // Phase 2: hold ~100ms, then reveal + burst.
  const pullMs = 300;
  const holdMs = 100;
  setTimeout(() => {
    const banner = buildBanner(won, deltaText);
    overlay.appendChild(banner);
    // Force reflow so the entry keyframe runs.
    // eslint-disable-next-line no-unused-expressions
    void banner.offsetWidth;
    banner.classList.add('gx-in');

    if (won) {
      spawnWinMotes(overlay);
      releaseWin(cards);
    } else {
      spawnLossDrift(overlay);
      releaseLoss(cards, tappedEl);
    }

    // Mid-flow: swap the bought card content while the burst hides the
    // change. ~250ms into the reveal feels right — the eye is on the banner.
    setTimeout(() => { if (typeof onMid === 'function') onMid(); }, 260);

    // Clear the cards' inline transforms after the burst. Wins settle back
    // to neutral; losses re-rise from the drop.
    setTimeout(() => clearCards(cards), 520);

    // Banner exit + DOM cleanup.
    setTimeout(() => {
      banner.classList.add('gx-out');
    }, won ? 950 : 850);
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
      // Remove any stray motes (they animate forwards and self-fade, but
      // wipe in case the tab was backgrounded mid-run).
      const stale = overlay.querySelectorAll('.gx-mote-win, .gx-mote-loss');
      stale.forEach((m) => m.remove());
      // Restore the shelf's overflow rules. Inline empty strings hand the
      // value back to the stylesheet's defaults.
      slotsEl.style.overflow = prevOverflow;
      slotsEl.style.overflowX = prevOverflowX;
      slotsEl.style.overflowY = prevOverflowY;
    }, 1500);
  }, pullMs + holdMs);
}
