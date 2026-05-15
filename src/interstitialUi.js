import { INTERSTITIALS, FIRST_CONTACT_ID } from './interstitial.js';
import { worldFor } from './contactLog.js';

const TYPE_MS_PER_CHAR = 22;
// Contact-bearing interstitials (first_contact + milestones) auto-progress
// slower than narrative beats — a new world arriving is something the player
// should have time to absorb, not blink past. Multiplier on top of the
// per-step `autoMs`, with a floor so very short waits still get a beat.
const CONTACT_AUTOMS_MULTIPLIER = 1.9;
const CONTACT_AUTOMS_FLOOR = 4200;

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
  const prevBtn = root.querySelector('.it-prev');
  const nextBtn = root.querySelector('.it-next');
  const closeBtn = root.querySelector('.it-close');

  let active = null;       // { id, def, stepIdx, isContact }
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

  function isContactBearing(id) {
    if (id === FIRST_CONTACT_ID) return true;
    return !!(state.contactLog && worldFor(state.contactLog, id));
  }

  function open(id) {
    const def = INTERSTITIALS[id];
    if (!def) return;
    active = { id, def, stepIdx: 0, isContact: isContactBearing(id) };
    applyContactFrame(id);
    applyCustomFrame(def);
    if (card) card.classList.toggle('it-single', def.steps.length <= 1);
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
    if (card) card.classList.remove('it-single');
    root.classList.remove('it-visible', 'it-guard');
    setTimeout(() => { if (!active) root.style.display = 'none'; }, 180);
    state.messages.shown[id] = true;
    const i = state.messages.queue.indexOf(id);
    if (i >= 0) state.messages.queue.splice(i, 1);
    onShown && onShown(id);
    drain();
  }

  function updateNav() {
    if (!active) return;
    const n = active.def.steps.length;
    const i = active.stepIdx;
    if (prevBtn) prevBtn.disabled = i <= 0;
    if (nextBtn) nextBtn.disabled = i >= n - 1;
  }

  function showStep() {
    const step = active.def.steps[active.stepIdx];
    renderDots();
    updateNav();
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
    if (active.stepIdx >= active.def.steps.length - 1) {
      // Last step: dismiss only on explicit input (tap / space / enter / close
      // button). Never auto-dismiss.
      close();
      return;
    }
    active.stepIdx++;
    showStep();
  }

  function goPrev() {
    if (!active) return;
    if (active.stepIdx <= 0) return;
    active.stepIdx--;
    showStep();
  }

  function goNext() {
    if (!active) return;
    // Don't let the side button close the card — only the tap-to-continue /
    // close button can do that. This way the player who hits next on the
    // final step still has a chance to re-read before committing to dismiss.
    if (active.stepIdx >= active.def.steps.length - 1) return;
    active.stepIdx++;
    showStep();
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
        const isLast = active.stepIdx >= active.def.steps.length - 1;
        // The final step never auto-dismisses; it always waits for input.
        // Earlier steps may auto-advance per their `autoMs`. Contact-bearing
        // beats get a generous multiplier + floor so new-world reveals breathe.
        if (!isLast && typeof step.autoMs === 'number') {
          let ms = step.autoMs;
          if (active.isContact) ms = Math.max(CONTACT_AUTOMS_FLOOR, ms * CONTACT_AUTOMS_MULTIPLIER);
          autoTimer = ms;
        } else {
          waitingInput = true;
          hintEl.style.opacity = '0.7';
        }
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
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
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
      const isLast = active.stepIdx >= active.def.steps.length - 1;
      if (!isLast && typeof step.autoMs === 'number') {
        let ms = step.autoMs;
        if (active.isContact) ms = Math.max(CONTACT_AUTOMS_FLOOR, ms * CONTACT_AUTOMS_MULTIPLIER);
        autoTimer = ms;
      } else {
        waitingInput = true;
        hintEl.style.opacity = '0.7';
      }
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
  // The nav buttons (prev/next/close) record their action on pointerdown via
  // the `data-it-action` attribute and resolve on pointerup; this matches
  // the existing pattern and stays reliable on iOS Chrome.
  let tap = null;
  function actionForTarget(target) {
    let n = target;
    while (n && n !== root) {
      if (n.dataset && n.dataset.itAction) return n.dataset.itAction;
      n = n.parentNode;
    }
    return null;
  }
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    tap = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      action: actionForTarget(e.target),
    };
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
    // Pointerup landed on the same action target as pointerdown? Honour it.
    const upAction = actionForTarget(e.target);
    if (s.action && s.action === upAction) {
      root._tapAt = performance.now();
      if (s.action === 'prev') goPrev();
      else if (s.action === 'next') goNext();
      else if (s.action === 'close') close();
      return;
    }
    root._tapAt = performance.now();
    handleInput();
  });
  // Fallback click for environments without PointerEvent and for synthesized
  // a11y/keyboard clicks. Deduped against the pointerup timestamp.
  root.addEventListener('click', (e) => {
    if (root._tapAt && performance.now() - root._tapAt < 700) return;
    const action = actionForTarget(e.target);
    if (action === 'prev') { goPrev(); return; }
    if (action === 'next') { goNext(); return; }
    if (action === 'close') { close(); return; }
    handleInput();
  });

  return { tick, drain };
}
