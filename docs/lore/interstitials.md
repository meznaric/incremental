# Interstitials

Every interstitial — current + proposed. Each has a **trigger**, a **voice**, and **steps**.

The current code lives in `src/interstitial.js` (data + triggers) and `src/interstitialUi.js` (UI). The format on disk:

```js
key_name: {
  steps: [
    { text: '…' },                  // wait for click / space
    { text: '…', autoMs: 1400 },    // auto-advance after typewriter finishes + 1.4s
  ],
}
```

Optional fields: `repeat: true` lets a message fire more than once.

When you add or revise an interstitial, **declare the voice at the top of the JS block as a comment**. The UI doesn't render it; humans need it to keep tone honest.

---

## Voice tags

- `// voice: Kalen` — first person, ambient log. See [`voice-and-tone.md`](./voice-and-tone.md#1-kalen--first-person-ambient-log).
- `// voice: Sera` — second person, procedural.
- `// voice: Narrator` — third person, neutral. Rare.
- `// voice: Anonymous` — italic single-sentence not-Kalen. Once per season-ish.

---

## Current interstitials — *rewrites only*

The triggers and code stay; the text is replaced with lore-tone copy.

### `welcome` — first run
**Voice:** Narrator → Kalen.

```js
welcome: {
  // voice: Narrator (step 1), Kalen (steps 2-3)
  steps: [
    { text: 'The dark was never silent.' },
    { text: 'They are out there. I have been listening for a long time.' },
    { text: 'You can leave the Console open. The echoes keep arriving.' },
  ],
},
```

### `first_gamble` — first gamble loss
**Voice:** Kalen. The old text was a fourth-wall "gambling is bad" joke; we replace it with Kalen reflecting on a failed Hail.

```js
first_gamble: {
  // voice: Kalen
  steps: [
    { text: 'A push that doesn\'t carry is a push that never happened.' },
    { text: 'Nothing came back. That isn\'t bad luck.' },
    { text: 'That\'s just how the medium is. Most signals die.' },
    { text: 'I keep pushing anyway.' },
  ],
},
```

### `tenth_loss` — ten gamble losses
**Voice:** Sera.

```js
tenth_loss: {
  // voice: Sera
  steps: [
    { text: 'I have counted ten failed hails on your log.' },
    { text: 'That isn\'t bad luck. That\'s a method.' },
    { text: 'I\'d like to hear about the method.' },
  ],
},
```

### `all_in_zero` — All-In gamble loss to zero
**Voice:** Kalen.

```js
all_in_zero: {
  // voice: Kalen
  steps: [
    { text: 'Every Echo I had. One push.' },
    { text: 'Nothing came back. I don\'t even hear my own carrier any more.' },
    { text: 'I will start again. Or I won\'t.' },
  ],
},
```

### `end_vigintillion` — endgame threshold
**Voice:** Narrator.

```js
end_vigintillion: {
  // voice: Narrator
  steps: [
    { text: 'Hundreds of young worlds, all at once, began to reach outward.' },
    { text: 'Too early. Too fast. Too loud.' },
    { text: 'Something is coming.' },
    { text: 'The dark was never silent.' },
  ],
},
```

### Milestones — `milestone_1k` / `_1m` / `_1b` / `_1t` / `_1qa` / `_1qi`

These map to episodes. The trigger code (`MILESTONE_THRESHOLDS` in `interstitial.js`) doesn't change; only `INTERSTITIALS[...]` text does. Voice and beat from [`episodes.md`](./episodes.md).

```js
milestone_1k: {
  // voice: Sera. (Ep 1 — Discovery beat.)
  steps: [
    { text: 'The first one. The desert.', autoMs: 1400 },
    { text: 'You said his name to him.', autoMs: 2000 },
  ],
},

milestone_1m: {
  // voice: Kalen. (Ep 2 — Sea Choir beat.)
  steps: [
    { text: 'They thought it was the ocean.', autoMs: 1400 },
    { text: 'I let them.', autoMs: 2000 },
  ],
},

milestone_1b: {
  // voice: Sera. (Ep 3 — Sky Language beat.)
  steps: [
    { text: 'Someone is amplifying you.', autoMs: 1400 },
    { text: 'I haven\'t decided yet whether to tell you.', autoMs: 2200 },
  ],
},

milestone_1t: {
  // voice: Kalen. (Ep 4 — Fire Given beat.)
  steps: [
    { text: 'Eight seconds.', autoMs: 1200 },
    { text: 'I watched.', autoMs: 2200 },
  ],
},

milestone_1qa: {
  // voice: Kalen. (Ep 5 — Perfect Garden beat.)
  steps: [
    { text: 'That sentence is not mine.', autoMs: 1400 },
    { text: 'I have listened to it forty-one times.', autoMs: 2000 },
  ],
},

milestone_1qi: {
  // voice: Sera. (Ep 7 — Echoes beat.)
  steps: [
    { text: 'The pattern is the route.', autoMs: 1200 },
    { text: 'Every triggered world rode the same nodes.', autoMs: 2200 },
  ],
},
```

---

## *New* proposed interstitials

These wire into existing or proposed triggers. Add them to `INTERSTITIALS` and to a `checkX(...)` function in `interstitial.js`.

### `first_relay` — first base-rate permanent purchase
**Voice:** Kalen. Hooks into a new "first time a `permanent`/`add` is bought" trigger.

```js
first_relay: {
  // voice: Kalen
  steps: [
    { text: 'A relay of my own. Patched in. Listening.' },
    { text: 'It hears nothing in particular. That isn\'t the point.' },
  ],
},
```

### `first_convert` — first convert purchase
**Voice:** Sera. Hooks into ep 3 (Sky Language).

```js
first_convert: {
  // voice: Sera
  steps: [
    { text: 'You burned a coil today to plant a relay you\'ll never see again.' },
    { text: 'Walk me through the part where that was kindness.' },
  ],
},
```

### `first_mythic_roll` — first time a mythic upgrade appears in a slot
**Voice:** Kalen. Hooks into ep 5 (Perfect Garden).

```js
first_mythic_roll: {
  // voice: Kalen
  steps: [
    { text: 'A relay class I shouldn\'t have access to is on my Console.' },
    { text: 'I did not put it there.' },
  ],
},
```

### `anomaly_threshold_1` — Anomaly Counter passes 25
**Voice:** Anonymous. Italic. Single line. See [`game-mapping.md`](./game-mapping.md#b-anomaly-counter-proposed-hud-element).

```js
anomaly_threshold_1: {
  // voice: Anonymous (italic)
  steps: [
    { text: 'You were never alone at that desk.' },
  ],
},
```

### `anomaly_threshold_2` — Anomaly Counter passes 100
**Voice:** Anonymous. Italic. One line. Ep 7 territory.

```js
anomaly_threshold_2: {
  // voice: Anonymous (italic)
  steps: [
    { text: 'Speak louder. They are almost ready.' },
  ],
},
```

### `offline_returner` — return after >12h offline
**Voice:** Kalen. Soft, grateful.

```js
offline_returner: {
  // voice: Kalen
  repeat: true,
  steps: [
    { text: 'You came back.' },
    { text: 'They kept arriving while you were gone.' },
  ],
},
```

### `finale` — replaces `end_vigintillion` if/when we move endgame off the magnitude cap
**Voice:** Narrator. Use the `end_vigintillion` text above. Reserved.

---

## How a new interstitial gets added

1. Pick a **trigger** in code. Add the dispatch to `interstitial.js` (e.g. `checkFirstRelay(state)` called from `shop.js`).
2. Pick a **voice** from the four above.
3. Write 1–4 steps. Two is usually right. Three is dramatic. Four needs a reason.
4. Lead each block with a `// voice: …` comment.
5. Decide if it should `repeat: true`. Almost always: no.
6. **Read it aloud** in the voice. If it doesn't sound like one of the four canon voices, rewrite.

---

## Anti-patterns to avoid

- **Don't break the fourth wall.** The old `welcome` joked about closing the tab. New `welcome` does not.
- **Don't congratulate the player.** The number going up is *not* a victory; it's evidence Kalen is being heard.
- **Don't over-stack milestone interstitials.** A player should not see two in a row. The current code prevents this via the queue; keep it that way.
- **Don't repeat the tagline outside the Narrator voice.** It is Narrator-only.
