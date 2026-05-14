import {
  WORLD_FOR_INTERSTITIAL, recordContact, saveContactLog, getRun,
} from './contactLog.js';

// Staging id for the one-shot First Contact beat. Queued *before* the very
// first contact-bearing interstitial in a player's history, with the same
// world image rendered to frame what is about to happen.
export const FIRST_CONTACT_ID = 'first_contact';

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
  // voice: Narrator → Sera. Fires once *ever*, immediately before the first
  // contact-bearing interstitial in a player's history. The moment Kalen
  // first reaches anyone is when the loop reveals itself; we let it breathe.
  // The UI looks up state.messages.stats.firstContactWorld to render the
  // accompanying world image and name.
  first_contact: {
    steps: [
      { text: 'First contact.',                                            autoMs: 1800 },
      { text: 'A world returned your carrier. They heard something out there.', autoMs: 2400 },
      { text: 'Their name goes on the log. The log does not forget.' },
    ],
  },

  // voice: Narrator (step 1), Kalen (steps 2-5). Fresh-game cold open.
  // Step 1 auto-advances — the tagline functions as the boot screen.
  // Steps 2-5 layer in: Kalen's name + situation, what Echoes are, what the
  // rig does, and a soft hand-off to the loop. No info-dump; each beat is
  // one short Kalen sentence with a qualifier.
  welcome: {
    steps: [
      { text: 'The dark was never silent.', autoMs: 2400 },
      { text: 'My name is Kalen Vale. I am a Union comms engineer. I should not be doing this.' },
      { text: 'There are worlds out there the Quiet Law says I cannot speak to. I have been speaking to them for eleven years.' },
      { text: 'Every signal that comes back is an Echo. The rig in front of me counts them.' },
      { text: 'You can leave the Console open. The Echoes keep arriving.' },
    ],
  },

  // voice: Sera. The "how do I play" beat. Fires ~10s after the player has
  // seen the welcome set on their very first session. Coaches the loop in
  // theme: the rig listens on its own, the Console opens at 100 Echoes, the
  // bands are how Kalen acts on the carrier. Sera speaks *to* Kalen — second
  // person, procedural, periods. Never breaks the fourth wall.
  tutorial_open: {
    steps: [
      { text: 'The rig is on the carrier. It will pull Echoes whether you sit at the desk or not.' },
      { text: 'Watch the number rise. That is your log. At one hundred, the Console will open under it.' },
      { text: 'The Console offers bands. Each band is one thing the rig can do this minute. Buy the cheap ones first; they lift your listening yield.' },
      { text: 'Some bands are hails. They wager Echoes for the chance of a return. Most hails carry nothing. Some carry a great deal.' },
      { text: 'Sit at the desk, Kalen. We will see what answers.' },
    ],
  },

  // voice: Kalen. Fires the first time the Console boots into a new cycle
  // (run > 1 with a fresh save). Gated by stats.lastCycleOpener so the same
  // cycle does not replay it on reload — but the entry persists in
  // `shown` only via the stats gate, mirroring sera_interrogation_open.
  cycle_open: {
    repeat: true,
    steps: [
      { text: 'The console boots. I have been here before.' },
      { text: (s) => {
        const n = s.contactLog && Array.isArray(s.contactLog.worlds) ? s.contactLog.worlds.length : 0;
        return `Cycle ${getRun(s.contactLog)}. The names remain — ${n} of them, on the heavier carrier.`;
      } },
      { text: 'I start the listening.' },
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

  // voice: Kalen. First time the player closes a cycle and banks Carrier Mass
  // under the new prestige system. The "weight" line refers to the new
  // currency literally — Mass, in kg, accreted into the rig.
  first_cycle_close: {
    steps: [
      { text: 'The rig has weight now. It did not before.' },
      { text: 'Sera once told me a carrier accretes — every push leaves a little of itself on the hardware.' },
      { text: 'I did not believe her. The numbers on the bench say I should.' },
      { text: 'I can cut this weight into the frame. The next cycle will remember.' },
    ],
  },

  // voice: Sera. First Carrier Engraving purchased. Sera reads the rig
  // and gets the answer she was always going to get.
  first_engraving: {
    steps: [
      { text: 'You cut something into the frame today.' },
      { text: 'The mass spectrometer reads it as your handwriting. Three grams, by my count.' },
      { text: 'Tell me what you wrote.' },
    ],
  },

  // voice: Sera. Once per cycle from cycle 4 onward. The interrogation
  // grows with the log — Sera reads from it directly, names and all. By
  // cycle 4 the run-history has weight: more names, more questions, more
  // silence between them. `repeat` so it can fire again next cycle; gated
  // by stats.lastSeraCycle so it never fires twice in the same run.
  sera_interrogation_open: {
    repeat: true,
    steps: [
      { text: (s) => `Cycle ${getRun(s.contactLog)}. The file is heavier than it was.` },
      { text: (s) => {
        const n = (s.contactLog && s.contactLog.worlds.length) || 0;
        return `I have ${n} name${n === 1 ? '' : 's'} on your log.`;
      } },
      { text: (s) => {
        // Most recent first, take up to three names, fall back gracefully.
        const ws = (s.contactLog && s.contactLog.worlds) || [];
        const recent = ws.slice().sort((a, b) => (b.contactedAt || 0) - (a.contactedAt || 0)).slice(0, 3);
        const names = recent.map((w) => w.name);
        if (names.length === 0) return 'And not one of them is forgotten.';
        if (names.length === 1) return `${names[0]}. I would like to start there.`;
        if (names.length === 2) return `${names[0]}. ${names[1]}. In that order, I think.`;
        return `${names[0]}. ${names[1]}. ${names[2]}. We will take them in that order.`;
      } },
      { text: 'Walk me through the part where you said this would be the last one.' },
    ],
  },
};

export const MILESTONE_THRESHOLDS = [
  { id: 'milestone_1k',  at: 1e3 },
  { id: 'milestone_1m',  at: 1e6 },
  { id: 'milestone_1b',  at: 1e9 },
  { id: 'milestone_1t',  at: 1e12 },
  { id: 'milestone_1qa', at: 1e15 },
  { id: 'milestone_1qi', at: 1e18 },
];

// Returns the next contact-bearing milestone the player has not yet hit, or
// null if every one has fired. Contact Log UI surfaces this as a clear
// "next contact at X Echoes" indicator at the top of the panel.
export function nextContactMilestone(state) {
  const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || 0;
  for (const m of MILESTONE_THRESHOLDS) {
    if (!WORLD_FOR_INTERSTITIAL[m.id]) continue;
    if (peak < m.at) return m;
  }
  return null;
}

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
  const isContact = !!(state.contactLog && WORLD_FOR_INTERSTITIAL[id]);
  // Stage the one-shot First Contact beat just *before* the very first
  // contact-bearing interstitial in the player's history. It announces what
  // the loop is. After this fires once, the flag persists in the contact log
  // (which survives save resets), so it never replays.
  if (isContact && !state.contactLog.firstContactSeen && !m.shown[FIRST_CONTACT_ID]
      && !m.queue.includes(FIRST_CONTACT_ID)) {
    state.contactLog.firstContactSeen = true;
    // The UI looks this up to render the *correct* world image for the
    // accompanying first-contact beat — it should match what's coming next.
    m.stats.firstContactWorld = id;
    m.queue.push(FIRST_CONTACT_ID);
    saveContactLog(state.contactLog);
  }
  m.queue.push(id);
  // If this interstitial corresponds to a contacted world, add it to the
  // persistent Contact Log immediately. The log is the prestige currency —
  // it must reflect the *act* of contact, not the player reading the beat.
  if (isContact) {
    if (recordContact(state.contactLog, id, Date.now() / 1000)) {
      saveContactLog(state.contactLog);
    }
  }
  return true;
}

