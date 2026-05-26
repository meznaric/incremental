# Incremental — *Echoes Beyond the Stars* companion game

3D incremental/idle. Three.js. Zero-build. Static deploy. Companion to dark sci-fi drama *Echoes Beyond the Stars*. **Player = Kalen Vale.** Number go up = signal — *Echoes* — return from dark.

> *The dark was never silent.*

## Run

```
python3 -m http.server 8765
```

Open `http://localhost:8765/`. No npm. No bundler. No build. Ever.

## Layout

```
index.html          # entry: HUD markup, importmap, <link>s to styles/*.css. ~400 lines.
styles/             # per-feature CSS: base, shop, welcomeBack, interstitial, cyclePattern, network
src/main.js         # bootstrap: state + scene + game loop. ~340 lines.
src/mainUi.js       # all HUD/shop/buff/toolbar/modal rendering. initMainUi(state, deps)
src/<name>.js       # pure logic — testable, no DOM, no three.js
src/<name>Ui.js     # DOM/HTML half — renders, wires taps, consumes the pure module
src/<name>-data.js  # static catalogues (worlds-data, upgrades-data, periods-data). Pure const exports.
src/tap.js          # installTap() — use for every in-game tap. Header explains the iOS pain.
src/save.js         # SAVE_KEY (currently `v14`), saveState / loadState
vendor/             # three.module.min.js + three.core.min.js (pinned r171)
test/               # node --test files, one per pure module
docs/lore/          # in-world content — start at docs/lore/README.md
```

New modules → `src/`, import from `main.js`. `vendor/` = third-party only. CSS → add a rule to the matching `styles/*.css` (or create a new file + `<link>` in `index.html` + entry in `sw.js` PRECACHE for new features). Static catalogues that >500 lines → split into `name-data.js` so logic edits don't drown in tables.

## Architecture

- **State**: one `state` object in `src/main.js`. Mutate direct. Persist to `localStorage` key `incremental.save.v14` — bump suffix on breaking schema change.
- **Loop**: one `requestAnimationFrame`. Time logic = `dt` seconds, never frame count.
- **Render**: one `THREE.Scene`, one `WebGLRenderer`. Resize handler = full viewport.
- **Input**: raycaster vs meshes for the 3D scene. All HUD/modal taps go through `installTap()`. Plain `addEventListener('click', …)` drops taps on iOS — don't use it.

## Patterns

- **Logic / UI split.** `foo.js` is pure (`tryBuy`, `placeRelay`, `integrateRate`-style math) — no DOM, no three.js, importable from Node. `fooUi.js` renders HTML, wires taps, mutates the modal. Tests cover the pure half only. When adding behaviour, ask: is this state math (→ `foo.js`) or pixels (→ `fooUi.js`)?
- **Taps**: `installTap(el, handler)` from `src/tap.js` is the only sanctioned way. iOS drops synthesized `click`s when ancestor HTML rewrites mid-gesture, and Android scroll-pans fire stale taps. The header in `src/tap.js` documents every failure mode that's been fixed — read it before "improving" the helper.
- **Two persistence keys, not one.** `SAVE_KEY` (`incremental.save.v14`) holds the gameplay run — wiped by Cycle close. `contactLog` lives under its own key in `src/contactLog.js` — survives Cycle close so prestige (Echo Memory, Carrier Mass, Engravings) carries across runs. Don't merge them.
- **Tuning lives next to code.** Cooldown ms, hex radius, drop rates, sector multipliers — all inline as `const` at the top of the module that uses them. No config files.

## Constraints (non-negotiable)

- No build tools. No `node_modules`. Only `package.json` = 1-line `{ "type": "module" }` so Node treats `src/*.js` as ESM for tests. No deps. No scripts.
- No CDN imports at runtime. Vendor all under `vendor/`.
- Three.js pinned. Upgrade: download `three.module.min.js` + `three.core.min.js` same version, commit together.
- ES modules only. No `window` globals.
- Plain JS. No TypeScript. No JSX.

