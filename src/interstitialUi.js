import { INTERSTITIALS, FIRST_CONTACT_ID } from './interstitial.js';
import { worldFor } from './contactLog.js';

const TYPE_MS_PER_CHAR = 22;

export function makeInterstitialUi(state, onShown) {
  const root = document.getElementById('interstitial');
  const card = root.querySelector('.it-card');
  const textEl = root.querySelector('.it-text');
  const hintEl = root.querySelector('.it-hint');
  const dotsEl = root.querySelector('.it-dots');
  const portraitImgEl = root.querySelector('.it-portrait-img');
  const contactNameEl = root.querySelector('.it-contact-name');
  const contactStatusEl = root.querySelector('.it-contact-status');
  const contactFlavorEl = root.querySelector('.it-contact-flavor');
  const contactTagEl = root.querySelector('.it-contact-tag');

  let active = null;       // { id, def, stepIdx }
  let typing = null;       // { i, full, raf, doneAt }
  let waitingInput = false;
  let autoTimer = 0;
  // Input-guard window after open: the overlay sets pointer-events:none so
  // rapid taps queued from the purchase that triggered it pass through to the
  // card behind instead of being eaten as "advance" taps. Longer than the
  // 180ms backdrop fade so the user has clearly seen the overlay arrive
  // before it starts catching input.
  const INPUT_GUARD_MS = 400;
  let guardTimer = 0;

  // first_contact uses the *next* contact-bearing id parked on stats so the
  // portrait matches the milestone we're framing.
  function resolveContact(id) {
    if (id === FIRST_CONTACT_ID) {
      const next = state.messages && state.messages.stats && state.messages.stats.firstContactWorld;
      return next ? worldFor(state.contactLog, next) : null;
    }
    return worldFor(state.contactLog, id);
  }

  function applyContactFrame(id) {
    if (!card) return;
    card.classList.remove('it-has-contact', 'it-first-contact', 'it-portrait-has-image');
    if (portraitImgEl) {
      portraitImgEl.classList.remove('loaded');
      portraitImgEl.removeAttribute('src');
    }
    const def = resolveContact(id);
    if (!def) return;
    card.classList.add('it-has-contact');
    if (id === FIRST_CONTACT_ID) card.classList.add('it-first-contact');
    if (contactTagEl) contactTagEl.textContent = id === FIRST_CONTACT_ID ? 'First Contact' : 'Contact';
    if (contactNameEl) contactNameEl.textContent = def.name;
    if (contactStatusEl) {
      contactStatusEl.textContent = def.status;
      contactStatusEl.className = `it-contact-status s-${def.status.toLowerCase()}`;
    }
    if (contactFlavorEl) contactFlavorEl.textContent = def.flavor || '';
    if (def.image && portraitImgEl) {
      portraitImgEl.alt = def.name;
      portraitImgEl.onload = () => {
        card.classList.add('it-portrait-has-image');
        portraitImgEl.classList.add('loaded');
      };
      portraitImgEl.onerror = () => { /* fallback stays visible */ };
      portraitImgEl.src = def.image;
    }
  }

  // Tracks the per-interstitial cssClass we apply so close() can strip the
  // exact set without enumerating every possible class. Keeps the contract
  // generic — any interstitial can declare `cssClass`.
  let appliedClass = null;
  let appliedBgEl = null;

  function applyCustomFrame(def) {
    if (!card) return;
    if (def && def.cssClass) {
      card.classList.add(def.cssClass);
      appliedClass = def.cssClass;
    }
    // Cinematic interstitials may want a full-bleed background image (the
    // season finale, future season openers). We inject a dedicated layer
    // behind the card content so the existing contact-portrait styling
    // stays unaffected.
    if (def && def.bgImage) {
      const bg = document.createElement('div');
      bg.className = 'it-bg-image';
      bg.style.backgroundImage = `url("${def.bgImage}")`;
      card.appendChild(bg);
      appliedBgEl = bg;
    }
  }

  function clearCustomFrame() {
    if (appliedClass && card) {
      card.classList.remove(appliedClass);
      appliedClass = null;
    }
    if (appliedBgEl && appliedBgEl.parentNode) {
      appliedBgEl.parentNode.removeChild(appliedBgEl);
      appliedBgEl = null;
    }
  }

  function open(id) {
    const def = INTERSTITIALS[id];
    if (!def) return;
    active = { id, def, stepIdx: 0 };
    applyContactFrame(id);
    applyCustomFrame(def);
    root.style.display = 'flex';
    root.classList.add('it-guard');
    if (guardTimer) clearTimeout(guardTimer);
    guardTimer = setTimeout(() => { root.classList.remove('it-guard'); guardTimer = 0; }, INPUT_GUARD_MS);
    requestAnimationFrame(() => root.classList.add('it-visible'));
    showStep();
  }

  function close() {
    if (!active) return;
    const id = active.id;
    active = null;
    typing = null;
    waitingInput = false;
    autoTimer = 0;
    if (guardTimer) { clearTimeout(guardTimer); guardTimer = 0; }
    clearCustomFrame();
    root.classList.remove('it-visible', 'it-guard');
    setTimeout(() => { if (!active) root.style.display = 'none'; }, 180);
    state.messages.shown[id] = true;
    const i = state.messages.queue.indexOf(id);
    if (i >= 0) state.messages.queue.splice(i, 1);
    onShown && onShown(id);
    drain();
  }

  function showStep() {
    const step = active.def.steps[active.stepIdx];
    renderDots();
    waitingInput = false;
    autoTimer = 0;
    hintEl.style.opacity = '0';
    // Allow dynamic text — a function lets Sera reference past contacts at
    // run-time without baking strings into the static table.
    const full = typeof step.text === 'function' ? step.text(state) : step.text;
    typing = { i: 0, full, doneAt: 0 };
    textEl.textContent = '';
    textEl.classList.add('it-typing');
    // Anonymous-voice steps render italic; everything else stays roman.
    textEl.classList.toggle('it-italic', !!step.italic);
  }

  function renderDots() {
    const n = active.def.steps.length;
    if (n <= 1) { dotsEl.innerHTML = ''; return; }
    dotsEl.innerHTML = Array.from({ length: n }, (_, i) =>
      `<span class="it-dot${i === active.stepIdx ? ' on' : ''}"></span>`
    ).join('');
  }

  function advance() {
    if (!active) return;
    active.stepIdx++;
    if (active.stepIdx >= active.def.steps.length) close();
    else showStep();
  }

  function tick(dtMs) {
    if (!active) return;
    if (typing) {
      typing.i += dtMs / TYPE_MS_PER_CHAR;
      const len = Math.min(typing.full.length, Math.floor(typing.i));
      textEl.textContent = typing.full.slice(0, len);
      if (len >= typing.full.length) {
        typing = null;
        textEl.classList.remove('it-typing');
        const step = active.def.steps[active.stepIdx];
        if (typeof step.autoMs === 'number') autoTimer = step.autoMs;
        else { waitingInput = true; hintEl.style.opacity = '0.7'; }
      }
      return;
    }
    if (autoTimer > 0) {
      autoTimer -= dtMs;
      if (autoTimer <= 0) advance();
    }
  }

  function onKey(e) {
    if (!active) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    handleInput();
  }

  function handleInput() {
    if (!active) return;
    if (typing) {
      // Skip typewriter on first input.
      typing.i = typing.full.length;
      textEl.textContent = typing.full;
      typing = null;
      textEl.classList.remove('it-typing');
      const step = active.def.steps[active.stepIdx];
      if (typeof step.autoMs === 'number') autoTimer = step.autoMs;
      else { waitingInput = true; hintEl.style.opacity = '0.7'; }
      return;
    }
    advance();
  }

  function drain() {
    if (active) return;
    const next = state.messages.queue[0];
    if (next) open(next);
  }

  window.addEventListener('keydown', onKey);

  // Pointer-based tap, same pattern as slot cards in main.js. Plain `click`
  // misfires on iOS when the target re-renders between mousedown and mouseup —
  // the typewriter rewrites `.it-text` ~45×/sec, so any tap that lands during
  // typing risks losing target ancestry. Pointer events resolve on pointerdown.
  let tap = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  root.addEventListener('pointermove', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true;
  });
  root.addEventListener('pointercancel', (e) => {
    if (tap && e.pointerId === tap.id) tap = null;
  });
  root.addEventListener('pointerup', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    const s = tap; tap = null;
    if (s.moved) return;
    // The 400ms input-guard window uses `pointer-events:none` so we shouldn't
    // even receive this — defensive check in case CSS is overridden.
    if (root.classList.contains('it-guard')) return;
    root._tapAt = performance.now();
    handleInput();
  });
  // Fallback click for environments without PointerEvent and for synthesized
  // a11y/keyboard clicks. Deduped against the pointerup timestamp.
  root.addEventListener('click', () => {
    if (root._tapAt && performance.now() - root._tapAt < 700) return;
    handleInput();
  });

  return { tick, drain };
}
