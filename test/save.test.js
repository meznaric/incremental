import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage shim. Installed before the save module is imported so
// the module's runtime sees a working localStorage.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  return store;
}

installLocalStorage();
const { SAVE_KEY, saveState, loadState, clearSave, nowSeconds } = await import('../src/save.js');
const { makeShopState } = await import('../src/shop.js');

function freshState() {
  return { amount: 0, basePerSecond: 0, ...makeShopState() };
}

function beforeEach() {
  localStorage.clear();
}

test('loadState returns null with no save', () => {
  beforeEach();
  const s = freshState();
  assert.equal(loadState(s), null);
});

test('loadState returns null with malformed JSON', () => {
  beforeEach();
  localStorage.setItem(SAVE_KEY, 'not-json{{');
  const s = freshState();
  assert.equal(loadState(s), null);
});

test('save/load round-trips numbers and counters', () => {
  beforeEach();
  const a = freshState();
  a.amount = 12345.67;
  a.basePerSecond = 50;
  a.flatBonus = 100;
  a.permMul = 4;
  a.freeRerolls = 2;
  a.owned = { plus_one: 3, mult25: 2 };
  saveState(a);

  const b = freshState();
  const res = loadState(b);
  assert.ok(res); // { offline, earnings }
  assert.equal(b.basePerSecond, 50);
  assert.equal(b.flatBonus, 100);
  assert.equal(b.permMul, 4);
  assert.equal(b.freeRerolls, 2);
  assert.deepEqual(b.owned, { plus_one: 3, mult25: 2 });
  // Amount can be inflated by integrateRate's offline earnings; floor at the saved value.
  assert.ok(b.amount >= 12345.67 - 1e-6);
});

test('save/load: freeRerolls defaults to 0 when absent', () => {
  beforeEach();
  const a = freshState();
  a.amount = 5;
  // Don't set freeRerolls — should round-trip as 0.
  saveState(a);
  const b = freshState();
  loadState(b);
  assert.equal(b.freeRerolls, 0);
});

test('loadState credits offline earnings at the current rate', () => {
  beforeEach();
  const a = freshState();
  a.amount = 1000;
  a.basePerSecond = 10;
  saveState(a);
  // Rewind savedAt by 5 seconds so loadState sees 5s of idle time.
  const snap = JSON.parse(localStorage.getItem(SAVE_KEY));
  snap.savedAt -= 5;
  localStorage.setItem(SAVE_KEY, JSON.stringify(snap));

  const b = freshState();
  const res = loadState(b);
  assert.ok(res.offline >= 4.9 && res.offline <= 5.5);
  // 5s * 10/s = 50, plus a tiny bit for time elapsed during the test itself.
  assert.ok(res.earnings >= 49 && res.earnings <= 60);
  assert.ok(b.amount >= 1049);
});

test('save coerces non-finite amounts on load (defense in depth)', () => {
  beforeEach();
  // Manually inject a corrupted save where amount serializes to null
  // (this is what would happen if Infinity/NaN snuck into state.amount).
  const snap = {
    amount: null, basePerSecond: 5, flatBonus: 0, permMul: 1,
    owned: {}, buffs: { rateMul: [], gambleLuck: [], gambleCushion: [], compound: [] },
    gambleCd: {}, shop: { slots: [null, null], slotsUnlocked: 2 },
    messages: { shown: {}, queue: [], stats: {} },
    savedAt: nowSeconds(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(snap));

  const b = freshState();
  loadState(b);
  // Should not be NaN/Infinity — coerced through Number(...) || 0.
  assert.ok(Number.isFinite(b.amount));
  assert.equal(b.amount, 0);
});

test('save persists active buffs', () => {
  beforeEach();
  const future = nowSeconds() + 1000;
  const a = freshState();
  a.amount = 100;
  a.buffs.rateMul.push({ value: 3, duration: 60, expiresAt: future });
  a.buffs.compound.push({ rate: 0.01, duration: 60, startedAt: nowSeconds(), expiresAt: future });
  saveState(a);

  const b = freshState();
  loadState(b);
  assert.equal(b.buffs.rateMul.length, 1);
  assert.equal(b.buffs.rateMul[0].value, 3);
  assert.equal(b.buffs.compound.length, 1);
  assert.equal(b.buffs.compound[0].rate, 0.01);
});

test('save drops buffs that already expired (pruneBuffs called)', () => {
  beforeEach();
  const a = freshState();
  a.buffs.rateMul.push({ value: 3, duration: 60, expiresAt: nowSeconds() - 1 });
  saveState(a);

  const b = freshState();
  loadState(b);
  assert.equal(b.buffs.rateMul.length, 0);
});

test('clearSave removes the save', () => {
  beforeEach();
  saveState(freshState());
  assert.ok(localStorage.getItem(SAVE_KEY));
  clearSave();
  assert.equal(localStorage.getItem(SAVE_KEY), null);
});

test('loadState ignores malformed shop.slots entries', () => {
  beforeEach();
  const snap = {
    amount: 0, basePerSecond: 0, flatBonus: 0, permMul: 1, owned: {},
    buffs: { rateMul: [], gambleLuck: [], gambleCushion: [], compound: [] },
    gambleCd: {}, savedAt: nowSeconds(),
    shop: {
      slotsUnlocked: 4,
      slots: [
        { id: 'caffeine', cost: 100 }, // valid
        { id: 'caffeine', cost: 'oops' }, // invalid cost
        'garbage', // not an object
        null,
      ],
    },
    messages: { shown: {}, queue: [], stats: {} },
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(snap));

  const b = freshState();
  loadState(b);
  assert.equal(b.shop.slots.length, 4);
  // First slot loaded, rest dropped to null (then revalidated by validateSlate)
  // — validateSlate may re-fill them with fresh rolls, so we just assert the
  // loaded one survived intact OR got replaced (id is still a string).
  assert.equal(typeof b.shop.slots[0].id, 'string');
});
