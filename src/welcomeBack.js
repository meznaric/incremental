// Signal Lock — the "welcome back" screen.
//
// Honest accounting only. The earnings number has already been credited inside
// loadState before we display it; we just *show* it. Breakdown rows are derived
// from the same state values that integrateRate used over [savedAt, now], so the
// shown factors match the math.
//
// voice: Sera. Procedural, second person. Periods always.
import { formatAbbrev } from './bignum.js';
import { installTap } from './tap.js';

// Below this and we don't bother — anything shorter reads as a page refresh,
// not a return.
const MIN_OFFLINE_S = 60;

const COUNT_DURATION_MS = 1800;

// Cubic ease-out: starts fast, settles to the final value with a soft landing.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function fmtAway(s) {
  function unit(v, one, many) {
    return `${v} ${v === '1.0' || v === '1' ? one : many}`;
  }
  if (s < 60) {
    return unit(String(Math.max(1, Math.round(s))), 'second', 'seconds');
  }
  if (s < 3600) {
    const m = s / 60;
    return unit(m < 10 ? m.toFixed(1) : String(Math.round(m)), 'minute', 'minutes');
  }
  if (s < 86400) {
    const h = s / 3600;
    return unit(h < 10 ? h.toFixed(1) : String(Math.round(h)), 'hour', 'hours');
  }
  const d = s / 86400;
  return unit(d < 10 ? d.toFixed(1) : String(Math.round(d)), 'day', 'days');
}

// Build the breakdown rows. Reads the snapshot the player left behind, not
// any post-load fresh-boot state.
function buildBreakdown(state, savedAt, offline, extras) {
  const rows = [];

  const base = ((state.basePerSecond || 0) + (state.flatBonus || 0)) * (state.permMul || 1);
  rows.push({ label: 'Base carrier', value: `${formatAbbrev(base)}/s` });

  rows.push({ label: 'Time away', value: fmtAway(offline) });

  // Rate-mul buffs (Carrier windows) that were live during any part of the
  // away window. expiresAt > savedAt means the buff was still ticking when
  // Kalen left. If expiresAt < now, it ran out mid-AFK — show that honestly.
  //
  // Collapse policy: ≤3 active windows → one row each, with the per-buff
  // ran-out detail. >3 windows → a single summary row counting them and
  // surfacing whether any expired mid-AFK. A stacked rate run with twenty
  // buffs otherwise drowns the rest of the breakdown.
  const rateMuls = (state.buffs && state.buffs.rateMul) || [];
  const liveBuffs = rateMuls.filter((b) => b.expiresAt > savedAt);
  const COLLAPSE_AT = 3;
  if (liveBuffs.length <= COLLAPSE_AT) {
    for (const b of liveBuffs) {
      const liveUntil = Math.min(b.expiresAt, savedAt + offline);
      const liveFor = Math.max(0, liveUntil - savedAt);
      const ranOut = b.expiresAt < savedAt + offline;
      const note = ranOut ? `held ${fmtAway(liveFor)} of the away window` : 'held the whole away window';
      rows.push({ label: `Carrier window ×${b.value}`, value: note });
    }
  } else {
    const ranOut = liveBuffs.filter((b) => b.expiresAt < savedAt + offline).length;
    const stacked = liveBuffs.reduce((acc, b) => acc * b.value, 1);
    const note = ranOut === 0
      ? 'all held the whole away window'
      : ranOut === liveBuffs.length
        ? 'all ran out mid-AFK'
        : `${ranOut} ran out mid-AFK · ${liveBuffs.length - ranOut} held`;
    rows.push({
      label: `Carrier windows · ${liveBuffs.length} stacked (×${stacked.toFixed(stacked >= 10 ? 0 : 1)})`,
      value: note,
    });
  }

  // Echo Memory — Contact Log scalar. Don't show if it's a no-op.
  const memMul = state.memoryMul;
  if (Number.isFinite(memMul) && memMul > 1.0001) {
    rows.push({ label: 'Echo Memory', value: `×${memMul.toFixed(2)}` });
  }

  // Ascent — Carrier Engraving exponent. Only show if it's actually lifting.
  const exp = state.ascentExp;
  if (Number.isFinite(exp) && exp > 0) {
    rows.push({ label: 'Ascent', value: `rate^(1 + ${exp.toFixed(2)})` });
  }

  // Drift — offline-only multiplier on the foreground integral. Only show if
  // it actually moved the number.
  const offMul = Number(extras && extras.offlineMul) || 1;
  if (offMul > 1.0001) {
    rows.push({ label: 'Drift', value: `×${offMul.toFixed(2)} offline gain` });
  }

  // Seed-Relay network outcomes. Only surface rows that actually have value
  // — empty mesh means no extra noise on the panel.
  const bleed = Number(extras && extras.networkBleed) || 0;
  if (bleed > 0) {
    rows.push({ label: 'Mesh bleed', value: `+${formatAbbrev(bleed)} Echoes` });
  }
  const sweep = Number(extras && extras.networkRerollsGained) || 0;
  if (sweep > 0) {
    rows.push({ label: 'Reroll-drops', value: `+${sweep} re-roll${sweep === 1 ? '' : 's'}` });
  }
  const losses = Number(extras && extras.networkLosses) || 0;
  if (losses > 0) {
    rows.push({ label: 'Relays pulled', value: `${losses} compromised` });
  }

  return rows;
}

