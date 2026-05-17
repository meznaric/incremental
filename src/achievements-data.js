// Achievements catalogue. Static definitions — name, description, hint,
// category, and a `trigger` key. Evaluation happens in achievements.js: it
// reads counters off state / contactLog and unlocks any achievement whose
// trigger fires. Each id is stable across renames and never reused.
//
// Trigger schema (data-only — no functions, so the file stays a pure const):
//   { kind: 'cycle',       at: <run count>           } — log.run >= at
//   { kind: 'amount',      at: <peak Echoes>         } — peak amount >= at
//   { kind: 'episode',     ep: <1..8>                } — every world in EP is logged
//   { kind: 'season',      season: 1                 } — every EP 1..8 complete
//   { kind: 'flag',        flag: '<state-stats key>' } — messages.stats[flag] truthy
//   { kind: 'logFlag',     flag: '<contactLog key>'  } — contactLog[flag] truthy
//   { kind: 'buffCount',   at: <count>               } — N+ simultaneous active buffs
//
// Categories — display order matches CATEGORY_ORDER below.

export const CATEGORY_ORDER = ['cycles', 'episodes', 'numbers', 'mechanics', 'play'];

export const CATEGORY_LABELS = {
  cycles:    'Cycles',
  episodes:  'Episodes',
  numbers:   'Numbers',
  mechanics: 'The Rig',
  play:      'Play',
};

// Numeric tiers for the "Numbers" category. Each entry is one achievement —
// id, threshold, and the lore-leaning name. Tiers spaced roughly one full
// period apart so the player feels them land. Naming follows the periods
// table in src/periods-data.js (millions are 'm', etc).
const NUMBER_TIERS = [
  { id: 'echoes_1b',   at: 1e9,  name: 'A planet on the line',
    desc: 'Crossed one billion Echoes. A whole world\'s annual signal.' },
  { id: 'echoes_100b', at: 1e11, name: 'Sector-wide return',
    desc: 'Crossed one hundred billion Echoes. The carrier reads on every band in the sector.' },
  { id: 'echoes_1t',   at: 1e12, name: 'System saturation',
    desc: 'Crossed one trillion Echoes. The whole system is talking back.' },
  { id: 'echoes_1qa',  at: 1e15, name: 'Past the Quiet Relay',
    desc: 'Crossed one quadrillion Echoes. The rig is doing what no single Quiet Relay was rated for.' },
  { id: 'echoes_1qi',  at: 1e18, name: 'Beyond design budget',
    desc: 'Crossed one quintillion Echoes. The numbers belong to nobody.' },
  { id: 'echoes_1sp',  at: 1e24, name: 'Septillion-scale carrier',
    desc: 'Crossed one septillion Echoes. The dark is loud now.' },
  { id: 'echoes_1dc',  at: 1e33, name: 'Decillion crossing',
    desc: 'Crossed one decillion Echoes. The log has stopped trying to count this honestly.' },
  { id: 'echoes_1vi',  at: 1e63, name: 'Vigintillion crossing',
    desc: 'Crossed one vigintillion Echoes. A number the Union does not have a form for.' },
  { id: 'echoes_1tg',  at: 1e93, name: 'Trigintillion crossing',
    desc: 'Crossed one trigintillion Echoes. The rig is the loudest thing in this part of the sky.' },
  { id: 'echoes_1uqg', at: 1e132, name: 'Unquadragintillion crossing',
    desc: 'Crossed one unquadragintillion Echoes. The reading is the only thing the desk can hold.' },
];

const EPISODE_NAMES = {
  1: { name: 'Discovery cleared',     desc: 'Every world of Episode 1 — Discovery — is on the log.' },
  2: { name: 'The Sea Choir cleared', desc: 'Every world of Episode 2 — The Sea Choir — is on the log.' },
  3: { name: 'Sky Language cleared',  desc: 'Every world of Episode 3 — Sky Language — is on the log.' },
  4: { name: 'Fire Given cleared',    desc: 'Every world of Episode 4 — Fire Given — is on the log.' },
  5: { name: 'Perfect Garden cleared',desc: 'Every world of Episode 5 — Perfect Garden — is on the log.' },
  6: { name: 'Missing World cleared', desc: 'Every world of Episode 6 — Missing World — is on the log.' },
  7: { name: 'Echoes cleared',        desc: 'Every world of Episode 7 — Echoes — is on the log.' },
  8: { name: 'The Cascade cleared',   desc: 'Every world of Episode 8 — Finale — is on the log.' },
};

