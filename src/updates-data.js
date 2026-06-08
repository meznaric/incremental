// Player-facing changelog. Newest first. Each entry:
//
//   { date: 'YYYY-MM-DD', title, body, highlight? }
//
// `body` is one or two short sentences written for a returning player —
// not a commit message, not a diff summary. Skip "fix typo" / refactor /
// internal plumbing entries: only include things a returning player will
// notice or care about. Set `highlight: true` for a major update; renders
// with extra emphasis.
//
// **Update this file before pushing.** See CLAUDE.md → "Player-facing
// changelog". `currentUpdateDate()` reads the topmost entry, so the value
// also surfaces as the displayed version in the Updates modal.

export const UPDATES = [
  {
    date: '2026-06-08',
    title: 'Anchor your relays — lock, amplify, scale',
    body: 'Seed Relays no longer fade behind your progress: a placed relay now holds a fixed share of your base, so its output climbs as you grow instead of going stale before it even ripens. The shop card now reads that share as a percentage of base rate, not a flat per-second figure that lied the moment your base moved. Once a relay ripens you can drive Anchors into it — the first one hides it from ComDef for good, and every anchor amplifies its carrier. Rarer relays anchor deeper (commons can\'t anchor at all), building a glowing pyramid on the cell. Break a relay down any time to relocate it and recover half the Echoes you spent anchoring.',
    highlight: true,
  },
  {
    date: '2026-06-01',
    title: 'Buy in bulk, and clearer active windows',
    body: 'Base relay cards now carry ×10 / ×100 / ×1K / ×10K and Max chips once you can afford a stack — buy a thousand in one tap instead of a thousand taps. Active-window readouts no longer clip huge numbers: a stacked Carrier reads ×390.62 K and the tiles grow to fit, the combined Buffer now shows the real capped refund it pays back, and you can scroll a crowded window stack sideways.',
  },
  {
    date: '2026-05-31',
    title: 'A kinder Hail, cleaner runs, and a full transcript',
    body: 'The Buffer now cushions a failed Hail far better, and each Hail card shows the return you actually get if it lands — the redundant price is gone. Lose one and you will see exactly how many Echoes the Buffer pulled back; lose too many in a row and a voice finally says something. New Cycle Patterns like True North reshape each run, the Mythic band unlocks as it should, and four new clean-run achievements reward reaching high signal without a single Hail or Window. Console and Carrier Mass per cycle are doubled. Open Names for a new Log tab holding every word ever exchanged, plus a live signal readout that blooms into a waveform when you are at your strongest.',
    highlight: true,
  },
  {
    date: '2026-05-31',
    title: 'Contacts arrive in two acts',
    body: 'Every world you reach now opens on a cinematic reveal — the planet, its name, its fate — before anyone speaks. The dialogue that follows no longer just repeats the caption: Sera and Kalen now add what the world cost, who is accountable, and what is moving underneath it all. Beats across all ten episodes were rewritten, and the leap from the interrogation cell to the relay reads as a real journey now.',
    highlight: true,
  },
  {
    date: '2026-05-30',
    title: 'Bypass cards now unmissable',
    body: 'The Quiet-Law Bypass and Channel Leak cards wear their rarity now — a deep-violet body, holographic sheen, sweeping shine, and a pulsing glow that lifts them off the slate. You will not scroll past one without noticing.',
  },
  {
    date: '2026-05-26',
    title: 'Softer cliff',
    body: 'Log dampening past the trillion-mark now taxes 6% per decade instead of 8%. Players deep in the late game (nonillion and beyond) feel the cliff about 2.3× less hard.',
  },
  {
    date: '2026-05-26',
    title: 'Quiet-Law Bypass',
    body: 'Two new rare cards appear once dampening starts to bite: a mythic Quiet-Law Bypass and a legendary Channel Leak. They soften the late-game wall further and stack their own multiplier — gated so each new copy needs a deeper raw rate.',
    highlight: true,
  },
  {
    date: '2026-05-24',
    title: 'Drag the network map',
    body: 'You can drag-pan the Seed Relay map directly now. Info panel stays open when you tap a hex.',
  },
  {
    date: '2026-05-22',
    title: 'Quieter offline returns',
    body: 'If your rate dropped mid-AFK (a window ran out), the slate now silently swaps in cheaper offers so the bands you come back to are still buyable.',
  },
  {
    date: '2026-05-20',
    title: 'Seed Relay map, rebuilt',
    body: 'The Network screen is a 3D fullscreen overlay. Node rarity and sector trade-offs read at a glance on the hex map.',
    highlight: true,
  },
];

// The "version" surfaced in the modal — the date of the most recent entry.
export function currentUpdateDate() {
  return UPDATES.length ? UPDATES[0].date : null;
}
