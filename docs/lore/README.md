# Echoes Beyond the Stars — Companion Game Lore

Source-of-truth bundle for the companion idle/incremental game tied to the show *Echoes Beyond the Stars*.

> *The dark was never silent.*

## What lives here

| File | What it answers |
| --- | --- |
| [`story-bible.md`](./story-bible.md) | Premise, themes, tagline, three-season mystery engine, what the show is *about*. |
| [`world-rules.md`](./world-rules.md) | The Union, the Quiet Law, physics constraints, factions, technology. |
| [`characters.md`](./characters.md) | Kalen, Sera, supporting cast. Voice, body, scars. |
| [`episodes.md`](./episodes.md) | Season 1, episode by episode. Each ep ties to in-game beats. |
| [`voice-and-tone.md`](./voice-and-tone.md) | How the game speaks. Kalen-voice vs Sera-voice vs Narrator. |
| [`naming-conventions.md`](./naming-conventions.md) | Glossary. Every in-world term we'll ever use. Spelling, capitalization. |
| [`game-mapping.md`](./game-mapping.md) | Every mechanic in `src/` mapped to a lore object. Names for all upgrades. |
| [`interstitials.md`](./interstitials.md) | Every interstitial: current + proposed. Trigger, voice, script. |
| [`image-style-guide.md`](./image-style-guide.md) | The fixed visual DNA. Canonical Gemini prompt prefix. Index of generated refs. |
| [`images/`](./images/) | Generated reference images. Filename = subject. |

## The premise in one paragraph

A young Union comms hacker named **Kalen Vale** has been speaking to worlds the law forbids contact with — civilizations not yet able to leave their own star. He sees himself as a helper. The state sees him as dangerous. The truth is worse: someone else has been riding his signals, accelerating young worlds toward something Kalen never asked them to become. The player *is* Kalen. The number going up is signal — **Echoes** — returning from the dark.

## Why a companion game

The show airs slowly (eight episodes a season). The game gives viewers something to do in between: build Kalen's hidden listening network, contact worlds, accumulate Echoes, get caught.

The game's idle nature mirrors the show's mood: lonely, long, the universe answering on its own clock.

## Hard rules for future work

1. **Don't invent new in-world terms without adding them to [`naming-conventions.md`](./naming-conventions.md).** If a term is worth using, it's worth being canonical.
2. **Tone is grounded.** No magic. No neon. No utopia. See [`voice-and-tone.md`](./voice-and-tone.md).
3. **Names from [`game-mapping.md`](./game-mapping.md) are the canonical names for upgrades, buffs, gambles.** Pick from the table; don't freestyle.
4. **Interstitials must declare a voice** (Kalen / Sera / Narrator / Anonymous). See [`interstitials.md`](./interstitials.md).
5. **Images use the canonical prompt prefix** from [`image-style-guide.md`](./image-style-guide.md). Always.
6. **Player == Kalen.** Do not break this. The game never refers to the player in third person.
