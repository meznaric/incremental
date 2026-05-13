# Incremental

3D incremental/idle game. Three.js, zero-build, deploys as static files.

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

- No build tooling. No `package.json`. No `node_modules`.
- No CDN imports at runtime. All deps vendored under `vendor/`.
- Three.js stays pinned. To upgrade: download both `three.module.min.js` and `three.core.min.js` from the same version, commit together.
- ES modules only. No globals on `window`.
- Plain JS. No TypeScript, no JSX.

## Style

- Terse. No comments unless the *why* is non-obvious.
- No premature abstractions. Inline until something is used 3+ times.
- Numbers and tuning constants live next to the code that uses them, not in a config file.

## Testing

Playwright via MCP. Start the server, navigate to the page, check `browser_console_messages` for errors, screenshot to verify visuals. There is no test suite — visual + console check is the contract.
Only do this when user asks.

## Save compatibility

When `state` shape changes:
1. Bump `SAVE_KEY` suffix (`v1` → `v2`).
2. Old saves are dropped on next load. That is acceptable during development.
3. Once we ship, write a migration in `load()` instead.
