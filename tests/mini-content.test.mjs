import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MINI_GAMES,MINI_NARRATION,STATUE_FACTS,STATUE_SOURCES} from '../dist/mini-content.js';
import {GAME_SPECIES} from '../dist/mini-progress.js';
import {NARRATION} from '../dist/story.js';

const dist=new URL('../dist/',import.meta.url);
test('each collectible offers a spoken game and four accessible learning topics',()=>{
  assert.deepEqual(Object.keys(MINI_GAMES).sort(),GAME_SPECIES.slice().sort());
  assert.deepEqual(Object.keys(STATUE_FACTS).sort(),GAME_SPECIES.slice().sort());
  const used=new Set(['mini_invite','mini_statue','mini_gallery']);
  for(const id of GAME_SPECIES){
    const game=MINI_GAMES[id],statue=STATUE_FACTS[id];
    assert.ok(game.title&&statue.name&&statue.latin&&statue.imageAlt);
    for(const key of ['invitation','play','hint','win'])used.add(game[key]);
    assert.equal(statue.facts.length,3);
    for(const fact of [...statue.facts,statue.more]){
      assert.ok(fact.title&&fact.text);assert.equal(fact.text,NARRATION[fact.narration]);used.add(fact.narration);
    }
    assert.ok(STATUE_SOURCES[id].length>=1,`${id}: science needs a source`);
  }
  for(const id of used)assert.equal(NARRATION[id],MINI_NARRATION[id],`${id}: narration must ship`);
});

test('all six displayed photographs are local intact files with their original licence and attribution',async()=>{
  const manifest=JSON.parse(await readFile(new URL('assets/collection/collection-assets.json',dist),'utf8'));
  const licences=await readFile(new URL('assets/collection/LICENSES.txt',dist),'utf8');
  const credits=await readFile(new URL('CREDITS.txt',dist),'utf8');
  assert.equal(manifest.assets.length,6);
  const species=new Set();let totalBytes=0;
  for(const asset of manifest.assets){
    assert.ok(!species.has(asset.species),'Duplicate photo');species.add(asset.species);
    const card=STATUE_FACTS[asset.species];assert.ok(card);
    assert.equal(card.image,'./'+asset.files[0]);assert.equal(card.source,asset.source);
    assert.equal(card.licenseUrl,asset.licenseUrl);assert.equal(card.credit,asset.credit);
    assert.match(asset.license,/^CC-BY(?:-SA)?-(?:2\.0|3\.0|4\.0)$/);
    assert.match(asset.source,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(asset.licenseUrl,/^https:\/\/creativecommons\.org\/licenses\//);
    assert.ok(asset.creator&&asset.modifications&&asset.note);
    for(const value of [asset.creator,asset.source,asset.licenseUrl]){assert.ok(licences.includes(value));assert.ok(credits.includes(value));}
    assert.match(asset.files[0],/^assets\/collection\/[a-z]+\.webp$/);
    const bytes=await readFile(new URL(asset.files[0],dist));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.ok(asset.width>=1000&&asset.width<=1600&&asset.height>=400);
    totalBytes+=bytes.length;
  }
  assert.deepEqual([...species].sort(),GAME_SPECIES.slice().sort());
  assert.ok(totalBytes<2_000_000,'Six photo collection stays below 2 MB');
});
