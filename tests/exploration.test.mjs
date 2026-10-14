import test from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,evolve,restoreProgress,SAVE_KEY} from '../dist/progress.js';
import {ADVENTURES} from '../dist/adventure-content.js';
import {ENCOUNTERS} from '../dist/story.js';
import {adventureScore,starCount,MAX_STARS} from '../dist/exploration.js';

const restore=state=>restoreProgress(JSON.stringify(state));
function discoverNext(state,{wrong=false}={}){
 const encounter=ENCOUNTERS[state.index];
 state=evolve(state,{type:'ARRIVE'});
 if(wrong)for(const species of encounter.choices.filter(id=>id!==encounter.species))state=evolve(state,{type:'ANSWER',species});
 return evolve(state,{type:'ANSWER',species:encounter.species});
}
function completeJourney(){
 let state=evolve(freshProgress(),{type:'START'});
 for(const encounter of ENCOUNTERS){state=discoverNext(state);state=evolve(state,{type:'NEXT'});}
 return state;
}
function collectThree(state,species){
 for(const target of ADVENTURES[species].targets)state=evolve(state,{type:'COLLECT',id:target.id});
 return state;
}
function earnAdventure(state,species){
 state=evolve(state,{type:'EXPLORE',species});state=collectThree(state,species);
 state=evolve(state,{type:'COLLECT',id:ADVENTURES[species].secret.id});
 state=evolve(state,{type:'ASK_BONUS'});
 return evolve(state,{type:'BONUS_ANSWER',id:ADVENTURES[species].bonus.answer});
}

test('all 24 stars remain obtainable after every wrong main and bonus answer',()=>{
 let state=evolve(freshProgress(),{type:'START'});
 assert.equal(MAX_STARS,24);
 for(const [index,encounter] of ENCOUNTERS.entries()){
  const species=encounter.species,definition=ADVENTURES[species];
  state=discoverNext(state,{wrong:true});assert.equal(starCount(state),index*4+1);
  state=evolve(state,{type:'EXPLORE',species});
  for(const target of [...definition.targets].reverse()){
   state=evolve(state,{type:'COLLECT',id:target.id});
   const once=state;state=evolve(state,{type:'COLLECT',id:target.id});assert.deepEqual(state,once,'Double taps add no extra object or score');
  }
  assert.equal(adventureScore(state,species),2);
  state=evolve(state,{type:'COLLECT',id:definition.secret.id});assert.equal(adventureScore(state,species),3);
  state=evolve(state,{type:'ASK_BONUS'});
  for(const choice of definition.bonus.choices.filter(choice=>choice.id!==definition.bonus.answer)){
   state=evolve(state,{type:'BONUS_ANSWER',id:choice.id});assert.equal(state.explorePhase,'bonusHint');
   const once=state;state=evolve(state,{type:'BONUS_ANSWER',id:choice.id});assert.deepEqual(state,once);
   assert.equal(adventureScore(state,species),3,'Guidance never removes an earned star');
   state=restore(state);assert.ok(state,'A hint survives reload');
  }
  state=evolve(state,{type:'BONUS_ANSWER',id:definition.bonus.answer});assert.equal(adventureScore(state,species),4);
  assert.equal(starCount(state),(index+1)*4);assert.deepEqual(restore(state),state);
  state=evolve(state,{type:'LEAVE_EXPLORE'});state=evolve(state,{type:'NEXT'});
 }
 assert.equal(state.stage,'complete');assert.equal(starCount(state),24);assert.equal(starCount(restore(state)),24);
});

test('old v2 saves migrate without inventing side-quest stars and can finish every area',()=>{
 const current=completeJourney();
 const {adventures,exploring,explorePhase,...oldSave}=current;
 let state=restore(oldSave);
 assert.equal(SAVE_KEY,'stjornufar.safari.v2');assert.ok(state);assert.deepEqual(state.adventures,{});
 assert.equal(state.exploring,null);assert.equal(starCount(state),6);
 for(const {species} of ENCOUNTERS){state=earnAdventure(state,species);state=evolve(state,{type:'LEAVE_EXPLORE'});}
 assert.equal(state.stage,'complete');assert.equal(starCount(state),MAX_STARS);
 const {adventures:a,exploring:e,explorePhase:p,...oldHint}=evolve(discoverNext(evolve(freshProgress(),{type:'START'})),{type:'NEXT'});
 assert.equal(restore(oldHint).stage,'travel','An older in-progress save retains its current journey');
});

test('replaying a past area preserves the active journey and its name-question hint',()=>{
 let state=discoverNext(evolve(freshProgress(),{type:'START'}));state=evolve(state,{type:'NEXT'});state=evolve(state,{type:'ARRIVE'});
 const current=ENCOUNTERS[1],wrong=current.choices.find(id=>id!==current.species);
 state=evolve(state,{type:'ANSWER',species:wrong});
 const main=({stage,index,found,eliminated})=>({stage,index,found,eliminated});
 const before=main(state),previous=ENCOUNTERS[0].species;
 state=earnAdventure(state,previous);assert.deepEqual(main(state),before);
 state=restore(state);state=evolve(state,{type:'LEAVE_EXPLORE'});assert.deepEqual(main(state),before);
 assert.equal(state.exploring,null);assert.equal(adventureScore(state,previous),4);
 state=evolve(state,{type:'ANSWER',species:current.species});assert.equal(state.stage,'correct');assert.equal(state.index,1);
 assert.equal(starCount(state),5,'Finishing the current name question still awards exactly its own star');
});

