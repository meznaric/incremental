import {
  worldFor, recordContact, saveContactLog, getRun,
  activeEp, allEpsComplete,
} from './contactLog.js';
import { WORLDS_BY_EP } from './worlds.js';
import { EP_INTERSTITIALS } from './episodes.js';

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
//   { text: '…'              }  // any step. Non-final steps auto-advance after
//                                // the typewriter + a text-length-derived dwell
//                                // (see DWELL_* in interstitialUi.js). The
//                                // *final* step never auto-advances; the player
//                                // dismisses it with tap / space / enter / Esc.
//   { text: '…', italic: true } // render in italic — reserved for voice: A
//
// Note: legacy `autoMs` fields on existing entries are now ignored — pacing is
// computed from word count so short lines stay snappy and long lines breathe.
//
// `repeat: true` lets a message fire more than once.
//
// Each EP defines ten milestones plus a cycle_open beat. The active EP is
// resolved from the contact log (first incomplete EP), so closing a cycle
// early continues the same EP next time with only the remaining names
// available. bindEpisode() rewrites the rotating entries in INTERSTITIALS
// at startup and on every cycle.

const BASE_INTERSTITIALS = {
  // voice: Narrator → Sera. Fires once *ever*, immediately before the first
  // contact-bearing interstitial in a player's history. The moment Kalen
  // first reaches anyone is when the loop reveals itself; we let it breathe.
  first_contact: {
    steps: [
      { voice: 'N', text: 'First contact.',                                                 autoMs: 1800 },
      { voice: 'S', text: 'A world returned your carrier. They heard something out there.', autoMs: 2400 },
      { voice: 'S', text: 'Their name goes on the log. The log does not forget.' },
    ],
  },

  // voice: Narrator (step 1), Kalen (steps 2-5). Fresh-game cold open.
  welcome: {
    bgImage: './docs/lore/images/console-dark.png',
    steps: [
      { voice: 'N', text: 'The dark was never silent.', autoMs: 2400 },
      { voice: 'K', text: 'My name is Kalen Vale. I am a Union comms engineer. I should not be doing this.' },
      { voice: 'K', text: 'There are worlds out there the Quiet Law says I cannot speak to. I have been speaking to them for eleven years.' },
      { voice: 'K', text: 'Every signal that comes back is an Echo. The rig in front of me counts them.' },
      { voice: 'K', text: 'You can leave the Console open. The Echoes keep arriving.' },
    ],
  },

  // voice: Sera. The "how do I play" beat. Fires ~10s after welcome on the
  // player's very first session.
  tutorial_open: {
    bgImage: './docs/lore/images/console-bands.png',
    steps: [
      { voice: 'S', text: 'The rig is on the carrier. It will pull Echoes whether you sit at the desk or not.' },
      { voice: 'S', text: 'Watch the number rise. That is your log. At one hundred, the Console will open under it.' },
      { voice: 'S', text: 'The Console offers bands. Each band is one thing the rig can do this minute. Buy the cheap ones first; they lift your listening yield.' },
      { voice: 'S', text: 'Some bands are hails. They wager Echoes for the chance of a return. Most hails carry nothing. Some carry a great deal.' },
      { voice: 'S', text: 'Sit at the desk, Kalen. We will see what answers.' },
    ],
  },

  // voice: Kalen. First time a Hail (gamble) fails.
  first_gamble: {
    bgImage: './docs/lore/images/carrier-empty-push.png',
    steps: [
      { voice: 'K', text: 'A push that does not carry is a push that never happened.' },
      { voice: 'K', text: 'Nothing came back. That is not bad luck.' },
      { voice: 'K', text: 'That is just how the medium is. Most signals die.' },
      { voice: 'K', text: 'I keep pushing anyway.' },
    ],
  },

  // voice: Sera. Ten failed hails on the log.
  tenth_loss: {
    steps: [
      { voice: 'S', text: 'I have counted ten failed hails on your log.' },
      { voice: 'S', text: 'That is not bad luck. That is a method.' },
      { voice: 'S', text: 'I would like to hear about the method.' },
    ],
  },

  // voice: Kalen. All-in hail wipes balance to zero.
  all_in_zero: {
    steps: [
      { voice: 'K', text: 'Every Echo I had. One push.' },
      { voice: 'K', text: 'Nothing came back. I cannot hear my own carrier any more.' },
      { voice: 'K', text: 'I will start again. Or I will not.' },
    ],
  },

  // voice: Kalen. First base-rate permanent purchase (a Relay Node).
  first_relay: {
    steps: [
      { voice: 'K', text: 'A relay of my own. Patched in. Listening.' },
      { voice: 'K', text: 'It hears nothing in particular. That is not the point.' },
    ],
  },

  // voice: Sera. First Seed Relay (convert) — a real, expensive commitment.
  first_convert: {
    steps: [
      { voice: 'S', text: 'You burned a coil today to plant a relay you will never see again.' },
      { voice: 'S', text: 'Walk me through the part where that was kindness.' },
    ],
  },

  // voice: Anonymous. Italic. One sentence. Rare.
  anomaly_threshold_1: {
    steps: [
      { voice: 'A', text: 'You were never alone at that desk.', italic: true },
    ],
  },

  // voice: Anonymous. Italic. One sentence. The second (and last) sting.
  anomaly_threshold_2: {
    steps: [
      { voice: 'A', text: 'Speak louder. They are almost ready.', italic: true },
    ],
  },

  // voice: Kalen. Returned after a long absence.
  offline_returner: {
    repeat: true,
    steps: [
      { voice: 'K', text: 'You came back.' },
      { voice: 'K', text: 'They kept arriving while you were gone.' },
    ],
  },

  // voice: Kalen. First cycle close.
  first_cycle_close: {
    bgImage: './docs/lore/images/rig-with-weight.png',
    steps: [
      { voice: 'K', text: 'The rig has weight now. It did not before.' },
      { voice: 'K', text: 'Sera once told me a carrier accretes — every push leaves a little of itself on the hardware.' },
      { voice: 'K', text: 'I did not believe her. The numbers on the bench say I should.' },
      { voice: 'K', text: 'I can cut this weight into the frame. The next cycle will remember.' },
    ],
  },

  // voice: Sera. First Carrier Engraving purchased.
  first_engraving: {
    bgImage: './docs/lore/images/engraving-handwriting.png',
    steps: [
      { voice: 'S', text: 'You cut something into the frame today.' },
      { voice: 'S', text: 'The mass spectrometer reads it as your handwriting. Three grams, by my count.' },
      { voice: 'S', text: 'Tell me what you wrote.' },
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
      { voice: 'N', text: 'Season 1 closed.',                                                       autoMs: 2400 },
      { voice: 'N', text: 'Eighty contacts on the log. Eight folders, all open on the desk.',       autoMs: 2800 },
      { voice: 'K', text: 'The cascade is broadcasting. We do not know to whom.',                   autoMs: 2600 },
      { voice: 'K', text: 'Sera tells me to sleep. She says tomorrow is — pending.',                autoMs: 2800 },
      { voice: 'A', text: 'The dark was never silent. It is louder now.', italic: true,             autoMs: 2800 },
      { voice: 'K', text: 'The rig stays on the carrier. The Echoes keep arriving.' },
    ],
  },

  // voice: Sera. Once per cycle from cycle 4 onward.
  sera_interrogation_open: {
    repeat: true,
    bgImage: './docs/lore/images/interrogation-cell.png',
    steps: [
      { voice: 'S', text: (s) => `Cycle ${getRun(s.contactLog)}. The file is heavier than it was.` },
      { voice: 'S', text: (s) => {
        const n = (s.contactLog && s.contactLog.worlds.length) || 0;
        return `I have ${n} name${n === 1 ? '' : 's'} on your log.`;
      } },
      { voice: 'S', text: (s) => {
        const ws = (s.contactLog && s.contactLog.worlds) || [];
        const recent = ws.slice().sort((a, b) => (b.contactedAt || 0) - (a.contactedAt || 0)).slice(0, 3);
        const names = recent.map((w) => w.name);
        if (names.length === 0) return 'And not one of them is forgotten.';
        if (names.length === 1) return `${names[0]}. I would like to start there.`;
        if (names.length === 2) return `${names[0]}. ${names[1]}. In that order, I think.`;
        return `${names[0]}. ${names[1]}. ${names[2]}. We will take them in that order.`;
      } },
      { voice: 'S', text: 'Walk me through the part where you said this would be the last one.' },
    ],
  },

  // Episode-rotated keys are layered in by bindEpisode() at boot. They are
  // declared here as placeholders so non-rotated callers do not crash before
  // bindEpisode() runs (e.g. unit tests that exercise enqueue() in isolation).
  cycle_open: { repeat: true, steps: [{ voice: 'K', text: 'The console boots. I have been here before.' }] },
};

