import { formatAbbrev } from './bignum.js';

const RARITY_WEIGHTS = { common: 50, uncommon: 22, rare: 8, legendary: 2 };
// Per-kind multiplier on top of rarity weight. Gambles are noisy and crowd out
// other kinds when they share weight equally — drop them to 25% so non-gamble
// kinds dominate any-kind slots. The fixed gamble slot (idx 1) is unaffected
// since its pool is entirely gambles and relative weights cancel.
export const KIND_WEIGHT = { gamble: 0.25 };

export const UPGRADES = [
  { id: 'red_black',  kind: 'gamble', rarity: 'common',
    name: 'Red / Black',     desc: 'Wager 50% — 2× on 48.6%',
    wagerPct: 0.5,  payout: 2,    chance: 18 / 37, cooldown: 5 },
  { id: 'dice',       kind: 'gamble', rarity: 'common',
    name: 'Dice',            desc: 'Wager 20% — 5× on 1/6',
    wagerPct: 0.2,  payout: 5,    chance: 1 / 6,   cooldown: 6 },
  { id: 'coin_flip',  kind: 'gamble', rarity: 'common',
    name: 'Coin Flip',       desc: 'Wager 25% — 1.95× on 50%',
    wagerPct: 0.25, payout: 1.95, chance: 0.5,     cooldown: 4 },
  { id: 'high_card',  kind: 'gamble', rarity: 'common',
    name: 'High Card',       desc: 'Wager 15% — 2.4× on 40%',
    wagerPct: 0.15, payout: 2.4,  chance: 0.4,     cooldown: 5 },
  { id: 'wheel',      kind: 'gamble', rarity: 'common',
    name: 'Wheel of Fortune', desc: 'Wager 10% — 9× on 1/10',
    wagerPct: 0.1,  payout: 9,    chance: 0.1,     cooldown: 6 },
  { id: 'blackjack',  kind: 'gamble', rarity: 'uncommon',
    name: 'Blackjack',       desc: 'Wager 30% — 1.95× on 49%',
    wagerPct: 0.3,  payout: 1.95, chance: 0.49,    cooldown: 8 },
  { id: 'single',     kind: 'gamble', rarity: 'uncommon',
    name: 'Single Number',   desc: 'Wager 10% — 36× on 1/37',
    wagerPct: 0.1,  payout: 36,   chance: 1 / 37,  cooldown: 10 },
  { id: 'double_or_nothing', kind: 'gamble', rarity: 'uncommon',
    name: 'Double or Nothing', desc: 'Wager 50% — 1.95× on 50%',
    wagerPct: 0.5,  payout: 1.95, chance: 0.5,     cooldown: 6 },
  { id: 'pair_dice',  kind: 'gamble', rarity: 'uncommon',
    name: 'Pair of Dice',    desc: 'Wager 25% — 8× on 1/9',
    wagerPct: 0.25, payout: 8,    chance: 1 / 9,   cooldown: 7 },
  { id: 'poker_hand', kind: 'gamble', rarity: 'uncommon',
    name: 'Poker Hand',      desc: 'Wager 40% — 2.4× on 40%',
    wagerPct: 0.4,  payout: 2.4,  chance: 0.4,     cooldown: 12 },
  { id: 'color_triple', kind: 'gamble', rarity: 'uncommon',
    name: 'Color Triple',    desc: 'Wager 30% — 3.8× on 25%',
    wagerPct: 0.3,  payout: 3.8,  chance: 0.25,    cooldown: 9 },
  { id: 'snake_eyes', kind: 'gamble', rarity: 'rare',
    name: 'Snake Eyes',      desc: 'Wager 8% — 32× on 1/36',
    wagerPct: 0.08, payout: 32,   chance: 1 / 36,  cooldown: 12 },
  { id: 'lottery',    kind: 'gamble', rarity: 'rare',
    name: 'Lottery Ticket',  desc: 'Wager 1% — 80× on 1/100',
    wagerPct: 0.01, payout: 80,   chance: 1 / 100, cooldown: 15 },
  { id: 'mystery',    kind: 'gamble', rarity: 'rare',
    name: 'Mystery Box',     desc: 'Wager 20% — 10× on 1/12',
    wagerPct: 0.2,  payout: 10,   chance: 1 / 12,  cooldown: 10 },
  { id: 'slots',      kind: 'gamble', rarity: 'legendary',
    name: 'Slots Jackpot',   desc: 'Wager 5% — 250× on 1/500',
    wagerPct: 0.05, payout: 250,  chance: 1 / 500, cooldown: 3 },
  { id: 'triple_sevens', kind: 'gamble', rarity: 'legendary',
    name: 'Triple Sevens',   desc: 'Wager 3% — 250× on 1/333',
    wagerPct: 0.03, payout: 250,  chance: 1 / 333, cooldown: 20 },
  { id: 'royal_flush', kind: 'gamble', rarity: 'legendary',
    name: 'Royal Flush',     desc: 'Wager 2% — 1500× on 1/2000',
    wagerPct: 0.02, payout: 1500, chance: 1 / 2000, cooldown: 40 },
  { id: 'allin',      kind: 'gamble', rarity: 'legendary',
    name: 'All-In Coinflip', desc: 'Wager 100% — 2× on 49%',
    wagerPct: 1.0,  payout: 2,    chance: 0.49,    cooldown: 30 },
  { id: 'roulette_split', kind: 'gamble', rarity: 'common',
    name: 'Roulette Split', desc: 'Wager 12% — 3.5× on 27%',
    wagerPct: 0.12, payout: 3.5,  chance: 0.27,    cooldown: 5 },
  { id: 'keno',       kind: 'gamble', rarity: 'uncommon',
    name: 'Keno Pick',       desc: 'Wager 8% — 14× on 1/15',
    wagerPct: 0.08, payout: 14,   chance: 1 / 15,  cooldown: 11 },
  { id: 'wheel_jackpot', kind: 'gamble', rarity: 'rare',
    name: 'Wheel Jackpot',   desc: 'Wager 4% — 60× on 1/75',
    wagerPct: 0.04, payout: 60,   chance: 1 / 75,  cooldown: 18 },

  { id: 'caffeine',  kind: 'buff', rarity: 'common', buffType: 'rateMul',
    name: 'Caffeine',     desc: '2× rate for 5 min',
    mult: 2,  duration: 300, costSec: 200 },
  { id: 'espresso',  kind: 'buff', rarity: 'common', buffType: 'rateMul',
    name: 'Espresso Shot', desc: '3× rate for 60 sec',
    mult: 3,  duration: 60,  costSec: 60 },
  { id: 'fortune',   kind: 'buff', rarity: 'common', buffType: 'gambleLuck',
    name: 'Fortune Cookie', desc: '+5% gamble win chance, 5 min',
    bonus: 0.05, duration: 300, costSec: 120 },
  { id: 'insurance', kind: 'buff', rarity: 'common', buffType: 'gambleCushion',
    name: 'Insurance',    desc: 'Losses return 25% wager, 3 min',
    refund: 0.25, duration: 180, costSec: 100 },
  { id: 'lucky',     kind: 'buff', rarity: 'uncommon', buffType: 'gambleLuck',
    name: 'Lucky Hour',   desc: '+10% gamble win chance, 10 min',
    bonus: 0.1, duration: 600, costSec: 200 },
  { id: 'steady',    kind: 'buff', rarity: 'uncommon', buffType: 'gambleCushion',
    name: 'Steady Hand',  desc: 'Losses return 50% wager, 5 min',
    refund: 0.5, duration: 300, costSec: 200 },
  { id: 'overdrive', kind: 'buff', rarity: 'uncommon', buffType: 'rateMul',
    name: 'Overdrive',    desc: '5× rate for 90 sec',
    mult: 5,  duration: 90,  costSec: 150 },
  { id: 'snowball',  kind: 'buff', rarity: 'uncommon', buffType: 'compound',
    name: 'Snowball',     desc: 'Rate +1%/s compounding, 120 sec',
    rate: 0.01, duration: 120, costSec: 50 },
  { id: 'frenzy',    kind: 'buff', rarity: 'rare', buffType: 'rateMul',
    name: 'Frenzy',       desc: '10× rate for 30 sec',
    mult: 10, duration: 30,  costSec: 100 },
  { id: 'compound',  kind: 'buff', rarity: 'rare', buffType: 'compound',
    name: 'Compound',     desc: 'Rate +2%/s compounding, 60 sec',
    rate: 0.02, duration: 60, costSec: 30 },
  { id: 'power_hour', kind: 'buff', rarity: 'rare', buffType: 'rateMul',
    name: 'Power Hour',   desc: '4× rate for 1 hour',
    mult: 4,  duration: 3600, costSec: 1800 },
  { id: 'clover',    kind: 'buff', rarity: 'rare', buffType: 'gambleLuck',
    name: 'Four-Leaf Clover', desc: '+25% gamble win chance, 5 min',
    bonus: 0.25, duration: 300, costSec: 600 },
  { id: 'iron_will', kind: 'buff', rarity: 'rare', buffType: 'gambleCushion',
    name: 'Iron Will',    desc: 'Losses return 80% wager, 5 min',
    refund: 0.8, duration: 300, costSec: 400 },
  { id: 'berserker', kind: 'buff', rarity: 'legendary', buffType: 'rateMul',
    name: 'Berserker',    desc: '100× rate for 10 sec',
    mult: 100, duration: 10, costSec: 500 },
  { id: 'avalanche', kind: 'buff', rarity: 'legendary', buffType: 'compound',
    name: 'Avalanche',    desc: 'Rate +5%/s compounding, 30 sec',
    rate: 0.05, duration: 30, costSec: 200 },

  { id: 'marathon',  kind: 'buff', rarity: 'rare', buffType: 'rateMul',
    name: 'Marathon',     desc: '2× rate for 2 hours',
    mult: 2, duration: 7200, costSec: 3600 },
  { id: 'vigil',     kind: 'buff', rarity: 'rare', buffType: 'rateMul',
    name: 'Vigil',        desc: '1.5× rate for 6 hours',
    mult: 1.5, duration: 21600, costSec: 7200 },
  { id: 'tide',      kind: 'buff', rarity: 'rare', buffType: 'gambleLuck',
    name: 'Rising Tide',  desc: '+15% gamble win chance, 6 hours',
    bonus: 0.15, duration: 21600, costSec: 4000 },
  { id: 'ember',     kind: 'buff', rarity: 'rare', buffType: 'compound',
    name: 'Ember',        desc: 'Rate +0.02%/s compounding, 6 hours',
    rate: 0.0002, duration: 21600, costSec: 5000 },
  { id: 'bastion',   kind: 'buff', rarity: 'rare', buffType: 'gambleCushion',
    name: 'Bastion',      desc: 'Losses return 60% wager, 12 hours',
    refund: 0.6, duration: 43200, costSec: 3000 },
  { id: 'dynasty',   kind: 'buff', rarity: 'legendary', buffType: 'rateMul',
    name: 'Dynasty',      desc: '1.3× rate for 1 day',
    mult: 1.3, duration: 86400, costSec: 7200 },
  { id: 'eclipse',   kind: 'buff', rarity: 'legendary', buffType: 'compound',
    name: 'Eclipse',      desc: 'Rate +0.007%/s compounding, 1 day',
    rate: 0.00007, duration: 86400, costSec: 12000 },
  { id: 'pilgrimage', kind: 'buff', rarity: 'legendary', buffType: 'rateMul',
    name: 'Pilgrimage',   desc: '1.2× rate for 3 days',
    mult: 1.2, duration: 259200, costSec: 12000 },
  { id: 'solstice',  kind: 'buff', rarity: 'legendary', buffType: 'rateMul',
    name: 'Solstice',     desc: '1.15× rate for 1 week',
    mult: 1.15, duration: 604800, costSec: 18000 },
  { id: 'aeon',      kind: 'buff', rarity: 'legendary', buffType: 'rateMul',
    name: 'Aeon',         desc: '1.05× rate for 4 weeks',
    mult: 1.05, duration: 2419200, costSec: 18000 },
  { id: 'wake_up',   kind: 'buff', rarity: 'common', buffType: 'rateMul',
    name: 'Wake-Up Call', desc: '1.5× rate for 2 min',
    mult: 1.5, duration: 120, costSec: 40 },
  { id: 'momentum',  kind: 'buff', rarity: 'uncommon', buffType: 'compound',
    name: 'Momentum',     desc: 'Rate +0.5%/s compounding, 90 sec',
    rate: 0.005, duration: 90, costSec: 30 },
  { id: 'divine_fortune', kind: 'buff', rarity: 'legendary', buffType: 'gambleLuck',
    name: 'Divine Fortune', desc: '+50% gamble win chance, 60 sec',
    bonus: 0.5, duration: 60, costSec: 800 },
  { id: 'last_stand', kind: 'buff', rarity: 'legendary', buffType: 'gambleCushion',
    name: 'Last Stand',   desc: 'Losses fully refunded, 60 sec',
    refund: 1.0, duration: 60, costSec: 800 },

  // Additive permanents are generated dynamically per slate via genBaseAdd —
  // see the _dyn:'add' virtual entries below. The static list grew unwieldy
  // and trailed off into "only legendary" once production passed the last
  // hard-coded tier. Generated tiers stay relevant at any rate.
  { kind: 'permanent', rarity: 'common',    _dyn: 'add' },
  { kind: 'permanent', rarity: 'uncommon',  _dyn: 'add' },
  { kind: 'permanent', rarity: 'rare',      _dyn: 'add' },
  { kind: 'permanent', rarity: 'legendary', _dyn: 'add' },

  // One-shot coin gifts, scaled to current rate. Common/uncommon/rare are
  // modest top-ups; legendary is a noticeable jump.
  { kind: 'gift', rarity: 'common',    _dyn: 'gift' },
  { kind: 'gift', rarity: 'uncommon',  _dyn: 'gift' },
  { kind: 'gift', rarity: 'rare',      _dyn: 'gift' },
  { kind: 'gift', rarity: 'legendary', _dyn: 'gift' },

  // Multiplicative permanents — weak mults phase out, strong ones unlock later.
  { id: 'mult_starter',   kind: 'permanent', rarity: 'common',    permType: 'mul',
    name: '+50% Multiplier (Starter)', desc: 'Permanent ×1.5 to rate',
    value: 1.5,  baseCost: 50,     growth: 3,                          maxRate: 500 },
  { id: 'mult5',          kind: 'permanent', rarity: 'common',    permType: 'mul',
    name: '+5% Multiplier',      desc: 'Permanent ×1.05 to rate',
    value: 1.05, baseCost: 250,    growth: 2.5,                        maxRate: 2000 },
  { id: 'mult10',         kind: 'permanent', rarity: 'uncommon',  permType: 'mul',
    name: '+10% Multiplier',     desc: 'Permanent ×1.1 to rate',
    value: 1.1,  baseCost: 1500,   growth: 4,      minRate: 200,       maxRate: 50000 },
  { id: 'mult25',         kind: 'permanent', rarity: 'uncommon',  permType: 'mul',
    name: '+25% Multiplier',     desc: 'Permanent ×1.25 to rate',
    value: 1.25, baseCost: 8000,   growth: 4,      minRate: 2000,      maxRate: 1e6 },
  { id: 'mult33',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: '+33% Multiplier',     desc: 'Permanent ×1.33 to rate',
    value: 1.33, baseCost: 25000,  growth: 4.5,    minRate: 8000,      maxRate: 1e7 },
  { id: 'mult50',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: '+50% Multiplier',     desc: 'Permanent ×1.5 to rate',
    value: 1.5,  baseCost: 150000, growth: 5,      minRate: 50000,     maxRate: 1e9 },
  { id: 'mult75',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: '+75% Multiplier',     desc: 'Permanent ×1.75 to rate',
    value: 1.75, baseCost: 1.5e6,  growth: 5,      minRate: 1e6,       maxRate: 1e10 },
  { id: 'mult_two',       kind: 'permanent', rarity: 'legendary', permType: 'mul',
    name: '×2 Multiplier',       desc: 'Permanent ×2 to rate',
    value: 2,    baseCost: 1e8,    growth: 6,      minRate: 1e7 },
  { id: 'mult_three',     kind: 'permanent', rarity: 'legendary', permType: 'mul',
    name: '×3 Multiplier',       desc: 'Permanent ×3 to rate',
    value: 3,    baseCost: 1e10,   growth: 8,      minRate: 1e9 },

  { id: 'tip_jar',   kind: 'convert', rarity: 'common',
    name: 'Tip Jar',    desc: 'Burn 5% balance — perm +0.02% of spent /s',
    pctCost: 0.05, ratio: 0.0002 },
  { id: 'side_gig',  kind: 'convert', rarity: 'uncommon',
    name: 'Side Gig',   desc: 'Burn 10% balance — perm +0.1% of spent /s',
    pctCost: 0.10, ratio: 0.001 },
  { id: 'franchise', kind: 'convert', rarity: 'rare',
    name: 'Franchise',  desc: 'Burn 25% balance — perm +0.4% of spent /s',
    pctCost: 0.25, ratio: 0.004 },
  { id: 'empire',    kind: 'convert', rarity: 'legendary',
    name: 'Empire',     desc: 'Burn ALL balance — perm +1% of spent /s',
    pctCost: 1.0,  ratio: 0.01 },
  { id: 'vending',   kind: 'convert', rarity: 'common',
    name: 'Vending Machine', desc: 'Burn 2% balance — perm +0.006% of spent /s',
    pctCost: 0.02, ratio: 0.00006 },
  { id: 'kiosk',     kind: 'convert', rarity: 'uncommon',
    name: 'Kiosk',      desc: 'Burn 7% balance — perm +0.05% of spent /s',
    pctCost: 0.07, ratio: 0.0005 },
  { id: 'conglomerate', kind: 'convert', rarity: 'rare',
    name: 'Conglomerate', desc: 'Burn 50% balance — perm +0.75% of spent /s',
    pctCost: 0.5,  ratio: 0.0075 },
];

