// Stjörnuhátíðin's song as the party reads it: assets/audio/hatid/song/song.json as a module (read it through hatid-score.js).
// Written by tools/hatid-song.mjs: do not edit it by hand.
export const SONG = {
  "about": "Stjörnuhátíðin's song (tools/hatid-song.mjs): the owner's pick H of 2026-11-24, composed by ElevenLabs Music from a description of the scene, arranged from its own stems and mixed for small speakers by tools/hatid-lag/render.mjs. Beats are counted from the first bar line (beatOffset seconds into the file); the tempo is fixed: beat b is at beatOffset + b * 60 / bpm. Read it through chapters/hatid-score.js.",
  "name": "Stjörnuhátíðin",
  "bpm": 84.002,
  "beatOffset": 1.8168,
  "beatsPerBar": 4,
  "danceBeats": 2,
  "driftMs": 10.9,
  "key": [
    587.62,
    659.58,
    740.35,
    880.43,
    988.25
  ],
  "keyName": {
    "root": "D",
    "mode": "major"
  },
  "tuningCents": 0.8,
  "motif": [
    293.78,
    329.76,
    370.14,
    440.18,
    494.08,
    587.57
  ],
  "song": {
    "src": "hatid.mp3",
    "seconds": 265.753,
    "endBeat": 364,
    "tail": 3.942,
    "loudness": {
      "lufs": -16,
      "truePeak": -1.6,
      "lra": 9.8,
      "sections": {
        "intro": -19.49,
        "dance": -16.03,
        "solos": -16.6,
        "quiet": -20.64,
        "chorus": -13.44,
        "chord": -25.74
      },
      "bars": [
        -22.5,
        -23.2,
        -22.3,
        -23.1,
        -22.2,
        -23.5,
        -22.4,
        -20,
        -18.3,
        -19,
        -18.4,
        -18.1,
        -18,
        -18.2,
        -17.4,
        -18,
        -18.5,
        -17.6,
        -15.5,
        -15.8,
        -15.6,
        -15.5,
        -15.2,
        -16,
        -15.7,
        -15.8,
        -17.8,
        -15.8,
        -16.9,
        -16.3,
        -16.6,
        -16.1,
        -16.3,
        -16.3,
        -18,
        -17.1,
        -17.8,
        -16.6,
        -16.9,
        -16.3,
        -16.7,
        -17,
        -16.6,
        -15.8,
        -16.2,
        -16,
        -15.5,
        -15.9,
        -16.3,
        -17,
        -16.9,
        -17.2,
        -19.5,
        -21.7,
        -20.1,
        -22.2,
        -19.6,
        -19.8,
        -19.1,
        -22.1,
        -30.5,
        -41,
        -28.7,
        -13,
        -13.6,
        -13.2,
        -13.8,
        -13,
        -13.5,
        -13.4,
        -13.9,
        -12.8,
        -12.6,
        -12.7,
        -13.3,
        -12.7,
        -12.6,
        -12.8,
        -13.2,
        -13,
        -13.3,
        -13.1,
        -13.3,
        -15.3,
        -15.6,
        -15.2,
        -15.9,
        -22.1,
        -26,
        -34.6,
        -34
      ],
      "lastSecondDb": -79.8
    },
    "sections": [
      {
        "id": "intro",
        "nameIs": "Inngangur",
        "startBeat": 0,
        "beats": 72
      },
      {
        "id": "dance",
        "nameIs": "Fyrsti dans",
        "startBeat": 72,
        "beats": 64
      },
      {
        "id": "solos",
        "nameIs": "Sólóin",
        "startBeat": 136,
        "beats": 72
      },
      {
        "id": "quiet",
        "nameIs": "Kyrra stundin",
        "startBeat": 208,
        "beats": 44
      },
      {
        "id": "chorus",
        "nameIs": "Síðasta viðlagið",
        "startBeat": 252,
        "beats": 96
      },
      {
        "id": "chord",
        "nameIs": "Lokahljómur",
        "startBeat": 348,
        "beats": 16
      }
    ],
    "entries": [
      {
        "who": "sloedla",
        "sound": "horn",
        "beat": 0
      },
      {
        "who": "gramedla",
        "sound": "stomp",
        "beat": 28
      },
      {
        "who": "kambedla",
        "sound": "plates",
        "beat": 36
      },
      {
        "who": "uggedla",
        "sound": "tail",
        "beat": 44
      },
      {
        "who": "thorsedla",
        "sound": "deep tone",
        "beat": 52
      },
      {
        "who": "flugedla",
        "sound": "scratches",
        "beat": 60
      },
      {
        "who": "choir",
        "sound": "choir",
        "beat": 72
      }
    ],
    "solos": [
      {
        "who": "kambedla",
        "startBeat": 136,
        "beats": 12
      },
      {
        "who": "uggedla",
        "startBeat": 148,
        "beats": 12
      },
      {
        "who": "thorsedla",
        "startBeat": 160,
        "beats": 12
      },
      {
        "who": "flugedla",
        "startBeat": 172,
        "beats": 12
      },
      {
        "who": "sloedla",
        "startBeat": 184,
        "beats": 12
      },
      {
        "who": "gramedla",
        "startBeat": 196,
        "beats": 12
      }
    ],
    "calls": [
      {
        "move": "up",
        "section": "dance",
        "beat": 72,
        "beats": 4,
        "doBeat": 76
      },
      {
        "move": "stomp",
        "section": "dance",
        "beat": 88,
        "beats": 4,
        "doBeat": 92
      },
      {
        "move": "spin",
        "section": "dance",
        "beat": 104,
        "beats": 4,
        "doBeat": 108
      },
      {
        "move": "hop",
        "section": "dance",
        "beat": 120,
        "beats": 4,
        "doBeat": 124
      },
      {
        "move": "up",
        "section": "chorus",
        "beat": 252,
        "beats": 4,
        "doBeat": 256
      },
      {
        "move": "stomp",
        "section": "chorus",
        "beat": 276,
        "beats": 4,
        "doBeat": 280
      },
      {
        "move": "spin",
        "section": "chorus",
        "beat": 300,
        "beats": 4,
        "doBeat": 304
      },
      {
        "move": "hop",
        "section": "chorus",
        "beat": 324,
        "beats": 4,
        "doBeat": 328
      }
    ],
    "cues": [
      {
        "beat": 0,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 23,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 28,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 30,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 32,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 34,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 36,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 36,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 37,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 38,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 40,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 41,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 42,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 44,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 44,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 45,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 46,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 47,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 47,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 48,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 49,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 50,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 52,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 53,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 54,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 55,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 56,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 57,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 58,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 60,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 60,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 61,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 62,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 63,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 64,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 65,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 66,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 67,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 68,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 69,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 70,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 71,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 72,
        "kind": "hit"
      },
      {
        "beat": 72,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 73,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 74,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 75,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 76,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 77,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 78,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 79,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 80,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 81,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 82,
        "kind": "hit"
      },
      {
        "beat": 82,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 83,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 84,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 85,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 86,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 87,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 88,
        "kind": "hit"
      },
      {
        "beat": 88,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 89,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 90,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 91,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 92,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 93,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 94,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 95,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 96,
        "kind": "hit"
      },
      {
        "beat": 96,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 97,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 98,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 99,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 100,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 101,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 102,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 103,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 104,
        "kind": "hit"
      },
      {
        "beat": 104,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 105,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 106,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 107,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 108,
        "kind": "hit"
      },
      {
        "beat": 108,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 109,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 110,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 111,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 112,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 113,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 114,
        "kind": "hit"
      },
      {
        "beat": 114,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 115,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 116,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 117,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 118,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 119,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 120,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 121,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 122,
        "kind": "hit"
      },
      {
        "beat": 122,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 123,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 124,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 125,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 126,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 127,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 128,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 129,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 130,
        "kind": "hit"
      },
      {
        "beat": 130,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 131,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 132,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 133,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 134,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 135,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 136,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 137,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 138,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 139,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 140,
        "kind": "hit"
      },
      {
        "beat": 140,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 141,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 142,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 143,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 144,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 145,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 146,
        "kind": "hit"
      },
      {
        "beat": 146,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 147,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 148,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 150,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 152,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 154,
        "kind": "hit"
      },
      {
        "beat": 154,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 156,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 158,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 162,
        "kind": "hit"
      },
      {
        "beat": 170,
        "kind": "hit"
      },
      {
        "beat": 172,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 173,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 174,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 175,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 176,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 177,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 178,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 179,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 180,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 181,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 182,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 183,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 184,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 190,
        "kind": "hit"
      },
      {
        "beat": 196,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 197,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 198,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 199,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 200,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 201,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 202,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 203,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 204,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 205,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 206,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 207,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 217,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 252,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 252,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 253,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 254,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 255,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 256,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 257,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 258,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 259,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 260,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 261,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 262,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 263,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 264,
        "kind": "burst"
      },
      {
        "beat": 264,
        "kind": "roar",
        "who": "gramedla"
      },
      {
        "beat": 264,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 265,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 266,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 267,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 268,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 269,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 270,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 271,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 272,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 273,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 274,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 275,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 276,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 277,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 278,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 279,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 280,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 281,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 282,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 283,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 284,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 285,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 286,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 287,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 288,
        "kind": "burst"
      },
      {
        "beat": 288,
        "kind": "roar",
        "who": "gramedla"
      },
      {
        "beat": 288,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 289,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 290,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 291,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 292,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 293,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 294,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 295,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 296,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 297,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 298,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 299,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 300,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 301,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 302,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 303,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 304,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 305,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 306,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 307,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 308,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 309,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 310,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 311,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 312,
        "kind": "burst"
      },
      {
        "beat": 312,
        "kind": "roar",
        "who": "gramedla"
      },
      {
        "beat": 312,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 313,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 314,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 315,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 316,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 317,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 318,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 319,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 320,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 321,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 322,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 323,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 324,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 325,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 326,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 327,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 328,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 329,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 330,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 331,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 332,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 333,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 334,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 335,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 336,
        "kind": "burst"
      },
      {
        "beat": 336,
        "kind": "roar",
        "who": "gramedla"
      },
      {
        "beat": 336,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 337,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 338,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 339,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 340,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 341,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 342,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 343,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 344,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 345,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 346,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 347,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 350,
        "kind": "hit"
      },
      {
        "beat": 361,
        "kind": "horn",
        "who": "sloedla"
      }
    ]
  },
  "seventh": {
    "src": "../seventh.mp3",
    "pick": "a",
    "notes": [
      932.33,
      1396.91,
      1046.5,
      1661.22
    ],
    "seconds": 5.25
  }
};
