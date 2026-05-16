import { INTERSTITIALS, FIRST_CONTACT_ID, VOICE_META, resolveStepVoice } from './interstitial.js';
import { worldFor } from './contactLog.js';
import { installTap } from './tap.js';

const TYPE_MS_PER_CHAR = 22;
// Text-driven dwell: auto-advance time for a non-final step is computed from
// the visible word count, so a 1-word line doesn't get the same reserve as a
// 12-word monologue. Formula: 1.4s base + ~0.48s/word, floored at 2.2s. This
// runs AFTER the typewriter completes (typewriter time is not folded in), so
// total time-on-screen for a step is roughly typewriter + dwell.
const DWELL_PER_WORD_MS = 480;
const DWELL_BASE_MS = 1400;
const DWELL_FLOOR_MS = 2200;
function dwellForText(text) {
  const t = (text || '').trim();
  if (!t) return DWELL_FLOOR_MS;
  const words = t.split(/\s+/).length;
  return Math.max(DWELL_FLOOR_MS, words * DWELL_PER_WORD_MS + DWELL_BASE_MS);
}

export function makeInterstitialUi(state, onShown) {
  const root = document.getElementById('interstitial');
  const card = root.querySelector('.it-card');
  const textEl = root.querySelector('.it-text');
  const dotsEl = root.querySelector('.it-dots');
  const portraitImgEl = root.querySelector('.it-portrait-img');
  const contactNameEl = root.querySelector('.it-contact-name');
  const contactStatusEl = root.querySelector('.it-contact-status');
  const contactFlavorEl = root.querySelector('.it-contact-flavor');
  const contactTagEl = root.querySelector('.it-contact-tag');
  const speakerImgEl = root.querySelector('.it-speaker-img');
  const speakerNameEl = root.querySelector('.it-speaker-name');
  const prevBtn = root.querySelector('.it-btn-prev');
  const nextBtn = root.querySelector('.it-btn-next');

  const VOICE_CLASSES = ['voice-kalen', 'voice-sera', 'voice-narrator', 'voice-anonymous'];
  const VOICE_CLASS = { K: 'voice-kalen', S: 'voice-sera', N: 'voice-narrator', A: 'voice-anonymous' };

  function applySpeaker() {
    if (!card) return;
    card.classList.remove('it-has-speaker', ...VOICE_CLASSES);
    if (!active) return;
    const voice = resolveStepVoice(active.def.steps, active.stepIdx);
    const meta = VOICE_META[voice];
    const cls = VOICE_CLASS[voice];
    if (cls) card.classList.add(cls);
    if (!meta || !meta.portrait) return;
    card.classList.add('it-has-speaker');
    if (speakerNameEl) speakerNameEl.textContent = meta.name;
    if (speakerImgEl) {
      speakerImgEl.alt = meta.name;
      if (speakerImgEl.getAttribute('src') !== meta.portrait) {
        speakerImgEl.src = meta.portrait;
      }
    }
  }

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
    if (card) card.classList.remove('it-single', 'it-has-speaker', ...VOICE_CLASSES);
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
    const isLast = i >= n - 1;
    if (prevBtn) prevBtn.disabled = i <= 0;
    if (nextBtn) {
      // On the last step the Next button becomes the explicit Close — the
      // only dismiss path now that body taps no longer close the card.
      nextBtn.textContent = isLast ? 'Close' : 'Next';
      nextBtn.dataset.itAction = isLast ? 'close' : 'next';
      nextBtn.classList.toggle('is-close', isLast);
      nextBtn.disabled = false;
    }
  }

  function showStep() {
    const step = active.def.steps[active.stepIdx];
    renderDots();
    updateNav();
    applySpeaker();
    waitingInput = false;
    autoTimer = 0;
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

  // User-initiated advance: tap / space / enter on a finished step. From the
  // last step, this is the *only* way (other than Escape) to dismiss.
  function advance() {
    if (!active) return;
    if (active.stepIdx >= active.def.steps.length - 1) {
      // Last step: dismiss only on explicit input (tap / space / enter /
      // Escape). Never auto-dismiss.
      close();
      return;
    }
    active.stepIdx++;
    showStep();
  }

  // Timer-initiated advance: the dwell expired on a non-final step. Cannot
  // close — if we somehow got here on the last step (defensive; finishStepDwell
  // never sets autoTimer there) we simply wait for input.
  function autoAdvance() {
    if (!active) return;
    if (active.stepIdx >= active.def.steps.length - 1) {
      waitingInput = true;
      autoTimer = 0;
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
    // Next on the last step is now the Close button — handled via the
    // explicit 'close' action, never this function.
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
        finishStepDwell();
      }
      return;
    }
    if (autoTimer > 0) {
      autoTimer -= dtMs;
      if (autoTimer <= 0) autoAdvance();
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
      finishStepDwell();
      return;
    }
    // Body taps no longer dismiss the card — Close button is the only path
    // out on the last step. On non-last steps we still advance, which
    // matches the keyboard Space/Enter behaviour.
    if (active.stepIdx >= active.def.steps.length - 1) return;
    advance();
  }

  // Called when the typewriter for the current step finishes (either naturally
  // or because the user skipped it). The final step ALWAYS waits for input —
  // it never receives an autoTimer. Earlier steps get a text-length-based
  // dwell. This is the *only* place autoTimer is set, which keeps the "no
  // timer can call close()" contract trivial to verify.
  function finishStepDwell() {
    if (!active) return;
    const step = active.def.steps[active.stepIdx];
    const isLast = active.stepIdx >= active.def.steps.length - 1;
    if (isLast) {
      waitingInput = true;
      autoTimer = 0;
      return;
    }
    const full = typeof step.text === 'function' ? step.text(state) : step.text;
    autoTimer = dwellForText(full);
  }

  function drain() {
    if (active) return;
    const next = state.messages.queue[0];
    if (next) open(next);
  }

  window.addEventListener('keydown', onKey);

  // Delegated taps via installTap — pointerdown's target is what routes the
  // action so DOM rewrites during the typewriter (.it-text mutates ~45×/s)
  // don't lose the tap.
  function actionForTarget(target) {
    let n = target;
    while (n && n !== root) {
      if (n.dataset && n.dataset.itAction) return n.dataset.itAction;
      n = n.parentNode;
    }
    return null;
  }
  installTap(root, (_e, downTarget) => {
    if (root.classList.contains('it-guard')) return;
    const action = actionForTarget(downTarget);
    if (action === 'prev') { goPrev(); return; }
    if (action === 'next') { goNext(); return; }
    if (action === 'close') { close(); return; }
    handleInput();
  });

  return { tick, drain };
}
