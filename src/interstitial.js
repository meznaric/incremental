// Interstitial messages — lore beats keyed to in-game triggers.
// Voices: K (Kalen, first person), S (Sera, second person), N (Narrator, third
// person, rare), A (Anonymous, italic, ~once per season). See
// docs/lore/voice-and-tone.md for the rules.
//
// Step shape:
//   { text: '…'              }  // wait for click / space / tap
//   { text: '…', autoMs: 1400 } // auto-advance after typewriter + this many ms
//   { text: '…', italic: true } // render in italic — reserved for voice: A
//
// `repeat: true` lets a message fire more than once.
//
// Milestone interstitials are keyed by amount threshold *and* by run. The
// MILESTONE_EPISODES table maps (run → ep). The first run plays Episode 1
// beats; later runs (added when prestige ships) rotate in Episodes 2..8.

// Episode 1 — Discovery / Sea Choir / Sky Language / Fire Given / Perfect
// Garden / Echoes are the canonical S1 beats. Until prestige lands, every
// run reads from this table. Future:
//   MILESTONE_EPISODES = { 1: EP1, 2: EP2, ... }
//   active = MILESTONE_EPISODES[state.run] ?? EP1
// and copy under each milestone_* key swaps with `active`.
const EP1 = {
  // voice: Sera. Ep 1 — Discovery beat.
  milestone_1k: {
    steps: [
      { text: 'The first one. The desert.',     autoMs: 1400 },
      { text: 'You said his name to him.',      autoMs: 2000 },
    ],
  },
  // voice: Kalen. Ep 2 — Sea Choir beat.
  milestone_1m: {
    steps: [
      { text: 'They thought it was the ocean.', autoMs: 1400 },
      { text: 'I let them.',                    autoMs: 2000 },
    ],
  },
  // voice: Sera. Ep 3 — Sky Language beat.
  milestone_1b: {
    steps: [
      { text: 'Someone is amplifying you.',                       autoMs: 1400 },
      { text: 'I have not decided yet whether to tell you.',      autoMs: 2200 },
    ],
  },
  // voice: Kalen. Ep 4 — Fire Given beat.
  milestone_1t: {
    steps: [
      { text: 'Eight seconds.', autoMs: 1200 },
      { text: 'I watched.',     autoMs: 2200 },
    ],
  },
  // voice: Kalen. Ep 5 — Perfect Garden beat.
  milestone_1qa: {
    steps: [
      { text: 'That sentence is not mine.',           autoMs: 1400 },
      { text: 'I have listened to it forty-one times.', autoMs: 2000 },
    ],
  },
  // voice: Sera. Ep 7 — Echoes beat.
  milestone_1qi: {
    steps: [
      { text: 'The pattern is the route.',                 autoMs: 1200 },
      { text: 'Every triggered world rode the same nodes.', autoMs: 2200 },
    ],
  },
};

