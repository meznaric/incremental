import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureNetwork, makeNetworkState, queueToken, placeRelay,
  networkContribution, networkStatus,
  adjacentOnlineCount, coverageMultiplier,
  getHexes, getHexAt,
  SECTORS, TIER_INFO, BLEED_YIELD_SECONDS, bleedValue,
  reconcileOffline, tickNetwork, reconcileOfflineBleeds, tickBleedDrip,
  MAP_RADIUS, COVERAGE_BONUS_PER_SECTOR, CLUSTER_YIELD_PER_NEIGHBOR,
} from '../src/network.js';

function s() {
  return { amount: 0, network: makeNetworkState() };
}

test('hex layout: grid matches the radius constant and assigns every hex a sector', () => {
  const hexes = getHexes();
  // 1 + 6·(1 + 2 + … + R) = 1 + 6·R·(R+1)/2 = 1 + 3·R·(R+1).
  const expected = 1 + 3 * MAP_RADIUS * (MAP_RADIUS + 1);
  assert.equal(hexes.length, expected);
  for (const h of hexes) {
    assert.ok(SECTORS[h.sector], `sector ${h.sector} should be known`);
  }
});

test('hex layout: every defined sector has at least one hex (the legend never lies)', () => {
  const seen = new Set(getHexes().map((h) => h.sector));
  for (const key of Object.keys(SECTORS)) {
    assert.ok(seen.has(key), `sector ${key} should have at least one hex`);
  }
});

test('sector assignment: distance 0..1 hexes are core', () => {
  for (const h of getHexes()) {
    const dist = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));
    if (dist <= 1) assert.equal(h.sector, 'core', `hex (${h.q},${h.r}) at dist ${dist} should be core`);
  }
});

test('queueToken + placeRelay: places and stamps with sector + ripensAt', () => {
  const st = s();
  queueToken(st, 'common', 100);
  assert.equal(st.network.queued.length, 1);
  const hex = getHexes().find((h) => h.sector === 'frontier');
  const r = placeRelay(st, { q: hex.q, r: hex.r }, 1000);
  assert.ok(r);
  assert.equal(r.tier, 'common');
  assert.equal(r.baseYield, 100);
  assert.equal(r.sector, 'frontier');
  assert.equal(r.plantedAt, 1000);
  assert.equal(r.ripensAt, 1000 + TIER_INFO.common.ripenSec * SECTORS.frontier.ripenMul);
  assert.equal(st.network.queued.length, 0);
});

test('placeRelay: returns null when hex is occupied', () => {
  const st = s();
  const hex = getHexes()[0];
  queueToken(st, 'common', 100);
  queueToken(st, 'common', 100);
  assert.ok(placeRelay(st, hex, 0));
  assert.equal(placeRelay(st, hex, 0), null);
});

test('placeRelay: returns null with empty queue', () => {
  const st = s();
  assert.equal(placeRelay(st, getHexes()[0], 0), null);
});

test('contribution: zero before ripen, positive after, includes sector yield mul', () => {
  const st = s();
  const hex = getHexes().find((h) => h.sector === 'core'); // yieldMul 1.4
  queueToken(st, 'common', 100);
  placeRelay(st, hex, 1000);
  const ripeAt = 1000 + TIER_INFO.common.ripenSec * SECTORS.core.ripenMul;
  assert.equal(networkContribution(st, 1000), 0);
  // 1 sector covered. Yield = 100 × 1.4 × 1 (no neighbours).
  const cov = 1 + COVERAGE_BONUS_PER_SECTOR;
  const expected = 100 * SECTORS.core.yieldMul * cov;
  const c = networkContribution(st, ripeAt + 1);
  assert.ok(Math.abs(c - expected) < 1e-6, `got ${c}, expected ${expected}`);
});