const BY_ID = new Map(UPGRADES.filter((u) => u.id).map((u) => [u.id, u]));
export const getUpgrade = (id) => BY_ID.get(id);
// Slots may carry a `dyn` payload for dynamically generated upgrades whose
// id isn't in the static table. Prefer it over the registry.
export const resolveUpgrade = (slot) => slot && (slot.dyn || BY_ID.get(slot.id)) || null;

export const CONVERT_MIN_RATE = 100;

// Per-slot type pin. Slots 0..3 are typed; slot 1's *first* roll is seeded to
// a cheap common mul by main.js, but the filter stays permissive so rerolls/buys
// land on any rarity mul. Anything past idx 3 accepts any upgrade kind.
//   0: base-rate additive permanent (generated tier)
//   1: multiplicative permanent (any rarity)
//   2: buff or gift
//   3: gamble
export const SLOT_FILTERS = [
  (u) => u.kind === 'permanent' && (u._dyn === 'add' || u.permType === 'add'),
  (u) => u.kind === 'permanent' && u.permType === 'mul',
  (u) => u.kind === 'buff' || u.kind === 'gift',
  (u) => u.kind === 'gamble',
];

// Per-kind theming used by the shop UI.
export const KIND_THEME = {
  permanent: { icon: 'ri-medal-fill',         color: '#4cd07d', label: 'Permanent' },
  buff:      { icon: 'ri-flashlight-fill',    color: '#9d6ee0', label: 'Buff' },
  convert:   { icon: 'ri-exchange-funds-fill',color: '#f5d34a', label: 'Convert' },
  gamble:    { icon: 'ri-dice-line',          color: '#ff5a6e', label: 'Gamble' },
  gift:      { icon: 'ri-gift-fill',          color: '#ffb84a', label: 'Gift' },
};

