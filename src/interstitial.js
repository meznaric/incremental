// Interstitial messages: lore + milestone moments.
// Each message has steps[]; a step with `autoMs` advances itself after typewriter
// finishes + autoMs ms. Steps without autoMs wait for [space] / click.
// `repeat: true` lets a message fire more than once.

export const INTERSTITIALS = {
  welcome: {
    steps: [
      { text: 'A number begins at zero.' },
      { text: 'It can end at vigintillion. Crowned. Unfathomable.' },
      { text: 'Everything between is yours to shape — patient, reckless, brilliant. The choice is recorded.' },
    ],
  },

  first_gamble: {
    steps: [
      { text: 'Gambling is bad.' },
      { text: 'The odds are mathematically against you.' },
      { text: 'Avoid it.' },
      { text: '...unless you don\'t want to.' },
    ],
  },

  tenth_loss: {
    steps: [
      { text: 'I told you gambling is bad.' },
      { text: 'Ten losses now. That isn\'t noise.' },
      { text: 'That is math, doing what math does.' },
    ],
  },

  all_in_zero: {
    steps: [
      { text: 'You really shouldn\'t gamble.' },
      { text: 'Everything you built — gone in one coin.' },
      { text: 'Begin again. Or don\'t. The seat is still warm.' },
    ],
  },

  end_vigintillion: {
    steps: [
      { text: 'You reached the crown.' },
      { text: 'Vigintillion. The number cannot grow further here.' },
      { text: 'What did the climb cost you? What did it teach you?' },
      { text: 'Begin again, with everything you now know.' },
    ],
  },

  milestone_1k: {
    steps: [
      { text: 'First thousand.', autoMs: 1400 },
      { text: 'A small number. The first one with a name.', autoMs: 2200 },
    ],
  },
  milestone_1m: {
    steps: [
      { text: 'First million.', autoMs: 1400 },
      { text: 'From here, digits stop counting and start naming themselves.', autoMs: 2400 },
    ],
  },
  milestone_1b: {
    steps: [
      { text: 'Billion.', autoMs: 1200 },
      { text: 'Three more zeroes than a moment ago.', autoMs: 2200 },
    ],
  },
  milestone_1t: {
    steps: [
      { text: 'Trillion.', autoMs: 1200 },
      { text: 'National-budget scale. Casual now.', autoMs: 2400 },
    ],
  },
  milestone_1qa: {
    steps: [
      { text: 'Quadrillion.', autoMs: 1200 },
      { text: 'More than the grains of sand on most beaches.', autoMs: 2400 },
    ],
  },
  milestone_1qi: {
    steps: [
      { text: 'Quintillion.', autoMs: 1200 },
      { text: 'Star-counting territory.', autoMs: 2200 },
    ],
  },
};

const MILESTONE_THRESHOLDS = [
  { id: 'milestone_1k',  at: 1e3 },
  { id: 'milestone_1m',  at: 1e6 },
  { id: 'milestone_1b',  at: 1e9 },
  { id: 'milestone_1t',  at: 1e12 },
  { id: 'milestone_1qa', at: 1e15 },
  { id: 'milestone_1qi', at: 1e18 },
];

const END_THRESHOLD = 1e63;

export function enqueue(state, id) {
  const m = state.messages;
  if (!INTERSTITIALS[id]) return false;
  if (m.shown[id] && !INTERSTITIALS[id].repeat) return false;
  if (m.queue.includes(id)) return false;
  m.queue.push(id);
  return true;
}

// Call once on game start. Welcome only fires for fresh players.
export function checkStart(state, isFreshPlayer) {
  if (isFreshPlayer) enqueue(state, 'welcome');
}

// Call after a gamble resolves. result: { won: bool, isAllIn: bool, balanceAfter: number }.
export function checkGamble(state, result) {
  const s = state.messages.stats;
  s.gambles = (s.gambles || 0) + 1;
  if (s.gambles === 1) enqueue(state, 'first_gamble');
  if (!result.won) {
    s.gambleLosses = (s.gambleLosses || 0) + 1;
    if (s.gambleLosses === 10) enqueue(state, 'tenth_loss');
    if (result.isAllIn && result.balanceAfter <= 0 && !s.allInLost) {
      s.allInLost = true;
      enqueue(state, 'all_in_zero');
    }
  }
}

// Call from the tick loop. Cheap: just numeric compare against peak.
export function checkAmount(state, amount) {
  const s = state.messages.stats;
  if (amount <= (s.peakAmount || 0)) return;
  for (const m of MILESTONE_THRESHOLDS) {
    if (amount >= m.at && (s.peakAmount || 0) < m.at) enqueue(state, m.id);
  }
  if (amount >= END_THRESHOLD && (s.peakAmount || 0) < END_THRESHOLD) {
    enqueue(state, 'end_vigintillion');
  }
  s.peakAmount = amount;
}
