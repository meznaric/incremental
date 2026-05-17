import { formatAbbrev } from './bignum.js';
import { UPGRADES } from './upgrades-data.js';
// Re-export so existing call sites (tests, shop.js) keep importing from upgrades.js.
export { UPGRADES };

const RARITY_WEIGHTS = { common: 50, uncommon: 22, rare: 8, legendary: 1, mythic: 0.1 };
// Per-kind multiplier on top of rarity weight. Gambles are noisy and crowd out
// other kinds when they share weight equally — drop them to 25% so non-gamble
// kinds dominate any-kind slots. The fixed gamble slot (idx 1) is unaffected
// since its pool is entirely gambles and relative weights cancel.
export const KIND_WEIGHT = { gamble: 0.25 };

const BY_ID = new Map(UPGRADES.filter((u) => u.id).map((u) => [u.id, u]));
export const getUpgrade = (id) => BY_ID.get(id);
// Slots may carry a `dyn` payload for dynamically generated upgrades whose
// id isn't in the static table. Prefer it over the registry.
export const resolveUpgrade = (slot) => slot && (slot.dyn || BY_ID.get(slot.id)) || null;

// Convert slots are gated to mid-game. Below this rate, the Network is
// thematically and mechanically inert — there's nothing meaningful to seed,
// and the placement loop crowds the early shop. The chip stays hidden until
// the first token is queued, which can only happen after the gate opens.
export const CONVERT_MIN_RATE = 1000;

// Per-slot type pin. Slots 0..4 are typed; slot 1's *first* roll is seeded to
// a cheap common mul by main.js, but the filter stays permissive so rerolls/buys
// land on any rarity mul. Anything past idx 4 accepts any upgrade kind.
//   0: base-rate additive permanent (generated tier)
//   1: multiplicative permanent (any rarity)
//   2: non-gamble buff (rateMul / compound)
//   3: gamble
//   4: gamble buff (gambleLuck / gambleCushion)
export const SLOT_FILTERS = [
  (u) => u.kind === 'permanent' && (u._dyn === 'add' || u.permType === 'add'),
  (u) => u.kind === 'permanent' && u.permType === 'mul',
  (u) => u.kind === 'buff' && (u.buffType === 'rateMul' || u.buffType === 'compound'),
  (u) => u.kind === 'gamble',
  (u) => u.kind === 'buff' && (u.buffType === 'gambleLuck' || u.buffType === 'gambleCushion'),
];

// Per-kind theming used by the shop UI. Labels follow lore archetypes
// (Relay/Decode, Window, Seed Relay, Hail, Bleed, Drift) — see docs/lore/game-mapping.md.
// `permLabel` is the alt label used when a permanent's permType is 'mul'.
export const KIND_THEME = {
  permanent: { icon: 'ri-radar-line',         color: '#4cd07d', label: 'Relay', permLabel: 'Decode' },
  buff:      { icon: 'ri-flashlight-fill',    color: '#9d6ee0', label: 'Window' },
  convert:   { icon: 'ri-exchange-funds-fill',color: '#f5d34a', label: 'Seed Relay' },
  gamble:    { icon: 'ri-broadcast-line',     color: '#ff5a6e', label: 'Hail' },
  gift:      { icon: 'ri-gift-fill',          color: '#ffb84a', label: 'Bleed' },
  drift:     { icon: 'ri-moon-line',          color: '#5fc0e8', label: 'Drift' },
};

export function kindLabel(u) {
  const t = KIND_THEME[u.kind];
  if (!t) return u.kind;
  if (u.kind === 'permanent' && u.permType === 'mul' && t.permLabel) return t.permLabel;
  return t.label;
}

export function isEligible(u, ctx) {
  const r = ctx?.rate || 0;
  if (u._dyn) return true; // virtual generators are always eligible
  if (u.kind === 'convert' && r <= CONVERT_MIN_RATE) return false;
  if (u.minRate != null && r < u.minRate) return false;
  // maxRate is *not* a hard filter for mul perms — it acts as a cost-mode
  // transition in costFor instead, so cheap commons stay in the pool past
  // their original rate band rather than vanishing once production climbs.
  if (u.maxRate != null && u.permType !== 'mul' && r >= u.maxRate) return false;
  return true;
}

export function slotMatches(u, slotIdx) {
  const f = SLOT_FILTERS[slotIdx];
  if (!f) return true; // slots past the pinned set accept any kind
  return f(u);
}

// Long-group buffs (week-scale, modest mult) roll 2× as often as burst-group
// (minute-scale, strong mult) at the same rarity. Untagged entries default to 1.
export const BUFF_GROUP_WEIGHT = { long: 2, burst: 1 };

