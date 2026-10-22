// The owner's listening pages that voice-lines.mjs writes (into qa/, which git ignores): the pronunciation book
// (qa/remake/voices/framburdarbok/index.html) and the A/B pages (qa/remake/voices/ab/<set>.html). Pure: rows in, HTML out.
// Paper and Nunito like qa/remake/kafli2/listen.html; each page saves the owner's choices as a JSON file he sends back.

/** The speakers by the names the owner knows them by, in the order the pages show them. */
export const SPEAKER_NAMES = { mosi: 'Mosi', egill: 'Egill', kambedla: 'Kambeðla', thorsedla: 'Þórseðla', narrator: 'Sögumaður' };

export const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const PAGE_STYLE = `:root { --paper: #fbf3e2; --ink: #3b2a1a; --muted: #7a6650; --line: #e3d3b4; --mark: #f3e2bd; --warn: #a5482a; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.45 Nunito, system-ui, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 16px 96px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h2 { margin: 36px 0 4px; font-size: 23px; border-bottom: 2px solid var(--line); padding-bottom: 4px; }
  p.note, .muted { color: var(--muted); }
  p.note { margin: 0 0 8px; }
  code, .sent { font: 13px ui-monospace, monospace; color: var(--muted); word-break: break-word; }
  .stale-note { color: var(--warn); font-weight: 700; }
  .recipe { margin: 14px 0 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; }
  .recipe:has(input:checked) { background: var(--mark); }
  .recipe label { font-weight: 800; cursor: pointer; }
  .row { display: grid; grid-template-columns: 120px 1fr; gap: 2px 14px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
  .row .who { font-weight: 700; }
  .row audio { grid-column: 1 / -1; width: 100%; height: 36px; }
  .missing { grid-column: 1 / -1; color: var(--muted); font-style: italic; }
  .line { padding: 10px 0; border-top: 1px solid var(--line); }
  .line p { margin: 0 0 6px; }
  .pair { display: grid; grid-template-columns: 130px 1fr; gap: 4px 12px; align-items: center; }
  .pair audio { width: 100%; height: 36px; }
  .bar { position: sticky; bottom: 0; background: var(--paper); border-top: 2px solid var(--line); padding: 10px 0; display: flex; gap: 12px; align-items: center; }
  button { font: inherit; font-weight: 800; padding: 8px 18px; border-radius: 999px; border: 2px solid var(--ink); background: #fff8ea; color: var(--ink); cursor: pointer; }
  @media (max-width: 600px) { .row, .pair { grid-template-columns: 1fr; } }`;

const page = ({ title, intro, body, script }) => `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  ${PAGE_STYLE}
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p class="note">${intro}</p>
${body}
  <div class="bar"><button type="button" id="save">Vista val</button><span class="muted" id="count"></span></div>
</main>
<script>
${script}
</script>
</body>
</html>
`;

/** What a request sends, in a line for the page. */
const sentLine = sent => [`sent: ${sent.text}`, sent.context ? `samhengi (ekki talað): ${sent.context}` : '', sent.seed === undefined ? '' : `fræ ${sent.seed}`].filter(Boolean).join(' · ');

/**
 * The book's page: a section per word, a radio per recipe, a row per speaker. A row whose MP3 was made from another request than it
 * would send now (`stale`: another word's choice changed since) says so, with the command that makes it again.
 */
export function bookHtml(lexicon, rows, { exists = () => true } = {}) {
  const sections = [];
  for (const [id, entry] of Object.entries(lexicon.words)) {
    const mine = rows.filter(row => row.word === id);
    if (!mine.length) continue;
    const recipes = Object.entries(entry.recipes).map(([recipe, { note }]) => {
      const rowsHtml = mine.filter(row => row.recipe === recipe).map(row => {
        const made = exists(row);
        const audio = made ? `<audio controls preload="none" src="${escapeHtml(row.file)}"></audio>` : `<span class="missing">Ekki gert enn (node remake/tools/voice-lines.mjs --book ${escapeHtml(id)})</span>`;
        const stale = made && row.stale ? `<br><span class="stale-note">Eldri taka: hún var gerð með annarri beiðni en þessari (önnur regla hefur breyst síðan). node remake/tools/voice-lines.mjs --book ${escapeHtml(id)}</span>` : '';
        return `<div class="row${made && row.stale ? ' stale' : ''}" data-row="${escapeHtml(`${id}|${row.speaker}|${recipe}`)}"><span class="who">${escapeHtml(SPEAKER_NAMES[row.speaker] ?? row.speaker)}</span><span>${escapeHtml(row.text)}${row.from ? ` <code>${escapeHtml(row.from)}</code>` : ''}<br><span class="sent">${escapeHtml(sentLine(row.sent))}</span>${stale}</span>${audio}</div>`;
      }).join('\n');
      const checked = entry.chosen === recipe ? ' checked' : '';
      return `<div class="recipe"><label><input type="radio" name="${escapeHtml(id)}" value="${escapeHtml(recipe)}"${checked}> ${escapeHtml(recipe)}${entry.chosen === recipe ? ' <span class="muted">(valið núna)</span>' : ''}</label><p class="note">${escapeHtml(note)}</p>\n${rowsHtml}</div>`;
    }).join('\n');
    const undecided = `<div class="recipe"><label><input type="radio" name="${escapeHtml(id)}" value=""${entry.chosen === null ? ' checked' : ''}> ekki ákveðið</label><p class="note">Orðið er sent eins og það er skrifað þar til þú velur.</p></div>`;
    sections.push(`<section data-word="${escapeHtml(id)}"><h2>${escapeHtml(entry.word)}</h2><p class="note">Myndir: ${entry.forms.map(escapeHtml).join(', ')}. ${entry.chosen ? `Valið núna: <b>${escapeHtml(entry.chosen)}</b>.` : 'Ekkert valið enn.'}</p>\n${recipes}\n${undecided}</section>`);
  }
  return page({
    title: 'Framburðarbók',
    intro: 'Eitt erfitt orð í einu. Undir hverri uppskrift segir hver persóna sem notar orðið sömu setninguna; uppskriftin breytir aðeins því sem er sent til ElevenLabs (Eleven v4), aldrei textanum sem barnið sér. Veldu uppskrift fyrir orðið: hún gildir um allar línur með orðinu, í öllum köflum og Litlu Yatzy. Ýttu svo á „Vista val“ og sendu mér picks.json.',
    body: sections.join('\n'),
    script: `  const words = [...document.querySelectorAll('section[data-word]')].map(section => section.dataset.word);
  const picks = () => Object.fromEntries(words.flatMap(word => {
    const input = document.querySelector('input[name="' + word + '"]:checked');
    return input ? [[word, input.value || null]] : [];
  }));
  const count = () => { document.getElementById('count').textContent = Object.values(picks()).filter(Boolean).length + ' af ' + words.length + ' orðum með valda uppskrift'; };
  document.addEventListener('change', count);
  count();
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(picks(), null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'picks.json' });
    document.body.append(link);
    link.click();
    link.remove();
  });`,
  });
}

