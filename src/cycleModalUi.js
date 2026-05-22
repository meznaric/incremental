// Cycle modal — the live state of the current run. Surfaces the next contact,
// upcoming names, contact count, and projected Carrier Mass on close. Drives
// the "Close the Cycle" action with its two-stage confirm.
//
// Voice: Kalen first-person ambient. Sera lines reserved for the interstitials.
import {
  getRun, canCloseCycle, cycleContactCount, worldFor,
  echoLoopLevel, isLoopMode, ECHO_MEMORY_PER_SHARD,
  massForPeak,
} from './contactLog.js';
import { currentMilestones, nextContactMilestone, isCycleComplete } from './interstitial.js';
import { formatAbbrev } from './bignum.js';
import { installTap } from './tap.js';

const KALEN_PORTRAIT = './docs/lore/images/kalen-portrait.png';

export function initCycleModalUi(state, opts = {}) {
  const modal = document.getElementById('cycleModal');
  const introEl    = modal.querySelector('.cl-intro');
  const tilesEl    = modal.querySelector('.cl-cycle-tiles');
  const progressEl = modal.querySelector('.cl-cycle-progress');
  const nextEl     = modal.querySelector('.cl-cycle-next');
  const upcomingEl = modal.querySelector('.cl-cycle-upcoming');
  const actionEl   = modal.querySelector('.cl-action');
  const closeInfoEl = modal.querySelector('.cl-close-info');
  let armed = false;

  function peakAmount() {
    return (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
  }

  function renderIntro() {
    const log = state.contactLog;
    const run = getRun(log);
    const loop = echoLoopLevel(log);
    const n = (log && Array.isArray(log.worlds)) ? log.worlds.length : 0;
    if (loop > 0) {
      introEl.innerHTML = `<em>Echo Loop ${loop}. Season closed. <strong>${n}</strong> name${n === 1 ? '' : 's'} on the log; the carrier keeps the warmth.</em>`;
      return;
    }
    if (n === 0) {
      introEl.innerHTML = `<em>Cycle ${run}. The notebook is open. No names yet.</em>`;
      return;
    }
    introEl.innerHTML = `<em>Cycle ${run}. <strong>${n}</strong> name${n === 1 ? '' : 's'} on the log. I read them again before I sleep.</em>`;
  }

  function renderTiles() {
    const log = state.contactLog;
    const loop = echoLoopLevel(log);
    const run = getRun(log);
    const ms = currentMilestones(log);
    const contactedIds = new Set((log && log.worlds || []).map((w) => w.id));
    let foundInEp = 0;
    let leftInEp = 0;
    for (const m of ms) {
      const def = worldFor(log, m.id);
      if (!def) continue;
      if (contactedIds.has(def.id)) foundInEp++;
      else leftInEp++;
    }
    const cycleFound = cycleContactCount(log);
    const peak = peakAmount();
    const projected = massForPeak(peak);

    // In Loop mode the EP catalogue is exhausted — show only what matters:
    // loop level, contacts this run (0 by definition), projected mass.
    const headTile = loop > 0
      ? `<div class="cl-stat">
          <div class="cl-stat-label">Echo Loop</div>
          <div class="cl-stat-value">${loop}</div>
        </div>`
      : `<div class="cl-stat">
          <div class="cl-stat-label">Cycle</div>
          <div class="cl-stat-value">${run}</div>
        </div>`;

    const foundTile = `
      <div class="cl-stat">
        <div class="cl-stat-label">This Cycle</div>
        <div class="cl-stat-value">${cycleFound} contact${cycleFound === 1 ? '' : 's'}</div>
      </div>`;

    const epTile = loop > 0
      ? `<div class="cl-stat">
          <div class="cl-stat-label">Episode</div>
          <div class="cl-stat-value">Season complete</div>
        </div>`
      : `<div class="cl-stat">
          <div class="cl-stat-label">This Episode</div>
          <div class="cl-stat-value">${foundInEp} / ${foundInEp + leftInEp} · ${leftInEp} left</div>
        </div>`;

    const massTile = `
      <div class="cl-stat cl-stat-mass">
        <div class="cl-stat-label">If I close now</div>
        <div class="cl-stat-value cl-mass">${projected} kg</div>
        <p class="cl-stat-hint">Carrier Mass banked from this cycle's peak Echo balance.</p>
      </div>`;

    tilesEl.innerHTML = `${headTile}${foundTile}${epTile}${massTile}`;
  }

  function renderProgress() {
    const log = state.contactLog;
    const next = nextContactMilestone(state);
    if (!next) {
      progressEl.innerHTML = `<div class="cl-progress-done">Every catalogued world is on the log.</div>`;
      return;
    }
    const peak = peakAmount();
    let prev = 0;
    for (const m of currentMilestones(log)) {
      if (m.id === next.id) break;
      if (worldFor(log, m.id)) prev = m.at;
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

  function renderNext() {
    const next = nextContactMilestone(state);
    if (!next) { nextEl.innerHTML = ''; return; }
    const def = worldFor(state.contactLog, next.id);
    if (!def) { nextEl.innerHTML = ''; return; }
    const img = def.image
      ? `<img class="cl-next-img" loading="lazy" alt="${def.name}" src="${def.image}"
           onerror="this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='flex';" />
         <div class="cl-next-fallback" aria-hidden="true" style="display:none"></div>`
      : `<div class="cl-next-fallback" aria-hidden="true"></div>`;
    nextEl.innerHTML = `
      <div class="cl-next-head">Next name</div>
      <div class="cl-next-card">
        ${img}
        <div class="cl-next-text">
          <div class="cl-next-name">${def.name}</div>
          <div class="cl-next-at">at ${formatAbbrev(next.at)} Echoes</div>
          ${def.flavor ? `<p class="cl-next-flavor"><em>${def.flavor}</em></p>` : ''}
        </div>
      </div>
    `;
  }

  function renderUpcoming() {
    const log = state.contactLog;
    if (isLoopMode(log)) { upcomingEl.innerHTML = ''; return; }
    const next = nextContactMilestone(state);
    if (!next) { upcomingEl.innerHTML = ''; return; }
    const contactedIds = new Set((log && log.worlds || []).map((w) => w.id));
    const ms = currentMilestones(log);
    // Everything after the immediate "Next name" tile. Names hidden until
    // logged — only the magnitude target leaks, so the player has a sense of
    // distance without spoiling who answers next.
    const rows = [];
    let passedNext = false;
    for (const m of ms) {
      if (m.id === next.id) { passedNext = true; continue; }
      if (!passedNext) continue;
      const def = worldFor(log, m.id);
      if (!def) continue;
      const known = contactedIds.has(def.id);
      rows.push(`
        <li class="cl-up-row${known ? ' is-known' : ''}">
          <div class="cl-up-name">${known ? def.name : '— unrecorded —'}</div>
          <div class="cl-up-at">${formatAbbrev(m.at)}</div>
        </li>
      `);
    }
    if (!rows.length) { upcomingEl.innerHTML = ''; return; }
    upcomingEl.innerHTML = `
      <div class="cl-up-head">After that</div>
      <ul class="cl-up-list">${rows.join('')}</ul>
    `;
  }

  function renderAction() {
    const log = state.contactLog;
    const eligible = canCloseCycle(log);
    const cycleCount = cycleContactCount(log);
    const projectedPct = Math.round(ECHO_MEMORY_PER_SHARD * 100 * cycleCount);
    const peak = peakAmount();
    const projectedMass = massForPeak(peak);
    const loop = echoLoopLevel(log);
    const complete = isCycleComplete(state);
    const readyState = loop > 0 ? true : (complete && eligible);
    actionEl.classList.toggle('cycle-ready', readyState);
    if (!eligible) {
      actionEl.classList.remove('armed');
      actionEl.innerHTML = `<div class="cl-action-hint">Reach a milestone to close the cycle.</div>`;
      return;
    }
    if (!armed) {
      actionEl.classList.remove('armed');
      if (loop > 0) {
        const nextLoop = loop + 1;
        actionEl.innerHTML = `
          <div class="cl-action-headline">Echo Loop ${nextLoop} ready.</div>
          <div class="cl-action-hint">Banking <span class="cl-memory">+10%</span> Echo Memory${projectedMass > 0 ? ` · accreting <span class="cl-mass">${projectedMass} kg</span> Carrier Mass` : ''}</div>
          <button type="button" class="cl-close-btn is-ready" data-act="arm">Close Echo Loop ${loop}</button>
        `;
        return;
      }
      const headline = complete
        ? `<div class="cl-action-headline">The cycle is full. Ready to close.</div>`
        : '';
      actionEl.innerHTML = `
        ${headline}
        <div class="cl-action-hint">${cycleCount} new name${cycleCount === 1 ? '' : 's'} on the log · banking <span class="cl-memory">+${projectedPct}%</span> to Echo Memory${projectedMass > 0 ? ` · accreting <span class="cl-mass">${projectedMass} kg</span> Carrier Mass` : ''}</div>
        <button type="button" class="cl-close-btn${complete ? ' is-ready' : ''}" data-act="arm">Close the Cycle</button>
      `;
      return;
    }
    actionEl.classList.add('armed');
    const confirmCopy = loop > 0
      ? `Closing this loop resets your relays and decoders. The Contact Log remains. Loop Resonance compounds on Echo Memory; Carrier Mass accretes against your peak.`
      : `Closing this cycle resets your relays and decoders. The Contact Log remains. Each name you remember strengthens the carrier. Mass accreted on the rig becomes Carrier Mass — spend it on Engravings.`;
    const confirmBtn = loop > 0 ? `Close Echo Loop ${loop}` : `Close cycle ${getRun(log)}`;
    actionEl.innerHTML = `
      <div class="cl-confirm">
        <p>${confirmCopy}</p>
      </div>
      <div class="cl-confirm-actions">
        <button type="button" class="cl-cancel-btn" data-act="cancel">Not yet</button>
        <button type="button" class="cl-close-btn danger" data-act="confirm">${confirmBtn}</button>
      </div>
    `;
  }

  // Static FAQ — rendered once at init so render() isn't rebuilding identical
  // HTML every tap. Same pattern as the old contactLogUi did for memory/mass FAQs.
  closeInfoEl.innerHTML = `
    <div class="faq-block">
      <div class="faq-head"><i class="ri ri-refresh-line"></i>What a cycle close does</div>
      <div class="faq-body">
        <p><strong>Survives:</strong> Echo Memory shards, Carrier Mass, Engravings, the Contact Log itself.</p>
        <p><strong>Resets:</strong> Echo balance, Echoes/s, owned Relays / Decodes / Seed Relays, shop slate, active Windows.</p>
      </div>
    </div>
  `;

  function render() {
    renderIntro();
    renderTiles();
    renderProgress();
    renderNext();
    renderUpcoming();
    renderAction();
  }

  const open = () => { armed = false; render(); modal.classList.add('open'); };
  const close = () => { armed = false; modal.classList.remove('open'); };

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
    const t = target.closest('[data-act]');
    const act = t?.dataset.act;
    if (!act) return;
    if (act === 'arm')     { armed = true;  renderAction(); return; }
    if (act === 'cancel')  { armed = false; renderAction(); return; }
    if (act === 'confirm') {
      if (typeof opts.onCloseCycle === 'function') opts.onCloseCycle();
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render };
}
