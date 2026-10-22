// A pronunciation lexicon of the tests' own, in the form of remake/assets/audio/pronunciation.json, with choices that never change:
// the tests of applyLexicon, requestFor, --dry, --book, --pick, --plan and --ab use it, so the owner's picks in the shipped lexicon
// (which change as he listens) never move a test. Only pronunciation.test.mjs's invariants test reads the shipped file.
//   Kambeðla: the visit line as context, seed 1 (samhengi-42 the same with seed 42); Snigill: IPA, seed 1; Eitt: "Eiht", seed 42;
//   Ein: "Eyn", seed 42; Mundu: context, seed 1; öglir: context; Þórseðla, Egill and Grameðla: not chosen (null).

export const VISIT = 'Fyrst heimsækjum við Kambeðlu vinkonu mína. Plöturnar á bakinu hennar lýsa eins og ljósker!';
const q = ipa => `"/${ipa}/"`;
const raw = { note: 'Sent as written.' };

const FIXTURE = {
  words: {
    kambedla: {
      word: 'Kambeðla',
      stem: '[Kk]ambeðl',
      forms: ['Kambeðla', 'kambeðla', 'Kambeðlu', 'Kambeðlur', 'kambeðlur', 'Kambeðlan', 'kambeðlan'],
      recipes: {
        hratt: raw,
        samhengi: { context: VISIT, seed: 1, note: 'The visit line as context, not spoken; seed 1.' },
        'samhengi-42': { context: VISIT, seed: 42, note: 'The same context with seed 42.' },
      },
      chosen: 'samhengi',
    },
    snigill: {
      word: 'Snigill',
      stem: '[Ss]nig',
      forms: ['Snigill', 'snigill', 'snigilinn', 'snigillinn', 'Sniglar'],
      recipes: {
        hratt: raw,
        ipa: { say: { Snigill: q('ˈstniːjɪtl̥'), snigill: q('ˈstniːjɪtl̥'), snigilinn: q('ˈstniːjɪlɪn'), snigillinn: q('ˈstniːjɪtlɪn'), Sniglar: q('ˈstnɪklar') }, seed: 1, note: 'IPA, seed 1.' },
        stafsetning: { say: { Snigill: 'Sníjitl', snigill: 'sníjitl', snigilinn: 'sníjilinn', snigillinn: 'sníjitlinn', Sniglar: 'Sniglar' }, note: 'Spelt as it sounds.' },
      },
      chosen: 'ipa',
      audition: { narrator: 'Þetta er snigill. Hann ber húsið sitt og það stækkar með honum!' },
    },
    eitt: {
      word: 'Eitt',
      stem: 'Eitt$',
      forms: ['Eitt'],
      recipes: {
        hratt: raw,
        stafsetning: { say: { Eitt: 'Eiht' }, seed: 42, note: 'Spelt Eiht, seed 42.' },
        ipa: { say: { Eitt: q('ˈeiht') }, seed: 42, note: 'IPA, seed 42.' },
      },
      chosen: 'stafsetning',
    },
    ein: {
      word: 'Ein',
      stem: 'Ein$',
      forms: ['Ein'],
      recipes: { hratt: raw, stafsetning: { say: { Ein: 'Eyn' }, seed: 42, note: 'Spelt Eyn, seed 42.' } },
      chosen: 'stafsetning',
    },
    mundu: {
      word: 'Mundu',
      stem: '[Mm]und',
      forms: ['Mundu'],
      recipes: { hratt: raw, samhengi: { context: 'Mundu að ýta á Eitt!', seed: 1, note: 'Its line as context, seed 1.' } },
      chosen: 'samhengi',
    },
    thorsedla: {
      word: 'Þórseðla',
      stem: '[Þþ]órseðl',
      forms: ['Þórseðla', 'Þórseðlu', 'Þórseðlan', 'þórseðlan'],
      recipes: {
        hratt: raw,
        ipa: { say: { Þórseðla: q('ˈθoursˌɛðla'), Þórseðlu: q('ˈθoursˌɛðlʏ'), Þórseðlan: q('ˈθoursˌɛðlan'), þórseðlan: q('ˈθoursˌɛðlan') }, note: 'IPA.' },
        samhengi: { context: 'Næst er það Þórseðla, stærsti vinur minn.', note: 'Her introduction as context.' },
      },
      chosen: null,
    },
    egill: {
      word: 'Egill',
      stem: 'Egil|Agl',
      forms: ['Egill'],
      recipes: {
        hratt: raw,
        ipa: { say: { Egill: q('ˈeiːjɪtl̥') }, note: 'IPA.' },
        stafsetning: { say: { Egill: 'Eijitl' }, note: 'Spelt as it sounds.' },
        samhengi: { context: 'Engar áhyggjur. Egill er besti leitarmaður skógarins!', note: 'A line that says him right, as context.' },
      },
      chosen: null,
    },
    oglir: {
      word: 'öglir',
      stem: '[Öö]gl',
      forms: ['öglir', 'Öglir', 'öglis'],
      recipes: {
        hratt: raw,
        ipa: { say: { öglir: q('ˈœklɪr'), Öglir: q('ˈœklɪr'), öglis: q('ˈœklɪs') }, note: 'IPA.' },
        samhengi: { context: 'Einn elsti fugl sem við þekkjum heitir öglir.', note: 'A sentence about him as context.' },
      },
      chosen: 'samhengi',
    },
    gramedla: {
      word: 'Grameðla',
      stem: '[Gg]rameðl',
      forms: ['Grameðla', 'Grameðlu'],
      recipes: {
        hratt: raw,
        ipa: { say: { Grameðla: q('ˈkraːmˌɛðla'), Grameðlu: q('ˈkraːmˌɛðlʏ') }, note: 'IPA.' },
      },
      chosen: null,
      audition: { mosi: 'Grameðla! Hún er með stærstu tennurnar af öllum.' },
    },
  },
};

/** A fresh copy of the fixture lexicon (a test may change it). */
export const fixtureLexicon = () => structuredClone(FIXTURE);
/** Only some of its words, for a test that needs few. */
export const fixtureWords = (...ids) => ({ words: Object.fromEntries(ids.map(id => [id, structuredClone(FIXTURE.words[id])])) });
