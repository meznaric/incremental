#!/usr/bin/env python3
"""
Generate the canonical lore reference images via Google Imagen 4.

Usage:
    GEMINI_API_KEY=... python3 docs/lore/scripts/gen-images.py [--only NAME ...] [--out DIR]

Idempotent for already-present files: pass --force to regenerate.

The CANONICAL_PREFIX locks the visual DNA. If we ever revise the show's look,
edit it here and rerun — every image will share the new style.

Notes
-----
- Imagen 4 endpoint:
    https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict
  Body shape: {"instances":[{"prompt": "..."}], "parameters":{"sampleCount":1,"aspectRatio":"16:9"}}
- Output: base64 PNG under predictions[0].bytesBase64Encoded.
- Aspect ratios supported: "1:1", "3:4", "4:3", "9:16", "16:9".
- We do not generate likenesses of named real people. Character portraits are
  described in age/wardrobe/lighting terms only — no actor references, no
  copyrighted-character references.
"""
from __future__ import annotations
import argparse
import base64
import concurrent.futures
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"

# The single source of truth for visual DNA. Read by every prompt below.
#
# Style: digital illustration / hand-painted concept art. NOT photoreal.
# We want a unified narrative-game key-art look — readable silhouettes, soft
# painterly edges, limited cool palette, restrained mood lighting.
CANONICAL_PREFIX = (
    "Digital illustration in the style of contemporary narrative-game key art. "
    "Hand-painted concept art look. Painterly brushwork with confident edges. "
    "Strong silhouette readability. Soft brush textures with a slight paper-grain feel. "
    "Not photorealistic — no photoreal skin pores, no film grain, no lens flare, "
    "no chromatic aberration, no camera-bokeh effects. "
    "Limited cool palette: deep slate, steel-blue, charcoal, near-black, "
    "with sparing warm tungsten accents reserved for focal points. "
    "No text, no logos, no UI overlays, no captions, no rank insignia, no readable writing. "
    "Severe and lonely mood. Wonder buried under dread. "
)

# Suffix added to "isolated" subjects (icon + portraits) so they drop into the
# dark UI cleanly. We deliberately request pure #000000 background — the game
# canvas is #0a0a14, so a flat-black backdrop reads as "no background" without
# us needing alpha channels. (Imagen 4 doesn't output transparent PNGs.)
ISOLATED_SUFFIX = (
    " Subject isolated on a pure flat matte-black background, hex #000000. "
    "No environment, no floor, no cast shadow on background, no border, no vignette, "
    "no atmospheric particles. The black extends to all four edges."
)

