import { PERIODS } from './periods-data.js';

const LOG10 = Math.log(10);
const log10 = (x) => Math.log(x) / LOG10;
const MAX_PERIOD = PERIODS.length - 1;

export function decomposeByPeriod(n) {
  if (!isFinite(n) || n < 1) return { top: 0, periods: [{ i: 0, value: Math.max(0, Math.floor(n || 0)) }] };
  const top = Math.min(MAX_PERIOD, Math.floor(log10(n) / 3));
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
  if (!isFinite(n) || n < 1) return { top: 0, mags: [{ m: 0, digit: Math.max(0, Math.floor(n || 0)) }] };
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
  if (!isFinite(n) || n < 1) return { top: 0, cols: [{ m: 0, value: Math.max(0, Math.floor(n || 0)) }] };
  const maxM = Math.floor((MAX_PERIOD * 3 + 2) / 2);
  const top = Math.min(maxM, Math.floor(log10(n) / 2));
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
  const p = Math.min(MAX_PERIOD, Math.floor(log10(n) / 3));
  const v = n / Math.pow(1000, p);
  const ab = PERIODS[p].abbrev || '';
  return `${v.toFixed(2)}${ab}`;
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