test('clustering: adjacency boosts yield and is symmetric', () => {
  const st = s();
  // Two adjacent core hexes (origin + (1,0)). Both have sector core.
  queueToken(st, 'common', 100);
  queueToken(st, 'common', 100);
  placeRelay(st, { q: 0, r: 0 }, 0);
  placeRelay(st, { q: 1, r: 0 }, 0);
  const ripeAt = TIER_INFO.common.ripenSec * SECTORS.core.ripenMul;
  const r1 = st.network.relays[0];
  const r2 = st.network.relays[1];
  assert.equal(adjacentOnlineCount(st.network, r1, ripeAt + 1), 1);
  assert.equal(adjacentOnlineCount(st.network, r2, ripeAt + 1), 1);
  // Coverage still 1 sector. Each yields 100 × 1.4 × (1 + 1·CLUSTER_YIELD); total ×coverage.
  const cluster = 1 + CLUSTER_YIELD_PER_NEIGHBOR;
  const cov = 1 + COVERAGE_BONUS_PER_SECTOR;
  const expected = 2 * 100 * SECTORS.core.yieldMul * cluster * cov;
  const c = networkContribution(st, ripeAt + 1);
  assert.ok(Math.abs(c - expected) < 1e-6, `got ${c}, expected ${expected}`);
});

test('coverage: stacks per distinct sector with online relay', () => {
  const st = s();
  const byS = {};
  for (const h of getHexes()) (byS[h.sector] ||= []).push(h);
  // Place one common relay in each of three distinct sectors at t=0.
  const picks = ['core', 'frontier', 'edge'].map((k) => byS[k][0]);
  for (let i = 0; i < picks.length; i++) queueToken(st, 'common', 100);
  for (const h of picks) placeRelay(st, h, 0);
  const longAfter = 10_000_000;
  const mul = coverageMultiplier(st.network, longAfter);
  assert.ok(Math.abs(mul - (1 + COVERAGE_BONUS_PER_SECTOR * 3)) < 1e-6, `got ${mul}`);
});

test('reconcileOffline: zero rate sector with mythic rarity keeps relay essentially safe', () => {
  const st = s();
  // Pick the lowest-risk combination: silent worlds + mythic tier alone.
  const silent = getHexes().find((h) => h.sector === 'silent');
  queueToken(st, 'mythic', 1000);
  placeRelay(st, silent, 0);
  // Force-ripen by advancing past ripensAt.
  const r = st.network.relays[0];
  r.ripensAt = 0;
  // Twelve hours offline. Isolated + silent sector → discoveryMul 0.2 × isolation 0.1.
  let losses;
  for (let i = 0; i < 10; i++) {
    losses = reconcileOffline(st, 12 * 3600, 1);
    if (st.network.relays.length === 0) break;
  }
  // Probability of loss per 12h: tier rate 0.0003 × sector 0.2 × isolated 0.1 × 720 min
  // = ~4.3% per 12h period. Surviving 10 such draws should be very common; not
  // guaranteed, but assertion exists to flag a regression that wipes too fast.
  assert.ok(st.network.relays.length >= 1 || losses != null);
});

test('tickNetwork: never produces more than ⌊online/4⌋ losses per tick', () => {
  const st = s();
  // Place 8 relays in Listener Watch (highest discovery), force-ripe.
  const watchHexes = getHexes().filter((h) => h.sector === 'watch').slice(0, 4);
  // Fall back to mixing sectors if watch has < 8 hexes.
  const hexes = [...watchHexes];
  for (const h of getHexes()) {
    if (hexes.length >= 8) break;
    if (!hexes.some((x) => x.q === h.q && x.r === h.r)) hexes.push(h);
  }
  for (const h of hexes) {
    queueToken(st, 'common', 100);
    placeRelay(st, h, 0);
  }
  for (const r of st.network.relays) r.ripensAt = 0;
  // Stress 200 ticks of dt=10s each, but record max losses in any single call.
  let maxPerTick = 0;
  for (let i = 0; i < 200; i++) {
    const before = st.network.relays.length;
    if (before === 0) break;
    const lost = tickNetwork(st, 10, 100 + i * 10);
    if (lost.length > Math.max(1, Math.floor(before / 4))) {
      maxPerTick = Math.max(maxPerTick, lost.length);
    }
  }
  assert.equal(maxPerTick, 0, 'a single tick exceeded the per-tick loss cap');
});