// Public interstitials table. The static (cross-episode) entries live in
// BASE_INTERSTITIALS; bindEpisode() merges in the active EP's beats. The
// table is intentionally mutable — callers reach in by id every frame and
// must see the current cycle's content without re-importing.
export const INTERSTITIALS = { ...BASE_INTERSTITIALS };

// Speaker identity per voice. K/S get a portrait + name; N/A render no
// speaker frame (Narrator is authorial, Anonymous stays italic-only).
// Voice ids match the comments in episodes.js and BASE_INTERSTITIALS.
export const VOICE_META = {
  K: { name: 'Kalen', portrait: './docs/lore/images/kalen-portrait.png' },
  S: { name: 'Sera',  portrait: './docs/lore/images/sera-portrait.png'  },
  N: { name: '',      portrait: null },
  A: { name: '',      portrait: null },
};

// Resolve a step's voice: explicit `voice` on the step wins; otherwise
// inherit from the prior step; otherwise fall back to the most common
// voice ('K') so a missing tag never crashes the UI.
export function resolveStepVoice(steps, idx) {
  for (let i = Math.min(idx, steps.length - 1); i >= 0; i--) {
    const v = steps[i] && steps[i].voice;
    if (v) return v;
  }
  return 'K';
}

// All keys any EP block can contribute (cycle_open + milestones + filler
// beats). Computed once from the source so adding a new filler in an EP
// doesn't require updating this list.
const ROTATING_KEYS = (() => {
  const set = new Set(['cycle_open']);
  for (const block of Object.values(EP_INTERSTITIALS)) {
    for (const k of Object.keys(block)) set.add(k);
  }
  return Array.from(set);
})();

