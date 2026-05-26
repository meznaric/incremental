import { installTap } from './tap.js';
import { formatAbbrev } from './bignum.js';
import {
  SECTORS, TIER_INFO, getHexAt, placeRelay,
  networkContribution, networkStatus,
  relayYield, discoveryRatePerMin, adjacentOnlineCount, coverageMultiplier,
  ensureNetwork, bleedValue, hexDistance,
} from './network.js';
import { makeNetworkScene } from './networkScene.js';
import { nowSeconds } from './save.js';

const TIER_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
const TIER_LABEL = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary', mythic: 'Mythic',
};
// Sector multipliers span yieldMul ∈ [0.7, 2.0] and discoveryMul ∈ [0.2, 5.0].
// Normalize each independently with a baseline floor so the smallest value
// is still visibly drawn in the legend (not a zero-height sliver).
const SECTOR_YIELD_MIN = 0.7, SECTOR_YIELD_MAX = 2.0;
const SECTOR_DISC_MIN  = 0.2, SECTOR_DISC_MAX  = 5.0;
function sectorBarFractions(sector) {
  const y = (sector.yieldMul - SECTOR_YIELD_MIN) / (SECTOR_YIELD_MAX - SECTOR_YIELD_MIN);
  const d = (sector.discoveryMul - SECTOR_DISC_MIN) / (SECTOR_DISC_MAX - SECTOR_DISC_MIN);
  return {
    yieldF: 0.18 + 0.82 * Math.max(0, Math.min(1, y)),
    discF:  0.12 + 0.88 * Math.max(0, Math.min(1, d)),
  };
}

