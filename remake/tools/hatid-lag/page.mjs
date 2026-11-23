#!/usr/bin/env node
// Stjörnuhátíðin's song: the owner's listening page for the candidates (presets hatid-a … hatid-d of tools/sloedla-music.mjs), in
// qa/remake/hatid/lag/index.html (git ignores qa/). Paper and Nunito like tools/voice-pages.mjs, and it opens on a phone. Each
// candidate: its letter and feel, its measured tempo and key in one line, a player, and the six sections of form.mjs as buttons
// that jump to the section's start at that candidate's measured tempo. One radio a candidate, a note box, and „Vista val“ saves
// lag-val.json ({ pick, notes }) for him to send back, as the voice pages save theirs.
//   node remake/tools/hatid-lag/page.mjs        reads each candidate's newest song(-N).json and writes the page
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../voice-pages.mjs';
import { FORM, beatsOf } from './form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const FOLDER = path.join(ROOT, 'qa/remake/hatid/lag');

/** "D major" → "D-dúr", "F# minor" → "F#-moll". */
export const keyIs = key => (key ? key.replace(/^(\S+) major$/, '$1-dúr').replace(/^(\S+) minor$/, '$1-moll') : 'tóntegund ómæld');

const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Where each section starts in a candidate (seconds): its first downbeat plus the section's beats at the measured tempo. */
export const startsOf = ({ bpm, downbeatSec = 0 }) => beatsOf().map(part => ({ ...part, second: Math.max(0, Math.round((downbeatSec + (part.startBeat * 60) / bpm) * 100) / 100) }));

const STYLE = `:root { --paper: #fbf3e2; --ink: #3b2a1a; --muted: #7a6650; --line: #e3d3b4; --mark: #f3e2bd; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.45 Nunito, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 110px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  p.note, .muted { color: var(--muted); }
  p.note { margin: 0 0 8px; }
  .song { margin: 18px 0 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; }
  .song:has(input:checked) { background: var(--mark); }
  .song label { font-weight: 800; font-size: 21px; cursor: pointer; display: flex; gap: 10px; align-items: center; }
  .song input[type=radio] { width: 22px; height: 22px; }
  .song audio { width: 100%; margin: 8px 0 4px; }
  .jumps { display: flex; flex-wrap: wrap; gap: 6px; }
  .jumps button { font-size: 15px; padding: 6px 12px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 80px; margin-top: 18px; font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff8ea; color: var(--ink); }
  .bar { position: sticky; bottom: 0; background: var(--paper); border-top: 2px solid var(--line); padding: 10px 0; display: flex; gap: 12px; align-items: center; }
  button { font: inherit; font-weight: 800; padding: 8px 18px; border-radius: 999px; border: 2px solid var(--ink); background: #fff8ea; color: var(--ink); cursor: pointer; }`;

/**
 * Writes index.html into `folder`. A candidate: { id, letter, feelIs, src (relative to folder), bpm, key, lengthSeconds, downbeatSec }.
 * `leftOut`: [{ letter, why }] for candidates that are not on the page.
 */