function copyLines(offline) {
  // Sera. Three short procedural sentences. Periods. No questions, no warmth
  // beyond the dry registry-clerk register. Two variants for short vs long
  // absences — the math difference is the only flourish.
  if (offline < 3600) {
    return [
      'You stepped off the console.',
      'The rig kept listening on the band you left tuned.',
      'Here is what came back.',
    ];
  }
  return [
    `You were gone ${fmtAway(offline)}.`,
    'The rig kept listening on the band you left tuned.',
    'Here is what came back.',
  ];
}

export function showWelcomeBack({
  state, offline, earnings, savedAt, onDismiss,
  networkBleed = 0, networkLosses = 0, offlineMul = 1, networkRerollsGained = 0,
}) {
  if (!Number.isFinite(offline) || offline < MIN_OFFLINE_S) return false;
  // The mesh can carry a session even when foreground earnings are zero —
  // pure-bleed sessions and pure-loss sessions both deserve the screen.
  const meshPositive = networkBleed > 0 || networkRerollsGained > 0;
  const meshSignal = meshPositive || networkLosses > 0;
  if ((!Number.isFinite(earnings) || earnings <= 0) && !meshSignal) return false;

  const root = document.getElementById('welcomeBack');
  if (!root) return false;

  const titleEl = root.querySelector('.wb-title');
  const linesEl = root.querySelector('.wb-lines');
  const numberEl = root.querySelector('.wb-number');
  const breakdownEl = root.querySelector('.wb-breakdown');
  const collectBtn = root.querySelector('.wb-collect');

  titleEl.textContent = 'Signal Lock';

  const lines = copyLines(offline);
  linesEl.innerHTML = lines.map((l) => `<div class="wb-line">${l}</div>`).join('');

  const rows = buildBreakdown(state, savedAt, offline, { networkBleed, networkLosses, offlineMul, networkRerollsGained });
  breakdownEl.innerHTML = rows
    .map((r) => `<div class="wb-row"><span class="wb-row-label">${r.label}</span><span class="wb-row-value">${r.value}</span></div>`)
    .join('');

  // Seed the count-up at zero. Don't reveal the final value until the animation
  // completes — the unveil is the whole point of the screen.
  numberEl.textContent = formatAbbrev(0);

  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('wb-visible'));

  let raf = 0;
  let startMs = 0;
  let dismissed = false;

  function step(now) {
    if (dismissed) return;
    if (!startMs) startMs = now;
    const elapsed = now - startMs;
    const t = Math.min(1, elapsed / COUNT_DURATION_MS);
    const eased = easeOutCubic(t);
    numberEl.textContent = formatAbbrev(earnings * eased);
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      // Lock the final exact value so it doesn't drift from earlier rounding.
      numberEl.textContent = formatAbbrev(earnings);
      numberEl.classList.add('wb-number-settled');
    }
  }
  raf = requestAnimationFrame(step);

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    cancelAnimationFrame(raf);
    // Snap to the final value if the player taps mid-animation. They earned it.
    numberEl.textContent = formatAbbrev(earnings);
    root.classList.remove('wb-visible');
    setTimeout(() => {
      root.style.display = 'none';
      numberEl.classList.remove('wb-number-settled');
      root.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
      onDismiss && onDismiss();
    }, 200);
  }

  function onBackdrop(e) {
    // Backdrop tap dismisses; clicks inside the card do not.
    if (e.target === root) dismiss();
  }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  // Bind installTap once; route taps through a per-invocation closure ref so
  // re-shows of the modal hit their own dismiss().
  collectBtn._wbDismiss = dismiss;
  if (!collectBtn._wbTapBound) {
    collectBtn._wbTapBound = true;
    installTap(collectBtn, () => { collectBtn._wbDismiss && collectBtn._wbDismiss(); });
  }
  root.addEventListener('click', onBackdrop);
  window.addEventListener('keydown', onKey);

  return true;
}
