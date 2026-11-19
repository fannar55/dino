# Where the song's sources are

The files chapter 5's song is made from are not in git and not in the game: they are in the Cloudflare R2 bucket `mosi-geymsla` (bound to
no Worker, so nothing in it is served), put there by `node cloud/upload-sources.mjs`. A new render needs them back where they were:

```
npx wrangler r2 object get mosi-geymsla/<key> --file <path> --remote
```

- `kafli5-djamm/records/<folder>/...` goes to `remake/assets/audio/sloedla/v2/<folder>/...` (the ElevenLabs Music tracks and their stems)
- `kafli5-djamm/sounds/...` goes to `qa/remake/kafli5/lag/djamm/1/sounds/...` (the fetched sounds, with their sources.json)
- `kafli5-djamm/render/...` goes to `qa/remake/kafli5/lag/djamm/1/...` (the set as rendered, which `node remake/tools/kafli5-song.mjs` carries into the game)

64 files, 76.1 MB.

| Key | Bytes | md5 |
|---|---|---|
| `kafli5-djamm/records/djamm-fonk/song.json` | 15014 | `b96a3c8cec4797635f9830bd270937cf` |
| `kafli5-djamm/records/djamm-fonk/song.mp3` | 737741 | `9876beda4bbe4672536025d3e9f0ce69` |
| `kafli5-djamm/records/djamm-rolegt/song.json` | 14744 | `51fcafd805adc3ced7499ff530704000` |
| `kafli5-djamm/records/djamm-rolegt/song.mp3` | 737741 | `e7d19481ab3c8d683c106470cc45dcbb` |
| `kafli5-djamm/records/djamm-slagverk/song.json` | 15206 | `bf918323e9dfea2653b09a30008ddb14` |
| `kafli5-djamm/records/djamm-slagverk/song.mp3` | 737741 | `317c6647d1fdb4cd84daa147fbe91904` |
| `kafli5-djamm/records/djamm-vidlag/song.json` | 15164 | `dafb4580aa6ab0408e9e18d3be3b5002` |
| `kafli5-djamm/records/djamm-vidlag/song.mp3` | 737741 | `0c984f7028acf09e463b2f74d5117141` |
| `kafli5-djamm/records/djamm/bass.mp3` | 3073714 | `26d5a92feaf67903c6b63760859b0b95` |
| `kafli5-djamm/records/djamm/drums.mp3` | 3073714 | `17e715c7e8b2269f3c10d05085d24522` |
| `kafli5-djamm/records/djamm/guitar.mp3` | 3073714 | `33b197679b2ff94e45f418011640ff94` |
| `kafli5-djamm/records/djamm/other.mp3` | 3073714 | `95f7a18b38305ce7e622a2be0cd83b93` |
| `kafli5-djamm/records/djamm/piano.mp3` | 3073714 | `8a3ba241c5f2fa50fb53bdbecec6b587` |
| `kafli5-djamm/records/djamm/song-2.json` | 65970 | `6869f81b892cfa807236980d8cf4349d` |
| `kafli5-djamm/records/djamm/song-2.mp3` | 3072461 | `6ec37f6b1f4d779a7fae927eae34b640` |
| `kafli5-djamm/records/djamm/song-3.json` | 67931 | `4c5e311eb1866d314ceaf2ca710ac045` |
| `kafli5-djamm/records/djamm/song-3.mp3` | 3072461 | `25fc4f46dccab019d9b8e1f5b0c5a76b` |
| `kafli5-djamm/records/djamm/song.json` | 69599 | `f24e0f8dd3329974fa5eaefe1d72505b` |
| `kafli5-djamm/records/djamm/song.mp3` | 3072461 | `c6aed03dae3c06d44ded8c30757fca1d` |
| `kafli5-djamm/records/djamm/vocals.mp3` | 3073714 | `defa0ee3f975c875dda8ebacbf52dc44` |
| `kafli5-djamm/render/checks.json` | 128835 | `4df89a116bb3f2243d178a8877be538f` |
| `kafli5-djamm/render/mix.mp3` | 5520865 | `395eda42f950e6f773e33a8e966f4153` |
| `kafli5-djamm/render/song.json` | 93156 | `c2031eda0d7931bddb12b0b865a92b3d` |
| `kafli5-djamm/render/stems/animals.mp3` | 5520865 | `053ef7d22664cd3c9dc4467ecb87671a` |
| `kafli5-djamm/render/stems/bass.mp3` | 5520865 | `951e9db6b4800ac22189aa5c66997bd1` |
| `kafli5-djamm/render/stems/dj.mp3` | 5520865 | `fd636f6579f31e92efd307001dfee75b` |
| `kafli5-djamm/render/stems/drums.mp3` | 5520865 | `4cf3fa10377a641d704ac1d6948a6695` |
| `kafli5-djamm/render/stems/fx.mp3` | 5520865 | `8c99e7570672c8052666bb2d18f26831` |
| `kafli5-djamm/render/stems/horn.mp3` | 5520865 | `a04ce5ffef788789c96c05a1d4abe96e` |
| `kafli5-djamm/render/stems/music.mp3` | 5520865 | `98ce4b2b92d9927c312a3cb1fd298c5c` |
| `kafli5-djamm/sounds/eleven/kids-cheer-big.mp3` | 97009 | `d3eb9e2f1d80b75753cf756f70abe89c` |
| `kafli5-djamm/sounds/eleven/kids-laugh.mp3` | 48944 | `5a29a95e0f36c2534f0de1eaa11ea0da` |
| `kafli5-djamm/sounds/eleven/kids-yay.mp3` | 48944 | `77e84e20b77f417d6b3979ee3774e0a9` |
| `kafli5-djamm/sounds/eleven/sources.json` | 1394 | `34555bb99b79c665d087cb0ed43ffb7c` |
| `kafli5-djamm/sounds/freesound/110218/110218.mp3` | 73878 | `896a107b0ea4dfd0cacf3ce6c324e926` |
| `kafli5-djamm/sounds/freesound/151822/151822.mp3` | 46130 | `8197ef990479134a2296265009b46ca7` |
| `kafli5-djamm/sounds/freesound/162493/162493.mp3` | 65068 | `56442dc638a0a868e9cf256768aafe4b` |
| `kafli5-djamm/sounds/freesound/165154/165154.mp3` | 71585 | `a2f1aae5665b27b55afe82d1e7e71785` |
| `kafli5-djamm/sounds/freesound/178555/178555.mp3` | 40901 | `76e7eec80a76a3e3d45a070fca91cc69` |
| `kafli5-djamm/sounds/freesound/182571/182571.mp3` | 192816 | `9d0b3145a6752c538ade7b9878654397` |
| `kafli5-djamm/sounds/freesound/211560/211560.mp3` | 53822 | `ede6b371b8f806db27b933a4497a2832` |
| `kafli5-djamm/sounds/freesound/212768/212768.mp3` | 98376 | `7b3743d3c52d102c1c9c721d2dfe2320` |
| `kafli5-djamm/sounds/freesound/221568/221568.mp3` | 340416 | `32bf8fba68cf452d2fd58e8ee9320201` |
| `kafli5-djamm/sounds/freesound/243406/243406.mp3` | 87462 | `62aae4ed6abd711b1d3aa92bd04513cd` |
| `kafli5-djamm/sounds/freesound/252808/252808.mp3` | 63971 | `a4ae5ba9ff5f627da272955fb995da7d` |
| `kafli5-djamm/sounds/freesound/25293/25293.mp3` | 203712 | `2c81f9f3a7e0fe092747ca451a2fe2a6` |
| `kafli5-djamm/sounds/freesound/263678/263678.mp3` | 262752 | `7d2e2c732036d95aa14bbbfa2f1727a0` |
| `kafli5-djamm/sounds/freesound/269476/269476.mp3` | 20876 | `df169db265ed29a074ad598bf13b8e17` |
| `kafli5-djamm/sounds/freesound/344962/344962.mp3` | 15968 | `6724db6a1567a8aef132c90d62d7cf9b` |
| `kafli5-djamm/sounds/freesound/365132/365132.mp3` | 305864 | `6c385dbeff9e357317680eb6a4190675` |
| `kafli5-djamm/sounds/freesound/397317/397317.mp3` | 90469 | `8f6374fb3b1492350b427850931e881a` |
| `kafli5-djamm/sounds/freesound/397434/397434.mp3` | 558324 | `be9ff60f1cf8f1c66b0211fe7f8e514f` |
| `kafli5-djamm/sounds/freesound/414208/414208.mp3` | 31952 | `2ea73b04ab597d791d546d23c36eca5f` |
| `kafli5-djamm/sounds/freesound/428073/428073.mp3` | 44575 | `7dc5ee32ad1344da582a93e0db690f7b` |
| `kafli5-djamm/sounds/freesound/438421/438421.mp3` | 693600 | `f52b448b0bc0b19fbca51b7776555d66` |
| `kafli5-djamm/sounds/freesound/557337/557337.mp3` | 113827 | `ef89c65b0b10a97e5812773dacc57b1d` |
| `kafli5-djamm/sounds/freesound/575239/575239.mp3` | 13045 | `1ef7f2d33e1bd0a1da5b6c1bdd332494` |
| `kafli5-djamm/sounds/freesound/648534/648534.mp3` | 85776 | `a4a878e24137f05eb97796247f84cca6` |
| `kafli5-djamm/sounds/freesound/68999/68999.mp3` | 113404 | `e65a942a0a9feadfa9205e48891a5820` |
| `kafli5-djamm/sounds/freesound/736924/736924.mp3` | 433167 | `e5619c967a6321e91e356e3eaa536eb4` |
| `kafli5-djamm/sounds/freesound/856174/856174.mp3` | 91940 | `c4c4977e4c95ed9f5063710c4f450b20` |
| `kafli5-djamm/sounds/freesound/search.json` | 43052 | `4154a0e67524bc91e1607f3e8b50d4e0` |
| `kafli5-djamm/sounds/freesound/sources.json` | 13304 | `63be41434aa13ca8681a395d71699149` |
| `kafli5-djamm/sounds/soundza/search.json` | 74538 | `f943c0ba673f12e621339cd19972d097` |
