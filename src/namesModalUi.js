// Names modal — the cumulative roster of every world Kalen has ever logged.
// Each EP renders as a row of 10 circular slots. Found worlds reveal as
// portraits; unfound active-EP slots show as locked discs; future EPs render
// entirely locked. Tapping a found circle expands an inline detail card.
//
// Episode-gate line under the active EP nudges the player toward closing the
// cycle once the EP is fully recorded.
import {
  worldDetail, STATUS_MEANING, getRun,
  isEpComplete, activeEp, getCycleEp, markNamesSeen,
  ECHO_MEMORY_PER_SHARD, memoryShards,
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
const STATUS_ORDER = ['TRIGGERED', 'COLLAPSED', 'SHIFTED', 'MISSING'];
const KALEN_PORTRAIT = './docs/lore/images/kalen-portrait.png';

export function initNamesModalUi(state, opts = {}) {
  const modal = document.getElementById('namesModal');
  const summaryEl  = modal.querySelector('.cl-names-summary');
  const gateEl     = modal.querySelector('.cl-names-gate');
  const epsEl      = modal.querySelector('.cl-names-episodes');
  const detailEl   = modal.querySelector('.cl-names-detail');
  const memoryInfoEl = modal.querySelector('.cl-memory-info');
  // Which world id is expanded in the detail card. Session-only — not saved.
  let expandedId = null;

  // Static FAQ — same content as the old Contact Log Memory block, in the
  // panel that now owns name-counting.
  memoryInfoEl.innerHTML = `
    <div class="faq-block kind-memory">
      <div class="faq-head"><i class="ri ri-database-2-line"></i>How Echo Memory works</div>
      <div class="faq-body">
        <p><strong>Earn:</strong> one shard per name on the log. Across every cycle, every episode.</p>
        <p><strong>What it does:</strong> each shard adds <strong>+10%</strong> to base Echoes/s, applied <em>before</em> every other multiplier.</p>
        <p><strong>Never lost.</strong> The names stay. This number only ever climbs.</p>
      </div>
    </div>
  `;

  function renderSummary() {
    const log = state.contactLog;
    const worlds = (log && log.worlds) || [];
    const shards = memoryShards(log);
    const memPct = Math.round(ECHO_MEMORY_PER_SHARD * 100 * shards);
    if (!worlds.length) {
      summaryEl.innerHTML = `<div class="cl-summary"><em>The log is empty. The dark is still listening.</em></div>`;
      return;
    }
    const counts = { TRIGGERED: 0, COLLAPSED: 0, SHIFTED: 0, MISSING: 0 };
    for (const w of worlds) if (counts[w.status] != null) counts[w.status]++;
    const parts = [`<strong>${worlds.length}</strong> name${worlds.length === 1 ? '' : 's'}`];
    for (const s of STATUS_ORDER) {
      if (counts[s] > 0) parts.push(`<span class="s-${s.toLowerCase()}"><strong>${counts[s]}</strong> ${s.toLowerCase()}</span>`);
    }
    summaryEl.innerHTML = `
      <div class="cl-summary">${parts.join(' · ')}</div>
      <div class="cl-summary-mem"><span class="cl-memory">+${memPct}%</span> Echo Memory</div>
    `;
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
    // The "active" highlight follows the cycle's locked EP — that's the one
    // the current run can still record names against. Anything past it is
    // locked even if the worlds happen to be reachable, because the cycle
    // can only fire milestones for cycleEp.
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
      // Anything after the cycle's locked EP is locked — including the EP
      // that would become active next if the player closed right now.
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
        // Locked tile for unknown worlds (active or future EP). The locked
        // glyph is rendered via CSS pseudo-element on .cl-tile.is-locked.
        if (!known) {
          return `<button type="button" class="cl-tile is-locked"
              aria-label="Unrecorded" data-act="locked-tile" disabled></button>`;
        }
        const sCls = `s-${(known.status || '').toLowerCase()}`;
        const isOpen = expandedId === known.id;
        return `<button type="button" class="cl-tile is-found ${sCls}${isOpen ? ' is-open' : ''}"
            data-act="toggle-entry" data-id="${known.id}"
            aria-label="${known.name}" aria-expanded="${isOpen ? 'true' : 'false'}">
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

  function renderDetail() {
    if (!expandedId) { detailEl.innerHTML = ''; return; }
    const log = state.contactLog;
    const w = (log.worlds || []).find((x) => x.id === expandedId);
    if (!w) { detailEl.innerHTML = ''; expandedId = null; return; }
    // Find the world's definition across any EP.
    let def = null;
    for (const block of Object.values(WORLDS_BY_EP)) {
      if (block && Object.values(block).some((d) => d.id === w.id)) {
        def = Object.values(block).find((d) => d.id === w.id);
        break;
      }
    }
    const detail = worldDetail(w.id);
    const sCls = `s-${(w.status || '').toLowerCase()}`;
    const meaning = STATUS_MEANING[w.status] || '';
    const note = detail && detail.note ? detail.note : (def && def.flavor ? def.flavor : '');
    const consequence = detail && detail.cost ? detail.cost : '';
    const img = def && def.image;
    const portrait = img
      ? `<img class="cl-detail-img" loading="lazy" alt="${w.name}" src="${img}"
            onerror="this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='flex';" />
         <div class="cl-detail-fallback" aria-hidden="true" style="display:none"></div>`
      : `<div class="cl-detail-fallback" aria-hidden="true"></div>`;
    const epTitle = EP_TITLES[w.ep];
    const epLabel = epTitle ? `Episode ${w.ep} — ${epTitle}` : `Episode ${w.ep}`;
    const rows = detail ? `
      <dl class="cl-detail-rows">
        <div class="cl-detail-row"><dt>Method</dt><dd>${detail.method}</dd></div>
        <div class="cl-detail-row"><dt>World</dt><dd>${detail.biology}</dd></div>
        <div class="cl-detail-row"><dt>Politics</dt><dd>${detail.politics}</dd></div>
        <div class="cl-detail-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
      </dl>` : `
      <dl class="cl-detail-rows">
        <div class="cl-detail-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
      </dl>`;
    detailEl.innerHTML = `
      <div class="cl-detail cl-detail-card ${sCls}">
        <div class="cl-detail-head">
          <div class="cl-name">${w.name}</div>
          <span class="cl-status ${sCls}">${w.status}</span>
          <button type="button" class="cl-detail-close" data-act="close-detail" aria-label="Close">
            <i class="ri ri-close-line"></i>
          </button>
        </div>
        ${meaning ? `<div class="cl-ep-meaning ${sCls}">${meaning}</div>` : ''}
        <div class="cl-detail-body">
          <img class="cl-avatar" alt="Kalen" src="${KALEN_PORTRAIT}" loading="lazy" />
          <div class="cl-detail-text">
            ${note ? `<p class="cl-detail-note"><em>${note}</em></p>` : ''}
            ${consequence ? `<p class="cl-consequence">${consequence}</p>` : ''}
          </div>
        </div>
        ${portrait}
        ${rows}
      </div>
    `;
  }

  function render() {
    renderSummary();
    renderGate();
    renderEpisodes();
    renderDetail();
  }

  const open = () => {
    markNamesSeen(state.contactLog);
    if (typeof opts.onLogPersist === 'function') opts.onLogPersist();
    render();
    modal.classList.add('open');
  };
  const close = () => { modal.classList.remove('open'); };

  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
    const t = target.closest('[data-act]');
    const act = t?.dataset.act;
    if (!act) return;
    if (act === 'toggle-entry') {
      const id = t.dataset.id;
      expandedId = expandedId === id ? null : id;
      renderEpisodes();
      renderDetail();
      // Smooth-scroll the detail card into view for tap on a tile that lives
      // far above the panel's viewport. Falls back gracefully if behavior:smooth
      // isn't supported.
      if (expandedId) {
        requestAnimationFrame(() => detailEl.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      }
      return;
    }
    if (act === 'close-detail') {
      expandedId = null;
      renderEpisodes();
      renderDetail();
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      if (expandedId) { expandedId = null; renderEpisodes(); renderDetail(); return; }
      close();
    }
  });

  return { open, close, render };
}