// Echo Loop cycle_open. Once every EP is complete, every subsequent cycle
// plays this beat instead of an EP's. No milestone interstitials are bound in
// Loop mode; the climb is a pure Mass grind.
// voice: Kalen. Numbered against the loop, not the cycle, so the player can
// see they've crossed the finale and are now in holding territory.
const LOOP_CYCLE_OPEN = {
  repeat: true,
  steps: [
    { voice: 'K', text: (s) => `Echo Loop ${Math.max(1, ((s.contactLog && s.contactLog.loopCycles) || 0) + 1)}. The desk is the desk.` },
    { voice: 'K', text: 'Sera is not in tonight. The rig is.' },
    { voice: 'K', text: 'I keep listening. The Resonance compounds.' },
  ],
};

// Within-EP continuation opener. Fires on a cycle that's resuming an EP the
// player closed early. The EP's own cycle_open is a *transition* beat ("the
// last folder closed, here's the next one") — wrong for a continuation, where
// the folder is still open. voice: Kalen.
const CONTINUATION_CYCLE_OPEN = {
  repeat: true,
  steps: [
    { voice: 'K', text: 'The folder is still open.' },
    { voice: 'K', text: 'We were not done with it.' },
  ],
};

// Swap in the active cycle's milestone interstitials. Called from main.js at
// startup with the contact log; if a cycle close happens inside the running
// app (the page reloads) the next boot will rebind here.
//
// EP is resolved from the log itself (first incomplete EP), not from the run
// counter. A cycle that closed early surfaces the same EP again with only
// the remaining names available. Once every EP's worlds are on the log,
// bindEpisode binds Loop-mode content (no milestones, loop opener).
export function bindEpisode(log) {
  for (const k of ROTATING_KEYS) {
    delete INTERSTITIALS[k];
  }
  // Back-compat: tests + early callers may pass a run number. Promote it to
  // a synthetic log so EP resolution still works.
  if (typeof log === 'number') log = { run: Math.floor(log), worlds: [] };
  if (!log) log = { run: 1, worlds: [] };
  if (allEpsComplete(log)) {
    INTERSTITIALS.cycle_open = LOOP_CYCLE_OPEN;
    return;
  }
  const ep = activeEp(log);
  const block = EP_INTERSTITIALS[ep] || {};
  for (const k of ROTATING_KEYS) {
    if (block[k]) INTERSTITIALS[k] = block[k];
  }
  // Detect EP continuation: at least one of this EP's worlds is already on
  // the log. The EP's transition opener narrates a *handoff between EPs*, so
  // it shouldn't fire on a continuation. Swap to a generic continuation beat.
  const epWorldIds = new Set(Object.values(WORLDS_BY_EP[ep] || {}).map((w) => w.id));
  const epHasContacts = (log.worlds || []).some((w) => epWorldIds.has(w.id));
  if (epHasContacts) INTERSTITIALS.cycle_open = CONTINUATION_CYCLE_OPEN;
}

