// Round two's party sounds (crowd, air horn, impact, reverse cymbal, scratches), fetched or made, never committed: they land in
// qa/remake/kafli5/lag/djamm/1/sounds/<source>/ with a sources.json (file, page or id, author, licence, purpose).
//   node .../fetch-sounds.mjs --search            Freesound search pages (CC0 and CC BY filters) -> sounds/freesound/search.json
//   node .../fetch-sounds.mjs --soundza           Soundza search (no key: listing only)       -> sounds/soundza/search.json
//   node .../fetch-sounds.mjs --fetch             fetches the previews in PICKS below, each only after its own page shows exactly
//                                                 one licence and it is CC0 or CC BY (never NC or Sampling+)
//   node .../fetch-sounds.mjs --eleven [ids]      ElevenLabs sound generation for MAKE below; an answer on disk is never asked again
// Fetched files are data: they are decoded with ffmpeg and nothing in them is run. The ElevenLabs key is read from
// ELEVENLABS_API_KEY into one request header only; it is never printed, logged or written.
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'qa/remake/kafli5/lag/djamm/1/sounds';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; sound-research)' };
const T = 90000;
const LIC = { 'creativecommons.org/publicdomain/zero/1.0': 'CC0 1.0', 'creativecommons.org/licenses/by/4.0': 'CC BY 4.0', 'creativecommons.org/licenses/by/3.0': 'CC BY 3.0' };

export const QUERIES = ['crowd cheer', 'kids cheering', 'children yay', 'children shouting', 'crowd clapping rhythm', 'hand claps crowd', 'applause concert', 'air horn', 'airhorn', 'sub boom impact', 'sub drop', 'reverse cymbal', 'vinyl scratch', 'dj scratch', 'record rewind', 'vinyl stop', 'stadium crowd'];
// what is fetched, and for what (picked from the search lists by length, downloads and name)
export const PICKS = {
  397434: { author: 'FoolBoyMedia', purpose: 'crowd cheer on the drops' },
  365132: { author: 'SoundsExciting', purpose: 'crowd cheer on the drops' },
  182571: { author: 'qubodup', purpose: 'short crowd cheer' },
  221568: { author: 'AlaskaRobotics', purpose: 'cheering and clapping crowd' },
  438421: { author: 'craigsmith', purpose: 'children cheering' },
  736924: { author: 'Robo9418', purpose: 'young crowd cheering' },
  397317: { author: 'DesignDean', purpose: 'kids WOAH' },
  243406: { author: 'xtrgamr', purpose: 'kids cheering' },
  252808: { author: 'xtrgamr', purpose: 'a YAY' },
  25293: { author: 'freesound', purpose: 'single claps, layered into a crowd clapping in time' },
  344962: { author: 'ezequielTM', purpose: 'one hand clap, layered into a crowd clapping in time' },
  263678: { author: 'avakas', purpose: 'stadium clapping' },
  414208: { author: 'jacksonacademyashmore', purpose: 'air horn' },
  557337: { author: 'neilyhype', purpose: 'dancehall air horn' },
  68999: { author: 'guitarguy1985', purpose: 'air horn' },
  212768: { author: 'qubodup', purpose: 'bass drop under the drop impact' },
  428073: { author: 'newagesoup', purpose: 'sub drop' },
  856174: { author: 'brktkrgll', purpose: 'deep sub drop' },
  648534: { author: 'AudioPapkin', purpose: 'transition hit, the impact' },
  110218: { author: 'genocidalguitar', purpose: 'reverse cymbal into the drop' },
  165154: { author: 'rhythmpeople', purpose: 'reverse crash into the drop' },
  211560: { author: 'wwwaran', purpose: 'DJ scratch' },
  151822: { author: 'templeofhades', purpose: 'scratch sample' },
  269476: { author: 'kwahmah_02', purpose: 'clean record scratch' },
  162493: { author: 'TasmanianPower', purpose: 'vinyl rewind (spin-back)' },
  178555: { author: 'richienoodles', purpose: 'record rewind' },
  575239: { author: 'TRP', purpose: 'vinyl stop, needle lift (fake ending)' },
};
// what is made with ElevenLabs sound generation
export const MAKE = {
};

const sources = dir => {
  const f = path.join(OUT, dir, 'sources.json');
  return { f, list: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [] };
};
const saveSources = s => fs.writeFileSync(s.f, `${JSON.stringify(s.list, null, 2)}\n`);

async function search() {
  const dir = path.join(OUT, 'freesound');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'search.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const q of QUERIES) {
    for (const [lic, filt] of [['CC0', 'license:"Creative Commons 0"'], ['CC BY', 'license:"Attribution"']]) {
      const key = `${q} | ${lic}`;
      if (all[key]) continue;
      const url = `https://freesound.org/search/?q=${encodeURIComponent(q)}&f=${encodeURIComponent(filt)}&s=${encodeURIComponent('Downloads (most first)')}`;
      const h = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(T) })).text();
      // each result: its link, and its duration; paired in order of appearance
      const items = [];
      const durs = [];
      const re = /href="\/people\/([^/"]+)\/sounds\/(\d+)\/"[^>]*>([^<]{1,160})<|data-duration="([\d.]+)"/g;
      for (const m of h.matchAll(re)) {
        if (m[4]) durs.push(+m[4]);
        else if (!items.find(i => i.id === m[2])) items.push({ id: m[2], author: m[1], name: m[3].trim() });
      }
      items.forEach((it, i) => (it.seconds = durs[i] ?? null));
      all[key] = items.slice(0, 15);
      console.log(key, items.length);
      fs.writeFileSync(file, `${JSON.stringify(all, null, 1)}\n`);
    }
  }
}

