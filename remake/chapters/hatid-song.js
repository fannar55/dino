// Stjörnuhátíðin's song as the party reads it: assets/audio/hatid/song/song.json as a module (read it through hatid-score.js).
// Written by tools/hatid-song.mjs: do not edit it by hand.
export const SONG = {
  "about": "Stjörnuhátíðin's song (tools/hatid-song.mjs): the owner's pick H of 2026-11-24, composed by ElevenLabs Music from a description of the scene, arranged from its own stems and mixed for small speakers by tools/hatid-lag/render.mjs. Beats are counted from the first bar line (beatOffset seconds into the file); the tempo is fixed: beat b is at beatOffset + b * 60 / bpm. Read it through chapters/hatid-score.js.",
  "name": "Stjörnuhátíðin",
  "bpm": 84.002,
  "beatOffset": 1.8168,
  "beatsPerBar": 4,
  "danceBeats": 2,
  "driftMs": 10.1,
  "key": [
    587.63,
    659.59,
    740.37,
    880.45,
    988.27
  ],
  "keyName": {
    "root": "D",
    "mode": "major"
  },
  "tuningCents": 0.9,
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
    "seconds": 240.039,
    "endBeat": 328,
    "tail": 3.942,
    "loudness": {
      "lufs": -16,
      "truePeak": -1.8,
      "lra": 10.3,
      "sections": {
        "intro": -18.52,
        "dance": -16.09,
        "solos": -17.26,
        "quiet": -20.94,
        "chorus": -13.66,
        "chord": -24.77
      },
      "bars": [
        -22.9,
        -23.7,
        -22.7,
        -23.7,
        -22.1,
        -23.1,
        -22,
        -18.6,
        -16.5,
        -17.6,
        -16.9,
        -17.1,
        -16.2,
        -17.1,
        -16.3,
        -17.2,
        -17.6,
        -17.2,
        -18.2,
        -15.7,
        -15.4,
        -15.6,
        -17.9,
        -15.7,
        -15.7,
        -15.7,
        -17.9,
        -15.2,
        -16.1,
        -15.6,
        -17.8,
        -15.4,
        -15.7,
        -15.7,
        -18.2,
        -17.2,
        -17.9,
        -16.7,
        -17.3,
        -16.2,
        -17.7,
        -17.5,
        -17,
        -19.7,
        -21.6,
        -20.2,
        -22,
        -20,
        -20.1,
        -20,
        -23,
        -31.5,
        -41.4,
        -28.7,
        -15.4,
        -13.4,
        -13.3,
        -13.6,
        -13.2,
        -13.4,
        -16.4,
        -13.9,
        -12.7,
        -12.4,
        -12.4,
        -12.9,
        -15.8,
        -12.4,
        -12.5,
        -12.7,
        -12.8,
        -13.2,
        -15.7,
        -13.1,
        -15.3,
        -15.1,
        -14.8,
        -15.6,
        -21,
        -25.2,
        -34.1,
        -32.1
      ],
      "lastSecondDb": -79.5
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
        "beats": 36
      },
      {
        "id": "quiet",
        "nameIs": "Kyrra stundin",
        "startBeat": 172,
        "beats": 44
      },
      {
        "id": "chorus",
        "nameIs": "Síðasta viðlagið",
        "startBeat": 216,
        "beats": 96
      },
      {
        "id": "chord",
        "nameIs": "Lokahljómur",
        "startBeat": 312,
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
        "beat": 76
      }
    ],
    "solos": [
      {
        "who": "kambedla",
        "startBeat": 136,
        "beats": 6
      },
      {
        "who": "uggedla",
        "startBeat": 142,
        "beats": 6
      },
      {
        "who": "thorsedla",
        "startBeat": 148,
        "beats": 6
      },
      {
        "who": "flugedla",
        "startBeat": 154,
        "beats": 6
      },
      {
        "who": "sloedla",
        "startBeat": 160,
        "beats": 6
      },
      {
        "who": "gramedla",
        "startBeat": 166,
        "beats": 6
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
        "beat": 216,
        "beats": 4,
        "doBeat": 220
      },
      {
        "move": "stomp",
        "section": "chorus",
        "beat": 240,
        "beats": 4,
        "doBeat": 244
      },
      {
        "move": "spin",
        "section": "chorus",
        "beat": 264,
        "beats": 4,
        "doBeat": 268
      },
      {
        "move": "hop",
        "section": "chorus",
        "beat": 288,
        "beats": 4,
        "doBeat": 292
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
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 144,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 146,
        "kind": "hit"
      },
      {
        "beat": 146,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 154,
        "kind": "hit"
      },
      {
        "beat": 154,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 155,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 156,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 157,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 158,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 159,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 166,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 167,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 168,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 169,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 170,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 171,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 181,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 216,
        "kind": "horn",
        "who": "sloedla"
      },
      {
        "beat": 216,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 217,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 218,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 219,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 220,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 221,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 222,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 223,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 224,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 225,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 226,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 227,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 228,
        "kind": "burst"
      },
      {
        "beat": 228,
        "kind": "roar",
        "who": "gramedla"
      },
      {
        "beat": 228,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 229,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 230,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 231,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 232,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 233,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 234,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 235,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 236,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 237,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 238,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 239,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 240,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 241,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 242,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 243,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 244,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 245,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 246,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 247,
        "kind": "tail",
        "who": "uggedla"
      },
      {
        "beat": 248,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 249,
        "kind": "plate",
        "who": "kambedla"
      },
      {
        "beat": 250,
        "kind": "stomp",
        "who": "gramedla"
      },
      {
        "beat": 251,
        "kind": "scratch",
        "who": "flugedla"
      },
      {
        "beat": 252,
        "kind": "burst"
      },
      {
        "beat": 252,
        "kind": "roar",
        "who": "gramedla"
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
        "kind": "burst"
      },
      {
        "beat": 276,
        "kind": "roar",
        "who": "gramedla"
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
        "kind": "burst"
      },
      {
        "beat": 300,
        "kind": "roar",
        "who": "gramedla"
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
        "beat": 314,
        "kind": "hit"
      },
      {
        "beat": 325,
        "kind": "horn",
        "who": "sloedla"
      }
    ]
  }
};
