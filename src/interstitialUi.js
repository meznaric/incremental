import { INTERSTITIALS } from './interstitial.js';

const TYPE_MS_PER_CHAR = 22;

export function makeInterstitialUi(state, onShown) {
  const root = document.getElementById('interstitial');
  const textEl = root.querySelector('.it-text');
  const hintEl = root.querySelector('.it-hint');
  const dotsEl = root.querySelector('.it-dots');

  let active = null;       // { id, def, stepIdx }
  let typing = null;       // { i, full, raf, doneAt }
  let waitingInput = false;
  let autoTimer = 0;

  function open(id) {
    const def = INTERSTITIALS[id];
    if (!def) return;
    active = { id, def, stepIdx: 0 };
    root.style.display = 'flex';
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
    root.classList.remove('it-visible');
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
    typing = { i: 0, full: step.text, doneAt: 0 };
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
  root.addEventListener('click', handleInput);

  return { tick, drain };
}
