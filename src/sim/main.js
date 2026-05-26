// Page glue. Reads control values, runs the sim, renders charts + summary.
// Lives off the main game entirely; safe to load alongside index.html.

import { runSim } from './runner.js';
import { createChart, cycleColor, fmtSeconds, fmtNumber } from './chart.js';
import { ENGRAVINGS } from '../contactLog.js';

const DEFAULT_CONFIG = {
  // run
  'ctl-cycles': 10, 'ctl-days': 30, 'ctl-active-tick': 4,
  'ctl-sample': 600, 'ctl-seed': 1,
  // schedule
  'ctl-awake-start': 8, 'ctl-awake-end': 23,
  'ctl-opener-long': 3, 'ctl-opener-short': 8,
  'ctl-opener-long-min': 25, 'ctl-opener-short-min': 4,
  'ctl-long-min': 2, 'ctl-long-max': 5,
  'ctl-short-min': 5, 'ctl-short-max': 10,
  'ctl-long-len': 15, 'ctl-short-len': 2,
  // policy
  'ctl-payback': 10800, 'ctl-buff-cost': 1800, 'ctl-reroll': 600,
  'ctl-gamble': true, 'ctl-early-close': 6,
  // carry-in
  'ctl-start-mass': 0, 'ctl-start-memory': 0,
};

function getNum(id) {
  const el = document.getElementById(id);
  return Number(el.value);
}
function getBool(id) {
  const el = document.getElementById(id);
  return !!el.checked;
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!v;
  else el.value = v;
}

function gather() {
  return {
    runnerConfig: {
      cycles: getNum('ctl-cycles'),
      maxRunSeconds: getNum('ctl-days') * 86400,
      activeTickSeconds: getNum('ctl-active-tick'),
      sampleSeconds: getNum('ctl-sample'),
      idleStepSeconds: getNum('ctl-sample'),
      earlyCloseEtaSeconds: getNum('ctl-early-close') * 3600,
    },
    scheduleConfig: {
      seed: getNum('ctl-seed'),
      days: getNum('ctl-days'),
      awakeStartHr: getNum('ctl-awake-start'),
      awakeEndHr: getNum('ctl-awake-end'),
      openerLongBursts: getNum('ctl-opener-long'),
      openerShortBursts: getNum('ctl-opener-short'),
      openerLongMinutes: getNum('ctl-opener-long-min'),
      openerShortMinutes: getNum('ctl-opener-short-min'),
      longBurstsMin: getNum('ctl-long-min'),
      longBurstsMax: getNum('ctl-long-max'),
      shortBurstsMin: getNum('ctl-short-min'),
      shortBurstsMax: getNum('ctl-short-max'),
      longBurstMinutes: getNum('ctl-long-len'),
      shortBurstMinutes: getNum('ctl-short-len'),
    },
    policy: {
      paybackSeconds: getNum('ctl-payback'),
      buffCostSeconds: getNum('ctl-buff-cost'),
      rerollBudgetSeconds: getNum('ctl-reroll'),
      allowGambles: getBool('ctl-gamble'),
    },
    startingLog: makeStartingLog(),
  };
}

// Build a "what if I had X mass / Y contacts already" starting log without
// fabricating world entries. Mass is given directly. Memory shards we
// simulate by adding placeholder log entries whose only purpose is to lift
// memoryMul (the formula counts log.worlds.length).
function makeStartingLog() {
  const mass = getNum('ctl-start-mass');
  const memShards = Math.min(100, Math.max(0, getNum('ctl-start-memory')));
  if (mass === 0 && memShards === 0) return null;
  const log = {
    run: 1, worlds: [], mass, engravings: {}, bestPeak: 0,
    cycleEp: 1,
    pattern: null, pendingPatternChoice: false, patternUsed: {}, patternCompleted: {},
    loopMode: false, loopCycles: 0,
    lastNamesSeenCount: 0, lastRigSeenMass: 0,
    firstCloseBeatShown: true, firstEngravingSeen: true, firstContactSeen: true,
    firstRelaySeen: true, firstConvertSeen: true, seasonCompleteShown: true,
    introSeen: true, pickedName: '',
  };
  for (let i = 0; i < memShards; i++) {
    log.worlds.push({
      id: `seeded_${i}`, name: `SEEDED-${i}`, ep: 99, status: 'PROSPERED',
      contactedAt: 0, run: 0,
    });
  }
  return log;
}

function showStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  if (!isError) setTimeout(() => el.classList.remove('show'), 1800);
}

function renderSummary(result) {
  const el = document.getElementById('summary');
  const t = result.total;
  const closed = result.cycles.filter((c) => !c.inProgress);
  const lastCycle = closed[closed.length - 1];
  const peak = lastCycle ? lastCycle.peak : 0;
  const ms = closed.reduce((s, c) => s + c.massBanked, 0);
  const lastSample = result.samples[result.samples.length - 1] || { t: 0, rate: 0 };
  const requested = Number(document.getElementById('ctl-cycles').value);
  const cards = [
    { label: 'Cycles closed', value: `${closed.length} / ${requested}`, sub: `${t.sessions} sessions scheduled` },
    { label: 'Total play time', value: fmtSeconds(lastSample.t), sub: `${fmtSeconds(t.activeSeconds)} active · ${fmtSeconds(t.idleSeconds)} idle` },
    { label: 'Decisions', value: t.decisions.toLocaleString(), sub: `${t.buys} buys · ${t.rerolls} rerolls · ${t.gambles} gambles` },
    { label: 'Final rate', value: fmtNumber(lastSample.rate) + '/s', sub: `Peak this run ${fmtNumber(peak)}` },
    { label: 'Carrier Mass', value: result.log.mass + ' kg', sub: `+${ms} banked across run` },
    { label: 'Echo Memory', value: '×' + (result.samples[result.samples.length - 1]?.memoryMul || 1).toFixed(2), sub: `${result.log.worlds.length} contacts logged` },
  ];
  el.innerHTML = cards.map((c) => `
    <div class="summary-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderCycleTable(result) {
  const el = document.getElementById('cycleTable');
  const rows = result.cycles.map((c) => {
    const engChanges = [];
    for (const def of ENGRAVINGS) {
      const before = (c.engravingsBefore && c.engravingsBefore[def.id]) || 0;
      const after = (c.engravingsAfter && c.engravingsAfter[def.id]) || 0;
      if (after > before) engChanges.push(`${def.name} +${after - before}`);
    }
    const prefix = c.inProgress
      ? `<span style="color:#ff8a3a;">stuck @ ${fmtNumber(c.nextThreshold || 0)}, ${c.contactsToFill || 0} contacts to go · </span>`
      : (c.earlyClose ? `<span style="color:#9d6ee0;">early-close · </span>` : '');
    const tag = prefix + (engChanges.join(' · ') || (c.inProgress ? '' : '—'));
    return `
      <div class="cell num">${c.inProgress ? '~' : ''}#${c.index + 1}</div>
      <div class="cell">${fmtSeconds(c.durationS)}${c.inProgress ? '+' : ''}</div>
      <div class="cell peak">${fmtNumber(c.peak)}</div>
      <div class="cell">${c.contactsThisCycle}/10</div>
      <div class="cell mass">${c.inProgress ? '—' : `+${c.massBanked}kg`}</div>
      <div class="cell">×${c.memoryMul.toFixed(2)}</div>
      <div class="cell">${c.massLeft}kg left</div>
      <div class="cell eng">${tag}</div>
    `;
  }).join('');
  el.innerHTML = `
    <div class="cell head">#</div>
    <div class="cell head">Duration</div>
    <div class="cell head">Peak</div>
    <div class="cell head">Contacts</div>
    <div class="cell head">Mass</div>
    <div class="cell head">Memory</div>
    <div class="cell head">Bank</div>
    <div class="cell head">Engravings bought</div>
    ${rows}
  `;
}

function renderEngravings(result) {
  const el = document.getElementById('engravings');
  el.innerHTML = ENGRAVINGS.map((def) => {
    const lvl = (result.log.engravings || {})[def.id] || 0;
    return `
      <div class="eng">
        <div><span class="name">${def.name}</span> <span class="lvl">lvl ${lvl}</span> <span class="max">/ max ${def.max}</span></div>
        <div class="max">${def.desc}</div>
      </div>
    `;
  }).join('');
}

function diag({ kind, title, desc }) {
  return `<div class="diag ${kind}"><div class="title">${title}</div><div class="desc">${desc}</div></div>`;
}

function renderDiagnostics(result) {
  const el = document.getElementById('diagnostics');
  const cards = [];
  const closed = result.cycles.filter((c) => !c.inProgress);
  const stuckCycle = result.cycles.find((c) => c.inProgress);
  const requested = Number(document.getElementById('ctl-cycles').value);

  if (closed.length < requested) {
    const dur = result.samples[result.samples.length - 1]?.t || 0;
    cards.push(diag({
      kind: closed.length === 0 ? 'bad' : 'warn',
      title: `Only ${closed.length} / ${requested} cycles closed in ${fmtSeconds(dur)}`,
      desc: stuckCycle
        ? `Cycle ${stuckCycle.index + 1} stalled at peak ${fmtNumber(stuckCycle.peak)} — needs to reach ${fmtNumber(stuckCycle.nextThreshold || 0)} for the next contact. EP difficulty climbs by orders of magnitude each cycle.`
        : 'Bump days, drop the EP step in interstitial.js thresholdsForEp, or buff engraving payouts.',
    }));
  }

  // Cycle-length distribution.
  const durs = result.cycles.map((c) => c.durationS);
  if (durs.length) {
    const min = Math.min(...durs), max = Math.max(...durs), avg = durs.reduce((a, b) => a + b, 0) / durs.length;
    const variance = durs.length > 1 ? (max / Math.max(min, 1)) : 1;
    cards.push(diag({
      kind: variance > 6 ? 'warn' : 'ok',
      title: 'Cycle length spread',
      desc: `Shortest ${fmtSeconds(min)} · longest ${fmtSeconds(max)} · avg ${fmtSeconds(avg)}.${
        variance > 6 ? ' Big gap — early/late cycles drift too far apart.' : ''
      }`,
    }));
  }

  // Mass per cycle trend.
  if (result.cycles.length >= 3) {
    const m = result.cycles.map((c) => c.massBanked);
    const first = m.slice(0, Math.max(1, Math.floor(m.length / 3))).reduce((a, b) => a + b, 0) / Math.floor(m.length / 3);
    const last = m.slice(-Math.max(1, Math.floor(m.length / 3))).reduce((a, b) => a + b, 0) / Math.floor(m.length / 3);
    const trend = last - first;
    cards.push(diag({
      kind: trend < 0 ? 'warn' : trend === 0 ? 'warn' : 'ok',
      title: 'Mass per cycle trend',
      desc: `Early avg ${first.toFixed(1)}kg → late avg ${last.toFixed(1)}kg. ${
        trend < 0 ? 'Late cycles bank LESS than early ones — late game may feel like a loss.' :
        trend === 0 ? 'Flat — engravings still progress but the ceiling does not climb.' :
        'Climbing — bigger pushes each cycle.'
      }`,
    }));
  }

  // Idle vs active ratio.
  const ratio = result.total.activeSeconds / Math.max(1, result.total.activeSeconds + result.total.idleSeconds);
  cards.push(diag({
    kind: 'ok',
    title: 'Active share',
    desc: `${(ratio * 100).toFixed(1)}% of wall-clock was active play (${fmtSeconds(result.total.activeSeconds)} / ${fmtSeconds(result.total.activeSeconds + result.total.idleSeconds)}).`,
  }));

  // Long stalls inside active windows: did the player run out of buyable cards?
  let buysPerHour = result.total.buys / Math.max(1 / 3600, result.total.activeSeconds / 3600);
  cards.push(diag({
    kind: buysPerHour < 30 ? 'warn' : buysPerHour > 800 ? 'warn' : 'ok',
    title: 'Tap economy',
    desc: `${buysPerHour.toFixed(0)} buys / active-hour. ${
      buysPerHour < 30 ? 'Slow — stalls or unaffordable slates dominate.' :
      buysPerHour > 800 ? 'Spammy — cards are too cheap relative to rate.' : 'Healthy.'
    }`,
  }));

  // Engraving coverage.
  const totalEngLevels = Object.values(result.log.engravings || {}).reduce((a, b) => a + b, 0);
  const maxPossible = ENGRAVINGS.reduce((s, e) => s + e.max, 0);
  cards.push(diag({
    kind: totalEngLevels < 5 ? 'bad' : totalEngLevels < 15 ? 'warn' : 'ok',
    title: 'Engraving progress',
    desc: `${totalEngLevels} / ${maxPossible} levels across all engravings.`,
  }));

  el.innerHTML = cards.join('');
}

// ----- chart wiring -----
const charts = [
  { chart: createChart(document.getElementById('chart-balance'), { yLog: true, label: 'Echoes', value: (s) => s.amount }), togId: 'tog-balance-log' },
  { chart: createChart(document.getElementById('chart-rate'),    { yLog: true, label: 'Echoes/s', value: (s) => s.rate }), togId: 'tog-rate-log' },
  { chart: createChart(document.getElementById('chart-memory'),  { yLog: false, label: 'Echo Memory ×', value: (s) => s.memoryMul }), togId: null },
];
for (const c of charts) {
  if (c.togId) {
    document.getElementById(c.togId).addEventListener('change', (e) => c.chart.setLogY(e.target.checked));
  }
}

// Cycle visibility — one shared Set across every chart so the chips drive
// every pane in lockstep. null until the first run.
let visibleCycles = null;
function applyVisibility() {
  for (const c of charts) c.chart.setVisible(visibleCycles);
}

function renderCycleChips(cycleList) {
  const el = document.getElementById('cycleChips');
  if (!el) return;
  if (!cycleList.length) { el.innerHTML = ''; return; }
  const set = visibleCycles = new Set(visibleCycles || cycleList.map((c) => c.index));
  el.innerHTML = `
    <button class="chip-action" data-act="all">All</button>
    <button class="chip-action" data-act="none">None</button>
    ${cycleList.map((c) => {
      const color = cycleColor(c.index);
      const on = set.has(c.index);
      return `<button class="chip${on ? ' on' : ''}" data-idx="${c.index}" style="--c:${color}">
        <span class="dot"></span>
        Cycle ${c.index + 1}${c.inProgress ? ' (in-progress)' : ''}
        <span class="meta">${fmtSeconds(c.durationS)} · ${fmtNumber(c.peak)}</span>
      </button>`;
    }).join('')}
  `;
  el.onclick = (e) => {
    const t = e.target.closest('[data-idx],[data-act]');
    if (!t) return;
    if (t.dataset.act === 'all') visibleCycles = new Set(cycleList.map((c) => c.index));
    else if (t.dataset.act === 'none') visibleCycles = new Set();
    else {
      const idx = Number(t.dataset.idx);
      if (visibleCycles.has(idx)) visibleCycles.delete(idx);
      else visibleCycles.add(idx);
    }
    // Re-render chip states.
    for (const btn of el.querySelectorAll('[data-idx]')) {
      const idx = Number(btn.dataset.idx);
      btn.classList.toggle('on', visibleCycles.has(idx));
    }
    applyVisibility();
  };
  applyVisibility();
}

document.getElementById('resetBtn').addEventListener('click', () => {
  for (const [id, v] of Object.entries(DEFAULT_CONFIG)) setVal(id, v);
  showStatus('Config reset.');
});

document.getElementById('runBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  showStatus('Running…');
  // Yield a frame so the disabled-state paints before the heavy work.
  await new Promise((r) => requestAnimationFrame(r));
  const cfg = gather();
  const t0 = performance.now();
  let result;
  try {
    result = runSim(cfg);
  } catch (e) {
    console.error(e);
    showStatus('Sim crashed — see console: ' + e.message, true);
    btn.disabled = false;
    return;
  }
  const elapsed = performance.now() - t0;
  renderSummary(result);
  renderCycleTable(result);
  renderEngravings(result);
  renderDiagnostics(result);
  // Reset visibility so the chips re-default to "all on" on each run.
  visibleCycles = null;
  renderCycleChips(result.cycles);
  const common = { samples: result.samples, cycles: result.cycles, visible: visibleCycles };
  for (const c of charts) c.chart.setData(common);
  showStatus(`Done in ${elapsed.toFixed(0)} ms — ${result.samples.length} samples, ${result.cycles.length} cycles.`);
  btn.disabled = false;
});

// Auto-run once on load so the page is not blank.
document.getElementById('runBtn').click();
