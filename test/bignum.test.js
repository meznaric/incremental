import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAbbrev,
  parseAmount,
  decomposeByBase100,
  periodForBase100,
} from '../src/bignum.js';
import { PERIODS } from '../src/periods-data.js';

test('formatAbbrev: under 10 shows 2 decimals', () => {
  assert.equal(formatAbbrev(0), '0.00');
  assert.equal(formatAbbrev(5), '5.00');
  assert.equal(formatAbbrev(9.99), '9.99');
});

test('formatAbbrev: 10–999 is integer string', () => {
  assert.equal(formatAbbrev(10), '10');
  assert.equal(formatAbbrev(123.7), '123');
  assert.equal(formatAbbrev(999), '999');
});

test('formatAbbrev: uses period suffixes from 1k upward', () => {
  assert.equal(formatAbbrev(1_000), '1.00k');
  assert.equal(formatAbbrev(1_500_000), '1.50m');
  assert.equal(formatAbbrev(2_300_000_000), '2.30b');
  assert.equal(formatAbbrev(1e12), '1.00t');
});

test('formatAbbrev: Infinity / NaN render as ∞', () => {
  assert.equal(formatAbbrev(Infinity), '∞');
  assert.equal(formatAbbrev(NaN), '∞');
});

test('parseAmount: bare numbers round-trip', () => {
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount('1234'), 1234);
  assert.equal(parseAmount('  42 '), 42);
  assert.equal(parseAmount('1_000'), 1000);
  assert.equal(parseAmount('2.5'), 2.5);
});

test('parseAmount: scientific notation', () => {
  assert.equal(parseAmount('1e3'), 1000);
  assert.equal(parseAmount('2.5e6'), 2_500_000);
  assert.equal(parseAmount('1e-2'), 0.01);
});

test('parseAmount: period suffixes (case-insensitive)', () => {
  assert.equal(parseAmount('5k'), 5000);
  assert.equal(parseAmount('5K'), 5000);
  assert.equal(parseAmount('1.5m'), 1_500_000);
  assert.equal(parseAmount('2b'), 2_000_000_000);
  assert.equal(parseAmount('1t'), 1e12);
});

test('parseAmount: unknown suffix falls through to the bare number', () => {
  // 'zz' is not a valid abbrev — parse falls back to the numeric prefix.
  assert.equal(parseAmount('100zz'), 100);
});

test('parseAmount: empty / null returns 0', () => {
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(parseAmount(undefined), 0);
});

test('parseAmount ↔ formatAbbrev round-trip at major boundaries', () => {
  // formatAbbrev rounds to 2 decimals — round-trip must tolerate that.
  for (const n of [1_000, 1_500, 1_500_000, 7_250_000_000, 9e12]) {
    const round = parseAmount(formatAbbrev(n));
    assert.ok(Math.abs(round - n) / n < 0.01, `round-trip drift for ${n}: got ${round}`);
  }
});

test('decomposeByBase100: small numbers', () => {
  const { top, cols } = decomposeByBase100(50);
  assert.equal(top, 0);
  assert.equal(cols[0].m, 0);
  assert.equal(cols[0].value, 50);
});

test('decomposeByBase100: splits at base-100 boundaries', () => {
  // 12_345 = 1*100^2 + 23*100 + 45 -> top=2, cols=[{m:2,v:1},{m:1,v:23},{m:0,v:45}]
  const { top, cols } = decomposeByBase100(12_345);
  assert.equal(top, 2);
  assert.deepEqual(
    cols.map(c => [c.m, c.value]),
    [[2, 1], [1, 23], [0, 45]],
  );
});

test('decomposeByBase100: count parameter limits columns', () => {
  const { cols } = decomposeByBase100(12_345, 2);
  assert.equal(cols.length, 2);
});

test('decomposeByBase100: 0 and negatives collapse to a single zero column', () => {
  for (const n of [0, -1, NaN, Infinity, -Infinity]) {
    const { cols } = decomposeByBase100(n);
    assert.equal(cols.length, 1);
    assert.equal(cols[0].m, 0);
    assert.equal(cols[0].value, 0);
  }
});

test('periodForBase100: maps a base-100 magnitude to a period/rank pair', () => {
  // m100=0 covers 10^0..10^1 → period 0, ranks 0..1
  const p0 = periodForBase100(0);
  assert.equal(p0.period, 0);
  // m100=1 covers 10^2..10^3 → period 1 (thousand), rank 0
  const p1 = periodForBase100(1);
  assert.equal(p1.period, 1);
  // m100 large enough to land in the last defined period
  const big = periodForBase100(100);
  assert.equal(big.period, PERIODS.length - 1);
});
