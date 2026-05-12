const RARITY_WEIGHTS = { common: 50, uncommon: 22, rare: 8, legendary: 2 };

export const UPGRADES = [
  { id: 'red_black',  kind: 'gamble', rarity: 'common',
    name: 'Red / Black',     desc: 'Wager 50% — 2× on 48.6%',
    wagerPct: 0.5,  payout: 2,    chance: 18 / 37, cooldown: 5 },
  { id: 'dice',       kind: 'gamble', rarity: 'common',
    name: 'Dice',            desc: 'Wager 20% — 5× on 1/6',
    wagerPct: 0.2,  payout: 5,    chance: 1 / 6,   cooldown: 6 },
  { id: 'blackjack',  kind: 'gamble', rarity: 'uncommon',
    name: 'Blackjack',       desc: 'Wager 30% — 1.95× on 49%',
    wagerPct: 0.3,  payout: 1.95, chance: 0.49,    cooldown: 8 },
  { id: 'single',     kind: 'gamble', rarity: 'uncommon',
    name: 'Single Number',   desc: 'Wager 10% — 36× on 1/37',
    wagerPct: 0.1,  payout: 36,   chance: 1 / 37,  cooldown: 10 },
  { id: 'slots',      kind: 'gamble', rarity: 'legendary',
    name: 'Slots Jackpot',   desc: 'Wager 5% — 250× on 1/500',
    wagerPct: 0.05, payout: 250,  chance: 1 / 500, cooldown: 3 },
  { id: 'allin',      kind: 'gamble', rarity: 'legendary',
    name: 'All-In Coinflip', desc: 'Wager 100% — 2× on 49%',
    wagerPct: 1.0,  payout: 2,    chance: 0.49,    cooldown: 30 },

  { id: 'caffeine', kind: 'buff', rarity: 'common', buffType: 'rateMul',
    name: 'Caffeine',    desc: '2× rate for 5 min',
    mult: 2,  duration: 300, costSec: 200 },
  { id: 'frenzy',   kind: 'buff', rarity: 'rare', buffType: 'rateMul',
    name: 'Frenzy',      desc: '10× rate for 30 sec',
    mult: 10, duration: 30,  costSec: 100 },
  { id: 'lucky',    kind: 'buff', rarity: 'uncommon', buffType: 'gambleLuck',
    name: 'Lucky Hour',  desc: '+10% gamble win chance, 10 min',
    bonus: 0.1, duration: 600, costSec: 200 },
  { id: 'steady',   kind: 'buff', rarity: 'uncommon', buffType: 'gambleCushion',
    name: 'Steady Hand', desc: 'Losses return 50% wager, 5 min',
    refund: 0.5, duration: 300, costSec: 200 },
  { id: 'compound', kind: 'buff', rarity: 'rare', buffType: 'compound',
    name: 'Compound',    desc: 'Rate +2%/s compounding, 60 sec',
    rate: 0.02, duration: 60, costSec: 30 },

  { id: 'plus_one', kind: 'permanent', rarity: 'common', permType: 'add',
    name: '+1 per second',   desc: 'Permanent +1 to base rate',
    value: 1,   baseCost: 10,   growth: 1.15 },
  { id: 'mult10',   kind: 'permanent', rarity: 'rare', permType: 'mul',
    name: '+10% Multiplier', desc: 'Permanent ×1.1 to rate',
    value: 1.1, baseCost: 1000, growth: 5 },
];

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
const INDEX_OF = new Map(UPGRADES.map((u, i) => [u.id, i]));
export const getUpgrade = (id) => BY_ID.get(id);

export function sortSlate(slate) {
  slate.sort((a, b) => (INDEX_OF.get(a) ?? 0) - (INDEX_OF.get(b) ?? 0));
  return slate;
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

export function rollSlate(n = 4) {
  const slate = [];
  const taken = new Set();
  while (slate.length < n) {
    const pool = UPGRADES.filter((u) => !taken.has(u.id));
    if (!pool.length) break;
    const pick = weightedPick(pool);
    slate.push(pick.id);
    taken.add(pick.id);
  }
  return sortSlate(slate);
}

export function rerollSlot(slate, idx) {
  const exclude = new Set(slate);
  const pool = UPGRADES.filter((u) => !exclude.has(u.id));
  if (!pool.length) return slate[idx];
  return weightedPick(pool).id;
}

export function costFor(upgrade, ctx) {
  switch (upgrade.kind) {
    case 'gamble':    return ctx.balance * upgrade.wagerPct;
    case 'buff':      return Math.max(1, ctx.rate * upgrade.costSec);
    case 'permanent': return upgrade.baseCost * Math.pow(upgrade.growth, ctx.owned[upgrade.id] || 0);
  }
  return 0;
}
