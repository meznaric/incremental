const RARITY_WEIGHTS = { common: 50, uncommon: 22, rare: 8, legendary: 2 };

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

  { id: 'plus_one',     kind: 'permanent', rarity: 'common', permType: 'add',
    name: '+1 per second',     desc: 'Permanent +1 to base rate',
    value: 1,    baseCost: 10,     growth: 1.15 },
  { id: 'plus_five',    kind: 'permanent', rarity: 'uncommon', permType: 'add',
    name: '+5 per second',     desc: 'Permanent +5 to base rate',
    value: 5,    baseCost: 200,    growth: 1.3 },
  { id: 'mult25',       kind: 'permanent', rarity: 'uncommon', permType: 'mul',
    name: '+25% Multiplier',   desc: 'Permanent ×1.25 to rate',
    value: 1.25, baseCost: 5000,   growth: 3 },
  { id: 'plus_hundred', kind: 'permanent', rarity: 'rare', permType: 'add',
    name: '+100 per second',   desc: 'Permanent +100 to base rate',
    value: 100,  baseCost: 10000,  growth: 1.5 },
  { id: 'mult10',       kind: 'permanent', rarity: 'rare', permType: 'mul',
    name: '+10% Multiplier',   desc: 'Permanent ×1.1 to rate',
    value: 1.1,  baseCost: 1000,   growth: 5 },
  { id: 'mult50',       kind: 'permanent', rarity: 'legendary', permType: 'mul',
    name: '+50% Multiplier',   desc: 'Permanent ×1.5 to rate',
    value: 1.5,  baseCost: 100000, growth: 8 },

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
];

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export const getUpgrade = (id) => BY_ID.get(id);

export const CONVERT_MIN_RATE = 100;

// Fixed slot layout: [permanent, other, other, gamble].
// "other" slots accept any non-gamble, non-permanent upgrade kind.
export const SLOT_KINDS = [
  ['permanent'],
  ['buff', 'convert'],
  ['buff', 'convert'],
  ['gamble'],
];

// Per-kind theming used by the shop UI.
export const KIND_THEME = {
  permanent: { icon: 'ri-medal-fill',         color: '#4cd07d', label: 'Permanent' },
  buff:      { icon: 'ri-flashlight-fill',    color: '#9d6ee0', label: 'Buff' },
  convert:   { icon: 'ri-exchange-funds-fill',color: '#f5d34a', label: 'Convert' },
  gamble:    { icon: 'ri-dice-line',          color: '#ff5a6e', label: 'Gamble' },
};

export function isEligible(u, ctx) {
  if (u.kind === 'convert') return (ctx?.rate || 0) > CONVERT_MIN_RATE;
  return true;
}

export function slotMatches(u, slotIdx) {
  const kinds = SLOT_KINDS[slotIdx];
  return !!kinds && kinds.includes(u.kind);
}

function weightedPick(pool) {
  const weights = pool.map((u) => RARITY_WEIGHTS[u.rarity] || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Each slot freezes its cost and drop-cost at the moment it was offered, so the
// number on the card doesn't drift as the player's balance / rate change. ctx
// must carry { balance, rate, owned, dropCost }.
function buildSlot(u, ctx) {
  return {
    id: u.id,
    cost: costFor(u, ctx),
    dropCost: ctx.dropCost ?? 0,
  };
}

export function rollSlate(n = SLOT_KINDS.length, ctx) {
  const slate = [];
  const taken = new Set();
  for (let i = 0; i < n; i++) {
    const pool = UPGRADES.filter((u) => !taken.has(u.id) && slotMatches(u, i) && isEligible(u, ctx));
    if (!pool.length) { slate.push(null); continue; }
    const pick = weightedPick(pool);
    slate.push(buildSlot(pick, ctx));
    taken.add(pick.id);
  }
  return slate;
}

export function rerollSlot(slate, idx, ctx) {
  const exclude = new Set(slate.map((s) => s?.id).filter(Boolean));
  const pool = UPGRADES.filter((u) => !exclude.has(u.id) && slotMatches(u, idx) && isEligible(u, ctx));
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
