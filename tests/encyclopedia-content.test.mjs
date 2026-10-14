import test from 'node:test';
import assert from 'node:assert/strict';
import {ENCYCLOPEDIA, ENCYCLOPEDIA_NARRATION, GLOSSARY} from '../dist/encyclopedia-content.js';

const expected = ['triceratops','stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon','fish','snail','beetle','lizard','frog','dragonfly','butterfly'];
const byId = Object.fromEntries(ENCYCLOPEDIA.map(entry => [entry.id,entry]));

test('all fourteen collection entries provide substantial, sourced, expandable reading', () => {
  assert.deepEqual(ENCYCLOPEDIA.map(entry => entry.id).sort(), expected.slice().sort());
  for (const entry of ENCYCLOPEDIA) {
    assert.ok(entry.name && entry.scientificName && entry.intro);
    const major = entry.group === 'prehistoric';
    assert.equal(entry.topics.length, major ? 8 : 4, entry.id);
    assert.equal(new Set(entry.topics.map(item => item.id)).size, entry.topics.length);
    assert.ok(entry.topics.reduce((sum,item) => sum + item.paragraphs.length,0) >= (major ? 20 : 5),entry.id);
    const urls = new Set(entry.sources.map(source => source.url));
    assert.ok(urls.size > 0);
    for (const source of entry.sources) {
      assert.ok(source.title); assert.equal(new URL(source.url).protocol,'https:');
    }
    for (const topic of entry.topics) {
      assert.ok(topic.title && topic.summary && topic.paragraphs.every(text => typeof text === 'string' && text.trim()));
      assert.ok(['evidence','inferred','debated'].includes(topic.certainty));
      assert.ok(topic.sources.length > 0 && topic.sources.every(url => urls.has(url)),`${entry.id}/${topic.id} has an unlisted source`);
    }
    assert.ok(entry.hotspots.length >= 2 && entry.hotspots.every(point => point.label && point.text));
  }
});

test('measurements distinguish wingspan, body length and unsupported generic animal dimensions', () => {
  for (const entry of ENCYCLOPEDIA) {
    if (entry.group === 'small') {
      assert.equal(entry.size,null); assert.equal(entry.time,null);
      assert.equal(entry.illustration,entry.id);
      continue;
    }
    assert.ok(entry.size.value > 0 && entry.size.value <= 25);
    assert.equal(entry.size.unit,'m');
    assert.equal(entry.size.kind,entry.id === 'pteranodon' ? 'wingspan' : 'length');
    assert.ok(entry.size.label && entry.sources.some(source => source.url === entry.size.source));
    assert.ok(Number.isFinite(entry.time.start) && Number.isFinite(entry.time.end));
    assert.ok(entry.time.start >= entry.time.end && entry.time.end > 0);
    assert.ok(entry.time.label.includes('um ') && entry.sources.some(source => source.url === entry.time.source));
  }
  // These sources date representative fossils, not the entire taxon's range.
  assert.equal(byId.spinosaurus.time.start,byId.spinosaurus.time.end);
  assert.equal(byId.pteranodon.time.start,byId.pteranodon.time.end);
  assert.ok(byId.brachiosaurus.time.end > byId.trex.time.start);
});

test('legacy save identity and major scientific caveats survive content edits', () => {
  assert.equal(byId.brachiosaurus.name,'Þórseðla');
  assert.equal(byId.brachiosaurus.scientificName,'Brontosaurus');
  assert.equal(byId.spinosaurus.name,'Uggeðla');
  assert.equal(byId.parasaurolophus.name,'Slóeðla');
  assert.match(byId.pteranodon.intro,/ekki risaeðla/);
  assert.ok(byId.spinosaurus.topics.some(topic => topic.id === 'mystery' && topic.certainty === 'debated'));
  assert.ok(byId.stegosaurus.topics.some(topic => topic.id === 'mystery' && topic.certainty === 'debated'));
  assert.match(byId.parasaurolophus.topics.find(topic => topic.id === 'sound').paragraphs.join(' '),/ekki upptaka|Enginn tók upp/);
  assert.match(byId.brachiosaurus.topics.find(topic => topic.id === 'tail').paragraphs.join(' '),/2012.*eldri uppsetninguna/);
});

test('each investigation has a distinct answer and an explanation for learning retries', () => {
  for (const entry of ENCYCLOPEDIA) {
    const item = entry.question;
    assert.ok(item.prompt && item.explanation.length > 45,entry.id);
    assert.equal(item.options.length,3);
    assert.equal(new Set(item.options).size,3);
    assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length);
    assert.ok(item.options.every(option => typeof option === 'string' && option.trim()));
  }
});

test('every overview and entire visible topic has its own bounded Icelandic narration', () => {
  const ids = [];
  for (const entry of ENCYCLOPEDIA) {
    ids.push(entry.introNarration);
    assert.equal(ENCYCLOPEDIA_NARRATION[entry.introNarration],entry.intro);
    for (const topic of entry.topics) {
      ids.push(topic.narration);
      assert.equal(ENCYCLOPEDIA_NARRATION[topic.narration],`${topic.title}. ${topic.summary} ${topic.paragraphs.join(' ')}`);
    }
  }
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(Object.keys(ENCYCLOPEDIA_NARRATION).sort(),ids.sort());
  for (const [id,text] of Object.entries(ENCYCLOPEDIA_NARRATION)) {
    assert.match(id,/^encyclopedia_[a-z]+_[A-Za-z]+$/);
    assert.ok(text.split(/\s+/).length < 90,`${id} risks exceeding the narration timeout`);
    assert.ok(!text.includes('<') && !text.includes('http'));
  }
  assert.ok(GLOSSARY.length >= 15);
  assert.equal(new Set(GLOSSARY.map(item => item.term)).size,GLOSSARY.length);
  assert.ok(GLOSSARY.every(item => item.definition.length > 30));
});
