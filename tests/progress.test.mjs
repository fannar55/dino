import test from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,evolve,restoreProgress,SAVE_KEY} from '../dist/progress.js';
import {ENCOUNTERS} from '../dist/story.js';
test('invitation gives a friendly second invitation before travel',()=>{
 let s=freshProgress();s=evolve(s,{type:'DECLINE'});assert.equal(s.stage,'invite');s=evolve(s,{type:'DECLINE'});assert.equal(s.stage,'invite');s=evolve(s,{type:'START'});assert.equal(s.stage,'travel');
});
test('six discoveries follow forest, lake and sky with guidance and no lost progress',()=>{
 let s=evolve(freshProgress(),{type:'START'});
 for(const [i,e] of ENCOUNTERS.entries()){
  assert.equal(s.index,i);s=evolve(s,{type:'ARRIVE'});assert.equal(s.stage,'question');
  const wrong=e.choices.find(id=>id!==e.species);s=evolve(s,{type:'ANSWER',species:wrong});assert.equal(s.stage,'hint');assert.ok(s.eliminated.includes(wrong));assert.equal(s.found.length,i);
  const repeated=evolve(s,{type:'ANSWER',species:wrong});assert.deepEqual(repeated,s);
  s=evolve(s,{type:'ANSWER',species:e.species});assert.equal(s.stage,'correct');assert.equal(s.found.length,i+1);
  s=evolve(s,{type:'NEXT'});
 }
 assert.equal(s.stage,'complete');assert.equal(s.found.length,6);
 assert.deepEqual(ENCOUNTERS.map(e=>e.biome),['forest','forest','forest','lake','lake','sky']);
});
test('out-of-stage answers and forged species cannot bypass discoveries',()=>{
 let s=freshProgress();assert.deepEqual(evolve(s,{type:'NEXT'}),s);assert.deepEqual(evolve(s,{type:'ANSWER',species:'stegosaurus'}),s);
 s=evolve(evolve(s,{type:'START'}),{type:'ARRIVE'});assert.deepEqual(evolve(s,{type:'ANSWER',species:'sun'}),s);
});
test('restore validates ordered discoveries and preserves guided retry',()=>{
 let s=evolve(evolve(freshProgress(),{type:'START'}),{type:'ARRIVE'});s=evolve(s,{type:'ANSWER',species:'trex'});assert.deepEqual(restoreProgress(JSON.stringify(s)),s);
 for(const raw of ['invalid','null',JSON.stringify({...s,version:1}),JSON.stringify({...s,index:999}),JSON.stringify({...s,found:['trex']}),JSON.stringify({...s,stage:'complete'})])assert.equal(restoreProgress(raw),null);
 assert.equal(SAVE_KEY,'stjornufar.safari.v2');
});
