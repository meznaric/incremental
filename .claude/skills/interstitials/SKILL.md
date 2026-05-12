---
name: interstitials
description: Add, edit, or wire up an interstitial message (popup screen) in the Incremental game. Use when the user wants to "add a popup", "show a message when X happens", "add lore/story for Y", "celebrate hitting Z", "make a new milestone message", or invokes /interstitials.
version: 1.0.0
---

# Interstitial messages

A small message system that overlays the game with one to N typewriter steps. Used for lore beats, milestone celebrations, and warnings. Messages live in a queue, persist across sessions, and only show once per player unless flagged `repeat`.

## Files

- `src/interstitial.js` — message library (`INTERSTITIALS`), trigger functions (`checkStart`, `checkGamble`, `checkAmount`), `enqueue` helper.
- `src/interstitialUi.js` — UI controller: typewriter, multi-step, queue draining, [space]/click input.
- `index.html` — overlay markup (`#interstitial`) and `.it-*` styles.
- `src/shop.js` — `messages: { shown, queue, stats }` lives on shop state. `tryBuy` calls `checkGamble` after a gamble resolves.
- `src/save.js` — persists `state.messages`. **Bump `SAVE_KEY` if you add fields to `messages`** so old saves drop.
- `src/main.js` — calls `checkStart` once on load, `checkAmount` every tick, drives `interstitialUi.tick()` and `.drain()` from the rAF loop.

## Anatomy of a message

```js
some_id: {
  steps: [
    { text: 'Line one.' },                      // wait for [space]/click
    { text: 'Line two.', autoMs: 1800 },        // type out, then auto-advance after 1800ms
  ],
  repeat: true,  // optional. omit so it shows once per player.
}
```

- **`text`** — the line. Typewriter speed is `TYPE_MS_PER_CHAR` in `interstitialUi.js` (~22ms/char).
- **`autoMs`** — if set, the step auto-advances `autoMs` after typewriter finishes. If omitted, waits for [space]/click.
- **First input on a typing step** skips the typewriter (shows full text + arms the auto-timer or input wait). Second input advances.
- **Last step** dismisses the message (auto or input, same rules).

### Picking auto vs input

| Use case                               | Mode               |
| -------------------------------------- | ------------------ |
| Lore, warnings, end-game, anything heavy | input (no autoMs)  |
| Milestones, fanfare, ambient delight   | autoMs (1.2–2.5s)  |

## How to add a new message

1. **Add the entry** to `INTERSTITIALS` in `src/interstitial.js`.
2. **Decide the trigger** (see next section) and call `enqueue(state, 'your_id')` from the right place. `enqueue` is idempotent: it skips if already shown (and not `repeat`) or already queued.
3. **Test it.** Either play to it, or open devtools and run:
   ```js
   // Force an interstitial now (useful while authoring).
   // Won't work after the SAVE_KEY bump if you've already played past it —
   // first clear shown:
   const k = 'incremental.save.v4'; // check SAVE_KEY in src/save.js
   const s = JSON.parse(localStorage.getItem(k));
   delete s.messages.shown.your_id;
   localStorage.setItem(k, JSON.stringify(s));
   location.reload();
   ```

## How to add a new trigger

Triggers are plain JS that decide *when* to call `enqueue`. Three patterns already in the code:

### A. One-shot at game start

In `src/interstitial.js`, extend `checkStart`:

```js
export function checkStart(state, isFreshPlayer) {
  if (isFreshPlayer) enqueue(state, 'welcome');
  if (someCondition) enqueue(state, 'returning_player_lore');
}
```

### B. Event hook (gambling, purchases, etc.)

Add a new exported `checkX` function that takes `state` + event data, mutates `state.messages.stats`, and enqueues. Then call it from the relevant gameplay code (e.g., `shop.js` `tryBuy`).

```js
// in interstitial.js
export function checkPurchase(state, upgrade) {
  const s = state.messages.stats;
  if (upgrade.id === 'empire' && !s.empireBurned) {
    s.empireBurned = true;
    enqueue(state, 'empire_burn');
  }
}

// in shop.js (where the convert resolves)
import { checkPurchase } from './interstitial.js';
// ...
checkPurchase(state, u);
```

### C. Threshold check from the tick loop

Use the `checkAmount` pattern: store the high-water mark in `state.messages.stats` and only fire when crossing upward. This is cheap to call every frame because it's just a numeric compare.

```js
// in interstitial.js
const RATE_THRESHOLDS = [
  { id: 'milestone_rate_1k', at: 1e3 },
];

export function checkRate(state, rate) {
  const s = state.messages.stats;
  if (rate <= (s.peakRate || 0)) return;
  for (const m of RATE_THRESHOLDS) {
    if (rate >= m.at && (s.peakRate || 0) < m.at) enqueue(state, m.id);
  }
  s.peakRate = rate;
}
```

Then call `checkRate(state, rate)` from `tick()` in `main.js`.

## Persistence rules

- `state.messages.shown[id] = true` is set when a message dismisses. Prevents future shows unless `repeat: true`.
- `state.messages.queue` persists. **Messages missed while idle still appear next session** — this is intentional (the user spec calls it out).
- `state.messages.stats` is freeform per-trigger scratch space (`gambles`, `gambleLosses`, `peakAmount`, etc.). Initialize new keys in `makeShopState()` in `src/shop.js` so they have sensible defaults, and load merges via `Object.assign` in `save.js`.
- **Adding fields to `state.messages`?** Bump `SAVE_KEY` in `src/save.js` (vN → vN+1). Old saves are dropped — fine during development; ship-time would need a migration (per project CLAUDE.md).

## UI behavior cheatsheet

- Backdrop: `#interstitial.it-visible` adds the blur and dim. Card fades + lifts in.
- Typewriter cursor `▍` shows while typing (`.it-typing` class).
- Progress dots render only when `steps.length > 1`.
- Hint "press space" fades in only when waiting for input (i.e., a step without `autoMs` has finished typing).
- Click anywhere on the overlay = same as pressing space.

## Style guidance for message copy

Match the game's existing tone: short, slightly dry, present tense. Lore steps tend to escalate: a flat statement → a sharper specific → an emotional or open-ended close. Keep each step under ~80 chars when possible — typewriter feels slow on long lines.

## Common edits & where to make them

| You want to…                                | Touch                          |
| ------------------------------------------- | ------------------------------ |
| Change the words of an existing message     | `src/interstitial.js` `INTERSTITIALS` |
| Add a new lore/milestone message            | `INTERSTITIALS` + a trigger call |
| Change typewriter speed                     | `TYPE_MS_PER_CHAR` in `interstitialUi.js` |
| Restyle the overlay                         | `.it-*` rules in `index.html` |
| Skip the welcome for a returning player     | Already handled — `checkStart(state, !loaded)` only enqueues for `isFreshPlayer` |
| Replay a message every time it triggers     | Add `repeat: true` to its definition |
| Reset everything to test                    | DevTools: `localStorage.clear(); location.reload();` (note: beforeunload save will overwrite if you don't reload immediately) |

## Don'ts

- Don't put trigger logic inside `interstitialUi.js` — it's a dumb renderer. Triggers go in `interstitial.js`.
- Don't enqueue from inside the UI controller's tick — it can race the drain. Enqueue from gameplay code or `checkX` functions.
- Don't add per-message DOM. The same overlay element renders every message.
- Don't add a config file for messages. Per project CLAUDE.md, tuning lives next to the code that uses it.
