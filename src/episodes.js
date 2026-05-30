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

    // K. Ish-Karal — he had not keyed the carrier yet. The anomaly's first seam:
    // a voice on his channel that is not (only) him. Flavor states what they
    // heard; the beat adds that he hadn't sent anything.
    milestone_1k: { steps: [
      { voice: 'K', text: 'Two of them answered before I keyed the carrier.', autoMs: 1400 },
      { voice: 'K', text: 'I had pushed nothing. I told myself it was the wind, and believed it.', autoMs: 2000 },
    ] },
    // S. Belnesh — Sera's read: he meant to listen, never corrected the drift,
    // and it has outlived the contact. Flavor has the tone + shrine; this adds
    // his non-intervention and the eleven-year reach.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You meant to listen. Not to land.', autoMs: 1200 },
      { voice: 'S', text: 'You never sent a correction. Eleven years on, the festival still tunes to you.', autoMs: 2000 },
    ] },
    // K. Korv-Shen — he became a destination, not a passing sound. Flavor has
    // the digging; the beat adds the "wanted them closer" he can't account for.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I rang their stone once and moved on. That was all I did.', autoMs: 1400 },
      { voice: 'K', text: 'They did not hear a sound passing through. They heard someone who wanted them nearer.', autoMs: 2200 },
    ] },
    // K. Daoun's Reach — the contact he isn't ashamed of; his early proof that
    // it can be harmless. Flavor has the weather-log + calendar; this adds the
    // self-justification (EP1 arc: he half-believes he is helping).
    milestone_1m: { steps: [
      { voice: 'K', text: 'This is the one I bring up when I want to feel clean about it.', autoMs: 1400 },
      { voice: 'K', text: 'They got a name for a year. Nobody buried anyone over a calendar.', autoMs: 2200 },
    ] },
    // K. Hsareth — the contact that taught him it could be gentle, and that the
    // wanting more is the trap. Flavor has the guilds + century of letters; the
    // beat keeps only the wanting.
    milestone_10m: { steps: [
      { voice: 'K', text: 'This is the one that made me think it could be gentle.' },
      { voice: 'K', text: 'Two guilds, writing to each other across the gulf. Quietly. For nothing.' },
      { voice: 'K', text: 'I wanted more of it. That wanting is where everything after this went wrong.' },
    ] },
    // S. Mirum-3 — the legal permanence. Flavor has the three states + treaty;
    // the beat foregrounds the clause that names him a witness.
    milestone_100m: { steps: [
      { voice: 'S', text: 'There is a treaty down there with a clause about you.', autoMs: 1400 },
      { voice: 'S', text: 'They could not agree what you were. So they wrote you in as a witness, and signed.', autoMs: 2200 },
    ] },
    // K. Halun-Veth — PROSPERED. His pride, and the seed of the Ep 7 reveal:
    // the contacts that landed do not help Sera's case, so they stay out of the
    // record. Flavor has the careful sentence + the gentle argument.
    milestone_1b: { steps: [
      { voice: 'K', text: 'This is one I am allowed to be proud of.' },
      { voice: 'K', text: 'The whole trick was leaving afterward. I almost never manage the leaving.' },
      { voice: 'K', text: 'Sera will not file this one. It does not help her case. It does not help mine either.' },
    ] },
    // K. Voun — a word he did not send. Anomaly thread: something is adding to
    // his signal. Distinct from flavor (which only says they heard "salt").
    milestone_10b: { steps: [
      { voice: 'K', text: 'I did not send that word. I have checked the log a hundred times.', autoMs: 1200 },
      { voice: 'K', text: 'They heard it clearly. In my carrier. I do not know whose word it was.', autoMs: 2200 },
    ] },
    // S. Sephir-2 — the institutional cruelty the flavor only implies. Flavor
    // has the chant→hymn→obligation; the beat lands the cost on children.
    milestone_100b: { steps: [
      { voice: 'S', text: 'That harvest song you borrowed?', autoMs: 1400 },
      { voice: 'S', text: 'It is a state examination now. Children fail their year on your melody.', autoMs: 2000 },
    ] },
    // S→K. Ahn-Tar-3 climax. The buildup chain pays off here. Sera frames the
    // act in procedural terms; Kalen's last line is the season's first audible
    // crack in his "I was being careful" defence.
    milestone_1t: { steps: [
      { voice: 'S', text: 'So. The boy.' },
      { voice: 'S', text: 'You used a sixteen-year-old as your first relay.' },
      { voice: 'S', text: 'Six thousand dead. In three years.' },
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
    // K. Mora-Brae — EP2 arc: he has a method now and is proud of it. Flavor
    // has the poets + winters; the beat adds the method-pride.
    milestone_1k: { steps: [
      { voice: 'K', text: 'By Mora-Brae I had a method. I was proud of the method.', autoMs: 1400 },
      { voice: 'K', text: 'It did not stop their poets making a whole season out of the way I talk.', autoMs: 2000 },
    ] },
    // S. Telnir — the irreversibility. Flavor has the changed chorus; the beat
    // names what was lost: the old key, and everyone who knew it.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You bent one chorus half a step.', autoMs: 1400 },
      { voice: 'S', text: 'The key it was in before — no one alive can find it now. You took that.', autoMs: 2200 },
    ] },
    // S. Achos — the disproportion. Flavor has the lunar reorganisation; the
    // beat adds that they cannot say why and named the time after him.
    milestone_100k: { steps: [
      { voice: 'S', text: 'They cannot tell you why they keep the new calendar.', autoMs: 1400 },
      { voice: 'S', text: 'They only know the month with your frequency in its name is the important one.', autoMs: 2200 },
    ] },
    // K. Ven-Thar — his rationalisation breaks against a stranger judging in his
    // voice. Flavor has the false prophet; the beat keeps only his excuse + the
    // judging.
    milestone_1m: { steps: [
      { voice: 'K', text: 'I used to tell myself a voice cannot be a crime.', autoMs: 1400 },
      { voice: 'K', text: 'Then a man I never spoke to began sentencing them in it.', autoMs: 2200 },
    ] },
    // S. Drath — calibration became scripture. Flavor has the decoded pulse +
    // "not speaking yet"; the beat adds the calibration framing and longevity.
    milestone_10m: { steps: [
      { voice: 'S', text: 'You were warming up the rig. Talking to no one.', autoMs: 1400 },
      { voice: 'S', text: 'They have a scripture off your warm-up now. A thousand years, if it holds.', autoMs: 2200 },
    ] },
    // K. Quel-Sin — PROSPERED. The asymmetry he wants on the record. Flavor has
    // the seven-tone faith + forty years of song; the beat carries only the
    // undeserved gratitude and the plea to keep this one in the file.
    milestone_100m: { steps: [
      { voice: 'K', text: 'All I did here was match their key, and then leave it alone.' },
      { voice: 'K', text: 'They thank me, still. I have done nothing in my life to be thanked like that.' },
      { voice: 'K', text: 'Keep this one. When the file is read back to me, I want this one in it.' },
    ] },
    // K. Eolun — his minimisation, the "it was already falling" excuse. Flavor
    // has the schism + "he tipped it"; the beat is the rationalisation itself.
    milestone_1b: { steps: [
      { voice: 'K', text: 'It was going to break without me. I have said that to myself for years.', autoMs: 1400 },
      { voice: 'K', text: 'A thumb on a scale is still a thumb. I was there. I helped it fall.', autoMs: 2200 },
    ] },
    // S. Brel-Halon — obedience is the wound, not the outcome. Flavor has the
    // year of silence; the beat sharpens to the obeying.
    milestone_10b: { steps: [
      { voice: 'S', text: 'They did exactly what they thought the sea asked. To the day.', autoMs: 1400 },
      { voice: 'S', text: 'It is not that it cost them. It is that they obeyed. That is the part you cannot live with.', autoMs: 2200 },
    ] },
    // K. Iharran — good advice, dead men. Flavor has the rerouted lanes +
    // healthy economy; the beat lands the captains.
    milestone_100b: { steps: [
      { voice: 'K', text: 'One sentence about their currents. I meant it kindly.', autoMs: 1400 },
      { voice: 'K', text: 'Their ledgers have never been better. Their captains drowned proving me right.', autoMs: 2200 },
    ] },
    // K. Solunn climax. Original EP2 opener — the deception confession. Does not
    // restate the flavor; it names what he chose not to correct.
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
    // S. Tachet — the cadence became an instruction. Flavor has the morse
    // misread; the beat adds the meaning it took on and its daily use.
    milestone_1k: { steps: [
      { voice: 'S', text: 'Your idle rhythm got into their telegraph code.', autoMs: 1400 },
      { voice: 'S', text: 'It means proceed now. They key it a thousand times a day, to each other.', autoMs: 2200 },
    ] },
    // K. Pelnar Belt — anomaly seed (he wasn't aiming at them) plus the cost of
    // adoration. Flavor has the unreadable flares + "not pushing yet".
    milestone_10k: { steps: [
      { voice: 'K', text: 'I never aimed anything at the belt. I checked.', autoMs: 1400 },
      { voice: 'K', text: 'They keep a feast day for me regardless. It shuts the refineries for a week.', autoMs: 2200 },
    ] },
    // S. Theran — COLLAPSED. He became an unalterable ancestor; two clades went
    // to war over him. Flavor has the scent-archive; the beat names the war.
    milestone_100k: { steps: [
      { voice: 'S', text: 'You wrote yourself into a memory they cannot revise.', autoMs: 1400 },
      { voice: 'S', text: 'Two bloodlines, each certain you were theirs. They burned the forest settling it.', autoMs: 2400 },
    ] },
    // K. Esnal — they multiplied him before he spoke. Anomaly + EP3 performing
    // tone. Flavor has the thirty-seven-deity pantheon.
    milestone_1m: { steps: [
      { voice: 'K', text: 'I had not so much as said hello.', autoMs: 1400 },
      { voice: 'K', text: 'They had already introduced me to themselves thirty-seven times, under thirty-seven names.', autoMs: 2200 },
    ] },
    // K. Pellan-Toth — PROSPERED. He keeps the running count of contacts that
    // landed (the Ep 7 asymmetry, in evidence). Flavor has the gentle law.
    milestone_10m: { steps: [
      { voice: 'K', text: 'They turned the way I speak into law. I never asked them to.' },
      { voice: 'K', text: 'And it came out kinder than any law I would have had the nerve to write.' },
      { voice: 'K', text: 'Three have landed well now. The desert’s neighbour, the radio-monks, this. I keep the count.' },
    ] },
    // S. Norr-Halen — how close it came; interrogation pressure on "the third".
    // Flavor has the missile misread + the city that did not stand down.
    milestone_100m: { steps: [
      { voice: 'S', text: 'They mistook your handwriting for a first strike.', autoMs: 1400 },
      { voice: 'S', text: 'Three stand-down orders. Two cities believed them. Ask me about the third sometime.', autoMs: 2400 },
    ] },
    // K. Korov Drift — he learns the cost of being taken as authority, and
    // stops. Flavor has the torus-sky writing; the beat adds the countersigning
    // and his restraint.
    milestone_1b: { steps: [
      { voice: 'K', text: 'On Korov the sky is a ceiling, near enough to read off.', autoMs: 1400 },
      { voice: 'K', text: 'Anything I put up there, they took as signed. So I stopped putting things up there.', autoMs: 2200 },
    ] },
    // S. Eshrane — TRIGGERED. His carelessness, in Sera's read. Flavor has the
    // cave flight + two-thirds lost.
    milestone_10b: { steps: [
      { voice: 'S', text: 'You were sending fast by Eshrane. Careless.', autoMs: 1400 },
      { voice: 'S', text: 'They read a god’s temper in it and hid in the mountain. You can count who walked back down. It is quick.', autoMs: 2400 },
    ] },
    // K. Vail-South — the futility of the war over his meaning. Flavor has the
    // two-hemisphere reading + the war about the disagreement.
    milestone_100b: { steps: [
      { voice: 'K', text: 'Two halves of one world, reading me in opposite directions.', autoMs: 1400 },
      { voice: 'K', text: 'They went to war over which of them had me right. Neither of them did.', autoMs: 2200 },
    ] },
    // S. Vehrn-9 climax. Original EP3 opener — the amplification reveal. Does
    // not restate the flavor.
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
    // K. Olun — the runaway dread. Flavor has the accelerated algebra; the beat
    // is the not-slowing.
    milestone_1k: { steps: [
      { voice: 'K', text: 'One nudge, sideways, into work they were already doing.', autoMs: 1200 },
      { voice: 'K', text: 'Twenty years in three. And they have not slowed down once since.', autoMs: 2000 },
    ] },
    // S. Tavel — a kindness that never ended. Flavor has the storm warning + the
    // fallen parliament; the beat adds the duration.
    milestone_10k: { steps: [
      { voice: 'S', text: 'One kindness. You told them weather was coming.', autoMs: 1400 },
      { voice: 'S', text: 'They suspended their own government to survive a day of it. They are still suspended.', autoMs: 2400 },
    ] },
    // K. Khel-Vir — TRIGGERED. The thesis of the episode. Flavor has the melted
    // reactor; the beat carries the "cleaner was not safer" + the river cost.
    milestone_100k: { steps: [
      { voice: 'K', text: 'They were nearly there on their own. I only made it cleaner.', autoMs: 1400 },
      { voice: 'K', text: 'Cleaner was not safer. It is in their river now, and will be for an age.', autoMs: 2200 },
    ] },
    // S. Sennak — the hunt for Kalen begins, present-tense thread. Flavor has
    // the tomography detection + century study.
    milestone_1m: { steps: [
      { voice: 'S', text: 'A whole world’s physicists found you. By accident, at first.', autoMs: 1400 },
      { voice: 'S', text: 'That was a century ago. They have not stopped looking. Neither, it turns out, did we.', autoMs: 2200 },
    ] },
    // K. Iyarra-Vell — the weight of one datum, and the sentence he never wrote.
    // Flavor has the single number + the century of derivation.
    milestone_10m: { steps: [
      { voice: 'K', text: 'A single number. The smallest thing I ever handed anyone.', autoMs: 1400 },
      { voice: 'K', text: 'They gave a hundred years to the rest of the sentence it implied. I never wrote the rest.', autoMs: 2200 },
    ] },
    // S. Brel-Halon-Tertius — the cost on the children. Flavor has the unasked
    // question + the seventy-year swarm.
    milestone_100m: { steps: [
      { voice: 'S', text: 'They had a question they had not dared ask out loud.', autoMs: 1400 },
      { voice: 'S', text: 'You answered it. They caged their own sun. Everyone born since has lived without open sky.', autoMs: 2400 },
    ] },
    // K. Pavel-9 — TRIGGERED. His foreknowledge. Flavor has the shared blueprint
    // for reactor and warhead; the beat is that he knew and sent it anyway.
    milestone_1b: { steps: [
      { voice: 'K', text: 'I drew them a reactor. The same drawing is a warhead, if you are in a hurry.', autoMs: 1400 },
      { voice: 'K', text: 'They were always going to be in a hurry. I knew that. I sent it anyway.', autoMs: 2200 },
    ] },
    // K. Aros-Marl — the social problem the chemistry left behind. Flavor has the
    // catalyst + doubled birth rate.
    milestone_10b: { steps: [
      { voice: 'K', text: 'One catalyst. The chemistry was the easy part.', autoMs: 1400 },
      { voice: 'K', text: 'A generation later there were twice as many of them, in a world built for half.', autoMs: 2200 },
    ] },
    // S. Ven-Karah — COLLAPSED. The accusation, by repetition. Flavor has the
    // weaponisable geometry + civil war.
    milestone_100b: { steps: [
      { voice: 'S', text: 'The shape you sent held their plasma beautifully.', autoMs: 1400 },
      { voice: 'S', text: 'It also held a bomb. You knew it held a bomb. You sent the shape.', autoMs: 2400 },
    ] },
    // K→. Tarsus Minor climax. COLLAPSED. Per episodes.md, Sera does not press;
    // he talks for a long time. The beat is his total exposure — it adds the
    // figure and the offer to be asked anything, rather than restating the
    // eight seconds the reveal card already carries.
    milestone_1t: { steps: [
      { voice: 'K', text: 'Eighteen million. I had the orbital scope at full zoom.', autoMs: 1400 },
      { voice: 'K', text: 'Ask me anything about Tarsus. I will not look away from this one either.', autoMs: 2400 },
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
    // K. Welun — the unease of restraint: even watching is contact. Flavor has
    // the year of listening + their unwitting song.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I did nothing here. I only watched. That was the whole plan.', autoMs: 1400 },
      { voice: 'K', text: 'A year in, they had turned to watch back. I have never worked out how they knew to.', autoMs: 2000 },
    ] },
    // S. Tor-Mira — scale of the change. Flavor has the 450-year lives + the
    // composers' key change.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You sent them weather. Ambient. Nothing, you would say.', autoMs: 1400 },
      { voice: 'S', text: 'One note moved in it, and a four-hundred-year culture moved with the note.', autoMs: 2200 },
    ] },
    // K. Ehlan — a single hail, a literature gone. Flavor has the shifted poems
    // + the untraceable cause.
    milestone_100k: { steps: [
      { voice: 'K', text: 'All I did at Ehlan was say hello. The smallest courtesy I have.', autoMs: 1200 },
      { voice: 'K', text: 'It cost them a literature. The poems from before I arrived — no one alive can read them now.', autoMs: 2200 },
    ] },
    // K. Sereshan — the first inserted sentence. The anomaly's pivot. Flavor has
    // the benediction + the sentence he had not written.
    milestone_1m: { steps: [
      { voice: 'K', text: 'This is where the first one arrived. A sentence in my carrier I had never written.', autoMs: 1400 },
      { voice: 'K', text: 'I filed it as fatigue. I would go on filing it as fatigue for two more years.', autoMs: 2400 },
    ] },
    // S. Norvell — permanence + ethics. Flavor has the reshaped migration.
    milestone_10m: { steps: [
      { voice: 'S', text: 'One phrase, and you turned a people off the road they had walked for centuries.', autoMs: 1400 },
      { voice: 'S', text: 'Everywhere they go now, they go because of you. That was never yours to decide.', autoMs: 2200 },
    ] },
    // K. Iyarra-Lesser — the kept secret between siblings. Flavor has the faster
    // derivation + the unspoken-of result.
    milestone_100m: { steps: [
      { voice: 'K', text: 'The colony moon solved it before the parent world even had the question.', autoMs: 1400 },
      { voice: 'K', text: 'And said nothing. Two siblings, one of them keeping a thing the other does not know to ask about.', autoMs: 2400 },
    ] },
    // K. Pellach — bare attention as harm; his bewildered horror. Flavor has the
    // dropped lifespan.
    milestone_1b: { steps: [
      { voice: 'K', text: 'I never said a word to Pellach. I only paid attention to them.', autoMs: 1400 },
      { voice: 'K', text: 'Being looked at, by me, took fifty years off a life. I cannot account for that. I cannot.', autoMs: 2200 },
    ] },
    // S. Quiet Three — the one that remembers is the threat. Flavor has the
    // single greeting + two forgetting.
    milestone_10b: { steps: [
      { voice: 'S', text: 'One greeting, three sister worlds. Two of them have let it go entirely.', autoMs: 1400 },
      { voice: 'S', text: 'The third kept every syllable. That is the one I would lose sleep over, in your place.', autoMs: 2400 },
    ] },
    // K. Vatha-Sel — his denial finally breaks. Flavor has the second confirmed
    // edit on his desk.
    milestone_100b: { steps: [
      { voice: 'K', text: 'A second one. Same fingerprint on the carrier. I cannot call this fatigue.', autoMs: 1400 },
      { voice: 'K', text: 'I believe Sera now. I should have believed her at the first one.', autoMs: 2000 },
    ] },
    // K. Lehl climax. The break. Adds the specifics (the version the elder heard,
    // his voice, not his line) rather than restating "the sentence is not his".
    milestone_1t: { steps: [
      { voice: 'K', text: 'I only listened to Lehl. I swear it. I only listened.', autoMs: 1400 },
      { voice: 'K', text: 'The version their elder heard has one more line. In my voice. It is not my line.', autoMs: 2400 },
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
    // K. Ar-Sennech — the eerie contradiction. Flavor has folder vs charts; the
    // beat adds the warmth of the contact and the impossibility.
    milestone_1k: { steps: [
      { voice: 'K', text: 'I hailed them once. They answered warm, like neighbours leaning over a fence.', autoMs: 1400 },
      { voice: 'K', text: 'There is no star there now. My folder never got the notice that they were never real.', autoMs: 2400 },
    ] },
    // S. Toravan — persistence against erasure. Flavor has the songs about a
    // lost sister; the beat adds that no record of her survives, yet they sing.
    milestone_10k: { steps: [
      { voice: 'S', text: 'Their whole folk tradition is grief for a world that was once their neighbour.', autoMs: 1400 },
      { voice: 'S', text: 'There is no such world. No chart, no record, no ash. Just a planet of people who miss it.', autoMs: 2200 },
    ] },
    // K. Veld-Ar — he stops playing them; the metadata gaslights. Flavor has the
    // shrinking file.
    milestone_100k: { steps: [
      { voice: 'K', text: 'I have stopped playing these recordings back.', autoMs: 1400 },
      { voice: 'K', text: 'Every time I did, there was less of them. And the file swore, each time, that nothing had changed.', autoMs: 2400 },
    ] },
    // S. Halun-Outer — active sealing, by a hand above Sera. Flavor has the
    // dated observatory confirmation.
    milestone_1m: { steps: [
      { voice: 'S', text: 'One observatory still holds proof the missing world was real.', autoMs: 1400 },
      { voice: 'S', text: 'Someone sealed that proof last week. From above me. I am not cleared to look at it.', autoMs: 2400 },
    ] },
    // K. Empty Coordinate — which is lying, charts or sky. Flavor has the three
    // stars without planets.
    milestone_10m: { steps: [
      { voice: 'K', text: 'I measured the three stars myself. Exactly where they should be.', autoMs: 1400 },
      { voice: 'K', text: 'The planets that should circle them are gone. Either my charts lie, or the sky does. I no longer know which I would prefer.', autoMs: 2400 },
    ] },
    // S. Iyarra-Echo — recent, clean deletion beyond Union capability. Flavor has
    // the colony the Union no longer indexes.
    milestone_100m: { steps: [
      { voice: 'S', text: 'There was an Iyarra colony. Five years ago, every index in the Union listed it.', autoMs: 1400 },
      { voice: 'S', text: 'Today none of them do. The deletion is recent. It is also clean. Cleaner than we know how to be.', autoMs: 2400 },
    ] },
    // K. Veska — nothing at the coordinate they all point to. Flavor has the
    // "lost neighbour" in the logs.
    milestone_1b: { steps: [
      { voice: 'K', text: 'Their oldest logs all point one way. At a neighbour they call the lost one.', autoMs: 1400 },
      { voice: 'K', text: 'I have stood at that coordinate with every instrument I own. There is nothing there to point at.', autoMs: 2200 },
    ] },
    // K. Reltha — never-there, not deleted. Flavor has the empty 800-page file.
    milestone_10b: { steps: [
      { voice: 'K', text: 'The index promised me eight hundred pages on Reltha.', autoMs: 1200 },
      { voice: 'K', text: 'I opened it to nothing. Not erased — never there. Only the label still insists it was.', autoMs: 2200 },
    ] },
    // K. Pen-Halun — visceral proof against denial. Flavor has the Wardens'
    // denial + his own recording.
    milestone_100b: { steps: [
      { voice: 'K', text: 'ComDef says Pen-Halun is a world I invented.', autoMs: 1400 },
      { voice: 'K', text: 'I have their parliament taking a vote. I can hear the gavel come down. I was there.', autoMs: 2200 },
    ] },
    // A. Designation Withheld climax. Anonymous, italic — the season's first full
    // turn to the not-Kalen voice. Both lines A; drops the flavor restatement.
    milestone_1t: { steps: [
      { voice: 'A', text: 'You will not find the world. It is no longer a thing you can look at.', italic: true, autoMs: 1800 },
      { voice: 'A', text: 'You have not been alone at that desk for a long time, Kalen.', italic: true, autoMs: 2600 },
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
    // S. Tov-Karav — the self-blindness that is the pattern. Flavor carries the
    // archive find + route; the beat pivots off the route to the blind spot.
    milestone_1k: { steps: [
      { voice: 'S', text: 'I went through your archive while you slept. You were never going to show me this one.', autoMs: 1400 },
      { voice: 'S', text: 'Not hidden. You just never thought it counted. That is the whole pattern, right there.', autoMs: 2200 },
    ] },
    // S. Ralis — his minimisation vs her pattern-sight. Flavor has the collapse +
    // route.
    milestone_10k: { steps: [
      { voice: 'S', text: 'You wrote one word beside Ralis, in your own hand. Inconsequential.', autoMs: 1400 },
      { voice: 'S', text: 'They were gone three years later. You never joined the two until tonight. I did.', autoMs: 2200 },
    ] },
    // S. Khol-3 — the road becoming visible. Flavor has the detonation + route.
    milestone_100k: { steps: [
      { voice: 'S', text: 'Eight cities, in an afternoon, five years after you said hello.', autoMs: 1400 },
      { voice: 'S', text: 'Same road as the last two. You are starting to see it now, aren’t you.', autoMs: 2200 },
    ] },
    // S. Sephor-3 — the control case that lived. Flavor flags the bypass; the
    // beat holds up the word "nothing".
    milestone_1m: { steps: [
      { voice: 'S', text: 'Here is one that lived. You reached them by another road entirely.', autoMs: 1400 },
      { voice: 'S', text: 'Nothing happened to Sephor-3. Nothing at all. Hold that word — we are going to need it.', autoMs: 2200 },
    ] },
    // S. Pratha — one sent, two received. Kept; the core anomaly, not in flavor.
    milestone_10m: { steps: [
      { voice: 'S', text: 'Two pulses reached them. From two nodes, in sequence.', autoMs: 1400 },
      { voice: 'S', text: 'They got two different messages. You only ever sent one.', autoMs: 2400 },
    ] },
    // K. Vell-Karash — the timeline horror. Flavor has the earliest transit +
    // no memory; the beat adds that it predates his "career".
    milestone_100m: { steps: [
      { voice: 'K', text: 'This one is older than Ahn-Tar-3. Before I had done anything I would have called a career.', autoMs: 1400 },
      { voice: 'K', text: 'I have no memory of sending it. The logs are certain it left from my desk.', autoMs: 2200 },
    ] },
    // S. Eshin — the difference has a hand in it. Flavor has the key signature;
    // the beat names it authored.
    milestone_1b: { steps: [
      { voice: 'S', text: 'The gap between what you sent and what landed is loudest here.', autoMs: 1400 },
      { voice: 'S', text: 'And it is not noise. It is a key signature. A hand. Listen.', autoMs: 2000 },
    ] },
    // S. Norv — the unwanted truth. Flavor has the clean bypass case; the beat
    // adds the "second hand" framing.
    milestone_10b: { steps: [
      { voice: 'S', text: 'Another one off the main road. Your carrier reached them clean.', autoMs: 1400 },
      { voice: 'S', text: 'No second hand on it. They are alive, ordinary, dull. The control case nobody wanted to be true.', autoMs: 2200 },
    ] },
    // S. Halun-Pattern — the cover-up. Flavor has the dated ComDef log; the beat
    // lands that they knew first.
    milestone_100b: { steps: [
      { voice: 'S', text: 'This is the one I can prove. The amplification, on the wire, past argument.', autoMs: 1400 },
      { voice: 'S', text: 'ComDef logged it three years ago and buried it. They knew before either of us walked into this room.', autoMs: 2200 },
    ] },
    // K. Shann-Vel climax — the synthesis: pattern = route = puppeteer (sets up
    // EP8). Flavor has the two disagreeing recordings.
    milestone_1t: { steps: [
      { voice: 'K', text: 'My sending is on my desk. What they heard is on hers. Word for word — until it is not.', autoMs: 1400 },
      { voice: 'K', text: 'Every world that broke rode the same few nodes. The pattern is the route. The route is the hand.', autoMs: 2400 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 8 — Finale
  // ──────────────────────────────────────────────────────────────────────
  8: {
    // K. Cycle open — the pivot out of the cell. EP1–7 were testimony at a desk;
    // EP8 leaves it. Make the departure explicit and motivated (the evidence is
    // physical and cannot be read remotely), so "flying somewhere" doesn't land
    // as a jump-cut. Consistent with episodes.md EP8 (Sera walks Kalen out).
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The interrogation is over. Sera unlocked the cell from her side and told me to walk.' },
      { voice: 'K', text: 'The route has a name now. The amplifier has a signature. Neither can be read from a desk.' },
      { voice: 'K', text: 'She has signed out a cutter on her own credentials. Against every order. We are going to the relay to see it ourselves.' },
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
    // N. Relay 712 — the arrival made concrete (the desk is behind them now) +
    // the deeper-age horror. Flavor has the size/age facts.
    milestone_1k: { steps: [
      { voice: 'N', text: 'They take a cutter out past the last picket and dock against it in the dark.', autoMs: 1800 },
      { voice: 'N', text: 'The Union built it three centuries ago. The relay is older than the Union. Both are true.', autoMs: 2400 },
    ] },
    // K. Tov-Bright — real-time, and taught-how. Flavor has the fresh emitter +
    // "none of them are his".
    milestone_10k: { steps: [
      { voice: 'K', text: 'While we are docked here, a world lights up. Live, on the relay’s own feeds.', autoMs: 1400 },
      { voice: 'K', text: 'I never touched it. Never logged it. It is broadcasting outward as if someone taught it how.', autoMs: 2200 },
    ] },
    // K. Ahn-Bright — his fingerprint on a message he did not write. Flavor has
    // the recognised modulation near Ahn-Tar-3.
    milestone_100k: { steps: [
      { voice: 'K', text: 'A neighbour of the desert. The first place I ever broke.', autoMs: 1400 },
      { voice: 'K', text: 'I never spoke to this one. But the second hand in its signal is mine. My print on words I did not write.', autoMs: 2400 },
    ] },
    // S. Hesh-Bright — aimed, not random. Flavor has the unknown language + the
    // off-map destination.
    milestone_1m: { steps: [
      { voice: 'S', text: 'The third one tonight speaks a language even Kalen cannot read.', autoMs: 1400 },
      { voice: 'S', text: 'And it is aimed. At a fixed point, not the open sky. There is nothing of ours where it points.', autoMs: 2400 },
    ] },
    // S. Eighth Bright — planned ahead of them. Flavor has the scheduled spacing.
    milestone_10m: { steps: [
      { voice: 'S', text: 'That is eight now. Each waking a set interval after the last.', autoMs: 1600 },
      { voice: 'S', text: 'The relay’s own log has a word for the spacing. Scheduled. This was planned long before us.', autoMs: 2400 },
    ] },
    // S. Verel-Bright — Sera's composure goes. Flavor has the fifteenth bright +
    // "she stops taking notes".
    milestone_100m: { steps: [
      { voice: 'S', text: 'Fifteen. I came out here to build a case. There is no case left to build.', autoMs: 1400 },
      { voice: 'S', text: 'I have put the pen down. Kalen has not stopped reading the feeds. I do not think he can.', autoMs: 2400 },
    ] },
    // S. Ven-Bright — it is running, not recording, from this room. Flavor has
    // the real-time broadcast.
    milestone_1b: { steps: [
      { voice: 'S', text: 'There is no lag left between a world lighting and the relay logging it.', autoMs: 1400 },
      { voice: 'S', text: 'It is not recording the cascade. It is running it. Live. From the room we are standing in.', autoMs: 2200 },
    ] },
    // K. Korash-Bright — his dread; a target already chosen. Flavor has the
    // powers-of-two count.
    milestone_10b: { steps: [
      { voice: 'K', text: 'Two. Four. Eight. I kept hoping the next would break the run.', autoMs: 1800 },
      { voice: 'K', text: 'Sixty-four tonight. It is not lighting worlds at random. It is counting, toward a number it already holds.', autoMs: 2200 },
    ] },
    // S. Cascade Spine — the one word that matters is missing. Flavor names the
    // pattern + the relay's job, not the destination.
    milestone_100b: { steps: [
      { voice: 'S', text: 'We can name what this is now. Its shape. What the relay is for.', autoMs: 1400 },
      { voice: 'S', text: 'We still cannot name where it sends them. The only word that would matter, and the one we do not have.', autoMs: 2200 },
    ] },
    // N → A. THE CASCADE climax. The human reaction + the Narrator tagline +
    // the Anonymous through-line (prefigures EP10). Does not restate the flavor.
    milestone_1t: { steps: [
      { voice: 'N', text: 'Sera looks at the map. Kalen looks at the map. Neither of them says the number aloud.', autoMs: 2400 },
      { voice: 'N', text: 'He came to talk to one quiet world. He was a tributary. He was never the river.', autoMs: 2400 },
      { voice: 'N', text: 'The dark was never silent.', autoMs: 2000 },
      { voice: 'A', text: 'You made it loud enough. Thank you, Kalen.', italic: true },
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
    // S. Tov-Karav reply — they learned to ask by listening to him. Flavor has
    // the route-17 reply, three years late.
    milestone_1k: { steps: [
      { voice: 'S', text: 'The reply came back on your own carrier. Three years out, three years home.' },
      { voice: 'S', text: 'They are asking who you are. They learned how to ask by listening to you.' },
    ] },
    // K. The Long Note — the impossible timeline. Flavor has the 47-year tone in
    // his hand, no record of sending.
    milestone_10k: { steps: [
      { voice: 'K', text: 'Forty-seven years it has been singing, and we only just unpicked it.' },
      { voice: 'K', text: 'It is in my exact hand. My modulation. It was sent the year before I was born.' },
    ] },
    // K. Mirror Voice — kept. The one-syllable wrongness; not in flavor.
    milestone_100k: { steps: [
      { voice: 'K', text: 'It is my voice. Down to the breath before a word.' },
      { voice: 'K', text: 'It is not my line. I never said this.' },
    ] },
    // K. Brel-Halon reply — his refusal of the monument. Flavor has the grown
    // fleet asking for a name.
    milestone_1m: { steps: [
      { voice: 'K', text: 'The fleet I silenced for a year — their grandchildren grew up and learned to talk back.' },
      { voice: 'K', text: 'They want to carve a name into a monument. Mine. I would rather they carved no name at all.' },
    ] },
    // S. Pillar of Atan — kept. The imitation megastructure; the menace is the
    // "what for". Flavor has the empty coordinates + his modulation.
    milestone_10m: { steps: [
      { voice: 'S', text: 'Someone built a structure the size of a moon, on a rock with no one on it.' },
      { voice: 'S', text: 'It hails in your modulation. Perfectly. I would very much like to know what for.' },
    ] },
    // S. Korov reply — kept. They have surpassed him; not in flavor's framing.
    milestone_100m: { steps: [
      { voice: 'S', text: 'They have published a textbook of corrections to your grammar.' },
      { voice: 'S', text: 'They are right about every one of them.' },
    ] },
    // K. Ear of Saen — the inventory returned, unbidden. Flavor has the station
    // confirming every carrier, by number, in order. (Also the game's own
    // locale — the desk Kalen sits at.)
    milestone_1b: { steps: [
      { voice: 'K', text: 'There is a station past the edge of the grid with a copy of everything I ever sent.' },
      { voice: 'K', text: 'It is sending it all back. Numbered. In order. It never asked whether I wanted it.' },
    ] },
    // S. Iyarra pre-echo — she gives up the rational explanation. Flavor has the
    // reply stamped two centuries early.
    milestone_10b: { steps: [
      { voice: 'S', text: 'Iyarra answered. The answer is stamped two centuries before you sent the question.' },
      { voice: 'S', text: 'I have run out of ways to call this a forgery. I am going to stop trying.' },
    ] },
    // K. Velnor Choir — kept. A world that knew him before contact. Not in flavor.
    milestone_100b: { steps: [
      { voice: 'K', text: 'They were waiting for me to be ready.' },
      { voice: 'K', text: 'I never asked to be the one they were waiting for.' },
    ] },
    // N → K → A. The First Foreign Voice. Climax. Adds Kalen's "expected"
    // reaction; keeps the Anonymous sting. Does not restate the flavor.
    milestone_1t: { steps: [
      { voice: 'N', text: 'The signal comes from outside the grid entirely. From nothing they can point to.', autoMs: 2200 },
      { voice: 'K', text: 'It calls me by a rank I have never held. As if I am late. As if I am expected.', autoMs: 2600 },
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
    // K. First Probe — the medium changes from signal to arrival. Flavor has the
    // ancient hull; the beat adds the in-person framing and his culpability.
    milestone_1k: { steps: [
      { voice: 'K', text: 'A Border Warden towed it in yesterday. No drive trail, no crew. Just waiting in the dark to be found.' },
      { voice: 'K', text: 'It came following the noise I have made for eleven years. It is the first of them to arrive in person.' },
    ] },
    // S. Veska Approach — someone supplied the coordinate. Flavor has the visited
    // missing world that it knew how to find.
    milestone_10k: { steps: [
      { voice: 'S', text: 'It set down on Veska. The world not one of our charts will admit is there.' },
      { voice: 'S', text: 'It did not search for the spot. It already knew. Someone handed it the coordinate we cannot see.' },
    ] },
    // K. Halun-Veth visited — the corruption of the one he was proud of. Flavor
    // has the delegation + the key.
    milestone_100k: { steps: [
      { voice: 'K', text: 'Halun-Veth. The one I was proud of. The one I had the sense to leave alone.' },
      { voice: 'K', text: 'Visitors came and handed them a key. Now the careful place I left has a door it never knew it had.' },
    ] },
    // S. The Quiet Fleet — the destination is the door. Flavor has the silent
    // coordinated approaches.
    milestone_1m: { steps: [
      { voice: 'S', text: 'We are tracking more than we can count. They do not hail. They do not deviate.' },
      { voice: 'S', text: 'Every one of them is bound for the relay. They are coming to the door — not to us.' },
    ] },
    // K. Pavel-9 visited — his harm taken gently out of his hands. Flavor has the
    // disassembled warhead, the running reactor.
    milestone_10m: { steps: [
      { voice: 'K', text: 'At Pavel-9 they took the warhead apart in nine minutes and left the lights on.' },
      { voice: 'K', text: 'They are taking the dangerous things back out of my hands. Gently. And they are keeping them.' },
    ] },
    // K. Lehl visited — forgiveness or accounting. Flavor has the recovered
    // lifespan, the forgotten edit.
    milestone_100m: { steps: [
      { voice: 'K', text: 'The visitors at Lehl are kind. The years I cost them are coming back, fast.' },
      { voice: 'K', text: 'No one there remembers the sentence that did it. I cannot tell if this is forgiveness, or only accounting.' },
    ] },
    // A. The Listener revealed — the through-line lands against the footage.
    // Flavor has the silhouette stepping into the light, not human.
    milestone_1b: { steps: [
      { voice: 'A', text: 'You were never alone at that desk.', italic: true },
      { voice: 'A', text: 'You have known that a long time. Look at the footage. Now you can see me.', italic: true },
    ] },
    // K. Foreman's Contract — the synthesis of the whole season. Flavor has the
    // signature dated before his birth, the unaged paper.
    milestone_10b: { steps: [
      { voice: 'K', text: 'Sera pulled a contract out of a Union vault I am not cleared to open. The signature on it is mine.' },
      { voice: 'K', text: 'You have read the date on it. I will only say what it means: I have worked here longer than I have been alive.' },
    ] },
    // S. The Relay Opens — the wrong building. Flavor has the unseaming aperture.
    milestone_100b: { steps: [
      { voice: 'S', text: 'The relay has hinges. We did not see them until it used them.' },
      { voice: 'S', text: 'Hinges imply a door. A door implies intent. We have been standing inside the wrong building all along.' },
    ] },
    // N → K → A. The Door. The series climax. Keeps the Anonymous payoff; the
    // N/K lines add the moment rather than restating the flavor.
    milestone_1t: { steps: [
      { voice: 'N', text: 'The aperture holds for a moment. Then it is occupied.', autoMs: 2200 },
      { voice: 'K', text: 'It wears a man’s shape. It uses my voice to do it. Sera does not lower her sidearm, and I do not ask her to.', autoMs: 2600 },
      { voice: 'A', text: 'I have been doing your work, Kalen. The parts of it you could not be present for.', italic: true },
    ] },
  },
};
