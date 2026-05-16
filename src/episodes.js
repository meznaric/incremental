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
    // K. Hsareth — the duplicate guild he did not know about.
    milestone_10m: { steps: [
      { voice: 'K', text: 'Ahn-Tar-3’s nearer neighbour.', autoMs: 1400 },
      { voice: 'K', text: 'I made the same mistake there. Ten years earlier. I did not know.', autoMs: 2200 },
    ] },
    // S. Mirum-3 — treaty cited his voice as a witness.
    milestone_100m: { steps: [
      { voice: 'S', text: 'Three city-states heard the same sentence.', autoMs: 1400 },
      { voice: 'S', text: 'They built a treaty around it. The treaty cites a witness.', autoMs: 2200 },
    ] },
    // K. Halun-Veth — they were already listening; he answered.
    milestone_1b: { steps: [
      { voice: 'K', text: 'They had been listening for forty years.', autoMs: 1400 },
      { voice: 'K', text: 'I answered. They rebuilt their academy around the answer.', autoMs: 2200 },
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
    // S. Ahn-Tar-3 climax. Original EP1 opener.
    milestone_1t: { steps: [
      { voice: 'S', text: 'The first one. The desert.', autoMs: 1400 },
      { voice: 'S', text: 'You said his name to him.', autoMs: 2000 },
    ] },
  },

  // ──────────────────────────────────────────────────────────────────────
  // EP 2 — The Sea Choir
  // ──────────────────────────────────────────────────────────────────────
  2: {
    // K. Cycle open — transition from EP1 to EP2.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'Ahn-Tar-3 closed. The casualty count is final.' },
      { voice: 'K', text: 'Sera has the next folder.' },
      { voice: 'K', text: 'It is labelled Solunn.' },
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
    // K. Quel-Sin — one polite verse, twelve thousand dead.
    milestone_100m: { steps: [
      { voice: 'K', text: 'I sang one verse back. Politely.', autoMs: 1400 },
      { voice: 'K', text: 'Twelve thousand monks have died about the verse.', autoMs: 2200 },
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
    // K. Cycle open — transition from EP2 to EP3.
    cycle_open: { repeat: true, steps: [
      { voice: 'K', text: 'The Solunni restructured. Sera says that is not the same as collapse.' },
      { voice: 'K', text: 'I asked her what is.' },
      { voice: 'K', text: 'She handed me Vehrn-9.' },
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
    // K. Pellan-Toth — kept from original.
    milestone_10m: { steps: [
      { voice: 'K', text: 'They wrote my cadence into law.', autoMs: 1400 },
      { voice: 'K', text: 'I had not written a constitution.', autoMs: 2000 },
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
};
