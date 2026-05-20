import {
  sortedWorlds, getRun, canCloseCycle, cycleContactCount,
  memoryShards, memoryMul, ECHO_MEMORY_PER_SHARD,
  ENGRAVINGS, engravingCost, canBuyEngraving, buyEngraving,
  getMass, getEngraving, massForPeak, worldFor,
  worldDetail, STATUS_MEANING,
  echoLoopLevel, isLoopMode,
  ALL_WORLDS,
  hasUnreadNames, markNamesSeen,
  hasUnreadRig, markRigSeen,
} from './contactLog.js';
import { nextContactMilestone, currentMilestones, isCycleComplete } from './interstitial.js';
import { formatAbbrev } from './bignum.js';
import { getPattern } from './cyclePatterns.js';
import { installTap } from './tap.js';

// The Contact Log is the player-facing surface for the cycle-close loop.
// Three panels — Cycle / Names / Rig — each opened by tapping its segment on
// the contactProgress strip. The visible tab strip was retired with that
// rewire; only one panel is shown at a time, driven by openPanel(name).
// The "Close the Cycle" action reveals a two-stage confirm — first click arms
// it, second click commits. The Names panel groups worlds by the cycle that
// recorded them so the player can see their history layer by layer.
const PANEL_TITLES = { cycle: 'Cycle', names: 'Names', rig: 'Rig' };

// Episode titles. Pulled inline rather than importing from achievements-data
// (which keeps them as part of an achievement description string) — the Names
// modal is the only other place that needs them and inlining keeps coupling low.
const EP_TITLES = {
  1: 'Discovery',
  2: 'The Sea Choir',
  3: 'Sky Language',
  4: 'Fire Given',
  5: 'Perfect Garden',
  6: 'Missing World',
  7: 'Echoes',
  8: 'Finale',
};

const KALEN_PORTRAIT = './docs/lore/images/kalen-portrait.png';

