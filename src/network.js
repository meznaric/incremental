// Seed Relay network. A fixed hex grid of galactic sectors. Yellow shop slots
// don't credit flatBonus directly anymore — they push a placement token; the
// player drops it onto a hex in the network UI. Each placed relay ripens,
// then contributes yield until ComDef finds it.
//
// Mechanics:
//   A) clustering — dense = higher yield AND higher discovery
//   E) sparse-only — isolated relays (no adjacent online) get a discovery shield
//   B) coverage — global multiplier per distinct sector with ≥1 online relay
// See docs/lore/world-rules.md for the in-fiction grammar.

export const MAP_RADIUS = 5;  // 91 hexes — roughly 2.5× the MVP grid; gives sparse builds room to spread.
// Coverage and cluster pay hard so late-cycle mesh can plausibly overtake the
// additive base on its own — six-sector coverage ≈ ×2.2, three-neighbour
// dense ≈ ×2.5. The risk side (discovery) already scales with cluster, so
// dense play stays a real trade.
export const COVERAGE_BONUS_PER_SECTOR = 0.20;
export const CLUSTER_YIELD_PER_NEIGHBOR = 0.5;
export const CLUSTER_DISCOVERY_PER_NEIGHBOR = 0.5;
export const ISOLATED_DISCOVERY_FACTOR = 0.1;
// An isolated relay drops an Echo Bleed periodically — the sparse-only payoff
// that gives spread-out builds a positive identity, not just a lower risk
// profile. Bleed amount = baseYield × sector.yieldMul × this many seconds.
// Tuned high enough that a single isolated mythic in a quiet sector pays
// meaningfully on its own — bleed lands raw, bypassing the multiplier stack,
// so it has to be generous in raw seconds to compete with multiplied rate.
export const BLEED_YIELD_SECONDS = 150;

// Six sectors. yieldMul scales placed-relay yield; discoveryMul scales the
// per-minute discovery roll; ripenMul stretches/shrinks the tier's ripen time.
// Colours are saturated neons — the map reads as a synth-grade comms console,
// not a topo map. Each sector has identity at low fill + glowing stroke.
export const SECTORS = {
  core:     { label: 'Union Core',     color: '#2dd4ff', yieldMul: 1.4, discoveryMul: 5.0, ripenMul: 0.5 },
  frontier: { label: 'Union Frontier', color: '#4ade80', yieldMul: 1.0, discoveryMul: 1.0, ripenMul: 1.0 },
  edge:     { label: 'Quiet Edge',     color: '#fbbf24', yieldMul: 1.0, discoveryMul: 0.7, ripenMul: 1.0 },
  silent:   { label: 'Silent Worlds',  color: '#c084fc', yieldMul: 0.7, discoveryMul: 0.2, ripenMul: 2.0 },
  watch:    { label: 'Listener Watch', color: '#f43f5e', yieldMul: 2.0, discoveryMul: 4.0, ripenMul: 0.8 },
  dark:     { label: 'Pre-Union Dark', color: '#818cf8', yieldMul: 1.0, discoveryMul: 0.3, ripenMul: 2.5 },
};

// Tier descriptors map convert-upgrade rarity → ripen time, discovery rate,
// and the Bleed-drip period for isolated relays. Yield is dynamic
// (cost × ratio at buy time), captured on the token.
export const TIER_INFO = {
  common:    { ripenSec: 1200, discoveryPerMin: 0.0038, bleedPeriodSec: 1200 },
  uncommon:  { ripenSec: 1800, discoveryPerMin: 0.0023, bleedPeriodSec:  900 },
  rare:      { ripenSec: 3000, discoveryPerMin: 0.0014, bleedPeriodSec:  600 },
  legendary: { ripenSec: 4800, discoveryPerMin: 0.0007, bleedPeriodSec:  400 },
  mythic:    { ripenSec: 7200, discoveryPerMin: 0.0003, bleedPeriodSec:  240 },
};

// Axial hex helpers (pointy-top). q,r are axial coordinates; s = -q-r implicit.
function hexDistance(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r, ds = -dq - dr;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

// Center of a hex in pixel space, given hex "size" (corner radius).
export function hexCenter(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

// Six corner points of a pointy-top hex. Used by the SVG renderer.
export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts;
}

// All hexes within the map radius, deterministic and cheap. Sector is assigned
// by position: dist 0-1 is Core; the outer two rings split into 5 angular
// wedges (frontier, watch, silent, edge, dark). Same layout every boot, so
// relays placed in a prior session resolve to the same sector on reload.
let _hexes = null;
export function getHexes() {
  if (_hexes) return _hexes;
  const out = [];
  for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
    const rMin = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
    const rMax = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
    for (let r = rMin; r <= rMax; r++) {
      out.push({ q, r, sector: sectorForHex(q, r) });
    }
  }
  _hexes = out;
  return out;
}

