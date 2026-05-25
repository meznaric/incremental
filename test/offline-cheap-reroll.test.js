import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeShopState, applyOfflineCheapReroll, tryTogglePin,
} from '../src/shop.js';

function freshState(over = {}) {
  return { amount: 0, basePerSecond: 1, ...makeShopState(), ...over };
}

function installSlot(state, idx, upgradeId, cost) {
  while (state.shop.slots.length <= idx) {
    state.shop.slots.push(null);
    state.shop.slotsUnlocked = Math.max(state.shop.slotsUnlocked, idx + 1);
  }
  state.shop.slots[idx] = { id: upgradeId, cost };
}

test('applyOfflineCheapReroll: swaps in cheaper offers for unpinned slots', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  // Slot 0 is filter-typed to additive permanent — install at a wildly inflated
  // cost so any fresh roll lands cheaper.
  installSlot(s, 0, 'overpriced_id', 1e15);
  const swapped = applyOfflineCheapReroll(s, 0);
  assert.ok(swapped >= 1);
  assert.ok(s.shop.slots[0].cost < 1e15);
});

test('applyOfflineCheapReroll: keeps pinned slots untouched even when cheaper exists', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.pinSlots = 1;
  installSlot(s, 0, 'overpriced_pin', 1e15);
  tryTogglePin(s, 0);
  const before = s.shop.slots[0];
  applyOfflineCheapReroll(s, 0);
  assert.equal(s.shop.slots[0], before);
});

test('applyOfflineCheapReroll: no-op when nothing cheaper exists', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  // Cost of 0 — nothing a reroll generates will undercut it.
  installSlot(s, 0, 'free_offer', 0);
  const swapped = applyOfflineCheapReroll(s, 0);
  assert.equal(swapped, 0);
  assert.equal(s.shop.slots[0].cost, 0);
});

test('applyOfflineCheapReroll: skips null slots', () => {
  const s = freshState({ amount: 0, basePerSecond: 1 });
  s.shop.slots = [null, null];
  const swapped = applyOfflineCheapReroll(s, 0);
  assert.equal(swapped, 0);
});