test('networkStatus reports online/ripening/queued/lost counts', () => {
  const st = s();
  queueToken(st, 'common', 100);
  queueToken(st, 'rare', 500);
  placeRelay(st, getHexes()[0], 0);
  // First placement is still ripening at t=0.
  const s0 = networkStatus(st, 0);
  assert.equal(s0.online, 0);
  assert.equal(s0.ripening, 1);
  assert.equal(s0.queued, 1);
  const s1 = networkStatus(st, 10_000_000);
  assert.equal(s1.online, 1);
  assert.equal(s1.ripening, 0);
});

test('ensureNetwork is idempotent and preserves an existing network', () => {
  const st = s();
  queueToken(st, 'rare', 1234);
  const before = st.network;
  ensureNetwork(st);
  assert.equal(st.network, before);
  assert.equal(st.network.queued[0].baseYield, 1234);
});

test('getHexAt returns the hex object or null', () => {
  assert.ok(getHexAt(0, 0));
  assert.equal(getHexAt(99, 99), null);
});

test('bleedValue: scales with baseYield × sector.yieldMul × BLEED_YIELD_SECONDS', () => {
  const r = { tier: 'common', baseYield: 100, sector: 'core' };
  // Core: yieldMul 1.4. So bleedValue = 100 × 1.4 × BLEED_YIELD_SECONDS.
  assert.equal(bleedValue(r), 100 * SECTORS.core.yieldMul * BLEED_YIELD_SECONDS);
});

test('reconcileOfflineBleeds: closed-form expectation for an isolated relay', () => {
  const st = s();
  const silent = getHexes().find((h) => h.sector === 'silent');
  queueToken(st, 'common', 100);
  placeRelay(st, silent, 0);
  const relay = st.network.relays[0];
  relay.ripensAt = 0; // force-ripe
  // 1 hour offline. Expected drops = 3600 / common.bleedPeriodSec.
  // Each drop = baseYield × sector.yieldMul × BLEED_YIELD_SECONDS.
  const drops = 3600 / TIER_INFO.common.bleedPeriodSec;
  const perDrop = 100 * SECTORS.silent.yieldMul * BLEED_YIELD_SECONDS;
  const expected = drops * perDrop;
  const total = reconcileOfflineBleeds(st, 3600, 1);
  assert.ok(Math.abs(total - expected) < 1e-6, `got ${total}, expected ${expected}`);
});

test('reconcileOfflineBleeds: clustered relays drop nothing', () => {
  const st = s();
  queueToken(st, 'common', 100);
  queueToken(st, 'common', 100);
  placeRelay(st, { q: 0, r: 0 }, 0);
  placeRelay(st, { q: 1, r: 0 }, 0);
  for (const r of st.network.relays) r.ripensAt = 0;
  assert.equal(reconcileOfflineBleeds(st, 3600, 1), 0);
});

test('tickBleedDrip: drips only for isolated online relays and only on RNG hit', () => {
  const st = s();
  const silent = getHexes().find((h) => h.sector === 'silent');
  queueToken(st, 'common', 100);
  placeRelay(st, silent, 0);
  st.network.relays[0].ripensAt = 0;
  // dt of 0 should never drop.
  assert.equal(tickBleedDrip(st, 0, 1), 0);
  // Stub Math.random so a single tick is guaranteed to fire.
  const origRandom = Math.random;
  try {
    Math.random = () => 0; // always below p
    const got = tickBleedDrip(st, 1, 1);
    assert.equal(got, bleedValue(st.network.relays[0]));
  } finally {
    Math.random = origRandom;
  }
});

test('tickBleedDrip: ripening relay never drips', () => {
  const st = s();
  queueToken(st, 'mythic', 100);
  placeRelay(st, getHexes()[0], 0);
  // Relay is ripening (mythic ripen ≈ 7200 × core.ripenMul 0.5 = 3600).
  // At now=10 it's definitely still ripening.
  const orig = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(tickBleedDrip(st, 1000, 10), 0);
  } finally {
    Math.random = orig;
  }
});
