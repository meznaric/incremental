# Naming Conventions

The glossary. If a term appears in-game, it appears here, spelled this way.

## Capitalisation rules

- **In-world institutional nouns** are capitalised: *the Union*, *the Compact*, *the Quiet Law*, *Communications Defense*, *the Listening Service*, *Border Wardens*.
- **Currency and game-mechanical nouns** are capitalised in UI labels but lowercase in flowing prose: *"You have 12 Echoes."* / *"the echoes keep arriving."*
- **Worlds** are capitalised: *Ahn-Tar-3*, *Solunn*, *Vehrn-9*, *Tarsus Minor*, *Lehl*.
- **People** are capitalised. Obviously.

## Spelling, one canonical form each

- **Echo / Echoes** — *not* Echos. Plural with the *e*.
- **Quiet Law** — two words. Always capitalised.
- **Quiet Relay** — two words. Always capitalised. The hardware.
- **FTL relay** — lowercase "relay". The generic infrastructure.
- **the grid** — the relay network. Lowercase. Vernacular.
- **ComDef** — Communications Defense, short. One word, mixed case.
- **Listener** — the clerical-academic role. Capitalised when referring to the order.
- **listener** — lowercase when ordinary signal-watcher.
- **Sky-listener** — the Ahn-Tarsi religious caste (Ep 1). Hyphenated.

## Currency

- **Echo** (singular). **Echoes** (plural). Symbol on UI: a stylised triple-arc waveform (see [`image-style-guide.md`](./image-style-guide.md) for the glyph).
- An Echo is **one returned signal-bit**. Conceptually a piece of decoded transmission from the dark.
- In code, the existing field `state.amount` *is* Echoes. Don't rename the field — the save key is `incremental.save.v1`; renaming forces a migration. Just update display labels.

## Periods (k, m, b, t, Qa, ...)

These stay as scientific prefixes — they ride a column of magnitudes that Kalen would absolutely think in. Optional flavour for tutorials:
- k = "kilo-Echoes" — *local-band traffic*
- m = "mega-Echoes" — *one full carrier band*
- b = "giga-Echoes" — *a planet's annual signal output*
- t = "tera-Echoes" — *system-wide saturation*
- Qa = "quadrillion / peta-Echoes" — *the limit of what a single Quiet Relay can sustain*
- Qi+ = beyond the Quiet Relay's design budget — *the impossible numbers Kalen is, somehow, hitting*

Use these as lore drops when periods change in the magnitude display; do not rename the abbreviations.

## In-world terms (full glossary)

