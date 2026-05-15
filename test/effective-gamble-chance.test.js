import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShopState, effectiveGambleChance, GAMBLE_CHANCE_CAP } from '../src/shop.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 0, ...makeShopState(), ...over };
}

// Minimal fake gamble. Real upgrades carry more fields but only `chance` matters here.
function gamble(chance) {
  return { id: 'test_hail', kind: 'gamble', chance, payout: 2, cooldown: 5 };
}

test('effectiveGambleChance: returns base chance when no buffs are active', () => {
  const s = freshState();
  const u = gamble(0.47);
  assert.equal(effectiveGambleChance(s, u, 0), 0.47);
});

test('effectiveGambleChance: one Carry window adds its value to the base', () => {
  const s = freshState();
  s.buffs.gambleLuck.push({ value: 0.1, duration: 30, expiresAt: 100 });
  const u = gamble(0.5);
  // 0.5 base + 0.1 luck = 0.6 (below cap)
  assert.equal(effectiveGambleChance(s, u, 50), 0.6);
});

test('effectiveGambleChance: multiple Carry windows stack additively', () => {
  const s = freshState();
  s.buffs.gambleLuck.push({ value: 0.05, duration: 30, expiresAt: 100 });
  s.buffs.gambleLuck.push({ value: 0.08, duration: 30, expiresAt: 100 });
  s.buffs.gambleLuck.push({ value: 0.12, duration: 30, expiresAt: 100 });
  const u = gamble(0.3);
  // 0.3 + 0.05 + 0.08 + 0.12 = 0.55
  assert.ok(Math.abs(effectiveGambleChance(s, u, 50) - 0.55) < 1e-9);
});

test('effectiveGambleChance: clamps at GAMBLE_CHANCE_CAP', () => {
  const s = freshState();
  // A pile of luck that would push past the ceiling on a high-base Hail.
  s.buffs.gambleLuck.push({ value: 0.5, duration: 30, expiresAt: 100 });
  s.buffs.gambleLuck.push({ value: 0.5, duration: 30, expiresAt: 100 });
  const u = gamble(0.6);
  // raw = 0.6 + 1.0 = 1.6 → clamped to GAMBLE_CHANCE_CAP (0.85)
  assert.equal(effectiveGambleChance(s, u, 50), GAMBLE_CHANCE_CAP);
});

test('effectiveGambleChance: expired Carry windows are excluded when now is given', () => {
  const s = freshState();
  s.buffs.gambleLuck.push({ value: 0.1, duration: 30, expiresAt: 10 }); // expired by now=50
  s.buffs.gambleLuck.push({ value: 0.2, duration: 30, expiresAt: 100 }); // active
  const u = gamble(0.4);
  // only the active one counts: 0.4 + 0.2 = 0.6
  assert.ok(Math.abs(effectiveGambleChance(s, u, 50) - 0.6) < 1e-9);
});

test('effectiveGambleChance: zero / missing buffs do not throw', () => {
  // Robustness against an old save shape: state.buffs.gambleLuck might be
  // missing or empty. Helper should treat that as "no buffs".
  const u = gamble(0.42);
  assert.equal(effectiveGambleChance({ buffs: {} }, u, 0), 0.42);
  assert.equal(effectiveGambleChance({}, u, 0), 0.42);
});