async function soundza() {
  const dir = path.join(OUT, 'soundza');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'search.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const q of ['crowd cheer', 'kids cheering', 'air horn', 'sub drop impact', 'reverse cymbal', 'vinyl scratch', 'record rewind', 'tape stop', 'crowd clapping']) {
    if (all[q]) continue;
    const r = await fetch(`https://api.soundza.com/v1/sounds/search?type=sound_effect&q=${encodeURIComponent(q)}&per_page=20`, { signal: AbortSignal.timeout(T) });
    const j = await r.json();
    const list = j.results || j.data || j.sounds || j.items || [];
    all[q] = list.length ? list.map(s => ({ id: s.id, title: s.title || s.name, duration: s.duration ?? s.duration_seconds, url: s.url || s.page_url, licence: s.license || s.licence, description: String(s.description || '').slice(0, 160) })) : { raw: JSON.stringify(j).slice(0, 1500) };
    console.log(q, list.length);
    fs.writeFileSync(file, `${JSON.stringify(all, null, 1)}\n`);
  }
}

async function fetchPicks() {
  const s = sources('freesound');
  for (const [id, p] of Object.entries(PICKS)) {
    const folder = path.join(OUT, 'freesound', id);
    const mp3 = path.join(folder, `${id}.mp3`);
    if (fs.existsSync(mp3)) continue;
    const page = `https://freesound.org/people/${p.author}/sounds/${id}/`;
    const h = await (await fetch(page, { headers: UA, signal: AbortSignal.timeout(T) })).text();
    const shown = [...new Set([...h.matchAll(/creativecommons\.org\/(?:publicdomain\/zero|licenses\/[a-z-]+)\/[\d.]+/g)].map(m => m[0]))];
    if (shown.length !== 1 || !LIC[shown[0]]) {
      console.log(`${id}: its page shows ${shown.join(', ') || 'no licence'}; skipped, nothing fetched`);
      continue;
    }
    const prev = [...h.matchAll(/https:\/\/cdn\.freesound\.org\/previews\/[^"' ]+-hq\.mp3/g)].map(m => m[0])[0];
    const title = /<title>([^<]*)<\/title>/.exec(h)?.[1]?.replace(/\s+/g, ' ').trim();
    if (!prev) {
      console.log(`${id}: no preview link on its page; skipped`);
      continue;
    }
    const bytes = Buffer.from(await (await fetch(prev, { headers: UA, signal: AbortSignal.timeout(T) })).arrayBuffer());
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(mp3, bytes);
    s.list = s.list.filter(e => e.id !== id);
    s.list.push({ file: `freesound/${id}/${id}.mp3`, id, page, title, author: p.author, licence: LIC[shown[0]], licenceUrl: `https://${shown[0]}/`, preview: prev, purpose: p.purpose, fetched: new Date().toISOString() });
    saveSources(s);
    console.log(`${id}: ${title} | ${LIC[shown[0]]} | ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}

async function eleven(only) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set; nothing was asked.');
  const dir = path.join(OUT, 'eleven');
  fs.mkdirSync(dir, { recursive: true });
  const s = sources('eleven');
  for (const [id, m] of Object.entries(MAKE)) {
    if (only.length && !only.includes(id)) continue;
    const raw = path.join(dir, `${id}.mp3`);
    if (fs.existsSync(raw) || fs.existsSync(`${raw}.asked`)) continue; // never ask twice
    const body = { text: m.text, duration_seconds: m.seconds, prompt_influence: m.influence ?? 0.5, model_id: 'eleven_text_to_sound_v2' };
    fs.writeFileSync(`${raw}.asked`, `${JSON.stringify(body, null, 2)}\n`);
    let r;
    try {
      r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    } catch (e) {
      console.log(`${id}: could not reach ElevenLabs (${String(e.message).replaceAll(key, '[redacted]')})`);
      continue;
    }
    const cost = r.headers.get('character-cost');
    if (!r.ok) {
      const t = (await r.text()).replaceAll(key, '[redacted]').slice(0, 800);
      fs.writeFileSync(`${raw}.error.txt`, t);
      console.log(`${id}: ${r.status} ${t}`);
      continue;
    }
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    s.list = s.list.filter(e => e.id !== id);
    s.list.push({ file: `eleven/${id}.mp3`, id, source: 'ElevenLabs sound generation, made for this game', prompt: m.text, seconds: m.seconds, credits: cost ? +cost : null, purpose: m.purpose, made: new Date().toISOString() });
    saveSources(s);
    console.log(`${id}: made, credits ${cost}`);
  }
}

const arg = process.argv[2];
if (arg === '--search') await search();
else if (arg === '--soundza') await soundza();
else if (arg === '--fetch') await fetchPicks();
else if (arg === '--eleven') await eleven((process.argv[3] || '').split(',').filter(Boolean));
else console.log('use --search, --soundza, --fetch or --eleven');