export function isEligible(u, ctx) {
  const r = ctx?.rate || 0;
  if (u._dyn) return true; // virtual generators are always eligible
  if (u.kind === 'convert' && r <= CONVERT_MIN_RATE) return false;
  if (u.minRate != null && r < u.minRate) return false;
  if (u.maxRate != null && r >= u.maxRate) return false;
  return true;
}

export function slotMatches(u, slotIdx) {
  const f = SLOT_FILTERS[slotIdx];
  if (!f) return true; // slots past the pinned set accept any kind
  return f(u);
}

function weightedPick(pool) {
  const weights = pool.map((u) => (RARITY_WEIGHTS[u.rarity] || 1) * (KIND_WEIGHT[u.kind] ?? 1));
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

// Dynamic additive permanent. Scales the +X/s value to a fraction of the
// player's current rate by rarity; cost is a multiple of value with a mild
// log bump so late-game tiers stay meaningful but not free.
export const ADD_VALUE_MULT = { common: 0.1, uncommon: 0.4, rare: 1.5, legendary: 6 };
export function genBaseAdd(rarity, ctx) {
  const r = Math.max(ctx?.rate || 0, 1);
  const value = Math.max(1, niceRound(r * (ADD_VALUE_MULT[rarity] || 0.1)));
  const cost = Math.max(10, value * (40 + Math.log10(Math.max(value, 10)) * 30));
  const label = formatAbbrev(value);
  return {
    upgrade: {
      id: `dyn_add_${rarity}_${value}`,
      kind: 'permanent',
      rarity,
      permType: 'add',
      name: `+${label} per second`,
      desc: `Permanent +${label} to base rate`,
      value,
    },
    cost,
  };
}

// Dynamic gift. Reward is a fixed multiple of current rate by rarity: small
// for common/uncommon/rare, much bigger for legendary. Cost is always 0.
export const GIFT_SECONDS = { common: 30, uncommon: 90, rare: 240, legendary: 1800 };
export function genGift(rarity, ctx) {
  const r = Math.max(ctx?.rate || 0, 1);
  const reward = niceRound(r * (GIFT_SECONDS[rarity] || 30));
  const label = formatAbbrev(reward);
  return {
    upgrade: {
      id: `dyn_gift_${rarity}_${reward}`,
      kind: 'gift',
      rarity,
      name: `Gift: +${label}`,
      desc: `Free coins: +${label}`,
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

export function costFor(upgrade, ctx) {
  switch (upgrade.kind) {
    case 'gamble':    return ctx.balance * upgrade.wagerPct;
    case 'buff':      return Math.max(1, ctx.rate * upgrade.costSec);
    case 'permanent': return upgrade.baseCost * Math.pow(upgrade.growth, ctx.owned[upgrade.id] || 0);
    case 'convert':   return ctx.balance * upgrade.pctCost;
  }
  return 0;
}