const OUTER_SECTORS = ['frontier', 'watch', 'silent', 'edge', 'dark'];
function sectorForHex(q, r) {
  const dist = hexDistance({ q, r }, { q: 0, r: 0 });
  if (dist <= 1) return 'core';
  // Pixel-space angle from center; pointy-top mapping.
  const { x, y } = hexCenter(q, r, 1);
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;
  const idx = Math.floor(angle / (2 * Math.PI / OUTER_SECTORS.length));
  return OUTER_SECTORS[Math.min(idx, OUTER_SECTORS.length - 1)];
}

export function getHexAt(q, r) {
  return getHexes().find((h) => h.q === q && h.r === r) || null;
}

export function ensureNetwork(state) {
  if (!state.network) state.network = makeNetworkState();
  return state.network;
}

export function makeNetworkState() {
  return {
    relays: [],
    queued: [],
    lostCount: 0,
    // Recent loss events for HUD toasts. Drained by main.js each tick.
    recentLosses: [],
  };
}

let _idCounter = 0;
function newRelayId(now) {
  _idCounter = (_idCounter + 1) % 1000;
  return `r_${Math.floor(now * 1000)}_${_idCounter}`;
}

function relayStatus(r, now) {
  return now >= r.ripensAt ? 'online' : 'ripening';
}

function isOnline(r, now) { return now >= r.ripensAt; }

// Adjacency: hex-distance 1 to an *online* peer. Ripening relays don't yet
// count for clustering bonuses or discovery cascades — the network has to
// actually be carrying signal.
function adjacentOnlineCount(network, relay, now) {
  let n = 0;
  for (const r of network.relays) {
    if (r.id === relay.id) continue;
    if (!isOnline(r, now)) continue;
    if (hexDistance(relay.hex, r.hex) === 1) n++;
  }
  return n;
}

// What a single online relay contributes before coverage and pre-permMul.
// baseYield × sector.yieldMul × (1 + adjacent × CLUSTER_YIELD_PER_NEIGHBOR).
export function relayYield(network, relay, now) {
  if (!isOnline(relay, now)) return 0;
  const sector = SECTORS[relay.sector] || SECTORS.frontier;
  const adj = adjacentOnlineCount(network, relay, now);
  const cluster = 1 + adj * CLUSTER_YIELD_PER_NEIGHBOR;
  return (relay.baseYield || 0) * sector.yieldMul * cluster;
}

export function coverageMultiplier(network, now) {
  const sectors = new Set();
  for (const r of network.relays) {
    if (isOnline(r, now)) sectors.add(r.sector);
  }
  return 1 + COVERAGE_BONUS_PER_SECTOR * sectors.size;
}

// Total network contribution to flatBonus-equivalent (pre-permMul). Sums each
// online relay's yield, then applies the coverage multiplier across the lot.
export function networkContribution(state, now) {
  const network = state.network;
  if (!network || !network.relays.length) return 0;
  let sum = 0;
  for (const r of network.relays) {
    if (!isOnline(r, now)) continue;
    sum += relayYield(network, r, now);
  }
  if (sum <= 0) return 0;
  return sum * coverageMultiplier(network, now);
}

// Per-minute discovery rate for one online relay. Considers sector, clustering
// risk, isolation shield. Ripening relays are not findable.
export function discoveryRatePerMin(network, relay, now) {
  if (!isOnline(relay, now)) return 0;
  const tier = TIER_INFO[relay.tier] || TIER_INFO.common;
  const sector = SECTORS[relay.sector] || SECTORS.frontier;
  const adj = adjacentOnlineCount(network, relay, now);
  const densityMul = adj === 0
    ? ISOLATED_DISCOVERY_FACTOR
    : 1 + adj * CLUSTER_DISCOVERY_PER_NEIGHBOR;
  return tier.discoveryPerMin * sector.discoveryMul * densityMul;
}

// Place the next queued token onto an empty hex. Returns the placed relay or
// null if the hex is taken / no token / no such hex.
export function placeRelay(state, hex, now) {
  const network = ensureNetwork(state);
  if (!network.queued.length) return null;
  if (!getHexAt(hex.q, hex.r)) return null;
  if (network.relays.some((r) => r.hex.q === hex.q && r.hex.r === hex.r)) return null;
  const token = network.queued.shift();
  const sector = sectorForHex(hex.q, hex.r);
  const tier = TIER_INFO[token.tier] || TIER_INFO.common;
  const sectorDef = SECTORS[sector] || SECTORS.frontier;
  const ripenSec = tier.ripenSec * sectorDef.ripenMul;
  const relay = {
    id: newRelayId(now),
    tier: token.tier,
    baseYield: Number(token.baseYield) || 0,
    hex: { q: hex.q, r: hex.r },
    sector,
    plantedAt: now,
    ripensAt: now + ripenSec,
  };
  network.relays.push(relay);
  return relay;
}

// Queue a placement token. Called by shop tryBuy when a convert is purchased.
export function queueToken(state, tier, baseYield) {
  const network = ensureNetwork(state);
  network.queued.push({ tier, baseYield: Math.max(0, Number(baseYield) || 0) });
}