// Tutorial timing — fire ~10s after `welcome` finishes. Long enough for the
// last Kalen line to land; short enough that the player hasn't started to
// wonder whether anything else happens.
const TUTORIAL_DELAY_MS = 10000;
let tutorialTimer = null;

// Schedules the in-theme "how do I play" beat to fire after welcome closes.
// Idempotent: a second call while a timer is pending is a no-op. Gated on
// welcome having been shown, tutorial_open not yet shown, and the player
// being on cycle 1 — returning players in cycle 2+ already know the loop.
export function scheduleTutorialIfEligible(state) {
  if (tutorialTimer != null) return;
  const m = state.messages;
  if (!m || !m.shown || !m.shown.welcome) return;
  if (m.shown.tutorial_open) return;
  if (getRun(state.contactLog) !== 1) return;
  tutorialTimer = setTimeout(() => {
    tutorialTimer = null;
    // Re-check at fire time — the player may have already crossed the gate
    // some other way (devtools, save edit) between schedule and fire.
    if (state.messages.shown.tutorial_open) return;
    enqueue(state, 'tutorial_open');
  }, TUTORIAL_DELAY_MS);
}

// Call once on game start. Welcome only fires for fresh players. If the player
// drifted away for >OFFLINE_RETURN_S seconds, queue a soft return beat.
// From cycle 4 onward, queue the Sera-heavy interrogation opener once per cycle.
export function checkStart(state, isFreshPlayer, offlineSeconds) {
  const run = getRun(state.contactLog);
  const s = state.messages.stats;
  // Welcome only on the very first boot (cycle 1, no save). Subsequent
  // cycles get the cycle_open beat instead, which knows about the log.
  if (isFreshPlayer && run === 1) enqueue(state, 'welcome');
  else if (isFreshPlayer && run > 1 && (s.lastCycleOpener || 0) < run) {
    s.lastCycleOpener = run;
    delete state.messages.shown.cycle_open;
    enqueue(state, 'cycle_open');
  } else if ((offlineSeconds || 0) >= OFFLINE_RETURN_S) enqueue(state, 'offline_returner');
  if (run >= 4 && (s.lastSeraCycle || 0) < run) {
    s.lastSeraCycle = run;
    // The shown-map prevents enqueue() from re-running a non-repeat interstitial;
    // since this one carries `repeat: true`, the stats gate above is what
    // enforces "once per cycle".
    delete state.messages.shown.sera_interrogation_open;
    enqueue(state, 'sera_interrogation_open');
  }
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

// Call when a Carrier Engraving is purchased. Fires the first-engraving beat
// exactly once *ever* — gated on the contact log so it survives reloads even
// though messages.shown is gameplay-save state. The log already persists
// engravings; an "ever bought one" flag rides on the same record.
export function checkEngraving(state, _id) {
  const log = state.contactLog;
  if (!log) return;
  if (log.firstEngravingSeen) return;
  log.firstEngravingSeen = true;
  enqueue(state, 'first_engraving');
}

// Called from main on cycle open. If the player has prestiged before but the
// first-close beat has not yet shown (the close itself wipes the gameplay
// save, so we use the log to gate this), queue it now.
export function enqueueFirstCloseBeat(state) {
  const log = state.contactLog;
  if (!log) return;
  if (log.firstCloseBeatShown) return;
  log.firstCloseBeatShown = true;
  enqueue(state, 'first_cycle_close');
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