// Bind on module load so the table is populated even before main.js wires up
// (e.g. unit tests). main.js calls bindEpisode again with the loaded log.
bindEpisode(null);

// Slot identifiers — positional, 10 per EP. Threshold *amounts* are computed
// per EP by thresholdsForEp() below; the same slot id (e.g. milestone_1k) is
// at 10^3 in EP1 but 10^4 in EP2, 10^5 in EP3, etc. The keys are kept as
// magnitude-style labels so existing logs (which carry them on world rows)
// continue to read cleanly.
export const MILESTONE_SLOT_IDS = [
  'milestone_1k',  'milestone_10k', 'milestone_100k',
  'milestone_1m',  'milestone_10m', 'milestone_100m',
  'milestone_1b',  'milestone_10b', 'milestone_100b',
  'milestone_1t',
];

// Per-EP thresholds. Each EP gets its own climb: the n-th EP starts at
// 10^(2+n) and contacts step n periods apart, so EP1 spans 10^3..10^12
// (current shape), EP2 spans 10^4..10^22, …, EP10 spans 10^12..10^102.
// The episodes themselves are sequential narrative arcs against an
// exponentially larger climb each time.
export function thresholdsForEp(ep) {
  const startExp = 2 + ep;
  const stepExp = ep;
  return MILESTONE_SLOT_IDS.map((id, i) => ({
    id,
    at: Math.pow(10, startExp + i * stepExp),
  }));
}

// Active EP's thresholds — what the player actually has on the climb right
// now. Loop mode (no active EP) returns an empty list so the contact-log UI
// renders no progress / pending entries.
export function currentMilestones(log) {
  const ep = activeEp(log);
  return ep == null ? [] : thresholdsForEp(ep);
}

