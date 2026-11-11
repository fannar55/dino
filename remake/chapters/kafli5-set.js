// Chapter 5's song as the script reads it: assets/audio/kafli5/song/song.json as a module. Written by tools/kafli5-song.mjs: do not
// edit it by hand.
export const SONG = {
  "about": "Chapter 5's song (tools/kafli5-song.mjs): DJ Flugeðla's set \"Stóra sviðið\" on a real disco-funk band, the owner's pick of 2026-11-11. Beats are counted from the set's start; the loop is the band alone.",
  "name": "Stóra sviðið",
  "bpm": 125,
  "beatOffset": 0,
  "danceBeats": 2,
  "key": [
    440,
    493.88,
    554.37,
    659.26,
    739.99
  ],
  "loop": {
    "layers": {
      "drums": "loop-drums.mp3",
      "bass": "loop-bass.mp3",
      "music": "loop-music.mp3",
      "far": "loop-far.mp3",
      "calm": "loop-calm.mp3"
    },
    "startSec": 1.92,
    "seconds": 15.36,
    "beats": 32
  },
  "set": {
    "src": "djamm.mp3",
    "seconds": 229.96,
    "endBeat": 472,
    "loudness": {
      "lufs": -16,
      "truePeak": -1.7
    },
    "sections": [
      {
        "id": "arrival",
        "nameIs": "Komið öll",
        "feature": null,
        "startBeat": 0,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "welcome",
        "nameIs": "Velkomin",
        "feature": "flugedla",
        "startBeat": 16,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "warmup",
        "nameIs": "Upphitun",
        "feature": "flugedla",
        "startBeat": 32,
        "beats": 32,
        "record": "vamp"
      },
      {
        "id": "groove",
        "nameIs": "Dansgólfið",
        "feature": null,
        "startBeat": 64,
        "beats": 32,
        "record": "vamp"
      },
      {
        "id": "tuneA",
        "nameIs": "Lagið hennar",
        "feature": null,
        "startBeat": 96,
        "beats": 32,
        "record": "vamp"
      },
      {
        "id": "grazers",
        "nameIs": "Grasbítarnir",
        "feature": "grazers",
        "startBeat": 128,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "turtles",
        "nameIs": "Skjaldbökurnar",
        "feature": "turtles",
        "startBeat": 144,
        "beats": 16,
        "record": "fonk"
      },
      {
        "id": "frogs",
        "nameIs": "Froskarnir",
        "feature": "frogs",
        "startBeat": 160,
        "beats": 16,
        "record": "fonk"
      },
      {
        "id": "lizards",
        "nameIs": "Litlu eðlurnar",
        "feature": "lizards",
        "startBeat": 176,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "flyers",
        "nameIs": "Litlu flugdýrin",
        "feature": "flyers",
        "startBeat": 192,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "beetles",
        "nameIs": "Bjöllurnar",
        "feature": "beetles",
        "startBeat": 208,
        "beats": 16,
        "record": "slagverk"
      },
      {
        "id": "dragonflies",
        "nameIs": "Drekaflugurnar",
        "feature": "dragonflies",
        "startBeat": 224,
        "beats": 8,
        "record": "vamp"
      },
      {
        "id": "break",
        "nameIs": "Hornið hennar",
        "feature": "sloedla",
        "startBeat": 232,
        "beats": 32,
        "record": "rolegt"
      },
      {
        "id": "rise",
        "nameIs": "Upp með vængina",
        "feature": "flugedla",
        "startBeat": 264,
        "beats": 32,
        "record": "vamp"
      },
      {
        "id": "drop",
        "nameIs": "NÚ!",
        "feature": "all",
        "startBeat": 296,
        "beats": 8,
        "record": "vamp"
      },
      {
        "id": "rewind",
        "nameIs": "Aftur!",
        "feature": "flugedla",
        "startBeat": 304,
        "beats": 4,
        "record": "vamp"
      },
      {
        "id": "redrop",
        "nameIs": "Aftur!",
        "feature": "all",
        "startBeat": 308,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "anthem",
        "nameIs": "Öll saman",
        "feature": "all",
        "startBeat": 324,
        "beats": 32,
        "record": "vamp"
      },
      {
        "id": "freeze",
        "nameIs": "Stoppdans",
        "feature": "turtles",
        "startBeat": 356,
        "beats": 16,
        "record": "vamp"
      },
      {
        "id": "carnival",
        "nameIs": "Kjötkveðjuhátíð",
        "feature": "all",
        "startBeat": 372,
        "beats": 32,
        "record": "song3"
      },
      {
        "id": "crowd",
        "nameIs": "Egill, segðu já!",
        "feature": "flugedla",
        "startBeat": 404,
        "beats": 16,
        "record": "slagverk"
      },
      {
        "id": "fakeend",
        "nameIs": "Búið?",
        "feature": null,
        "startBeat": 420,
        "beats": 8,
        "record": "vamp"
      },
      {
        "id": "lastchorus",
        "nameIs": "Einu sinni enn",
        "feature": "all",
        "startBeat": 428,
        "beats": 32,
        "record": "vidlag"
      },
      {
        "id": "end",
        "nameIs": "Góða nótt",
        "feature": "all",
        "startBeat": 460,
        "beats": 16,
        "record": "vamp"
      }
    ],
    "lines": [
      {
        "id": "welcome",
        "beat": 16,
        "text": "Halló, skógur! Velkomin á hátíðina!"
      },
      {
        "id": "egill",
        "beat": 32,
        "text": "Egill! Ertu tilbúinn?"
      },
      {
        "id": "clap",
        "beat": 40,
        "text": "Klappið með!"
      },
      {
        "id": "party-on",
        "beat": 60.5,
        "text": "Nú byrjar djammið!"
      },
      {
        "id": "grazers",
        "beat": 128,
        "text": "Stóru grasbítarnir! Stappið!"
      },
      {
        "id": "turtles-slow",
        "beat": 144,
        "text": "Skjaldbökurnar... hææægt..."
      },
      {
        "id": "turtles-fast",
        "beat": 152,
        "text": "Og hratt!"
      },
      {
        "id": "frogs",
        "beat": 160,
        "text": "Já, froskadjamm!"
      },
      {
        "id": "lizards",
        "beat": 176,
        "text": "Litlu eðlurnar! Svo snöggar!"
      },
      {
        "id": "flyers",
        "beat": 192,
        "text": "Og hátt uppi... litlu flugdýrin!"
      },
      {
        "id": "beetles",
        "beat": 208,
        "text": "Bjöllur, smellið með!"
      },
      {
        "id": "dragonflies",
        "beat": 224,
        "text": "Og drekaflugurnar!"
      },
      {
        "id": "sloedla",
        "beat": 227.5,
        "text": "Og nú... Slóeðla!"
      },
      {
        "id": "wings",
        "beat": 264,
        "text": "Vængina upp! Hendur upp, Egill!"
      },
      {
        "id": "hear-you",
        "beat": 272,
        "text": "Látið heyra í ykkur!"
      },
      {
        "id": "count-5",
        "beat": 286,
        "text": "Fimm!"
      },
      {
        "id": "count-4",
        "beat": 288,
        "text": "Fjórir!"
      },
      {
        "id": "count-3",
        "beat": 290,
        "text": "Þrír!"
      },
      {
        "id": "count-2",
        "beat": 292,
        "text": "Tveir!"
      },
      {
        "id": "count-1",
        "beat": 294,
        "text": "Einn!"
      },
      {
        "id": "now",
        "beat": 296,
        "text": "Nú!"
      },
      {
        "id": "aftur",
        "beat": 306,
        "text": "Aftur!"
      },
      {
        "id": "laugh",
        "beat": 312,
        "text": "Ha ha! Jibbíí!"
      },
      {
        "id": "all",
        "beat": 321.5,
        "text": "Öll saman!"
      },
      {
        "id": "freeze-in",
        "beat": 356,
        "text": "Stoppdans! Allir dansa!"
      },
      {
        "id": "stopp",
        "beat": 362,
        "text": "Stopp!"
      },
      {
        "id": "turtle-moved",
        "beat": 364,
        "text": "Ha ha! Skjaldbakan hreyfði sig!"
      },
      {
        "id": "dansa",
        "beat": 371,
        "text": "Dansa!"
      },
      {
        "id": "allir-saman",
        "beat": 376,
        "text": "Allir saman! Jibbí!"
      },
      {
        "id": "hopp",
        "beat": 390,
        "text": "Hopp!"
      },
      {
        "id": "hopp-2",
        "beat": 398,
        "text": "Hopp!"
      },
      {
        "id": "egill-yes",
        "beat": 404,
        "text": "Egill, segðu já!"
      },
      {
        "id": "louder",
        "beat": 414,
        "text": "Hærra!"
      },
      {
        "id": "one-more",
        "beat": 424.5,
        "text": "Einu sinni enn!"
      },
      {
        "id": "goodnight",
        "beat": 465,
        "text": "Takk fyrir djammið! Góða nótt, skógur!"
      }
    ],
    "tune": [
      {
        "group": "lizards",
        "beat": 96
      },
      {
        "group": "frogs",
        "beat": 97.5
      },
      {
        "group": "turtles",
        "beat": 104
      },
      {
        "group": "frogs",
        "beat": 105.5
      },
      {
        "group": "grazers",
        "beat": 107
      },
      {
        "group": "flyers",
        "beat": 112
      },
      {
        "group": "lizards",
        "beat": 113.5
      },
      {
        "group": "frogs",
        "beat": 115
      },
      {
        "group": "lizards",
        "beat": 116
      },
      {
        "group": "flyers",
        "beat": 120
      },
      {
        "group": "lizards",
        "beat": 121.5
      },
      {
        "group": "frogs",
        "beat": 123
      },
      {
        "group": "turtles",
        "beat": 123.5
      },
      {
        "group": "grazers",
        "beat": 124
      },
      {
        "group": "lizards",
        "beat": 324
      },
      {
        "group": "frogs",
        "beat": 325.5
      },
      {
        "group": "turtles",
        "beat": 332
      },
      {
        "group": "frogs",
        "beat": 333.5
      },
      {
        "group": "grazers",
        "beat": 335
      },
      {
        "group": "flyers",
        "beat": 340
      },
      {
        "group": "lizards",
        "beat": 341.5
      },
      {
        "group": "frogs",
        "beat": 343
      },
      {
        "group": "lizards",
        "beat": 344
      },
      {
        "group": "flyers",
        "beat": 348
      },
      {
        "group": "lizards",
        "beat": 349.5
      },
      {
        "group": "frogs",
        "beat": 351
      },
      {
        "group": "turtles",
        "beat": 351.5
      },
      {
        "group": "grazers",
        "beat": 352
      },
      {
        "group": "lizards",
        "beat": 428
      },
      {
        "group": "frogs",
        "beat": 429.5
      },
      {
        "group": "turtles",
        "beat": 436
      },
      {
        "group": "frogs",
        "beat": 437.5
      },
      {
        "group": "grazers",
        "beat": 439
      },
      {
        "group": "flyers",
        "beat": 444
      },
      {
        "group": "lizards",
        "beat": 445.5
      },
      {
        "group": "frogs",
        "beat": 447
      },
      {
        "group": "lizards",
        "beat": 448
      },
      {
        "group": "flyers",
        "beat": 452
      },
      {
        "group": "lizards",
        "beat": 453.5
      },
      {
        "group": "frogs",
        "beat": 455
      },
      {
        "group": "turtles",
        "beat": 455.5
      },
      {
        "group": "grazers",
        "beat": 456
      }
    ],
    "cues": [
      {
        "beat": 2,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 4.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 6,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 7.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 9,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 10.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 11.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 13,
        "kind": "whoosh"
      },
      {
        "beat": 14,
        "kind": "wings"
      },
      {
        "beat": 14.75,
        "kind": "wings"
      },
      {
        "beat": 15.5,
        "kind": "wings"
      },
      {
        "beat": 16,
        "kind": "hit"
      },
      {
        "beat": 24,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 24,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 24,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 24,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 24,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 24,
        "kind": "crowd"
      },
      {
        "beat": 24,
        "kind": "roar"
      },
      {
        "beat": 32,
        "kind": "hit"
      },
      {
        "beat": 36.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 38,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 43,
        "kind": "clap"
      },
      {
        "beat": 43.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 45,
        "kind": "clap"
      },
      {
        "beat": 46,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 47,
        "kind": "clap"
      },
      {
        "beat": 47.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 48,
        "kind": "rise"
      },
      {
        "beat": 49,
        "kind": "clap"
      },
      {
        "beat": 50,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 51,
        "kind": "clap"
      },
      {
        "beat": 51.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 53,
        "kind": "clap"
      },
      {
        "beat": 53.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 55,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 55,
        "kind": "clap"
      },
      {
        "beat": 57,
        "kind": "clap"
      },
      {
        "beat": 57.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 59,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 59,
        "kind": "clap"
      },
      {
        "beat": 61,
        "kind": "clap"
      },
      {
        "beat": 64,
        "kind": "hit"
      },
      {
        "beat": 96,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 96,
        "kind": "hit"
      },
      {
        "beat": 97.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 104,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 105.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 107,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 112,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 113.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 115,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 116,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 120,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 121.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 123,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 123.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 124,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 128,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 128,
        "kind": "hit"
      },
      {
        "beat": 128,
        "kind": "wings"
      },
      {
        "beat": 129.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 130,
        "kind": "wings"
      },
      {
        "beat": 131,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 132,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 132,
        "kind": "wings"
      },
      {
        "beat": 133.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 134,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 134,
        "kind": "wings"
      },
      {
        "beat": 135,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 136,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 136,
        "kind": "wings"
      },
      {
        "beat": 137.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 138,
        "kind": "wings"
      },
      {
        "beat": 139,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 140,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 140,
        "kind": "wings"
      },
      {
        "beat": 141,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 142,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 142,
        "kind": "wings"
      },
      {
        "beat": 142.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 142.5,
        "kind": "scratch"
      },
      {
        "beat": 143,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 143,
        "kind": "scratch"
      },
      {
        "beat": 143.5,
        "kind": "scratch"
      },
      {
        "beat": 144,
        "kind": "hit"
      },
      {
        "beat": 144,
        "kind": "record",
        "from": "vamp",
        "to": "fonk",
        "how": "low-pass and scratch"
      },
      {
        "beat": 145,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 147,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 149,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 151,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 152,
        "kind": "hit"
      },
      {
        "beat": 152.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 152.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 153.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 153.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 154.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 154.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 155.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 155.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 156.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 156.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 157.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 157.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 158.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 158.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 159.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 159.75,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 160,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 160,
        "kind": "hit"
      },
      {
        "beat": 160.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 161.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 162.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 163,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 163.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 164,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 164.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 165.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 166.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 167,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 167.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 168,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 168.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 169.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 170.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 171,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 171.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 172,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 172.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 173.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 174,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 174.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 175,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 175.25,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 175.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 176,
        "kind": "hit"
      },
      {
        "beat": 176,
        "kind": "record",
        "from": "fonk",
        "to": "vamp",
        "how": "echo throw"
      },
      {
        "beat": 176.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 176.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 177,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 177.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 178.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 178.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 179,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 179.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 180.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 180.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 181,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 181.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 182.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 182.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 183,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 183.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 184.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 184.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 185,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 185.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 186.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 186.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 187,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 187.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 188.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 188.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 189,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 189.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 190,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 190.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 191,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 191.25,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 191.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 191.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 192,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 192,
        "kind": "hit"
      },
      {
        "beat": 194.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 196,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 198.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 200,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 202.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 204,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 205,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 206,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 207,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 207.25,
        "kind": "scratch"
      },
      {
        "beat": 208,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 208,
        "kind": "hit"
      },
      {
        "beat": 208,
        "kind": "record",
        "from": "vamp",
        "to": "slagverk",
        "how": "scratch"
      },
      {
        "beat": 208.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 209,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 209.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 210,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 210.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 211,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 211.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 212,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 212.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 213,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 213.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 214,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 214.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 215,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 215.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 216,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 216.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 217,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 217.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 218,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 218.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 219,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 219.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 220,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 220.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 221,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 221.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 222,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 222.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 223,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 223.5,
        "kind": "call",
        "group": "beetles"
      },
      {
        "beat": 224,
        "kind": "call",
        "group": "dragonflies"
      },
      {
        "beat": 224,
        "kind": "hit"
      },
      {
        "beat": 224,
        "kind": "record",
        "from": "slagverk",
        "to": "vamp",
        "how": "cut"
      },
      {
        "beat": 226,
        "kind": "call",
        "group": "dragonflies"
      },
      {
        "beat": 228,
        "kind": "call",
        "group": "dragonflies"
      },
      {
        "beat": 232,
        "kind": "hit"
      },
      {
        "beat": 232,
        "kind": "horn"
      },
      {
        "beat": 232,
        "kind": "record",
        "from": "vamp",
        "to": "rolegt",
        "how": "echo throw"
      },
      {
        "beat": 233.5,
        "kind": "horn"
      },
      {
        "beat": 240,
        "kind": "horn"
      },
      {
        "beat": 241.5,
        "kind": "horn"
      },
      {
        "beat": 243,
        "kind": "horn"
      },
      {
        "beat": 248,
        "kind": "horn"
      },
      {
        "beat": 249.5,
        "kind": "horn"
      },
      {
        "beat": 251,
        "kind": "horn"
      },
      {
        "beat": 252,
        "kind": "horn"
      },
      {
        "beat": 256,
        "kind": "horn"
      },
      {
        "beat": 257.5,
        "kind": "horn"
      },
      {
        "beat": 259,
        "kind": "horn"
      },
      {
        "beat": 259.5,
        "kind": "horn"
      },
      {
        "beat": 260,
        "kind": "horn"
      },
      {
        "beat": 264,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 264,
        "kind": "record",
        "from": "rolegt",
        "to": "vamp",
        "how": "reverse cymbal"
      },
      {
        "beat": 264,
        "kind": "reverse-cymbal"
      },
      {
        "beat": 264,
        "kind": "rise"
      },
      {
        "beat": 264,
        "kind": "wings"
      },
      {
        "beat": 265,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 266,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 266,
        "kind": "wings"
      },
      {
        "beat": 267,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 268,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 268,
        "kind": "wings"
      },
      {
        "beat": 269,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 270,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 270,
        "kind": "wings"
      },
      {
        "beat": 271,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 272,
        "kind": "wings"
      },
      {
        "beat": 273,
        "kind": "wings"
      },
      {
        "beat": 274,
        "kind": "wings"
      },
      {
        "beat": 275,
        "kind": "wings"
      },
      {
        "beat": 276,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 276,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 276,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 276,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 276,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 276,
        "kind": "crowd"
      },
      {
        "beat": 276,
        "kind": "roar"
      },
      {
        "beat": 276,
        "kind": "wings"
      },
      {
        "beat": 277,
        "kind": "wings"
      },
      {
        "beat": 278,
        "kind": "wings"
      },
      {
        "beat": 279,
        "kind": "wings"
      },
      {
        "beat": 280,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 280,
        "kind": "wings"
      },
      {
        "beat": 280.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 280.5,
        "kind": "wings"
      },
      {
        "beat": 281,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 281,
        "kind": "wings"
      },
      {
        "beat": 281.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 281.5,
        "kind": "wings"
      },
      {
        "beat": 282,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 282,
        "kind": "wings"
      },
      {
        "beat": 282.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 282.5,
        "kind": "wings"
      },
      {
        "beat": 283,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 283,
        "kind": "wings"
      },
      {
        "beat": 283.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 283.5,
        "kind": "wings"
      },
      {
        "beat": 284,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 284,
        "kind": "wings"
      },
      {
        "beat": 284.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 284.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 284.5,
        "kind": "wings"
      },
      {
        "beat": 284.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 285,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 285,
        "kind": "wings"
      },
      {
        "beat": 285.25,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 285.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 285.5,
        "kind": "wings"
      },
      {
        "beat": 285.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 286,
        "kind": "count",
        "n": 5
      },
      {
        "beat": 286,
        "kind": "wings"
      },
      {
        "beat": 286.5,
        "kind": "wings"
      },
      {
        "beat": 287,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 287,
        "kind": "wings"
      },
      {
        "beat": 287.5,
        "kind": "wings"
      },
      {
        "beat": 288,
        "kind": "count",
        "n": 4
      },
      {
        "beat": 288,
        "kind": "wings"
      },
      {
        "beat": 288.25,
        "kind": "wings"
      },
      {
        "beat": 288.5,
        "kind": "wings"
      },
      {
        "beat": 288.75,
        "kind": "wings"
      },
      {
        "beat": 289,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 289,
        "kind": "wings"
      },
      {
        "beat": 289.25,
        "kind": "wings"
      },
      {
        "beat": 289.5,
        "kind": "wings"
      },
      {
        "beat": 289.75,
        "kind": "wings"
      },
      {
        "beat": 290,
        "kind": "count",
        "n": 3
      },
      {
        "beat": 290,
        "kind": "wings"
      },
      {
        "beat": 290.25,
        "kind": "wings"
      },
      {
        "beat": 290.5,
        "kind": "wings"
      },
      {
        "beat": 290.75,
        "kind": "wings"
      },
      {
        "beat": 291,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 291,
        "kind": "wings"
      },
      {
        "beat": 291.25,
        "kind": "wings"
      },
      {
        "beat": 291.5,
        "kind": "wings"
      },
      {
        "beat": 291.75,
        "kind": "wings"
      },
      {
        "beat": 292,
        "kind": "count",
        "n": 2
      },
      {
        "beat": 292,
        "kind": "wings"
      },
      {
        "beat": 292.25,
        "kind": "wings"
      },
      {
        "beat": 292.5,
        "kind": "wings"
      },
      {
        "beat": 292.75,
        "kind": "wings"
      },
      {
        "beat": 293,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 293,
        "kind": "wings"
      },
      {
        "beat": 293.25,
        "kind": "wings"
      },
      {
        "beat": 293.5,
        "kind": "wings"
      },
      {
        "beat": 293.75,
        "kind": "wings"
      },
      {
        "beat": 294,
        "kind": "count",
        "n": 1
      },
      {
        "beat": 294,
        "kind": "wings"
      },
      {
        "beat": 294.25,
        "kind": "wings"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 296,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 296,
        "kind": "impact"
      },
      {
        "beat": 296,
        "kind": "peak"
      },
      {
        "beat": 296,
        "kind": "roar"
      },
      {
        "beat": 296,
        "kind": "sub"
      },
      {
        "beat": 296.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 296.5,
        "kind": "crowd"
      },
      {
        "beat": 296.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 296.8,
        "kind": "crowd"
      },
      {
        "beat": 297.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 297.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 298.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 298.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 298.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 298.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 299,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 299,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 299,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 299.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 299.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 299.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 300,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 300.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 300.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 301.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 301.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 302,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 302,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 302.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 302.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 302.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 302.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 303,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 303,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 303,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 303.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 303.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 303.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 304,
        "kind": "rewind"
      },
      {
        "beat": 304,
        "kind": "vinylRewind"
      },
      {
        "beat": 308,
        "kind": "airhorn"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 308,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 308,
        "kind": "crowd"
      },
      {
        "beat": 308,
        "kind": "impact"
      },
      {
        "beat": 308,
        "kind": "peak"
      },
      {
        "beat": 308,
        "kind": "reverse-cymbal"
      },
      {
        "beat": 308,
        "kind": "roar"
      },
      {
        "beat": 308,
        "kind": "sub"
      },
      {
        "beat": 308.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 308.5,
        "kind": "crowd"
      },
      {
        "beat": 308.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 309.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 309.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 310.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 310.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 310.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 310.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 311,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 311,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 311,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 311.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 311.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 311.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 312,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 312.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 312.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 313.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 313.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 314,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 314,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 314.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 314.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 314.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 314.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 315,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 315,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 315,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 315.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 315.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 315.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 316,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 316.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 316.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 317.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 317.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 318.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 318.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 318.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 318.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 319,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 319,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 319,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 319.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 319.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 319.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 320,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 320.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 320.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 321.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 321.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 322,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 322,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 322.5,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 322.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 322.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 322.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 322.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 323,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 323,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 323,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 323.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 323.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 324,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 324,
        "kind": "peak"
      },
      {
        "beat": 325.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 328,
        "kind": "horn"
      },
      {
        "beat": 329.5,
        "kind": "horn"
      },
      {
        "beat": 332,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 333.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 335,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 336,
        "kind": "horn"
      },
      {
        "beat": 337.5,
        "kind": "horn"
      },
      {
        "beat": 339,
        "kind": "horn"
      },
      {
        "beat": 340,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 340,
        "kind": "horn"
      },
      {
        "beat": 341.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 341.5,
        "kind": "horn"
      },
      {
        "beat": 343,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 343,
        "kind": "horn"
      },
      {
        "beat": 344,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 344,
        "kind": "horn"
      },
      {
        "beat": 348,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 348,
        "kind": "horn"
      },
      {
        "beat": 349.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 349.5,
        "kind": "horn"
      },
      {
        "beat": 351,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 351,
        "kind": "horn"
      },
      {
        "beat": 351.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 351.5,
        "kind": "horn"
      },
      {
        "beat": 352,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 352,
        "kind": "horn"
      },
      {
        "beat": 356,
        "kind": "hit"
      },
      {
        "beat": 356.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 357.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 358.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 358.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 358.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 359,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 359,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 359.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 359.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 360.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 361.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 362,
        "kind": "freeze"
      },
      {
        "beat": 362.9,
        "kind": "needle"
      },
      {
        "beat": 363.25,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 363.25,
        "kind": "moved",
        "group": "turtles"
      },
      {
        "beat": 369.6,
        "kind": "crowd"
      },
      {
        "beat": 372,
        "kind": "airhorn"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 372,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 372,
        "kind": "crowd"
      },
      {
        "beat": 372,
        "kind": "impact"
      },
      {
        "beat": 372,
        "kind": "record",
        "from": "vamp",
        "to": "song3",
        "how": "freeze, then slam"
      },
      {
        "beat": 372,
        "kind": "roar"
      },
      {
        "beat": 372,
        "kind": "sub"
      },
      {
        "beat": 372,
        "kind": "unfreeze"
      },
      {
        "beat": 372.3,
        "kind": "crowd"
      },
      {
        "beat": 372.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 372.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 373,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 373.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 374.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 374.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 375,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 375.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 376,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 376.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 377,
        "kind": "clap"
      },
      {
        "beat": 377.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 378.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 379,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 379,
        "kind": "clap"
      },
      {
        "beat": 379.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 380,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 380,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 380,
        "kind": "crowd"
      },
      {
        "beat": 380.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 380.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 381,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 381,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 381,
        "kind": "clap"
      },
      {
        "beat": 381.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 381.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 382.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 382.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 383,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 383,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 383,
        "kind": "clap"
      },
      {
        "beat": 383.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 384,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 384,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 384.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 385,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 385,
        "kind": "clap"
      },
      {
        "beat": 385.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 385.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 386.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 387,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 387,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 387,
        "kind": "clap"
      },
      {
        "beat": 387.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 388,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 388,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 388.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 388.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 389,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 389,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 389,
        "kind": "clap"
      },
      {
        "beat": 389.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 389.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 390.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 390.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 391,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 391,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 391,
        "kind": "clap"
      },
      {
        "beat": 391.5,
        "kind": "crowd"
      },
      {
        "beat": 391.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 392,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 392,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 392.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 393,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 393,
        "kind": "clap"
      },
      {
        "beat": 393.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 393.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 394.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 395,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 395,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 395,
        "kind": "clap"
      },
      {
        "beat": 395.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 396,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 396,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 396.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 396.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 397,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 397,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 397,
        "kind": "clap"
      },
      {
        "beat": 397.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 397.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 398.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 398.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 399,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 399,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 399,
        "kind": "clap"
      },
      {
        "beat": 399,
        "kind": "crowd"
      },
      {
        "beat": 399.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 400,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 400,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 400.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 401,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 401,
        "kind": "clap"
      },
      {
        "beat": 401.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 401.5,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 402.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 403,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 403,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 403.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 404,
        "kind": "hit"
      },
      {
        "beat": 404,
        "kind": "record",
        "from": "song3",
        "to": "slagverk",
        "how": "low-pass"
      },
      {
        "beat": 407.5,
        "kind": "egill-turn"
      },
      {
        "beat": 412,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 412,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 412,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 412,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 412,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 412,
        "kind": "crowd"
      },
      {
        "beat": 412,
        "kind": "roar"
      },
      {
        "beat": 412.2,
        "kind": "crowd"
      },
      {
        "beat": 415.7,
        "kind": "crowd"
      },
      {
        "beat": 416,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 416,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 416,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 416,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 416,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 416,
        "kind": "crowd"
      },
      {
        "beat": 416,
        "kind": "roar"
      },
      {
        "beat": 420,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 420,
        "kind": "end-fake"
      },
      {
        "beat": 420,
        "kind": "record",
        "from": "slagverk",
        "to": "vamp",
        "how": "last hit"
      },
      {
        "beat": 420.2,
        "kind": "crowd"
      },
      {
        "beat": 428,
        "kind": "airhorn"
      },
      {
        "beat": 428,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 428,
        "kind": "crowd"
      },
      {
        "beat": 428,
        "kind": "impact"
      },
      {
        "beat": 428,
        "kind": "peak"
      },
      {
        "beat": 428,
        "kind": "record",
        "from": "vamp",
        "to": "vidlag",
        "how": "drum fill"
      },
      {
        "beat": 428,
        "kind": "reverse-cymbal"
      },
      {
        "beat": 428,
        "kind": "sub"
      },
      {
        "beat": 428.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 428.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 428.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 429,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 429.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 429.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 429.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 430.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 430.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 430.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 431,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 431.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 431.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 432.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 432.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 433.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 433.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 434,
        "kind": "horn"
      },
      {
        "beat": 434.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 434.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 434.5,
        "kind": "horn"
      },
      {
        "beat": 435,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 435,
        "kind": "horn"
      },
      {
        "beat": 435.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 435.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 436,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 436.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 436.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 436.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 437,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 437.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 437.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 437.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 438.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 438.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 438.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 439,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 439,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 439.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 439.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 440.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 440.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 441.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 441.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 442,
        "kind": "horn"
      },
      {
        "beat": 442.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 442.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 442.5,
        "kind": "horn"
      },
      {
        "beat": 443,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 443,
        "kind": "horn"
      },
      {
        "beat": 443.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 443.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 444,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 444.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 444.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 444.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 445,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 445.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 445.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 446.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 446.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 446.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 447,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 447,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 447.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 448,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 448.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 448.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 449.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 449.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 450,
        "kind": "horn"
      },
      {
        "beat": 450.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 450.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 450.5,
        "kind": "horn"
      },
      {
        "beat": 451,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 451,
        "kind": "horn"
      },
      {
        "beat": 451.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 451.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 452,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 452.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 452.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 452.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 453,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 453.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 453.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 454.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 454.5,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 454.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 455,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 455,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 455.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 455.75,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 456,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 456,
        "kind": "horn"
      },
      {
        "beat": 456.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 456.75,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 457.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 457.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 458.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 458.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 459,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 459.5,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 459.5,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 460,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 460,
        "kind": "hit"
      },
      {
        "beat": 460,
        "kind": "horn"
      },
      {
        "beat": 460,
        "kind": "wings"
      },
      {
        "beat": 461,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 461,
        "kind": "horn"
      },
      {
        "beat": 461,
        "kind": "wings"
      },
      {
        "beat": 462,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 462,
        "kind": "horn"
      },
      {
        "beat": 462,
        "kind": "wings"
      },
      {
        "beat": 463,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 463,
        "kind": "horn"
      },
      {
        "beat": 463,
        "kind": "wings"
      },
      {
        "beat": 464,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 464,
        "kind": "call",
        "group": "turtles"
      },
      {
        "beat": 464,
        "kind": "call",
        "group": "frogs"
      },
      {
        "beat": 464,
        "kind": "call",
        "group": "lizards"
      },
      {
        "beat": 464,
        "kind": "call",
        "group": "flyers"
      },
      {
        "beat": 464,
        "kind": "horn"
      },
      {
        "beat": 472,
        "kind": "call",
        "group": "grazers"
      },
      {
        "beat": 472,
        "kind": "end"
      },
      {
        "beat": 472,
        "kind": "wings"
      },
      {
        "beat": 472.3,
        "kind": "crowd"
      },
      {
        "beat": 473,
        "kind": "wings"
      },
      {
        "beat": 473.5,
        "kind": "whoosh"
      }
    ]
  }
};
