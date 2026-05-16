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

    # --- Contact worlds previously rendered as abstract fallback art ---
    (
        "tarsus-minor-fire", "16:9", False,
        "Painted distant orbital view of an atomic-age alien continent at night. "
        "A scatter of dim industrial cities along a coastline. One inland city is in the first instant of vanishing: "
        "a pale near-white point of light directly at the surface with the leading edge of a fusion shockwave just beginning to bloom outward, "
        "still small in frame, severe and clinical. Faint cloud bands across the rest of the night side. "
        "Far horizon arcs gently against deep starfield. "
        "Painterly soft edges, cold restrained palette, no lens flare, no readable signage, no text. "
        "Mood: observed disaster at a great distance, witnessed not celebrated."
    ),
    (
        "lehl-quiet-garden", "16:9", False,
        "Painted wide illustration of a peaceful settled alien world at dusk. "
        "A long terraced garden of pale slender trees runs across the middle of the frame, "
        "with a low stone plinth in the foreground supporting a small unobtrusive radio dish facing upward. "
        "Two distant slender robed figures walk between the tree rows, calm and unhurried, hands at their sides. "
        "A wide pale lake beyond the garden; a soft warm horizon band fading into a deep blue sky. "
        "Painterly stillness, simplified architectural forms, no text on any sign or banner."
    ),
    (
        "designation-withheld", "16:9", False,
        "Painted wide vista of cold deep space. "
        "The composition is centred on a single faint cool-blue circular outline drawn on the starfield itself — "
        "the shape of a world that should be inside the circle, but the inside of the circle holds only more distant stars. "
        "No planet, no debris, no spacecraft. "
        "Faint slate-blue nebular dust off to one side; the rest is near-black. "
        "Painterly, simplified, lonely. The mood is absence. No text, no coordinate markings, no rangefinder graphics."
    ),

    # --- New intermediate contact worlds (story expansion) ---
    (
        "korv-stone-listeners", "16:9", False,
        "Painted interior wide illustration of a vast subterranean alien cavern. "
        "Pale eyeless humanoid burrower figures, low to the ground, are gathered around a small outcrop of glowing crystal "
        "that radiates a warm tungsten light. The figures' faces are tilted up toward the cavern ceiling, listening. "
        "Cool blue luminescent lichens trace seams in the dark stone walls. "
        "Distant tunnel mouths recede into deeper shadow at the edges. "
        "No surface light, no sky, no plants. Painterly simplified silhouettes, atmospheric depth, severe and quiet. "
        "No text, no readable carvings."
    ),
    (
        "mora-brae-auroras", "16:9", False,
        "Painted wide illustration of a glacial coastline on a cold alien world at night. "
        "Three small ice-block shelters huddled near a low fire. "
        "A single fur-clad bipedal figure stands apart on a low rise, back to the viewer, head tilted up toward "
        "a vast cool-blue and pale-green aurora ribbon that takes up the upper two-thirds of the frame. "
        "Snow-flecked black water in the middle distance; the aurora's reflection a faint shimmer on the surface. "
        "Painterly soft brushwork, simplified silhouettes, severe and lonely. No text, no banners, no readable patterns in the aurora."
    ),
    (
        "theran-canopy", "16:9", False,
        "Painted wide illustration of a forest-canopy alien city at twilight. "
        "Three enormous tree trunks the scale of skyscrapers rise through the frame, with spiral wooden terraces winding around their bark, "
        "each terrace dotted with small warm-lit dwellings. "
        "Slender glowing quartz-fibre lines are strung between branches like nerve threads, faint cool-blue light along them. "
        "One small arboreal figure stands on a high terrace, hand reaching out to touch a fibre. "
        "Soft mist pools in the lower canopy below. "
        "Painterly atmospheric depth, simplified silhouettes, no text on any sign."
    ),
    (
        "pellan-toth-glass", "16:9", False,
        "Painted wide illustration of an alien atomic-age city of tall slender glass towers at night. "
        "Faint cool-blue resonance patterns shimmer across the glass surfaces of the nearest towers, as if the glass itself is humming. "
        "A single robed Pellan figure stands on a low stone balcony in the foreground, one hand raised palm-up toward the towers, listening. "
        "Warm tungsten street lamps at ground level; cold blue glass above. "
        "Painterly soft edges, severe geometric architecture, no readable letters or glyphs on any tower, no text."
    ),
    (
        "iyarra-vell-scholars", "16:9", False,
        "Painted wide illustration of a long-lived scholar civilisation's observation plaza on a quiet alien world. "
        "A great paved courtyard beside a still black-water lake at night. "
        "Several elderly slender alien figures in plain robes sit at low stone desks, writing on faintly glowing glass slates. "
        "Behind the plaza, the dark silhouette of an enormous deep-space dish antenna reaches up toward a clear star-strewn sky. "
        "A soft warm horizon glow from a low city in the far distance. "
        "Painterly stillness, simplified silhouettes, restrained palette, no readable writing on the slates, no text on any sign."
    ),

    # ── EP 1: Discovery — bent civilisations around an unfamiliar voice ──
    (
        "ish-karal-steppe", "16:9", False,
        "Painted wide illustration of a nomadic alien steppe at dusk. A cluster of low fur-tent shelters scattered across rolling grass under a vast cool slate sky. "
        "In the foreground a single hand-cranked brass radio set sits on a folded woven blanket; a young figure in heavy felt robes leans close to its small speaker, head tilted, listening. "
        "Distant herd silhouettes graze on a far ridge. A single warm tungsten lantern on the nearest tent. "
        "Wind-bent grasses dominate the lower half of the frame; the horizon is empty. "
        "Painterly soft brushwork, simplified silhouettes, severe and lonely, no readable writing."
    ),
    (
        "belnesh-radio-shrine", "16:9", False,
        "Painted wide illustration of a coastal pre-industrial alien city at twilight. A low stone shrine on a cliff above a calm dark sea, "
        "with a tall slender brass radio horn at its centre. A small crowd of robed figures kneels in concentric arcs facing the horn, faces turned upward. "
        "Below, the lights of a quiet harbour scatter warm tungsten reflections on the water. "
        "Soft mist rises along the cliffside. The sky is deep slate with a single warm horizon band. "
        "Painterly soft edges, simplified architecture, severe restrained mood, no readable inscriptions, no text."
    ),
    (
        "daouns-reach-pilots", "16:9", False,
        "Painted wide illustration of a wooden seafaring alien ship at night on a calm dark ocean. "
        "Two robed pilots stand at the stern, one holding a long brass spyglass aimed at a sky filled with faint banded auroras and a single bright moon. "
        "Warm tungsten lamplight pools on the ship's deck; the rest of the sea is near-black. "
        "Sails hang half-furled. A few distant ships are faint silhouettes far off on the horizon. "
        "Painterly atmospheric depth, simplified silhouettes, no readable charts or text."
    ),
    (
        "hsareth-listener-guild", "16:9", False,
        "Painted wide illustration of a pre-industrial alien hilltop observatory at night. "
        "A circular stone enclosure with a wooden lattice tower at its centre, supporting a crude conical brass antenna pointed at the sky. "
        "Three robed sky-listeners sit on stone benches arranged around the tower, heads tipped back. "
        "A single warm tungsten brazier glows near the foreground. The surrounding hills fall away into deep slate dusk. "
        "Twin pale moons low on the horizon. Painterly silhouettes, simplified architecture, severe and quiet, no text on any banner."
    ),
    (
        "mirum-3-treaty-sky", "16:9", False,
        "Painted wide illustration of three small alien city-states arrayed along a wide river valley at evening. "
        "Each city distinct in silhouette — one with peaked roofs, one with low domes, one with terraced gardens — but all under a single broad pale ionospheric glow that arcs softly across the sky. "
        "A thin line of robed envoys walks across a stone bridge between two of the cities, carrying lit lanterns. "
        "Warm tungsten window-light scattered through each city; cool steel-blue sky above. "
        "Painterly soft edges, simplified architecture, severe and reflective mood, no readable signage, no text."
    ),
    (
        "halun-veth-academy", "16:9", False,
        "Painted wide illustration of an industrial-age alien academy at night, on a hillside above a dark city. "
        "A great circular paved courtyard with a single massive deep-space dish antenna at its centre, tilted toward the night sky. "
        "Robed scholars in small clusters stand near the dish, looking up. "
        "The city below glows in a tight cluster of warm tungsten lights; the rest of the landscape is deep slate. "
        "A faint star-strewn sky overhead. Painterly atmospheric depth, simplified silhouettes, severe and reverent, no readable writing on any surface."
    ),
    (
        "voun-salt-procession", "16:9", False,
        "Painted wide illustration of an alien religious world at dusk. A long procession of robed figures winds across pale salt flats toward a low temple of stacked stone. "
        "Each figure carries a small clay vessel cupped in both hands; some vessels glow faintly warm from within. "
        "Cracked salt patterns stretch to the horizon; the sky is deep slate with a single bruised warm band low on the horizon. "
        "Uneasy stillness, no wind. Painterly soft brushwork, simplified silhouettes, severe and clinical, no readable text on temple or vessels."
    ),
    (
        "sephir-2-harvest-hymn", "16:9", False,
        "Painted wide illustration of an alien agricultural world at dusk. Vast terraced fields of pale grain stretch across rolling hills, "
        "with hundreds of small robed figures kneeling in long rows mid-harvest, mouths open in a chant. "
        "A low wooden broadcast tower stands on a rise behind them, with a single warm tungsten lamp at its peak. "
        "Cool slate sky above; a thin warm horizon band. A few cut grain bundles in the foreground. "
        "Painterly atmospheric depth, simplified silhouettes, severe communal mood, no readable banners, no text."
    ),

    # ── EP 2: The Sea Choir — water-coded cultures reshaped by a sung carrier ──
    (
        "telnir-ice-choir", "16:9", False,
        "Painted wide illustration of a polar alien coastline at night. A long ice-shelf stretching across the frame, with thirty fur-clad bipedal figures standing in a curving choral line on the ice, mouths open in song. "
        "Their breath rises in pale plumes. A single warm tungsten brazier sits at the line's midpoint. "
        "Behind them, a calm black sea reflects a thin band of cool-green polar light low on the horizon. "
        "Painterly soft edges, simplified silhouettes, severe and choral, no readable patterns in the sky, no text."
    ),
    (
        "achos-tidal-calendar", "16:9", False,
        "Painted wide illustration of an alien coastal city at low tide under twin pale moons. "
        "A vast curving stone seawall in the foreground, marked with rows of softly worn tidal notches. "
        "A small group of robed tide-readers crouches at the wall's base, hands resting on the stone. "
        "Beyond the wall, the city's low slate roofs catch a faint warm tungsten glow from inside; the exposed seabed glistens dark and wet. "
        "Painterly atmospheric depth, simplified silhouettes, severe quiet mood, no readable markings, no text."
    ),
    (
        "ven-thar-reef-prophet", "16:9", False,
        "Painted wide illustration of an underwater alien reef at deep dusk. "
        "Bioluminescent reef structures form a curved amphitheatre in cool blue tones; small reef-dwelling figures, slender and finned, drift in a wide arc around a single larger figure at the centre with arms outstretched. "
        "Faint cool-blue particles suspended in the water around the central figure. The water deepens to near-black at the edges of the frame. "
        "Painterly volumetric water, simplified silhouettes, uneasy reverent mood, no readable patterns on the reef, no text."
    ),
    (
        "drath-salt-caravan", "16:9", False,
        "Painted wide illustration of a salt-plain caravan at deep night on a flat alien world. "
        "A long line of six-legged camel-analogue beasts of burden walks single-file across cracked white salt, robed nomadic figures riding on top. "
        "Halfway along the caravan a small cluster of figures has dismounted and gathered around a slim copper-fibre receiving station planted into the salt; one figure presses an ear to the copper. "
        "The sky is deep slate with a faint warm horizon band far off. "
        "Painterly soft brushwork, simplified silhouettes, severe lonely mood, no readable scripture, no text."
    ),
    (
        "quel-sin-radio-monks", "16:9", False,
        "Painted wide illustration of an alien monastery courtyard at dawn. "
        "A square stone courtyard with thirty robed monks kneeling in seven concentric rings around a central low brass broadcast horn. "
        "Each ring's robes a slightly different shade. Their mouths are open in a held tone; the horn glows faintly warm. "
        "Tall slender prayer-towers rise from each corner of the courtyard. A cool slate sky with a thin warm horizon band. "
        "Painterly atmospheric depth, simplified silhouettes, severe communal mood, no readable inscriptions, no text."
    ),
    (
        "eolun-moon-colony", "16:9", False,
        "Painted wide illustration of an underwater colony on an alien moon's deep ocean. "
        "A cluster of large smooth-skinned cetacean-analog figures drifts in a tight schism — two distinct groups separated by a band of empty dark water. "
        "Each group's skin is patterned with subtly different cool-blue bioluminescent markings. The seafloor below is faint volcanic vents glowing tungsten-warm. "
        "Painterly volumetric darkness, simplified silhouettes, severe tense mood, no readable patterns, no text."
    ),
    (
        "brel-halon-empty-boats", "16:9", False,
        "Painted wide illustration of a coastal alien fishing village at dawn. "
        "A long curving harbour with fifty small wooden fishing boats moored in neat rows; nets hang slack and dry on the gunwales. "
        "Not a single figure on the docks. A low fog clings to the water. A row of empty stone houses lines the shoreline behind the boats. "
        "The sky is deep slate transitioning to a thin warm horizon band. "
        "Painterly soft edges, simplified silhouettes, severe quiet uncanny mood, no readable signage, no text."
    ),
    (
        "iharran-rerouted-port", "16:9", False,
        "Painted wide illustration of a coastal alien trading port at night. "
        "A great wide harbour, half the docks dark and abandoned with weeds at their pilings, the other half lit with warm tungsten lamps and crowded with tall sailing ships of an unusual cut. "
        "A solitary robed captain stands on a dim dock between the two halves, looking across at the lit ships. "
        "Cool slate water reflects the warm lights in broken patterns. "
        "Painterly atmospheric depth, simplified silhouettes, severe melancholy mood, no readable signs or banners, no text."
    ),

    # ── EP 3: Sky Language — civilisations reading meaning in the upper air ──
    (
        "tachet-telegraph-room", "16:9", False,
        "Painted wide illustration of an industrial-era alien telegraph operations room at night. "
        "A long wooden hall with a row of brass telegraph stations along one wall, each manned by a uniformed operator hunched in concentration, hands on keys. "
        "Warm tungsten desk lamps pool light on each station; the rest of the hall recedes into deep slate shadow. "
        "Paper tapes hang in faint loops between the stations. A single window at the far end shows a cool starless slate sky. "
        "Painterly soft brushwork, simplified silhouettes, severe industrial mood, no readable code or text."
    ),
    (
        "pelnar-belt-miners", "16:9", False,
        "Painted wide illustration of an alien asteroid mining outpost at deep night. "
        "Two rough-hewn ore haulers float close to a jagged asteroid surface; cables and warm tungsten work-lamps trail from their hulls. "
        "Three suited miners in heavy worn rigs hover near a fresh-cut shaft, faces tipped up toward a sky shot with faint pale solar-wind ribbons. "
        "Deep starfield behind; no planets visible. "
        "Painterly atmospheric depth, simplified silhouettes, severe industrial mood, no readable markings on the hulls, no text."
    ),
    (
        "esnal-copper-pantheon", "16:9", False,
        "Painted wide illustration of an alien copper-belt city at twilight. "
        "A long avenue lined with thirty-seven crude copper statues of varying heights, each statue a different abstract figure, all weathered to a deep verdigris. "
        "Small robed worshippers move between the statues placing warm tungsten oil-lamp offerings at their bases. "
        "The avenue ends at a great copper foundry whose stacks emit faint warm smoke against a cool slate sky. "
        "Painterly soft edges, simplified silhouettes, severe and uneasy mood, no readable text on plinths."
    ),
    (
        "norr-halen-missile-warning", "16:9", False,
        "Painted wide illustration of an atomic-era alien city at night, mid-evacuation. "
        "Streets full of small figures hurrying in disordered streams toward shelter entrances marked by warm tungsten doorway-lights. "
        "Above the city, an unsettling faint cool-blue aurora ribbon stretches across the upper sky in abstract waveform-like patterns. "
        "A row of squat concrete missile silos visible on a far ridge; one silo's hatch is slightly open. "
        "Painterly atmospheric depth, simplified silhouettes, severe panicked-but-quiet mood, no readable signage, no text."
    ),
    (
        "korov-drift-torus", "16:9", False,
        "Painted wide illustration of the interior of a vast cylindrical orbital habitat. "
        "Looking along the inside of the torus: terraced housing curves up the walls and over the viewer's head, becoming a curved ceiling of dwellings. "
        "Across the inside-sky overhead, faint cool-blue luminescent ribbon patterns drift in an abstract aurora-like waveform. "
        "Warm tungsten window-lights scatter across the curved housing. A single tiny figure stands on a high terrace looking up. "
        "Painterly atmospheric depth, simplified architecture, severe wondrous-but-unsettled mood, no readable signage, no text."
    ),
    (
        "eshrane-cave-pilgrimage", "16:9", False,
        "Painted wide illustration of a pre-industrial alien mountainside at dusk. "
        "A long line of robed figures carrying small warm tungsten lanterns climbs up a winding trail toward a wide dark cave mouth in the rock face. "
        "Many lanterns are already inside the cave, visible as faint warm pinpoints in the shadow. "
        "Above the mountain, an unsettling pale aurora curtain stretches across the cool slate sky. "
        "Painterly soft brushwork, simplified silhouettes, severe fearful mood, no readable banners or signs, no text."
    ),
    (
        "vail-south-divided-sky", "16:9", False,
        "Painted wide illustration of a wide alien plain at dusk, split by a long low concrete wall stretching across the entire horizon. "
        "On the near side, a cluster of squat industrial buildings with warm tungsten windows; on the far side, a similar cluster, slightly differently shaped, with the same warm tungsten lights. "
        "Above both halves, the same single faint cool-blue aurora glyph hangs in the sky — but each side has marked it on watch-towers facing inward. "
        "A single guard stands on the wall midway, looking up. "
        "Painterly atmospheric depth, simplified silhouettes, severe divided mood, no readable text or insignia."
    ),

    # ── EP 4: Fire Given — atomic-age and scholarly worlds handed dangerous gifts ──
    (
        "olun-algebra-cohort", "16:9", False,
        "Painted wide illustration of a pre-atomic alien academy interior at deep night. "
        "A long shared study hall with rows of wooden desks, each lit by a warm tungsten lamp. Most desks are abandoned mid-work — chairs pushed back, papers scattered, slide-rules left open. "
        "Three figures still bent over their desks at the far end, exhausted, robes rumpled. A high arched window shows a cool slate pre-dawn sky. "
        "Painterly soft brushwork, simplified silhouettes, severe burned-out mood, no readable equations or text."
    ),
    (
        "tavel-empty-parliament", "16:9", False,
        "Painted wide illustration of a late-industrial alien parliamentary chamber at night. "
        "Tiered semicircular wooden benches rising up around an empty central speaking floor. Every seat is empty; coats hang over a few seatbacks. "
        "A single warm tungsten lamp at the speaker's lectern is still lit. Through tall windows behind the chamber, a calm cool slate sky with no storm in sight. "
        "Painterly atmospheric depth, simplified silhouettes, severe abandoned mood, no readable insignia, no text on banners."
    ),
    (
        "khel-vir-melted-reactor", "16:9", False,
        "Painted wide illustration of an alien coastal industrial site at dusk, the day after a disaster. "
        "A squat concrete reactor building, half-collapsed at its core, with a faint pale glow leaking from the breach. "
        "A river curves past the site, its surface unnaturally still. Distant figures in heavy protective rigs walk along the shore at a careful distance. "
        "The sky is bruised slate with a thin warm horizon band. "
        "Painterly soft edges, simplified silhouettes, severe clinical mood, no readable signage, no text."
    ),
    (
        "sennak-tomography-watch", "16:9", False,
        "Painted wide illustration of an early-atomic alien research institute at deep night. "
        "A subterranean concrete observation room. A circular array of brass-cased instruments surrounds a small central plinth; thin paper-tape printouts coil onto the floor from each instrument. "
        "Two researchers in plain coats stand at the array, one writing in a paper notebook, the other watching a faint waveform on a holo-glass panel. "
        "Warm tungsten lamp overhead. Painterly atmospheric depth, simplified silhouettes, severe vigilant mood, no readable data on any screen."
    ),
    (
        "brel-tertius-dyson", "16:9", False,
        "Painted wide illustration of an orbital industrial alien civilisation seen from a habitat window. "
        "A small foreground silhouette of a child standing at a wide curved viewport, palm flat against the glass. "
        "Beyond the glass, a dense lattice of partially-completed solar collector panels fills most of the frame around a dim, half-occluded sun reduced to a faint warm tungsten ember. "
        "The rest of the sky is near-black starfield. "
        "Painterly atmospheric depth, simplified silhouettes, severe muted mood, no readable markings on the lattice."
    ),
    (
        "pavel-9-twin-projects", "16:9", False,
        "Painted wide illustration of an atomic-era alien industrial complex at dusk. "
        "Two identical concrete buildings side by side, sharing a single long entrance corridor. From one chimney rises a thin plume of warm-tinged steam; from the other, the same plume. "
        "A small group of officials in plain coats walks the corridor between them, carrying file folders. A faint warm tungsten dawn smudges the horizon. "
        "Painterly soft brushwork, simplified silhouettes, severe bureaucratic-dread mood, no readable signage, no text."
    ),
    (
        "aros-marl-overgrown-city", "16:9", False,
        "Painted wide illustration of a chemistry-heavy alien city at twilight, viewed across a wide river. "
        "Vast tightly-packed apartment blocks rise twenty storeys, every window glowing warm tungsten. The city extends to the horizon in all visible directions. "
        "Faint chemical smog clings to the lower storeys in cool slate-blue. A long stone bridge across the river is crowded with small figures walking shoulder to shoulder. "
        "Painterly atmospheric depth, simplified silhouettes, severe overburdened mood, no readable signage, no text."
    ),
    (
        "ven-karah-glassed-coast", "16:9", False,
        "Painted wide illustration of an alien coastline at dawn, after civil war. "
        "Two distant coastal cities reduced to flat glassy plains that catch the cool pre-dawn light in long mirror-like sheets. "
        "A single inland road winds away from the coast, with a small refugee column of robed figures walking inland carrying bundles. "
        "A thin warm horizon band; the rest of the sky is deep slate. "
        "Painterly soft edges, simplified silhouettes, severe aftermath mood, no readable text or insignia."
    ),

    # ── EP 5: Perfect Garden — quiet listened-to worlds carrying a sentence not Kalen's ──
    (
        "welun-pastoral-listening", "16:9", False,
        "Painted wide illustration of a pastoral alien valley at dusk. "
        "Low stone-walled fields with grazing slow ruminant-analog animals. A tiny village of round-roofed houses with warm tungsten windows tucked into the valley floor. "
        "On a hilltop above the village, a single small ageing satellite dish points up at a calm cool slate sky. "
        "A solitary figure sits on a stone wall near the dish, watching the sky. "
        "Painterly soft brushwork, simplified silhouettes, severe quiet mood, no readable signage, no text."
    ),
    (
        "tor-mira-composers", "16:9", False,
        "Painted wide illustration of an alien long-lived civilisation's music conservatory at evening. "
        "A circular stone hall open to the night sky, with a low central plinth holding a tall thin chime instrument of pale brass tubes. "
        "Three elderly slender figures in plain robes stand around the chime, one with a small mallet raised. "
        "Warm tungsten lamps on stone shelves around the hall. A faint star-strewn sky above. "
        "Painterly atmospheric depth, simplified silhouettes, severe contemplative mood, no readable scores or text."
    ),
    (
        "ehlan-empty-poet-hall", "16:9", False,
        "Painted wide illustration of an alien literary council hall at deep night. "
        "A wide stone chamber with rows of carved wooden reading lecterns, each empty. A single open book lies on the central lectern, faintly lit by an overhead warm tungsten lamp. "
        "Tall narrow windows along one wall reveal a calm cool slate sky. The floor is polished stone reflecting the lamp in a dim pool. "
        "Painterly soft edges, simplified silhouettes, severe abandoned-tradition mood, no readable text on the open book."
    ),
    (
        "sereshan-elder-blessing", "16:9", False,
        "Painted wide illustration of an alien agrarian village square at dusk. "
        "A circle of robed elders sits on low wooden stools around a central stone hearth glowing warm tungsten. "
        "One elder's hand is raised in mid-gesture; the others lean forward in concentration. Surrounding stone houses are dark; a single window glows faintly. "
        "Wheat-like crops bend in stillness in the fields just beyond the square. Cool slate sky above. "
        "Painterly atmospheric depth, simplified silhouettes, severe reverent-but-uneasy mood, no readable inscriptions, no text."
    ),
    (
        "norvell-altered-migration", "16:9", False,
        "Painted wide illustration of a nomadic alien tribe at dawn on a wide plain. "
        "A long ragged line of robed figures and pack animals walks across the foreground heading toward the cool horizon. "
        "Behind them, the visible remains of a now-abandoned grazing ground — circular impressions where tents stood, fire pits gone cold. "
        "The far horizon shows a thin warm band against a deep slate sky. "
        "Painterly soft brushwork, simplified silhouettes, severe melancholy mood, no readable banners or signage."
    ),
    (
        "iyarra-lesser-quiet-moon", "16:9", False,
        "Painted wide illustration of a colony moon at deep night, surface view. "
        "A small terraced complex of low stone study halls clinging to a crater rim. Warm tungsten window-lights in a few halls; most are dark. "
        "Beyond the crater rim, a vast star-strewn sky with the dim crescent of the parent world rising in cool slate-blue. "
        "Two robed scholar figures stand on a balcony looking out toward the parent world; one has lowered their gaze. "
        "Painterly atmospheric depth, simplified silhouettes, severe withheld-secret mood, no readable text or insignia."
    ),
    (
        "pellach-shortened-lives", "16:9", False,
        "Painted wide illustration of a long-lived alien settlement at twilight. "
        "A row of low stone family homes built into a hillside, each home's door framed with carefully tended pale flowering vines. "
        "On the doorstep of one home, a young figure sits beside a much older one, the younger figure's hand on the elder's shoulder. "
        "Warm tungsten light from the doorway behind them. The hillside falls away into deep slate dusk. "
        "Painterly soft edges, simplified silhouettes, severe mourning mood, no readable text or signs."
    ),
    (
        "quiet-three-forgotten-sisters", "16:9", False,
        "Painted wide illustration of a wide alien sky at dusk, viewed across a calm dark lake. "
        "Three sister worlds hang at different phases low above the horizon — one fully lit warm tungsten, two in deep slate shadow. "
        "On the near shore of the lake, three small stone pillars stand at the water's edge, only one of them with a warm tungsten lantern still burning. "
        "Faint mist on the lake. "
        "Painterly atmospheric depth, simplified silhouettes, severe wistful mood, no readable inscriptions, no text."
    ),
    (
        "vatha-sel-deep-court", "16:9", False,
        "Painted wide illustration of a deep oceanic alien world at extreme depth. "
        "A circle of vast slow long-lived oceanic figures hangs suspended in cool dark water around a central plinth of pale stone. "
        "Soft cool-blue bioluminescence outlines each figure's silhouette. The plinth glows with a single warm tungsten point. "
        "The water extends to near-black darkness at the edges. "
        "Painterly volumetric water, simplified silhouettes, severe juridical mood, no readable markings on the plinth."
    ),

    # ── EP 6: Missing World — worlds gone from the record, gaps in the sky ──
    (
        "ar-sennech-vanished-folder", "16:9", False,
        "Painted wide illustration of cold deep space. "
        "A faint cool-blue circular outline drawn on the starfield, slightly off-centre, marking where a world should be. "
        "Inside the circle: only more distant stars, none in the correct positions. To one side, faint slate nebular dust. "
        "No planet, no debris. "
        "Painterly soft brushwork, severe absence mood, no readable coordinates or markings, no text."
    ),
    (
        "toravan-singing-of-lost-neighbour", "16:9", False,
        "Painted wide illustration of an industrial-era alien city at deep night. "
        "A small park at the city's edge with a low wooden bandstand; a single elderly figure stands at the bandstand singing softly. "
        "Behind the bandstand, the city's slate rooftops scatter warm tungsten window-light. Above the city, the night sky shows a single faint cool-blue circle outline drawn in faint nebular dust — the empty place where a sister world should be. "
        "Painterly atmospheric depth, simplified silhouettes, severe wistful mood, no readable text on the bandstand."
    ),
    (
        "veld-ar-degrading-recording", "16:9", False,
        "Painted wide illustration of a private engineering workstation at deep night, close-up scene. "
        "A worn paper notebook open beside a single thin holo-glass display panel; the display shows a faint cool-blue waveform that is unevenly cut — sections of the waveform missing as if eaten away. "
        "A warm tungsten desk lamp casts a tight pool of light on the desk. The rest of the room recedes into deep shadow. "
        "Painterly soft edges, simplified objects, severe loss-of-evidence mood, no readable text on display or notebook."
    ),
    (
        "halun-outer-sealed-confirmation", "16:9", False,
        "Painted wide illustration of an industrial-age alien archive vault at night. "
        "A long underground corridor lined with rows of riveted metal cabinet drawers. Most drawers are dark, but one drawer in the middle distance has a faint warm tungsten light leaking from its seam. "
        "A solitary archivist figure stands at the lit drawer with a hand resting on it, head bowed. "
        "Painterly atmospheric depth, simplified silhouettes, severe locked-knowledge mood, no readable labels or text on the cabinets."
    ),
    (
        "empty-coord-three-stars", "16:9", False,
        "Painted wide illustration of cold deep space. "
        "Three pale steel-blue stars arranged in a wide triangle at the centre of the frame. The space between and around them is starless and near-black — no planets, no debris, no faint glow. "
        "Faint slate nebular dust drifts off to one corner. "
        "Painterly soft brushwork, severe clinical absence mood, no readable coordinates, no text."
    ),
    (
        "iyarra-echo-unindexed", "16:9", False,
        "Painted wide illustration of a colony moon surface at deep night, similar to Iyarra-Vell's plaza but smaller and abandoned. "
        "A modest paved courtyard with low stone desks, all empty, dust drifted across them. "
        "A small deep-space dish behind the plaza is tilted at a wrong angle, no longer aimed. "
        "The sky is cold star-strewn slate. A single warm tungsten lamp on a far wall is still inexplicably lit. "
        "Painterly soft edges, simplified silhouettes, severe unindexed mood, no readable text or markings."
    ),
    (
        "veska-lost-neighbour-chart", "16:9", False,
        "Painted wide illustration of a pre-industrial alien observatory at deep night. "
        "An open-roofed circular stone platform with a large hand-built brass orrery at its centre. One mounted arm of the orrery is bent slightly outward toward an empty bracket where a small world-sphere is clearly missing. "
        "A robed astronomer stands beside the orrery, one hand on the empty bracket. A cool slate sky with abundant stars overhead. "
        "Painterly atmospheric depth, simplified silhouettes, severe mournful mood, no readable text or markings on the orrery."
    ),
    (
        "reltha-empty-file", "16:9", False,
        "Painted wide illustration of an engineering workstation close-up at deep night. "
        "A thick paper folder open on the desk, its cover label torn off; the visible pages inside are blank — no text, no marks. "
        "A small holo-glass display beside the folder shows a faint metadata bar suggesting the folder should hold hundreds of pages. "
        "Warm tungsten desk lamp. The rest of the room recedes into deep shadow. "
        "Painterly soft edges, simplified objects, severe disquieted mood, no readable text anywhere on display or paper."
    ),
    (
        "pen-halun-denied-parliament", "16:9", False,
        "Painted wide illustration of an industrial-era alien parliamentary chamber at night, viewed through a thin haze. "
        "Tiered wooden benches with rows of robed delegates, hands raised mid-vote. The figures are subtly translucent — visible but faint, as if half-remembered. "
        "A warm tungsten lectern lamp at the speaker's stand is the only fully solid object in the scene. "
        "The chamber walls fade into deep slate at the edges. "
        "Painterly atmospheric depth, simplified silhouettes, severe denied-existence mood, no readable insignia, no text."
    ),

    # ── EP 7: Echoes — the route, the amplification, the hijack ──
    (
        "tov-karav-archive-discovery", "16:9", False,
        "Painted wide illustration of a private engineering workstation at deep night, with a second figure present. "
        "The familiar L-shaped desk with brass tuning knobs and warm tungsten lamp. A second figure in a plain dark formal jacket — no insignia — stands behind the desk holding a single paper file open under the lamp, mid-reading. "
        "The desk's chair is empty. A holo-glass display shows a faint waveform. "
        "Painterly atmospheric depth, simplified silhouettes, severe quietly-damning mood, no readable text in the file or on display."
    ),
    (
        "ralis-collapsed-coalition", "16:9", False,
        "Painted wide illustration of a coalition of small alien city-states three years after collapse. "
        "A wide aerial view across a river plain, with five small ruined cities scattered along the river, walls broken, roofs caved in. Thin smoke from a few still-smouldering buildings. "
        "No people visible. Cool slate sky with a thin warm horizon band. "
        "Painterly soft brushwork, simplified architecture, severe aftermath mood, no readable signage, no text."
    ),
    (
        "khol-3-glassed-cities", "16:9", False,
        "Painted wide illustration of an atomic-era alien continent at deep night, distant view. "
        "Eight pale glass plains where cities used to be, scattered across a dark continent visible from low orbit. Each plain catches a faint cool light. Cloud bands stretch across the unaffected portions of the night side. "
        "Far horizon arcs gently against deep starfield. "
        "Painterly atmospheric depth, simplified silhouettes, severe clinical-witnessing mood, no readable markings, no text."
    ),
    (
        "sephor-3-quiet-state", "16:9", False,
        "Painted wide illustration of an industrial-era alien capital at evening, healthy and intact. "
        "A wide boulevard with slate-roofed buildings, warm tungsten windows alight, a calm dignified parade of robed civilians walking the avenue. "
        "A single broadcast antenna on a hill above the city, intact, unremarkable. The sky is cool slate with a thin warm horizon band. "
        "Painterly soft edges, simplified silhouettes, severe steady-and-unchanged mood, no readable signage, no text."
    ),
    (
        "pratha-double-pulse", "16:9", False,
        "Painted wide illustration of an industrial alien city at deep night, mid-crisis. "
        "Two distinct emergency-broadcast towers on opposite hilltops above the city, each topped with a single warm tungsten warning lamp. The two lamps cast slightly different colours — one warmer, one cooler — onto the slate rooftops below. "
        "Streets full of small figures moving in different directions, as if responding to two different alerts. "
        "Painterly atmospheric depth, simplified silhouettes, severe contradictory-warning mood, no readable signage, no text."
    ),
    (
        "vell-karash-earliest-transit", "16:9", False,
        "Painted wide illustration of a pre-industrial alien settlement abandoned for decades. "
        "A small valley with the ruins of stone houses, roofs collapsed, pale grass growing through the foundations. A single low broadcast antenna mast still standing crookedly at the settlement's edge. "
        "Twin pale moons low on a deep slate horizon. No figures. "
        "Painterly soft brushwork, simplified silhouettes, severe forgotten mood, no readable signage, no text."
    ),
    (
        "eshin-key-signature", "16:9", False,
        "Painted wide illustration of an engineering workstation at deep night, two displays side by side. "
        "The familiar desk with warm tungsten lamp. Two slim holo-glass panels mounted upright on the desk, each showing a faint cool-blue waveform; the waveforms are subtly different — one with an additional, separate pattern layered on top. "
        "Two figures lean over the displays — one seated, one standing — both intent. "
        "Painterly atmospheric depth, simplified silhouettes, severe forensic mood, no readable text on either display."
    ),
    (
        "norv-stable-control", "16:9", False,
        "Painted wide illustration of a pre-industrial alien village at quiet evening. "
        "A simple cluster of stone-walled houses around a stone-paved square; a single broad warm tungsten brazier at the square's centre with three robed figures sitting calmly beside it, talking softly. "
        "A low wooden community-hall on one side, lights warm and intact. Cool slate sky with a thin warm horizon band. "
        "Painterly soft edges, simplified silhouettes, severe unchanged-and-quiet mood, no readable signage, no text."
    ),
    (
        "halun-pattern-comdef-log", "16:9", False,
        "Painted wide illustration of a sparse military office interior at deep night. "
        "A long steel desk with a stack of thick paper internal logs piled high, the topmost log open under a warm tungsten lamp. A second figure in a plain dark formal jacket stands at the desk, one finger tapping a line in the open log; another figure leans over the desk with both hands flat, head bowed. "
        "Cold flat overhead light. Painterly atmospheric depth, simplified silhouettes, severe revelatory-but-restrained mood, no readable text in any log."
    ),
    (
        "shann-vel-two-recordings", "16:9", False,
        "Painted wide illustration of two engineering workstations side by side at deep night. "
        "Two L-shaped desks pushed together, each with its own warm tungsten lamp, each with its own thin holo-glass display showing a faint cool-blue waveform. The two waveforms are clearly different in their middle sections. "
        "Two figures stand between the desks, looking down — one in a charcoal coat, one in a plain dark formal jacket. "
        "Painterly atmospheric depth, simplified silhouettes, severe confrontation-with-evidence mood, no readable text on the displays."
    ),

    # ── EP 8: Finale — the relay, the cascade, the dark waking ──
    (
        "relay-712-arrival", "16:9", False,
        "Painted wide illustration of deep space, a small cutter spacecraft approaching an enormous brutalist FTL relay station. "
        "The relay is roughly the size of a small moon, dark angular hull traced with faint cool-blue luminous veins along seams. The cutter is dwarfed near the relay's docking flank, a tiny warm tungsten point against the relay's mass. "
        "Cold distant starfield behind. No planets visible. "
        "Painterly soft brushwork, simplified silhouettes, severe ominous-arrival mood, no readable insignia or text on the relay."
    ),
    (
        "tov-bright-first-emitter", "16:9", False,
        "Painted wide illustration of cold deep space focused on a single young world. "
        "A small pre-stellar planet hanging in the middle distance, its night side facing the viewer, with a single bright cool-blue pinprick of newly-emerging emission visible on the night side surface. "
        "Faint slate nebular dust drifts in the background. No other planets. "
        "Painterly atmospheric depth, severe waking-too-early mood, no readable markings, no text."
    ),
    (
        "ahn-bright-recognised-modulation", "16:9", False,
        "Painted wide illustration of cold deep space showing two worlds close together. "
        "In the foreground, a familiar amber-tinted desert world at half-phase — Ahn-Tar-3, painted as a recognisable echo of the established Ep 1 art. "
        "Just behind and to one side, a smaller pre-stellar world with a single bright cool-blue emission point on its night side. The emission point pulses faintly. "
        "Cold deep starfield behind. "
        "Painterly atmospheric depth, severe uncanny-resonance mood, no readable markings, no text."
    ),
    (
        "hesh-bright-unknown-language", "16:9", False,
        "Painted wide illustration of cold deep space, a young pre-stellar world at mid-frame. "
        "Several distinct points of cool-blue emission scattered across the world's night side in an unfamiliar pattern — not the simple single-point pattern of the earlier brights. "
        "A faint elongated trace lines the void off-frame, hinting at the broadcast direction leading outside Union space. "
        "Deep starfield behind. "
        "Painterly atmospheric depth, severe alien-intent mood, no readable patterns or text."
    ),
    (
        "eighth-bright-scheduled", "16:9", False,
        "Painted wide illustration of cold deep space, wide vista. "
        "Eight young pre-stellar worlds arranged in an even arc across the frame, each with a single small cool-blue pinprick of emission on its night side. The eight pinpricks form an obviously regular, near-mathematical spacing. "
        "Deep slate-blue nebular dust drifts behind the arc. "
        "Painterly atmospheric depth, severe coordinated-event mood, no readable markings, no text."
    ),
    (
        "verel-bright-fifteenth", "16:9", False,
        "Painted wide illustration of cold deep space showing a denser pattern. "
        "Fifteen young pre-stellar worlds scattered across the wide frame, each with a single small cool-blue emission pinprick. The brights collectively form a sprawl that is clearly no longer random — the eye reads a shape, but cannot quite name it. "
        "Deep starfield. "
        "Painterly atmospheric depth, severe pattern-clarifying mood, no readable markings or text."
    ),
    (
        "ven-bright-realtime", "16:9", False,
        "Painted wide illustration of an interior view of the FTL relay's control deck at deep night. "
        "A long curved console of dim cool-blue indicator panels stretches across the foreground; thirty-two of the panels are now lit, each with a single warm tungsten point appearing in real time. "
        "Two figures in plain dark jackets stand at the console, one with a hand raised mid-gesture, the other completely still. "
        "Painterly atmospheric depth, simplified silhouettes, severe live-broadcast mood, no readable text on any panel."
    ),
    (
        "korash-bright-powers-of-two", "16:9", False,
        "Painted wide illustration of cold deep space. "
        "Sixty-four young pre-stellar worlds spread evenly across the wide frame, each with a single small cool-blue emission pinprick. The arrangement is unmistakably regular — a doubling sequence of light spreading outward from a central origin point hidden off-frame. "
        "Deep slate nebular dust frames the edges. "
        "Painterly atmospheric depth, severe counting-up-to-something mood, no readable markings, no text."
    ),
    (
        "cascade-spine-named", "16:9", False,
        "Painted wide illustration of cold deep space, a hundred-twenty-eight emitter sprawl. "
        "A vast diagonal sweep of small cool-blue pinpricks of emission across the wide frame, distinctly forming a long curving spine-like shape pointing outward toward an unseen destination beyond the edge of the frame. "
        "Deep starfield. No spacecraft, no planets in foreground. "
        "Painterly atmospheric depth, severe named-pattern mood, no readable markings or text."
    ),
    (
        "the-cascade-full-sector", "16:9", False,
        "Painted wide illustration of a wide deep-space vista across an entire sector. "
        "Hundreds of faint cool-blue pinpoint emissions waking simultaneously across the frame, scattered across a deep starfield with cool slate-blue nebular dust running through the middle distance. "
        "The lights collectively suggest a slow expanding tide. No spacecraft, no foreground planets, no clear origin point. "
        "Painterly soft brushwork, simplified, severe overwhelming-but-quiet mood, no readable text or markings."
    ),

    # ──────────────────────────────────────────────────────────────────────
    # EP 9 — Listen Back. Incoming voices. Some from worlds Kalen touched
    # in Season 1; some from places he never reached.
    # ──────────────────────────────────────────────────────────────────────
    (
        "tov-karav-reply", "16:9", False,
        "Painted wide illustration of a small young pre-stellar world with primitive observatory domes on its surface. "
        "An array of newly-built radio dishes points outward into the night, each ringed with warm tungsten work-lights. "
        "A faint cool-blue thread of carrier rises off the array toward the deep starfield. "
        "Painterly atmospheric depth, severe curious-asking-back mood, no readable text or markings."
    ),
    (
        "long-note-47-years", "16:9", False,
        "Painted wide interior illustration of a Quiet Relay decoder room at deep night. "
        "A long horizontal strip of waveform display dominates the frame — a single continuous tone holding steady across decades of accumulated chart paper that drapes off the console and pools on the floor. "
        "One figure stands at the far end of the room, small in scale, examining a recent metre of the strip. "
        "Painterly atmospheric depth, severe forty-seven-year-tone mood, no readable text or numbers."
    ),
    (
        "mirror-voice-reply", "16:9", False,
        "Painted wide interior illustration of Kalen's listening rig at deep night. "
        "Two waveform displays sit side by side, both displaying nearly-identical voice patterns in cool-blue. One waveform has a single subtle warm tungsten misalignment at one syllable, just enough to be wrong. "
        "No figures. The room is empty. "
        "Painterly atmospheric depth, severe own-voice-but-not mood, no readable text or markings."
    ),
    (
        "brel-halon-reply-fleet", "16:9", False,
        "Painted wide illustration of a fishing fleet at sea on a young pre-stellar world, at dusk, lanterns lit. "
        "Each boat carries a tall newly-built antenna mast. The masts collectively form a forest of vertical lines against the darkening sky. "
        "A single faint cool-blue carrier thread rises from the largest boat toward the heavens. "
        "Painterly atmospheric depth, severe generations-asking-back mood, no readable text or markings."
    ),
    (
        "pillar-of-atan-megastructure", "16:9", False,
        "Painted wide illustration of cold deep space, dominated by a single enormous mechanical structure roughly half the size of a small moon. "
        "The structure is mostly dark, with a few faint cool-blue indicator lights scattered across its surface. No surrounding planets, no atmosphere, no other infrastructure. "
        "Deep starfield behind. "
        "Painterly atmospheric depth, severe impossibly-large-tower mood, no readable markings or text."
    ),
    (
        "korov-drift-reply-sky", "16:9", False,
        "Painted wide interior illustration of a Korov habitat at night, looking up at the inside surface of the curved sky-ceiling. "
        "The whole inner sky is covered in crisp cool-blue glyph-script — far more elaborate and precise than the earlier writing Kalen pushed there. The glyphs spell out an elaborate response, unmistakably language. "
        "Two small figures stand at the bottom of the frame, dwarfed, reading. "
        "Painterly atmospheric depth, severe corrected-grammar mood, no actually-readable characters."
    ),
    (
        "ear-of-saen-station", "16:9", False,
        "Painted wide illustration of cold deep space showing a single isolated monitoring station — a clustered ring of dish antennas and small bunkers in low orbit around a barren rocky world. "
        "Every dish is angled inward, oriented toward Union space (off-frame to the left). Faint cool-blue receive indicators on each dish. "
        "Deep starfield behind. "
        "Painterly atmospheric depth, severe always-listening mood, no readable text or markings."
    ),
    (
        "iyarra-pre-echo", "16:9", False,
        "Painted wide illustration of a stately archive interior at deep night, lit by a single low cool-blue desk lamp. "
        "An open ledger lies on a wooden table, the page showing a hand-recorded waveform diagram and a time-stamp far older than its surroundings. A single small carrier-trace line extends from the ledger upward into a thin painted depiction of a starfield bleeding into the room's ceiling. "
        "No figures. "
        "Painterly atmospheric depth, severe wrong-time mood, no readable text or numbers."
    ),
    (
        "velnor-choir-unbidden", "16:9", False,
        "Painted wide illustration of a low-orbit view of a never-contacted young pre-stellar world at deep night. "
        "Across the world's night side, broadcast antennas mass in a circular plaza, every one lit by warm tungsten welcome-light. From the plaza, a single thick cool-blue carrier thread rises into the dark above. "
        "Deep starfield behind. "
        "Painterly atmospheric depth, severe stranger-knows-your-name mood, no readable markings or text."
    ),
    (
        "first-foreign-voice", "16:9", False,
        "Painted wide illustration of cold deep space, deep beyond the edge of charted Union infrastructure. "
        "A single sharp cool-blue carrier thread crosses the wide frame, originating from a small unfamiliar point of light far in the depth of the void. The thread terminates at a small Quiet Relay node in the near foreground, which is the only Union object in the painting. "
        "Deep starfield with foreign-coloured nebular dust at the edges, not the usual slate. "
        "Painterly atmospheric depth, severe from-outside mood, no readable markings or text."
    ),

    # ──────────────────────────────────────────────────────────────────────
    # EP 10 — Arrival. Replies become physical: probes, ships, the relay
    # opens. The Listener is revealed. The figure speaks.
    # ──────────────────────────────────────────────────────────────────────
    (
        "first-probe-border", "16:9", False,
        "Painted wide illustration of cold deep space at a Union border station — a small dark mechanical artefact, no propulsion signature, parked in the near foreground. "
        "Its hull is matte and ancient, with a few faint cool-blue indicator points. A small Union surveillance buoy nearby is dwarfed by it. "
        "Deep starfield behind. "
        "Painterly atmospheric depth, severe older-than-the-Union mood, no readable markings or text."
    ),
    (
        "veska-approach-no-record", "16:9", False,
        "Painted wide illustration of a probe descending into the atmosphere of a small terrestrial world at dusk. "
        "The world's continents are faintly visible through painterly haze. A small dark probe streaks downward at the middle of the frame, leaving a faint warm tungsten re-entry trail. "
        "A faint annotated chart overlay along the lower edge of the painting shows the system as empty — a single thin line where the world should be. "
        "Painterly atmospheric depth, severe knows-where-to-land mood, no readable text or numbers."
    ),
    (
        "halun-veth-visited-key", "16:9", False,
        "Painted wide interior illustration of the Halun-Veth academy at deep night — vaulted stone hall with long bookshelves receding into the dark. "
        "At a central reading table, three robed academy figures face a single slender visitor whose silhouette is wrong in scale and posture. The visitor extends a small metallic object across the table. The object emits a faint cool-blue glow. "
        "Painterly atmospheric depth, severe given-a-key mood, no readable text on any book or paper."
    ),
    (
        "quiet-fleet-approaching", "16:9", False,
        "Painted wide illustration of cold deep space showing multiple small dark ships in coherent formation, all on parallel approach vectors toward an unseen destination off-frame. "
        "Each ship is matte and unmarked, with the merest single cool-blue running light. No drive trails, no exhaust. "
        "Deep starfield with thin slate nebular dust. "
        "Painterly atmospheric depth, severe coordinated-silent-approach mood, no readable markings or text."
    ),
    (
        "pavel-9-visited-dismantled", "16:9", False,
        "Painted wide illustration of the surface of an atomic-age industrial world at dusk. "
        "A large industrial reactor complex dominates the middle distance, still running, faint warm tungsten interior lights visible. Outside the perimeter, a small slim alien shuttle has landed and several alien figures are removing a single dark weaponised core from a wheeled cart. The reactor's own systems are clearly being left running. "
        "Painterly atmospheric depth, severe taking-back-the-dangerous-part mood, no readable text or signage."
    ),
    (
        "lehl-visited-garden", "16:9", False,
        "Painted wide illustration of a tranquil Lehlan garden plaza at the soft hour after dawn. "
        "A small group of Lehlan elders sits at low stone benches in conversation with two slim visitors of unfamiliar silhouette. A faint cool-blue corrective glow rests gently above the plaza, painted as an abstract restorative aura, not a beam. "
        "Painterly atmospheric depth, severe undoing-the-edit mood, no readable text or markings."
    ),
    (
        "listener-revealed-silhouette", "16:9", False,
        "Painted wide interior illustration of a small private engineering apartment at deep night, lit only by a single cool-blue console screen. "
        "Kalen sits at the console in the middle of the frame, back to the viewer, slight slump, headphones on. Just behind his left shoulder stands a second silhouette of incompatible proportions — too many limbs, the wrong posture, painted in a slightly less-than-real opacity as though stepping into the room across the threshold of being seen. "
        "Painterly atmospheric depth, severe never-alone mood, no readable text or markings on any surface."
    ),
    (
        "foreman-contract-dated", "16:9", False,
        "Painted wide tabletop illustration at deep night, lit by a single low cool-blue desk lamp. "
        "A single bureaucratic procurement document lies open on a worn wooden table. A signature line is visible at the bottom in painterly pen-stroke, with a date stamp in the upper corner clearly painted as a year decades older than the document's apparent contents. The paper is uncreased, the signature crisp. A small magnifying loupe lies beside the page. "
        "Painterly atmospheric depth, severe line-item-from-before-my-birth mood, no actually-readable text on the page."
    ),
    (
        "relay-opens-aperture", "16:9", False,
        "Painted wide illustration of cold deep space dominated by the side of an enormous ancient relay structure. "
        "Along the structure's long axis, an aperture has unseamed open, painted as a vast painterly slit revealing absolute black inside — a darkness deeper than the surrounding starfield. A faint warm tungsten line traces the inside edge of the aperture. The opening is unmistakably large enough to admit a city. "
        "Deep starfield behind, with a single small Union cutter ship in the foreground for scale. "
        "Painterly atmospheric depth, severe hinged-door mood, no readable markings or text."
    ),
    (
        "the-door-stepping-through", "16:9", False,
        "Painted wide illustration looking through a vast open aperture in the side of an ancient relay structure at deep space-night. "
        "A single tall thin figure has just stepped through the aperture and stands in the near foreground, painted in mostly silhouette with one warm tungsten edge-light catching one side of the face. The proportions are subtly wrong — slightly too tall, joints in places they should not be. "
        "Behind the figure, the absolute black of the aperture's interior. Faint cool-blue stars dust the deep field beyond the structure. "
        "Painterly atmospheric depth, severe long-awaited-arrival mood, no readable text or markings."
    ),

    # ──────────────────────────────────────────────────────────────────────
    # Per-EP recap backgrounds. One shared image per EP, used as bgImage on
    # all three filler beats within that EP.
    # ──────────────────────────────────────────────────────────────────────
    (
        "recap-ep2-sea-choir", "16:9", False,
        "Painted wide illustration of a thermocline-deep ocean at slow dusk. "
        "Painterly horizontal bands of layered sea, lit by a faint cool-blue acoustic shimmer rising from the abyss. Distant slow shapes of large unseen creatures hint at the deep choir. No surface ships, no shore. "
        "Painterly atmospheric depth, severe restructured-around-you mood, no readable markings or text."
    ),
    (
        "recap-ep3-sky-language", "16:9", False,
        "Painted wide illustration of an industrial-age night sky over a smoggy city horizon. "
        "Auroras run across the sky in painterly cool-blue waves, with subtle warm tungsten glyph-shapes embedded in the curtains — language, but unreadable. The city below is dark and indistinct. "
        "Painterly atmospheric depth, severe writing-in-the-sky mood, no actually-readable characters or text."
    ),
    (
        "recap-ep4-fire-given", "16:9", False,
        "Painted wide illustration of an atomic-age industrial horizon at deep night. "
        "Cooling towers and refinery stacks recede into the middle distance, lit by warm tungsten safety lamps. A single faint cool-blue flicker on the horizon hints at a recent fusion-test bloom that should not have happened. "
        "Painterly atmospheric depth, severe better-was-not-safer mood, no readable text or signage."
    ),
    (
        "recap-ep5-perfect-garden", "16:9", False,
        "Painted wide illustration of a long Lehlan garden terrace at slow dawn. "
        "Painterly rows of low planted beds receding into mist, with a single small stone bench in the near foreground. Soft cool-blue mist clings to the ground; warm tungsten lamps light the path. A faint single edited line of text-glyph is just barely visible carved into the stone bench, almost ornamental, not actually readable. "
        "Painterly atmospheric depth, severe careful-but-not-enough mood, no readable text."
    ),
    (
        "recap-ep6-missing-world", "16:9", False,
        "Painted wide interior illustration of a Union archive corridor at deep night. "
        "Long rows of plain filing cabinets recede into the dark, lit by a single overhead cool-blue lamp. One filing drawer in the middle of the frame is open, the file slot inside empty — a single black gap among the rows. No figures. "
        "Painterly atmospheric depth, severe folder-without-content mood, no readable labels or text."
    ),
    (
        "recap-ep7-echoes", "16:9", False,
        "Painted wide interior illustration of an evidence wall in a small private investigation room at deep night. "
        "A large board covers the wall, painted with cool-blue map traces, route lines, and pinned cards. Several thin warm tungsten threads connect groups of cards in painterly geometry, converging on one central node. A single overhead desk lamp throws cool-blue light across the wall. No figures. "
        "Painterly atmospheric depth, severe cataloguing-the-puppeteer mood, no actually-readable text on any card."
    ),
    (
        "recap-ep8-finale", "16:9", False,
        "Painted wide illustration of the interior of a small Union cutter ship's cockpit at deep night, looking past the pilot's chair through the forward viewport. "
        "Distant in the void ahead, the silhouette of an enormous relay structure half the size of a small moon. A handful of cool-blue indicator points lit on the relay's surface in a regular geometric pattern. The viewport frames the relay precisely centred. No pilot visible from this angle. "
        "Painterly atmospheric depth, severe walking-toward-the-door mood, no readable text or instrumentation."
    ),
    (
        "recap-ep9-listen-back", "16:9", False,
        "Painted wide interior illustration of Kalen's listening rig at deep night, but from a slight overhead angle. "
        "An inbox-like stack of decoded waveform printouts piles to one side of the console, several still spooling out of the printer in painterly cool-blue trace. The chair is empty. The receive indicator on the console is steady warm-tungsten — actively pulling something in. "
        "Painterly atmospheric depth, severe inbox-no-longer-empty mood, no readable text on any printout."
    ),
    (
        "recap-ep10-arrival", "16:9", False,
        "Painted wide illustration of a Union border surveillance station at deep night, looking outward over a quiet starfield. "
        "In the foreground, a small dark mechanical artefact hangs motionless in the near void — no propulsion, no signature, no markings. Behind it, distant in the depth of the field, the faint silhouettes of additional similar shapes in formation, on approach. "
        "Painterly atmospheric depth, severe arrivals-not-signals mood, no readable markings or text."
    ),

    # ──────────────────────────────────────────────────────────────────────
    # Background imagery for non-contact existing interstitials.
    # Wired in src/interstitial.js via bgImage on the corresponding beats.
    # ──────────────────────────────────────────────────────────────────────
    (
        "console-dark", "16:9", False,
        "Painted wide interior illustration of Kalen's listening rig at deep night, viewed from behind his shoulder. "
        "A worn engineering desk, two stacked decoder boxes, a single curved waveform display showing a faint cool-blue carrier line. A single warm tungsten desk lamp catches the side of one decoder face. The chair is empty in this frame. "
        "Painterly atmospheric depth, severe quiet-rig mood, no readable text or labels."
    ),
    (
        "console-bands", "16:9", False,
        "Painted wide interior illustration of Kalen's listening rig at deep night, focusing on the band-sweep panel. "
        "A row of four tall narrow waveform columns side by side, each showing a different carrier band. One column glows cool-blue and is clearly the active band; the others are dim. A few small warm tungsten indicator lamps along the bottom edge. No figures. "
        "Painterly atmospheric depth, severe explain-the-bands mood, no readable text on any panel."
    ),
    (
        "carrier-empty-push", "16:9", False,
        "Painted wide interior illustration of a single waveform display at deep night, isolated against a dark engineering wall. "
        "The display shows a single cool-blue carrier line that flattens completely halfway across the frame — a push that died. The right half of the display is empty black. A faint warm tungsten 'sent' indicator at the corner is unlit. No figures. "
        "Painterly atmospheric depth, severe push-that-did-not-carry mood, no readable text or numbers."
    ),
    (
        "rig-with-weight", "16:9", False,
        "Painted wide interior illustration of Kalen's listening rig at deep night, after a long cycle. "
        "The desk is the same as elsewhere, but the rig itself looks subtly heavier — extra cabling coiled at its base, a thin metal plate bolted into the chassis side, a small additional weight hanging from a hook. A single warm tungsten lamp catches the new addition. The chair is empty. "
        "Painterly atmospheric depth, severe accretion mood, no readable text or labels."
    ),
    (
        "engraving-handwriting", "16:9", False,
        "Painted close-up illustration of a small section of Kalen's rig chassis at deep night, lit by a single low cool-blue desk lamp. "
        "Fine hand-cut linework is scored directly into the matte metal — painterly engraver marks, looped and irregular like handwriting, three grams of removed material. A single tuning loupe lies beside the cut, casting a small warm tungsten reflection. No figures. "
        "Painterly atmospheric depth, severe handwriting-in-metal mood, no actually-readable characters."
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
