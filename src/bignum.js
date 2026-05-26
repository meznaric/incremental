import { PERIODS } from './periods-data.js';

const LOG10 = Math.log(10);
const log10 = (x) => Math.log(x) / LOG10;
const MAX_PERIOD = PERIODS.length - 1;

// Math.log(1000)/Math.log(10) is 2.9999999999999996, not 3, so a naive
// floor at base-1000 / base-100 boundaries lands one period low. Iterate
// instead — exact integer compare, no FP boundary surprises.
function periodIndexBase1000(n) {
  let p = 0;
  while (n >= 1000 && p < MAX_PERIOD) { n /= 1000; p++; }
  return p;
}
function magnitudeBase100(n) {
  const maxM = Math.floor((MAX_PERIOD * 3 + 2) / 2);
  let m = 0;
  while (n >= 100 && m < maxM) { n /= 100; m++; }
  return m;
}

function clampToInt(n) {
  return isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function decomposeByPeriod(n) {
  if (!isFinite(n) || n < 1) return { top: 0, periods: [{ i: 0, value: clampToInt(n) }] };
  const top = periodIndexBase1000(n);
  const periods = [];
  for (let off = 0; off < 3; off++) {
    const p = top - off;
    if (p < 0) break;
    const v = Math.floor(n / Math.pow(1000, p)) % 1000;
    periods.push({ i: p, value: v });
  }
  return { top, periods };
}

export function decomposeByMagnitude(n) {
  if (!isFinite(n) || n < 1) return { top: 0, mags: [{ m: 0, digit: clampToInt(n) }] };
  const top = Math.min(MAX_PERIOD * 3 + 2, Math.floor(log10(n)));
  const mags = [];
  for (let off = 0; off < 3; off++) {
    const m = top - off;
    if (m < 0) break;
    const d = Math.floor(n / Math.pow(10, m)) % 10;
    mags.push({ m, digit: d });
  }
  return { top, mags };
}

export function decomposeByBase100(n, count = 3) {
  if (!isFinite(n) || n < 1) return { top: 0, cols: [{ m: 0, value: clampToInt(n) }] };
  const top = magnitudeBase100(n);
  const cols = [];
  for (let off = 0; off < count; off++) {
    const m = top - off;
    if (m < 0) break;
    const v = Math.floor(n / Math.pow(100, m)) % 100;
    cols.push({ m, value: v });
  }
  return { top, cols };
}

export function periodForBase100(m100) {
  const upperMag = 2 * m100 + 1;
  const period = Math.min(MAX_PERIOD, Math.floor(upperMag / 3));
  const rank = upperMag - period * 3;
  return { period, rank };
}

export function formatAbbrev(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 ? n.toFixed(2) : Math.floor(n).toString();
  const p = periodIndexBase1000(n);
  const v = n / Math.pow(1000, p);
  const ab = PERIODS[p].abbrev || '';
  return ab ? `${v.toFixed(2)} ${ab}` : v.toFixed(2);
}

export function formatGrouped(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1e15) return Math.floor(n).toLocaleString();
  return n.toExponential(3);
}

export function parseAmount(s) {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[, _]/g, '').trim().toLowerCase();
  if (!cleaned) return 0;
  const m = cleaned.match(/^([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*([a-z]*)$/i);
  if (!m) return Number(cleaned) || 0;
  const num = parseFloat(m[1]);
  const suffix = m[2];
  if (!suffix) return num;
  const idx = PERIODS.findIndex((p) => p.abbrev.toLowerCase() === suffix);
  return idx >= 0 ? num * Math.pow(1000, idx) : num;
}