## Style

- Terse. No comments unless *why* non-obvious.
- No premature abstractions. Inline until 3+ uses.
- Tuning constants live next to code, not config file.

## Testing

```
node --test test/
```

Node built-in runner. No deps. Covers pure logic likely to break: `integrateRate` math, `save`/`load` round-trips, `tryBuy` flows, `bignum` format/parse. three.js / DOM / `window` = out of scope.

Visual/render regressions: Playwright via MCP — start server, navigate, check `browser_console_messages`, screenshot. Only on user ask.

## Workflow

- **Commit messages**: single-line imperative, sentence case, no trailing period, ≤~72 chars. Body (optional, blank line above) explains *why* — past commits like `ab49b4c`, `619e648`, `fe3543a` are the template. Don't summarise the diff; describe the failure mode the change fixes or the behaviour it adds.
- **`queue.txt`** (untracked, root): personal feature queue consumed by the `/queue-tasks` skill. Don't `git add` it. `Merge Task N: …` commits in the log are queue-tasks output.
- **iOS / mobile is a first-class target.** Every tappable element gets tested on a touch viewport. The commit log is littered with iOS tap fixes — assume any new interactive UI will need the same scrutiny.
- **Player-facing changelog** ([`src/updates-data.js`](./src/updates-data.js)): before pushing anything a returning player will notice — new content, balance shifts, UI changes — prepend an entry. Topmost entry's `date` becomes the displayed version. One or two sentences, written *for a player coming back to the game*, not as a commit summary. Major updates set `highlight: true`. Skip refactors, internal plumbing, single-typo fixes. The "Updates" menu item lights up when the top date moves past a player's watermark, so a missing entry means the dot never fires for real changes.

## Save compatibility

`state` shape change:
1. Bump `SAVE_KEY` suffix (`v1` → `v2`).
2. Old saves drop on next load. Fine during dev.
3. Post-ship: write migration in `load()`.

## Deploy caching

GitHub Pages serves via `sw.js`, service worker. **Cache-firsts every static asset** (incl. `src/*.js`, `vendor/*`). Stale `src/main.js` = failure mode — fresh HTML imports same URL, SW intercepts, serves cache.

Cache key = `CACHE_VERSION` in `sw.js`. **Bump per deploy = invalidate all cached assets for existing players.** Pages workflow (`.github/workflows/pages.yml`) does this auto: `sed` rewrites `CACHE_VERSION` to commit SHA inside `_site/sw.js` pre-upload, `grep -q` after fails build if sub didn't land. **Don't break `CACHE_VERSION = '…'` line shape** in `sw.js` — rename or requote = update sed + grep in `pages.yml` to match.

Local dev does **not** register the SW. `index.html` short-circuits on `localhost` / `127.0.0.1` / `0.0.0.0` / `::1`, and also unregisters any SW + deletes any `caches` left over from earlier dev sessions. So `src/*` edits show up on plain refresh — no `CACHE_VERSION` bump needed. If you're chasing a "stale shell" bug on localhost, the SW is not the culprit; it's not running.

Rest of chain robust: SW install uses `{cache: 'reload'}` → bypass HTTP cache. `skipWaiting()` + `clients.claim()` → activate new SW immediately. `controllerchange` listener in `index.html` → auto-reload page on update. Players get fresh build mid-session, no prompt.

**Watch out**: `pages.yml`'s deploy step is an allowlist — `cp -r index.html src vendor styles _site/` and a hand-rolled list of root-level static files. Adding a new top-level directory (`styles/`, future `data/`, etc.) needs an explicit entry there; local dev will serve it from the repo root and hide the omission. Same for new precache entries in `sw.js`.

## Lore — read before adding content

