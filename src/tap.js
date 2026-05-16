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
// 4. Android's touch slop (~8px) is *smaller* than our 15px movement
//    tolerance, so a horizontal pan on `touch-action: pan-x` containers
//    claims the scroll before pointermove crosses the threshold — we get
//    pointercancel with `moved` still false and would (wrongly) fire. Two
//    guards combine to catch this:
//      (a) snapshot the nearest scrollable ancestor's scroll position at
//          pointerdown and treat any change by fire time as movement.
//      (b) re-check finger displacement at fire time against the cancel/up
//          event's own clientX/Y — covers the window where the browser
//          claimed the gesture and skipped pointermove dispatch, but the
//          scroll position hasn't committed yet either. iOS stationary
//          pointercancel keeps the finger at the down position, so this
//          extra check doesn't lose taps the other rules already accept.
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

// Walk up from the touched node to the first ancestor that actually overflows
// and is scrollable. Returns null if nothing scrolls — common case for fixed
// HUD chrome where the scroll-snapshot check is a no-op.
function findScrollableAncestor(el) {
  let n = el;
  while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    const ox = cs.overflowX, oy = cs.overflowY;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth) return n;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    n = n.parentNode;
  }
  return null;
}

export function installTap(el, handler) {
  let tap = null;
  function start(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const scroller = findScrollableAncestor(e.target);
    tap = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      target: e.target, moved: false,
      scroller,
      scrollX: scroller ? scroller.scrollLeft : 0,
      scrollY: scroller ? scroller.scrollTop : 0,
    };
  }
  function move(e) {
    if (!tap || e.pointerId !== tap.id) return;
    if (!isWithinTapTolerance(e.clientX - tap.x, e.clientY - tap.y)) tap.moved = true;
  }
  function fire(e) {
    if (!tap || e.pointerId !== tap.id) return;
    const s = tap; tap = null;
    if (s.moved) return;
    // Fire-time displacement check: pointermove may have been swallowed by
    // the browser when it claimed a scroll. The cancel/up event still
    // carries the current finger position, which is enough to detect pans.
    if (!isWithinTapTolerance(e.clientX - s.x, e.clientY - s.y)) return;
    // Android scroll-claim guard: the browser may commit to a pan and fire
    // pointercancel before pointermove crosses our tolerance. A changed
    // scroll position on the nearest scrollable ancestor is unambiguous
    // evidence the gesture was a scroll, not a tap.
    if (s.scroller && (s.scroller.scrollLeft !== s.scrollX || s.scroller.scrollTop !== s.scrollY)) return;
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