// What a single Bleed drop is worth, in raw Echoes (no permMul, no coverage).
// Scales with the relay's frozen baseYield and the sector it landed in, so a
// rich placement keeps bleeding richer drips even as the rest of production
// climbs around it.
export function bleedValue(relay) {
  const sec = SECTORS[relay.sector] || SECTORS.frontier;
  return (relay.baseYield || 0) * sec.yieldMul * BLEED_YIELD_SECONDS;
}

// Per-tick Bleed drip — only isolated online relays drop. Probabilistic per
// tick; on average each relay drops once per its tier's bleedPeriodSec. The
// caller credits the returned Echoes to state.amount.
export function tickBleedDrip(state, dt, now) {
  const network = state.network;
  if (!network || !network.relays.length || dt <= 0) return 0;
  let total = 0;
  for (const r of network.relays) {
    if (!isOnline(r, now)) continue;
    if (adjacentOnlineCount(network, r, now) > 0) continue;
    const tier = TIER_INFO[r.tier] || TIER_INFO.common;
    if (!(tier.bleedPeriodSec > 0)) continue;
    const p = dt / tier.bleedPeriodSec;
    if (Math.random() < p) total += bleedValue(r);
  }
  return total;
}

// Offline Bleed reconciliation. Foreground uses probabilistic rolls; offline
// integrates the expected value directly — over a long window the law of
// large numbers makes the expectation the right thing to credit.
export function reconcileOfflineBleeds(state, offlineSeconds, now) {
  const network = state.network;
  if (!network || !network.relays.length || offlineSeconds <= 0) return 0;
  let total = 0;
  for (const r of network.relays) {
    if (!isOnline(r, now)) continue;
    if (adjacentOnlineCount(network, r, now) > 0) continue;
    const tier = TIER_INFO[r.tier] || TIER_INFO.common;
    if (!(tier.bleedPeriodSec > 0)) continue;
    total += bleedValue(r) * (offlineSeconds / tier.bleedPeriodSec);
  }
  return total;
}

// Per-tick discovery pass. dt is wall-clock seconds since the previous tick.
// Returns the array of relays lost on this tick (for HUD toasts). Discovery
// is rolled independently per online relay; the cap below limits a single
// pass to ⌊owned/4⌋ losses so a bad RNG burst can't wipe the mesh.
export function tickNetwork(state, dt, now) {
  const network = state.network;
  if (!network || !network.relays.length || dt <= 0) return [];
  const online = network.relays.filter((r) => isOnline(r, now));
  if (!online.length) return [];
  const lossCap = Math.max(1, Math.floor(online.length / 4));
  const dtMin = dt / 60;
  const lost = [];
  for (const r of online) {
    if (lost.length >= lossCap) break;
    const rate = discoveryRatePerMin(network, r, now);
    if (rate <= 0) continue;
    const p = 1 - Math.exp(-rate * dtMin);
    if (Math.random() < p) lost.push(r);
  }
  if (lost.length) removeRelays(network, lost);
  return lost;
}

function removeRelays(network, relays) {
  const ids = new Set(relays.map((r) => r.id));
  network.relays = network.relays.filter((r) => !ids.has(r.id));
  network.lostCount = (network.lostCount || 0) + relays.length;
  network.recentLosses = (network.recentLosses || []).concat(relays.map((r) => ({
    tier: r.tier, sector: r.sector, at: r.plantedAt,
  })));
  if (network.recentLosses.length > 12) {
    network.recentLosses.splice(0, network.recentLosses.length - 12);
  }
}

// Offline reconciliation: collapse the discovery integral over the elapsed
// window into a single Bernoulli trial per online relay. Uses the *current*
// adjacency snapshot — accurate enough for MVP; a relay that loses neighbors
// mid-window is treated as if it had them the whole time, which slightly
// over-states risk. Same loss cap as the live tick.
export function reconcileOffline(state, offlineSeconds, now) {
  const network = state.network;
  if (!network || offlineSeconds <= 0) return [];
  // Force-ripen anything that finished while away — needed before we count
  // who's "online" for the discovery pass.
  const online = network.relays.filter((r) => isOnline(r, now));
  if (!online.length) return [];
  const lossCap = Math.max(1, Math.floor(online.length / 4));
  const offlineMin = offlineSeconds / 60;
  const lost = [];
  for (const r of online) {
    if (lost.length >= lossCap) break;
    const rate = discoveryRatePerMin(network, r, now);
    if (rate <= 0) continue;
    const p = 1 - Math.exp(-rate * offlineMin);
    if (Math.random() < p) lost.push(r);
  }
  if (lost.length) removeRelays(network, lost);
  return lost;
}

// HUD summary numbers. Cheap; cache-on-render is the caller's job.
export function networkStatus(state, now) {
  const network = state.network;
  if (!network) return { online: 0, ripening: 0, queued: 0, lost: 0 };
  let online = 0, ripening = 0;
  for (const r of network.relays) {
    if (isOnline(r, now)) online++;
    else ripening++;
  }
  return {
    online,
    ripening,
    queued: network.queued.length,
    lost: network.lostCount || 0,
  };
}

export { hexDistance, relayStatus, adjacentOnlineCount };
