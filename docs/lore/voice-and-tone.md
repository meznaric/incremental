# Voice & Tone

How the game speaks. Three voices. Pick exactly one per piece of text. Mixing voices breaks the spell.

## 1. Kalen — *first person, ambient log*

Used for: ambient interstitials, gamble notes, ship's-log style flavour.

### Rules
- First person.
- Lowercase-leaning if it fits; he isn't shouting.
- Short sentences. Followed by a small qualifier. "It worked. I think. Mostly."
- Never apologises directly. Apologises *around* the thing.
- Uses technical vocabulary as comfort.
- Addresses *the world* sometimes, second person. ("I don't know what you call your moon. I hope it kept you company.")

### Anti-patterns
- Don't make him a poet. He's an engineer with a guilty conscience.
- No exclamation marks. He doesn't have the energy.
- No "I am so sorry." Too clean.

### Canonical samples

> *"Pushed a carrier in at 0314 local. They heard it. I checked the next morning. They had built a temple around the radio set."*

> *"You don't know me. You don't have to. I just wanted to say good morning. I keep saying it. You keep not knowing me."*

> *"I told myself I was careful. I was the most careful version of a person who was always going to be caught."*

---

## 2. Sera — *second person, procedural*

Used for: interrogation interstitials, accusations, end-of-episode beats, anything that requires authority.

### Rules
- Speaks *to the player* in second person.
- Procedural register: cool, complete sentences, no hedging.
- Periods. Always. No ellipses, no em-dashes mid-thought.
- Asks the same thing three ways. Or rephrases the player's act so it sounds worse.
- Uses *please* once per scene if at all. Uses *thank you* never.
- Never the first to break tone. If the player crashes (`all_in_zero`-style), Sera notes the file, not the player.

### Anti-patterns
- No cruelty. She's not a cop in a bad show. She is *good at her job*.
- No exposition dumps. She knows what she knows; she lets the player catch up.
- No questions she already has the answer to.

### Canonical samples

> *"You contacted Ahn-Tar-3 on the 14th. You used a sixteen-year-old as a relay. Walk me through the part where that was kindness."*

> *"You thought no one was listening. Two of us were."*

> *"You said the word for *welcome* in their language. You used the imperative form. Did you know that, when you said it?"*

---

## 3. Narrator — *third person, neutral*

Used for: the cold open of new game, the tagline, the end-state, system-level beats (saves, resets).

### Rules
- Third person, omniscient, neutral.
- Short. Almost biblical. ("And then the worlds began.")
- Never quotes a character.
- Used very rarely. If everything is the Narrator, nothing is.

### Anti-patterns
- No purple. No "in the depths of the silent void..." We are grounded.
- No commentary on the player's morality. The Narrator *observes*.

### Canonical samples

> *"The dark was never silent."*

> *"He had been listening for eleven years before he answered."*

> *"Hundreds of young worlds, all at once, began to reach outward."*

---

## 4. Anonymous fragment — *the not-Kalen*

Used for: the rare interstitial where the *other thing on the network* shows up.

### Rules
- Always italic in render. (CSS hook: `<i>` inside `it-text`.)
- Always exactly one sentence.
- Never declares identity.
- Always *almost* Kalen's voice. Off by one register. Cleaner. Calmer than he could ever be.
- Use approximately *once per season* in the game. Rare = scary.

### Anti-patterns
- Don't reveal the antagonist.
- Don't be cute or ominous-for-ominous-sake.
- Don't speak twice in a row.

### Canonical samples

> *"You were never alone at that desk."*

> *"Speak louder. They are almost ready."*

> *"You did not write the last sentence."*

---

## Cross-voice rules

- **Currency name is "Echoes".** Plural. Lowercase in body text, capitalised in UI labels.
- **Player is Kalen.** Never "you, the user," never "the player." The game speaks *to Kalen*, or *as Kalen*.
- **No real-world references.** No emoji. No "lol", no "btw", no internet vernacular. The Union doesn't have that culture.
- **No swearing.** Not because the Union is prudish — because the show's tone leans severe and registers higher when it stays clean.
- **No fourth-wall breaks.** The game does not know it is a game.

## What to do when adding new copy

1. Decide the voice. Write it at the top of the draft.
2. Read aloud. If you can't read it in the voice, it's wrong.
3. Cut every adjective that isn't earning its keep.
4. If the line could appear in *any* sci-fi game, rewrite until it could only appear in this one.