export const ACHIEVEMENTS = [
  // — Cycles —
  { id: 'cycle_1',   category: 'cycles',
    name: 'First close',
    desc: 'Closed one cycle. The log carried the names across.',
    hint: 'Close a cycle from the Contact Log.',
    trigger: { kind: 'cycle', at: 2 } },
  { id: 'cycle_10',  category: 'cycles',
    name: 'Ten cycles deep',
    desc: 'Closed ten cycles. The rig is wearing in.',
    hint: 'Close ten cycles.',
    trigger: { kind: 'cycle', at: 11 } },
  { id: 'cycle_100', category: 'cycles',
    name: 'A hundred closes',
    desc: 'Closed a hundred cycles. The desk is part of the room now.',
    hint: 'Close a hundred cycles.',
    trigger: { kind: 'cycle', at: 101 } },

  // — Episodes —
  ...Object.entries(EPISODE_NAMES).map(([ep, def]) => ({
    id: `ep${ep}_complete`, category: 'episodes',
    name: def.name, desc: def.desc,
    hint: `Log every world of Episode ${ep}.`,
    trigger: { kind: 'episode', ep: Number(ep) },
  })),
  { id: 'season1_complete', category: 'episodes',
    name: 'Season closed',
    desc: 'Every world of Season 1 is on the log. The cascade is named.',
    hint: 'Log every world across Episodes 1 through 8.',
    trigger: { kind: 'season', season: 1 } },

  // — Numbers —
  ...NUMBER_TIERS.map((t) => ({
    id: t.id, category: 'numbers',
    name: t.name, desc: t.desc,
    hint: 'Push the carrier into a new period.',
    trigger: { kind: 'amount', at: t.at },
  })),

  // — Mechanics ("The Rig") —
  // First permanent (a Relay Node). state.messages.stats.permanentsBought is
  // incremented by checkPurchase in interstitial.js — we read the same counter.
  { id: 'first_permanent', category: 'mechanics',
    name: 'A relay of my own',
    desc: 'Bought the first permanent rate upgrade. The carrier has a backbone now.',
    hint: 'Buy a permanent rate band.',
    trigger: { kind: 'flag', flag: 'permanentsBought' } },
  // First convert — queues a Seed Relay placement token.
  { id: 'first_seed', category: 'mechanics',
    name: 'First seed in the dark',
    desc: 'Burned a coil to queue a Seed Relay. The Network map opens.',
    hint: 'Buy a Seed Relay (convert) band.',
    trigger: { kind: 'flag', flag: 'convertsBought' } },
  // Mythic-rarity upgrade rolled or bought. mythic_seen is recorded by
  // achievements.js when checkPurchase sees a mythic rarity slot.
  { id: 'mythic_relay', category: 'mechanics',
    name: 'Mythic carrier',
    desc: 'A mythic-rarity band on the Console. The rig is humming above spec.',
    hint: 'See a mythic-rarity band in the Console.',
    trigger: { kind: 'flag', flag: 'mythicSeen' } },
  // Bleed drip from an isolated relay — main.js increments bleedDripsSeen.
  { id: 'isolated_bleed', category: 'mechanics',
    name: 'Isolated bleed',
    desc: 'Caught an isolated Seed Relay dripping Echoes on its own. Sparse pays back.',
    hint: 'Place a relay with no online neighbours and wait for the drip.',
    trigger: { kind: 'flag', flag: 'bleedDripsSeen' } },
  // First Carrier Engraving cut. Log-side flag so it survives cycle close.
  { id: 'first_engraving', category: 'mechanics',
    name: 'First cut',
    desc: 'Cut a Carrier Engraving into the rig. The metal remembers.',
    hint: 'Spend Carrier Mass on an Engraving.',
    trigger: { kind: 'logFlag', flag: 'firstEngravingSeen' } },

  // — Play —
  // 3+ buffs active simultaneously. main.js feeds the live buff count to
  // evaluateAchievements each tick, so a transient stack still latches.
  { id: 'boost_combo', category: 'play',
    name: 'Three on the wire',
    desc: 'Held three or more carrier windows open at the same time.',
    hint: 'Stack three windows at once.',
    trigger: { kind: 'buffCount', at: 3 } },
  // First Cycle Pattern selected. cyclePatterns sets contactLog.pattern when
  // the player picks; we read it once it goes from null to a string.
  { id: 'first_pattern', category: 'play',
    name: 'Pattern chosen',
    desc: 'Picked a Cycle Pattern. The next cycle has a shape.',
    hint: 'Choose a Pattern at the start of a new cycle.',
    trigger: { kind: 'logFlag', flag: 'patternEverChosen' } },
];

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
