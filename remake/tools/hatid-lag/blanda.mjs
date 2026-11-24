#!/usr/bin/env node
// Stjörnuhátíðin's song: the owner's second listening page, qa/remake/hatid/lag/blanda.html (git ignores qa/), the look of the
// first (page.mjs). The festival's mix, the same with a click on every beat and a bell on every section, and H as he picked it,
// each with the six sections as jump buttons; the six sections with their times and one line on what the stems do there; and the
// six stars' tones as six buttons. Icelandic, and it opens on a phone.
//   node remake/tools/hatid-lag/blanda.mjs      reads hatid-h/render.json and checks.json and writes the page
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../voice-pages.mjs';
import { FOLDER, STYLE, keyIs } from './page.mjs';
import { solosOf } from './lib/plan.mjs';

const clock = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const comma = (value, digits = 1) => value.toFixed(digits).replace('.', ',');

/** One line a section: what the stems and the laid sounds do there (from the plan and the render's own numbers). */
export function linesOf(render, checks) {
  const beat = 60 / render.bpm;
  const entryTimes = render.entries.slice(1, 6).map(e => clock(render.beatOffset + e.beat * beat));
  const slot = solosOf()[0].beats;
  const lift = checks.loudness.liftDb.chorus;
  return {
    intro: `Upphaf H óbreytt: gítarinn og línan ofan á honum eru hornið hennar Slóeðlu, ein. Svo koma vinirnir inn á tveggja takta fresti (${entryTimes.join(', ')}): Grameðla stappar, Kambeðla slær plötunum, Uggeðla skvettir sporðinum, Þórseðla syngur djúpan tón, Flugeðla skrapar.`,
    dance: 'H óbreytt nema í fyrsta takti hverrar fjögurra takta lotu: þá þagnar söngurinn og óbóið (12 dB lægra) svo Slóeðla geti kallað, en trommur og bassi halda áfram. Kórinn er söngurinn í H sjálfu. Hljóð vinanna halda áfram.',
    solos: `Sex jafnlöng sóló, ${slot} slög hvert (${comma(slot * beat)} s). Hljóð vinarins sem á sólóið heyrist á slögunum, hinir þegja. Hljómsveitin er 2 til 3 dB lægri; í sólói Slóeðlu er óbóið 6 dB hærra.`,
    quiet: 'Trommurnar teknar út (lokahögg sólóanna fær að hljóma eitt slag). Engin hljóð vina. Annars H óbreytt.',
    chorus: `Allt ${comma(lift)} dB hærra en í H. Söngurinn og óbóið þagna í einn takt fjórum sinnum fyrir köllin. Hljóð vinanna aftur, og Grameðla öskrar fjórum sinnum.`,
    chord: 'Lokahljómur H óbreyttur (aðeins jafn hár og viðlagið á undan). Hann deyr út í þögn.',
  };
}

export function writeBlanda(folder, render, checks) {
  const beat = 60 / render.bpm;
  const startOf = s => render.beatOffset + s.startBeat * beat;
  const lines = linesOf(render, checks);
  const jumps = `<div class="jumps">${render.sections.map(s => `<button type="button" data-t="${startOf(s).toFixed(2)}">${escapeHtml(s.nameIs)}</button>`).join('')}</div>`;
  const player = (title, src, note) => `<section class="song">
  <h2>${escapeHtml(title)}</h2>
  ${note ? `<p class="note">${escapeHtml(note)}</p>` : ''}
  <audio controls preload="metadata" src="${escapeHtml(src)}"></audio>
  ${jumps}
</section>`;
  const rows = render.sections.map(s => {
    const from = startOf(s), seconds = s.beats * beat + (s.id === 'chord' ? render.tail : 0);
    return `<tr><td><b>${escapeHtml(s.nameIs)}</b><br><span class="muted">${clock(from)} · ${s.beats / 4} taktar · ${comma(seconds)} s</span></td><td>${escapeHtml(lines[s.id])}</td></tr>`;
  }).join('\n');
  const names = ['D', 'E', 'F♯', 'A', 'H', 'D'];
  const stars = render.motif.map((hz, i) => `<button type="button" class="star" data-hz="${hz}">${i + 1}<br><span>${names[i]}</span></button>`).join('');
  const { lufs, truePeak } = render.loudness;
  const html = `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hátíðarlagið blandað</title>
<style>
  ${STYLE}
  h2 { margin: 0; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 15px; }
  td { vertical-align: top; padding: 8px 6px; border-top: 1px solid var(--line); }
  td:first-child { width: 34%; }
  .stars { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .star { min-width: 64px; line-height: 1.15; border-radius: 14px; }
  .star span { font-size: 13px; font-weight: 600; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Hátíðarlagið blandað</h1>
  <p class="note">H eins og þú valdir það: ${Math.round(render.bpm)} slög á mínútu · ${escapeHtml(keyIs(`${render.keyName.root} ${render.keyName.mode}`))} · ${clock(render.seconds).replace(/\.\d$/, '')}. Engu er klippt til eða breytt í röð: aðeins styrkur rásanna (trommur, bassi, gítar, píanó, annað, söngur) breytist og hljóð vinanna koma ofan á. Blandað fyrir litla hátalara: ${comma(lufs)} LUFS, toppur ${comma(truePeak)} dB.</p>
${player('Blandan', 'hatid-h/mix.mp3', 'Það sem hátíðin spilar.')}
${player('Með smelli', 'hatid-h/click.mp3', 'Smellur á hverju slagi, hærri á fyrsta slagi taktsins, og bjalla þar sem hver hluti byrjar.')}
${player('H óbreytt', 'hatid-h/song.mp3', 'Til samanburðar: lagið eins og það kom.')}
  <table>
${rows}
  </table>
  <section class="song">
    <h2>Tónar stjarnanna sex</h2>
    <p class="note">Upphafsstef lagsins í hornið hennar Slóeðlu er A, F♯, E, D (niður á við, fjórir tónar), svo stjörnurnar fá sex rísandi tóna D-dúrs á sama sviði: 1 2 3 5 6 8.</p>
    <div class="stars">${stars}</div>
  </section>
</main>
<script>
  const players = [...document.querySelectorAll('audio')];
  players.forEach(a => a.addEventListener('play', () => players.forEach(b => { if (b !== a) b.pause(); })));
  document.querySelectorAll('.jumps button').forEach(button => button.addEventListener('click', () => {
    const audio = button.closest('.song').querySelector('audio');
    const go = () => { audio.currentTime = Number(button.dataset.t); audio.play(); };
    if (audio.readyState >= 1) go(); else { audio.addEventListener('loadedmetadata', go, { once: true }); audio.load(); }
  }));
  let ctx = null;
  document.querySelectorAll('.star').forEach(button => button.addEventListener('click', () => {
    ctx ??= new AudioContext();
    const hz = Number(button.dataset.hz), now = ctx.currentTime, out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    out.connect(ctx.destination);
    for (const [ratio, level] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.value = hz * ratio;
      g.gain.value = level;
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 2.3);
    }
  }));
</script>
</body>
</html>
`;
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'blanda.html');
  fs.writeFileSync(file, html);
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = name => JSON.parse(fs.readFileSync(path.join(FOLDER, 'hatid-h', name), 'utf8'));
  const file = writeBlanda(FOLDER, read('render.json'), read('checks.json'));
  console.log(`wrote ${path.relative(path.resolve(FOLDER, '../../../..'), file)}`);
}
