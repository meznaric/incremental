// Names modal — cumulative roster of every world Kalen has ever logged.
// Two tabs: Names (the EP grid) and Info (lore + status legend).
//
// The grid is per-episode, 10 circular slots each. Found worlds reveal as
// portraits; unfound active-EP slots show locked discs; future EPs render
// entirely locked. The episode-gate line under the grid tells the player
// how many names are left in the active EP and the next episode opens
// once the cycle closes.
//
// Tapping a found tile opens the separate #nameDetailModal so the detail
// view feels like a destination rather than an expansion under the grid.
import {
  worldDetail, STATUS_MEANING, getRun,
  isEpComplete, activeEp, getCycleEp, markNamesSeen,
} from './contactLog.js';
import { WORLDS_BY_EP } from './worlds-data.js';
import { MILESTONE_SLOT_IDS } from './interstitial.js';
import { installTap } from './tap.js';

const EP_TITLES = {
  1: 'Discovery',
  2: 'The Sea Choir',
  3: 'Sky Language',
  4: 'Fire Given',
  5: 'Perfect Garden',
  6: 'Missing World',
  7: 'Echoes',
  8: 'Finale',
  9: 'After',
  10: 'Cascade',
};
const KALEN_PORTRAIT = './docs/lore/images/kalen-portrait.png';