All story, world, character, naming, voice, image refs under [`docs/lore/`](./docs/lore/). Start at [`docs/lore/README.md`](./docs/lore/README.md). Mapping from mechanics to in-world names in [`docs/lore/game-mapping.md`](./docs/lore/game-mapping.md) — canonical naming source for new upgrade / buff / gamble / convert.

Lore rename rolled out for **display strings**: currency = Echoes. Gamble / buff / permanent-mul / convert tables in `src/upgrades-data.js` carry lore names (Stim Patch, Adaptive Filter, Carrier Bleed, etc.). Intentionally still casino-flavoured: **ids** (`coin_flip`, `mult_starter`, `red_black`) + **save key** prefix (`incremental.save.v14`). By design — ids stable across rename. Save-key migration = last item in [`game-mapping.md`](./docs/lore/game-mapping.md#conversion-order-ifwhen-we-do-the-rename). Write copy → lore names. Reference upgrades in code → ids.

### Non-negotiable for in-world copy

- **Player = Kalen.** Never "you, the user." Game speaks *to Kalen* or *as Kalen*. Voices: **Kalen** (first person, ambient), **Sera** (second person, procedural), **Narrator** (third person, rare), **Anonymous** (italic, one sentence, ~once per season). See [`docs/lore/voice-and-tone.md`](./docs/lore/voice-and-tone.md).
- **Currency = *Echoes*.** Plural. Icon = triple-arc Echo glyph (see [`docs/lore/images/echo-glyph.png`](./docs/lore/images/echo-glyph.png)). Code field `state.amount` stays. Only display labels change.
- **No real-world refs.** No emoji. No internet vernacular. No fourth-wall breaks. No swearing.
- **No Trek terms.** Banned list in [`docs/lore/naming-conventions.md`](./docs/lore/naming-conventions.md#names-you-should-not-use-ip--trek-overlap). Find one in draft → rewrite.
- **Every new term → [`docs/lore/naming-conventions.md`](./docs/lore/naming-conventions.md).** Worth using = worth being canonical.
- **Every new interstitial declares voice** via `// voice: …` comment above `INTERSTITIALS[key]` block. See [`docs/lore/interstitials.md`](./docs/lore/interstitials.md).
- **Story commitments → [`docs/lore/episodes.md`](./docs/lore/episodes.md).** Don't answer S2/S3 mysteries in S1 content. Reveal order matters.

### Generating images

Use [`docs/lore/scripts/gen-images.py`](./docs/lore/scripts/gen-images.py). Script bakes canonical visual-DNA prompt prefix. Do not call Imagen endpoint with ad-hoc prompts. Visual DNA changes → edit `CANONICAL_PREFIX` in script, rerun full set so all stays consistent. Style rules + banned terms in [`docs/lore/image-style-guide.md`](./docs/lore/image-style-guide.md).

## Keeping this doc current

This file is the briefing a fresh Claude reads before touching the repo. Goal: enough that exploration is rare, terse enough that it's still scannable. Update it when:

- **A new convention emerges that a stranger wouldn't guess** — a load-bearing helper (`installTap`), a naming pattern (`foo.js` ↔ `fooUi.js`), an invariant (`contactLog` survives Cycle close).
- **A constraint changes** — build tooling, vendored versions, deploy chain, where CSS lives, where the entry-point's render code lives.
- **A pointer goes stale** — `SAVE_KEY` version, line numbers, file paths cited above.
- **A foot-gun gets fixed** — if you spent >15 min rediscovering something the codebase had quietly learned (iOS taps, SW cache invalidation), record the lesson here so the next Claude doesn't pay the same tax.

Skip the update for:

- One-off bug fixes, balance tuning, copy changes, refactors.
- Anything a `git log -p` or `ls src/` reveals in under a minute.
- Specific feature details — those belong in code, commit messages, or `docs/lore/`.

Style: lead with the rule, then *why* only if non-obvious. Prefer `file.js:line` over prose. If a section grew past ~8 bullets, it's drifting into reference docs — push the detail into the source file's header comment and link to it.
