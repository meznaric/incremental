# Image Style Guide

How visual references for *Echoes Beyond the Stars* are generated, named, and refreshed.

## Visual DNA — one paragraph

Digital illustration. Hand-painted concept art for a narrative-game key-art look — *not* photoreal cinematic stills. Strong silhouettes. Soft painterly brushwork. Limited cool palette (deep slate, steel-blue, charcoal, near-black) with sparing warm tungsten accents reserved for focal points. Slight paper-grain feel. Grounded, severe, lonely. *Wonder buried under dread.*

Isolated subjects (the Echo glyph, character portraits) render on pure flat matte-black so they drop into the game's dark UI cleanly — no fake "studio" background, no environment, no cast shadow on the canvas. Scene shots (the Console, the Cell, episode worlds, tagline) keep an atmospheric environment but stay painterly, not photographic.

## Canonical prompt prefix

Every generated image is prepended with this exact string. Locked. If we change it, we rerun the whole set so they stay consistent.

```
Digital illustration in the style of contemporary narrative-game key art.
Hand-painted concept art look. Painterly brushwork with confident edges.
Strong silhouette readability. Soft brush textures with a slight paper-grain feel.
Not photorealistic — no photoreal skin pores, no film grain, no lens flare,
no chromatic aberration, no camera-bokeh effects.
Limited cool palette: deep slate, steel-blue, charcoal, near-black,
with sparing warm tungsten accents reserved for focal points.
No text, no logos, no UI overlays, no captions, no rank insignia, no readable writing.
Severe and lonely mood. Wonder buried under dread.
```

Source of truth: `CANONICAL_PREFIX` in [`scripts/gen-images.py`](./scripts/gen-images.py).

Isolated subjects also receive `ISOLATED_SUFFIX` (also in `gen-images.py`) which forces a pure #000000 background and forbids any environment/floor/cast shadow.

## Banned in prompts

- "neon"
- "chrome", "lens flare", "bokeh"
- "photorealistic", "cinematic still", "photographic"
- "hologram" except as "holo-glass" / "holo-glass display" (flat planar surfaces, not floaty volumetric)
- Any actor name. Any real-person likeness. Any IP character.
- Any text or logo. (Imagen sometimes invents text when given a chance. Always explicitly forbid it in the body.)
- "anime", "cartoon", "chibi", "manga" — we want painterly illustration, not Japanese-cartoon style.
- "warm tones", "golden hour" — we're night-coded.

## Generated reference set

All under [`images/`](./images/). Filename = subject. PNG. Generated with Imagen 4 (`imagen-4.0-generate-001`).

| File | Aspect | Mode | Subject | Used for |
| --- | --- | --- | --- | --- |
| `echo-glyph.png` | 1:1 | isolated | The Echo glyph — stylised waveform on flat black | Future currency icon, boot screen, favicon |
| `kalen-portrait.png` | 1:1 | isolated | Kalen Vale — bust portrait on flat black | In-game character card, interstitials, marketing |
| `sera-portrait.png` | 1:1 | isolated | Sera Venn — bust portrait on flat black | In-game character card, interstitials, marketing |
| `the-console.png` | 16:9 | scene | Kalen's workstation | Shop-panel mood board; in-game ambient art |
| `interrogation-cell.png` | 16:9 | scene | The matte-grey cell | Interstitial backgrounds for Sera's lines |
| `the-grid-relay.png` | 16:9 | scene | A FTL relay node | Establishing shot; finale teaser |
| `desert-ahn-tar.png` | 16:9 | scene | Ep 1 — Ahn-Tar-3 | Milestone art for `milestone_1k` |
| `sea-choir-solunn.png` | 16:9 | scene | Ep 2 — Solunn | Milestone art for `milestone_1m` |
| `sky-language-vehrn.png` | 16:9 | scene | Ep 3 — Vehrn-9 | Milestone art for `milestone_1b` |
| `the-dark-was-never-silent.png` | 16:9 | scene | Tagline shot — emitters waking | End-state and tagline drops |

**Isolated mode** = subject on pure #000000, no environment. Because the game canvas is `#0a0a14` (near-black), the flat-black backdrop reads as "no background" — Imagen 4 doesn't output transparent PNGs, but isolated-mode images can be `<img>`-dropped on the dark UI without seams. If true alpha is ever needed for a non-dark surface, run the isolated PNG through a chroma-key step (not currently implemented).

**Scene mode** = atmospheric environment, but still painterly — not photoreal.

### Not generated yet — proposed next set

- `tarsus-fire-given.png` (Ep 4) — the moment of the city loss, from orbit, distant, near-silent.
- `lehl-perfect-garden.png` (Ep 5) — Lehlan elder listening, alone, evening light.
- `missing-world-empty.png` (Ep 6) — the star chart with one star gone, surveillance footage feel.
- `echoes-evidence-wall.png` (Ep 7) — Sera and Kalen's pinboard with the route patterns marked.
- `finale-firefly-sector.png` (Ep 8) — closer version of `the-dark-was-never-silent`, less abstract.
- `listener-silhouette.png` — the silent observer behind Sera. Faces obscured.

Add these to `IMAGES` in `gen-images.py` and rerun. Keep one consistent style.

## Regenerating

```
GEMINI_API_KEY=... python3 docs/lore/scripts/gen-images.py
```

Flags:
- `--only NAME [NAME ...]` — regenerate just these subjects.
- `--force` — overwrite existing files (default: skip if present).
- `--workers N` — parallelism (default 4; Imagen 4 quota usually OK at this rate).
- `--out DIR` — alternate output directory.

Run from project root.

## When to regenerate

- The prefix changed.
- A character's wardrobe / age / look description changed in [`characters.md`](./characters.md). *Sync the prompt body in `gen-images.py` first*, then rerun that subject.
- An image looks off-style enough that the inconsistency stands out next to the others. Imagen 4 is non-deterministic; one bad roll is normal — regenerate.

## When NOT to regenerate

- "I'd prefer a slightly different pose." That's a different image. Add a new subject, don't churn the canonical one.
- After a story rewrite that doesn't touch visual description.

## File hygiene

- PNG. ~1 MB each. Acceptable to commit at current sizes (10 images ≈ 12 MB total).
- If the set grows past ~30 images, move to `images/lfs/` with Git LFS or push them out to a separate static bucket. Don't bloat the main repo.
- Filenames lowercase, hyphen-separated. No spaces.