| Term | Meaning |
| --- | --- |
| **the Union** | The post-scarcity alliance Kalen is a citizen of. |
| **the Compact** | The founding accord of the Union. The legal substrate. |
| **the Quiet Law** | The single rule against contacting pre-stellar worlds. |
| **Communications Defense / ComDef** | The agency that hunts unauthorised emissions. Sera's branch. |
| **the Listening Service** | The legal-watching counterpart to Kalen — they watch silent worlds, never speak. |
| **Border Warden** | Officer assigned to the edge between Union space and silent worlds. |
| **the grid** | The FTL relay network. Used in vernacular. |
| **a relay** | A specific FTL relay node. Older than the Union. |
| **the Quiet Relay** | A specific class of high-isolation relay used for the Listening Service. Misappropriated by Kalen for outbound contact. |
| **the band** | A frequency band Kalen can act on. Used in-game as the name for a shop slot. |
| **the Console** | Kalen's workstation. Used in-game as the name for the shop area. |
| **Echo / Echoes** | The game's currency. A returned signal-bit. |
| **a Listener** | Member of the Listening Service order. |
| **a sky-listener** | Member of the Ahn-Tarsi religious caste (Ep 1). |
| **the silent worlds** | Worlds that have not yet left their own star. Subjects of the Quiet Law. |
| **a hail** | A direct, deliberate contact attempt. |
| **a bleed** | An accidental or near-accidental contact. |
| **a window** | A natural condition (ion calm, aurora coherence, etc.) that makes contact easier. |
| **a triggered world** | A silent world that, after contact, accelerated dangerously. |
| **the hijack** | The hidden system on the relay grid that edits Kalen's signals. (Sera's term, late S1.) |
| **Carrier Mass** | Persistent prestige currency. The literal accreted weight of every carrier Kalen has ever pushed — measurable on the rig, in kilograms. Survives a cycle close. Spent on Engravings. |
| **a Carrier Engraving** | A permanent cut into Kalen's listening rig. Survives the wipe of any single cycle because the metal remembers. Each one a small, irreversible commitment. |
| **First Light** | An Engraving. A pilot tone burned into the rig so the next cycle does not start cold. |
| **Bone Memory** | An Engraving. Solder-traces that remember the last cycle's tuning. Pure persistence. |
| **Quick Wake** | An Engraving. A boot routine that hands Kalen a hot carrier the moment he sits down. |
| **Patched Hands** | An Engraving. Worn tuning gloves; the band-sweep is muscle memory now. |
| **Open Frame** | An Engraving. A third band, permanently patched into the rig's chassis. |
| **Ascent** | An Engraving, and the name of the new mathematical axis it opens. The carrier no longer just gets stronger — it climbs a new dimension. Each level adds +0.02 to the exponent on effective rate. |
| **accretion** | The in-world physical model for Carrier Mass: every push leaves a residue. Sera's word, used straight-faced. |
| **Signal Lock** | The welcome-back screen. Sera's report when Kalen returns to the Console: time away, base carrier, any windows still holding, and the count of Echoes the rig logged in his absence. Procedural register; never reads as a payout. |
| **Signal Diagnostic** | The breakdown panel. A live, ordered read of the terms that produce the current pulse — base listening yield, decode efficiency, active carrier windows, resonance builds, Echo Memory, and (if cut) the Ascent exponent. Sera-voiced UI; she is showing Kalen the math of his own carrier. |
| **current pulse** | The Sera-voiced label for the final, post-everything Echoes/s figure on the Signal Diagnostic. "Pulse" reads as one observable signal rather than a rate, which is how Sera would name it. |
| **Wake** | The standing 3× rate window seeded at every cycle open — the rig pings itself awake. Distinct from the Quick Wake Engraving, which extends and amplifies the same opening beat. |
| **Cycle Pattern** | A single strategy modifier the player picks at the start of every cycle from cycle 2 onward. Each Pattern skews the run in one direction (front-loading, sharper windows, free starting bands, halved base with deeper hails) and is cleared the next time the cycle closes. |
| **Surge Tide** | A Cycle Pattern. The carrier pours hot for the first five minutes of the cycle, then runs lean for the rest of the run. |
| **Cold Sky** | A Cycle Pattern. Carrier windows arrive shorter than usual but every one of them runs at twice the strength. |
| **Patched Frame** | A Cycle Pattern. Three bands ride free at cycle open; every re-tune after that bills double. |
| **Bare Wire** | A Cycle Pattern. Base listening runs half-strength, but windows hold twice as long and hail carry-chance climbs five points. |

## Names you should NOT use (IP / Trek overlap)

These are banned. If you find a draft using them, rewrite.

- Federation (use *Union*)
- Prime Directive (use *Quiet Law*)
- Starfleet (use *Communications Defense* / *Border Wardens*)
- Vulcans, Klingons, Romulans, any Trek species
- Transporter (use *cutter* for a small FTL ship, *jump* for the act)
- Phaser (use *sidearm* — generic)
- Subspace as a Trek-coded word (we *do* use "subspace" for the inside-the-grid layer, but in-game it's called "the grid" or "the band")
- Warp (use *jump*, *FTL*)

## Numbers

- Years on Union scale = *standard years* (s.y.). Same as Earth years; the Union picked one homeworld's calendar centuries ago.
- World-local time = *local years*. Used only when a planet's local calendar matters.
- Casualty counts: use exact numbers, no round-ups. *"6,000 dead"* not *"thousands dead."* The show is grounded in specificity.

## Renaming policy

If a term in this file ever needs to change:
1. Open a PR with the rename.
2. Update every doc in `docs/lore/`.
3. Grep `src/` for the old term and update all UI strings.
4. Note the rename + reason at the bottom of this file under "Changelog".

### Changelog

- 2026-05-13 — Initial glossary committed.
- 2026-05-14 — Added Carrier Mass, Carrier Engravings (First Light, Bone Memory, Quick Wake, Patched Hands, Open Frame, Ascent), and the accretion model. Supports the prestige overhaul; the rig literally carries the weight of past cycles.
- 2026-05-14 — Added Signal Lock — the name for the welcome-back screen.
- 2026-05-14 — Added Signal Diagnostic and current pulse. Names the breakdown screen and the final rate figure; Sera-voiced UI surface.
- 2026-05-14 — Added Wake. Names the starter rate-mul beat at every cycle open so the mobile collapsed-buff detail modal has a clear provenance label.
- 2026-05-14 — Added Cycle Pattern + the four canonical Pattern names (Surge Tide, Cold Sky, Patched Frame, Bare Wire). Each is a per-cycle strategy modifier the player picks the moment the rig boots into a new cycle.
