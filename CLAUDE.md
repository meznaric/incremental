# Incremental — *Echoes Beyond the Stars* companion game

3D incremental/idle game. Three.js, zero-build, deploys as static files. Companion to the dark sci-fi drama *Echoes Beyond the Stars*. **The player is Kalen Vale.** The number going up is signal — *Echoes* — returning from the dark.

> *The dark was never silent.*

## Run it

```
python3 -m http.server 8765
```

Open `http://localhost:8765/`. No npm, no bundler, no build step. Ever.

## Layout

```
index.html          # entry: HUD markup, import map, styles
src/main.js         # game loop, scene, state, save/load
vendor/             # three.module.min.js + three.core.min.js (pinned r171)
```

Add new modules under `src/` and import them from `main.js`. Keep `vendor/` for third-party only.

## Architecture

- **State**: single `state` object in `src/main.js`. Mutated directly. Persisted to `localStorage` under `incremental.save.v1` — bump the key suffix on breaking schema changes.
- **Loop**: one `requestAnimationFrame` driver. All time-based logic uses `dt` seconds, never frame count.
- **Rendering**: one `THREE.Scene`, one `WebGLRenderer`. Resize handler keeps it full-viewport.
- **Input**: raycaster against meshes. Don't add DOM buttons over the canvas unless the HUD layer needs them.

## Constraints (non-negotiable)

- No build tooling. No `node_modules`. The only `package.json` is a 1-line `{ "type": "module" }` so Node treats `src/*.js` as ESM for tests — no deps, no scripts.
- No CDN imports at runtime. All deps vendored under `vendor/`.
- Three.js stays pinned. To upgrade: download both `three.module.min.js` and `three.core.min.js` from the same version, commit together.
- ES modules only. No globals on `window`.
- Plain JS. No TypeScript, no JSX.

## Style

- Terse. No comments unless the *why* is non-obvious.
- No premature abstractions. Inline until something is used 3+ times.
- Numbers and tuning constants live next to the code that uses them, not in a config file.

## Testing

```
node --test test/
```

Uses Node's built-in test runner (no deps). Covers the pure logic that's likely to break: `integrateRate` math, `save`/`load` round-trips, `tryBuy` flows, `bignum` format/parse. Anything that touches three.js / DOM / `window` is out of scope here.

For visual / rendering regressions: Playwright via MCP — start the server, navigate to the page, check `browser_console_messages`, screenshot to verify. Only run this when the user asks.

## Save compatibility

When `state` shape changes:
1. Bump `SAVE_KEY` suffix (`v1` → `v2`).
2. Old saves are dropped on next load. That is acceptable during development.
3. Once we ship, write a migration in `load()` instead.

## Deploy caching

GitHub Pages serves through `sw.js`, a service worker that **cache-firsts every static asset** (incl. `src/*.js`, `vendor/*`). Stale `src/main.js` is the failure mode — fresh HTML still imports the same URL, which the SW intercepts and serves from cache.

The cache key is `CACHE_VERSION` in `sw.js`. **Bumping it per deploy invalidates every cached asset for existing players.** The Pages workflow (`.github/workflows/pages.yml`) does this automatically: a `sed` rewrites `CACHE_VERSION` to the commit SHA inside `_site/sw.js` before upload, and a `grep -q` immediately afterwards fails the build if the substitution didn't land. **Don't break the `CACHE_VERSION = '…'` line shape** in `sw.js` — if you ever rename it or change the quoting, update the sed and grep in `pages.yml` to match. Local dev keeps the static value baked into `sw.js`, which is fine because dev cache state is scoped to `localhost`.

The rest of the chain is robust: SW install uses `{cache: 'reload'}` so it bypasses HTTP cache; `skipWaiting()` + `clients.claim()` activate the new SW immediately; a `controllerchange` listener in `index.html` auto-reloads the page on update, so players get the fresh build mid-session without an explicit prompt.

## Lore — read before adding content

All story, world, character, naming, voice, and image references live under [`docs/lore/`](./docs/lore/). Start at [`docs/lore/README.md`](./docs/lore/README.md). The mapping from existing mechanics to in-world names is in [`docs/lore/game-mapping.md`](./docs/lore/game-mapping.md) — that is the canonical naming source for any new upgrade / buff / gamble / convert.

The lore rename has rolled out for **display strings**: currency reads as Echoes, and the gamble / buff / permanent-mul / convert tables in `src/upgrades.js` carry their lore names (Stim Patch, Adaptive Filter, Carrier Bleed, etc.). What's intentionally still casino-flavoured: **ids** (`coin_flip`, `mult_starter`, `red_black`) and the **save key** (`incremental.save.v1`). That's by design — ids are stable across the rename, and the save-key migration is the last item in [`game-mapping.md`](./docs/lore/game-mapping.md#conversion-order-ifwhen-we-do-the-rename). When you write copy, use the lore names; when you reference upgrades in code, use the ids.

### Non-negotiable when writing in-world copy

- **The player is Kalen.** Never "you, the user." The game speaks *to Kalen* or *as Kalen*. Voices are: **Kalen** (first person, ambient), **Sera** (second person, procedural), **Narrator** (third person, rare), **Anonymous** (italic, one sentence, ~once per season). Details in [`docs/lore/voice-and-tone.md`](./docs/lore/voice-and-tone.md).
- **Currency is *Echoes*.** Plural. The icon is the triple-arc Echo glyph (see [`docs/lore/images/echo-glyph.png`](./docs/lore/images/echo-glyph.png)). The code field `state.amount` stays as-is — only display labels change.
- **No real-world references.** No emoji, no internet vernacular, no fourth-wall breaks. No swearing.
- **No Trek terms.** Banned list in [`docs/lore/naming-conventions.md`](./docs/lore/naming-conventions.md#names-you-should-not-use-ip--trek-overlap). If you find one in a draft, rewrite.
- **Every new term goes into [`docs/lore/naming-conventions.md`](./docs/lore/naming-conventions.md).** If it's worth using, it's worth being canonical.
- **Every new interstitial declares a voice** via a `// voice: …` comment above its `INTERSTITIALS[key]` block. See [`docs/lore/interstitials.md`](./docs/lore/interstitials.md).
- **Story commitments live in [`docs/lore/episodes.md`](./docs/lore/episodes.md).** Don't answer S2/S3 mysteries in S1 content. The reveal order matters.

### When generating images

Use [`docs/lore/scripts/gen-images.py`](./docs/lore/scripts/gen-images.py). The script bakes in the canonical visual-DNA prompt prefix; do not call the Imagen endpoint with ad-hoc prompts. If the visual DNA changes, edit `CANONICAL_PREFIX` in that script and rerun the full set so everything stays consistent. Style rules + banned terms in [`docs/lore/image-style-guide.md`](./docs/lore/image-style-guide.md).