/**
 * A set's A/B page. `made`: the lines of the round being replaced (`round`: its number; `earlier`: older rounds), the old take beside
 * the one in the game now. `kept`: kept lines with a new take beside them that is NOT in the game yet (`--ab-apply` installs it
 * unless the owner marks "Gamla"). Each row is { id, speaker, text, how, oldSrc, newSrc, kept? }.
 */
export function abHtml({ set, round = null, earlier = [], made = [], kept = [] }) {
  const row = (item, kind) => `<div class="line" data-id="${escapeHtml(item.id)}" data-kind="${kind}">
  <p><b>${escapeHtml(SPEAKER_NAMES[item.speaker] ?? item.speaker)}</b>: ${escapeHtml(item.text)} <code>${escapeHtml(item.id)}</code>${item.how ? `<br><span class="sent">${escapeHtml(item.how)}</span>` : ''}${item.kept ? `<br><span class="sent">geymd taka (kept): ${escapeHtml(item.kept)}</span>` : ''}</p>
  <div class="pair"><label><input type="radio" name="${escapeHtml(item.id)}" value="gamla"> Gamla${kind === 'kept' ? ' (í leiknum)' : ''}</label><audio controls preload="none" src="${escapeHtml(item.oldSrc)}"></audio>
  <label><input type="radio" name="${escapeHtml(item.id)}" value="nyja"> Nýja${kind === 'kept' ? ' (ekki komin inn)' : ' (í leiknum)'}</label><audio controls preload="none" src="${escapeHtml(item.newSrc)}"></audio></div>
</div>`;
  const parts = [];
  if (made.length) {
    parts.push(`<h2>Gerðar aftur${round ? `: umferð ${round}` : ''}</h2><p class="note">Gamla takan er sú sem var í leiknum fyrir umferðina; sú nýja er komin inn.${earlier.length ? ` Fyrri umferðir: ${earlier.map(n => `umferð ${n}`).join(', ')}.` : ''}</p>`);
    parts.push(...made.map(item => row(item, 'made')));
  }
  if (kept.length) {
    parts.push('<h2>Geymdar línur með nýrri töku</h2><p class="note">Þessar línur hafa takan sem þú valdir áður (kept), en orðið í þeim lýtur nú annarri reglu. Nýja takan er gerð eftir reglunni en ekki komin inn: hún fer inn ef þú merkir ekki „Gamla“.</p>');
    parts.push(...kept.map(item => row(item, 'kept')));
  }
  return page({
    title: `A/B: ${set}`,
    intro: `${made.length + kept.length} línur, hver með gömlu tökunni og þeirri nýju (Eleven v4 með framburðarreglunum). Merktu „Gamla“ við línu sem á að halda gömlu tökunni, ýttu svo á „Vista val“ og sendu mér skrána.`,
    body: parts.join('\n'),
    script: `  const ids = [...document.querySelectorAll('.line')].map(line => line.dataset.id);
  const choices = () => Object.fromEntries(ids.flatMap(id => { const input = document.querySelector('input[name="' + id + '"]:checked'); return input ? [[id, input.value]] : []; }));
  const count = () => { const all = Object.values(choices()); document.getElementById('count').textContent = all.filter(v => v === 'nyja').length + ' nýjar, ' + all.filter(v => v === 'gamla').length + ' gamlar, ' + (ids.length - all.length) + ' ómerktar'; };
  document.addEventListener('change', count);
  count();
  document.getElementById('save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ set: ${JSON.stringify(set)}, choices: choices() }, null, 2) + '\\n'], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: ${JSON.stringify(`ab-${set}.json`)} });
    document.body.append(link);
    link.click();
    link.remove();
  });`,
  });
}
