// Unified tap helper. Why this is non-trivial on iOS:
//
// 1. iOS drops the synthesized `click` when an ancestor of the touched node
//    rewrites its innerHTML between pointerdown and pointerup (e.g. our 100ms
//    HUD tick or the welcome-back count-up animation). Pointer events resolve
//    at pointerdown's target, immune to DOM churn — so we act on pointerup.
//
// 2. iOS fires `pointercancel` (not `pointerup`) for *stationary* taps when an
//    ancestor "claims" the gesture: scrollable parents (`overflow: auto`), a
//    layout-changing rAF tick mid-gesture, or sub-pixel finger jitter. Treat
//    pointercancel as "tap still valid if movement was below threshold" — this
//    is the load-bearing detail that prior fixes missed.
//
// 3. `click` is kept as a fallback for keyboard / a11y synthesis, deduped
//    against a recent pointer-driven fire so the same tap doesn't run twice.
//
// `handler(event, downTarget)` is invoked once per tap. `downTarget` is the
// element the finger first landed on — use it for routing because the
// pointerup/click target can differ on iOS if the DOM rewrote mid-gesture.

const MOVE_TOLERANCE_PX = 15;
const CLICK_DEDUP_MS = 700;

export const TAP_MOVE_TOLERANCE_PX = MOVE_TOLERANCE_PX;

export function isWithinTapTolerance(dx, dy, tolerance = MOVE_TOLERANCE_PX) {
  return Math.hypot(dx, dy) <= tolerance;
}

export function installTap(el, handler) {
  let tap = null;
  function start(e) {
    if (e.button !== undefined && e.button !== 0) return;
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, moved: false };
  }
  function move(e) {
    if (!tap || e.pointerId !== tap.id) return;
    if (!isWithinTapTolerance(e.clientX - tap.x, e.clientY - tap.y)) tap.moved = true;
  }
  function fire(e) {
    if (!tap || e.pointerId !== tap.id) return;
    const s = tap; tap = null;
    if (s.moved) return;
    el._tapAt = performance.now();
    handler(e, s.target);
  }
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', fire);
  // Critical: pointercancel can fire on iOS for valid stationary taps. Honour
  // it the same as pointerup as long as movement stayed under the threshold.
  el.addEventListener('pointercancel', fire);
  el.addEventListener('click', (e) => {
    if (el._tapAt && performance.now() - el._tapAt < CLICK_DEDUP_MS) return;
    handler(e, e.target);
  });
}