function fmtMin(sec) {
  if (sec < 60) return `${Math.ceil(sec)}s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export function makeNetworkUi(state, opts) {
  const modalEl = document.getElementById('networkModal');
  const bodyEl = document.getElementById('networkModalBody');
  const titleEl = document.getElementById('networkModalTitle');
  const chipEl = document.getElementById('networkChip');
  if (!modalEl || !bodyEl || !chipEl) return { open: () => {}, render: () => {}, refresh: () => {}, drainLosses: () => 0, flashBleed: () => {} };
  const openDiagnostic = opts && typeof opts.openDiagnostic === 'function' ? opts.openDiagnostic : null;

  let selectedRelayId = null;
  let selectedEmptyHex = null; // {q, r} — tapped empty hex with no queued token
  let pendingPlacement = null; // {q, r} — staged hex awaiting confirmation (queue present)
  let scene = null;            // networkScene instance, created on first open
  // Side panel expansion is purely user-driven (tap the handle). Closed by
  // default on mobile so the canvas is unobstructed; selecting / clearing
  // a cell never changes this. Desktop ignores the flag — CSS pins the
  // panel open at media widths > 720px regardless.
  let infoPanelOpen = false;

  const open = () => {
    ensureNetwork(state);
    modalEl.classList.add('open');
    render();
  };
  const close = () => {
    modalEl.classList.remove('open');
    pendingPlacement = null;
    selectedEmptyHex = null;
    selectedRelayId = null;
    infoPanelOpen = false;
    // Reset the hex-bar animation tracker so reopening the modal triggers
    // a fresh entrance the next time a cell is selected.
    lastBarKey = 'none';
    if (currentBarEl && currentBarEl.parentNode) currentBarEl.remove();
    currentBarEl = null;
    if (pendingExitTimer) { clearTimeout(pendingExitTimer); pendingExitTimer = null; }
    if (scene) scene.close();
  };
  const clearSelection = () => {
    selectedRelayId = null;
    selectedEmptyHex = null;
    pendingPlacement = null;
  };
  // Resize observer flips needsResize on the scene; rAF picks it up next frame.
  window.addEventListener('resize', () => {
    if (!modalEl.classList.contains('open')) return;
    if (scene) scene.resize();
    render();
  });

  installTap(chipEl, () => open());
  installTap(modalEl, (e) => {
    if (e.target === modalEl || e.target.closest('.bm-close')) { close(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modalEl.classList.contains('open')) return;
    if (selectedRelayId || selectedEmptyHex || pendingPlacement) {
      clearSelection();
      pushSelectionToScene();
      renderOverlays();
      return;
    }
    close();
  });

  // Delegated taps on modal body for the bottom-bar buttons and the diag link.
  // Hex / relay selection now flows through the scene's onSelect callback —
  // taps on the canvas don't bubble up as data-hex/data-relay anymore.
  installTap(bodyEl, (_e, target) => {
    if (target.closest('[data-act="open-diag"]')) {
      if (openDiagnostic) openDiagnostic('network');
      return;
    }
    if (target.closest('[data-act="confirm-placement"]')) {
      if (pendingPlacement) {
        placeRelay(state, pendingPlacement, nowSeconds());
        pendingPlacement = null;
        if (scene) scene.refresh(nowSeconds());
        pushSelectionToScene();
        renderOverlays();
      }
      return;
    }
    if (target.closest('[data-act="cancel-placement"]') || target.closest('[data-act="clear-selection"]')) {
      clearSelection();
      pushSelectionToScene();
      renderOverlays();
      return;
    }
    if (target.closest('[data-act="toggle-info"]')) {
      infoPanelOpen = !infoPanelOpen;
      applySheetState();
      return;
    }
    if (target.closest('[data-act="open-info"]')) {
      // Tap anywhere on the collapsed status row opens the panel. While
      // expanded the status row is non-interactive (the handle closes).
      if (!infoPanelOpen) {
        infoPanelOpen = true;
        applySheetState();
      }
      return;
    }
  });

  function handleSelect(sel) {
    const net = state.network;
    // The centered cell IS the action target. Pan moves the centered cell
    // continuously; tap also moves it (and focuses the camera there). Both
    // routes resolve to the same selection rules below — the only thing
    // tap-only behaviour does differently is toggle off an existing
    // selection if the player re-taps the same cell.
    const isTap = sel.via === 'tap';
    if (sel.kind === 'relay') {
      if (isTap && sel.id === selectedRelayId) clearSelection();
      else { selectedRelayId = sel.id; selectedEmptyHex = null; pendingPlacement = null; }
    } else if (sel.kind === 'hex') {
      const occupied = net && net.relays.find((r) => r.hex.q === sel.q && r.hex.r === sel.r);
      if (occupied) {
        if (isTap && occupied.id === selectedRelayId) clearSelection();
        else { selectedRelayId = occupied.id; selectedEmptyHex = null; pendingPlacement = null; }
      } else if (net && net.queued.length > 0) {
        // Queue present + empty hex: stage a placement preview at that cell.
        // Panning across cells continuously re-stages so the player can sweep
        // through candidates; "Place here" commits. Re-tapping the staged
        // cell clears it.
        if (isTap && pendingPlacement && pendingPlacement.q === sel.q && pendingPlacement.r === sel.r) {
          clearSelection();
        } else {
          pendingPlacement = { q: sel.q, r: sel.r };
          selectedRelayId = null;
          selectedEmptyHex = null;
        }
      } else if (isTap && selectedEmptyHex && selectedEmptyHex.q === sel.q && selectedEmptyHex.r === sel.r) {
        clearSelection();
      } else {
        // No queue + empty hex: surface the sector-stats bar.
        selectedEmptyHex = { q: sel.q, r: sel.r };
        selectedRelayId = null;
        pendingPlacement = null;
      }
    } else if (sel.kind === 'empty-space') {
      if (selectedRelayId || selectedEmptyHex || pendingPlacement) clearSelection();
    }
    pushSelectionToScene();
    renderOverlays();
  }

  function pushSelectionToScene() {
    if (!scene) return;
    const now = nowSeconds();
    if (pendingPlacement) {
      const tier = (state.network && state.network.queued[0] && state.network.queued[0].tier) || 'common';
      scene.setSelection({ kind: 'pending', q: pendingPlacement.q, r: pendingPlacement.r, tier }, now);
      return;
    }
    if (selectedRelayId) {
      scene.setSelection({ kind: 'relay', id: selectedRelayId }, now);
      return;
    }
    if (selectedEmptyHex) {
      scene.setSelection({ kind: 'hex', q: selectedEmptyHex.q, r: selectedEmptyHex.r }, now);
      return;
    }
    scene.setSelection({ kind: null }, now);
  }

  function ensureSkeleton() {
    if (bodyEl.querySelector('.net-layout')) return;
    bodyEl.innerHTML = `
      <div class="net-layout">
        <div class="net-map">
          <canvas class="net-canvas"></canvas>
          <div class="net-hexbar-slot"></div>
        </div>
        <div class="net-upnext"></div>
        <div class="net-side"></div>
      </div>
    `;
  }

  function ensureScene() {
    if (scene) return scene;
    const canvas = bodyEl.querySelector('.net-canvas');
    if (!canvas) return null;
    scene = makeNetworkScene({
      canvas,
      getState: () => state,
      onSelect: handleSelect,
    });
    return scene;
  }

  // Mobile-only strip rendered between the map and the side panel. Compact
  // horizontal chip list of upcoming tokens so the player can see what they
  // are about to place without scrolling past status/summary.
  function renderUpNext() {
    const net = ensureNetwork(state);
    const queued = (net && net.queued) || [];
    if (queued.length === 0) {
      return `
        <div class="net-upnext-head">Up next</div>
        <div class="net-upnext-empty">No tokens queued. Buy a Seed Relay in the shop.</div>
      `;
    }
    const chips = queued.map((t, i) => `
      <div class="net-upnext-chip rar-${t.tier}">
        <span class="net-upnext-pos">${i === 0 ? 'next' : `#${i + 1}`}</span>
        <span class="net-token-dot rar-${t.tier}"></span>
        <span class="net-upnext-tier">${TIER_LABEL[t.tier] || t.tier}</span>
        <span class="net-upnext-yield">+${formatAbbrev(t.baseYield)}/s</span>
      </div>
    `).join('');
    return `
      <div class="net-upnext-head">Up next · ${queued.length}</div>
      <div class="net-upnext-strip">${chips}</div>
    `;
  }

  function renderSidePanel(now) {
    const net = ensureNetwork(state);
    const status = networkStatus(state, now);
    const cov = coverageMultiplier(net, now);
    const contribution = networkContribution(state, now);
    const queued = net.queued;

    const queuedRows = queued.length === 0
      ? `<div class="net-empty">No tokens queued. Buy a Seed Relay slot in the shop.</div>`
      : queued.map((t, i) => `
          <div class="net-queue-row">
            <span class="net-token-dot rar-${t.tier}"></span>
            <span class="net-token-tier">${TIER_LABEL[t.tier] || t.tier}</span>
            <span class="net-token-yield">+${formatAbbrev(t.baseYield)}/s</span>
            <span class="net-token-pos">${i === 0 ? 'next' : `#${i + 1}`}</span>
          </div>
        `).join('');

    const coveredSectors = new Set();
    for (const r of net.relays) {
      if (now >= r.ripensAt) coveredSectors.add(r.sector);
    }
    const totalSectors = Object.keys(SECTORS).length;
    const coverBonusPct = ((cov - 1) * 100).toFixed(0);
    const sectorChips = Object.entries(SECTORS).map(([key, s]) => {
      const on = coveredSectors.has(key);
      return `<span class="net-cov-chip ${on ? 'on' : 'off'}" style="--sec-color:${s.color}" title="${s.label}${on ? ' · covered' : ' · not covered'}"></span>`;
    }).join('');

    return `
      <button type="button" class="net-side-handle" data-act="toggle-info" aria-label="Toggle network info">
        <span class="net-side-handle-grip"></span>
      </button>
      <div class="net-status" data-act="open-info">
        <div class="net-stat">
          <span class="net-stat-num">${status.online}</span>
          <span class="net-stat-lab">online</span>
        </div>
        <div class="net-stat">
          <span class="net-stat-num">${status.ripening}</span>
          <span class="net-stat-lab">ripening</span>
        </div>
        <div class="net-stat">
          <span class="net-stat-num">${status.queued}</span>
          <span class="net-stat-lab">queued</span>
        </div>
        <div class="net-stat dim">
          <span class="net-stat-num">${status.lost}</span>
          <span class="net-stat-lab">lost</span>
        </div>
      </div>
      <div class="net-summary">
        <div class="net-summary-row"><span>Mesh /s</span><span>+${formatAbbrev(contribution)}</span></div>
        <div class="net-summary-row">
          <span>Coverage</span>
          <span>${coveredSectors.size} / ${totalSectors} sectors · +${coverBonusPct}%</span>
        </div>
        <div class="net-cov-chips">${sectorChips}</div>
      </div>
      <div class="net-queue">
        <div class="net-section-head">Placement queue</div>
        ${queuedRows}
        ${queued.length > 0 ? `<div class="net-hint">Tap an empty hex to choose where to place the next token.</div>` : ''}
      </div>
      <div class="net-legend">
        <div class="net-section-head">
          Sectors
          <button type="button" class="net-help-link" data-act="open-diag">How does this work? <i class="ri ri-arrow-right-s-line"></i></button>
        </div>
        <div class="net-legend-key">High <span class="key-bar yield"></span> sectors lift; high <span class="key-bar disc"></span> sectors glow.</div>
        ${Object.entries(SECTORS).map(([key, s]) => {
          const { yieldF, discF } = sectorBarFractions(s);
          return `
          <div class="net-legend-row sec-tag-${key}" style="--sec-color:${s.color}">
            <span class="net-legend-bars">
              <span class="bar yield" style="height:${(yieldF * 100).toFixed(0)}%"></span>
              <span class="bar disc"  style="height:${(discF * 100).toFixed(0)}%"></span>
            </span>
            <span class="net-legend-name">${s.label}</span>
            <span class="net-legend-mults">×${s.yieldMul} yield · ×${s.discoveryMul} risk</span>
          </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Bottom bar: docked surface for "what did I just tap on?" — relay detail,
  // staged placement, or empty-hex sector info. Lives inside .net-map so it
  // overlays the 3D canvas.
  function renderHexBar(now) {
    const net = state.network;
    if (pendingPlacement && net && net.queued.length > 0) {
      const ph = getHexAt(pendingPlacement.q, pendingPlacement.r);
      if (ph && !net.relays.some((r) => r.hex.q === ph.q && r.hex.r === ph.r)) {
        return renderStagedBar(ph, net, now);
      }
    }
    if (selectedRelayId && net) {
      const relay = net.relays.find((r) => r.id === selectedRelayId);
      if (relay) return renderRelayBar(relay, net, now);
    }
    if (selectedEmptyHex) {
      const ph = getHexAt(selectedEmptyHex.q, selectedEmptyHex.r);
      if (ph && !(net && net.relays.some((r) => r.hex.q === ph.q && r.hex.r === ph.r))) {
        return renderEmptyHexBar(ph, net);
      }
    }
    return '';
  }

  function renderStagedBar(ph, net, now) {
    const token = net.queued[0];
    const sector = SECTORS[ph.sector] || SECTORS.frontier;
    const tier = TIER_INFO[token.tier] || TIER_INFO.common;
    const projectedYield = (Number(token.baseYield) || 0) * sector.yieldMul;
    const ripenSec = tier.ripenSec * sector.ripenMul;
    const queueTail = net.queued.length > 1 ? ` <span class="net-place-sep">·</span> <span>${net.queued.length - 1} more queued</span>` : '';
    const adjOnline = countAdjacentOnline(net, ph, now);
    const clusterHint = adjOnline > 0
      ? `<span>${adjOnline} online neighbour${adjOnline === 1 ? '' : 's'} → +${(adjOnline * 25)}% cluster</span>`
      : `<span>isolated · mesh bleed enabled</span>`;
    return `
      <div class="net-place-bar staged" role="dialog" aria-label="Confirm placement">
        <div class="net-place-head">
          <span class="net-place-tier rar-${token.tier}">${TIER_LABEL[token.tier] || token.tier} relay</span>
          <span class="net-detail-sec sec-tag-${ph.sector}">${sector.label}</span>
        </div>
        <div class="net-detail-row"><span>+${formatAbbrev(projectedYield)}/s when ripe</span><span>ripens in ${fmtMin(ripenSec)}</span></div>
        <div class="net-place-stats">${clusterHint}${queueTail}</div>
        <div class="net-place-hint">Tap another empty hex to move.</div>
        <div class="net-place-actions">
          <button class="net-place-btn cancel" type="button" data-act="cancel-placement">Cancel</button>
          <button class="net-place-btn confirm" type="button" data-act="confirm-placement">Place here</button>
        </div>
      </div>
    `;
  }

  function renderRelayBar(relay, net, now) {
    const online = now >= relay.ripensAt;
    const sector = SECTORS[relay.sector] || SECTORS.frontier;
    const adj = adjacentOnlineCount(net, relay, now);
    const isolated = online && adj === 0;
    const tier = TIER_INFO[relay.tier] || TIER_INFO.common;
    const neighbourTiers = listAdjacentOnlineTiers(net, relay, now);
    const status = online ? (isolated ? 'isolated' : 'clustered') : 'ripening';
    const yieldNow = relayYield(net, relay, now);
    const headStat = online
      ? `<div class="net-detail-row"><span>Live yield</span><span>+${formatAbbrev(yieldNow)}/s</span></div>`
      : `<div class="net-detail-row"><span>Ripens in</span><span>${fmtMin(relay.ripensAt - now)}</span></div>`;
    const baseRow = `<div class="net-detail-row"><span>Base × sector</span><span>+${formatAbbrev(relay.baseYield)} × ${sector.yieldMul}</span></div>`;
    const neighbourLine = online
      ? `<div class="net-detail-row"><span>Neighbours online</span><span>${adj}${neighbourTiers ? ` · ${neighbourTiers}` : ''}</span></div>`
      : '';
    const bleedLine = (online && isolated && tier.bleedPeriodSec > 0)
      ? `<div class="net-detail-row warn"><span>Isolated · mesh bleed</span><span>+${formatAbbrev(bleedValue(relay))} every ${fmtMin(tier.bleedPeriodSec)}</span></div>`
      : '';
    let halfLifeLine = '';
    if (online) {
      const discPerMin = discoveryRatePerMin(net, relay, now);
      const halfLifeMin = discPerMin > 0 ? Math.log(2) / discPerMin : Infinity;
      const halfLifeStr = isFinite(halfLifeMin) ? fmtMin(halfLifeMin * 60) : '—';
      halfLifeLine = `<div class="net-detail-row"><span>Half-life to discovery</span><span>${halfLifeStr}</span></div>`;
    }
    return `
      <div class="net-place-bar relay status-${status}" role="dialog" aria-label="Relay detail">
        <div class="net-place-head">
          <span class="net-place-tier rar-${relay.tier}">${TIER_LABEL[relay.tier] || relay.tier} relay <span class="net-place-status">· ${status}</span></span>
          <span class="net-place-head-right">
            <span class="net-detail-sec sec-tag-${relay.sector}">${sector.label}</span>
            <button type="button" class="net-place-close" data-act="clear-selection" aria-label="Close">×</button>
          </span>
        </div>
        ${headStat}
        ${baseRow}
        ${neighbourLine}
        ${bleedLine}
        ${halfLifeLine}
      </div>
    `;
  }

  function renderEmptyHexBar(ph, net) {
    const sector = SECTORS[ph.sector] || SECTORS.frontier;
    const hasQueue = net && net.queued.length > 0;
    const hint = hasQueue
      ? `<div class="net-place-hint">Tap an empty hex to stage the next token.</div>`
      : `<div class="net-place-hint">No relays queued — buy a Seed Relay slot in the shop.</div>`;
    return `
      <div class="net-place-bar empty" role="dialog" aria-label="Empty hex detail">
        <div class="net-place-head">
          <span class="net-place-tier">Empty hex</span>
          <span class="net-place-head-right">
            <span class="net-detail-sec sec-tag-${ph.sector}">${sector.label}</span>
            <button type="button" class="net-place-close" data-act="clear-selection" aria-label="Close">×</button>
          </span>
        </div>
        <div class="net-detail-row"><span>Yield</span><span>×${sector.yieldMul}</span></div>
        <div class="net-detail-row"><span>Discovery</span><span>×${sector.discoveryMul}</span></div>
        <div class="net-detail-row"><span>Ripen</span><span>×${sector.ripenMul}</span></div>
        ${hint}
      </div>
    `;
  }

  function countAdjacentOnline(net, hex, now) {
    if (!net) return 0;
    let n = 0;
    for (const rr of net.relays) {
      if (now < rr.ripensAt) continue;
      if (hexDistance(rr.hex, hex) === 1) n++;
    }
    return n;
  }
  function listAdjacentOnlineTiers(net, relay, now) {
    if (!net) return '';
    const tiers = [];
    for (const rr of net.relays) {
      if (rr.id === relay.id) continue;
      if (now < rr.ripensAt) continue;
      if (hexDistance(rr.hex, relay.hex) === 1) tiers.push(rr.tier);
    }
    if (!tiers.length) return '';
    tiers.sort((a, b) => TIER_ORDER.indexOf(b) - TIER_ORDER.indexOf(a));
    return tiers.map((t) => TIER_LABEL[t] || t).join(', ');
  }

  // Side sheet visibility is purely user-driven via the handle / status row.
  // Selecting a cell never opens or closes the panel — the canvas stays
  // uncluttered until the player explicitly pulls the panel up. CSS gates
  // the visual collapse to the mobile breakpoint; desktop ignores the class.
  function applySheetState() {
    const sideEl = bodyEl.querySelector('.net-side');
    if (!sideEl) return;
    sideEl.classList.toggle('collapsed-mobile', !infoPanelOpen);
  }

  // The bar's "identity" — when it changes, the bar animates in/out. While
  // the identity is unchanged we DO NOT touch the bar's DOM, because the
  // HUD tick fires renderOverlays every 100ms and any inner-HTML patch
  // would yank the Cancel / Place / Done buttons out from under the
  // player's finger mid-tap. That's the bug — placement looked broken
  // because the button the user pressed had just been replaced by a clone.
  //
  // Tradeoff: timer-like values inside the bar (ripens-in countdown, live
  // yield) freeze while the bar is open. Acceptable — the bar is a quick
  // peek; close + reopen refreshes it.
  let lastBarKey = 'none';
  let currentBarEl = null;
  let pendingExitTimer = null;
  function barIdentity() {
    if (pendingPlacement) return `staged-${pendingPlacement.q},${pendingPlacement.r}`;
    if (selectedRelayId) return `relay-${selectedRelayId}`;
    if (selectedEmptyHex) return `empty-${selectedEmptyHex.q},${selectedEmptyHex.r}`;
    return 'none';
  }
  function clearPendingExit() {
    if (pendingExitTimer) { clearTimeout(pendingExitTimer); pendingExitTimer = null; }
  }
  function detachBar(el, immediate) {
    if (!el) return;
    if (immediate) { el.remove(); return; }
    el.classList.remove('net-bar-enter');
    el.classList.add('net-bar-exit');
    pendingExitTimer = setTimeout(() => {
      if (el.parentNode) el.remove();
      pendingExitTimer = null;
    }, 220);
  }
  function updateHexBar(now) {
    const slot = bodyEl.querySelector('.net-hexbar-slot');
    if (!slot) return;
    const newKey = barIdentity();
    // Identity unchanged — leave the live DOM alone. Buttons stay tappable,
    // animation plays through. (See big comment above.)
    if (newKey === lastBarKey) return;

    // Identity changed.
    clearPendingExit();
    const outgoing = currentBarEl;

    if (newKey === 'none') {
      // No new bar — fade the outgoing one out.
      currentBarEl = null;
      lastBarKey = 'none';
      detachBar(outgoing, false);
      return;
    }

    // New bar — build it, animate it in. Outgoing bar (if any) gets detached
    // immediately so the slot only ever holds one bar at a time, avoiding
    // layout shuffles during the transition.
    if (outgoing) detachBar(outgoing, true);
    const temp = document.createElement('div');
    temp.innerHTML = renderHexBar(now);
    const bar = temp.firstElementChild;
    if (bar) {
      bar.classList.add('net-bar-enter');
      slot.appendChild(bar);
      currentBarEl = bar;
    }
    lastBarKey = newKey;
  }

  // renderOverlays = redraw the docked hex-bar + up-next + side panel only.
  // The 3D canvas is driven by scene.refresh() in the full render() path.
  function renderOverlays() {
    if (!modalEl.classList.contains('open')) return;
    const now = nowSeconds();
    const upNextEl = bodyEl.querySelector('.net-upnext');
    const sideEl = bodyEl.querySelector('.net-side');
    updateHexBar(now);
    if (upNextEl) upNextEl.innerHTML = renderUpNext();
    if (sideEl) sideEl.innerHTML = renderSidePanel(now);
    applySheetState();
  }

  function render() {
    if (!modalEl.classList.contains('open')) return;
    const now = nowSeconds();
    // Drop stale selection if the relay was lost between renders.
    if (selectedRelayId && state.network && !state.network.relays.some((r) => r.id === selectedRelayId)) {
      selectedRelayId = null;
    }
    if (selectedEmptyHex && state.network && state.network.relays.some((r) => r.hex.q === selectedEmptyHex.q && r.hex.r === selectedEmptyHex.r)) {
      selectedEmptyHex = null;
    }
    if (pendingPlacement && (!state.network || state.network.queued.length === 0)) {
      pendingPlacement = null;
    }
    const status = networkStatus(state, now);
    titleEl.textContent = status.online + status.ripening > 0
      ? `Network · ${status.online + status.ripening} relay${status.online + status.ripening === 1 ? '' : 's'}`
      : 'Network';
    ensureSkeleton();
    const sc = ensureScene();
    if (sc) {
      if (!sc.running) {
        sc.open();
        // Give the canvas a layout tick before first refresh so resize sees real px.
        requestAnimationFrame(() => { sc.resize(); sc.refresh(now); pushSelectionToScene(); });
      } else {
        sc.refresh(now);
        pushSelectionToScene();
      }
    }
    renderOverlays();
  }

  function refresh() {
    const now = nowSeconds();
    const s = networkStatus(state, now);
    const label = chipEl.querySelector('.net-chip-label');
    const parts = [];
    if (s.queued > 0) parts.push(`${s.queued} to place`);
    parts.push(`${s.online} online`);
    if (s.ripening > 0) parts.push(`${s.ripening} ripening`);
    const text = parts.join(' · ');
    if (label && label.textContent !== text) label.textContent = text;
    const visible = !!state.network && (s.online + s.ripening + s.queued + s.lost) > 0;
    chipEl.style.display = visible ? '' : 'none';
    chipEl.classList.toggle('has-queue', s.queued > 0);
    if (modalEl.classList.contains('open')) {
      if (scene) scene.refresh(now);
      renderOverlays();
    }
  }

  function drainLosses() {
    const net = state.network;
    if (!net || !net.recentLosses || !net.recentLosses.length) return [];
    const out = net.recentLosses.slice();
    net.recentLosses = [];
    return out;
  }

  // Brief blue pulse + floating "+X" when an isolated relay drips. Caller fires
  // this from the per-tick loop. Dedupe overlapping floaters by limiting to
  // one active at a time — bleed totals already aggregate per-tick.
  let lastBleedAt = 0;
  function flashBleed(amount) {
    if (!(amount > 0)) return;
    const now = performance.now();
    chipEl.classList.remove('fx-bleed');
    void chipEl.offsetWidth;
    chipEl.classList.add('fx-bleed');
    if (now - lastBleedAt > 350) {
      lastBleedAt = now;
      const f = document.createElement('span');
      f.className = 'net-bleed-float';
      f.textContent = `+${formatAbbrev(amount)}`;
      chipEl.appendChild(f);
      setTimeout(() => { if (f.parentNode) f.remove(); }, 1200);
    }
  }

  return { open, close, render, refresh, drainLosses, flashBleed };
}
