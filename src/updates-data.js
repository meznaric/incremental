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
    date: '2026-05-26',
    title: 'Quiet-Law Bypass',
    body: 'Two new rare cards appear past the log-dampening cliff: a mythic Quiet-Law Bypass and a legendary Channel Leak. They soften the late-game wall and stack their own multiplier — gated so each new copy needs a deeper raw rate.',
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
