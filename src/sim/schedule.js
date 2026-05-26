// Generate the player's active-session schedule across the simulated run.
//
// Shape of an "active window": { start, end } in seconds from t=0. Outside
// windows the player is idle — rate still accrues, multiplied by offlineMul
// (Drift), but no purchases or rerolls fire.
//
// The default pattern matches the brief: front-load activity on the first
// day, then 2-5 long bursts + 5-10 short bursts per day after that.

const DAY = 24 * 60 * 60;

function rng(seedRef) {
  // Mulberry32 — small, fast, deterministic. seedRef is mutated so each call
  // advances the stream; lets the same config replay identically.
  return function next() {
    seedRef.s = (seedRef.s + 0x6D2B79F5) | 0;
    let t = seedRef.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rand, base, spread) {
  return base + (rand() * 2 - 1) * spread;
}

// Layered windows: a few long bursts spaced through waking hours + many short
// bursts sprinkled between. All clamped inside an awake band so the player is
// not "playing" at 3am.
function dayBursts({
  dayIndex, awakeStart, awakeEnd, longBursts, shortBursts,
  longMinutes, shortMinutes, rand,
}) {
  const windows = [];
  const dayStart = dayIndex * DAY;
  const lo = dayStart + awakeStart * 3600;
  const hi = dayStart + awakeEnd * 3600;
  const span = hi - lo;
  if (span <= 0) return windows;

  // Long bursts — evenly spaced anchors with jitter.
  for (let i = 0; i < longBursts; i++) {
    const anchor = lo + ((i + 0.5) / longBursts) * span;
    const center = jitter(rand, anchor, span / (longBursts * 3));
    const dur = jitter(rand, longMinutes, longMinutes * 0.4) * 60;
    windows.push({ start: center - dur / 2, end: center + dur / 2 });
  }

  // Short bursts — uniform random across awake band.
  for (let i = 0; i < shortBursts; i++) {
    const center = lo + rand() * span;
    const dur = jitter(rand, shortMinutes, shortMinutes * 0.5) * 60;
    windows.push({ start: center - dur / 2, end: center + dur / 2 });
  }

  return windows;
}

// Merge overlapping or adjacent windows so the simulator doesn't see two
// "back-to-back" sessions when they should read as one.
function mergeWindows(windows, gapTolerance = 30) {
  if (!windows.length) return [];
  const sorted = windows.slice().sort((a, b) => a.start - b.start);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end + gapTolerance) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function buildSchedule(config) {
  const seedRef = { s: (config.seed | 0) || 1 };
  const rand = rng(seedRef);
  const days = config.days || 7;
  const windows = [];

  for (let d = 0; d < days; d++) {
    const isOpener = d === 0;
    const longBursts = isOpener
      ? config.openerLongBursts
      : (config.longBurstsMin + Math.floor(rand() * (config.longBurstsMax - config.longBurstsMin + 1)));
    const shortBursts = isOpener
      ? config.openerShortBursts
      : (config.shortBurstsMin + Math.floor(rand() * (config.shortBurstsMax - config.shortBurstsMin + 1)));

    const bursts = dayBursts({
      dayIndex: d,
      awakeStart: config.awakeStartHr,
      awakeEnd: config.awakeEndHr,
      longBursts,
      shortBursts,
      longMinutes: isOpener ? config.openerLongMinutes : config.longBurstMinutes,
      shortMinutes: isOpener ? config.openerShortMinutes : config.shortBurstMinutes,
      rand,
    });
    windows.push(...bursts);
  }

  return mergeWindows(windows);
}

export const DEFAULT_SCHEDULE_CONFIG = {
  seed: 1,
  days: 7,
  awakeStartHr: 8,
  awakeEndHr: 23,
  // Day 0 — heavy onboarding session: a couple of long stretches plus extras.
  openerLongBursts: 3,
  openerShortBursts: 8,
  openerLongMinutes: 25,
  openerShortMinutes: 4,
  // Days 1+ — the brief: "2-5 long bursts a day, and 5-10 short ones".
  longBurstsMin: 2,
  longBurstsMax: 5,
  shortBurstsMin: 5,
  shortBurstsMax: 10,
  longBurstMinutes: 15,
  shortBurstMinutes: 2,
};

// Helper for the UI: total active time over the schedule.
export function totalActiveSeconds(windows) {
  let s = 0;
  for (const w of windows) s += Math.max(0, w.end - w.start);
  return s;
}

// At wall-clock `t`, return the active window we are inside (or null), and the
// next window starting after t. Used to advance simulation time in big chunks
// during idle periods.
export function locate(windows, t) {
  // Linear scan is fine — schedules are < ~100 entries for a week.
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (t >= w.start && t < w.end) return { inside: w, next: windows[i + 1] || null, idx: i };
    if (t < w.start) return { inside: null, next: w, idx: i };
  }
  return { inside: null, next: null, idx: windows.length };
}
