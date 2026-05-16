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

// Pointy-top hex corners at an arbitrary radius (used for the relay frame).
function hexCornerPointsFlat(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Four L-bracket strokes one per quadrant, sized to wrap a square of side
// 2 × r around (cx, cy). Each bracket is an open polyline of three points
// (a short horizontal + a short vertical leg meeting at the corner).
function bracketCorners(cx, cy, r) {
  const leg = r * 0.42; // length of each leg
  const off = r * 0.92; // distance from center to corner
  const corners = [
    [-1, -1], [ 1, -1], [ 1,  1], [-1,  1],
  ];
  return corners.map(([sx, sy]) => {
    const ax = (cx + sx * off).toFixed(2);
    const ay = (cy + sy * off).toFixed(2);
    const hx = (cx + sx * off - sx * leg).toFixed(2);
    const hy = ay;
    const vx = ax;
    const vy = (cy + sy * off - sy * leg).toFixed(2);
    return `${hx},${hy} ${ax},${ay} ${vx},${vy}`;
  });
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
  let pendingPlacement = null; // {q, r} — staged hex awaiting confirmation
  // Mobile-only pan offset on the SVG (in CSS pixels). The map element is kept
  // stable across renders so the drag-in-progress and these listeners survive.
  const pan = { tx: 0, ty: 0, centered: false };
  let dragState = null;

  const open = () => {
    ensureNetwork(state);
    modalEl.classList.add('open');
    pan.centered = false;
    render();
  };
  const close = () => {
    modalEl.classList.remove('open');
    pendingPlacement = null;
  };
  // On viewport resize the cover-fit dimensions change, so the existing pan
  // offset no longer centers correctly. Recenter on the next render.
  window.addEventListener('resize', () => {
    if (!modalEl.classList.contains('open')) return;
    pan.centered = false;
    render();
  });

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
    if (target.closest('[data-act="confirm-placement"]')) {
      if (pendingPlacement) {
        placeRelay(state, pendingPlacement, nowSeconds());
        pendingPlacement = null;
        render();
      }
      return;
    }
    if (target.closest('[data-act="cancel-placement"]')) {
      pendingPlacement = null;
      render();
      return;
    }
    // Taps that landed on the placement bar (but not a button) shouldn't
    // bleed through to the hex underneath.
    if (target.closest('.net-place-bar')) return;
    const hexEl = target.closest('[data-hex]');
    const relayEl = target.closest('[data-relay]');
    if (relayEl) {
      selectedRelayId = relayEl.getAttribute('data-relay');
      pendingPlacement = null;
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
          if (rr) { selectedRelayId = rr.id; pendingPlacement = null; render(); }
          return;
        }
        if (net && net.queued.length > 0) {
          pendingPlacement = { q, r };
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
      const isStaged = !occ && pendingPlacement && pendingPlacement.q === h.q && pendingPlacement.r === h.r;
      const cls = ['hex-cell', `sec-${h.sector}`, occ ? 'has-relay' : 'empty', isSelected ? 'selected' : '', isStaged ? 'staged' : ''].filter(Boolean).join(' ');
      const tip = `${sector.label} · ×${sector.yieldMul} yield · ×${sector.discoveryMul} discovery risk · ×${sector.ripenMul} ripen time`;
      // Sector colour bound as a CSS variable so the stylesheet can mix fills
      // and strokes from one source. Cyberpunk treatment is in the CSS — low
      // alpha fill, full alpha stroke, occasional glow.
      hexNodes.push(`
        <g class="${cls}" data-hex="1" data-q="${h.q}" data-r="${h.r}" style="--sec-color:${sector.color}">
          <title>${tip}</title>
          <polygon points="${hexPolygonPoints(x, y)}" />
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

    // Reticle: small hex frame around the relay + four corner brackets.
    // Renders as a "tracked target" rather than a painted dot.
    const reticle = (cx, cy, scale) => {
      const r = HEX_SIZE * 0.48 * scale;
      const framePts = hexCornerPointsFlat(cx, cy, r);
      const brackets = bracketCorners(cx, cy, r * 1.32);
      return { framePts, brackets, coreR: r * 0.36 };
    };

    const relayNodes = [];
    for (const r of relays) {
      const { x, y } = hexCenterFromBounds(r.hex.q, r.hex.r, bounds);
      const online = now >= r.ripensAt;
      const sel = r.id === selectedRelayId;
      const labelY = y + HEX_SIZE * 0.85;
      const sector = SECTORS[r.sector] || SECTORS.frontier;
      if (online) {
        const adj = adjacentOnlineCount(net, r, now);
        const isolated = adj === 0;
        const yieldNow = relayYield(net, r, now);
        const yLabel = `+${formatAbbrev(yieldNow)}`;
        const tip = `${TIER_LABEL[r.tier] || r.tier} · ${sector.label}\n${yLabel}/s${isolated ? ' · isolated' : ` · ${adj} neighbour${adj === 1 ? '' : 's'}`}`;
        const ret = reticle(x, y, 1);
        relayNodes.push(`
          <g class="relay-mark ${isolated ? 'isolated' : 'clustered'} ${sel ? 'selected' : ''}" data-relay="${r.id}">
            <title>${tip}</title>
            <polygon class="r-frame" points="${ret.framePts}" />
            ${ret.brackets.map((b) => `<polyline class="r-bracket" points="${b}" />`).join('')}
            <circle class="r-core" cx="${x}" cy="${y}" r="${ret.coreR.toFixed(2)}" />
            <text class="relay-label online-label" x="${x}" y="${labelY}">${yLabel}</text>
          </g>
        `);
      } else {
        const total = r.ripensAt - r.plantedAt;
        const pct = total > 0 ? Math.min(1, Math.max(0, (now - r.plantedAt) / total)) : 0;
        const ringR = HEX_SIZE * 0.46;
        const ringC = 2 * Math.PI * ringR;
        const remain = Math.max(0, r.ripensAt - now);
        const tLabel = fmtMin(remain);
        const tip = `${TIER_LABEL[r.tier] || r.tier} · ${sector.label}\nRipens in ${tLabel}`;
        const ret = reticle(x, y, 1);
        relayNodes.push(`
          <g class="relay-mark ripening ${sel ? 'selected' : ''}" data-relay="${r.id}">
            <title>${tip}</title>
            <polygon class="r-frame" points="${ret.framePts}" />
            <circle class="ripe-base" cx="${x}" cy="${y}" r="${ringR}" />
            <circle class="ripe-fill" cx="${x}" cy="${y}" r="${ringR}"
              stroke-dasharray="${(ringC * pct).toFixed(2)} ${ringC.toFixed(2)}"
              transform="rotate(-90 ${x} ${y})" />
            <circle class="r-core" cx="${x}" cy="${y}" r="${ret.coreR.toFixed(2)}" />
            <text class="relay-label ripen-label" x="${x}" y="${labelY}">${tLabel}</text>
          </g>
        `);
      }
    }

    // Ghost reticle on the staged hex — same shape as a real relay frame but
    // dashed/pulsing so the player sees it's a preview.
    let ghostNode = '';
    if (pendingPlacement) {
      const ph = getHexAt(pendingPlacement.q, pendingPlacement.r);
      const alreadyOccupied = ph && relays.some((rr) => rr.hex.q === ph.q && rr.hex.r === ph.r);
      if (ph && !alreadyOccupied) {
        const { x, y } = hexCenterFromBounds(ph.q, ph.r, bounds);
        const ret = reticle(x, y, 1);
        ghostNode = `
          <g class="relay-mark pending">
            <polygon class="r-frame" points="${ret.framePts}" />
            ${ret.brackets.map((b) => `<polyline class="r-bracket" points="${b}" />`).join('')}
            <circle class="r-core" cx="${x}" cy="${y}" r="${ret.coreR.toFixed(2)}" />
          </g>
        `;
      }
    }

    return `
      <svg class="netmap-svg" viewBox="0 0 ${bounds.width.toFixed(0)} ${bounds.height.toFixed(0)}" preserveAspectRatio="xMidYMid meet">
        ${hexNodes.join('')}
        ${clusterEdges.join('')}
        ${relayNodes.join('')}
        ${ghostNode}
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
        ${queued.length > 0 ? `<div class="net-hint">Tap an empty hex to choose where to place the next token.</div>` : ''}
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

  // --- Mobile pan support -------------------------------------------------
  // The SVG is visually enlarged via a CSS transform inside the mobile media
  // query. We drive --map-tx / --map-ty on the (stable) .net-map element and
  // clamp to keep at least a fraction of the SVG inside the viewport.
  function visualSize(mapEl) {
    const svgEl = mapEl.querySelector('.netmap-svg');
    if (!svgEl) return null;
    // SVG elements don't implement offsetWidth/Height in every engine. The
    // bounding rect already reflects the active transform (scale + translate),
    // so it's exactly the visual size we want.
    const rect = svgEl.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    return { w: rect.width, h: rect.height };
  }
  function clampPan(mapEl) {
    const vs = visualSize(mapEl);
    if (!vs) return;
    const rect = mapEl.getBoundingClientRect();
    const minTx = Math.min(0, rect.width - vs.w);
    const minTy = Math.min(0, rect.height - vs.h);
    const maxTx = Math.max(0, rect.width - vs.w);
    const maxTy = Math.max(0, rect.height - vs.h);
    pan.tx = Math.max(minTx, Math.min(maxTx, pan.tx));
    pan.ty = Math.max(minTy, Math.min(maxTy, pan.ty));
  }
  function centerPan(mapEl) {
    const vs = visualSize(mapEl);
    if (!vs) return { tx: 0, ty: 0 };
    const rect = mapEl.getBoundingClientRect();
    return { tx: (rect.width - vs.w) / 2, ty: (rect.height - vs.h) / 2 };
  }
  function applyPan(mapEl) {
    mapEl.style.setProperty('--map-tx', `${pan.tx.toFixed(1)}px`);
    mapEl.style.setProperty('--map-ty', `${pan.ty.toFixed(1)}px`);
  }
  function attachPan(mapEl) {
    mapEl.addEventListener('pointerdown', (e) => {
      // Only enable pan for touch input. Desktop mouse keeps the existing
      // tap-only behaviour (the SVG fits the container on wide viewports).
      if (e.pointerType !== 'touch') return;
      // Pan only when the SVG actually overflows its container (i.e. mobile
      // cover-fit is in effect). Otherwise there's nothing to scroll.
      const vs = visualSize(mapEl);
      const rect = mapEl.getBoundingClientRect();
      if (!vs || (vs.w <= rect.width + 1 && vs.h <= rect.height + 1)) return;
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        baseTx: pan.tx, baseTy: pan.ty,
        active: false,
      };
    });
    mapEl.addEventListener('pointermove', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      // Defer commit until the gesture is clearly a pan — keeps tiny finger
      // jitters during a tap from sliding the map. 15px matches the tap
      // tolerance, so taps and pans don't both fire.
      if (!dragState.active && Math.hypot(dx, dy) < 15) return;
      dragState.active = true;
      pan.tx = dragState.baseTx + dx;
      pan.ty = dragState.baseTy + dy;
      clampPan(mapEl);
      applyPan(mapEl);
    });
    const end = (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      dragState = null;
    };
    mapEl.addEventListener('pointerup', end);
    mapEl.addEventListener('pointercancel', end);
  }
  // -----------------------------------------------------------------------

  function renderPlacementBar() {
    const net = state.network;
    if (!pendingPlacement || !net || net.queued.length === 0) return '';
    const ph = getHexAt(pendingPlacement.q, pendingPlacement.r);
    if (!ph) return '';
    if (net.relays.some((r) => r.hex.q === ph.q && r.hex.r === ph.r)) return '';
    const token = net.queued[0];
    const sector = SECTORS[ph.sector] || SECTORS.frontier;
    const tier = TIER_INFO[token.tier] || TIER_INFO.common;
    const projectedYield = (Number(token.baseYield) || 0) * sector.yieldMul;
    const ripenSec = tier.ripenSec * sector.ripenMul;
    return `
      <div class="net-place-bar" role="dialog" aria-label="Confirm placement">
        <div class="net-place-head">
          <span class="net-place-tier rar-${token.tier}">${TIER_LABEL[token.tier] || token.tier} relay</span>
          <span class="net-detail-sec sec-tag-${ph.sector}">${sector.label}</span>
        </div>
        <div class="net-place-stats">
          <span>+${formatAbbrev(projectedYield)}/s base</span>
          <span class="net-place-sep">·</span>
          <span>ripens in ${fmtMin(ripenSec)}</span>
        </div>
        <div class="net-place-hint">Tap another empty hex to move.</div>
        <div class="net-place-actions">
          <button class="net-place-btn cancel" type="button" data-act="cancel-placement">Cancel</button>
          <button class="net-place-btn confirm" type="button" data-act="confirm-placement">Place here</button>
        </div>
      </div>
    `;
  }

  function ensureSkeleton() {
    if (bodyEl.querySelector('.net-layout')) return;
    bodyEl.innerHTML = `
      <div class="net-layout">
        <div class="net-map"></div>
        <div class="net-side"></div>
      </div>
    `;
    const mapEl = bodyEl.querySelector('.net-map');
    if (mapEl) attachPan(mapEl);
  }

  function render() {
    if (!modalEl.classList.contains('open')) return;
    const now = nowSeconds();
    // Drop a stale selection if the relay was lost between renders.
    if (selectedRelayId && state.network && !state.network.relays.some((r) => r.id === selectedRelayId)) {
      selectedRelayId = null;
    }
    // Clear stale pending if the queue dried up.
    if (pendingPlacement && (!state.network || state.network.queued.length === 0)) {
      pendingPlacement = null;
    }
    const status = networkStatus(state, now);
    titleEl.textContent = status.online + status.ripening > 0
      ? `Network · ${status.online + status.ripening} relay${status.online + status.ripening === 1 ? '' : 's'}`
      : 'Network';
    ensureSkeleton();
    const mapEl = bodyEl.querySelector('.net-map');
    const sideEl = bodyEl.querySelector('.net-side');
    mapEl.innerHTML = renderHexSvg(now) + renderPlacementBar();
    sideEl.innerHTML = renderSidePanel(now);
    if (!pan.centered) {
      requestAnimationFrame(() => {
        const c = centerPan(mapEl);
        pan.tx = c.tx; pan.ty = c.ty;
        pan.centered = true;
        applyPan(mapEl);
      });
    } else {
      applyPan(mapEl);
    }
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