export const INTERSTITIALS = {
  // voice: Narrator (step 1), Kalen (steps 2-3). Fresh-game cold open.
  // Step 1 auto-advances — the tagline functions as the boot screen.
  welcome: {
    steps: [
      { text: 'The dark was never silent.', autoMs: 2400 },
      { text: 'They are out there. I have been listening for a long time.' },
      { text: 'You can leave the Console open. The Echoes keep arriving.' },
    ],
  },

  // voice: Kalen. First time a Hail (gamble) fails.
  first_gamble: {
    steps: [
      { text: 'A push that does not carry is a push that never happened.' },
      { text: 'Nothing came back. That is not bad luck.' },
      { text: 'That is just how the medium is. Most signals die.' },
      { text: 'I keep pushing anyway.' },
    ],
  },

  // voice: Sera. Ten failed hails on the log.
  tenth_loss: {
    steps: [
      { text: 'I have counted ten failed hails on your log.' },
      { text: 'That is not bad luck. That is a method.' },
      { text: 'I would like to hear about the method.' },
    ],
  },

  // voice: Kalen. All-in hail wipes balance to zero.
  all_in_zero: {
    steps: [
      { text: 'Every Echo I had. One push.' },
      { text: 'Nothing came back. I cannot hear my own carrier any more.' },
      { text: 'I will start again. Or I will not.' },
    ],
  },

  // voice: Narrator. End-state, currently fires at the magnitude cap (1e63).
  // When prestige ships this becomes the S1 finale beat, not the magnitude beat.
  end_vigintillion: {
    steps: [
      { text: 'Hundreds of young worlds, all at once, began to reach outward.' },
      { text: 'Too early. Too fast. Too loud.' },
      { text: 'Something is coming.' },
      { text: 'The dark was never silent.' },
    ],
  },

  // Episode-rotating milestone slots. Currently locked to EP1.
  ...EP1,

  // voice: Kalen. First base-rate permanent purchase (a Relay Node).
  first_relay: {
    steps: [
      { text: 'A relay of my own. Patched in. Listening.' },
      { text: 'It hears nothing in particular. That is not the point.' },
    ],
  },

  // voice: Sera. First Seed Relay (convert) — a real, expensive commitment.
  first_convert: {
    steps: [
      { text: 'You burned a coil today to plant a relay you will never see again.' },
      { text: 'Walk me through the part where that was kindness.' },
    ],
  },

  // voice: Anonymous. Italic. One sentence. Rare.
  anomaly_threshold_1: {
    steps: [
      { text: 'You were never alone at that desk.', italic: true },
    ],
  },

  // voice: Kalen. Returned after a long absence.
  offline_returner: {
    repeat: true,
    steps: [
      { text: 'You came back.' },
      { text: 'They kept arriving while you were gone.' },
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

// Anonymous-fragment cue: a low-magnitude trigger keyed to player *actions*
// (hails, mythic rolls, long-haul buys) rather than amount. See checkAnomaly.
// Bumped to fire once the player has clearly settled into the game.
const ANOMALY_AT = 25;

// Offline accrual that earns the soft "you came back" beat.
const OFFLINE_RETURN_S = 12 * 60 * 60;

export function enqueue(state, id) {
  const m = state.messages;
  if (!INTERSTITIALS[id]) return false;
  if (m.shown[id] && !INTERSTITIALS[id].repeat) return false;
  if (m.queue.includes(id)) return false;
  m.queue.push(id);
  return true;
}

// Call once on game start. Welcome only fires for fresh players. If the player
// drifted away for >OFFLINE_RETURN_S seconds, queue a soft return beat.
export function checkStart(state, isFreshPlayer, offlineSeconds) {
  if (isFreshPlayer) enqueue(state, 'welcome');
  else if ((offlineSeconds || 0) >= OFFLINE_RETURN_S) enqueue(state, 'offline_returner');
}

// Call after a gamble resolves. result: { won: bool, isAllIn: bool, balanceAfter: number }.
export function checkGamble(state, result) {
  const s = state.messages.stats;
  s.gambles = (s.gambles || 0) + 1;
  bumpAnomaly(state, 1);
  if (!result.won) {
    s.gambleLosses = (s.gambleLosses || 0) + 1;
    if (s.gambleLosses === 1) setTimeout(() => enqueue(state, 'first_gamble'), 1000);
    if (s.gambleLosses === 10) enqueue(state, 'tenth_loss');
    if (result.isAllIn && result.balanceAfter <= 0 && !s.allInLost) {
      s.allInLost = true;
      enqueue(state, 'all_in_zero');
    }
  }
}

// Call after any non-gamble purchase. Used to fire "first relay / first
// convert" beats, and to bump the anomaly counter on rare events.
export function checkPurchase(state, kind, rarity) {
  const s = state.messages.stats;
  if (kind === 'permanent') {
    s.permanentsBought = (s.permanentsBought || 0) + 1;
    if (s.permanentsBought === 1) enqueue(state, 'first_relay');
  } else if (kind === 'convert') {
    s.convertsBought = (s.convertsBought || 0) + 1;
    if (s.convertsBought === 1) enqueue(state, 'first_convert');
  }
  if (rarity === 'mythic') bumpAnomaly(state, 2);
}

// Bumps the (in-state, in-narrative) anomaly counter and fires a single
// Anonymous fragment when the threshold is crossed.
export function bumpAnomaly(state, by) {
  const s = state.messages.stats;
  s.anomaly = (s.anomaly || 0) + (by || 0);
  if (s.anomaly >= ANOMALY_AT && !s.anomalyFired) {
    s.anomalyFired = true;
    enqueue(state, 'anomaly_threshold_1');
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
