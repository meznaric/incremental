import {
  sortedWorlds, getRun, canCloseCycle, cycleContactCount,
  memoryShards, memoryMul, ECHO_MEMORY_PER_SHARD,
} from './contactLog.js';

// The Contact Log is the only player-facing surface for the prestige loop.
// Header strip shows cycle/contacts/memory. The "Close the Cycle" action
// reveals a two-stage confirm — first click arms it, second click commits.
// The list groups worlds by the cycle that recorded them so the player can
// see their history layer by layer.
export function initContactLogUi(state, opts = {}) {
  const btn = document.getElementById('contactLogBtn');
  const modal = document.getElementById('contactLogModal');
  const body = modal.querySelector('.cl-body');
  const statsEl = modal.querySelector('.cl-stats');
  const actionEl = modal.querySelector('.cl-action');
  const listEl = modal.querySelector('.cl-list');
  let armed = false;

  function renderStats() {
    const log = state.contactLog;
    const run = getRun(log);
    const cycleCount = cycleContactCount(log);
    const shards = memoryShards(log);
    const mul = memoryMul(log);
    const memoryPct = Math.round((mul - 1) * 100);
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
    `;
  }

  function renderAction() {
    const log = state.contactLog;
    const eligible = canCloseCycle(log);
    const cycleCount = cycleContactCount(log);
    const projectedPct = Math.round(ECHO_MEMORY_PER_SHARD * 100 * cycleCount);
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
        <div class="cl-action-hint">${cycleCount} new name${cycleCount === 1 ? '' : 's'} on the log · banking <span class="cl-memory">+${projectedPct}%</span> to Echo Memory</div>
        <button type="button" class="cl-close-btn" data-act="arm">Close the Cycle</button>
      `;
      return;
    }
    actionEl.classList.add('armed');
    actionEl.innerHTML = `
      <div class="cl-confirm">
        <p>Closing this cycle resets your relays and decoders. The Contact Log remains. Each name you remember strengthens the carrier.</p>
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
        <div class="cl-group-head">Cycle ${run}${run === currentRun ? ' · current' : ''}</div>
        <ul class="cl-group-list">
          ${groups.get(run).map((w) => `
            <li>
              <div>
                <div class="cl-name">${w.name}</div>
                <div class="cl-ep">ep ${w.ep}</div>
              </div>
              <div class="cl-status s-${w.status.toLowerCase()}">${w.status}</div>
            </li>
          `).join('')}
        </ul>
      </li>
    `).join('');
  }

  function render() {
    renderStats();
    renderAction();
    renderList();
  }

  const open = () => { armed = false; render(); modal.classList.add('open'); };
  const close = () => { armed = false; modal.classList.remove('open'); };

  btn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.bm-close')) { close(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'arm') { armed = true; renderAction(); return; }
    if (act === 'cancel') { armed = false; renderAction(); return; }
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
