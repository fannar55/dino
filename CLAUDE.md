# Voices (Icelandic text-to-speech)

The owner hears every Icelandic voice line and fixes found once must never be lost again. These rules hold for every chapter,
game and tool in `remake/`.

- **One road for every line.** Lines are made only with the repo's voice tools (`remake/tools/voice-lines.mjs`,
  `yatzy-junior-voices.mjs`, `sloedla-dj.mjs`, and `memory-voices.mjs` once it takes the book), which send each line through the
  pronunciation book, `remake/assets/audio/pronunciation.json`. Never call ElevenLabs text-to-speech from a new script. A new
  game's tool imports `requestFor` from `remake/tools/pronunciation.mjs` and calls `assertNotRejected` from
  `remake/tools/heard.mjs` before it asks or installs anything; `remake/tests/heard.test.mjs` fails otherwise.
- **Before recording, look.** Run `node remake/tools/voice-lines.mjs --dry --set <set> [--only ids]` (or `--set all`) and read the
  notes under each line: "REJECTED" (the owner said no to exactly that request) and "<word>: fixed on its own line in ...". Try the
  recipe that already won for that word first.
- **Ný 3 for every new take of Mosi** (his word of 2026-11-05): a line never made, one he rejected or one made again goes out with
  the line itself as context after the book's, seed 7 unless it has its own (`pronunciation.json` `"lines"` → `"ny3"`); a shipped
  take of the book's request keeps it, and `--dry` names the rule on each line it applies to.
- **When the owner rejects a line,** make 3-4 candidates for him to pick by ear: a context (sent as previous_text, never spoken),
  IPA in `"/.../"`, a respelling, another seed. A fix that wins for a word goes into the book as a recipe of that word, and becomes
  its `chosen` when the owner agrees (or the second time it wins). A line that keeps its own `say` or `context` must say what it
  fixes in `"fixes"`: the book word id(s), `"punctuation"`, or `"line"` with a note that says it fixes the whole line. A word with
  no entry gets one with a `"hratt"` recipe, so no request changes: `"chosen": "hratt"` when the owner has approved its other
  lines as written, `null` only while he has not heard it at all.
- **Keep his verdicts.** After he saves a yes/no page (`jano-<set>.json`), import it and commit the file it writes:
  `node remake/tools/heard.mjs <jano.json> [--made <the checkout's voices-made.json, as it was when he listened>]`. A rejected
  request cannot be made again; `--plan` lists the shipped lines to redo.
- **Change a rule, then follow the plan:** `--plan` lists what to make again; run `--ab <set>` before `--only`.
- **The key.** Claude records voices itself with `ELEVENLABS_API_KEY`, already in the environment. Never print, log or write it.
- **Edit pronunciation.json only with node** (`readLexicon`/`writeLexicon` in `remake/tools/pronunciation.mjs`), never by hand or
  with Python; `remake/tests/pronunciation.test.mjs` holds its form and checks every word's stem over all the lines.
