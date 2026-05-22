// Rig modal — the persistence layer. Surfaces Echo Memory (shards × +10%),
// Carrier Mass (banked + projected for this cycle), and the Engravings shop
// that converts Mass into permanent rig cuts.
import {
  ENGRAVINGS, engravingCost, canBuyEngraving, buyEngraving,
  getMass, getEngraving, massForPeak, memoryShards, memoryMul,
  ECHO_MEMORY_PER_SHARD, echoLoopLevel, markRigSeen,
} from './contactLog.js';
import { installTap } from './tap.js';

export function initRigModalUi(state, opts = {}) {
  const modal = document.getElementById('rigModal');
  const tilesEl       = modal.querySelector('.cl-rig-tiles');
  const projectionEl  = modal.querySelector('.cl-rig-projection');
  const engravingsEl  = modal.querySelector('.cl-engravings');
  const massInfoEl    = modal.querySelector('.cl-mass-info');

  // Static FAQ — banked vs. accreting Mass mechanics. Rendered once at init.
  massInfoEl.innerHTML = `
    <div class="faq-block kind-mass">
      <div class="faq-head"><i class="ri ri-scales-3-line"></i>How Carrier Mass works</div>
      <div class="faq-body">
        <p><strong>Earn:</strong> banked at cycle close from the cycle's <em>peak</em> Echo balance. Every 10× past 1k = +1 kg. 100k peak → 3 kg. 1B → 7 kg. 1T → 10 kg.</p>
        <p><strong>Spend:</strong> Engravings above — permanent cuts to the rig.</p>
        <p><strong>Tip:</strong> peak is what counts, not the closing balance. Spike the rate before I close.</p>
      </div>
    </div>
  `;

  function peakAmount() {
    return (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
  }

  function renderTiles() {
    const log = state.contactLog;
    const shards = memoryShards(log);
    const loop = echoLoopLevel(log);
    const mul = memoryMul(log);
    const memoryPct = Math.round((mul - 1) * 100);
    const mass = getMass(log);
    const memoryTail = loop > 0
      ? ` · ${shards} shard${shards === 1 ? '' : 's'} + ${loop} loop${loop === 1 ? '' : 's'}`
      : (shards ? ` · ${shards} shard${shards === 1 ? '' : 's'}` : '');
    tilesEl.innerHTML = `
      <div class="cl-stat is-wide cl-rig-memory">
        <div class="cl-stat-label">Echo Memory</div>
        <div class="cl-stat-value cl-memory cl-rig-big">+${memoryPct}%${memoryTail}</div>
        <p class="cl-stat-hint">One shard per name on the log. Each shard adds +${Math.round(ECHO_MEMORY_PER_SHARD * 100)}% to base Echoes/s, before every other multiplier.</p>
      </div>
      <div class="cl-stat is-wide cl-rig-mass">
        <div class="cl-stat-label">Carrier Mass</div>
        <div class="cl-stat-value cl-mass cl-rig-big">${mass} <span class="cl-rig-unit">kg</span></div>
        <p class="cl-stat-hint">Banked at cycle close. Spend it on Engravings — those cuts survive every reset.</p>
      </div>
    `;
  }

  function renderProjection() {
    const peak = peakAmount();
    const projected = massForPeak(peak);
    if (projected <= 0) { projectionEl.innerHTML = ''; return; }
    projectionEl.innerHTML = `
      <div class="cl-rig-proj">
        <span class="cl-rig-proj-label">Accreting this cycle</span>
        <span class="cl-rig-proj-value">+${projected} kg <span class="cl-rig-proj-hint">if I close now</span></span>
      </div>
    `;
  }

  function renderEngravings() {
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
      const costLabel = maxed ? 'maxed' : `${cost} kg`;
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
      <ul class="cl-eng-list">${rows}</ul>
    `;
  }

  function render() {
    renderTiles();
    renderProjection();
    renderEngravings();
  }

  const open = () => {
    markRigSeen(state.contactLog);
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
    if (act === 'buy-engraving') {
      const id = t.dataset.id;
      if (buyEngraving(state.contactLog, id)) {
        if (typeof opts.onBuyEngraving === 'function') opts.onBuyEngraving(id);
        render();
      }
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render };
}