export function initNamesModalUi(state, opts = {}) {
  const modal = document.getElementById('namesModal');
  const loreEl = modal.querySelector('.cl-lore-line');
  const gateEl = modal.querySelector('.cl-names-gate');
  const epsEl = modal.querySelector('.cl-names-episodes');
  const infoEl = modal.querySelector('.cl-names-info');
  const tabs = Array.from(modal.querySelectorAll('.cl-tab'));
  const panels = Array.from(modal.querySelectorAll('.cl-tab-panel'));
  let activeTab = 'names';

  const detailModal = document.getElementById('nameDetailModal');
  const detailTitle = detailModal.querySelector('#nameDetailTitle');
  const detailBody = detailModal.querySelector('.nd-body');

  // Voice: Kalen, ambient first person. Single sentence — frames what the
  // grid represents without becoming a tooltip wall.
  loreEl.textContent =
    'Every world I have ever spoken into. The names stay on the log; nothing on this page can be lost.';

  // Static info-tab content. Rendered once at init.
  infoEl.innerHTML = `
    <div class="cl-info-block">
      <h4>What this is</h4>
      <p>The Contact Log. Every world that has answered the carrier, in the cycle that recorded it. Once a name lands here it never leaves — across save resets, across cycle closes, across the Loop.</p>
    </div>
    <div class="cl-info-block">
      <h4>Status colours</h4>
      <div class="cl-info-statuses">
        <span class="s-label s-triggered">TRIGGERED</span><span class="s-meaning">The contact set off a cascade. Something big happened because of the call.</span>
        <span class="s-label s-collapsed">COLLAPSED</span><span class="s-meaning">The world ended sometime after the contact. Cause unclear, correlation total.</span>
        <span class="s-label s-shifted">SHIFTED</span><span class="s-meaning">The trajectory bent. The civilisation kept moving — somewhere different from where it had been heading.</span>
        <span class="s-label s-missing">MISSING</span><span class="s-meaning">Gone from records. Not destroyed. Just absent on the next pass.</span>
      </div>
    </div>
    <div class="cl-info-block">
      <h4>How to find more</h4>
      <p>Each episode has ten contacts at increasingly higher Echo thresholds. Climb past the threshold and the contact lands on the log automatically.</p>
      <p>One episode per cycle. Close the cycle to step into the next.</p>
    </div>
  `;

  function setTab(name) {
    activeTab = name;
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const p of panels) {
      p.classList.toggle('is-active', p.dataset.tab === name);
    }
  }

  function renderGate() {
    const log = state.contactLog;
    if (activeEp(log) == null) {
      gateEl.innerHTML = `<div class="cl-gate is-loop">Every episode is logged. The Loop is open — close the cycle to compound the resonance.</div>`;
      return;
    }
    // The gate speaks for the cycle's locked EP, not whatever the lowest
    // incomplete EP happens to be. Mid-cycle they're usually the same; they
    // diverge for one beat after the cycle's EP fills.
    const ep = getCycleEp(log);
    const block = WORLDS_BY_EP[ep];
    if (!block) { gateEl.innerHTML = ''; return; }
    const contactedIds = new Set((log.worlds || []).map((w) => w.id));
    const ids = Object.values(block).map((w) => w.id);
    const left = ids.filter((id) => !contactedIds.has(id)).length;
    const epTitle = EP_TITLES[ep] || `Episode ${ep}`;
    const nextEp = ep + 1;
    if (left === 0) {
      gateEl.innerHTML = `
        <div class="cl-gate is-ready">
          Every name in <strong>Episode ${ep} · ${epTitle}</strong> is recorded.
          Close the cycle to step into <strong>Episode ${nextEp}${EP_TITLES[nextEp] ? ` · ${EP_TITLES[nextEp]}` : ''}</strong>.
        </div>`;
      return;
    }
    gateEl.innerHTML = `
      <div class="cl-gate">
        <strong>${left}</strong> name${left === 1 ? '' : 's'} left in <strong>Episode ${ep} · ${epTitle}</strong>.
        Record them — the next episode opens once you close the cycle.
      </div>`;
  }

  function renderEpisodes() {
    const log = state.contactLog;
    // Active highlight follows the cycle's locked EP. Anything past it is
    // locked, because the cycle can only fire milestones for cycleEp.
    const active = getCycleEp(log);
    const contactedById = new Map((log.worlds || []).map((w) => [w.id, w]));
    const eps = Object.keys(WORLDS_BY_EP).map(Number).sort((a, b) => a - b);
    const sections = [];
    for (const ep of eps) {
      const block = WORLDS_BY_EP[ep];
      if (!block) continue;
      const slots = MILESTONE_SLOT_IDS.map((slotId) => block[slotId]).filter(Boolean);
      const total = slots.length;
      const found = slots.filter((def) => contactedById.has(def.id)).length;
      const done = isEpComplete(log, ep);
      const isActive = active === ep && !done;
      const isLockedFuture = active != null && ep > active;
      const epTitle = EP_TITLES[ep] || `Episode ${ep}`;
      const cls = ['cl-ep-block'];
      if (done) cls.push('is-done');
      else if (isActive) cls.push('is-active');
      else if (isLockedFuture) cls.push('is-locked');
      const headRight = done
        ? `<span class="cl-ep-count is-done">${found} / ${total}</span>`
        : isLockedFuture
          ? `<span class="cl-ep-count is-locked">locked</span>`
          : `<span class="cl-ep-count">${found} / ${total}</span>`;
      const tiles = slots.map((def) => {
        const known = contactedById.get(def.id);
        if (!known) {
          return `<button type="button" class="cl-tile is-locked"
              aria-label="Unrecorded" data-act="locked-tile" disabled></button>`;
        }
        const sCls = `s-${(known.status || '').toLowerCase()}`;
        return `<button type="button" class="cl-tile is-found ${sCls}"
            data-act="open-detail" data-id="${known.id}"
            aria-label="${known.name}">
            ${def.image
              ? `<img class="cl-tile-img" loading="lazy" alt="" src="${def.image}"
                   onerror="this.style.display='none';" />`
              : ''}
            <span class="cl-tile-name">${known.name}</span>
          </button>`;
      }).join('');
      sections.push(`
        <section class="${cls.join(' ')}">
          <div class="cl-ep-head">
            <div class="cl-ep-title"><strong>Ep ${ep}</strong> · ${epTitle}</div>
            ${headRight}
          </div>
          <div class="cl-ep-grid">${tiles}</div>
        </section>
      `);
    }
    epsEl.innerHTML = sections.join('');
  }

  function findWorldDef(worldId) {
    for (const block of Object.values(WORLDS_BY_EP)) {
      if (!block) continue;
      for (const def of Object.values(block)) {
        if (def.id === worldId) return def;
      }
    }
    return null;
  }

  function openDetail(worldId) {
    const log = state.contactLog;
    const w = (log.worlds || []).find((x) => x.id === worldId);
    if (!w) return;
    const def = findWorldDef(worldId);
    const detail = worldDetail(worldId);
    const sCls = `s-${(w.status || '').toLowerCase()}`;
    const meaning = STATUS_MEANING[w.status] || '';
    const note = detail && detail.note ? detail.note : (def && def.flavor ? def.flavor : '');
    const consequence = detail && detail.cost ? detail.cost : '';
    const img = def && def.image;
    const epTitle = EP_TITLES[w.ep];
    const epLabel = epTitle ? `Episode ${w.ep} — ${epTitle}` : `Episode ${w.ep}`;
    const portrait = img
      ? `<img class="nd-portrait" loading="lazy" alt="${w.name}" src="${img}"
            onerror="this.style.display='none'" />`
      : '';
    const rows = detail ? `
      <dl class="nd-rows">
        <div class="nd-row"><dt>Method</dt><dd>${detail.method}</dd></div>
        <div class="nd-row"><dt>World</dt><dd>${detail.biology}</dd></div>
        <div class="nd-row"><dt>Politics</dt><dd>${detail.politics}</dd></div>
        <div class="nd-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
      </dl>` : `
      <dl class="nd-rows">
        <div class="nd-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
      </dl>`;
    detailTitle.textContent = w.name;
    detailBody.innerHTML = `
      <div class="nd-status-row">
        <span class="cl-status ${sCls}">${w.status}</span>
        ${meaning ? `<span class="nd-meaning ${sCls}">${meaning}</span>` : ''}
      </div>
      ${portrait}
      ${note ? `
        <div class="nd-kalen-row">
          <img class="nd-avatar" alt="Kalen" src="${KALEN_PORTRAIT}" loading="lazy" />
          <p class="nd-note"><em>${note}</em></p>
        </div>` : ''}
      ${consequence ? `<p class="nd-consequence">${consequence}</p>` : ''}
      ${rows}
    `;
    detailModal.classList.add('open');
  }

  const closeDetail = () => detailModal.classList.remove('open');

  function render() {
    renderGate();
    renderEpisodes();
  }

  const open = () => {
    markNamesSeen(state.contactLog);
    if (typeof opts.onLogPersist === 'function') opts.onLogPersist();
    setTab(activeTab);
    render();
    modal.classList.add('open');
  };
  const close = () => { modal.classList.remove('open'); };

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
    const t = target.closest('[data-act], [data-tab]');
    if (!t) return;
    if (t.dataset.tab && t.classList.contains('cl-tab')) {
      setTab(t.dataset.tab);
      return;
    }
    const act = t.dataset.act;
    if (act === 'open-detail') {
      openDetail(t.dataset.id);
      return;
    }
  });

  installTap(detailModal, (_e, target) => {
    if (target === detailModal || target.closest('.bm-close')) { closeDetail(); return; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (detailModal.classList.contains('open')) { closeDetail(); return; }
    if (modal.classList.contains('open')) close();
  });

  return { open, close, render };
}
