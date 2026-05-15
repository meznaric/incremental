// Tap-stable delegated input for iOS Chrome. Plain `click` is dropped on iOS
// when an ancestor of the touched node has its innerHTML rewritten between
// touchstart and the synthetic click — which happens here on every 100ms HUD
// tick. Pointer events resolve at pointerdown's target regardless of DOM
// churn, so we act on pointerup with a movement threshold, then dedup the
// synthetic click that follows on touch.
//
// `handler` is called once per tap, with the original event (pointerup or
// click) and the recorded down-target as a second arg. Use the down-target
// when routing — pointerup may re-target on iOS if the DOM rewrote between
// pointerdown and pointerup.
//
// Movement > 10px between pointerdown and pointerup means a scroll/drag and
// the tap is discarded. Non-primary buttons (e.g. right-click) are ignored.
export function installTap(el, handler) {
  let tap = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, moved: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true;
  });
  el.addEventListener('pointercancel', (e) => {
    if (tap && e.pointerId === tap.id) tap = null;
  });
  el.addEventListener('pointerup', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    const s = tap; tap = null;
    if (s.moved) return;
    el._tapAt = performance.now();
    handler(e, s.target);
  });
  // Click fallback for environments without PointerEvent (and to keep
  // keyboard / a11y simulated clicks working). Deduped against pointerup so
  // the same tap doesn't fire twice.
  el.addEventListener('click', (e) => {
    if (el._tapAt && performance.now() - el._tapAt < 700) return;
    handler(e, e.target);
  });
}
