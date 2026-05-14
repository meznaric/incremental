import {
  sortedWorlds, getRun, canCloseCycle, cycleContactCount,
  memoryShards, memoryMul, ECHO_MEMORY_PER_SHARD,
  ENGRAVINGS, engravingCost, canBuyEngraving, buyEngraving,
  getMass, getEngraving, massForPeak, WORLD_FOR_INTERSTITIAL,
  worldDetail,
} from './contactLog.js';
import { nextContactMilestone, MILESTONE_THRESHOLDS } from './interstitial.js';
import { formatAbbrev } from './bignum.js';

// voice: Kalen. One-line hooks keyed to the *next* milestone, pulled from
// canonical episode beats (docs/lore/episodes.md). Surfaces what is coming
// without spoiling S2/S3 — the lines are dry, anticipatory, never confirm a
// mystery before its episode lands.
const NEXT_HOOK = {
  milestone_1k:  'There is a desert world on the carrier tonight. Their radios are oil-lit and small.',
  milestone_1m:  'Something below the thermocline is singing. I don\'t think it knows I can hear.',
  milestone_1b:  'The auroras over Vehrn-9 are reading me back. Someone there is doing the maths.',
  milestone_1t:  'Two Tarsan physicists are waiting for the correction. I keep almost not sending it.',
  milestone_1qa: 'Lehl is quiet. Long-lived. I do not want to be the thing that hurries them.',
  milestone_1qi: 'The pattern. The pattern keeps surfacing. I am almost ready to look at it directly.',
};