export function writePage(folder, candidates, { leftOut = [] } = {}) {
  const songs = candidates.map(c => `<section class="song" data-id="${escapeHtml(c.id)}">
  <label><input type="radio" name="pick" value="${escapeHtml(c.id)}"> ${escapeHtml(c.letter)}: ${escapeHtml(c.feelIs)}</label>
  <p class="note">${Math.round(c.bpm)} slög á mínútu · ${escapeHtml(keyIs(c.key))} · ${clock(c.lengthSeconds)}</p>
  <audio controls preload="metadata" src="${escapeHtml(c.src)}"></audio>
  <div class="jumps">${startsOf(c).map(part => `<button type="button" data-t="${part.second}">${escapeHtml(FORM.find(f => f.id === part.id).nameIs)}</button>`).join('')}</div>
</section>`).join('\n');
  const out = leftOut.length ? `<p class="note">Ekki með: ${leftOut.map(l => `${escapeHtml(l.letter)} (${escapeHtml(l.why)})`).join('; ')}.</p>` : '';
  const html = `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lag hátíðarinnar</title>
<style>
  ${STYLE}
</style>
</head>
<body>
<main>
  <h1>Lag hátíðarinnar</h1>
  <p class="note">${candidates.length} lög án söngs. Hornið, hljóð vinanna og kórinn koma ofan á seinna. Hnapparnir hoppa í hvern hluta. Veldu eitt, skrifaðu athugasemd ef þú vilt og ýttu á „Vista val“.</p>
  ${out}
${songs}
  <textarea id="notes" placeholder="Athugasemd"></textarea>
  <div class="bar"><button type="button" id="save">Vista val</button><span class="muted" id="picked">Ekkert valið</span></div>
</main>
<script>
  const players = [...document.querySelectorAll('audio')];
  players.forEach(a => a.addEventListener('play', () => players.forEach(b => { if (b !== a) b.pause(); })));
  document.querySelectorAll('.jumps button').forEach(button => button.addEventListener('click', () => {
    const audio = button.closest('.song').querySelector('audio');
    const go = () => { audio.currentTime = Number(button.dataset.t); audio.play(); };
    if (audio.readyState >= 1) go(); else { audio.addEventListener('loadedmetadata', go, { once: true }); audio.load(); }
  }));
  const pick = () => document.querySelector('input[name="pick"]:checked')?.value ?? null;
  document.addEventListener('change', () => { const p = pick(); document.getElementById('picked').textContent = p ? 'Valið: ' + document.querySelector('[data-id="' + p + '"] label').textContent.trim() : 'Ekkert valið'; });
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ pick: pick(), notes: document.getElementById('notes').value }, null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'lag-val.json' });
    document.body.append(link);
    link.click();
    link.remove();
  });
</script>
</body>
</html>
`;
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'index.html');
  fs.writeFileSync(file, html);
  return file;
}

/** Why a measured candidate cannot be on the page (the plan's Step 6): it drifts over 40 ms, is in another key, or someone sings. */
export function failsOf(song) {
  if (!(song.driftMs <= 40)) return `rekur ${song.driftMs} ms`;
  if (!song.measured.keyMatchesRequest) return `önnur tóntegund (${keyIs(song.measured.key)})`;
  if (song.vocalCheck.words > 0) return 'rödd heyrist';
  return null;
}

/** A candidate's newest song(-N).json in its folder, or null. */
function newestOf(dir) {
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).map(name => /^song(?:-(\d+))?\.json$/.exec(name)).filter(Boolean).map(m => Number(m[1] ?? 1));
  if (!versions.length) return null;
  const v = Math.max(...versions);
  return path.join(dir, v > 1 ? `song-${v}.json` : 'song.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PRESETS } = await import('../sloedla-music.mjs');
  const candidates = [], leftOut = [];
  for (const [id, preset] of Object.entries(PRESETS).filter(([name]) => name.startsWith('hatid-'))) {
    const letter = id.slice(-1).toUpperCase();
    const json = newestOf(path.join(ROOT, preset.out));
    if (!json) { leftOut.push({ letter, why: 'ekki gert' }); continue; }
    const song = JSON.parse(fs.readFileSync(json, 'utf8'));
    if (!song.measured || !song.vocalCheck) throw new Error(`${path.relative(ROOT, json)} is not checked: run sloedla-music.mjs ${id} --measure and --vocals`);
    const why = failsOf(song);
    if (why) { leftOut.push({ letter, why }); console.log(`${letter} left out: ${why}`); continue; }
    const src = path.relative(FOLDER, path.join(path.dirname(json), song.src)).replace(/\\/g, '/');
    candidates.push({ id, letter, feelIs: preset.feelIs, src, bpm: song.measured.bpm, key: song.measured.key, lengthSeconds: song.measured.lengthSeconds, downbeatSec: song.measured.downbeatSec });
    console.log(`${letter} ${preset.feelIs}: ${src}, ${song.measured.bpm} bpm, ${song.measured.key}, drift ${song.driftMs} ms, ${song.measured.lengthSeconds} s, sections from ${startsOf(candidates.at(-1)).map(p => p.second).join(' / ')} s`);
  }
  console.log(`wrote ${path.relative(ROOT, writePage(FOLDER, candidates, { leftOut }))} (${candidates.length} candidates${leftOut.length ? `, left out ${leftOut.map(l => l.letter).join(', ')}` : ''})`);
}
