import { formatAbbrev } from './bignum.js';

const RARITY_WEIGHTS = { common: 50, uncommon: 22, rare: 8, legendary: 1, mythic: 0.1 };
// Per-kind multiplier on top of rarity weight. Gambles are noisy and crowd out
// other kinds when they share weight equally — drop them to 25% so non-gamble
// kinds dominate any-kind slots. The fixed gamble slot (idx 1) is unaffected
// since its pool is entirely gambles and relative weights cancel.
export const KIND_WEIGHT = { gamble: 0.25 };

export const UPGRADES = [
  // Hail odds carry a small house edge baked into the listed chance: each value
  // is shaded ~3pp below its naive fair-coin / fair-wheel analogue. Subtle on
  // any single roll; over hundreds of rolls the band-floor wins more than the
  // listener does. Carry windows still tip the math (capped at 0.85 in shop.js).
  { id: 'red_black',  kind: 'gamble', rarity: 'common',
    name: 'Carrier Bleed',   desc: 'Push a phrase sideways into a working radio band.',
    wagerPct: 0.5,  payout: 2,    chance: 0.46,    cooldown: 12 },
  { id: 'dice',       kind: 'gamble', rarity: 'common',
    name: 'Magnetic Storm',  desc: 'Hide six words in a geomagnetic burst.',
    wagerPct: 0.2,  payout: 5,    chance: 0.14,    cooldown: 15 },
  { id: 'coin_flip',  kind: 'gamble', rarity: 'common',
    name: 'Open Whisper',    desc: 'A direct line. They hear you, or they do not.',
    wagerPct: 0.25, payout: 1.95, chance: 0.47,    cooldown: 10 },
  { id: 'high_card',  kind: 'gamble', rarity: 'common',
    name: 'Satellite Patch', desc: 'Wake one of their old satellites; speak through it.',
    wagerPct: 0.15, payout: 2.4,  chance: 0.37,    cooldown: 12 },
  { id: 'wheel',      kind: 'gamble', rarity: 'common',
    name: 'Aurora Modulation', desc: 'Write your message in their northern lights.',
    wagerPct: 0.1,  payout: 9,    chance: 0.08,    cooldown: 15 },
  { id: 'blackjack',  kind: 'gamble', rarity: 'uncommon',
    name: 'Compressed Burst', desc: 'Twenty-one bits, perfectly timed.',
    wagerPct: 0.3,  payout: 1.95, chance: 0.46,    cooldown: 20 },
  { id: 'single',     kind: 'gamble', rarity: 'uncommon',
    name: 'Deep Probe',      desc: 'One coordinate, one window, one shot.',
    wagerPct: 0.1,  payout: 36,   chance: 0.024,   cooldown: 25 },
  { id: 'double_or_nothing', kind: 'gamble', rarity: 'uncommon',
    name: 'Direct Hail',     desc: 'Be heard or be silent. No middle.',
    wagerPct: 0.5,  payout: 1.95, chance: 0.47,    cooldown: 15 },
  { id: 'pair_dice',  kind: 'gamble', rarity: 'uncommon',
    name: 'Twin Pulse',      desc: 'Two carriers — both have to land.',
    wagerPct: 0.25, payout: 8,    chance: 0.09,    cooldown: 18 },
  { id: 'poker_hand', kind: 'gamble', rarity: 'uncommon',
    name: 'Layered Stack',   desc: 'Hide the payload inside their own broadcasts.',
    wagerPct: 0.4,  payout: 2.4,  chance: 0.37,    cooldown: 30 },
  { id: 'color_triple', kind: 'gamble', rarity: 'uncommon',
    name: 'Tri-Band Splice', desc: 'Three frequencies; one phrase.',
    wagerPct: 0.3,  payout: 3.8,  chance: 0.22,    cooldown: 22 },
  { id: 'snake_eyes', kind: 'gamble', rarity: 'rare',
    name: 'Resonance Lock',  desc: 'The crust itself hums your sentence.',
    wagerPct: 0.08, payout: 32,   chance: 0.024,   cooldown: 30 },
  { id: 'lottery',    kind: 'gamble', rarity: 'rare',
    name: 'Cold Call',       desc: 'Pick a star. Push hard. Hope.',
    wagerPct: 0.01, payout: 80,   chance: 0.008,   cooldown: 36 },
  { id: 'mystery',    kind: 'gamble', rarity: 'rare',
    name: 'Dark Packet',     desc: 'Encrypted. Deniable. Expensive to send.',
    wagerPct: 0.2,  payout: 10,   chance: 0.07,    cooldown: 25 },
  { id: 'slots',      kind: 'gamble', rarity: 'legendary',
    name: 'Subspace Bleed',  desc: 'Let the FTL leak do the work.',
    wagerPct: 0.05, payout: 250,  chance: 0.0018,  cooldown: 8 },
  { id: 'triple_sevens', kind: 'gamble', rarity: 'legendary',
    name: 'Trinity Pulse',   desc: 'Three perfectly-timed jumps in series.',
    wagerPct: 0.03, payout: 250,  chance: 0.0027,  cooldown: 50 },
  { id: 'royal_flush', kind: 'gamble', rarity: 'legendary',
    name: 'Quiet Relay Hijack', desc: 'Use a real Listener relay against the Law.',
    wagerPct: 0.02, payout: 1500, chance: 0.00045, cooldown: 100 },
  { id: 'allin',      kind: 'gamble', rarity: 'legendary',
    name: 'Burn the Stack',  desc: 'Every Echo you have. One push.',
    wagerPct: 1.0,  payout: 2,    chance: 0.46,    cooldown: 75 },
  { id: 'roulette_split', kind: 'gamble', rarity: 'common',
    name: 'Split-Band',      desc: 'Wager across two adjacent frequencies.',
    wagerPct: 0.12, payout: 3.5,  chance: 0.24,    cooldown: 12 },
  { id: 'keno',       kind: 'gamble', rarity: 'uncommon',
    name: 'Cipher Pick',     desc: 'Pick a code; pray they decode it.',
    wagerPct: 0.08, payout: 14,   chance: 0.055,   cooldown: 28 },
  { id: 'wheel_jackpot', kind: 'gamble', rarity: 'rare',
    name: 'Aurora Jackpot',  desc: 'The whole hemisphere reads you tonight.',
    wagerPct: 0.04, payout: 60,   chance: 0.011,   cooldown: 45 },
  { id: 'friend_bet', kind: 'gamble', rarity: 'rare',
    name: 'Confidant',       desc: 'Speak to a trusted contact. Same risk; less guilt.',
    wagerPct: 0.25, payout: 2,    chance: 0.47,    cooldown: 20 },

  { id: 'caffeine',  kind: 'buff', rarity: 'common', buffType: 'rateMul', group: 'burst',
    name: 'Stim Patch',   desc: 'Cortical stim. 1.7× rate, 5 min.',
    mult: 1.7,  duration: 600, costSec: 200 },
  { id: 'espresso',  kind: 'buff', rarity: 'common', buffType: 'rateMul', group: 'burst',
    name: 'Quick Stim',   desc: 'One minute, sharp as a needle. 2.4× rate, 60s.',
    mult: 2.4,  duration: 120, costSec: 60 },
  { id: 'fortune',   kind: 'buff', rarity: 'common', buffType: 'gambleLuck', group: 'burst',
    name: 'Hunch',        desc: 'This band feels right. +2% hail chance, 4 min.',
    bonus: 0.015, duration: 240, costSec: 120 },
  { id: 'insurance', kind: 'buff', rarity: 'common', buffType: 'gambleCushion', group: 'burst',
    name: 'Failsafe Buffer', desc: 'A small refund on a misfire. 2% return, 3 min.',
    refund: 0.015, duration: 180, costSec: 100 },
  { id: 'low_tide',  kind: 'buff', rarity: 'common', buffType: 'rateMul', group: 'long',
    name: 'Low Tide',     desc: 'One hour of clean band-floor. You are sitting on quiet water. 1.055× rate.',
    mult: 1.055, duration: 3600, costSec: 280 },
  { id: 'morning_drift', kind: 'buff', rarity: 'common', buffType: 'rateMul', group: 'long',
    name: 'Morning Drift', desc: 'Two hours before the sky wakes up. Nothing on the air but me. 1.035× rate.',
    mult: 1.035, duration: 7200, costSec: 360 },
  { id: 'lucky',     kind: 'buff', rarity: 'uncommon', buffType: 'gambleLuck', group: 'burst',
    name: 'Clear Window', desc: 'Ion calm. Signals carry. +3% hail chance, 6 min.',
    bonus: 0.03, duration: 360, costSec: 200 },
  { id: 'steady',    kind: 'buff', rarity: 'uncommon', buffType: 'gambleCushion', group: 'burst',
    name: 'Error-Correction', desc: 'Most wasted bits come home. 3% return, 5 min.',
    refund: 0.025, duration: 300, costSec: 200 },
  { id: 'overdrive', kind: 'buff', rarity: 'uncommon', buffType: 'rateMul', group: 'burst',
    name: 'Overclock',    desc: 'Push the decoder past spec. It will whine. 3.8×, 90s.',
    mult: 3.8,  duration: 180, costSec: 150 },
  { id: 'snowball',  kind: 'buff', rarity: 'uncommon', buffType: 'compound', group: 'burst',
    name: 'Cascade',      desc: 'Each second feeds the next. +1%/s compounding, 120s.',
    rate: 0.01, duration: 240, costSec: 50 },
  { id: 'quiet_shift', kind: 'buff', rarity: 'uncommon', buffType: 'rateMul', group: 'long',
    name: 'Quiet Shift',  desc: 'A three-hour stretch with the relay tuned tight. 1.07× rate.',
    mult: 1.07, duration: 10800, costSec: 800 },
  { id: 'slow_drip', kind: 'buff', rarity: 'uncommon', buffType: 'compound', group: 'long',
    name: 'Slow Drip',    desc: 'Six hours. The numbers keep adding themselves up while I sleep. +0.005%/s.',
    rate: 0.00005, duration: 21600, costSec: 1000 },
  { id: 'frenzy',    kind: 'buff', rarity: 'rare', buffType: 'rateMul', group: 'burst',
    name: 'Burst Mode',   desc: 'Thirty seconds at full bandwidth. 7.3×, 30s.',
    mult: 7.3, duration: 60,  costSec: 100 },
  { id: 'compound',  kind: 'buff', rarity: 'rare', buffType: 'compound', group: 'burst',
    name: 'Resonance Build', desc: 'The carrier finds itself. +2%/s compounding, 60s.',
    rate: 0.02, duration: 120, costSec: 30 },
  { id: 'power_hour', kind: 'buff', rarity: 'rare', buffType: 'rateMul', group: 'long',
    name: 'Clean Sky',    desc: 'An hour of orbital quiet. 3.1× rate, 1 hour.',
    mult: 3.1,  duration: 7200, costSec: 1800 },
  { id: 'clover',    kind: 'buff', rarity: 'rare', buffType: 'gambleLuck', group: 'burst',
    name: 'Carrier Surge', desc: 'Background noise drops. +8% hail chance, 4 min.',
    bonus: 0.08, duration: 240, costSec: 600 },
  { id: 'iron_will', kind: 'buff', rarity: 'rare', buffType: 'gambleCushion', group: 'burst',
    name: 'Hardened Stack', desc: 'Failures hurt less. 4% return, 5 min.',
    refund: 0.035, duration: 300, costSec: 400 },
  { id: 'berserker', kind: 'buff', rarity: 'legendary', buffType: 'rateMul', group: 'burst',
    name: 'Critical Load', desc: 'Run hot. Hope nothing melts. 70×, 10s.',
    mult: 70, duration: 20, costSec: 500 },
  { id: 'avalanche', kind: 'buff', rarity: 'legendary', buffType: 'compound', group: 'burst',
    name: 'Resonance Storm', desc: 'Compounds dangerously. +5%/s, 30s.',
    rate: 0.05, duration: 60, costSec: 200 },

  { id: 'marathon',  kind: 'buff', rarity: 'rare', buffType: 'rateMul', group: 'long',
    name: 'Long Watch',   desc: 'Two hours of cleaner copy, no sleep. 1.7× rate.',
    mult: 1.7, duration: 14400, costSec: 3600 },
  { id: 'vigil',     kind: 'buff', rarity: 'rare', buffType: 'rateMul', group: 'long',
    name: 'Patience',     desc: 'Six hours, slow gains, no breaks. 1.35× rate.',
    mult: 1.35, duration: 43200, costSec: 7200 },
  { id: 'tide',      kind: 'buff', rarity: 'rare', buffType: 'gambleLuck', group: 'long',
    name: 'Open Sky',     desc: 'Six hours of quiet space weather. +5% hail chance.',
    bonus: 0.05, duration: 43200, costSec: 4000 },
  { id: 'ember',     kind: 'buff', rarity: 'rare', buffType: 'compound', group: 'long',
    name: 'Slow Burn',    desc: 'A trickle compounding all day. +0.02%/s, 6h.',
    rate: 0.0002, duration: 43200, costSec: 5000 },
  { id: 'bastion',   kind: 'buff', rarity: 'rare', buffType: 'gambleCushion', group: 'long',
    name: 'Shield Net',   desc: 'Twelve hours of partial refunds on a loss. 3% return.',
    refund: 0.025, duration: 86400, costSec: 3000 },
  { id: 'dynasty',   kind: 'buff', rarity: 'legendary', buffType: 'rateMul', group: 'long',
    name: 'Held Channel', desc: 'One full day on a single carrier. 1.21× rate.',
    mult: 1.21, duration: 172800, costSec: 7200 },
  { id: 'eclipse',   kind: 'buff', rarity: 'legendary', buffType: 'compound', group: 'long',
    name: 'Black Sky',    desc: 'Long, dark, quietly growing. +0.007%/s, 1 day.',
    rate: 0.00007, duration: 172800, costSec: 12000 },
  { id: 'pilgrimage', kind: 'buff', rarity: 'legendary', buffType: 'rateMul', group: 'long',
    name: 'Deep Drift',   desc: 'Three days. No correction. 1.14× rate.',
    mult: 1.14, duration: 518400, costSec: 12000 },
  { id: 'solstice',  kind: 'buff', rarity: 'legendary', buffType: 'rateMul', group: 'long',
    name: 'Solar Quiet',  desc: 'A week of cooperative star-weather. 1.10× rate.',
    mult: 1.10, duration: 1209600, costSec: 18000 },
  { id: 'aeon',      kind: 'buff', rarity: 'legendary', buffType: 'rateMul', group: 'long',
    name: 'Cold Cycle',   desc: 'Four weeks of mild gain. 1.035× rate.',
    mult: 1.035, duration: 4838400, costSec: 18000 },
  { id: 'wake_up',   kind: 'buff', rarity: 'common', buffType: 'rateMul', group: 'burst',
    name: 'Ping',         desc: 'A nudge from the system. 1.35× rate, 2 min.',
    mult: 1.35, duration: 240, costSec: 40 },
  { id: 'momentum',  kind: 'buff', rarity: 'uncommon', buffType: 'compound', group: 'burst',
    name: 'Phase Climb',  desc: 'Phase-lock tightens. +0.5%/s compounding, 90s.',
    rate: 0.005, duration: 180, costSec: 30 },
  { id: 'divine_fortune', kind: 'buff', rarity: 'legendary', buffType: 'gambleLuck', group: 'burst',
    name: 'Oracle Window', desc: 'Ninety seconds. Use them. +16% hail chance.',
    bonus: 0.16, duration: 90, costSec: 800 },
  { id: 'last_stand', kind: 'buff', rarity: 'legendary', buffType: 'gambleCushion', group: 'burst',
    name: 'Final Buffer', desc: 'Ninety seconds of generous cushion. 4% return.',
    refund: 0.04, duration: 90, costSec: 800 },

  // Mythic-only long haulers — week-plus durations, modest multipliers.
  { id: 'epoch',     kind: 'buff', rarity: 'mythic', buffType: 'rateMul', group: 'long',
    name: 'Slow Era',     desc: 'Two weeks at a steady premium. 1.18× rate.',
    mult: 1.18, duration: 2419200, costSec: 36000 },
  { id: 'monolith',  kind: 'buff', rarity: 'mythic', buffType: 'rateMul', group: 'long',
    name: 'Lighthouse',   desc: 'A week of strong, reliable carrier. 1.28× rate.',
    mult: 1.28, duration: 1209600, costSec: 30000 },
  { id: 'forever',   kind: 'buff', rarity: 'mythic', buffType: 'rateMul', group: 'long',
    name: 'False Dawn',   desc: 'Six weeks. The horizon never quite arrives. 1.07× rate.',
    mult: 1.07, duration: 7257600, costSec: 30000 },
  { id: 'ancestral', kind: 'buff', rarity: 'mythic', buffType: 'compound', group: 'long',
    name: 'Old Carrier',  desc: 'A pre-Union signal lingers. +0.001%/s, 2 weeks.',
    rate: 0.00001, duration: 2419200, costSec: 48000 },
  { id: 'oracle',    kind: 'buff', rarity: 'mythic', buffType: 'gambleLuck', group: 'long',
    name: 'Pre-Echo',     desc: 'You read the answer before you hear it. +7%, 1 week.',
    bonus: 0.065, duration: 1209600, costSec: 24000 },

  // Meta-buffs ("Frames") — short strategic windows that scale the next
  // window you open. They don't act on their own; they prime everything
  // applied while they hold. value semantics depend on buffType:
  //   metaStrength: rateMul buffs land at value×this while active
  //   metaDuration: every newly-applied buff's duration ×this while active
  //   metaLuck:     gambleLuck buffs land at value+this while active
  { id: 'prime_frame',   kind: 'buff', rarity: 'common', buffType: 'metaDuration',
    name: 'Prime Frame', desc: 'Frame the next windows to last longer. Buff durations ×1.5 while it holds.',
    value: 1.5, duration: 90, costSec: 200 },
  { id: 'tight_lattice', kind: 'buff', rarity: 'uncommon', buffType: 'metaStrength',
    name: 'Tight Lattice', desc: 'Brace the carrier scaffold. New rate windows land ×1.3 stronger.',
    value: 1.3, duration: 120, costSec: 400 },
  { id: 'wide_band',     kind: 'buff', rarity: 'uncommon', buffType: 'metaDuration',
    name: 'Wide Band', desc: 'Open the gate before you push. Buff durations ×2 while it holds.',
    value: 2, duration: 180, costSec: 500 },
  { id: 'cold_lens',     kind: 'buff', rarity: 'rare', buffType: 'metaLuck',
    name: 'Cold Lens', desc: 'A clean atmosphere column. Carry windows bought now read +5% richer.',
    value: 0.05, duration: 240, costSec: 700 },
  { id: 'standing_wave', kind: 'buff', rarity: 'rare', buffType: 'metaStrength',
    name: 'Standing Wave', desc: 'The carrier scaffold stiffens. New rate windows land ×1.75 stronger.',
    value: 1.75, duration: 300, costSec: 1200 },
  { id: 'echo_prime',    kind: 'buff', rarity: 'legendary', buffType: 'metaStrength',
    name: 'Echo Prime', desc: 'Five minutes of perfect framing. New rate windows land ×2.5 stronger.',
    value: 2.5, duration: 300, costSec: 2400 },
  { id: 'long_frame',    kind: 'buff', rarity: 'legendary', buffType: 'metaDuration',
    name: 'Long Frame', desc: 'Stretch the gate wide open. Buff durations ×3 while it holds.',
    value: 3, duration: 600, costSec: 2400 },
  { id: 'oracle_lens',   kind: 'buff', rarity: 'legendary', buffType: 'metaLuck',
    name: 'Oracle Lens', desc: 'A pristine viewing window. Carry windows bought now read +12% richer.',
    value: 0.12, duration: 300, costSec: 2400 },

  // Additive permanents are generated dynamically per slate via genBaseAdd —
  // see the _dyn:'add' virtual entries below. The static list grew unwieldy
  // and trailed off into "only legendary" once production passed the last
  // hard-coded tier. Generated tiers stay relevant at any rate.
  { kind: 'permanent', rarity: 'common',    _dyn: 'add' },
  { kind: 'permanent', rarity: 'uncommon',  _dyn: 'add' },
  { kind: 'permanent', rarity: 'rare',      _dyn: 'add' },
  { kind: 'permanent', rarity: 'legendary', _dyn: 'add' },
  { kind: 'permanent', rarity: 'mythic',    _dyn: 'add' },

  // One-shot Echo bleeds, scaled to current rate. Common/uncommon/rare are
  // modest top-ups; legendary is a noticeable jump; mythic is a windfall.
  { kind: 'gift', rarity: 'common',    _dyn: 'gift' },
  { kind: 'gift', rarity: 'uncommon',  _dyn: 'gift' },
  { kind: 'gift', rarity: 'rare',      _dyn: 'gift' },
  { kind: 'gift', rarity: 'legendary', _dyn: 'gift' },
  { kind: 'gift', rarity: 'mythic',    _dyn: 'gift' },

  // Multiplicative permanents — weak mults phase out, strong ones unlock later.
  { id: 'mult_starter',   kind: 'permanent', rarity: 'common',    permType: 'mul',
    name: 'Adaptive Filter', desc: 'The first lesson: throw away noise. ×1.5 rate.',
    value: 1.5,  baseCost: 50,     growth: 3,                          maxRate: 500 },
  { id: 'mult5',          kind: 'permanent', rarity: 'common',    permType: 'mul',
    name: 'Refined Filter',  desc: 'Tighter noise floor. ×1.05 rate.',
    value: 1.05, baseCost: 250,    growth: 2.5,                        maxRate: 2000 },
  { id: 'mult10',         kind: 'permanent', rarity: 'uncommon',  permType: 'mul',
    name: 'Side-Channel Decode', desc: 'Listen between the bands. ×1.1 rate.',
    value: 1.1,  baseCost: 1500,   growth: 4,      minRate: 200,       maxRate: 50000 },
  { id: 'mult25',         kind: 'permanent', rarity: 'uncommon',  permType: 'mul',
    name: 'Spread-Spectrum',     desc: 'Signal is everywhere; the decoder is patient. ×1.25 rate.',
    value: 1.25, baseCost: 8000,   growth: 4,      minRate: 2000 },
  { id: 'mult33',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: 'Phase Lock',          desc: 'The carrier holds. ×1.33 rate.',
    value: 1.33, baseCost: 25000,  growth: 4.5,    minRate: 8000 },
  { id: 'mult50',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: 'Compression Codec',   desc: 'Same line, half the bandwidth. ×1.5 rate.',
    value: 1.5,  baseCost: 150000, growth: 5,      minRate: 50000 },
  { id: 'mult75',         kind: 'permanent', rarity: 'rare',      permType: 'mul',
    name: 'Predictive Decode',   desc: 'The system finishes the sentence for you. ×1.75 rate.',
    value: 1.75, baseCost: 1.5e6,  growth: 5,      minRate: 1e6 },
  { id: 'mult_two',       kind: 'permanent', rarity: 'legendary', permType: 'mul',
    name: 'Subspace Tap',        desc: 'The grid leaks. You drink. ×1.75 rate.',
    value: 1.75, baseCost: 1e8,    growth: 7,      minRate: 1e7 },
  { id: 'mult_three',     kind: 'permanent', rarity: 'legendary', permType: 'mul',
    name: 'FTL Sideband',        desc: 'The fast lane, half-legal. ×2.2 rate.',
    value: 2.2,  baseCost: 1e10,   growth: 9,      minRate: 1e9 },
  { id: 'mult_five',      kind: 'permanent', rarity: 'mythic',    permType: 'mul',
    name: 'Forbidden Codec',     desc: 'Whoever wrote this codec was not Union. ×2.5 rate.',
    value: 2.5,  baseCost: 1e13,   growth: 12,     minRate: 1e11 },

  // Seed Relays were overshadowing every other lever past trillions — one
  // conglomerate or empire could leapfrog a full slate of additive permanents.
  // pctCost is 1/7 of the prior values (cheaper to invoke) and the per-rarity
  // CONVERT_BOOST_CAP below is 1/10, so the ceiling on what a single convert
  // can add to the rate is correspondingly tighter.
  // Convert tokens are placement-only now — the burn-cost queues a Seed Relay
  // you drop on a hex in the Network screen. Yield = cost × ratio at buy
  // time, captured on the token. The relay ripens, then carries until ComDef
  // finds it. Sector you place into decides yield/discovery/ripen multipliers.
  { id: 'tip_jar',   kind: 'convert', rarity: 'common',
    name: 'Loose Cable', desc: 'Field antenna kit. Burn ~0.7% balance to queue placement.',
    pctCost: 0.05 / 7, ratio: 0.0002 },
  { id: 'side_gig',  kind: 'convert', rarity: 'uncommon',
    name: 'Hidden Antenna', desc: 'Yagi-class array, off-books. Burn ~1.4% to queue placement.',
    pctCost: 0.10 / 7, ratio: 0.001 },
  { id: 'franchise', kind: 'convert', rarity: 'rare',
    name: 'Buried Array', desc: 'A real phased installation. Burn ~3.6% to queue placement.',
    pctCost: 0.25 / 7, ratio: 0.004 },
  { id: 'empire',    kind: 'convert', rarity: 'legendary',
    name: 'Forbidden Network', desc: 'Deep-sky listener; pick a quiet hex. Burn ~14% to queue placement.',
    pctCost: 1.0 / 7,  ratio: 0.01 },
  { id: 'vending',   kind: 'convert', rarity: 'common',
    name: 'Seed Coil', desc: 'A coil you bury and forget. Burn ~0.3% to queue placement.',
    pctCost: 0.02 / 7, ratio: 0.00006 },
  { id: 'kiosk',     kind: 'convert', rarity: 'uncommon',
    name: 'Quiet Outpost', desc: 'A small staffed listening post. Burn ~1% to queue placement.',
    pctCost: 0.07 / 7, ratio: 0.0005 },
  { id: 'conglomerate', kind: 'convert', rarity: 'rare',
    name: 'Distributed Mesh', desc: 'Redundant phased mesh. Burn ~7% to queue placement.',
    pctCost: 0.5 / 7,  ratio: 0.0075 },

  // Drift — "while-you-are-away" multipliers. Only apply over the offline
  // integral (see save.js); foreground rate is unchanged. Cheap early, costly
  // late — these compound multiplicatively into state.offlineMul.
  { id: 'drift_starter', kind: 'drift', rarity: 'common',
    name: 'Quiet Hours',  desc: 'The rig listens cleaner while you are not at it. ×1.10 to offline gain.',
    value: 1.10, baseCost: 800,    growth: 3,   maxRate: 20000 },
  { id: 'drift_band',    kind: 'drift', rarity: 'common',
    name: 'Night Band',   desc: 'A cleaner carrier when the city sleeps. ×1.15 to offline gain.',
    value: 1.15, baseCost: 5000,   growth: 3.5, maxRate: 100000 },
  { id: 'drift_lock',    kind: 'drift', rarity: 'uncommon',
    name: 'Drift Lock',   desc: 'Lock the carrier on the band you left tuned. ×1.25 to offline gain.',
    value: 1.25, baseCost: 50000,  growth: 4,   minRate: 5000 },
  { id: 'drift_vigil',   kind: 'drift', rarity: 'rare',
    name: 'Patient Listener', desc: 'You return to numbers you did not earn awake. ×1.50 to offline gain.',
    value: 1.50, baseCost: 1.5e6,  growth: 5,   minRate: 5e4 },
  { id: 'drift_codec',   kind: 'drift', rarity: 'legendary',
    name: 'Vigil Codec',  desc: 'A codec tuned for absence. ×2.0 to offline gain.',
    value: 2.0,  baseCost: 5e8,    growth: 7,   minRate: 1e6 },
  { id: 'drift_sieve',   kind: 'drift', rarity: 'mythic',
    name: 'Pre-Echo Sieve', desc: 'Whoever wrote this filter was not Union. ×3.0 to offline gain.',
    value: 3.0,  baseCost: 5e11,   growth: 10,  minRate: 1e9 },
];

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
// flatBonus delta can never exceed CAP × baseAdditive. Caps are 1/10 of the
// previous tuning — yellow upgrades were overshadowing every other lever once
// production climbed past trillion. A single convert is now meant to chip in,
// not leapfrog the entire build.
export const CONVERT_BOOST_CAP = { common: 0.01, uncommon: 0.04, rare: 0.15, legendary: 0.5 };

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
