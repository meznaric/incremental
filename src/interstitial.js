// Interstitial messages: lore + milestone moments.
// Each message has steps[]; a step with `autoMs` advances itself after typewriter
// finishes + autoMs ms. Steps without autoMs wait for [space] / click.
// `repeat: true` lets a message fire more than once.

export const INTERSTITIALS = {
  welcome: {
    steps: [
      { text: 'This is a long game.' },
      { text: 'You won\'t finish today. Maybe not this year.' },
      { text: 'Close the tab whenever. Come back tomorrow — the number keeps climbing.' },
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
      { text: 'I told you.' },
      { text: 'Ten losses. That isn\'t bad luck.' },
      { text: 'It\'s just math.' },
    ],
  },

  all_in_zero: {
    steps: [
      { text: 'You really shouldn\'t gamble.' },
      { text: 'Everything you built — gone in one coin.' },
      { text: 'Begin again. Or don\'t.' },
    ],
  },

  end_vigintillion: {
    steps: [
      { text: 'Vigintillion.' },
      { text: 'That\'s the top number this game tracks.' },
      { text: 'However long it took, that\'s how long it took.' },
      { text: 'Begin again. Or don\'t.' },
    ],
  },

  milestone_1k: {
    steps: [
      { text: 'First thousand.', autoMs: 1400 },
      { text: 'Long way to go.', autoMs: 2000 },
    ],
  },
  milestone_1m: {
    steps: [
      { text: 'First million.', autoMs: 1400 },
      { text: 'Still early.', autoMs: 2000 },
    ],
  },
  milestone_1b: {
    steps: [
      { text: 'Billion.', autoMs: 1200 },
      { text: 'Keep coming back.', autoMs: 2000 },
    ],
  },
  milestone_1t: {
    steps: [
      { text: 'Trillion.', autoMs: 1200 },
      { text: 'Weeks in, probably.', autoMs: 2200 },
    ],
  },
  milestone_1qa: {
    steps: [
      { text: 'Quadrillion.', autoMs: 1200 },
      { text: 'Months now.', autoMs: 2000 },
    ],
  },
  milestone_1qi: {
    steps: [
      { text: 'Quintillion.', autoMs: 1200 },
      { text: 'Still a long way.', autoMs: 2000 },
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
