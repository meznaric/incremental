// Pure assembly for the Names modal's "Log" tab — Kalen's chronological
// transcript of every contact made and every line that was said when it
// landed. No DOM, no three.js; importable from Node so the timeline math is
// testable. namesModalUi.js renders the returned structure.
//
// Seen-ness derives entirely from the contact log: a world is on the timeline
// iff it is in log.worlds (i.e. Kalen actually reached it). The dialogue lines
// are the contact interstitial's steps for that world's slot — the exact lines
// the reveal showed when the contact fired. Un-met worlds contribute nothing;
// we never invent content for a name that never answered.

import { WORLDS_BY_EP } from './worlds-data.js';
import { EP_INTERSTITIALS } from './episodes.js';
import { VOICE_META } from './interstitial.js';

// Resolve the per-EP slot id for a world id, so we can look up its contact
// interstitial script. The same slot id is a different world per EP, so the
// lookup is scoped to the world's own EP block.
function slotIdForWorld(worldId, ep) {
  const block = WORLDS_BY_EP[ep];
  if (!block) return null;
  for (const [slotId, def] of Object.entries(block)) {
    if (def && def.id === worldId) return slotId;
  }
  return null;
}

// Flatten an interstitial's steps into renderable transcript lines. A step's
// `text` may be a (state) => string thunk; the contact scripts are plain
// strings, but evaluate thunks defensively so a dynamic line never renders as
// "[object Function]". A missing state just yields an empty line, which the
// caller drops.
function linesFromSteps(steps, state) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (const step of steps) {
    if (!step) continue;
    let text = step.text;
    if (typeof text === 'function') {
      try { text = text(state); } catch { text = ''; }
    }
    if (typeof text !== 'string' || text.length === 0) continue;
    const voice = step.voice || 'K';
    const meta = VOICE_META[voice] || {};
    out.push({
      voice,
      speaker: meta.name || '',
      portrait: meta.portrait || null,
      text,
      italic: !!step.italic,
    });
  }
  return out;
}

// Assemble the full Log timeline from the contact log. Ordered chronologically
// by when contact happened: run ascending, then contactedAt ascending, so the
// player reads their history in the order it unfolded. Each entry carries the
// world's name/episode/status plus the transcript of the lines that were
// revealed for that contact.
//
// `state` is optional — only needed to evaluate any thunk-typed step text;
// contact scripts are static strings today, so omitting it is fine.
export function buildLogTimeline(log, state) {
  const worlds = (log && Array.isArray(log.worlds)) ? log.worlds : [];
  const ordered = worlds.slice().sort((a, b) => {
    const ra = a.run || 1, rb = b.run || 1;
    if (ra !== rb) return ra - rb;
    return (a.contactedAt || 0) - (b.contactedAt || 0);
  });
  return ordered.map((w) => {
    const slotId = slotIdForWorld(w.id, w.ep);
    const block = EP_INTERSTITIALS[w.ep];
    const entry = (slotId && block && block[slotId]) ? block[slotId] : null;
    const lines = entry ? linesFromSteps(entry.steps, state) : [];
    return {
      id: w.id,
      name: w.name,
      ep: w.ep,
      status: w.status,
      run: w.run || 1,
      contactedAt: w.contactedAt || 0,
      lines,
    };
  });
}