// The Contact Log is the only player-facing surface for the prestige loop.
// Header strip shows cycle/contacts/memory. The "Close the Cycle" action
// reveals a two-stage confirm — first click arms it, second click commits.
// The list groups worlds by the cycle that recorded them so the player can
// see their history layer by layer.
export function initContactLogUi(state, opts = {}) {
  const btn = document.getElementById('contactLogBtn');
  const modal = document.getElementById('contactLogModal');
  const body = modal.querySelector('.cl-body');
  const introEl = modal.querySelector('.cl-intro');
  const progressEl = modal.querySelector('.cl-progress');
  const hookEl = modal.querySelector('.cl-hook');
  const statsEl = modal.querySelector('.cl-stats');
  const actionEl = modal.querySelector('.cl-action');
  const listEl = modal.querySelector('.cl-list');
  const pendingEl = modal.querySelector('.cl-pending');
  const engravingsEl = modal.querySelector('.cl-engravings');
  let armed = false;
  // Which logged contact (by world id) has its lore panel expanded. Held in
  // closure rather than state — a session-level UI detail, not save data.
  let expandedId = null;

  function renderIntro() {
    if (!introEl) return;
    const log = state.contactLog;
    const n = (log && Array.isArray(log.worlds)) ? log.worlds.length : 0;
    const run = getRun(log);
    // voice: Kalen. The field log framed in his hand — first person, ambient.
    // Two short sentences, the second a small qualifier. Reframes the panel
    // as a personal notebook rather than a UI screen.
    const headK = n === 0
      ? `<em>Cycle ${run}. The notebook is open. No names yet.</em>`
      : `<em>Cycle ${run}. <strong>${n}</strong> name${n === 1 ? '' : 's'} on the log. I read them again before I sleep.</em>`;
    introEl.innerHTML = headK;
  }

  function renderProgress() {
    if (!progressEl) return;
    const next = nextContactMilestone(state);
    if (!next) {
      progressEl.innerHTML = `<div class="cl-progress-done">Every catalogued world is on the log.</div>`;
      return;
    }
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    // Progress measured against the *previous* milestone so the bar resets at
    // each contact and fills to the next — a single log-scale bar would feel
    // like it never moves.
    let prev = 0;
    for (const m of MILESTONE_THRESHOLDS) {
      if (m.id === next.id) break;
      if (WORLD_FOR_INTERSTITIAL[m.id]) prev = m.at;
    }
    const span = Math.max(1, next.at - prev);
    const pct = Math.max(0, Math.min(1, (peak - prev) / span));
    const remaining = Math.max(0, next.at - peak);
    progressEl.innerHTML = `
      <div class="cl-progress-head">
        <div class="cl-progress-label">Next contact</div>
        <div class="cl-progress-target">${formatAbbrev(next.at)} Echoes</div>
      </div>
      <div class="cl-progress-bar"><div class="cl-progress-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>
      <div class="cl-progress-foot">${peak >= next.at
        ? 'Ready. The contact will surface on the next eligible beat.'
        : `${formatAbbrev(remaining)} to go · ${(pct * 100).toFixed(0)}%`}</div>
    `;
  }

  function renderHook() {
    if (!hookEl) return;
    const next = nextContactMilestone(state);
    if (!next) {
      // After the last contact has fired the log itself becomes the question.
      // No spoilers — the line just acknowledges that the pattern is the next
      // thing on the desk. Maps to Ep 7 territory; consistent with the EP1
      // milestone_1qi beat that already exists.
      hookEl.innerHTML = `The names are in. Tonight I look at the route they took.`;
      return;
    }
    const line = NEXT_HOOK[next.id];
    hookEl.innerHTML = line ? line : '';
  }

  function renderPending() {
    if (!pendingEl) return;
    const log = state.contactLog;
    const contacted = new Set((log && log.worlds || []).map((w) => w.id));
    const rows = [];
    for (const m of MILESTONE_THRESHOLDS) {
      const def = WORLD_FOR_INTERSTITIAL[m.id];
      if (!def) continue;
      if (contacted.has(def.id)) continue;
      rows.push(`
        <li>
          <div class="cl-pending-name">${def.name}</div>
          <div class="cl-pending-at">at ${formatAbbrev(m.at)}</div>
        </li>
      `);
    }
    if (!rows.length) { pendingEl.innerHTML = ''; return; }
    pendingEl.innerHTML = `
      <div class="cl-pending-head">Awaiting contact</div>
      <ul class="cl-pending-list">${rows.join('')}</ul>
    `;
  }

  function renderStats() {
    const log = state.contactLog;
    const run = getRun(log);
    const cycleCount = cycleContactCount(log);
    const shards = memoryShards(log);
    const mul = memoryMul(log);
    const memoryPct = Math.round((mul - 1) * 100);
    const mass = getMass(log);
    statsEl.innerHTML = `
      <div class="cl-stat">
        <div class="cl-stat-label">Cycle</div>
        <div class="cl-stat-value">${run}</div>
      </div>
      <div class="cl-stat">
        <div class="cl-stat-label">This Cycle</div>
        <div class="cl-stat-value">${cycleCount} contact${cycleCount === 1 ? '' : 's'}</div>
      </div>
      <div class="cl-stat">
        <div class="cl-stat-label">Echo Memory</div>
        <div class="cl-stat-value cl-memory">+${memoryPct}%${shards ? ` · ${shards} shard${shards === 1 ? '' : 's'}` : ''}</div>
      </div>
      <div class="cl-stat">
        <div class="cl-stat-label">Carrier Mass</div>
        <div class="cl-stat-value cl-mass">${mass} kg</div>
      </div>
    `;
  }

  function renderEngravings() {
    if (!engravingsEl) return;
    const log = state.contactLog;
    const mass = getMass(log);
    const rows = ENGRAVINGS.map((e) => {
      const lvl = getEngraving(log, e.id);
      const maxed = lvl >= (e.max || Infinity);
      const cost = engravingCost(log, e.id);
      const can = canBuyEngraving(log, e.id);
      const isOneShot = (e.max || 0) === 1;
      const levelLabel = isOneShot
        ? (lvl > 0 ? 'cut' : '')
        : `lvl ${lvl}${e.max ? ` / ${e.max}` : ''}`;
      const costLabel = maxed
        ? 'maxed'
        : `${cost} kg`;
      const btnLabel = isOneShot
        ? (lvl > 0 ? 'Cut' : 'Cut into frame')
        : 'Cut deeper';
      return `
        <li class="cl-engraving${maxed ? ' is-maxed' : ''}${can && !maxed ? ' is-buyable' : ''}">
          <div class="cl-eng-head">
            <div class="cl-eng-name">${e.name}</div>
            <div class="cl-eng-level">${levelLabel}</div>
          </div>
          <div class="cl-eng-desc">${e.desc}</div>
          <div class="cl-eng-foot">
            <span class="cl-eng-cost">${costLabel}</span>
            <button type="button" class="cl-eng-btn"
              data-act="buy-engraving" data-id="${e.id}"
              ${maxed || !can ? 'disabled' : ''}>${btnLabel}</button>
          </div>
        </li>
      `;
    }).join('');
    engravingsEl.innerHTML = `
      <div class="cl-eng-head-row">
        <div class="cl-eng-title">Carrier Engravings</div>
        <div class="cl-eng-balance">${mass} kg</div>
      </div>
      <p class="cl-eng-hint">Cuts in the rig that survive every reset. Bought with Carrier Mass.</p>
      <ul class="cl-eng-list">${rows}</ul>
    `;
  }

  function renderAction() {
    const log = state.contactLog;
    const eligible = canCloseCycle(log);
    const cycleCount = cycleContactCount(log);
    const projectedPct = Math.round(ECHO_MEMORY_PER_SHARD * 100 * cycleCount);
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    const projectedMass = massForPeak(peak);
    if (!eligible) {
      actionEl.classList.remove('armed');
      actionEl.innerHTML = `
        <div class="cl-action-hint">Reach a milestone to close the cycle.</div>
      `;
      return;
    }
    if (!armed) {
      actionEl.classList.remove('armed');
      actionEl.innerHTML = `
        <div class="cl-action-hint">${cycleCount} new name${cycleCount === 1 ? '' : 's'} on the log · banking <span class="cl-memory">+${projectedPct}%</span> to Echo Memory${projectedMass > 0 ? ` · accreting <span class="cl-mass">${projectedMass} kg</span> Carrier Mass` : ''}</div>
        <button type="button" class="cl-close-btn" data-act="arm">Close the Cycle</button>
      `;
      return;
    }
    actionEl.classList.add('armed');
    actionEl.innerHTML = `
      <div class="cl-confirm">
        <p>Closing this cycle resets your relays and decoders. The Contact Log remains. Each name you remember strengthens the carrier. Mass accreted on the rig becomes Carrier Mass — spend it on Engravings.</p>
      </div>
      <div class="cl-confirm-actions">
        <button type="button" class="cl-cancel-btn" data-act="cancel">Not yet</button>
        <button type="button" class="cl-close-btn danger" data-act="confirm">Close cycle ${getRun(state.contactLog)}</button>
      </div>
    `;
  }

  function renderList() {
    const log = state.contactLog;
    const worlds = sortedWorlds(log);
    if (!worlds.length) {
      body.classList.add('is-empty');
      listEl.innerHTML = '';
      return;
    }
    body.classList.remove('is-empty');
    // Group by run, newest cycle first. Within a cycle, sortedWorlds already
    // gives newest contact first.
    const groups = new Map();
    for (const w of worlds) {
      const run = w.run || 1;
      if (!groups.has(run)) groups.set(run, []);
      groups.get(run).push(w);
    }
    const runs = [...groups.keys()].sort((a, b) => b - a);
    const currentRun = getRun(log);
    listEl.innerHTML = runs.map((run) => `
      <li class="cl-group">
        <div class="cl-group-head">Cycle ${run}${run === currentRun ? ' · current' : ''} · ${groups.get(run).length} contact${groups.get(run).length === 1 ? '' : 's'}</div>
        <ul class="cl-group-list">
          ${groups.get(run).map((w) => renderEntry(w)).join('')}
        </ul>
      </li>
    `).join('');
  }

  // A single entry — collapsed row plus, when expanded, an in-place lore panel.
  // The row itself is a button so it's keyboard-reachable and touch-friendly.
  function renderEntry(w) {
    const open = expandedId === w.id;
    const detail = worldDetail(w.id);
    return `
      <li class="contacted${open ? ' is-open' : ''}">
        <button type="button" class="cl-entry"
          data-act="toggle-entry" data-id="${w.id}"
          aria-expanded="${open ? 'true' : 'false'}">
          <div>
            <div class="cl-name">${w.name}</div>
            <div class="cl-ep">ep ${w.ep}</div>
          </div>
          <div class="cl-entry-right">
            <span class="cl-status s-${w.status.toLowerCase()}">${w.status}</span>
            <i class="ri ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} cl-entry-chev" aria-hidden="true"></i>
          </div>
        </button>
        ${open ? renderEntryDetail(w, detail) : ''}
      </li>
    `;
  }

  function renderEntryDetail(w, detail) {
    if (!detail) {
      return `
        <div class="cl-detail">
          <p class="cl-detail-empty">The folder is thin. The recordings remain.</p>
        </div>
      `;
    }
    // Order: method → biology → politics → cost. Kalen's note last, italic.
    return `
      <div class="cl-detail">
        <dl class="cl-detail-rows">
          <div class="cl-detail-row"><dt>Method</dt><dd>${detail.method}</dd></div>
          <div class="cl-detail-row"><dt>World</dt><dd>${detail.biology}</dd></div>
          <div class="cl-detail-row"><dt>Politics</dt><dd>${detail.politics}</dd></div>
          <div class="cl-detail-row"><dt>Consequence</dt><dd>${detail.cost}</dd></div>
        </dl>
        <p class="cl-detail-note"><em>${detail.note}</em></p>
      </div>
    `;
  }

  function render() {
    renderIntro();
    renderProgress();
    renderHook();
    renderStats();
    renderAction();
    renderEngravings();
    renderList();
    renderPending();
  }

  const open = () => { armed = false; render(); modal.classList.add('open'); };
  const close = () => { armed = false; modal.classList.remove('open'); };

  btn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.bm-close')) { close(); return; }
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    if (!act) return;
    if (act === 'arm') { armed = true; renderAction(); return; }
    if (act === 'cancel') { armed = false; renderAction(); return; }
    if (act === 'confirm') {
      if (typeof opts.onCloseCycle === 'function') opts.onCloseCycle();
      return;
    }
    if (act === 'buy-engraving') {
      const id = target.dataset.id;
      if (buyEngraving(state.contactLog, id)) {
        // Refresh the live state mirrors so the new exponent/base bonuses
        // kick in immediately if the buy unlocks them mid-cycle. Engravings
        // mostly bite on the *next* cycle (start-of-run grants don't retro),
        // but Ascent applies live.
        if (typeof opts.onBuyEngraving === 'function') opts.onBuyEngraving(id);
        render();
      }
      return;
    }
    if (act === 'toggle-entry') {
      const id = target.dataset.id;
      expandedId = expandedId === id ? null : id;
      renderList();
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render };
}
