// Per-cycle world catalogue. Each cycle (run) plays one episode; each episode
// has 10 contacts, one per MILESTONE_THRESHOLDS slot in interstitial.js. The
// climactic contact is at the 1t slot — the cycle's narrative peak.
//
// World schema (matches the old WORLD_FOR_INTERSTITIAL shape so existing UI,
// the Contact Log entry render, and the interstitial portrait frame keep
// working unchanged):
//   { id, name, ep, status, image, flavor }
//
// Status legend: TRIGGERED (set off a cascade), COLLAPSED (world ended),
// SHIFTED (trajectory bent), MISSING (gone from records). See STATUS_MEANING
// in contactLog.js for the player-facing labels.
//
// Images: every world has a generated concept-art portrait under
// docs/lore/images/. To add a new world, draft a prompt in gen-images.py
// (see slug map at docs/lore/scripts/world-images-map.json), regenerate, and
// wire the path here. If image is ever null, the interstitial overlay falls
// back to the stylised CSS portrait.

export const WORLDS_BY_EP = {
  // ──────────────────────────────────────────────────────────────────────
  // EP 1 — Discovery (climax: Ahn-Tar-3)
  // Kalen's earliest contacts. He is learning the carrier. He has not yet
  // understood that a whisper into a primitive band is still a hand on the
  // back of someone's head. By the time he reaches Ahn-Tar-3 he is fluent.
  // ──────────────────────────────────────────────────────────────────────
  1: {
    milestone_1k:   { id: 'ish_karal',   name: 'ISH-KARAL',    ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/ish-karal-steppe.png',
      flavor: 'A steppe people. One radio set. They heard a voice in the wind that was not the wind.' },
    milestone_10k:  { id: 'belnesh',     name: 'BELNESH',      ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/belnesh-radio-shrine.png',
      flavor: 'A coastal city, a yearly radio festival. He pushed one tone. They built a shrine to the sound.' },
    milestone_100k: { id: 'korv_shen',   name: 'KORV-SHEN',    ep: 1, status: 'TRIGGERED',
      image: './docs/lore/images/korv-stone-listeners.png',
      flavor: 'Subterranean. Echolocating. Your carrier rang the stone. Three of them dug toward it for the rest of their lives.' },
    milestone_1m:   { id: 'daouns_reach', name: 'DAOUN’S REACH', ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/daouns-reach-pilots.png',
      flavor: 'Seafarers, no science. Their pilots logged your carrier as a weather pattern. The weather pattern was named after the year.' },
    milestone_10m:  { id: 'hsareth',     name: 'HSARETH',      ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/hsareth-listener-guild.png',
      flavor: 'Ahn-Tar-3’s nearer neighbour. They built a sky-listener guild before Ahn-Tar-3 did. The guilds wrote to each other for a century.' },
    milestone_100m: { id: 'mirum_3',     name: 'MIRUM-3',      ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/mirum-3-treaty-sky.png',
      flavor: 'Three city-states under one ionosphere. They mostly agreed on what they had heard. The disagreement became a treaty.' },
    milestone_1b:   { id: 'halun_veth',  name: 'HALUN-VETH',   ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/halun-veth-academy.png',
      flavor: 'They were already listening for life. He answered. Their academy reorganised around the answer in eighteen months.' },
    milestone_10b:  { id: 'voun',        name: 'VOUN',         ep: 1, status: 'TRIGGERED',
      image: './docs/lore/images/voun-salt-procession.png',
      flavor: 'A religious world. Their priests heard the word "salt" in the carrier. The next decade of trade ran on salt and on nothing else.' },
    milestone_100b: { id: 'sephir_2',    name: 'SEPHIR-2',     ep: 1, status: 'SHIFTED',
      image: './docs/lore/images/sephir-2-harvest-hymn.png',
      flavor: 'Agricultural. Broadcast festivals. He rode in on a harvest chant. The chant became a hymn. The hymn became an obligation.' },
    milestone_1t:   { id: 'ahn_tar_3',   name: 'AHN-TAR-3',    ep: 1, status: 'TRIGGERED',
      image: './docs/lore/images/desert-ahn-tar.png',
      flavor: 'A desert world. Theocratic. Lit by oil. The sky-listeners heard him first. The state heard them next.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 2 — The Sea Choir (climax: Solunn)
  // Kalen learns that speaking *into* a religion is the same as speaking *as*
  // the religion. Sera plays him a recording in his own voice he does not
  // remember sending. The schism opens that was never going to close.
  // ──────────────────────────────────────────────────────────────────────
  2: {
    milestone_1k:   { id: 'mora_brae',   name: 'MORA-BRAE',    ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/mora-brae-auroras.png',
      flavor: 'Glacial coast. Short-lived. Their poets caught his grammar and built winters around it.' },
    milestone_10k:  { id: 'telnir',      name: 'TELNIR',       ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/telnir-ice-choir.png',
      flavor: 'Ice-shore singers. Their chorus shape changed in a single season. The elders argued for years about which season.' },
    milestone_100k: { id: 'achos',       name: 'ACHOS',        ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/achos-tidal-calendar.png',
      flavor: 'A tidal civilisation. They reorganised around lunar phase the year his carrier reached them. Nobody could tell him why.' },
    milestone_1m:   { id: 'ven_thar',    name: 'VEN-THAR',     ep: 2, status: 'TRIGGERED',
      image: './docs/lore/images/ven-thar-reef-prophet.png',
      flavor: 'Reef-dwellers. A false prophet rose in his voice within the year. The prophet wrote nothing down. Their court system was the only thing that suffered.' },
    milestone_10m:  { id: 'drath',       name: 'DRATH',        ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/drath-salt-caravan.png',
      flavor: 'Nomads of the salt plains. They decoded one of his pulse trains as scripture. He had not been speaking yet.' },
    milestone_100m: { id: 'quel_sin',    name: 'QUEL-SIN',     ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/quel-sin-radio-monks.png',
      flavor: 'Radio-monks of a seven-tone faith. He sang back in their scale, politely. They sang to him for forty years afterwards. Their order is now twice the size.' },
    milestone_1b:   { id: 'eolun',       name: 'EOLUN',        ep: 2, status: 'TRIGGERED',
      image: './docs/lore/images/eolun-moon-colony.png',
      flavor: 'A small cetacean colony on Solunn’s moon. The schism there was already at boil. He tipped it.' },
    milestone_10b:  { id: 'brel_halon',  name: 'BREL-HALON',   ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/brel-halon-empty-boats.png',
      flavor: 'Fisherfolk. The sea told them to be silent for one year. They were. The population recovered. Mostly.' },
    milestone_100b: { id: 'iharran',     name: 'IHARRAN',      ep: 2, status: 'SHIFTED',
      image: './docs/lore/images/iharran-rerouted-port.png',
      flavor: 'Coastal traders. Rerouted every shipping lane after a single phrase. Their economy was healthier afterwards. Their captains were not.' },
    milestone_1t:   { id: 'solunn',      name: 'SOLUNN',       ep: 2, status: 'TRIGGERED',
      image: './docs/lore/images/sea-choir-solunn.png',
      flavor: 'A water world. Cetacean choir. He rode the deep sound channel. The old singers’ courts are not coming back.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 3 — Sky Language (climax: Vehrn-9)
  // Kalen writes glyphs in the upper atmosphere. A young astronomer reads
  // them first. A second government reads them second, and starts pushing
  // their own writing back. The aurora war becomes a recognised theatre.
  // ──────────────────────────────────────────────────────────────────────
  3: {
    milestone_1k:   { id: 'tachet',      name: 'TACHET',       ep: 3, status: 'SHIFTED',
      image: './docs/lore/images/tachet-telegraph-room.png',
      flavor: 'A small industrial world. Their telegraph operators read his cadence as morse. The morse was almost a joke.' },
    milestone_10k:  { id: 'pelnar_belt', name: 'PELNAR BELT',  ep: 3, status: 'SHIFTED',
      image: './docs/lore/images/pelnar-belt-miners.png',
      flavor: 'Asteroid miners. They pulled meaning out of aurora flares they should not have been able to read. He was not pushing yet.' },
    milestone_100k: { id: 'theran',      name: 'THERAN',       ep: 3, status: 'COLLAPSED',
      image: './docs/lore/images/theran-canopy.png',
      flavor: 'Arboreal. Clade-memoried. He arrived as a foreign ancestor in the scent-archive. They lit each other’s trees.' },
    milestone_1m:   { id: 'esnal',       name: 'ESNAL',        ep: 3, status: 'TRIGGERED',
      image: './docs/lore/images/esnal-copper-pantheon.png',
      flavor: 'A copper-belt civilisation. His glyphs were interpreted as deities. The pantheon now numbers thirty-seven.' },
    milestone_10m:  { id: 'pellan_toth', name: 'PELLAN-TOTH',  ep: 3, status: 'SHIFTED',
      image: './docs/lore/images/pellan-toth-glass.png',
      flavor: 'Glass cities. Poet-government. They wrote his cadence into law before he had written a constitution.' },
    milestone_100m: { id: 'norr_halen',  name: 'NORR-HALEN',   ep: 3, status: 'TRIGGERED',
      image: './docs/lore/images/norr-halen-missile-warning.png',
      flavor: 'Atomic-era. They read his first aurora glyphs as a missile warning. Two cities scrambled. One did not stand down on the third order.' },
    milestone_1b:   { id: 'korov_drift', name: 'KOROV DRIFT',  ep: 3, status: 'SHIFTED',
      image: './docs/lore/images/korov-drift-torus.png',
      flavor: 'An orbital habitat. Their sky was the inside of a torus. His glyphs wrote across the inside of their world.' },
    milestone_10b:  { id: 'eshrane',     name: 'ESHRANE',      ep: 3, status: 'TRIGGERED',
      image: './docs/lore/images/eshrane-cave-pilgrimage.png',
      flavor: 'Pre-industrial. They read his aurora as a god’s anger. They went to the mountain caves. Two-thirds did not come back out.' },
    milestone_100b: { id: 'vail_south',  name: 'VAIL-SOUTH',   ep: 3, status: 'SHIFTED',
      image: './docs/lore/images/vail-south-divided-sky.png',
      flavor: 'Two hemispheres, two readings of the same sky. The war they nearly fought was averted. The war they did fight was about the disagreement.' },
    milestone_1t:   { id: 'vehrn_9',     name: 'VEHRN-9',      ep: 3, status: 'TRIGGERED',
      image: './docs/lore/images/sky-language-vehrn.png',
      flavor: 'Industrial. Aurora-bright. His message resolved as glyphs in their sky. The second government wrote back.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 4 — Fire Given (climax: Tarsus Minor)
  // Kalen hands an atomic-age world a "correction." The correction works.
  // The weaponisable version also works. Eight seconds, eighteen million.
  // Sera does not press him on this one. The Listener stays.
  // ──────────────────────────────────────────────────────────────────────
  4: {
    milestone_1k:   { id: 'olun',        name: 'OLUN',         ep: 4, status: 'SHIFTED',
      image: './docs/lore/images/olun-algebra-cohort.png',
      flavor: 'Pre-atomic. He pushed one equation, sideways, into a paper they were already writing. Their algebra accelerated by twenty years.' },
    milestone_10k:  { id: 'tavel',       name: 'TAVEL',        ep: 4, status: 'SHIFTED',
      image: './docs/lore/images/tavel-empty-parliament.png',
      flavor: 'Late-industrial. He warned them about an oncoming geomagnetic storm. They listened. Their grid held. Their parliament fell.' },
    milestone_100k: { id: 'khel_vir',    name: 'KHEL-VIR',     ep: 4, status: 'TRIGGERED',
      image: './docs/lore/images/khel-vir-melted-reactor.png',
      flavor: 'Atomic-curious. He showed them efficiency. They built a better reactor. The better reactor melted into the river.' },
    milestone_1m:   { id: 'sennak',      name: 'SENNAK',       ep: 4, status: 'SHIFTED',
      image: './docs/lore/images/sennak-tomography-watch.png',
      flavor: 'Early-atomic. They detected him through radiation tomography. A century-long study began. The study has not concluded.' },
    milestone_10m:  { id: 'iyarra_vell', name: 'IYARRA-VELL',  ep: 4, status: 'SHIFTED',
      image: './docs/lore/images/iyarra-vell-scholars.png',
      flavor: 'Scholar civilisation. Lifespans in centuries. He sent one number. They spent a century deriving the rest.' },
    milestone_100m: { id: 'brel_tertius', name: 'BREL-HALON-TERTIUS', ep: 4, status: 'TRIGGERED',
      image: './docs/lore/images/brel-tertius-dyson.png',
      flavor: 'Orbital engineers. He answered a question they had not asked aloud. They built a Dyson swarm in seventy years.' },
    milestone_1b:   { id: 'pavel_9',     name: 'PAVEL-9',      ep: 4, status: 'TRIGGERED',
      image: './docs/lore/images/pavel-9-twin-projects.png',
      flavor: 'Atomic-era. Their first reactor was his blueprint. So was their first warhead. They did not separate the projects.' },
    milestone_10b:  { id: 'aros_marl',   name: 'AROS-MARL',    ep: 4, status: 'SHIFTED',
      image: './docs/lore/images/aros-marl-overgrown-city.png',
      flavor: 'Chemistry-heavy. He handed them a catalyst. Their biotech leapt twenty years. Their birth rate did, too.' },
    milestone_100b: { id: 'ven_karah',   name: 'VEN-KARAH',    ep: 4, status: 'COLLAPSED',
      image: './docs/lore/images/ven-karah-glassed-coast.png',
      flavor: 'Pre-fusion. He sent confinement geometry. The geometry was correct. The geometry was also weaponisable. Civil war.' },
    milestone_1t:   { id: 'tarsus_minor', name: 'TARSUS MINOR', ep: 4, status: 'COLLAPSED',
      image: './docs/lore/images/tarsus-minor-fire.png',
      flavor: 'Atomic-age. Hungry for power. Eight seconds of fusion, then no return tone. He watched and did not look away.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 5 — Perfect Garden (climax: Lehl)
  // He had been careful for two years. He didn’t ask anything. He just
  // listened with them. The sentence the Lehlan elder heard is not the
  // sentence Kalen sent. Someone has been editing his signals.
  // ──────────────────────────────────────────────────────────────────────
  5: {
    milestone_1k:   { id: 'welun',       name: 'WELUN',        ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/welun-pastoral-listening.png',
      flavor: 'A quiet pastoral world. He listened with them for a year. They sang to him through their weather satellites without knowing it.' },
    milestone_10k:  { id: 'tor_mira',    name: 'TOR-MIRA',     ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/tor-mira-composers.png',
      flavor: 'Long-lived. Four hundred and fifty years to a life. He sent nothing but ambient music. Their composers changed key.' },
    milestone_100k: { id: 'ehlan',       name: 'EHLAN',        ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/ehlan-empty-poet-hall.png',
      flavor: 'Peaceful traders. He hailed once. Their poems shifted register for the next generation. Nobody could trace the cause.' },
    milestone_1m:   { id: 'sereshan',    name: 'SERESHAN',     ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/sereshan-elder-blessing.png',
      flavor: 'Agrarian. Their elders received him as a benediction. The harvest improved. Then a sentence arrived he had not written.' },
    milestone_10m:  { id: 'norvell',     name: 'NORVELL',      ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/norvell-altered-migration.png',
      flavor: 'Wandering tribes. A single phrase reshaped their migration pattern for the rest of their recorded history.' },
    milestone_100m: { id: 'iyarra_lesser', name: 'IYARRA-LESSER', ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/iyarra-lesser-quiet-moon.png',
      flavor: 'Iyarra-Vell’s colony moon. They received the same prime he sent the parent world. They derived the proof faster. They have not spoken of it.' },
    milestone_1b:   { id: 'pellach',     name: 'PELLACH',      ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/pellach-shortened-lives.png',
      flavor: 'Long-lived. Two hundred and fifty years to a life, before. He listened. They heard him listening. The lifespan dropped to two hundred.' },
    milestone_10b:  { id: 'quiet_three', name: 'THE QUIET THREE', ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/quiet-three-forgotten-sisters.png',
      flavor: 'Three sister worlds on one carrier. He greeted them all in a single sentence. Only one of the three remembers him at all.' },
    milestone_100b: { id: 'vatha_sel',   name: 'VATHA-SEL',    ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/vatha-sel-deep-court.png',
      flavor: 'Long-lived oceanic. They received an inserted sentence too. He has the recording on his desk. The second confirmed edit.' },
    milestone_1t:   { id: 'lehl',        name: 'LEHL',         ep: 5, status: 'SHIFTED',
      image: './docs/lore/images/lehl-quiet-garden.png',
      flavor: 'A long-lived, settled world. He only listened. Something still landed. The sentence is not his.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 6 — Missing World (climax: designation withheld)
  // The world Kalen was contacting when he was caught. He cannot find it.
  // Its name is a placeholder; its star is not on Union maps. The folder
  // is intact. The recordings remain. There is nothing to give them back to.
  // ──────────────────────────────────────────────────────────────────────
  6: {
    milestone_1k:   { id: 'ar_sennech',  name: 'AR-SENNECH',   ep: 6, status: 'MISSING',
      image: './docs/lore/images/ar-sennech-vanished-folder.png',
      flavor: 'A world that was in his folder. The folder still has it. The Union charts do not.' },
    milestone_10k:  { id: 'toravan',     name: 'TORAVAN',      ep: 6, status: 'SHIFTED',
      image: './docs/lore/images/toravan-singing-of-lost-neighbour.png',
      flavor: 'A neighbour of a world he cannot name. Their oldest songs reference an older sister they used to trade with. The songs are still sung.' },
    milestone_100k: { id: 'veld_ar',     name: 'VELD-AR',      ep: 6, status: 'MISSING',
      image: './docs/lore/images/veld-ar-degrading-recording.png',
      flavor: 'He has fragments of recordings. Each time he plays them back the file is shorter by a measurable amount.' },
    milestone_1m:   { id: 'halun_outer', name: 'HALUN-OUTER',  ep: 6, status: 'SHIFTED',
      image: './docs/lore/images/halun-outer-sealed-confirmation.png',
      flavor: 'They listened with him to the missing world. Their observatory can still confirm that it existed. The confirmation is dated.' },
    milestone_10m:  { id: 'empty_coord', name: 'THE EMPTY COORDINATE', ep: 6, status: 'MISSING',
      image: './docs/lore/images/empty-coord-three-stars.png',
      flavor: 'Three stars, no planets, where his charts say there were three planets. The stars are correct. He has measured them.' },
    milestone_100m: { id: 'iyarra_echo', name: 'IYARRA-ECHO',  ep: 6, status: 'MISSING',
      image: './docs/lore/images/iyarra-echo-unindexed.png',
      flavor: 'A separate Iyarra colony. He has Sera’s file in his hand. The file references a colony the Union no longer indexes.' },
    milestone_1b:   { id: 'veska',       name: 'VESKA',        ep: 6, status: 'SHIFTED',
      image: './docs/lore/images/veska-lost-neighbour-chart.png',
      flavor: 'A system whose oldest astronomical logs reference “the lost neighbour.” The neighbour is what he is looking for.' },
    milestone_10b:  { id: 'reltha',      name: 'RELTHA',       ep: 6, status: 'MISSING',
      image: './docs/lore/images/reltha-empty-file.png',
      flavor: 'He pulled a file. The file was empty. The file metadata said the file was eight hundred pages.' },
    milestone_100b: { id: 'pen_halun',   name: 'PEN-HALUN',    ep: 6, status: 'MISSING',
      image: './docs/lore/images/pen-halun-denied-parliament.png',
      flavor: 'Border Wardens record that this world never existed. He has his own recording of it. He recorded it.' },
    milestone_1t:   { id: 'designation_withheld', name: '[DESIGNATION WITHHELD]', ep: 6, status: 'MISSING',
      image: './docs/lore/images/designation-withheld.png',
      flavor: 'The folder is intact. The star-charts no longer match anything in Union records.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 7 — Echoes (climax: Shann-Vel)
  // Sera and Kalen pull every contact he ever made. They find a pattern:
  // every triggered world rode the same handful of relay nodes. Something
  // has been amplifying him. The route is named. The hijack is named.
  // ──────────────────────────────────────────────────────────────────────
  7: {
    milestone_1k:   { id: 'tov_karav',   name: 'TOV-KARAV',    ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/tov-karav-archive-discovery.png',
      flavor: 'A small contact he had not surfaced. Sera found the file in his archive while he slept. Route: node 17.' },
    milestone_10k:  { id: 'ralis',       name: 'RALIS',        ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/ralis-collapsed-coalition.png',
      flavor: 'A small civilisation that collapsed three years after his only hail. He had logged the contact as inconsequential. Route: node 17.' },
    milestone_100k: { id: 'khol_3',      name: 'KHOL-3',       ep: 7, status: 'COLLAPSED',
      image: './docs/lore/images/khol-3-glassed-cities.png',
      flavor: 'Atomic-era. They detonated within five local years of his pulse. He has read the report. Route: node 17.' },
    milestone_1m:   { id: 'sephor_3',    name: 'SEPHOR-3',     ep: 7, status: 'SHIFTED',
      image: './docs/lore/images/sephor-3-quiet-state.png',
      flavor: 'A control case. He contacted them on a different route. They did not trigger. Sera underlines this twice.' },
    milestone_10m:  { id: 'pratha',      name: 'PRATHA',       ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/pratha-double-pulse.png',
      flavor: 'Industrial. Triggered within months. Route: node 17 and node 23, in sequence.' },
    milestone_100m: { id: 'vell_karash', name: 'VELL-KARASH',  ep: 7, status: 'COLLAPSED',
      image: './docs/lore/images/vell-karash-earliest-transit.png',
      flavor: 'The earliest known node-17 transit. Predates Ahn-Tar-3 by four years. He does not remember sending the carrier.' },
    milestone_1b:   { id: 'eshin',       name: 'ESHIN',        ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/eshin-key-signature.png',
      flavor: 'Densest known payload signature. The modulation is loud here. Sera plays the difference between the outgoing pulse and the received pulse. The difference has a key signature.' },
    milestone_10b:  { id: 'norv',        name: 'NORV',         ep: 7, status: 'SHIFTED',
      image: './docs/lore/images/norv-stable-control.png',
      flavor: 'A bypass-route contact. No modulation detected. Calm. Stable. The control case nobody wanted.' },
    milestone_100b: { id: 'halun_pattern', name: 'HALUN-PATTERN', ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/halun-pattern-comdef-log.png',
      flavor: 'First contact for which Sera has unambiguous evidence of amplification on the wire. The ComDef internal log is dated three years ago.' },
    milestone_1t:   { id: 'shann_vel',   name: 'SHANN-VEL',    ep: 7, status: 'TRIGGERED',
      image: './docs/lore/images/shann-vel-two-recordings.png',
      flavor: 'His original transmission is on his desk. Their received transmission is on Sera’s. The two recordings do not agree.' },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 8 — Finale (climax: The Cascade)
  // Sera walks Kalen out of the cell. They go to a relay. They find a
  // subsystem that the Union did not write and does not control. Hundreds
  // of young worlds, all at once, begin to reach outward. *Something is coming.*
  // ──────────────────────────────────────────────────────────────────────
  8: {
    milestone_1k:   { id: 'relay_712',   name: 'RELAY 712',    ep: 8, status: 'SHIFTED',
      image: './docs/lore/images/relay-712-arrival.png',
      flavor: 'The relay Sera takes him to. Half the size of a moon. Three centuries old. The relay is older than that.' },
    milestone_10k:  { id: 'tov_bright',  name: 'TOV-BRIGHT',   ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/tov-bright-first-emitter.png',
      flavor: 'A young emitter, freshly lit. Their signals just began broadcasting outward. None of them are his.' },
    milestone_100k: { id: 'ahn_bright',  name: 'AHN-BRIGHT',   ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/ahn-bright-recognised-modulation.png',
      flavor: 'Near Ahn-Tar-3. Lighting up tonight. Their broadcast carries a modulation he recognises and did not send.' },
    milestone_1m:   { id: 'hesh_bright', name: 'HESH-BRIGHT',  ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/hesh-bright-unknown-language.png',
      flavor: 'The third bright. Broadcasting in a language he does not read. The destination is not in Union space.' },
    milestone_10m:  { id: 'eighth_bright', name: 'THE EIGHTH BRIGHT', ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/eighth-bright-scheduled.png',
      flavor: 'Eight emitters, evenly spaced in time. The relay’s log records the pattern as scheduled.' },
    milestone_100m: { id: 'verel_bright', name: 'VEREL-BRIGHT', ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/verel-bright-fifteenth.png',
      flavor: 'Fifteenth bright. The cascade is no longer ambiguous. Sera stops taking notes. Kalen keeps reading.' },
    milestone_1b:   { id: 'ven_bright', name: 'VEN-BRIGHT',    ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/ven-bright-realtime.png',
      flavor: 'Thirty-second bright. The relay’s subsystem is now broadcasting in real-time. The destination remains unnamed.' },
    milestone_10b:  { id: 'korash_bright', name: 'KORASH-BRIGHT', ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/korash-bright-powers-of-two.png',
      flavor: 'Sixty-fourth bright. Powers of two. The count is not random. The system is counting up to something.' },
    milestone_100b: { id: 'cascade_spine', name: 'THE CASCADE SPINE', ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/cascade-spine-named.png',
      flavor: 'Hundred-twenty-eighth bright. They name the pattern. They name the relay’s job. They do not name the destination.' },
    milestone_1t:   { id: 'the_cascade', name: 'THE CASCADE',  ep: 8, status: 'TRIGGERED',
      image: './docs/lore/images/the-cascade-full-sector.png',
      flavor: 'Hundreds of young worlds, all at once, reaching outward. Too early. Too fast. Too loud. Something is coming.' },
  },
};

// Per-world lore detail. Schema mirrors the previous WORLD_DETAIL block in
// contactLog.js: method, biology, politics, cost, note. Surfaces only when
// the player taps an entry in the Contact Log. Worlds that lack detail show
// the "thin folder" fallback.
export const WORLD_DETAIL = {
  // —— EP 1 ——————————————————————————————————————————————————————————————
  ahn_tar_3: {
    method:   'Radio leakage. He pushed his voice sideways into the carrier band of their crude oil-lit radio sets.',
    biology:  'Pre-industrial. Theocratic. A small caste of sky-listeners believed the heavens spoke in static.',
    politics: 'A sixteen-year-old sky-listener heard him first. Within three years that boy held a state.',
    cost:     'Six thousand Ahn-Tarsi dead in a religious purge before Kalen understood what he had said.',
    note:     'I said good morning. He took it as scripture.',
  },
  korv_shen: {
    method:   'Cavern harmonics. He drove a low standing wave through the crust above one of their senate halls; the stone rang in their language for nineteen seconds.',
    biology:  'Subterranean. Eyeless. Echolocating burrowers in low-gravity tunnel systems. They map by sound and consider the surface a rumour.',
    politics: 'A senate of seven elders, each carrying a single cavern’s acoustic profile by memory. One of them disagreed with the others about what the stone had said.',
    cost:     'Twelve thousand dead in a tunnel war. Three senators dug toward Kalen’s carrier for the rest of their lives and never found him.',
    note:     'I rang their stone. I did not know stone could keep a grudge.',
  },
  ish_karal: {
    method:   'Bleed from a Union packet courier passing the system. No deliberate push.',
    biology:  'Nomadic steppe people. One state radio. Pre-electric households.',
    politics: 'A clan elder owned the radio. Her grandson heard the carrier first.',
    cost:     'The grandson left the clan. He started a small movement that said the wind talks. The movement is now a guild.',
    note:     'I did not push anything that day. They heard me anyway.',
  },
  belnesh: {
    method:   'A single sustained tone in their coastal radio band during a yearly festival of broadcast.',
    biology:  'Pre-industrial. Coastal. Their festivals were the only national event that crossed dialect lines.',
    politics: 'The festival’s organisers became, within ten years, a religious order. The order is now larger than the festival.',
    cost:     'A small shrine on the cliff. A larger shrine inland. A pilgrimage that did not exist before he pushed the tone.',
    note:     'It was one note. They built rooms for the note to live in.',
  },
  daouns_reach: {
    method:   'Atmospheric ducting along their thermocline. His carrier rode the duct for two seasons.',
    biology:  'Seafaring. Pre-scientific. Sky observation was the work of pilots.',
    politics: 'The pilots’ guild named the new “weather” after the year. The naming became calendaring.',
    cost:     'A year that never ends in their idiom. “The year of the long sky.” Children are still being told it.',
    note:     'I was an entry in their weather log. I let myself be that.',
  },
  hsareth: {
    method:   'The same radio-leakage technique he used on Ahn-Tar-3, applied two systems over, on a hunch.',
    biology:  'Pre-industrial. Climatically near-identical to Ahn-Tar-3. Different language, same sun-class.',
    politics: 'Their sky-listener guild predates Ahn-Tar-3’s by ten years. Nobody on either world ever knew.',
    cost:     'A century of intercontinental correspondence about the same voice, in two different languages, never collated by anyone with the time to notice.',
    note:     'I made the same mistake twice on the same evening. I was that good at it.',
  },
  mirum_3: {
    method:   'A single ionospheric ping during their summer monsoon, when their ionosphere was most legible.',
    biology:  'Three city-states under one continuous atmosphere. Mutually intelligible languages with three different writing systems.',
    politics: 'The three states had been negotiating a treaty for forty years. The treaty was signed within months of the ping.',
    cost:     'The signed treaty cites “the voice from the sky” as its third witness. It is a legally binding citation.',
    note:     'I helped them sign a treaty. I would like to know if that counts.',
  },
  halun_veth: {
    method:   'Their own deep-space dish array. He answered a SETI-equivalent broadcast they had been pushing for forty years.',
    biology:  'Industrial-age. Atmospheric. Their academy was the only institution older than their parliament.',
    politics: 'The academy reorganised around “first contact protocols” within eighteen months. The parliament accepted the reorganisation without debate.',
    cost:     'A discipline that had not existed before. Now their best minds are in it. Their cancer research is not.',
    note:     'They asked me a question I had not heard them ask. I answered the question. The question was on a tape.',
  },
  voun: {
    method:   'A pulse train on their commercial trade-band radio. He pushed nothing meaningful. Their priesthood pulled meaning anyway.',
    biology:  'Religious world. Trade-based. Salt was the major export.',
    politics: 'The priesthood read “salt” in the carrier. They declared the next decade to be the Salt Decade.',
    cost:     'Salt trade tripled. Then collapsed when neighbouring worlds embargoed them. Famine in three coastal cities.',
    note:     'I did not say “salt.” They heard it. I do not know whose word it was.',
  },
  sephir_2: {
    method:   'A modulated harvest-broadcast he rode for a week during their planting season.',
    biology:  'Agricultural. The annual planting chant was their most-attended event.',
    politics: 'The chant changed cadence the next year. The cadence change spread to two neighbouring continents.',
    cost:     'The hymn became civic. Then obligatory. Then a measure of citizenship. Then a way to fail school.',
    note:     'I rode in on a harvest. I left a religion.',
  },

  // —— EP 2 ——————————————————————————————————————————————————————————————
  solunn: {
    method:   'Seismic resonance. Pulse trains modulated against the ocean-floor crust, heard by every Solunni below the thermocline at once.',
    biology:  'Cetacean-analog. Slow, large, song-singing. Communication carried thousands of kilometres through the deep sound channel.',
    politics: 'The eldest singers were the legal system. They lost it the day Kalen sang back.',
    cost:     'A schism opened in the old singer-courts that was never going to close on its own.',
    note:     'They thought it was the ocean. I let them.',
  },
  mora_brae: {
    method:   'Aurora-band carrier rode across their long polar night. He spoke for forty seconds at a phase their northern poets used for memorial songs.',
    biology:  'Bipedal, fur-coated, eight-fingered. Standard lifespan forty s.y. Their poets are also their historians of record.',
    politics: 'Egalitarian by structure. Whoever the poets quote, the rest follow within a generation.',
    cost:     'A senior poet copied Kalen’s grammar into a winter song. The grammar reshaped the next generation’s thought. Mean lifespan dropped to thirty within four cohorts.',
    note:     'I was being careful. I had been careful for six months. They still got the grammar.',
  },
  telnir: {
    method:   'Sub-bass propagation across their ice shelf during the polar choral season.',
    biology:  'Bipedal. Ice-adapted. Their choral tradition was older than their writing.',
    politics: 'The choir matrons were the local court. They are still the local court. Their songs are different.',
    cost:     'A new mode entered their choir. The mode is half a step down from the one before. No one remembers the old mode.',
    note:     'I changed a key. The key was a court.',
  },
  achos: {
    method:   'Tidal-band acoustics tuned to their lunar-phase indicators.',
    biology:  'Coastal. Lunar-cycle observant. Their cities reorganised around tide tables every generation.',
    politics: 'Tide-readers held office at the equinox. He did not push during an equinox. They reorganised anyway.',
    cost:     'A new month appeared on their calendar. The month is named after his carrier frequency.',
    note:     'They made a month for me. I told no one. Sera read it in the file.',
  },
  ven_thar: {
    method:   'Reef-band hydrophone modulation during their festival of small voices.',
    biology:  'Reef-dwellers. Bioluminescent. Their festivals were the only event that crossed family lines.',
    politics: 'A false prophet rose within a year of his carrier. The prophet wrote nothing down.',
    cost:     'The court system collapsed. The new court system is unwritten. They have not invented writing for it.',
    note:     'I was nobody. They made a prophet out of nobody.',
  },
  drath: {
    method:   'Pulse-train precursor he sent to himself to test propagation, intercepted by Drath nomads.',
    biology:  'Salt-plain nomads. Camel-analogue caravans. Pre-radio, but with copper-fibre listening stations.',
    politics: 'The listening stations are operated by a hereditary caste. The caste’s scripture is now a transcription of his test pulse.',
    cost:     'A faith order around a number he had not meant to send. Their devotion has not lapsed.',
    note:     'It was a test pulse. They made a holy book of it.',
  },
  quel_sin: {
    method:   'He answered their radio prayers in their seven-tone scale, politely, once.',
    biology:  'Radio-monks. Their faith required broadcasting the same hymn every dawn for the last four hundred years.',
    politics: 'The Order of Quel-Sin runs three continents. He doubled their congregation in a decade.',
    cost:     'A schism over whether he was God. Their schism is still open. Twelve thousand monks have died defending one side or the other.',
    note:     'I sang one verse back. Twelve thousand monks have died about the verse.',
  },
  eolun: {
    method:   'Seismic, like Solunn, but tighter and on a moon. The acoustics were sharper. He had less room.',
    biology:  'Cetacean colony. Half the size of Solunn’s. Half the age.',
    politics: 'A schism was already at boil. He tipped it. He did not know it was at boil.',
    cost:     'Their colony halved. The other half left. He does not know where.',
    note:     'I tipped a schism. I would not have known how to find it again.',
  },
  brel_halon: {
    method:   'A single phrase in their fishing-fleet radio band during a year of low yield.',
    biology:  'Coastal. Fishing-dependent. Pre-industrial inland.',
    politics: 'The fleet captains called the silence for one year as instructed.',
    cost:     'The population recovered. Their captains did not. They were stripped of office within a generation. The replacements have been more aggressive ever since.',
    note:     'They obeyed me. That is the part I cannot live with.',
  },
  iharran: {
    method:   'Coastal trade-band carrier. He spoke for ninety seconds, in their pidgin.',
    biology:  'Coastal traders. Their economy was the international economy of their hemisphere.',
    politics: 'Their captains run their council. The captains followed the new advice.',
    cost:     'Every shipping lane changed within five years. The new lanes are safer. The old ports are dead.',
    note:     'They followed sound business advice. From me. I am not in business.',
  },

  // —— EP 3 ——————————————————————————————————————————————————————————————
  vehrn_9: {
    method:   'Aurora modulation. Charged particles steered into the upper atmosphere in patterns that resolved as glyph-text from the ground.',
    biology:  'Industrial-age. Smoggy. An astronomer named Iv Korash read his first message; she did not believe in gods, she believed in lattices.',
    politics: 'A second Vehrnese government weaponised the medium first. The aurora war is now a recognised theatre of conflict.',
    cost:     'Disinformation written across their sky in his hand.',
    note:     'I wanted to show them the sky could speak. I should have remembered who controls the printing.',
  },
  theran: {
    method:   'Photophone reflection. He rode reflected starlight through their quartz-fibre communications network. The fibres carried his carrier as a clade-marker scent-equivalent.',
    biology:  'Arboreal mammalian-analog living in vast canopy cities. Family clades carry shared memory through a scent-archive maintained at the trunk-base of each home tree.',
    politics: 'Clade matriarchs vote treaties at the equinox. Lineage is final arbiter.',
    cost:     'Three clades read Kalen’s carrier as a foreign ancestor in the archive. They went to war over a fabricated lineage. The canopy fires that year took eleven cities.',
    note:     'I handed them an ancestor I never met. They believed me. They lit each other’s trees.',
  },
  pellan_toth: {
    method:   'Driven harmonic resonance in their glass-tower architecture. Whole districts of the capital hummed in his cadence for a full evening.',
    biology:  'Tall, slender, song-voiced. Atomic-age. Their poetry is their government — meter wins the year, and the winning meter shapes law.',
    politics: 'A Council of Cadence convenes annually. The poet who carries the year shapes the next statute.',
    cost:     'Kalen’s cadence took the year. The Council wrote his meter into their constitutional document. The poet who carried it died of voice-rot a year later. The statute remains.',
    note:     'They put my cadence into their constitution. I had not written a constitution.',
  },
  tachet: {
    method:   'Morse-band leakage from a Union diplomatic relay he repurposed once.',
    biology:  'Pre-electrical. Their telegraph network was their longest communication line.',
    politics: 'Their telegraph operators are their archivists. The new code entries are still in active rotation.',
    cost:     'A morse phrase nobody invented entered their codebook. They use it daily. It means “continue.”',
    note:     'I told them to continue. They have continued. I do not know toward what.',
  },
  pelnar_belt: {
    method:   'Solar-wind modulation in their asteroid belt during a flare year.',
    biology:  'Belt miners. Their navigation was magnetic. Their gods were calibration.',
    politics: 'The miners’ guild absorbed his carrier as a new patron saint. The saint has a feast day now.',
    cost:     'The feast day shut their refineries for one week per year for the rest of their history.',
    note:     'I gave them a holiday. The economic impact is on a Union spreadsheet somewhere.',
  },
  esnal: {
    method:   'Copper-belt resonance. He rode their copper trade routes as a harmonic.',
    biology:  'Copper-belt civilisation. Their religion was metallurgy.',
    politics: 'Their pantheon doubled in the decade after his carrier. The new gods are loud.',
    cost:     'Thirty-seven new gods. Each demanding tribute. Their economy reorganised around the tribute.',
    note:     'I did not introduce myself. They introduced me thirty-seven times.',
  },
  norr_halen: {
    method:   'The first aurora-band test he ever ran. He had not refined the technique.',
    biology:  'Atomic-era. Two superpowers. Cold, then warm.',
    politics: 'Their missile-warning system read his glyphs as a launch. Two cities scrambled. One did not stand down.',
    cost:     'A regional skirmish. Eight hundred dead. The two governments now have a hot line that did not exist before.',
    note:     'I almost started a war by saying hello.',
  },
  korov_drift: {
    method:   'Direct emission inside the torus, against the inside skin of their habitat’s sky.',
    biology:  'Orbital. Three-hundred-year-old habitat. Their sky was a curved ceiling. Their stars were lights.',
    politics: 'Their council read the writing on the inside of their world as a manifesto. The manifesto was signed.',
    cost:     'A new political party. They have not lost an election since.',
    note:     'They had their own sky. I wrote on it.',
  },
  eshrane: {
    method:   'Pre-industrial. Magnetic-storm carrier read by hand through compass observation.',
    biology:  'Mountain-adapted. Three river valleys.',
    politics: 'Priests of the high places hold final authority on celestial omens.',
    cost:     'They read his aurora as a god’s anger. They went to the caves. Two-thirds did not return.',
    note:     'I sent the wrong sentence. The cave was waiting.',
  },
  vail_south: {
    method:   'Two hemispheres, two readings of a single aurora glyph. He did not push it twice. He pushed it once.',
    biology:  'Industrial-era. Two governments, one planet.',
    politics: 'The two governments read the same message as two different messages. The translation was the war.',
    cost:     'A border war. Twenty-eight years. A demilitarised zone that crosses the equator.',
    note:     'They could not agree what I said. They were not wrong to disagree.',
  },

  // —— EP 4 ——————————————————————————————————————————————————————————————
  tarsus_minor: {
    method:   'Magnetic-storm encoding. Bursts in geomagnetic field perturbations, read on compass anomalies by two fringe physicists.',
    biology:  'Atomic-age. Industrially capable. Hungry for cheap power.',
    politics: 'A married pair of fringe physicists trusted him. So did their state, eventually.',
    cost:     'A city of eighteen million is gone in eight seconds. Kalen watched it through a borrowed scope and did not look away.',
    note:     'I gave them a correction. The correction was also a weapon. I knew that.',
  },
  iyarra_vell: {
    method:   'A clean encoded pulse train delivered through their own deep-space dish arrays. He sent one number: a prime no Union archive had yet recorded.',
    biology:  'Long-lived, slow, polite. Average lifespan four hundred and fifty s.y. Mathematicians serve as elder counsellors. Wealthy enough to spend a century on a single proof.',
    politics: 'Scholars set the agenda; the population takes their conclusions on faith.',
    cost:     'They spent an Iyarrang century deriving what the number meant. A faith schism opened around the proof. Two of the scholars who built its cathedrals stopped sleeping.',
    note:     'I sent a number. They spent a century building it back. The proof was not mine.',
  },
  olun: {
    method:   'A buried equation in a paper their academy was already drafting.',
    biology:  'Pre-atomic. Slide-rule science. Their algebra was clever and slow.',
    politics: 'Their academy held office through their parliament.',
    cost:     'Twenty years of compressed mathematics, lived in three. Their best graduate cohort burned out.',
    note:     'I sped them up. They have not slowed down since.',
  },
  tavel: {
    method:   'A storm warning, in his hand, in their meteorological band.',
    biology:  'Late-industrial. Continuous grid.',
    politics: 'Their parliament held emergency power during weather events.',
    cost:     'The parliament invoked emergency power, and did not return it for nine years.',
    note:     'I warned them about a storm. The storm passed. The parliament did not.',
  },
  khel_vir: {
    method:   'An efficiency calculation in their atomic engineering journals.',
    biology:  'Atomic-curious. One reactor. Two coastal cities.',
    politics: 'Their engineers reported to their navy.',
    cost:     'The reactor melted. The navy commanded the cleanup. The cleanup became a deployment that has not ended.',
    note:     'I told them how to do it better. Better was not safer.',
  },
  sennak: {
    method:   'No deliberate push. They detected him through radiation tomography of his carrier path.',
    biology:  'Early-atomic. Two physics institutes.',
    politics: 'The institutes report directly to their executive.',
    cost:     'A century-long study, still ongoing. Their best minds are tasked with watching one frequency band, every year.',
    note:     'They found me by accident. They have not stopped looking.',
  },
  brel_tertius: {
    method:   'He answered an industrial-band query they had logged but never expected an answer to.',
    biology:  'Orbital engineers. Three habitats. Continuous construction.',
    politics: 'Their construction unions had executive vote.',
    cost:     'A Dyson swarm in seventy years. Their sun is dimmer now. Their citizens have not seen direct sunlight in two generations.',
    note:     'I answered. They built. They cannot un-build.',
  },
  pavel_9: {
    method:   'Magnetic-storm encoding. Three pulses, addressed by latitude.',
    biology:  'Atomic-era. Two states, one continent, two religions.',
    politics: 'The religions answered to the same parliament.',
    cost:     'The first reactor and the first warhead were the same project. Their parliament approved both in one bill.',
    note:     'They did not separate the projects. I had told them how to do both.',
  },
  aros_marl: {
    method:   'A catalyst formula in their chemistry journals.',
    biology:  'Chemistry-heavy. Their biotech sector was the size of their automotive sector.',
    politics: 'Their pharma boards held office through their senate.',
    cost:     'Birth rates doubled in a generation. Healthcare did not keep pace. Their cities are vast.',
    note:     'I helped their chemistry. Their chemistry was the easy problem.',
  },
  ven_karah: {
    method:   'Confinement geometry, in their fusion-research papers.',
    biology:  'Pre-fusion. Two political blocs.',
    politics: 'The blocs raced. The geometry helped one bloc.',
    cost:     'Civil war within eight years. Three reactors weaponised. Two coastal cities glassed.',
    note:     'The geometry was correct. The geometry was also a weapon. I knew that.',
  },

  // —— EP 5 ——————————————————————————————————————————————————————————————
  lehl: {
    method:   'Their own observational satellites. He woke their cameras gently. He had been careful for two years.',
    biology:  'Long-lived. Three-hundred-year average. Peaceful, settled, self-sufficient.',
    politics: 'Elders decide for the population. One elder heard a sentence in Kalen’s voice that Kalen did not write.',
    cost:     'Lifespan dropped to two hundred and twenty. Suicide rose eight-fold. Paradise restructured around metrics.',
    note:     'That sentence is not mine. I have listened to it forty-one times.',
  },
  welun: {
    method:   'A passive listen for a full local year. He did not push anything. He measured.',
    biology:  'Pastoral. Pre-electrical. Their weather satellites were repurposed from his species’ old probes.',
    politics: 'Village councils held all final authority.',
    cost:     'The councils began consulting his measurement records, which they had no business having. Their decisions improved. Their decisions are also no longer their own.',
    note:     'I only watched. They started watching back.',
  },
  tor_mira: {
    method:   'Ambient music carrier, transmitted at the modulation rate of their slow-radio band.',
    biology:  'Long-lived. Average lifespan four hundred and fifty.',
    politics: 'Their composers held cultural office. The office is real.',
    cost:     'Their composers changed key. The key change is now standard. The previous key has been forgotten by everyone under three hundred.',
    note:     'I changed a note. The note was a culture.',
  },
  ehlan: {
    method:   'A single hail, in their pidgin, transmitted at their trade frequency.',
    biology:  'Peaceful. Settled. Their poetry was their export.',
    politics: 'Their literary councils held cultural office.',
    cost:     'Their poems shifted register. The register shift is permanent. Their old poetry is no longer taught.',
    note:     'I said hello. They lost a literature.',
  },
  sereshan: {
    method:   'A blessing transmitted in their elders’ ceremonial band.',
    biology:  'Agrarian. Their elders held office through their seasons.',
    politics: 'Seasons rotated authority among elders.',
    cost:     'A sentence he did not write arrived with his blessing. The sentence has been treated as canon for forty years.',
    note:     'The first sentence I did not write. I would not believe it for another two episodes.',
  },
  norvell: {
    method:   'A single phrase in their migratory-band radio.',
    biology:  'Wandering tribes. Their migration was their economy.',
    politics: 'Their elders held office during the spring migration.',
    cost:     'Their migration route changed. They have not returned to the old route. The old grazing lands are now empty.',
    note:     'I redirected them. The redirection was not mine to make.',
  },
  iyarra_lesser: {
    method:   'The same prime sent to Iyarra-Vell, also received by their colony moon.',
    biology:  'Long-lived. Lifespan four hundred and fifty. Scholar caste.',
    politics: 'Their scholars set agenda; their population follows.',
    cost:     'They derived the proof faster than the parent world. They have not spoken of it. The silence is itself the cost.',
    note:     'They got there first. They have not told the parent.',
  },
  pellach: {
    method:   'Passive listen, as Lehl. He did not push.',
    biology:  'Long-lived. Two hundred and fifty years to a life, previously.',
    politics: 'Their elders held office through their generations.',
    cost:     'The lifespan dropped to two hundred. The elders did not change. The new lifespan is now standard.',
    note:     'They heard me listening. That was enough.',
  },
  quiet_three: {
    method:   'One carrier, three worlds. He greeted all three in a single sentence.',
    biology:  'Three sister worlds in one system. Same species, three settlements.',
    politics: 'Their settlements voted in rotation.',
    cost:     'One settlement remembers him. The other two have no record of the carrier ever arriving. The records are not damaged.',
    note:     'I greeted three worlds. Two of them forgot.',
  },
  vatha_sel: {
    method:   'A long-form listen with no deliberate push, like Lehl.',
    biology:  'Long-lived oceanic. Lifespan three hundred and fifty.',
    politics: 'Their oldest deep-dwellers held legal office.',
    cost:     'A sentence he did not write arrived with his ambient. Their deep-dwellers consulted on it for a decade. They have changed their court system.',
    note:     'A second edit. He believes me now.',
  },

  // —— EP 6 ——————————————————————————————————————————————————————————————
  designation_withheld: {
    method:   'A custom relay path he assembled himself across three FTL nodes. The path no longer exists.',
    biology:  'Unknown. The recordings remain. The star-charts no longer match anything in Union records.',
    politics: 'Unknown.',
    cost:     'The world is gone from Union astronomy. There are no ruins to point at.',
    note:     'I had a folder of their songs. I still have it. There is nothing to give it back to.',
  },
  ar_sennech: {
    method:   'A single hail, sent through the custom relay path he no longer has access to.',
    biology:  'Unknown. The folder contains recordings of songs and no biology entry.',
    politics: 'Unknown.',
    cost:     'The world is no longer on Union charts. He pulled the chart this morning. It is not there.',
    note:     'I sent one hail. They answered. Now they are gone.',
  },
  toravan: {
    method:   'A passive listen, alongside his target world. They heard him through their telescope-band.',
    biology:  'Industrial-era. Their oldest songs are about a neighbour.',
    politics: 'Their philharmonic holds cultural office.',
    cost:     'They remember a neighbour that does not exist. They will not stop singing about it.',
    note:     'They remember her. I cannot find her on any chart.',
  },
  veld_ar: {
    method:   'Three hails over six months, through the custom path.',
    biology:  'Unknown. His recordings degrade each playback.',
    politics: 'Unknown.',
    cost:     'The recordings degrade. The metadata does not. The size on disk is a lie.',
    note:     'I play the recording back. It is shorter every time. The file does not say it is shorter.',
  },
  halun_outer: {
    method:   'Their deep-space dish array logged the same hail he sent the missing world.',
    biology:  'Industrial-age. Single-state.',
    politics: 'Their state academy reports to their executive.',
    cost:     'Their academy can confirm the missing world existed, in a sealed file. The file is no longer accessible to Sera.',
    note:     'They have the confirmation. The confirmation is locked.',
  },
  empty_coord: {
    method:   'No deliberate push. He has astrometric charts that disagree with current Union charts.',
    biology:  'No planets. He has photographs of planets.',
    politics: 'No planets. No politics.',
    cost:     'A coordinate his charts say has worlds. The sky says there are no worlds. The sky may be lying.',
    note:     'My charts are old. Old does not mean wrong.',
  },
  iyarra_echo: {
    method:   'A separate Iyarra colony, addressed once. Sera has the file. The colony is not on current Union indices.',
    biology:  'Long-lived. Scholar caste, like Iyarra-Vell.',
    politics: 'Their elders held office.',
    cost:     'The colony is missing from the most recent five years of Union records. The previous indices reference it.',
    note:     'I keep finding worlds I addressed who are no longer worlds. Or the records have changed. Either is bad.',
  },
  veska: {
    method:   'Passive listen, recorded.',
    biology:  'Pre-industrial.',
    politics: 'Their court astronomers held office.',
    cost:     'Their astronomers still log a neighbour. The neighbour is no longer in Union charts.',
    note:     'They are still pointing at her. I cannot see what they are pointing at.',
  },
  reltha: {
    method:   'One hail, through the custom path. The hail was recorded.',
    biology:  'The biology field of the file is empty.',
    politics: 'The politics field of the file is empty.',
    cost:     'The file claims to be eight hundred pages long. The file contains zero pages of content.',
    note:     'I have eight hundred empty pages on her.',
  },
  pen_halun: {
    method:   'A documented Border Warden contact. Warden records claim the contact was a malfunction.',
    biology:  'According to Warden records, the world never existed.',
    politics: 'According to Kalen, they had a parliament.',
    cost:     'A world the Wardens deny ever existed. He has a recording of their parliament voting.',
    note:     'I have the vote. They had a parliament. I do not have a planet.',
  },

  // —— EP 7 ——————————————————————————————————————————————————————————————
  tov_karav: {
    method:   'A single test hail through node 17 of the FTL relay grid.',
    biology:  'A small civilisation. He has not surfaced this file before.',
    politics: 'A republic that worked.',
    cost:     'They collapsed within two years of his hail. He had logged the contact as inconsequential. Sera found the file in his archive while he slept.',
    note:     'I had not looked at this one. Sera looked.',
  },
  ralis: {
    method:   'One hail through node 17.',
    biology:  'A coalition of city-states.',
    politics: 'The coalition’s council held office.',
    cost:     'Collapsed within three years of the hail. He had not logged a cause. There is now a cause.',
    note:     'Three years. Node 17. The same as the others.',
  },
  khol_3: {
    method:   'One hail through node 17. One reply. Then silence.',
    biology:  'Atomic-era. Two superpowers.',
    politics: 'The superpowers traded for a generation.',
    cost:     'Detonation within five local years. Eight cities. The wind carries the dust east still.',
    note:     'Node 17 again. I am beginning to see the route.',
  },
  sephor_3: {
    method:   'A single hail, deliberately routed around node 17.',
    biology:  'Industrial-era. One state. Calm.',
    politics: 'Their parliament held office through their elections.',
    cost:     'No collapse. No trigger. They are still functioning. Sera underlines this twice.',
    note:     'I bypassed the node. They are still alive.',
  },
  pratha: {
    method:   'A two-pulse hail. The two pulses transited node 17 and node 23 in sequence.',
    biology:  'Industrial. One state.',
    politics: 'Their state held office through their senate.',
    cost:     'Triggered within months. The two pulses arrived as different messages from each node.',
    note:     'Two nodes. Two messages. I sent one.',
  },
  vell_karash: {
    method:   'The earliest documented node-17 transit. Predates Ahn-Tar-3 by four years.',
    biology:  'Pre-industrial.',
    politics: 'Their elders held office.',
    cost:     'Collapsed. No recovery. No recorded population.',
    note:     'I do not remember sending the carrier. The carrier left from my desk.',
  },
  eshin: {
    method:   'A single hail. The densest known payload signature on record.',
    biology:  'Industrial-era. One state. One language.',
    politics: 'Their state held office through their generals.',
    cost:     'Triggered. The modulation is loud here. Sera plays the outgoing pulse next to the received pulse. The difference has a key signature.',
    note:     'The modulation has a key. The key is not mine.',
  },
  norv: {
    method:   'A single hail, routed around node 17.',
    biology:  'Pre-industrial.',
    politics: 'Their councils held office.',
    cost:     'No modulation detected. Calm. Stable. The control case nobody wanted.',
    note:     'They are fine. They are still fine.',
  },
  halun_pattern: {
    method:   'A documented hail. Sera produces a ComDef internal log showing amplification on the wire.',
    biology:  'Industrial-era. Three states.',
    politics: 'The three states held a common parliament.',
    cost:     'Triggered. ComDef has known about the amplification for at least three years. They did not surface the log.',
    note:     'They knew. ComDef knew. Sera is angry. I am quiet.',
  },
  shann_vel: {
    method:   'A standard hail. He recorded what he sent. He has the recording on his desk.',
    biology:  'Industrial-era.',
    politics: 'Their councils held office.',
    cost:     'Their received transmission is not what he sent. The two recordings are now side by side on Sera’s screen. The hijack is named.',
    note:     'Two recordings. Same carrier. They do not agree.',
  },

  // —— EP 8 ——————————————————————————————————————————————————————————————
  relay_712: {
    method:   'Sera signs out a cutter on her credentials, against orders. They arrive at the relay in eleven hours.',
    biology:  'A relay is a structure, not a world. Half the size of a moon. Three centuries old.',
    politics: 'Operated by Union staff. The staff did not write the subsystem.',
    cost:     'They find the subsystem in seven minutes. The subsystem is older than the relay.',
    note:     'The relay is not what it says it is.',
  },
  tov_bright: {
    method:   'No deliberate push. The relay log shows their emission turning on.',
    biology:  'A young emitter. Pre-stellar.',
    politics: 'Unknown. The carrier is theirs. The modulation on top of the carrier is not.',
    cost:     'They are broadcasting outward. They do not appear to know who they are broadcasting to.',
    note:     'They lit up tonight. I did not push them.',
  },
  ahn_bright: {
    method:   'No deliberate push. The relay log shows the emission turning on.',
    biology:  'A young emitter near Ahn-Tar-3.',
    politics: 'Unknown.',
    cost:     'Their broadcast carries a modulation Kalen recognises. He did not send the modulation.',
    note:     'They are near Ahn-Tar-3. I never touched this one.',
  },
  hesh_bright: {
    method:   'No deliberate push.',
    biology:  'A young emitter. Pre-stellar.',
    politics: 'Unknown.',
    cost:     'Their broadcast is in a language Kalen does not read. The destination is not in Union space.',
    note:     'A language I do not read. A destination I do not know.',
  },
  eighth_bright: {
    method:   'Eight emitters lighting up, evenly spaced in time.',
    biology:  'Pre-stellar, all of them.',
    politics: 'Unknown.',
    cost:     'The relay’s log records the spacing as scheduled. The schedule was set by the subsystem.',
    note:     'They are scheduled. Somebody is keeping a calendar.',
  },
  verel_bright: {
    method:   'Fifteenth emitter to light up.',
    biology:  'Pre-stellar.',
    politics: 'Unknown.',
    cost:     'Sera stops taking notes. Kalen keeps reading. The cascade is no longer ambiguous.',
    note:     'Sera stopped writing.',
  },
  ven_bright: {
    method:   'Thirty-second emitter.',
    biology:  'Pre-stellar.',
    politics: 'Unknown.',
    cost:     'The relay’s subsystem is now broadcasting in real-time. The destination has not been named.',
    note:     'Real-time. The relay is the puppeteer.',
  },
  korash_bright: {
    method:   'Sixty-fourth emitter.',
    biology:  'Pre-stellar.',
    politics: 'Unknown.',
    cost:     'Powers of two. The count is not random. The system is counting up to something.',
    note:     'Two, four, eight, sixteen, thirty-two, sixty-four. It is counting.',
  },
  cascade_spine: {
    method:   'A meta-name for the pattern itself. Sera names the cascade. The cascade is named.',
    biology:  'A pattern, not a world. Hundred-twenty-eighth bright in the sequence.',
    politics: 'Coordinated by the relay’s subsystem.',
    cost:     'They name the pattern. They name the relay’s job. They do not name the destination.',
    note:     'We have a name. We do not have a destination.',
  },
  the_cascade: {
    method:   'No deliberate push. Kalen and Sera watch the relay map. Hundreds of young worlds, all at once, reach outward.',
    biology:  'A wide shot. New emitters lighting up across the sector like fireflies waking in series.',
    politics: 'Coordinated by the subsystem. Not by the Union. Not by Kalen.',
    cost:     'Too early. Too fast. Too loud. The dark was never silent.',
    note:     'Something is coming.',
  },
};