function weightedPick(pool) {
  const weights = pool.map((u) => (
    (RARITY_WEIGHTS[u.rarity] || 1)
      * (KIND_WEIGHT[u.kind] ?? 1)
      * (u.group ? (BUFF_GROUP_WEIGHT[u.group] ?? 1) : 1)
  ));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Round to a 1/2/5 mantissa so generated tiers read like the old hand-tuned
// ones (+5/s, +200/s, +1B/s) instead of +6.3471e7/s.
function niceRound(x) {
  if (!isFinite(x) || x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const m = x / Math.pow(10, exp);
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

// Relay-node tier names by rarity. Common is a hand-soldered antenna; mythic
// is the same hardware class the Listening Service uses (possibly stolen).
const RELAY_TIER = {
  common:    'Field Antenna',
  uncommon:  'Yagi Array',
  rare:      'Phased Dish',
  legendary: 'Deep-Sky Listener',
  mythic:    'Quiet Relay',
};

// Dynamic additive permanent. Scaling is in terms of *base additive* (the raw
// per-second number before any multiplier) so the listed +X really is a +X%
// step on the additive base — once the player's multipliers re-apply, the
// effective gain matches the rarity's percentage, instead of being amplified
// by permMul a second time.
//
// ADD_VALUE_MULT[rarity] is the target *effective* fraction of current rate
// this tier adds when fresh. A log decay on top makes late-game tiers feel
// progressively smaller: each decade of additive base shaves the percentage.
export const ADD_VALUE_MULT = { common: 0.1, uncommon: 0.4, rare: 1.5, legendary: 6, mythic: 25 };
// At base=10 (game start) decay is 1. Each decade above adds 0.25 to the
// denominator: base=100 → 0.8×, base=1e4 → 0.57×, base=1e8 → 0.36×, base=1e12 → 0.27×.
// The applyDampening pass in shop.js carries most of the late-game flattening;
// this decay just keeps the *raw* additive number from looking absurd.
function addValueDecay(base) {
  const decades = Math.max(0, Math.log10(Math.max(base, 1)) - 1);
  return 1 / (1 + 0.25 * decades);
}
export function genBaseAdd(rarity, ctx) {
  const base = Math.max(ctx?.baseAdditive || 0, 1);
  const permMul = Math.max(ctx?.permMul || 1, 1);
  const rarityMul = (ADD_VALUE_MULT[rarity] || 0.1) * addValueDecay(base);
  const value = Math.max(1, niceRound(base * rarityMul));
  // Cost scales with the *effective* gain (value × permMul), not the raw value.
  // Without this the shop would offer huge effective rate jumps for trivial
  // costs once permMul stacks: the value-vs-cost ratio must stay honest in
  // effective-rate space.
  const effGain = value * permMul;
  const L = Math.log10(Math.max(effGain, 10));
  const cost = Math.max(10, effGain * (40 + L * 30) * Math.pow(1.5, L));
  const label = formatAbbrev(value);
  const tier = RELAY_TIER[rarity] || 'Field Antenna';
  return {
    upgrade: {
      id: `dyn_add_${rarity}_${value}`,
      kind: 'permanent',
      rarity,
      permType: 'add',
      name: `${tier} +${label}`,
      desc: `Patch a new relay into the array. +${label} base · multipliers re-apply on top.`,
      value,
    },
    cost,
  };
}

// Bleed tier names — accidental, unsolicited Echoes arriving from the dark.
const BLEED_TIER = {
  common:    'Echo Bleed',
  uncommon:  'Signal Bleed',
  rare:      'Carrier Bleed',
  legendary: 'Subspace Bleed',
  mythic:    'Relay Bleed',
};

// Dynamic gift. Reward is a fixed multiple of current rate by rarity: small
// for common/uncommon/rare, much bigger for legendary. Cost is always 0.
export const GIFT_SECONDS = { common: 30, uncommon: 90, rare: 240, legendary: 1800, mythic: 10800 };
export function genGift(rarity, ctx) {
  const r = Math.max(ctx?.rate || 0, 1);
  const reward = niceRound(r * (GIFT_SECONDS[rarity] || 30));
  const label = formatAbbrev(reward);
  const tier = BLEED_TIER[rarity] || 'Echo Bleed';
  return {
    upgrade: {
      id: `dyn_gift_${rarity}_${reward}`,
      kind: 'gift',
      rarity,
      name: `${tier} +${label}`,
      desc: `Something arrived without being asked. +${label} Echoes.`,
      reward,
    },
    cost: 0,
  };
}

// Materialize a virtual generator into a concrete upgrade + cost.
function materialize(u, ctx) {
  if (u._dyn === 'add') return genBaseAdd(u.rarity, ctx);
  if (u._dyn === 'gift') return genGift(u.rarity, ctx);
  return { upgrade: u, cost: costFor(u, ctx) };
}

// Each slot freezes its cost at the moment it was offered, so the number on
// the card doesn't drift as the player's balance / rate change. For dynamic
// upgrades the full definition rides along on the slot under `dyn`.
export function buildSlot(u, ctx) {
  const m = materialize(u, ctx);
  const slot = { id: m.upgrade.id, cost: m.cost };
  if (u._dyn) slot.dyn = m.upgrade;
  return slot;
}

export function rollSlate(n, ctx) {
  const slate = [];
  const takenKinds = new Set(); // dynamic entries share no id, so de-dupe by (kind, _dyn)
  const takenIds = new Set();
  for (let i = 0; i < n; i++) {
    const pool = UPGRADES.filter((u) => {
      if (u._dyn && takenKinds.has(`${u.kind}:${u._dyn}`)) return false;
      if (u.id && takenIds.has(u.id)) return false;
      return slotMatches(u, i) && isEligible(u, ctx);
    });
    if (!pool.length) { slate.push(null); continue; }
    const pick = weightedPick(pool);
    slate.push(buildSlot(pick, ctx));
    if (pick._dyn) takenKinds.add(`${pick.kind}:${pick._dyn}`);
    if (pick.id) takenIds.add(pick.id);
  }
  return slate;
}

export function rerollSlot(slate, idx, ctx) {
  const excludeIds = new Set();
  const excludeDyn = new Set();
  for (let i = 0; i < slate.length; i++) {
    if (i === idx) continue;
    const s = slate[i];
    if (!s) continue;
    if (s.dyn) excludeDyn.add(`${s.dyn.kind}:${s.dyn.kind === 'gift' ? 'gift' : 'add'}`);
    else if (s.id) excludeIds.add(s.id);
  }
  const pool = UPGRADES.filter((u) => {
    if (u._dyn && excludeDyn.has(`${u.kind}:${u._dyn}`)) return false;
    if (u.id && excludeIds.has(u.id)) return false;
    return slotMatches(u, idx) && isEligible(u, ctx);
  });
  if (!pool.length) return slate[idx];
  return buildSlot(weightedPick(pool), ctx);
}

// Category-wide ramp on mul permanents: every mul ever bought (across any id)
// makes the next one cost more. Stops "+5% Multiplier" from staying trivial
// after stacking dozens of them.
export const MUL_CATEGORY_GROWTH = 1.35;
export function totalMulOwned(owned) {
  let n = 0;
  for (const id of Object.keys(owned || {})) {
    const u = BY_ID.get(id);
    if (u && u.permType === 'mul') n += owned[id] || 0;
  }
  return n;
}

// Convert cap: caps a single convert's *yield* (and matching spend) so its
// raw baseYield never exceeds CAP × baseAdditive. Once sector × cluster ×
// coverage land on top, a well-placed legendary can roughly match its raw
// cap × ~4, so the late-cycle network can plausibly overtake base rate when
// you stack several alive across spread sectors.
export const CONVERT_BOOST_CAP = { common: 0.04, uncommon: 0.15, rare: 0.45, legendary: 1.3 };

// Mul perm cost past its original maxRate band: switch from the static
// baseCost ladder to a rate-aware floor matching the dyn-add pricing curve.
// Keeps cheap commons in the pool but priced honestly at high production.
function mulRateAwareCost(upgrade, rate) {
  const effGain = rate * Math.max(upgrade.value - 1, 0);
  if (!(effGain > 0)) return 0;
  const L = Math.log10(Math.max(effGain, 10));
  return effGain * (40 + L * 30) * Math.pow(1.5, L);
}

// Permanent cost: super-exponential in own count (growth^(n+n²/25)) so the Nth
// purchase costs visibly more than the (N-1)th. Mul permanents additionally
// pay a stacked-exponential category ramp 1.35^(N+N²/40) over total muls owned
// — the wall steepens late, the cycle close is meant to break through.
export function costFor(upgrade, ctx) {
  switch (upgrade.kind) {
    case 'gamble':    return ctx.balance * upgrade.wagerPct;
    case 'buff':      return Math.max(1, ctx.rate * upgrade.costSec);
    case 'drift': {
      // Drifts follow the permanent baseCost/growth ladder but skip the
      // mul-category ramp — they live in their own bucket and pay on per-id
      // own-count only. Keeps early picks cheap so the line of progression is
      // legible: buy one, see the offline mul move on the next welcomeBack.
      const n = ctx.owned[upgrade.id] || 0;
      return upgrade.baseCost * Math.pow(upgrade.growth, n + (n * n) / 25);
    }
    case 'permanent': {
      const n = ctx.owned[upgrade.id] || 0;
      let c = upgrade.baseCost * Math.pow(upgrade.growth, n + (n * n) / 25);
      if (upgrade.permType === 'mul') {
        const rate = Math.max(ctx.rate || 0, 0);
        if (upgrade.maxRate != null && rate > upgrade.maxRate) {
          c = Math.max(c, mulRateAwareCost(upgrade, rate));
        }
        const N = totalMulOwned(ctx.owned);
        c *= Math.pow(MUL_CATEGORY_GROWTH, N + (N * N) / 40);
      }
      return c;
    }
    case 'convert': {
      const balanceSpend = ctx.balance * upgrade.pctCost;
      const baseAdd = Math.max(ctx.baseAdditive || 1, 1);
      const cap = (CONVERT_BOOST_CAP[upgrade.rarity] ?? 0.1) * baseAdd
        / Math.max(upgrade.ratio, 1e-12);
      return Math.min(balanceSpend, cap);
    }
  }
  return 0;
}