export function initContactLogUi(state, opts = {}) {
  const modal = document.getElementById('contactLogModal');
  const body = modal.querySelector('.cl-body');
  const titleEl = modal.querySelector('.bm-title');
  const introEl = modal.querySelector('.cl-intro');
  const progressEl = modal.querySelector('.cl-progress');
  const hookEl = modal.querySelector('.cl-hook');
  const statsEl = modal.querySelector('.cl-stats');
  const actionEl = modal.querySelector('.cl-action');
  const listEl = modal.querySelector('.cl-list');
  const legendEl = modal.querySelector('.cl-legend');
  const namesHeadEl = modal.querySelector('.cl-names-head');
  const pendingEl = modal.querySelector('.cl-pending');
  const engravingsEl = modal.querySelector('.cl-engravings');
  const memoryInfoEl = modal.querySelector('.cl-memory-info');
  const massInfoEl = modal.querySelector('.cl-mass-info');
  const closeInfoEl = modal.querySelector('.cl-close-info');
  const panelEls = Array.from(modal.querySelectorAll('.cl-panel'));
  let armed = false;
  let activeTab = 'cycle';
  // Which logged contact (by world id) has its lore panel expanded. Held in
  // closure rather than state — a session-level UI detail, not save data.
  let expandedId = null;
  const STATUS_ORDER = ['TRIGGERED', 'COLLAPSED', 'SHIFTED', 'MISSING'];

  function setActiveTab(name) {
    activeTab = name;
    if (titleEl) titleEl.textContent = PANEL_TITLES[name] || '';
    modal.dataset.panel = name;
    for (const p of panelEls) {
      p.classList.toggle('is-active', p.dataset.panel === name);
    }
  }

  function renderIntro() {
    if (!introEl) return;
    const log = state.contactLog;
    const n = (log && Array.isArray(log.worlds)) ? log.worlds.length : 0;
    const run = getRun(log);
    const loop = echoLoopLevel(log);
    // voice: Kalen. The field log framed in his hand — first person, ambient.
    // In Loop mode (post-season) the framing shifts: no new names land, but
    // the rig keeps building Resonance. The line still reads as Kalen's notebook.
    let headK;
    if (loop > 0) {
      headK = `<em>Echo Loop ${loop}. The season is closed. <strong>${n}</strong> name${n === 1 ? '' : 's'} on the log, and a Resonance that compounds.</em>`;
    } else if (n === 0) {
      headK = `<em>Cycle ${run}. The notebook is open. No names yet.</em>`;
    } else {
      headK = `<em>Cycle ${run}. <strong>${n}</strong> name${n === 1 ? '' : 's'} on the log. I read them again before I sleep.</em>`;
    }
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
    for (const m of currentMilestones(state.contactLog)) {
      if (m.id === next.id) break;
      if (worldFor(state.contactLog, m.id)) prev = m.at;
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
    if (isLoopMode(state.contactLog)) {
      // Loop mode has no next contact to preview. The hook frames the climb
      // itself: every kg of Mass and every Loop Resonance level compounds.
      hookEl.innerHTML = `Season 1 is closed. The carrier is still warm. Each Loop closes for +10% Echo Memory and the Mass that the climb carries.`;
      return;
    }
    const next = nextContactMilestone(state);
    if (!next) {
      // After the last contact has fired the log itself becomes the question.
      // The line is intentionally non-spoiler: every EP shares this exit.
      hookEl.innerHTML = `The cycle is full. The names are in. Close the cycle when you are ready.`;
      return;
    }
    // Use the next world's own flavor line as the preview hook — keeps the
    // copy in one place (worlds.js) and avoids a parallel table to maintain.
    const def = worldFor(state.contactLog, next.id);
    hookEl.innerHTML = def && def.flavor ? def.flavor : '';
  }

  function renderPending() {
    if (!pendingEl) return;
    const log = state.contactLog;
    // Loop mode has no pending contacts; the season catalogue is closed.
    if (isLoopMode(log)) { pendingEl.innerHTML = ''; return; }
    const contacted = new Set((log && log.worlds || []).map((w) => w.id));
    const rows = [];
    for (const m of currentMilestones(log)) {
      const def = worldFor(log, m.id);
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
    const loop = echoLoopLevel(log);
    const cycleCount = cycleContactCount(log);
    const shards = memoryShards(log);
    const mul = memoryMul(log);
    const memoryPct = Math.round((mul - 1) * 100);
    const mass = getMass(log);
    const pat = getPattern(log && log.pattern);
    const patternRow = pat ? `
      <div class="cl-stat is-wide">
        <div class="cl-stat-label">Pattern</div>
        <div class="cl-stat-value">${pat.name}</div>
      </div>
    ` : '';
    // The first stat shifts label + value in Loop mode so the cycle counter
    // does not keep climbing past 8 in a way that reads like more episodes.
    // Loop count is its own dial, and Memory shows the loop bonus inline.
    const headStat = loop > 0
      ? `<div class="cl-stat">
          <div class="cl-stat-label">Echo Loop</div>
          <div class="cl-stat-value">${loop}</div>
        </div>`
      : `<div class="cl-stat">
          <div class="cl-stat-label">Cycle</div>
          <div class="cl-stat-value">${run}</div>
        </div>`;
    const secondStat = loop > 0
      ? `<div class="cl-stat">
          <div class="cl-stat-label">Status</div>
          <div class="cl-stat-value">Season 1 · complete</div>
        </div>`
      : `<div class="cl-stat">
          <div class="cl-stat-label">This Cycle</div>
          <div class="cl-stat-value">${cycleCount} contact${cycleCount === 1 ? '' : 's'}</div>
        </div>`;
    const memoryTail = loop > 0
      ? ` · ${shards} shard${shards === 1 ? '' : 's'} + ${loop} loop${loop === 1 ? '' : 's'}`
      : (shards ? ` · ${shards} shard${shards === 1 ? '' : 's'}` : '');
    // voice: Kalen. First-person ambient. Hints spell out earn rule + spend
    // rule so a new player knows where each currency comes from. Kept terse
    // so the tile still reads at a glance.
    statsEl.innerHTML = `
      ${headStat}
      ${secondStat}
      <div class="cl-stat is-wide">
        <div class="cl-stat-label">Echo Memory</div>
        <div class="cl-stat-value cl-memory">+${memoryPct}%${memoryTail}</div>
        <p class="cl-stat-hint"><strong>One shard per name on the log</strong>, across every cycle. Each shard is +10% to my base Echoes/s — applied before every other multiplier. The names never leave the log; this number only ever climbs.</p>
      </div>
      <div class="cl-stat is-wide">
        <div class="cl-stat-label">Carrier Mass</div>
        <div class="cl-stat-value cl-mass">${mass} kg</div>
        <p class="cl-stat-hint"><strong>Banked at cycle close</strong> from this cycle's peak Echo balance. Every 10× higher I push past 1k = +1 kg (100k → 3 kg, 1B → 7 kg, 1T → 10 kg). Spend it on <strong>Engravings</strong> in the Rig tab — those cuts survive every reset.</p>
      </div>
      ${patternRow}
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
    // voice: Kalen. Hint spells out the earn rule (peak Echoes → kg at close)
    // and the spend rule (kg → permanent rig cuts). Engravings outlast resets;
    // shop Relays/Decodes don't. Stated plainly so the trade-off is legible.
    engravingsEl.innerHTML = `
      <div class="cl-eng-head-row">
        <div class="cl-eng-title">Carrier Engravings</div>
        <div class="cl-eng-balance">${mass} kg</div>
      </div>
      <p class="cl-eng-hint">Mass is banked at cycle close: <strong>every 10× past 1k of peak balance = +1 kg</strong>. I spend it here to cut permanent boosts into the rig — Engravings <strong>survive every reset</strong>, unlike the shop's Relays and Decodes.</p>
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
    // Cycle-complete = every contact-bearing milestone of the current EP has
    // been crossed. When that flips the close-cycle CTA escalates: a green
    // pulse on the button and a "ready" line under it. Players who want to
    // push past the climax for more Carrier Mass still can — eligibility is
    // canCloseCycle, not isCycleComplete.
    const loop = echoLoopLevel(log);
    const complete = isCycleComplete(state);
    // Loop mode is always "ready" — no contacts to wait for. The pulse stays
    // on; the player closes whenever the Mass is worth it.
    const readyState = loop > 0 ? true : (complete && eligible);
    actionEl.classList.toggle('cycle-ready', readyState);
    if (!eligible) {
      actionEl.classList.remove('armed');
      actionEl.innerHTML = `
        <div class="cl-action-hint">Reach a milestone to close the cycle.</div>
      `;
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
    const confirmBtn = loop > 0
      ? `Close Echo Loop ${loop}`
      : `Close cycle ${getRun(state.contactLog)}`;
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

  function renderLegend() {
    if (!legendEl) return;
    const log = state.contactLog;
    const has = new Set((log && log.worlds || []).map((w) => w.status));
    // Order matches the in-game severity / cycle progression of the statuses.
    const order = ['TRIGGERED', 'COLLAPSED', 'SHIFTED', 'MISSING'];
    const present = order.filter((s) => has.has(s));
    if (!present.length) { legendEl.innerHTML = ''; legendEl.style.display = 'none'; return; }
    legendEl.style.display = '';
    legendEl.innerHTML = present.map((s) => `
      <div class="cl-legend-status s-${s.toLowerCase()}">${s}</div>
      <div class="cl-legend-meaning">${STATUS_MEANING[s] || ''}</div>
    `).join('');
  }

  function statusCounts(worlds) {
    const counts = { TRIGGERED: 0, COLLAPSED: 0, SHIFTED: 0, MISSING: 0 };
    for (const w of worlds) if (counts[w.status] != null) counts[w.status]++;
    return counts;
  }

  function renderNamesHead() {
    if (!namesHeadEl) return;
    const worlds = sortedWorlds(state.contactLog);
    if (!worlds.length) { namesHeadEl.innerHTML = ''; return; }
    const counts = statusCounts(worlds);
    const total = worlds.length;
    // Summary: total + each present status. Comma-separated rather than
    // bullets so the line wraps gracefully on narrow phones.
    const parts = [`<strong>${total}</strong> contact${total === 1 ? '' : 's'}`];
    for (const s of STATUS_ORDER) {
      if (counts[s] > 0) parts.push(`<span class="s-${s.toLowerCase()}"><strong>${counts[s]}</strong> ${s.toLowerCase()}</span>`);
    }
    namesHeadEl.innerHTML = `<div class="cl-summary">${parts.join(' · ')}</div>`;
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

  // A single Name entry, framed around Kalen's note. The collapsed card leads
  // with his portrait + the note, status meaning, and consequence — the four
  // most dramatic facts about a contact. Expanding reveals the rest (image,
  // method, world, politics, episode). Designed to read like a log story
  // rather than a sortable table.
  function renderEntry(w) {
    const open = expandedId === w.id;
    const detail = worldDetail(w.id);
    const def = ALL_WORLDS[w.id];
    const sCls = `s-${w.status.toLowerCase()}`;
    const meaning = STATUS_MEANING[w.status] || '';
    const note = detail && detail.note ? detail.note : (def && def.flavor ? def.flavor : '');
    const consequence = detail && detail.cost ? detail.cost : '';
    return `
      <li class="contacted ${sCls}${open ? ' is-open' : ''}">
        <button type="button" class="cl-entry"
          data-act="toggle-entry" data-id="${w.id}"
          aria-expanded="${open ? 'true' : 'false'}">
          <div class="cl-entry-head">
            <div class="cl-name">${w.name}</div>
            <span class="cl-status ${sCls}">${w.status}</span>
          </div>
          <div class="cl-entry-body">
            <img class="cl-avatar" alt="Kalen" src="${KALEN_PORTRAIT}" loading="lazy" />
            <div class="cl-entry-text">
              ${note ? `<p class="cl-detail-note"><em>${note}</em></p>` : ''}
              ${meaning ? `<div class="cl-ep-meaning ${sCls}">${meaning}</div>` : ''}
              ${consequence ? `<p class="cl-consequence">${consequence}</p>` : ''}
            </div>
          </div>
          <i class="ri ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} cl-entry-chev" aria-hidden="true"></i>
        </button>
        ${open ? renderEntryDetail(w, detail, def) : ''}
      </li>
    `;
  }

  function renderEntryDetail(w, detail, def) {
    const img = def && def.image;
    const portrait = img
      ? `<img class="cl-detail-img" loading="lazy" alt="${w.name}" src="${img}"
            onerror="this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='flex';" />
         <div class="cl-detail-fallback" aria-hidden="true" style="display:none"></div>`
      : `<div class="cl-detail-fallback" aria-hidden="true"></div>`;
    const epTitle = EP_TITLES[w.ep];
    const epLabel = epTitle ? `Episode ${w.ep} — ${epTitle}` : `Episode ${w.ep}`;
    if (!detail) {
      return `
        <div class="cl-detail">
          ${portrait}
          <dl class="cl-detail-rows">
            <div class="cl-detail-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
          </dl>
          <p class="cl-detail-empty">The folder is thin. The recordings remain.</p>
        </div>
      `;
    }
    return `
      <div class="cl-detail">
        ${portrait}
        <dl class="cl-detail-rows">
          <div class="cl-detail-row"><dt>Method</dt><dd>${detail.method}</dd></div>
          <div class="cl-detail-row"><dt>World</dt><dd>${detail.biology}</dd></div>
          <div class="cl-detail-row"><dt>Politics</dt><dd>${detail.politics}</dd></div>
          <div class="cl-detail-row"><dt>Episode</dt><dd>${epLabel}</dd></div>
        </dl>
      </div>
    `;
  }

  // Static FAQ panels — hardcoded HTML, no state interpolation. Rendered once
  // at init so the modal's render() pass doesn't rebuild three identical
  // innerHTMLs on every open / entry toggle / engraving buy.
  if (memoryInfoEl) memoryInfoEl.innerHTML = `
    <div class="faq-block kind-memory">
      <div class="faq-head"><i class="ri ri-database-2-line"></i>How Echo Memory works</div>
      <div class="faq-body">
        <p><strong>Earn:</strong> one shard per name on the log. Across every cycle, every episode. Eighty-plus shards if I log every contact.</p>
        <p><strong>What it does:</strong> each shard adds <strong>+10%</strong> to base Echoes/s, applied <em>before</em> every other multiplier.</p>
        <p><strong>Never lost.</strong> The names stay. This number only ever climbs.</p>
      </div>
    </div>
  `;
  if (massInfoEl) massInfoEl.innerHTML = `
    <div class="faq-block kind-mass">
      <div class="faq-head"><i class="ri ri-scales-3-line"></i>How Carrier Mass works</div>
      <div class="faq-body">
        <p><strong>Earn:</strong> banked at cycle close from the cycle's <em>peak</em> Echo balance. Every 10× past 1k = +1 kg. 100k peak → 3 kg. 1B → 7 kg. 1T → 10 kg.</p>
        <p><strong>Spend:</strong> Engravings above — permanent cuts to the rig.</p>
        <p><strong>Tip:</strong> peak is what counts, not the closing balance. Spike the rate before I close.</p>
      </div>
    </div>
  `;
  if (closeInfoEl) closeInfoEl.innerHTML = `
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
    renderProgress();
    renderHook();
    renderStats();
    renderAction();
    renderEngravings();
    renderLegend();
    renderNamesHead();
    renderList();
    renderPending();
  }

  const openPanel = (panel) => {
    const name = PANEL_TITLES[panel] ? panel : 'cycle';
    armed = false;
    setActiveTab(name);
    if (name === 'names') {
      // Opening the panel counts as acknowledging every world currently logged.
      markNamesSeen(state.contactLog);
      if (typeof opts.onLogPersist === 'function') opts.onLogPersist();
    }
    if (name === 'rig') {
      // Same acknowledgement for Carrier Mass — opening the Rig panel clears
      // the right-radar pulse until the next cycle close banks more mass.
      markRigSeen(state.contactLog);
      if (typeof opts.onLogPersist === 'function') opts.onLogPersist();
    }
    render();
    modal.classList.add('open');
  };
  const close = () => { armed = false; modal.classList.remove('open'); };

  // Affordance state surfaced to the contactProgress strip. cycleReady drives
  // the pulse on the center wave segment; namesUnread drives the pulse on the
  // left planet. In Loop mode the close is always legal — the pulse stays on
  // as long as canCloseCycle agrees.
  // Reuse the same object instance every call — getAffordance is invoked from
  // the strip's per-frame update(), so a fresh literal each tick was 60 GC'd
  // throwaway objects per second.
  const _affordance = { cycleReady: false, namesUnread: false, rigUnread: false };
  const getAffordance = () => {
    const log = state.contactLog;
    _affordance.cycleReady = canCloseCycle(log) && (isLoopMode(log) || isCycleComplete(state));
    _affordance.namesUnread = hasUnreadNames(log);
    _affordance.rigUnread = hasUnreadRig(log);
    return _affordance;
  };

  function handleModalAction(_e, target) {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
    const t = target.closest('[data-act]');
    const act = t?.dataset.act;
    if (!act) return;
    if (act === 'arm') { armed = true; renderAction(); return; }
    if (act === 'cancel') { armed = false; renderAction(); return; }
    if (act === 'confirm') {
      if (typeof opts.onCloseCycle === 'function') opts.onCloseCycle();
      return;
    }
    if (act === 'buy-engraving') {
      const id = t.dataset.id;
      if (buyEngraving(state.contactLog, id)) {
        if (typeof opts.onBuyEngraving === 'function') opts.onBuyEngraving(id);
        render();
      }
      return;
    }
    if (act === 'toggle-entry') {
      const id = t.dataset.id;
      expandedId = expandedId === id ? null : id;
      renderList();
      return;
    }
  }
  installTap(modal, handleModalAction);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { openPanel, close, render, getAffordance };
}