test('complete adventures and duplicate event storms cannot award more than four stars per area',()=>{
 let state=completeJourney();
 for(const {species} of ENCOUNTERS){
  state=earnAdventure(state,species);const expected=starCount(state),definition=ADVENTURES[species];
  for(let i=0;i<30;i++){
   state=evolve(state,{type:'BONUS_ANSWER',id:definition.bonus.answer});
   state=evolve(state,{type:'BACK_TO_EXPLORE'});
   for(const id of [...definition.targets.map(target=>target.id),definition.secret.id])state=evolve(state,{type:'COLLECT',id});
   state=evolve(state,{type:'ASK_BONUS'});
  }
  assert.equal(starCount(state),expected);assert.equal(adventureScore(state,species),4);assert.equal(state.explorePhase,'bonusCorrect');
  state=evolve(state,{type:'LEAVE_EXPLORE'});
 }
 assert.equal(starCount(state),24);
});

test('unknown, cross-area and out-of-phase IDs cannot bypass exploration requirements',()=>{
 let state=discoverNext(evolve(freshProgress(),{type:'START'}));
 for(const species of ['trex','constructor','__proto__','sun',null])assert.deepEqual(evolve(state,{type:'EXPLORE',species}),state);
 const species=ENCOUNTERS[0].species,definition=ADVENTURES[species];
 state=evolve(state,{type:'EXPLORE',species});
 for(const id of ['leaf-1','fossil-4','constructor','__proto__',null,{},[]]){
  assert.deepEqual(evolve(state,{type:'COLLECT',id}),state);
  assert.deepEqual(evolve(state,{type:'BONUS_ANSWER',id}),state);
 }
 assert.deepEqual(evolve(state,{type:'ASK_BONUS'}),state);
 assert.deepEqual(evolve(state,{type:'BONUS_ANSWER',id:definition.bonus.answer}),state);
 state=collectThree(state,species);state=evolve(state,{type:'ASK_BONUS'});
 assert.deepEqual(evolve(state,{type:'BONUS_ANSWER',id:'neck'}),state);
 assert.deepEqual(evolve(state,{type:'COLLECT',id:definition.secret.id}),state,'Collecting requires the world exploration phase');
 assert.equal(adventureScore(state,species),2);
});

test('restoration sanitizes forged targets, flags and bonus phases without granting extra stars',()=>{
 let state=discoverNext(evolve(freshProgress(),{type:'START'}));const species=ENCOUNTERS[0].species,definition=ADVENTURES[species];
 state={...state,exploring:species,explorePhase:'bonusCorrect',adventures:{
  [species]:{targets:[definition.targets[0].id,definition.targets[0].id,'leaf-1','unknown'],secret:'true',bonus:true,eliminated:[definition.bonus.answer,'constructor',definition.bonus.choices.find(choice=>choice.id!==definition.bonus.answer).id]},
  trex:{targets:ADVENTURES.trex.targets.map(target=>target.id),secret:true,bonus:true},
 }};
 const clean=restore(state);
 assert.deepEqual(clean.adventures[species].targets,[definition.targets[0].id]);
 assert.equal(clean.adventures[species].secret,false);assert.equal(clean.adventures[species].bonus,false);assert.equal(clean.explorePhase,'explore');
 assert.equal(clean.adventures.trex,undefined);assert.equal(starCount(clean),1);
 assert.ok(!clean.adventures[species].eliminated.includes(definition.bonus.answer));
 assert.equal(restore({...state,exploring:'trex'}).exploring,null);
});

test('bonusHint reload retains eliminated answers and leaves the right answer available',()=>{
 let state=completeJourney();
 for(const {species} of ENCOUNTERS){
  const definition=ADVENTURES[species];state=evolve(state,{type:'EXPLORE',species});state=collectThree(state,species);state=evolve(state,{type:'ASK_BONUS'});
  for(const choice of definition.bonus.choices.filter(choice=>choice.id!==definition.bonus.answer))state=evolve(state,{type:'BONUS_ANSWER',id:choice.id});
  const loaded=restore(state);assert.equal(loaded.explorePhase,'bonusHint');assert.deepEqual(loaded.adventures[species].eliminated,state.adventures[species].eliminated);
  const remaining=definition.bonus.choices.filter(choice=>!loaded.adventures[species].eliminated.includes(choice.id));assert.deepEqual(remaining.map(choice=>choice.id),[definition.bonus.answer]);
  state=evolve(loaded,{type:'BONUS_ANSWER',id:remaining[0].id});assert.equal(state.explorePhase,'bonusCorrect');
  state=evolve(state,{type:'LEAVE_EXPLORE'});
 }
});
