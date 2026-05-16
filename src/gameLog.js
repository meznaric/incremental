// Past Cycles — a thin retrospective log of every cycle the player has closed.
//
// Lives under its own localStorage key so it survives Cycle close (which wipes
// the gameplay save). Distinct from the Contact Log (cross-cycle prestige
// state) and the gameplay save (the in-flight run) — this is read-only history,
// not a gameplay surface.
//
// Schema is intentionally flat and append-only: stats we record are ones the
// game has tracked since launch (cycle counter, end-of-cycle balance, peak
// Echoes, contact count, banked Mass, memory shards). No feature-specific data
// — anything that lands in a future upgrade can be added without breaking
// existing entries.
//
// Backwards compatible by construction: existing players have no prior entries
// (the log starts empty). We do not retroactively synthesise rows.

export const GAME_LOG_KEY = 'eots.gamelog.v1';
export const MAX_ENTRIES = 50;

export function loadGameLog() {
  let raw;
  try { raw = localStorage.getItem(GAME_LOG_KEY); } catch (e) { return []; }
  if (!raw) return [];
  let s;
  try { s = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(s)) return [];
  return s.filter((e) => e && typeof e === 'object' && Number.isFinite(e.endedAt));
}

export function saveGameLog(entries) {
  try { localStorage.setItem(GAME_LOG_KEY, JSON.stringify(entries)); return true; }
  catch (e) { return false; }
}

// Append, cap at MAX_ENTRIES (drop oldest), persist. Returns the new list.
// Each field is a stable game-fundamental; future feature work should not
// rename or repurpose any of these without writing a migration.
export function appendEntry(entries, entry) {
  const next = entries.slice();
  next.push({
    endedAt: Number(entry.endedAt) || 0,         // unix seconds
    cycle: Math.max(1, Math.floor(Number(entry.cycle) || 1)),
    runDurationS: Math.max(0, Number(entry.runDurationS) || 0),
    endAmount: Math.max(0, Number(entry.endAmount) || 0),
    peakAmount: Math.max(0, Number(entry.peakAmount) || 0),
    contacts: Math.max(0, Math.floor(Number(entry.contacts) || 0)),
    massBanked: Math.max(0, Math.floor(Number(entry.massBanked) || 0)),
    memoryShards: Math.max(0, Math.floor(Number(entry.memoryShards) || 0)),
  });
  while (next.length > MAX_ENTRIES) next.shift();
  return next;
}

export function recordCycleClose(entry) {
  const entries = appendEntry(loadGameLog(), entry);
  saveGameLog(entries);
  return entries;
}

export function clearGameLog() {
  try { localStorage.removeItem(GAME_LOG_KEY); } catch (e) { /* noop */ }
}

// Human-friendly duration. "47s", "12m 30s", "3h 14m", "2d 5h". Matches the
// register the Signal Lock screen uses but truncated to two units max so each
// row reads at a glance.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

// Short date stamp. The save format stores endedAt as unix seconds; the UI
// reads it locally so each player sees their own calendar.
export function formatDate(endedAtSec) {
  const ms = (Number(endedAtSec) || 0) * 1000;
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}