# (name, aspect_ratio, isolated, prompt_body)
IMAGES = [
    (
        "echo-glyph", "1:1", True,
        "A symbolic in-world emblem: a stylised expanding waveform made of three concentric arcs, "
        "centred in frame, occupying roughly 60% of the canvas. "
        "Painted with confident brushstrokes in cool steel-blue, with a thin warm tungsten highlight "
        "tracing the inside of each arc. Subject reads clearly at small icon sizes. "
        "Iconic, graphic, slightly hand-drawn imperfection — not a vector logo."
    ),
    (
        "kalen-portrait", "1:1", True,
        "Painted bust portrait of a 29-year-old fictional comms engineer character. "
        "Slim build, slightly slumped shoulders, tired eyes, no smile, looking just past the camera. "
        "Worn charcoal coat over a layered grey tech-fabric shirt. "
        "A small brass-coloured tuning knob hanging from a thin leather thong around the neck. "
        "A simple matte ear-cuff on the left ear. "
        "Half the face in deep shadow; the lit half washed by an unseen cool-blue console glow. "
        "Painterly hair, simplified rendering. The bust fills the frame top to bottom; no environment behind him."
    ),
    (
        "sera-portrait", "1:1", True,
        "Painted bust portrait of a fictional female military general in her 50s. "
        "Mixed-heritage features, short hair grey at the temples, calm severe expression, looking directly forward. "
        "Wearing a plain dark formal jacket with one small collar pin — no insignia, no rank stripes, no medals. "
        "Compact build, upright posture, shoulders square. Hands not visible. "
        "Even cool top-light with a subtle warm rim along the jaw. "
        "Painterly skin, simplified rendering. The bust fills the frame top to bottom; no environment behind her."
    ),
    (
        "the-console", "16:9", False,
        "Painted interior of a private engineering workstation in a small dim cubicle on a space station. "
        "An L-shaped desk crowded with analog brass tuning knobs, patch jacks, a soft paper notebook open to handwritten notes, "
        "a thin holo-glass display showing a faint waveform, and a single warm tungsten desk lamp. "
        "Walls densely cabled. A drained ceramic mug. An empty chair. "
        "Deep shadows in the corners, one warm pool of light on the desk surface. "
        "Painterly soft edges, simplified shapes, atmospheric perspective."
    ),
    (
        "interrogation-cell", "16:9", False,
        "Painted interior of a sparse interrogation room. Matte grey featureless walls. "
        "A steel table at the centre with two empty chairs facing each other. "
        "A single thin file folder lying on the table. No window. No door visible. "
        "Recessed ceiling panel emits a flat, slightly cold light, too even. "
        "No people in frame. Strong negative space. Painterly, restrained palette."
    ),
    (
        "the-grid-relay", "16:9", False,
        "Painted establishing shot in deep space of an enormous brutalist FTL relay station — "
        "roughly half the size of a moon, centuries old. Dark angular hull traced with faint cool-blue luminous veins "
        "running along seams. A tiny cutter spacecraft approaches from screen-left, dwarfed by the relay's mass. "
        "Cold distant starfield behind. No planets, no lens flare. "
        "Painterly silhouette, atmospheric distance, severe and silent."
    ),
    (
        "desert-ahn-tar", "16:9", False,
        "Painted wide illustration of a pre-industrial arid alien culture's settlement at dusk. "
        "A crude wooden radio tower silhouetted against twin pale moons low on the horizon. "
        "Small stone houses lit from within by amber oil lamps. "
        "A robed teenage figure with their back to the viewer leans toward a brass-coloured receiver on a low stone table outside one house. "
        "Dust on the air, long shadows, cool indigo sky transitioning to a warm horizon band. "
        "Painterly skies, simplified architectural forms, no text on any sign or banner."
    ),
    (
        "sea-choir-solunn", "16:9", False,
        "Painted underwater wide illustration in a deep dark ocean on an alien water world. "
        "A massive bioluminescent cetacean-analog creature drifts in mid-frame, skin marked with soft cool-blue patterns. "
        "Vertical bands of pressure waves faintly visible in the water around it, spreading outward. "
        "No land, no surface, no sun. Painterly volumetric water, simplified silhouette, deep darkness at the edges."
    ),
    (
        "sky-language-vehrn", "16:9", False,
        "Painted wide illustration of an industrial 19th-century-equivalent alien city at night. "
        "Smoke stacks lit from below in warm amber. Tightly packed slate rooftops, narrow streets. "
        "Above the city, faint auroras stretch across the sky in subtle ribbon-like undulating patterns — "
        "abstract waveforms only, with no readable letters or glyphs. "
        "A small copper-domed observatory perched on a hill overlooking the city, one lit window. "
        "Painterly atmosphere, soft brushwork, simplified geometry."
    ),
    (
        "the-dark-was-never-silent", "16:9", False,
        "Painted wide vista of deep space looking out across a sector. "
        "Hundreds of faint pinpoint lights waking in a slow-spreading cascade across the frame, "
        "as if young worlds are simultaneously beginning to emit. "
        "Cold near-black background, faint nebular dust in cool slate-blue. "
        "Painterly, simplified, ominous. No spaceships, no planets visible, no text."
    ),
]


def call_imagen(prompt: str, aspect: str, api_key: str, timeout: int = 90) -> bytes:
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": aspect},
    }
    req = urllib.request.Request(
        f"{API_ENDPOINT}?key={api_key}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    preds = payload.get("predictions") or []
    if not preds or "bytesBase64Encoded" not in preds[0]:
        # Surface safety / quota / format errors with context.
        raise RuntimeError(f"no image in response: {json.dumps(payload)[:600]}")
    return base64.b64decode(preds[0]["bytesBase64Encoded"])


def generate_one(name: str, aspect: str, isolated: bool, body: str,
                 out_dir: Path, api_key: str, force: bool):
    path = out_dir / f"{name}.png"
    if path.exists() and not force:
        return f"skip   {name}  (exists, --force to regen)"
    prompt = CANONICAL_PREFIX + body + (ISOLATED_SUFFIX if isolated else "")
    try:
        data = call_imagen(prompt, aspect, api_key)
    except urllib.error.HTTPError as e:
        return f"FAIL   {name}  HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}"
    except Exception as e:  # noqa: BLE001
        return f"FAIL   {name}  {type(e).__name__}: {e}"
    path.write_bytes(data)
    tag = "isolated" if isolated else "scene"
    return f"wrote  {name}  ({len(data)//1024} KB, {aspect}, {tag})"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="docs/lore/images")
    p.add_argument("--only", nargs="*", help="limit to named subjects")
    p.add_argument("--force", action="store_true")
    p.add_argument("--workers", type=int, default=4)
    args = p.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY not set")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    requested = set(args.only) if args.only else None
    jobs = [t for t in IMAGES if requested is None or t[0] in requested]
    if not jobs:
        sys.exit("nothing to generate (check --only)")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(generate_one, n, a, iso, b, out_dir, api_key, args.force): n
                for (n, a, iso, b) in jobs}
        for f in concurrent.futures.as_completed(futs):
            print(f.result(), flush=True)


if __name__ == "__main__":
    main()
