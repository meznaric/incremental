// Per-episode interstitial steps. One block per cycle (run) of S1, swapped in
// at bind-time by interstitial.js. Each EP defines:
//   * a `cycle_open` beat (skipped for EP1 — fresh players get `welcome`)
//   * one beat per milestone in MILESTONE_THRESHOLDS (1k → 1t)
//
// Voices follow docs/lore/voice-and-tone.md. K = Kalen (first person), S = Sera
// (second person), N = Narrator (rare), A = Anonymous (italic, ~once per
// season). The voice for each beat is named in the comment above the steps.
//
// Step shape — same as the static INTERSTITIALS table in interstitial.js:
//   { text, italic? }
// Non-final steps auto-advance after typewriter + a text-length-derived dwell
// (see DWELL_* in interstitialUi.js). Final step always waits for user input.
// Legacy `autoMs` fields are kept for historical reference but ignored.

export const EP_INTERSTITIALS = {
  // ──────────────────────────────────────────────────────────────────────
  // EP 1 — Discovery
  // ──────────────────────────────────────────────────────────────────────
  1: {
    // EP1 arc position: Kalen lucky, curious, half-believing the Law is wrong.
    // Most beats sit in his contemporary voice — careful, hopeful, slightly
    // proud — rather than retrospective. The buildup-name (Ahn-Tar-3) gets a
    // 3-filler chain that walks the player from "there is a world I have not
    // pushed" to "the sect has formed" to the climactic milestone.

    // K. EP1 buildup #1 — the desert is in the folder, Kalen has not pushed.
    // Bg uses the climax world's portrait so the buildup is visually threaded.
    filler_after_3: { bgImage: './docs/lore/images/desert-ahn-tar.png', steps: [
      { voice: 'K', text: 'There is a world in my folder I have not opened.' },
      { voice: 'K', text: 'A desert. Theocratic. Oil-lit. They have a caste called the sky-listeners.' },
      { voice: 'K', text: 'I keep almost reaching for it. The early ones went so well.' },
    ] },
    // K. EP1 buildup #2 — he commits, carefully.
    filler_after_6: { bgImage: './docs/lore/images/desert-ahn-tar.png', steps: [
      { voice: 'K', text: 'I have opened the desert folder.' },
      { voice: 'K', text: 'The sky-listener I would speak to is sixteen.' },
      { voice: 'K', text: 'I am going to do this carefully. Every step. One syllable, one name.' },
    ] },
    // K. EP1 buildup #3 — the carrier is out, the sect is forming, he is being careful.
    filler_after_9: { bgImage: './docs/lore/images/desert-ahn-tar.png', steps: [
      { voice: 'K', text: 'The desert received the carrier. The boy heard me.' },
      { voice: 'K', text: 'A small sect has formed around what he says I said.' },
      { voice: 'K', text: 'I am being careful. I keep being careful.' },
    ] },

    // K. Ish-Karal — nobody on the planet had a transmitter that mattered.
    milestone_1k: { steps: [
      { voice: 'K', text: 'Two of them heard me anyway.', autoMs: 1400 },
      { voice: 'K', text: 'I had pushed nothing. They heard me anyway.', autoMs: 2000 },
    ] },
    // S. Belnesh — one note, one shrine.
    milestone_10k: { steps: [
      { voice: 'S', text: 'One tone.', autoMs: 1200 },
      { voice: 'S', text: 'They built rooms for the tone to live in.', autoMs: 2000 },
    ] },
    // S. Korv-Shen — the stone-listeners. Kept from EP1 original.
    milestone_100k: { steps: [
      { voice: 'S', text: 'You sang into the rock.', autoMs: 1400 },
      { voice: 'S', text: 'They thought a stranger lived inside the cavern wall.', autoMs: 2200 },
    ] },
    // K. Daoun's Reach — pilots logged him as weather.
    milestone_1m: { steps: [
      { voice: 'K', text: 'Their pilots logged me as weather.', autoMs: 1400 },
      { voice: 'K', text: 'They named the year after me. They have not stopped using the name.', autoMs: 2200 },
    ] },
    // K. Hsareth — Ahn-Tar-3's nearer neighbour, sky-listeners writing letters.
    // Old beat had retrospective regret ("I made the same mistake there");
    // that's late-arc Kalen. EP1 Kalen is curious and half-encouraged.
    milestone_10m: { steps: [
      { voice: 'K', text: 'Ahn-Tar-3’s nearer neighbour.' },
      { voice: 'K', text: 'Their sky-listeners write letters across the gulf. They have done it for a century.' },
      { voice: 'K', text: 'The letters are gentle. I want to do more of this.' },
    ] },
    // S. Mirum-3 — treaty cited his voice as a witness.
    milestone_100m: { steps: [
      { voice: 'S', text: 'Three city-states heard the same sentence.', autoMs: 1400 },
      { voice: 'S', text: 'They built a treaty around it. The treaty cites a witness.', autoMs: 2200 },
    ] },
    // K. Halun-Veth — PROSPERED. He answered carefully and then stopped.
    milestone_1b: { steps: [
      { voice: 'K', text: 'Forty years they had been listening for life.' },
      { voice: 'K', text: 'I said one sentence. Then I stopped.' },
      { voice: 'K', text: 'They are still arguing about it. The argument is gentle. One of mine landed well.' },
    ] },
    // K. Voun — the word "salt" he did not say.
    milestone_10b: { steps: [
      { voice: 'K', text: 'I did not say salt.', autoMs: 1200 },
      { voice: 'K', text: 'They heard salt. I do not know whose word it was.', autoMs: 2200 },
    ] },
    // S. Sephir-2 — harvest chant became civic obligation.
    milestone_100b: { steps: [
      { voice: 'S', text: 'You rode in on a harvest chant.', autoMs: 1400 },
      { voice: 'S', text: 'It is now a way to fail school.', autoMs: 2000 },
    ] },
    // S→K. Ahn-Tar-3 climax. The buildup chain pays off here. Sera frames the
    // act in procedural terms; Kalen's last line is the season's first audible
    // crack in his "I was being careful" defence.
    milestone_1t: { steps: [
      { voice: 'S', text: 'The desert.' },
      { voice: 'S', text: 'You used a sixteen-year-old as your first relay.' },
      { voice: 'S', text: 'Six thousand. In three years.' },
      { voice: 'K', text: 'I was being careful.' },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 2 — The Sea Choir
  // ──────────────────────────────────────────────────────────────────────
  2: {
    // K. Cycle open — confident method-builder. Ahn-Tar-3 is done; he is
    // already telling himself the next one will be cleaner. The "method"
    // language is the arc cue — EP2 Kalen has stopped seeing each contact
    // as one decision and started seeing them as procedure.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'Ahn-Tar-3 closed. The casualty count is final. I will not forget the count.' },
      { voice: 'K', text: 'But I learned from it. I know what I did wrong. I have a method now.' },
      { voice: 'K', text: 'The next folder is a water world. Solunn. They sing. I am going to be careful.' },
    ] },
    // S. Recap after 3 EP2 names. The folder is filling up.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep2-sea-choir.png', steps: [
      { voice: 'S', text: 'Three names on Solunn.' },
      { voice: 'S', text: 'The structures have already started moving.' },
    ] },
    // K. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep2-sea-choir.png', steps: [
      { voice: 'K', text: 'I keep telling myself I was being careful.' },
      { voice: 'K', text: 'The casualty count disagrees.' },
    ] },
    // S. Last-call recap before the climax.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep2-sea-choir.png', steps: [
      { voice: 'S', text: 'One name left in the folder.' },
      { voice: 'S', text: 'It is the one we have been afraid of.' },
    ] },
    // K. Mora-Brae — keep from original.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I was being careful.', autoMs: 1400 },
      { voice: 'K', text: 'They still got the grammar.', autoMs: 2000 },
    ] },
    // S. Telnir — choir dropped half a step.
    milestone_10k: { steps: [
      { voice: 'S', text: 'Their choir is half a step lower than it was.', autoMs: 1400 },
      { voice: 'S', text: 'No one alive remembers the old key.', autoMs: 2200 },
    ] },
    // S. Achos — they made a month for his carrier.
    milestone_100k: { steps: [
      { voice: 'S', text: 'They added a month to their calendar.', autoMs: 1400 },
      { voice: 'S', text: 'The month is named after your carrier frequency.', autoMs: 2200 },
    ] },
    // K. Ven-Thar — false prophet rose in his voice.
    milestone_1m: { steps: [
      { voice: 'K', text: 'A false prophet rose in my voice.', autoMs: 1400 },
      { voice: 'K', text: 'He wrote nothing down. They believed him anyway.', autoMs: 2200 },
    ] },
    // S. Drath — test pulse became scripture.
    milestone_10m: { steps: [
      { voice: 'S', text: 'A test pulse you sent to yourself.', autoMs: 1400 },
      { voice: 'S', text: 'They built a faith on it. They have not lapsed.', autoMs: 2200 },
    ] },
    // K. Quel-Sin — PROSPERED. He matched their scale and went home.
    milestone_100m: { steps: [
      { voice: 'K', text: 'I sang one verse back. Politely.' },
      { voice: 'K', text: 'They are still singing to me. Forty years now.' },
      { voice: 'K', text: 'I do not deserve this. They do.' },
    ] },
    // K. Eolun — Solunn's moon. He tipped a schism.
    milestone_1b: { steps: [
      { voice: 'K', text: 'Solunn’s moon.', autoMs: 1200 },
      { voice: 'K', text: 'The schism was already at boil. I tipped it.', autoMs: 2200 },
    ] },
    // S. Brel-Halon — they obeyed him.
    milestone_10b: { steps: [
      { voice: 'S', text: 'You told a fishing fleet to be silent for a year.', autoMs: 1400 },
      { voice: 'S', text: 'They obeyed. That is the part you cannot live with.', autoMs: 2200 },
    ] },
    // K. Iharran — shipping advice that killed captains.
    milestone_100b: { steps: [
      { voice: 'K', text: 'I gave their captains shipping advice.', autoMs: 1400 },
      { voice: 'K', text: 'The captains are dead. The advice was good.', autoMs: 2200 },
    ] },
    // K. Solunn climax. Original EP2 opener.
    milestone_1t: { steps: [
      { voice: 'K', text: 'They thought it was the ocean.', autoMs: 1400 },
      { voice: 'K', text: 'I let them.', autoMs: 2000 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 3 — Sky Language
  // ──────────────────────────────────────────────────────────────────────
  3: {
    // K. Cycle open — performing voice. EP3 Kalen has stopped describing
    // contact as risk and started describing it as craft. The "practising
    // their grammar" line is the arc cue — he is teaching now, not whispering.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The Solunni restructured. Sera calls that a softer word than collapse.' },
      { voice: 'K', text: 'I told her I have something cleaner already drafted. A world named Vehrn-9. Aurora-bright.' },
      { voice: 'K', text: 'I have been practising their grammar all month. I want this one to land well.' },
    ] },
    // S. Recap after 3 EP3 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep3-sky-language.png', steps: [
      { voice: 'S', text: 'The aurora is full of your writing.' },
      { voice: 'S', text: 'Other governments are writing back.' },
    ] },
    // K. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep3-sky-language.png', steps: [
      { voice: 'K', text: 'I gave them a way to talk in the sky.' },
      { voice: 'K', text: 'They are using it to lie.' },
    ] },
    // S. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep3-sky-language.png', steps: [
      { voice: 'S', text: 'Vehrn-9 is one hail away.' },
      { voice: 'S', text: 'The aurora war is one folder after that.' },
    ] },
    // S. Tachet — telegraph codebook absorbed his cadence.
    milestone_1k: { steps: [
      { voice: 'S', text: 'Your cadence entered their codebook.', autoMs: 1400 },
      { voice: 'S', text: 'It means continue. They use it daily.', autoMs: 2200 },
    ] },
    // K. Pelnar Belt — they made him a calibration saint.
    milestone_10k: { steps: [
      { voice: 'K', text: 'Belt miners.', autoMs: 1200 },
      { voice: 'K', text: 'They have a feast day for me. It shuts their refineries.', autoMs: 2200 },
    ] },
    // S. Theran — original EP1 intermediate beat, kept.
    milestone_100k: { steps: [
      { voice: 'S', text: 'You handed them an ancestor.', autoMs: 1400 },
      { voice: 'S', text: 'They lit each other’s trees.', autoMs: 2200 },
    ] },
    // K. Esnal — thirty-seven new gods.
    milestone_1m: { steps: [
      { voice: 'K', text: 'I had not said hello yet.', autoMs: 1400 },
      { voice: 'K', text: 'They introduced me thirty-seven times.', autoMs: 2200 },
    ] },
    // K. Pellan-Toth — PROSPERED. The law they wrote held; the law is gentle.
    milestone_10m: { steps: [
      { voice: 'K', text: 'They wrote my cadence into law.' },
      { voice: 'K', text: 'I had not written a constitution. I would not have written one this gentle.' },
      { voice: 'K', text: 'Three of mine have landed well. I want to remember the three.' },
    ] },
    // S. Norr-Halen — their missile system read the aurora as a launch.
    milestone_100m: { steps: [
      { voice: 'S', text: 'Their missile system read your glyphs as a launch.', autoMs: 1400 },
      { voice: 'S', text: 'One city did not stand down on the third order.', autoMs: 2400 },
    ] },
    // K. Korov Drift — habitat sky as canvas.
    milestone_1b: { steps: [
      { voice: 'K', text: 'Their sky was a curved ceiling.', autoMs: 1400 },
      { voice: 'K', text: 'I wrote on it. They signed it.', autoMs: 2000 },
    ] },
    // S. Eshrane — cave migration.
    milestone_10b: { steps: [
      { voice: 'S', text: 'You sent the wrong sentence.', autoMs: 1400 },
      { voice: 'S', text: 'They went to the caves. Two-thirds did not return.', autoMs: 2400 },
    ] },
    // K. Vail-South — the disagreement was the war.
    milestone_100b: { steps: [
      { voice: 'K', text: 'They could not agree what I said.', autoMs: 1400 },
      { voice: 'K', text: 'They were not wrong to disagree.', autoMs: 2000 },
    ] },
    // S. Vehrn-9 climax. Original EP3 opener.
    milestone_1t: { steps: [
      { voice: 'S', text: 'Someone is amplifying you.', autoMs: 1400 },
      { voice: 'S', text: 'I have not decided yet whether to tell you.', autoMs: 2400 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 4 — Fire Given
  // ──────────────────────────────────────────────────────────────────────
  4: {
    // K. Cycle open — transition from EP3 to EP4.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The aurora war is on Union news cycles now.' },
      { voice: 'K', text: 'I asked Sera if she had ever pushed a signal herself.' },
      { voice: 'K', text: 'She did not answer. She handed me Tarsus Minor.' },
    ] },
    // S. Recap after 3 EP4 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep4-fire-given.png', steps: [
      { voice: 'S', text: 'Tarsan institutes are now built around finding you.' },
      { voice: 'S', text: 'They will. Eventually.' },
    ] },
    // K. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep4-fire-given.png', steps: [
      { voice: 'K', text: 'Better was not safer.' },
      { voice: 'K', text: 'It is going to keep not being safer.' },
    ] },
    // S. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep4-fire-given.png', steps: [
      { voice: 'S', text: 'Eight seconds.' },
      { voice: 'S', text: 'We are walking toward it on purpose.' },
    ] },
    // K. Olun — twenty years of algebra in three.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I sped them up.', autoMs: 1200 },
      { voice: 'K', text: 'They have not slowed down since.', autoMs: 2000 },
    ] },
    // S. Tavel — emergency power held for nine years.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You warned them about a storm.', autoMs: 1400 },
      { voice: 'S', text: 'The storm passed. The emergency parliament did not.', autoMs: 2400 },
    ] },
    // K. Khel-Vir — better was not safer.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I told them how to do it better.', autoMs: 1400 },
      { voice: 'K', text: 'Better was not safer.', autoMs: 2000 },
    ] },
    // S. Sennak — their physicists found him by accident.
    milestone_1m: { steps: [
      { voice: 'S', text: 'Their physics institutes found you by accident.', autoMs: 1400 },
      { voice: 'S', text: 'They have not stopped looking.', autoMs: 2000 },
    ] },
    // K. Iyarra-Vell — kept intermediate beat from original.
    milestone_10m: { steps: [
      { voice: 'K', text: 'I sent one number.', autoMs: 1400 },
      { voice: 'K', text: 'They spent a century building it back.', autoMs: 2200 },
    ] },
    // S. Brel-Halon-Tertius — Dyson swarm in seventy years.
    milestone_100m: { steps: [
      { voice: 'S', text: 'You answered a question they had not asked aloud.', autoMs: 1400 },
      { voice: 'S', text: 'They built a swarm around their sun. Their children have not seen it.', autoMs: 2400 },
    ] },
    // K. Pavel-9 — first reactor was also the first warhead.
    milestone_1b: { steps: [
      { voice: 'K', text: 'They did not separate the projects.', autoMs: 1400 },
      { voice: 'K', text: 'I had told them how to do both.', autoMs: 2000 },
    ] },
    // K. Aros-Marl — chemistry was the easy problem.
    milestone_10b: { steps: [
      { voice: 'K', text: 'Their birth rate doubled.', autoMs: 1400 },
      { voice: 'K', text: 'The chemistry was the easy problem.', autoMs: 2000 },
    ] },
    // S. Ven-Karah — confinement geometry weaponised.
    milestone_100b: { steps: [
      { voice: 'S', text: 'The geometry was correct.', autoMs: 1200 },
      { voice: 'S', text: 'The geometry was also a weapon. You knew that.', autoMs: 2400 },
    ] },
    // K. Tarsus Minor climax. Kept from original.
    milestone_1t: { steps: [
      { voice: 'K', text: 'Eight seconds.', autoMs: 1200 },
      { voice: 'K', text: 'I watched.', autoMs: 2200 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 5 — Perfect Garden
  // ──────────────────────────────────────────────────────────────────────
  5: {
    // K. Cycle open — transition from EP4 to EP5.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'I am tired.' },
      { voice: 'K', text: 'Sera knows. She put a coffee in front of me before she opened the next folder.' },
      { voice: 'K', text: 'It is Lehl. She says I should sit down for this one.' },
    ] },
    // S. Recap after 3 EP5 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep5-perfect-garden.png', steps: [
      { voice: 'S', text: 'Lehl is recording you.' },
      { voice: 'S', text: 'They were not recording before.' },
    ] },
    // K. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep5-perfect-garden.png', steps: [
      { voice: 'K', text: 'I have been careful for two years.' },
      { voice: 'K', text: 'It is the carefulness they will remember.' },
    ] },
    // S. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep5-perfect-garden.png', steps: [
      { voice: 'S', text: 'If their recording does not match what you sent,' },
      { voice: 'S', text: 'we have a different kind of problem.' },
    ] },
    // K. Welun — they started watching back.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I only watched.', autoMs: 1400 },
      { voice: 'K', text: 'They started watching back.', autoMs: 2000 },
    ] },
    // S. Tor-Mira — the note he changed was a culture.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You changed a note.', autoMs: 1200 },
      { voice: 'S', text: 'The note was a culture.', autoMs: 2000 },
    ] },
    // K. Ehlan — hello cost them a literature.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I said hello.', autoMs: 1200 },
      { voice: 'K', text: 'They lost a literature.', autoMs: 2000 },
    ] },
    // K. Sereshan — the first sentence he did not write.
    milestone_1m: { steps: [
      { voice: 'K', text: 'The first sentence I did not write.', autoMs: 1400 },
      { voice: 'K', text: 'I would not believe it for another two years.', autoMs: 2400 },
    ] },
    // S. Norvell — migration changed by one phrase.
    milestone_10m: { steps: [
      { voice: 'S', text: 'You redirected them.', autoMs: 1400 },
      { voice: 'S', text: 'The redirection was not yours to make.', autoMs: 2200 },
    ] },
    // K. Iyarra-Lesser — the moon got there first.
    milestone_100m: { steps: [
      { voice: 'K', text: 'Iyarra’s moon got there first.', autoMs: 1400 },
      { voice: 'K', text: 'They have not told the parent. The silence is the cost.', autoMs: 2400 },
    ] },
    // K. Pellach — listening was enough to drop the lifespan.
    milestone_1b: { steps: [
      { voice: 'K', text: 'They heard me listening.', autoMs: 1400 },
      { voice: 'K', text: 'That was enough. The lifespan dropped.', autoMs: 2200 },
    ] },
    // S. Quiet Three — two of three forgot.
    milestone_10b: { steps: [
      { voice: 'S', text: 'You greeted three worlds in one sentence.', autoMs: 1400 },
      { voice: 'S', text: 'Two of them forgot. The third remembers everything.', autoMs: 2400 },
    ] },
    // K. Vatha-Sel — the second confirmed edit.
    milestone_100b: { steps: [
      { voice: 'K', text: 'A second confirmed edit.', autoMs: 1400 },
      { voice: 'K', text: 'I believe Sera now.', autoMs: 2000 },
    ] },
    // K. Lehl climax. Kept from original.
    milestone_1t: { steps: [
      { voice: 'K', text: 'That sentence is not mine.', autoMs: 1400 },
      { voice: 'K', text: 'I have listened to it forty-one times.', autoMs: 2200 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 6 — Missing World
  // ──────────────────────────────────────────────────────────────────────
  6: {
    // K. Cycle open — transition from EP5 to EP6.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The Lehl recording. The sentence is still in it.' },
      { voice: 'K', text: 'I asked Sera who could have edited it.' },
      { voice: 'K', text: 'She said: that is what we are about to find out. She handed me a folder with no label.' },
    ] },
    // K. Recap after 3 EP6 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep6-missing-world.png', steps: [
      { voice: 'K', text: 'The folder is heavier than its contents.' },
      { voice: 'K', text: 'Two pages cannot make it heavy.' },
    ] },
    // S. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep6-missing-world.png', steps: [
      { voice: 'S', text: 'ComDef indices used to list four worlds in this sector.' },
      { voice: 'S', text: 'They list three now.' },
    ] },
    // K. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep6-missing-world.png', steps: [
      { voice: 'K', text: 'One more name and the folder seals.' },
      { voice: 'K', text: 'Whoever has been sealing the others is who seals this one.' },
    ] },
    // K. Ar-Sennech — answered, gone.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I sent one hail. They answered.', autoMs: 1400 },
      { voice: 'K', text: 'Now they are gone. From the charts. Not from the folder.', autoMs: 2400 },
    ] },
    // S. Toravan — they remember a neighbour the maps don't.
    milestone_10k: { steps: [
      { voice: 'S', text: 'They remember a neighbour.', autoMs: 1400 },
      { voice: 'S', text: 'The neighbour is not on any chart you have.', autoMs: 2200 },
    ] },
    // K. Veld-Ar — the file shrinks each playback.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I play the recording back.', autoMs: 1400 },
      { voice: 'K', text: 'It is shorter every time. The file does not say it is shorter.', autoMs: 2400 },
    ] },
    // S. Halun-Outer — the academy has confirmation. The file is sealed.
    milestone_1m: { steps: [
      { voice: 'S', text: 'Their academy can confirm the missing world existed.', autoMs: 1400 },
      { voice: 'S', text: 'The file is sealed. I cannot see it from where I am.', autoMs: 2400 },
    ] },
    // K. Empty Coordinate — sky may be lying.
    milestone_10m: { steps: [
      { voice: 'K', text: 'My charts say there are three planets.', autoMs: 1400 },
      { voice: 'K', text: 'The sky says no planets. The sky may be lying.', autoMs: 2200 },
    ] },
    // S. Iyarra-Echo — a colony erased from indices.
    milestone_100m: { steps: [
      { voice: 'S', text: 'A separate Iyarra colony.', autoMs: 1400 },
      { voice: 'S', text: 'The most recent five years of records do not include it. The previous indices do.', autoMs: 2400 },
    ] },
    // K. Veska — they point at a neighbour he cannot see.
    milestone_1b: { steps: [
      { voice: 'K', text: 'They are still pointing at her.', autoMs: 1400 },
      { voice: 'K', text: 'I cannot see what they are pointing at.', autoMs: 2200 },
    ] },
    // K. Reltha — eight hundred empty pages.
    milestone_10b: { steps: [
      { voice: 'K', text: 'Eight hundred pages.', autoMs: 1200 },
      { voice: 'K', text: 'Zero pages of content. The metadata is a lie.', autoMs: 2200 },
    ] },
    // K. Pen-Halun — Wardens deny her; he has the vote.
    milestone_100b: { steps: [
      { voice: 'K', text: 'The Wardens deny she ever existed.', autoMs: 1400 },
      { voice: 'K', text: 'I have a recording of her parliament voting.', autoMs: 2200 },
    ] },
    // A. Designation Withheld climax. Anonymous, italic. Once per season.
    milestone_1t: { steps: [
      { voice: 'A', text: 'The folder is intact.', autoMs: 1400 },
      { voice: 'A', text: 'You have not been alone at that desk for a long time.', italic: true, autoMs: 2600 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 7 — Echoes
  // ──────────────────────────────────────────────────────────────────────
  7: {
    // S. Cycle open — the investigation begins.
    cycle_open: { repeat: true, steps: [
      { voice: 'S', text: 'We have not found the missing world. We will not.' },
      { voice: 'S', text: 'The question is no longer what is missing. The question is what is doing the taking.' },
      { voice: 'S', text: 'I have pulled every contact you have ever made.' },
    ] },
    // S. Recap after 3 EP7 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep7-echoes.png', steps: [
      { voice: 'S', text: 'The triggered worlds share a route.' },
      { voice: 'S', text: 'The bypass route is clean.' },
    ] },
    // S. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep7-echoes.png', steps: [
      { voice: 'S', text: 'The modulation has a key signature.' },
      { voice: 'S', text: 'ComDef has had a recording of it for three years.' },
    ] },
    // S. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep7-echoes.png', steps: [
      { voice: 'S', text: 'We are not investigating any more.' },
      { voice: 'S', text: 'We are cataloguing the puppeteer.' },
    ] },
    // S. Tov-Karav — he hadn't surfaced this one.
    milestone_1k: { steps: [
      { voice: 'S', text: 'I found this one in your archive.', autoMs: 1400 },
      { voice: 'S', text: 'You had not surfaced it. Route: node 17.', autoMs: 2200 },
    ] },
    // S. Ralis — three years to collapse.
    milestone_10k: { steps: [
      { voice: 'S', text: 'Collapsed three years after your only hail.', autoMs: 1400 },
      { voice: 'S', text: 'Route: node 17.', autoMs: 1800 },
    ] },
    // S. Khol-3 — eight cities glassed.
    milestone_100k: { steps: [
      { voice: 'S', text: 'Detonation within five local years.', autoMs: 1400 },
      { voice: 'S', text: 'Eight cities. Route: node 17.', autoMs: 2200 },
    ] },
    // S. Sephor-3 — the control case.
    milestone_1m: { steps: [
      { voice: 'S', text: 'A bypass route. No collapse. No trigger.', autoMs: 1400 },
      { voice: 'S', text: 'I am underlining this twice.', autoMs: 2000 },
    ] },
    // S. Pratha — two pulses, two messages.
    milestone_10m: { steps: [
      { voice: 'S', text: 'Two pulses. Two nodes.', autoMs: 1400 },
      { voice: 'S', text: 'They received two different messages. You sent one.', autoMs: 2400 },
    ] },
    // K. Vell-Karash — earliest node-17 transit.
    milestone_100m: { steps: [
      { voice: 'K', text: 'I do not remember sending the carrier.', autoMs: 1400 },
      { voice: 'K', text: 'The carrier left from my desk.', autoMs: 2000 },
    ] },
    // S. Eshin — key signature on the modulation.
    milestone_1b: { steps: [
      { voice: 'S', text: 'The modulation has a key signature.', autoMs: 1400 },
      { voice: 'S', text: 'Listen.', autoMs: 1800 },
    ] },
    // S. Norv — bypass works.
    milestone_10b: { steps: [
      { voice: 'S', text: 'Bypass route. No modulation.', autoMs: 1400 },
      { voice: 'S', text: 'They are still alive.', autoMs: 1800 },
    ] },
    // S. Halun-Pattern — ComDef knew.
    milestone_100b: { steps: [
      { voice: 'S', text: 'ComDef has known.', autoMs: 1200 },
      { voice: 'S', text: 'They did not surface the log. It is three years old.', autoMs: 2200 },
    ] },
    // K. Shann-Vel — two recordings, same carrier.
    milestone_1t: { steps: [
      { voice: 'K', text: 'Two recordings. Same carrier.', autoMs: 1400 },
      { voice: 'K', text: 'They do not agree. The pattern is the route.', autoMs: 2400 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 8 — Finale
  // ──────────────────────────────────────────────────────────────────────
  8: {
    // K. Cycle open — they take the cutter.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The route is named. The amplifier has a signature.' },
      { voice: 'K', text: 'Sera is signing out a cutter on her credentials. Against orders.' },
      { voice: 'K', text: 'We go to a relay.' },
    ] },
    // K. Recap after 3 EP8 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep8-finale.png', steps: [
      { voice: 'K', text: 'Eight emitters. Evenly spaced.' },
      { voice: 'K', text: 'The spacing is scheduled.' },
    ] },
    // S. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep8-finale.png', steps: [
      { voice: 'S', text: 'The count is in powers of two.' },
      { voice: 'S', text: 'Whatever is counting wants the cascade exact.' },
    ] },
    // K. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep8-finale.png', steps: [
      { voice: 'K', text: 'We are too close to the relay to walk away.' },
      { voice: 'K', text: 'We are not far enough to file.' },
    ] },
    // N. Relay 712 — the structure named.
    milestone_1k: { steps: [
      { voice: 'N', text: 'Half the size of a moon. Three centuries old.', autoMs: 1600 },
      { voice: 'N', text: 'The relay is older than that.', autoMs: 2000 },
    ] },
    // K. Tov-Bright — first young emitter.
    milestone_10k: { steps: [
      { voice: 'K', text: 'They lit up tonight.', autoMs: 1200 },
      { voice: 'K', text: 'I did not push them.', autoMs: 1800 },
    ] },
    // K. Ahn-Bright — near Ahn-Tar-3, not his work.
    milestone_100k: { steps: [
      { voice: 'K', text: 'Near Ahn-Tar-3.', autoMs: 1200 },
      { voice: 'K', text: 'I never touched this one. The modulation is in my hand.', autoMs: 2400 },
    ] },
    // S. Hesh-Bright — language and destination both unknown.
    milestone_1m: { steps: [
      { voice: 'S', text: 'A language Kalen does not read.', autoMs: 1400 },
      { voice: 'S', text: 'A destination not in Union space.', autoMs: 2000 },
    ] },
    // S. Eighth Bright — scheduled.
    milestone_10m: { steps: [
      { voice: 'S', text: 'Eight emitters. Evenly spaced in time.', autoMs: 1600 },
      { voice: 'S', text: 'The relay log records the spacing as scheduled.', autoMs: 2400 },
    ] },
    // S. Verel-Bright — Sera stops writing.
    milestone_100m: { steps: [
      { voice: 'S', text: 'Fifteenth bright.', autoMs: 1200 },
      { voice: 'S', text: 'I have stopped writing notes. Kalen keeps reading.', autoMs: 2200 },
    ] },
    // S. Ven-Bright — real-time broadcast.
    milestone_1b: { steps: [
      { voice: 'S', text: 'Thirty-second.', autoMs: 1200 },
      { voice: 'S', text: 'Real-time. The relay is the puppeteer.', autoMs: 2000 },
    ] },
    // K. Korash-Bright — the count is not random.
    milestone_10b: { steps: [
      { voice: 'K', text: 'Two, four, eight, sixteen, thirty-two, sixty-four.', autoMs: 1800 },
      { voice: 'K', text: 'It is counting.', autoMs: 1800 },
    ] },
    // S. Cascade Spine — the pattern named.
    milestone_100b: { steps: [
      { voice: 'S', text: 'We have a name for the pattern.', autoMs: 1400 },
      { voice: 'S', text: 'We do not have a destination.', autoMs: 2000 },
    ] },
    // N → A. THE CASCADE climax. The season finale beat.
    milestone_1t: { steps: [
      { voice: 'N', text: 'Hundreds of young worlds, all at once, began to reach outward.', autoMs: 2400 },
      { voice: 'N', text: 'Too early. Too fast. Too loud.',                                  autoMs: 1800 },
      { voice: 'N', text: 'Something is coming.',                                            autoMs: 2000 },
      { voice: 'A', text: 'The dark was never silent.', italic: true },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 9 — Listen Back
  // The line goes both ways. Replies start arriving. Some are from worlds
  // Kalen touched; some are from places he never reached; one is from
  // beyond the relay grid.
  // ──────────────────────────────────────────────────────────────────────
  9: {
    // S. Cycle open — the inbox is no longer empty.
    cycle_open: { repeat: true, steps: [
      { voice: 'S', text: 'The cascade is broadcasting. So are we.' },
      { voice: 'S', text: 'Replies have started arriving. Some of them are not from anyone we hailed.' },
      { voice: 'S', text: 'Sit down. The first one is for you.' },
    ] },
    // S. Recap after 3 EP9 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep9-listen-back.png', steps: [
      { voice: 'S', text: 'Three replies.' },
      { voice: 'S', text: 'Two of them are not from anyone we ever hailed.' },
    ] },
    // K. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep9-listen-back.png', steps: [
      { voice: 'K', text: 'They have copies.' },
      { voice: 'K', text: 'They have been keeping them for a long time.' },
    ] },
    // S. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep9-listen-back.png', steps: [
      { voice: 'S', text: 'The next one is the one from outside the grid.' },
      { voice: 'S', text: 'I am putting on coffee.' },
    ] },
    // S. Tov-Karav reply — the route-17 carrier comes back.
    milestone_1k: { steps: [
      { voice: 'S', text: 'They are asking who you are.' },
      { voice: 'S', text: 'They learned to listen by listening to you.' },
    ] },
    // K. The Long Note — 47-year tone in his hand.
    milestone_10k: { steps: [
      { voice: 'K', text: 'Forty-seven years of carrier.' },
      { voice: 'K', text: 'In my modulation. Sent before I was born.' },
    ] },
    // K. Mirror Voice.
    milestone_100k: { steps: [
      { voice: 'K', text: 'It is my voice.' },
      { voice: 'K', text: 'It is not my line.' },
    ] },
    // K. Brel-Halon reply.
    milestone_1m: { steps: [
      { voice: 'K', text: 'The grandchildren of the silent fleet.' },
      { voice: 'K', text: 'They want a name for the monument. I do not give one.' },
    ] },
    // S. Pillar of Atan.
    milestone_10m: { steps: [
      { voice: 'S', text: 'Someone built a tower the size of a moon to imitate you.' },
      { voice: 'S', text: 'I would like to know what for.' },
    ] },
    // S. Korov reply — they're better at it now.
    milestone_100m: { steps: [
      { voice: 'S', text: 'They have published a textbook of corrections to your grammar.' },
      { voice: 'S', text: 'They are right about every one.' },
    ] },
    // K. Ear of Saen.
    milestone_1b: { steps: [
      { voice: 'K', text: 'A station outside the grid has a copy of everything.' },
      { voice: 'K', text: 'They are not asking permission.' },
    ] },
    // S. Iyarra pre-echo — time-stamp problem.
    milestone_10b: { steps: [
      { voice: 'S', text: 'The reply is two hundred years older than the hail.' },
      { voice: 'S', text: 'I will stop proposing it is forged.' },
    ] },
    // K. Velnor Choir — a world that was waiting.
    milestone_100b: { steps: [
      { voice: 'K', text: 'They were waiting for me to be ready.' },
      { voice: 'K', text: 'I never asked to be the one they were waiting for.' },
    ] },
    // N → A. The First Foreign Voice. Climax.
    milestone_1t: { steps: [
      { voice: 'N', text: 'A signal arrives from beyond the relay grid.', autoMs: 2200 },
      { voice: 'N', text: 'It uses his modulation. It calls him by a rank he does not hold.', autoMs: 2600 },
      { voice: 'A', text: 'We are on our way.', italic: true },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 10 — Arrival
  // The replies become physical. Probes, then ships. The relay opens.
  // Sera finds paperwork. The figure at the end speaks in Kalen's voice.
  // ──────────────────────────────────────────────────────────────────────
  10: {
    // K. Cycle open — the wait is over.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'They are not signals any more.' },
      { voice: 'K', text: 'Border Wardens picked one up yesterday. A probe. No crew. No drive trail.' },
      { voice: 'K', text: 'Sera says the next folder is already thicker than the last one.' },
    ] },
    // K. Recap after 3 EP10 names.
    filler_after_3: { bgImage: './docs/lore/images/recap-ep10-arrival.png', steps: [
      { voice: 'K', text: 'They are not signals any more.' },
      { voice: 'K', text: 'They are arrivals.' },
    ] },
    // S. Midway recap.
    filler_after_6: { bgImage: './docs/lore/images/recap-ep10-arrival.png', steps: [
      { voice: 'S', text: 'ComDef has stopped issuing classifications.' },
      { voice: 'S', text: 'They cannot find the right category.' },
    ] },
    // K. Last-call recap.
    filler_after_9: { bgImage: './docs/lore/images/recap-ep10-arrival.png', steps: [
      { voice: 'K', text: 'There is nothing left to file.' },
      { voice: 'K', text: 'Only what is about to walk through.' },
    ] },
    // K. First Probe — the medium changes.
    milestone_1k: { steps: [
      { voice: 'K', text: 'The hull is older than the Union.' },
      { voice: 'K', text: 'It found us by following the noise I made.' },
    ] },
    // S. Veska Approach.
    milestone_10k: { steps: [
      { voice: 'S', text: 'The probe lands on a world the Wardens deny exists.' },
      { voice: 'S', text: 'It knows where to land.' },
    ] },
    // K. Halun visited — they were given a key.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I told them an answer once.' },
      { voice: 'K', text: 'They learned to want the next one.' },
    ] },
    // S. The Quiet Fleet.
    milestone_1m: { steps: [
      { voice: 'S', text: 'Multiple ships. Silent. Coordinated.' },
      { voice: 'S', text: 'On their way to the relay grid.' },
    ] },
    // K. Pavel-9 visited — they dismantle the bomb.
    milestone_10m: { steps: [
      { voice: 'K', text: 'They are taking the dangerous parts back from me.' },
      { voice: 'K', text: 'They will keep them.' },
    ] },
    // K. Lehl visited — they undo the harm.
    milestone_100m: { steps: [
      { voice: 'K', text: 'Lehl is recovering the lifespan I took from it.' },
      { voice: 'K', text: 'I cannot tell whether it is forgiveness or accounting.' },
    ] },
    // A. The Listener revealed — one anonymous sting at the right moment.
    milestone_1b: { steps: [
      { voice: 'A', text: 'You were never alone at that desk.', italic: true },
      { voice: 'A', text: 'You were never alone at that desk.', italic: true },
    ] },
    // K. Foreman's Contract.
    milestone_10b: { steps: [
      { voice: 'K', text: 'A Union contract with my signature.' },
      { voice: 'K', text: 'Dated eleven years before I was born.' },
    ] },
    // S. Relay opens.
    milestone_100b: { steps: [
      { voice: 'S', text: 'The relay has hinges.' },
      { voice: 'S', text: 'Hinges imply intent. We were inside the wrong building.' },
    ] },
    // N → K → A. The Door. The series climax.
    milestone_1t: { steps: [
      { voice: 'N', text: 'Something steps through the aperture.', autoMs: 2200 },
      { voice: 'N', text: 'It walks like a man. It speaks in his voice.', autoMs: 2400 },
      { voice: 'K', text: 'Sera does not lower her sidearm.', autoMs: 2200 },
      { voice: 'A', text: 'I have been doing your work for the parts of it you could not be present for.', italic: true },
    ] },
  },
};
