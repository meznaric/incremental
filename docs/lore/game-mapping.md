# Game Mechanic ↔ Lore Mapping

Source of truth for *how a mechanic in `src/` is named, presented, and justified in lore*. If you're about to add or rename an upgrade, this is the file.

The actual code in `src/` has not been renamed yet (as of 2026-05-13). The fields, ids, and save-key are unchanged. This document is the **target state** — the contract.

---

## Mechanic-level mapping

| Code concept | Lore name | Why |
| --- | --- | --- |
| `state.amount` (the number) | **Echoes** | Returned signal-bits from contacted worlds. Title-aligned. |
| coin icon (`ri-copper-coin-fill`) | **the Echo glyph** (triple-arc waveform) | A coin doesn't read sci-fi. The triple-arc reads "signal." See [`image-style-guide.md`](./image-style-guide.md#glyph). |
| `state.basePerSecond` + `flatBonus` | **base listening yield** | What Kalen pulls in passively from his standing relays. |
| `state.permMul` | **decode efficiency** | How well his stack interprets the carrier. Multiplicative. |
| effective rate display (X/s) | **Echoes/s** (UI label) or just **/s** | Same. |
| `#shop` panel | **the Console** | Kalen's workstation. The thing in front of him. |
| a shop slot | **a band** | An open frequency band he can act on this minute. |
| `slotsUnlocked` | **bands patched in** | Hardware capacity. Each unlocked band cost real money to wire in. |
| reroll | **re-tune** the array | Sweeping the available bands. |
| pin | **lock the band** | Hold this band steady through the next re-tune. |
| period prefix (k/m/b/...) | scientific magnitude (kept as-is) | See [`naming-conventions.md`](./naming-conventions.md#periods). |
| save (`localStorage`) | **field log** | Kalen's personal notebook. |
| reset | **purge the log** | Burning the notebook. Severe action. |

---

## Kinds

The five kinds in `src/upgrades.js` map to five lore archetypes.

| Code kind | Lore archetype | What it represents | Card tint (existing CSS) |
| --- | --- | --- | --- |
| `permanent` `permType:'add'` | **Relay Node** | A new piece of hardware that pulls Echoes passively. Each instance scales current rate. | green (`#4cd07d`) |
| `permanent` `permType:'mul'` | **Decode Upgrade** | A breakthrough in interpretation: filtering, compression, error-correction. | green (`#4cd07d`) |
| `buff` | **Window** | A temporary atmospheric / orbital / political condition that makes signal collection easier. | purple (`#9d6ee0`) |
| `convert` | **Seed Relay** | Burn current balance to plant a hidden listener on a new band. Echoes spent become permanent yield. | yellow (`#f5d34a`) |
| `gamble` | **Hail** | A risky direct contact attempt. Can pay off enormously; usually doesn't. | red (`#ff5a6e`) |
| `gift` | **Bleed** | An accidental, unsolicited signal arriving for free. | orange (`#ffb84a`) |

Rule of thumb when writing new upgrade copy:
- **Relay Nodes** are *hardware* nouns. Things you bolt down.
- **Decode Upgrades** are *technique* nouns. Things you learn.
- **Windows** are *transient phenomenon* nouns. Things that happen *to* you.
- **Seed Relays** are *commitments* — verbs disguised as nouns. *"Seed a coil. Bury an antenna."*
- **Hails** are *named contact methods* — every gamble is a *way you tried to talk to someone.*
- **Bleeds** are *accidents* — short, surprised, grateful.

---

## Renames — Gambles (Hails)

The current gamble pool is casino-flavoured. Re-skinned to in-world contact methods. Same numbers, same `id`, only `name` and `desc` change.

| `id` (unchanged) | Current name | **Lore name** | One-line desc |
| --- | --- | --- | --- |
| `red_black` | Red / Black | **Carrier Bleed** | Push a phrase sideways into a working radio band. |
| `dice` | Dice | **Magnetic Storm** | Hide six words in a geomagnetic burst. |
| `coin_flip` | Coin Flip | **Open Whisper** | A direct line. Either they hear you or they don't. |
| `high_card` | High Card | **Satellite Patch** | Wake one of their old satellites and speak through it. |
| `wheel` | Wheel of Fortune | **Aurora Modulation** | Write your message in their northern lights. |
| `blackjack` | Blackjack | **Compressed Burst** | Twenty-one bits, perfectly timed. |
| `single` | Single Number | **Deep Probe** | One coordinate, one window, one shot. |
| `double_or_nothing` | Double or Nothing | **Direct Hail** | Be heard or be silent. No middle. |
| `pair_dice` | Pair of Dice | **Twin Pulse** | Two carriers, both have to land. |
| `poker_hand` | Poker Hand | **Layered Stack** | Hide the payload inside their own broadcasts. |
| `color_triple` | Color Triple | **Tri-Band Splice** | Three frequencies, one phrase. |
| `snake_eyes` | Snake Eyes | **Resonance Lock** | The crust *itself* hums your sentence. |
| `lottery` | Lottery Ticket | **Cold Call** | Pick a star, push hard, hope. |
| `mystery` | Mystery Box | **Dark Packet** | Encrypted, deniable, expensive to send. |
| `slots` | Slots Jackpot | **Subspace Bleed** | Let the FTL leak do the work. (S1 finale tech.) |
| `triple_sevens` | Triple Sevens | **Trinity Pulse** | Three perfectly-timed jumps in series. |
| `royal_flush` | Royal Flush | **Quiet Relay Hijack** | Use a real Listener relay against the Law. |
| `allin` | All-In Coinflip | **Burn the Stack** | Every Echo you have, on one push. |
| `roulette_split` | Roulette Split | **Split-Band** | Wager across two adjacent frequencies. |
| `keno` | Keno Pick | **Cipher Pick** | Pick a code; pray they decode it. |
| `wheel_jackpot` | Wheel Jackpot | **Aurora Jackpot** | The whole hemisphere reads you tonight. |
| `friend_bet` | Friend's Bet | **Confidant** | Speak to a trusted contact. Same risk; less guilt. |

When generating dynamic upgrade `desc` strings later, prefer Kalen-voice over casino phrasing. ("Wager 50% — 2× on 48.6%" stays mechanically, but the desc *above* the numbers should be in-world.)

---

## Renames — Buffs (Windows)

Buffs are environmental / cognitive / political windows. The numbers stay; the name+flavour shifts.

### Rate buffs
| `id` | Current name | **Lore name** | One-line flavour |
| --- | --- | --- | --- |
| `caffeine` | Caffeine | **Stim Patch** | Cortical stim. Five clean minutes. |
| `espresso` | Espresso Shot | **Quick Stim** | One minute, sharp as a needle. |
| `overdrive` | Overdrive | **Overclock** | Push the decoder past spec. It will whine. |
| `frenzy` | Frenzy | **Burst Mode** | Thirty seconds at full bandwidth. |
| `berserker` | Berserker | **Critical Load** | Run hot. Hope nothing melts. |
| `power_hour` | Power Hour | **Clean Sky** | An hour of orbital quiet. |
| `wake_up` | Wake-Up Call | **Ping** | A nudge from the system. |
| `marathon` | Marathon | **Long Watch** | Two hours, doubled output, no sleep. |
| `vigil` | Vigil | **Patience** | Six hours, slow gains, no breaks. |
| `dynasty` | Dynasty | **Held Channel** | One full day on a single carrier. |
| `pilgrimage` | Pilgrimage | **Deep Drift** | Three days. No correction. |
| `solstice` | Solstice | **Solar Quiet** | A week of cooperative star-weather. |
| `aeon` | Aeon | **Cold Cycle** | Four weeks of mild gain. |
| `monolith` | Monolith | **Lighthouse** | A week of strong, reliable carrier. |
| `forever` | Forever Sunrise | **False Dawn** | Six weeks. The horizon never quite arrives. |
| `epoch` | Epoch | **Slow Era** | Two weeks at a steady premium. |

### Luck buffs (gamble win chance)
| `id` | Current | **Lore** | Flavour |
| --- | --- | --- | --- |
| `fortune` | Fortune Cookie | **Hunch** | You don't know why this band feels right. |
| `lucky` | Lucky Hour | **Clear Window** | Ion calm. Your signals carry. |
| `clover` | Four-Leaf Clover | **Carrier Surge** | Background noise drops. |
| `tide` | Rising Tide | **Open Sky** | Six hours of unusually quiet space weather. |
| `divine_fortune` | Divine Fortune | **Oracle Window** | Sixty seconds. Use them. |
| `oracle` | Oracle Sight | **Pre-Echo** | You read the answer before you hear it. |

### Cushion buffs (gamble loss padding)
| `id` | Current | **Lore** | Flavour |
| --- | --- | --- | --- |
| `insurance` | Insurance | **Failsafe Buffer** | A small refund if the signal misfires. |
| `steady` | Steady Hand | **Error-Correction** | Most of your wasted bits come home. |
| `iron_will` | Iron Will | **Hardened Stack** | Failures hurt less. |
| `bastion` | Bastion | **Shield Net** | Twelve hours of partial refunds on a loss. |
| `last_stand` | Last Stand | **Final Buffer** | Sixty seconds of generous cushion. |

### Compound buffs
| `id` | Current | **Lore** | Flavour |
| --- | --- | --- | --- |
| `snowball` | Snowball | **Cascade** | Each second feeds the next. |
| `compound` | Compound | **Resonance Build** | The carrier finds itself. |
| `avalanche` | Avalanche | **Resonance Storm** | Compounds dangerously. |
| `momentum` | Momentum | **Phase Climb** | Phase-lock tightens over time. |
| `ember` | Ember | **Slow Burn** | A trickle compounding all day. |
| `eclipse` | Eclipse | **Black Sky** | Long, dark, quietly growing. |
| `ancestral` | Ancestral Tide | **Old Carrier** | A pre-Union signal lingers. |

---

## Renames — Permanents

### Additive base-rate (Relay Nodes) — dynamic tiers
The `_dyn: 'add'` generator builds these on the fly. Replace the generated `name` template `'+X per second'` with a tiered hardware name:

| Rarity | Lore name |
| --- | --- |
| `common` | **Field Antenna +X** |
| `uncommon` | **Yagi Array +X** |
| `rare` | **Phased Dish +X** |
| `legendary` | **Deep-Sky Listener +X** |
| `mythic` | **Quiet Relay +X** |

Note: a **Quiet Relay** at mythic rarity is *the same hardware class the Listening Service uses*. Visually distinct. Possibly stolen.

### Multiplicative permanents (Decode Upgrades)
| `id` | Current name | **Lore name** | Flavour |
| --- | --- | --- | --- |
| `mult_starter` | +50% Multiplier (Starter) | **Adaptive Filter** | The first lesson: throw away noise. |
| `mult5` | +5% | **Refined Filter** | Tighter noise floor. |
| `mult10` | +10% | **Side-Channel Decode** | Listen between the bands. |
| `mult25` | +25% | **Spread-Spectrum** | The signal is everywhere; the decoder is patient. |
| `mult33` | +33% | **Phase Lock** | The carrier holds. |
| `mult50` | +50% | **Compression Codec** | Same line, half the bandwidth. |
| `mult75` | +75% | **Predictive Decode** | The system finishes the sentence for you. |
| `mult_two` | ×2 | **Subspace Tap** | The grid leaks. You drink. |
| `mult_three` | ×3 | **FTL Sideband** | The fast lane, half-legal. |
| `mult_five` | ×5 | **Forbidden Codec** | Whoever wrote this codec was not Union. |

---

## Renames — Converts (Seed Relays)
| `id` | Current | **Lore** | Flavour |
| --- | --- | --- | --- |
| `vending` | Vending Machine | **Seed Coil** | A coil you bury and forget. |
| `tip_jar` | Tip Jar | **Loose Cable** | A cheap antenna; some return. |
| `side_gig` | Side Gig | **Hidden Antenna** | Off-books, off-grid. |
| `kiosk` | Kiosk | **Quiet Outpost** | A small staffed listening post. |
| `franchise` | Franchise | **Buried Array** | A real installation. Real risk. |
| `conglomerate` | Conglomerate | **Distributed Mesh** | A network you cannot lose all of. |
| `empire` | Empire | **Forbidden Network** | Everything you have, all at once, somewhere they can't find. |

---

## Renames — Gifts (Bleeds)
Generated dynamically per rarity. Drop the casino "Gift: +X" name in favour of:

| Rarity | Lore name |
| --- | --- |
| `common` | **Echo Bleed +X** |
| `uncommon` | **Signal Bleed +X** |
| `rare` | **Carrier Bleed +X** |
| `legendary` | **Subspace Bleed +X** |
| `mythic` | **Relay Bleed +X** |

(`Subspace Bleed` mythic-name overlaps a gamble id — that's fine; they're different game objects and players never see both simultaneously.)

---

## "Couple more things" — proposed additions

These don't exist in code yet. They are recommendations that future tasks can pick up.

### a) **Contact Log** (proposed UI panel)
A read-only menu item under the main menu, accessible from the top-left burger. Lists every world Kalen has knowingly contacted (each named after an in-game milestone). Format:

```
AHN-TAR-3   [contact: ep 1 trigger]   status: TRIGGERED
SOLUNN      [contact: ep 2 trigger]   status: TRIGGERED
VEHRN-9     [contact: ep 3 trigger]   status: TRIGGERED
TARSUS MINOR[contact: ep 4 trigger]   status: COLLAPSED
LEHL        [contact: ep 5 trigger]   status: SHIFTED
UNNAMED     [contact: ep 6 trigger]   status: MISSING
```

Mechanically: each contact unlocks when its corresponding interstitial fires.

### b) **Anomaly Counter** (proposed HUD element)
A small, deliberately-ugly number in the top-right corner that creeps up *invisibly*. Starts at 0. Increments by 1 each time the player does anything that, in lore, would have caught the hijack's attention (every gamble; every mythic roll; every long-haul buff). Reaches a threshold at the same point the player would naturally hit Ep 5 / Ep 7 in the story. When the threshold is crossed, an *Anonymous fragment* interstitial fires.

This is the in-game version of the show's anomaly stings.

### c) **The Quiet Mode** (proposed reset variant)
The current "Reset save" wipes everything. Add a second option: **Quiet Mode** — wipe Echoes and upgrades, but keep the Contact Log. The Log persists across runs as Kalen's accumulated guilt. Mechanically harmless; narratively the entire spine.

### d) **Field log entries on milestones**
Each milestone interstitial leaves a one-line entry in a in-game readable log (separate from the Contact Log). The player can re-read these. Builds a season-1 script across a playthrough.

### e) **A boot tagline screen**
On fresh game (`isFreshPlayer === true`), show the tagline *"The dark was never silent."* on a black screen for two seconds before the welcome interstitial fires. Use the Narrator voice. This is the only Narrator beat the player sees early.

### f) **Save key migration to a versioned namespace**
When the lore rename ships, bump `incremental.save.v1` → `eots.save.s1.v1`. Write a one-time migration from v1 that copies fields verbatim. Reason: future seasons get their own key prefix and we don't paint ourselves into a corner.

### g) **Visible currency rename**
The cheap version of the rename: change every UI string that says "coin" / "coins" / displays the coin icon to "Echoes" / the Echo glyph. Field name in code stays as `state.amount` so no save migration is required.

---

## Conversion order (if/when we do the rename)

Suggested order of operations when we move from this doc to the codebase:

1. **Visible currency rename** (§g) — low risk, big aesthetic payoff.
2. **Buff renames** (table above) — `id`s stay; `name`/`desc` flip.
3. **Permanent multiplier renames** — same.
4. **Gamble renames** — same.
5. **Convert + gift renames** — same.
6. **Dynamic-tier renames** — touch `genBaseAdd` / `genGift` templates in `src/upgrades.js`.
7. **Interstitial rewrites** — see [`interstitials.md`](./interstitials.md).
8. **Image rollouts** — Echo glyph + boot screen.
9. **Save key migration** (§f) — once stable.
10. **Contact Log + Anomaly Counter** (§a, §b) — actual new mechanics.

Don't bundle 1–10 into one PR. Ship in order; each is a clean revert if a tone-test fails.
