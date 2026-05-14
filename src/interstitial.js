import {
  worldFor, recordContact, saveContactLog, getRun,
} from './contactLog.js';
import { EP_INTERSTITIALS, getActiveEp } from './episodes.js';

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
// Each run plays one episode (EP1..EP8). The milestone_* interstitials and
// the cycle_open beat are EP-scoped — bindEpisode() rewrites those entries
// in INTERSTITIALS at startup and whenever the run advances.

const BASE_INTERSTITIALS = {
  // voice: Narrator → Sera. Fires once *ever*, immediately before the first
  // contact-bearing interstitial in a player's history. The moment Kalen
  // first reaches anyone is when the loop reveals itself; we let it breathe.
  first_contact: {
    steps: [
      { text: 'First contact.',                                                 autoMs: 1800 },
      { text: 'A world returned your carrier. They heard something out there.', autoMs: 2400 },
      { text: 'Their name goes on the log. The log does not forget.' },
    ],
  },

  // voice: Narrator (step 1), Kalen (steps 2-5). Fresh-game cold open.
  welcome: {
    steps: [
      { text: 'The dark was never silent.', autoMs: 2400 },
      { text: 'My name is Kalen Vale. I am a Union comms engineer. I should not be doing this.' },
      { text: 'There are worlds out there the Quiet Law says I cannot speak to. I have been speaking to them for eleven years.' },
      { text: 'Every signal that comes back is an Echo. The rig in front of me counts them.' },
      { text: 'You can leave the Console open. The Echoes keep arriving.' },
    ],
  },

  // voice: Sera. The "how do I play" beat. Fires ~10s after welcome on the
  // player's very first session.
  tutorial_open: {
    steps: [
      { text: 'The rig is on the carrier. It will pull Echoes whether you sit at the desk or not.' },
      { text: 'Watch the number rise. That is your log. At one hundred, the Console will open under it.' },
      { text: 'The Console offers bands. Each band is one thing the rig can do this minute. Buy the cheap ones first; they lift your listening yield.' },
      { text: 'Some bands are hails. They wager Echoes for the chance of a return. Most hails carry nothing. Some carry a great deal.' },
      { text: 'Sit at the desk, Kalen. We will see what answers.' },
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

  // voice: Kalen. First cycle close.
  first_cycle_close: {
    steps: [
      { text: 'The rig has weight now. It did not before.' },
      { text: 'Sera once told me a carrier accretes — every push leaves a little of itself on the hardware.' },
      { text: 'I did not believe her. The numbers on the bench say I should.' },
      { text: 'I can cut this weight into the frame. The next cycle will remember.' },
    ],
  },

  // voice: Sera. First Carrier Engraving purchased.
  first_engraving: {
    steps: [
      { text: 'You cut something into the frame today.' },
      { text: 'The mass spectrometer reads it as your handwriting. Three grams, by my count.' },
      { text: 'Tell me what you wrote.' },
    ],
  },

  // voice: Narrator → Kalen → Anonymous. The Season 1 finale beat. Fires
  // once *ever*, on the first boot after the player closes cycle 8. Renders
  // through interstitialUi with the `it-season-finale` CSS class — full-bleed
  // background using the canonical "the-dark-was-never-silent" image, slower
  // fade, bigger type. The card is otherwise the same component so the
  // typewriter and click-to-advance affordances stay consistent.
  season_complete: {
    cssClass: 'it-season-finale',
    bgImage: './docs/lore/images/the-dark-was-never-silent.png',
    steps: [
      { text: 'Season 1 closed.',                                                       autoMs: 2400 },
      { text: 'Eighty contacts on the log. Eight folders, all open on the desk.',       autoMs: 2800 },
      { text: 'The cascade is broadcasting. We do not know to whom.',                   autoMs: 2600 },
      { text: 'Sera tells me to sleep. She says tomorrow is — pending.',                autoMs: 2800 },
      { text: 'The dark was never silent. It is louder now.', italic: true,             autoMs: 2800 },
      { text: 'The rig stays on the carrier. The Echoes keep arriving.' },
    ],
  },

  // voice: Sera. Once per cycle from cycle 4 onward.
  sera_interrogation_open: {
    repeat: true,
    steps: [
      { text: (s) => `Cycle ${getRun(s.contactLog)}. The file is heavier than it was.` },
      { text: (s) => {
        const n = (s.contactLog && s.contactLog.worlds.length) || 0;
        return `I have ${n} name${n === 1 ? '' : 's'} on your log.`;
      } },
      { text: (s) => {
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

  // Episode-rotated keys are layered in by bindEpisode() at boot. They are
  // declared here as placeholders so non-rotated callers do not crash before
  // bindEpisode() runs (e.g. unit tests that exercise enqueue() in isolation).
  cycle_open: { repeat: true, steps: [{ text: 'The console boots. I have been here before.' }] },
};

// Public interstitials table. The static (cross-episode) entries live in
// BASE_INTERSTITIALS; bindEpisode() merges in the active EP's beats. The
// table is intentionally mutable — callers reach in by id every frame and
// must see the current cycle's content without re-importing.
export const INTERSTITIALS = { ...BASE_INTERSTITIALS };

// Every EP defines this set of milestone slots plus a cycle_open beat.
// Listed once so bindEpisode() knows which keys to strip before layering in
// the next EP's content.
const ROTATING_KEYS = [
  'cycle_open',
  'milestone_1k',  'milestone_10k', 'milestone_100k',
  'milestone_1m',  'milestone_10m', 'milestone_100m',
  'milestone_1b',  'milestone_10b', 'milestone_100b',
  'milestone_1t',
];

// Echo Loop cycle_open. After the player closes Season 1 (cycle 8 → run 9),
// every subsequent cycle plays this beat instead of an EP's. No milestone
// interstitials are bound in Loop mode; the climb is a pure Mass grind.
// voice: Kalen. Numbered against the loop, not the cycle, so the player can
// see they've crossed the finale and are now in holding territory.
const LOOP_CYCLE_OPEN = {
  repeat: true,
  steps: [
    { text: (s) => `Echo Loop ${Math.max(1, getRun(s.contactLog) - 8)}. The desk is the desk.` },
    { text: 'Sera is not in tonight. The rig is.' },
    { text: 'I keep listening. The Resonance compounds.' },
  ],
};

// Swap in the active cycle's milestone interstitials. Called from main.js at
// startup with the run loaded from the Contact Log; if a cycle close happens
// inside the running app (the page reloads) the next boot will rebind here.
//
// Post-finale (run >= 9): only cycle_open is bound, no milestone beats —
// the player has seen them all, and Echo Loop mode is purposefully sparse.
export function bindEpisode(epOrRun) {
  for (const k of ROTATING_KEYS) {
    delete INTERSTITIALS[k];
  }
  const run = Number.isFinite(epOrRun) ? Math.floor(epOrRun) : 1;
  if (run >= 9) {
    INTERSTITIALS.cycle_open = LOOP_CYCLE_OPEN;
    return;
  }
  const ep = getActiveEp(run);
  const block = EP_INTERSTITIALS[ep] || {};
  for (const k of ROTATING_KEYS) {
    if (block[k]) INTERSTITIALS[k] = block[k];
  }
}

// Bind on module load so the table is populated even before main.js wires up
// (e.g. unit tests). main.js calls bindEpisode again with the loaded run.
bindEpisode(1);

// Thresholds for contact-bearing milestones. Each EP fills all ten slots with
// distinct worlds, so density is ten contacts per cycle: dense at the bottom
// of the climb (where the player needs the most feedback) and pacing out
// toward the climactic 1t beat.
export const MILESTONE_THRESHOLDS = [
  { id: 'milestone_1k',   at: 1e3  },
  { id: 'milestone_10k',  at: 1e4  },
  { id: 'milestone_100k', at: 1e5  },
  { id: 'milestone_1m',   at: 1e6  },
  { id: 'milestone_10m',  at: 1e7  },
  { id: 'milestone_100m', at: 1e8  },
  { id: 'milestone_1b',   at: 1e9  },
  { id: 'milestone_10b',  at: 1e10 },
  { id: 'milestone_100b', at: 1e11 },
  { id: 'milestone_1t',   at: 1e12 },
];

// Returns the next contact-bearing milestone the player has not yet hit, or
// null if every one has fired in the current cycle. The Contact Log UI uses
// this both as the "next contact at X Echoes" indicator and as the gate for
// the green-pulse close-cycle affordance (null ⇒ cycle is full).
export function nextContactMilestone(state) {
  const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || 0;
  for (const m of MILESTONE_THRESHOLDS) {
    if (!worldFor(state.contactLog, m.id)) continue;
    if (peak < m.at) return m;
  }
  return null;
}

// True once the player has crossed (or exceeded) every contact-bearing
// milestone in the current cycle. The contact log button blinks green and
// the close-cycle button gets a brighter style once this flips.
export function isCycleComplete(state) {
  return nextContactMilestone(state) === null;
}

// Anonymous-fragment cue: a low-magnitude trigger keyed to player *actions*
// (hails, mythic rolls, long-haul buys) rather than amount. See checkAnomaly.
const ANOMALY_AT = 25;

// Offline accrual that earns the soft "you came back" beat.
const OFFLINE_RETURN_S = 12 * 60 * 60;

export function enqueue(state, id) {
  const m = state.messages;
  if (!INTERSTITIALS[id]) return false;
  if (m.shown[id] && !INTERSTITIALS[id].repeat) return false;
  if (m.queue.includes(id)) return false;
  const isContact = !!(state.contactLog && worldFor(state.contactLog, id));
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
  // cycles get the cycle_open beat instead, which knows about the episode.
  if (isFreshPlayer && run === 1) enqueue(state, 'welcome');
  else if (isFreshPlayer && run > 1 && (s.lastCycleOpener || 0) < run) {
    s.lastCycleOpener = run;
    delete state.messages.shown.cycle_open;
    enqueue(state, 'cycle_open');
  } else if ((offlineSeconds || 0) >= OFFLINE_RETURN_S) enqueue(state, 'offline_returner');
  if (run >= 4 && (s.lastSeraCycle || 0) < run) {
    s.lastSeraCycle = run;
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

// Called from main on boot when the player has just crossed into Echo Loop
// mode (closed cycle 8 → run 9). Fires the season-finale cinematic beat
// exactly once; the log carries the flag so a player who reloads mid-beat
// does not retrigger it.
export function enqueueSeasonCompleteBeat(state) {
  const log = state.contactLog;
  if (!log) return;
  if (log.seasonCompleteShown) return;
  if (getRun(log) < 9) return;
  log.seasonCompleteShown = true;
  enqueue(state, 'season_complete');
}

// Call from the tick loop. Cheap: just numeric compare against peak.
export function checkAmount(state, amount) {
  const s = state.messages.stats;
  if (amount <= (s.peakAmount || 0)) return;
  for (const m of MILESTONE_THRESHOLDS) {
    if (amount >= m.at && (s.peakAmount || 0) < m.at) enqueue(state, m.id);
  }
  s.peakAmount = amount;
}
