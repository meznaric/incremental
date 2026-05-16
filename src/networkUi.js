import { installTap } from './tap.js';
import { formatAbbrev } from './bignum.js';
import {
  SECTORS, TIER_INFO, getHexes, getHexAt, placeRelay,
  networkContribution, networkStatus,
  relayYield, discoveryRatePerMin, adjacentOnlineCount, coverageMultiplier,
  ensureNetwork, bleedValue, hexDistance,
} from './network.js';
import { nowSeconds } from './save.js';

const HEX_SIZE = 24;       // viewBox-units corner radius (pointy-top). Smaller
                            // at higher MAP_RADIUS so the grid fits the container
                            // without each hex shrinking past the readable label size.
const HEX_GAP = 0;         // outline padding around each polygon
const SVG_PAD = 18;        // padding around the whole hex cluster

const TIER_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
const TIER_LABEL = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary', mythic: 'Mythic',
};

function fmtMin(sec) {
  if (sec < 60) return `${Math.ceil(sec)}s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function hexCenterFromBounds(q, r, bounds) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2) - bounds.minX + SVG_PAD;
  const y = HEX_SIZE * 1.5 * r - bounds.minY + SVG_PAD;
  return { x, y };
}

function computeBounds() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const h of getHexes()) {
    const x = HEX_SIZE * Math.sqrt(3) * (h.q + h.r / 2);
    const y = HEX_SIZE * 1.5 * h.r;
    if (x - HEX_SIZE < minX) minX = x - HEX_SIZE;
    if (x + HEX_SIZE > maxX) maxX = x + HEX_SIZE;
    if (y - HEX_SIZE < minY) minY = y - HEX_SIZE;
    if (y + HEX_SIZE > maxY) maxY = y + HEX_SIZE;
  }
  return { minX, maxX, minY, maxY, width: (maxX - minX) + SVG_PAD * 2, height: (maxY - minY) + SVG_PAD * 2 };
}

function hexPolygonPoints(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + (HEX_SIZE - HEX_GAP) * Math.cos(angle)).toFixed(2)},${(cy + (HEX_SIZE - HEX_GAP) * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function makeNetworkUi(state, opts) {
  const modalEl = document.getElementById('networkModal');
  const bodyEl = document.getElementById('networkModalBody');
  const titleEl = document.getElementById('networkModalTitle');
  const chipEl = document.getElementById('networkChip');
  if (!modalEl || !bodyEl || !chipEl) return { open: () => {}, render: () => {}, refresh: () => {}, drainLosses: () => 0 };
  const openDiagnostic = opts && typeof opts.openDiagnostic === 'function' ? opts.openDiagnostic : null;

  const bounds = computeBounds();
  let selectedRelayId = null;

  const open = () => {
    ensureNetwork(state);
    modalEl.classList.add('open');
    render();
  };
  const close = () => modalEl.classList.remove('open');

  installTap(chipEl, () => open());
  installTap(modalEl, (e) => {
    if (e.target === modalEl || e.target.closest('.bm-close')) { close(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) close();
  });

  // Delegated tap handler on the modal body. Listens for hex / relay / queue
  // taps via data-act attributes that render() stamps onto the SVG nodes.
  installTap(bodyEl, (_e, target) => {
    if (target.closest('[data-act="open-diag"]')) {
      if (openDiagnostic) openDiagnostic('network');
      return;
    }
    const hexEl = target.closest('[data-hex]');
    const relayEl = target.closest('[data-relay]');
    if (relayEl) {
      selectedRelayId = relayEl.getAttribute('data-relay');
      render();
      return;
    }
    if (hexEl) {
      const q = Number(hexEl.getAttribute('data-q'));
      const r = Number(hexEl.getAttribute('data-r'));
      if (Number.isFinite(q) && Number.isFinite(r)) {
        const net = state.network;
        const occupied = net && net.relays.some((rr) => rr.hex.q === q && rr.hex.r === r);
        if (occupied) {
          const rr = net.relays.find((x) => x.hex.q === q && x.hex.r === r);
          if (rr) { selectedRelayId = rr.id; render(); }
          return;
        }
        if (net && net.queued.length > 0) {
          placeRelay(state, { q, r }, nowSeconds());
          selectedRelayId = null;
          render();
        }
      }
    }
  });

  function renderHexSvg(now) {
    const hexes = getHexes();
    const net = state.network;
    const relays = (net && net.relays) || [];
    const occupiedByHex = new Map();
    for (const r of relays) occupiedByHex.set(`${r.hex.q},${r.hex.r}`, r);

    const hexNodes = [];
    for (const h of hexes) {
      const { x, y } = hexCenterFromBounds(h.q, h.r, bounds);
      const sector = SECTORS[h.sector] || SECTORS.frontier;
      const occ = occupiedByHex.get(`${h.q},${h.r}`);
      const isSelected = occ && occ.id === selectedRelayId;
      const cls = ['hex-cell', `sec-${h.sector}`, occ ? 'has-relay' : 'empty', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
      // Sector label as a native browser tooltip — works without JS, fine
      // on desktop hover; mobile has the legend below the map for the same info.
      const tip = `${sector.label} · ×${sector.yieldMul} yield · ×${sector.discoveryMul} discovery risk · ×${sector.ripenMul} ripen time`;
      hexNodes.push(`
        <g class="${cls}" data-hex="1" data-q="${h.q}" data-r="${h.r}">
          <title>${tip}</title>
          <polygon points="${hexPolygonPoints(x, y)}" fill="${sector.color}" />
        </g>
      `);
    }

    // Cluster edges: draw a thin warm line between each pair of online,
    // adjacent relays. Makes mechanic A (dense yields more / dies faster)
    // visible at a glance. Drawn before relays so the relay dots cover the
    // edge ends.
    const clusterEdges = [];
    for (let i = 0; i < relays.length; i++) {
      const a = relays[i];
      if (now < a.ripensAt) continue;
      const ac = hexCenterFromBounds(a.hex.q, a.hex.r, bounds);
      for (let j = i + 1; j < relays.length; j++) {
        const b = relays[j];
        if (now < b.ripensAt) continue;
        if (hexDistance(a.hex, b.hex) !== 1) continue;
        const bc = hexCenterFromBounds(b.hex.q, b.hex.r, bounds);
        clusterEdges.push(
          `<line class="cluster-edge" x1="${ac.x.toFixed(1)}" y1="${ac.y.toFixed(1)}" x2="${bc.x.toFixed(1)}" y2="${bc.y.toFixed(1)}" />`
        );
      }
    }

    const relayNodes = [];
    for (const r of relays) {
      const { x, y } = hexCenterFromBounds(r.hex.q, r.hex.r, bounds);
      const online = now >= r.ripensAt;
      const sel = r.id === selectedRelayId;
      const radius = HEX_SIZE * 0.42;
      const labelY = y + HEX_SIZE * 0.78;
      const sector = SECTORS[r.sector] || SECTORS.frontier;
      // Ripening: progress arc around a faded core, ETA label below.
      // Online: solid dot — isolated relays carry a brighter mantle to cue
      // mechanic E (drip + shield); clustered relays read as gold-warm.
      if (online) {
        const adj = adjacentOnlineCount(net, r, now);
        const isolated = adj === 0;
        const yieldNow = relayYield(net, r, now);
        const yLabel = `+${formatAbbrev(yieldNow)}`;
        const tip = `${TIER_LABEL[r.tier] || r.tier} · ${sector.label}\n${yLabel}/s${isolated ? ' · isolated' : ` · ${adj} neighbour${adj === 1 ? '' : 's'}`}`;
        relayNodes.push(`
          <g class="relay-mark ${isolated ? 'isolated' : 'clustered'} ${sel ? 'selected' : ''}" data-relay="${r.id}">
            <title>${tip}</title>
            <circle cx="${x}" cy="${y}" r="${radius}" />
            <circle cx="${x}" cy="${y}" r="${radius * 0.45}" class="relay-core" />
            <text class="relay-label online-label" x="${x}" y="${labelY}">${yLabel}</text>
          </g>
        `);
      } else {
        const total = r.ripensAt - r.plantedAt;
        const pct = total > 0 ? Math.min(1, Math.max(0, (now - r.plantedAt) / total)) : 0;
        const ringR = radius;
        const ringC = 2 * Math.PI * ringR;
        const remain = Math.max(0, r.ripensAt - now);
        const tLabel = fmtMin(remain);
        const tip = `${TIER_LABEL[r.tier] || r.tier} · ${sector.label}\nRipens in ${tLabel}`;
        relayNodes.push(`
          <g class="relay-mark ripening ${sel ? 'selected' : ''}" data-relay="${r.id}">
            <title>${tip}</title>
            <circle cx="${x}" cy="${y}" r="${ringR}" class="ripe-base" />
            <circle cx="${x}" cy="${y}" r="${ringR}" class="ripe-fill"
              stroke-dasharray="${(ringC * pct).toFixed(2)} ${ringC.toFixed(2)}"
              transform="rotate(-90 ${x} ${y})" />
            <circle cx="${x}" cy="${y}" r="${ringR * 0.32}" class="relay-core" />
            <text class="relay-label ripen-label" x="${x}" y="${labelY}">${tLabel}</text>
          </g>
        `);
      }
    }

    return `
      <svg class="netmap-svg" viewBox="0 0 ${bounds.width.toFixed(0)} ${bounds.height.toFixed(0)}" preserveAspectRatio="xMidYMid meet">
        ${hexNodes.join('')}
        ${clusterEdges.join('')}
        ${relayNodes.join('')}
      </svg>
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

    let detailHtml = '';
    const selected = selectedRelayId
      ? net.relays.find((r) => r.id === selectedRelayId)
      : null;
    if (selected) {
      const online = now >= selected.ripensAt;
      const sector = SECTORS[selected.sector] || SECTORS.frontier;
      const adj = adjacentOnlineCount(net, selected, now);
      const isolated = online && adj === 0;
      const yieldNow = relayYield(net, selected, now);
      const discPerMin = discoveryRatePerMin(net, selected, now);
      const halfLifeMin = discPerMin > 0 ? Math.log(2) / discPerMin : Infinity;
      const halfLifeStr = isFinite(halfLifeMin) ? fmtMin(halfLifeMin * 60) : '—';
      const tier = TIER_INFO[selected.tier] || TIER_INFO.common;
      const dripRow = (online && isolated && tier.bleedPeriodSec > 0)
        ? `<div class="net-detail-row"><span>Mesh bleed</span><span>+${formatAbbrev(bleedValue(selected))} every ${fmtMin(tier.bleedPeriodSec)}</span></div>`
        : '';
      detailHtml = `
        <div class="net-detail">
          <div class="net-detail-head">
            <span class="net-detail-name">${TIER_LABEL[selected.tier]} relay</span>
            <span class="net-detail-sec sec-tag-${selected.sector}">${sector.label}</span>
          </div>
          ${online
            ? `<div class="net-detail-row"><span>Live yield</span><span>+${formatAbbrev(yieldNow)}/s</span></div>`
            : `<div class="net-detail-row"><span>Ripens in</span><span>${fmtMin(selected.ripensAt - now)}</span></div>`}
          <div class="net-detail-row"><span>Base / hex mul</span><span>+${formatAbbrev(selected.baseYield)} × ${sector.yieldMul}</span></div>
          <div class="net-detail-row"><span>Neighbours online</span><span>${adj}${isolated ? ' · isolated shield' : ''}</span></div>
          ${dripRow}
          ${online
            ? `<div class="net-detail-row"><span>Half-life to discovery</span><span>${halfLifeStr}</span></div>`
            : ''}
        </div>
      `;
    }

    // Coverage details: which sectors currently host at least one online
    // relay. The summary panel shows the count, the bonus, and a row of
    // swatches with covered ones glowing — a direct nudge to spread.
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
      <div class="net-status">
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
        ${queued.length > 0 ? `<div class="net-hint">Tap an empty hex to drop the next token.</div>` : ''}
      </div>
      ${detailHtml}
      <div class="net-legend">
        <div class="net-section-head">
          Sectors
          <button type="button" class="net-help-link" data-act="open-diag">How does this work? <i class="ri ri-arrow-right-s-line"></i></button>
        </div>
        ${Object.entries(SECTORS).map(([key, s]) => `
          <div class="net-legend-row sec-tag-${key}">
            <span class="net-legend-sw" style="background:${s.color}"></span>
            <span class="net-legend-name">${s.label}</span>
            <span class="net-legend-mults">×${s.yieldMul} yield · ×${s.discoveryMul} risk</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function render() {
    if (!modalEl.classList.contains('open')) return;
    const now = nowSeconds();
    // Drop a stale selection if the relay was lost between renders.
    if (selectedRelayId && state.network && !state.network.relays.some((r) => r.id === selectedRelayId)) {
      selectedRelayId = null;
    }
    const status = networkStatus(state, now);
    titleEl.textContent = status.online + status.ripening > 0
      ? `Network · ${status.online + status.ripening} relay${status.online + status.ripening === 1 ? '' : 's'}`
      : 'Network';
    bodyEl.innerHTML = `
      <div class="net-layout">
        <div class="net-map">${renderHexSvg(now)}</div>
        <div class="net-side">${renderSidePanel(now)}</div>
      </div>
    `;
  }

  function refresh() {
    // Update the HUD chip every HUD tick. Cheap; only DOM-touch when changed.
    const now = nowSeconds();
    const s = networkStatus(state, now);
    const label = chipEl.querySelector('.net-chip-label');
    // Compact summary — keep words where they fit, drop them where space is tight.
    // Format priority: queued action first (it's the verb the player needs),
    // then online (live yield), then ripening (background work).
    const parts = [];
    if (s.queued > 0) parts.push(`${s.queued} to place`);
    parts.push(`${s.online} online`);
    if (s.ripening > 0) parts.push(`${s.ripening} ripening`);
    const text = parts.join(' · ');
    if (label && label.textContent !== text) label.textContent = text;
    // Visibility: any network activity surfaces the chip.
    const visible = !!state.network && (s.online + s.ripening + s.queued + s.lost) > 0;
    chipEl.style.display = visible ? '' : 'none';
    // Queued tokens → yellow/pulse so the player knows there's an action waiting.
    chipEl.classList.toggle('has-queue', s.queued > 0);
    if (modalEl.classList.contains('open')) render();
  }

  function drainLosses() {
    const net = state.network;
    if (!net || !net.recentLosses || !net.recentLosses.length) return [];
    const out = net.recentLosses.slice();
    net.recentLosses = [];
    return out;
  }

  // Brief blue pulse + floating "+X" when an isolated relay drips. Caller fires
  // this from the per-tick loop. We dedupe overlapping floaters by limiting to
  // one active at a time — bleed totals already aggregate per-tick.
  let lastBleedAt = 0;
  function flashBleed(amount) {
    if (!(amount > 0)) return;
    const now = performance.now();
    // Restart the chip glow.
    chipEl.classList.remove('fx-bleed');
    void chipEl.offsetWidth;
    chipEl.classList.add('fx-bleed');
    // Floater — skip if a previous one is still mid-flight (< 350ms ago).
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
