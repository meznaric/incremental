// Hail result drama. The reveal banner is the loudest single moment in the
// game. The cards in the row stay still — the centred banner is the
// headline, and the falling 3D particles in the magnitude columns are pulled
// toward screen-centre (handled by MagnitudeDisplay.triggerGambleFx via the
// `onStart` callback) so the *world* reacts to the result, not the row of
// cards. The card-anchored ring burst stays as a secondary flourish on the
// positive reveal only — driven by the caller via fireWinBurst.

const OVERLAY_ID = 'gambleFxOverlay';

// Lore: a Hail is Kalen pinging the dark and listening for the signal to
// come back. Win = something answered. Loss = the dark stayed silent.
// Picked randomly per reveal so repeat play stays alive. Keep these tight —
// the label is set in a large font; short reads better.
const WIN_LABELS  = ['ECHO', 'RETURN', 'ANSWER', 'CARRIER', 'CONTACT', 'REPLY'];
const LOSS_LABELS = ['NO RESPONSE', 'SILENCE', 'NO REPLY', 'STATIC', 'NO ECHO'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Module-level lock so the shop can ignore further gamble taps while the
// reveal is on screen. The flag covers the full lead-in + banner hold +
// fade-out window, not just the in-animation.
let _active = false;
export function isGambleFxActive() { return _active; }

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

function buildBanner(won, deltaText) {
  const banner = document.createElement('div');
  banner.className = `gx-banner ${won ? 'gx-win' : 'gx-loss'}`;
  const sign = won ? '+' : '−';
  const label = pick(won ? WIN_LABELS : LOSS_LABELS);
  banner.innerHTML = `
    <div class="gx-label">${label}</div>
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

// Run the full sequence. `onMid` fires once we are past the reveal pop — that
// is the moment to swap the bought card for the new roll. `onStart` fires
// immediately so callers can kick off the in-world particle attractor in
// sync with the banner build-up.
export function fireGambleResult({ tappedEl, won, deltaText, onMid, onStart }) {
  const overlay = ensureOverlay();
  _active = true;
  if (typeof onStart === 'function') onStart();

  // Reduced motion: skip the burst. Show the banner only.
  if (prefersReducedMotion()) {
    const banner = buildBanner(won, deltaText);
    banner.classList.add('gx-reduced');
    overlay.appendChild(banner);
    setTimeout(() => { if (typeof onMid === 'function') onMid(); }, 120);
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
      _active = false;
    }, 1200);
    return;
  }

  // Tiny lead-in lets the particle attractor begin its sweep before the
  // banner punches in — the eye lands on motion first, headline second.
  const leadMs = 240;
  // Banner timing budget: in-animation runs 0.7s, then we hold for a beat
  // before triggering gx-out (0.9s win / 1.0s loss, gentle ease so the fade
  // is actually visible — ease-in over 0.5s read as a hard cut). Removal
  // lines up with the fade end so the banner finishes its alpha-to-zero
  // before the DOM goes away.
  const outDelay = 900;
  const outDur = won ? 900 : 1000;
  setTimeout(() => {
    const banner = buildBanner(won, deltaText);
    overlay.appendChild(banner);
    // Force reflow so the entry keyframe runs.
    // eslint-disable-next-line no-unused-expressions
    void banner.offsetWidth;
    banner.classList.add('gx-in');

    if (won) spawnWinMotes(overlay);
    else spawnLossDrift(overlay);

    setTimeout(() => { if (typeof onMid === 'function') onMid(); }, 260);

    setTimeout(() => {
      banner.classList.add('gx-out');
    }, outDelay);
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
      const stale = overlay.querySelectorAll('.gx-mote-win, .gx-mote-loss');
      stale.forEach((m) => m.remove());
      _active = false;
    }, outDelay + outDur);
  }, leadMs);
}