// Returns the next contact-bearing milestone the player has not yet hit, or
// null if every one has fired in the current cycle. The Contact Log UI uses
// this both as the "next contact at X Echoes" indicator and as the gate for
// the green-pulse close-cycle affordance (null ⇒ cycle is full).
export function nextContactMilestone(state) {
  const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || 0;
  const ms = currentMilestones(state.contactLog);
  const contactedIds = new Set((state.contactLog && state.contactLog.worlds || []).map((w) => w.id));
  for (const m of ms) {
    const def = worldFor(state.contactLog, m.id);
    if (!def) continue;
    if (contactedIds.has(def.id)) continue; // already logged in a prior cycle
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

// Anonymous-fragment cues: low-magnitude triggers keyed to player *actions*
// (hails, mythic rolls, long-haul buys) rather than amount. Two thresholds —
// the first lands around Ep 5, the second around Ep 7. See bumpAnomaly.
const ANOMALY_THRESHOLDS = [
  { at: 25,  id: 'anomaly_threshold_1' },
  { at: 100, id: 'anomaly_threshold_2' },
];

// Offline accrual that earns the soft "you came back" beat.
const OFFLINE_RETURN_S = 12 * 60 * 60;

export function enqueue(state, id) {
  const m = state.messages;
  if (!INTERSTITIALS[id]) return false;
  if (m.shown[id] && !INTERSTITIALS[id].repeat) return false;
  if (m.queue.includes(id)) return false;
  const milestoneWorld = state.contactLog ? worldFor(state.contactLog, id) : null;
  const isContact = !!milestoneWorld;
  // EP-continuation guard: a cycle that closed early replays the same EP, so
  // milestone_X may resolve to a world that is *already* on the log. Skip the
  // beat in that case — the player has already heard it. Without this, the
  // typewriter would replay every name they've already collected each cycle.
  if (isContact && (state.contactLog.worlds || []).some((w) => w.id === milestoneWorld.id)) {
    return false;
  }
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
  // persistent Contact Log immediately. The log is the cycle-close currency —
  // it must reflect the *act* of contact, not the player reading the beat.
  if (isContact) {
    if (recordContact(state.contactLog, id, Date.now() / 1000)) {
      saveContactLog(state.contactLog);
      // Filler beats: enqueue a `filler_after_N` recap when the count of
      // logged worlds in this EP hits N (across all cycles, not just this
      // one). The EP's bound interstitials decide which N values exist;
      // missing keys are silently skipped. EP transition beats are the
      // cycle_open for the next EP, so we don't fire filler_after_10.
      const ep = milestoneWorld.ep;
      const epIds = new Set(Object.values(WORLDS_BY_EP[ep] || {}).map((w) => w.id));
      const epCount = state.contactLog.worlds.filter((w) => epIds.has(w.id)).length;
      if (epCount < 10) {
        const fillerKey = `filler_after_${epCount}`;
        if (INTERSTITIALS[fillerKey]) enqueue(state, fillerKey);
      }
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
// convert" beats, and to bump the anomaly counter on rare events. Pass the
// whole upgrade — we read kind, rarity, and (for long-haul buffs) group.
export function checkPurchase(state, u) {
  const s = state.messages.stats;
  if (u.kind === 'permanent') {
    s.permanentsBought = (s.permanentsBought || 0) + 1;
    if (s.permanentsBought === 1) enqueue(state, 'first_relay');
  } else if (u.kind === 'convert') {
    s.convertsBought = (s.convertsBought || 0) + 1;
    if (s.convertsBought === 1) enqueue(state, 'first_convert');
  }
  if (u.rarity === 'mythic') bumpAnomaly(state, 2);
  if (u.kind === 'buff' && u.group === 'long') bumpAnomaly(state, 1);
}

// Bumps the (in-state, in-narrative) anomaly counter and fires the first
// not-yet-shown Anonymous fragment when its threshold is crossed.
export function bumpAnomaly(state, by) {
  const s = state.messages.stats;
  s.anomaly = (s.anomaly || 0) + (by || 0);
  s.anomalyFiredIds = s.anomalyFiredIds || [];
  // Old saves carried a single boolean for threshold_1; promote it.
  if (s.anomalyFired && !s.anomalyFiredIds.includes('anomaly_threshold_1')) {
    s.anomalyFiredIds.push('anomaly_threshold_1');
  }
  for (const t of ANOMALY_THRESHOLDS) {
    if (s.anomaly < t.at) break;
    if (s.anomalyFiredIds.includes(t.id)) continue;
    s.anomalyFiredIds.push(t.id);
    enqueue(state, t.id);
    break; // never stack two stings in one bump
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

// Called from main on cycle open. If the player has closed a cycle before but
// the first-close beat has not yet shown (the close itself wipes the gameplay
// save, so we use the log to gate this), queue it now.
export function enqueueFirstCloseBeat(state) {
  const log = state.contactLog;
  if (!log) return;
  if (log.firstCloseBeatShown) return;
  log.firstCloseBeatShown = true;
  enqueue(state, 'first_cycle_close');
}

// Called from main on boot when the player has just crossed into Echo Loop
// mode (every EP's worlds are on the log). Fires the season-finale cinematic
// beat exactly once; the log carries the flag so a player who reloads mid-beat
// does not retrigger it.
export function enqueueSeasonCompleteBeat(state) {
  const log = state.contactLog;
  if (!log) return;
  if (log.seasonCompleteShown) return;
  if (!allEpsComplete(log)) return;
  log.seasonCompleteShown = true;
  enqueue(state, 'season_complete');
}

// Call from the tick loop. Cheap: just numeric compare against peak.
export function checkAmount(state, amount) {
  const s = state.messages.stats;
  if (amount <= (s.peakAmount || 0)) return;
  for (const m of currentMilestones(state.contactLog)) {
    if (amount >= m.at && (s.peakAmount || 0) < m.at) enqueue(state, m.id);
  }
  s.peakAmount = amount;
}
