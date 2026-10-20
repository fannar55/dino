import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LESSON_STEPS,allowsAction} from '../engine/yatzy-junior/lesson.js';
import {VOICE_LINES} from '../engine/yatzy-junior/voice-lines.js';
import {CATEGORIES,createGame,roll,hold,score,scoreCategory,validateGame} from '../engine/yatzy-junior/rules.js';

const remake=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(remake,'assets/audio/yatzy-junior/manifest.json'),'utf8'));
const goals=['pair','twoPairs','threeKind','smallStraight','yatzy'];

test('the spoken practice earns five distinct Junior goals through legal rolls, holds and scores',()=>{
  assert.deepEqual(CATEGORIES.map(category=>category.id),goals);
  const expectedPoints={pair:4,twoPairs:12,threeKind:9,smallStraight:15,yatzy:50},awards={};
  let state=createGame({seed:606}),newHands=0,rerolls=0,heldDice=0;
  for(const step of LESSON_STEPS){
    assert.ok(['listen','roll','hold','score','finish'].includes(step.type),`known action: ${step.id}`);
    if(step.newHand){assert.equal(step.type,'roll');state=createGame({seed:606+newHands++});}
    if(step.type==='roll'){
      assert.equal(allowsAction(step,'roll'),true);assert.equal(state.currentPlayer,0);assert.ok(state.rollCount<3);
      const prior=structuredClone(state),next=roll(state);assert.equal(next.rollCount,prior.rollCount+1);
      assert.equal(step.hand.length,5);assert.ok(step.hand.every(value=>Number.isInteger(value)&&value>=1&&value<=6));
      for(let i=0;i<5;i++){
        if(prior.held[i]){assert.equal(next.dice[i],prior.dice[i],'real reroll keeps held faces');assert.equal(step.hand[i],prior.dice[i],'the authored hand never contradicts a held face');}
        else next.dice[i]=step.hand[i];
      }
      assert.deepEqual(state,prior,'rule actions do not mutate their prior state');if(prior.rollCount)rerolls++;
      state=next;validateGame(state);
    }else if(step.type==='hold'){
      assert.equal(new Set(step.indices).size,step.indices.length,'hold targets are unique');
      for(const index of step.indices){
        assert.equal(allowsAction(step,'hold',index),true);const prior=structuredClone(state);state=hold(state,index,true);
        assert.deepEqual(state.dice,prior.dice);assert.equal(state.rng,prior.rng);assert.equal(state.rollCount,prior.rollCount);assert.equal(state.held[index],true);heldDice++;validateGame(state);
      }
    }else if(step.type==='score'){
      assert.equal(allowsAction(step,'score',step.category),true);assert.ok(goals.includes(step.category));assert.equal(awards[step.category],undefined,'each goal is taught once');
      const points=scoreCategory(step.category,state.dice);assert.equal(points,expectedPoints[step.category]);assert.ok(points>0,'practice hands actually earn the requested goal');
      state=score(state,step.category);assert.equal(state.players[0].scores[step.category],points);assert.equal(state.turnCount,1);validateGame(state);awards[step.category]=points;
    }else for(const action of ['roll','hold','score'])assert.equal(allowsAction(step,action,0),false,'listening and finish cannot accept game actions');
  }
  assert.deepEqual(Object.keys(awards),goals);assert.equal(newHands,5);assert.equal(rerolls,2);assert.equal(heldDice,4);assert.equal(Object.values(awards).reduce((a,b)=>a+b,0),90);
  assert.equal(LESSON_STEPS.at(-1).type,'finish');
});

test('lesson action gates reject other dice, cards and action types',()=>{
  for(const step of LESSON_STEPS){
    for(let index=-1;index<=5;index++)assert.equal(allowsAction(step,'hold',index),step.type==='hold'&&step.indices.includes(index),`${step.id}: die ${index}`);
    for(const id of [...goals,'chance','fullHouse','fourKind','largeStraight','bonus','sixes'])assert.equal(allowsAction(step,'score',id),step.type==='score'&&step.category===id,`${step.id}: card ${id}`);
    for(const action of ['next','answer','unknown'])assert.equal(allowsAction(step,action),false);
  }
});

test('every lesson and game line has a real local recording with timed mouth data',()=>{
  const ids=LESSON_STEPS.map(step=>step.id);assert.equal(new Set(ids).size,ids.length);
  for(const step of LESSON_STEPS){assert.ok(VOICE_LINES[step.line]?.text,`${step.id}: spoken sentence`);assert.ok(step.caption?.trim(),`${step.id}: supporting caption`);}
  for(const[id,line]of Object.entries(VOICE_LINES)){
    const entry=manifest[id];assert.ok(entry,`${id}: recorded audio`);assert.ok(line.text.trim());assert.equal(entry.src,`assets/audio/yatzy-junior/${id}.mp3`);
    assert.ok(fs.statSync(path.join(remake,entry.src)).size>1000,`${id}: MP3 bytes exist`);assert.ok(entry.duration>.3&&entry.duration<40);assert.match(entry.mouth,/^[0-9a-f]+$/);assert.match(entry.mouth,/[1-9a-f]/);assert.ok(entry.mouth.endsWith('000'));
    assert.ok(Math.abs(entry.mouth.length-entry.duration*20)<3,`${id}: mouth track matches the recorded duration`);
  }
});

test('every reachable category score has an Icelandic points recording',()=>{
  const points=new Set(),hand=Array(5).fill(1);
  function visit(index){if(index===5){for(const category of CATEGORIES)points.add(scoreCategory(category.id,hand));return;}for(let value=1;value<=6;value++){hand[index]=value;visit(index+1);}}
  visit(0);
  assert.deepEqual([...points].sort((a,b)=>a-b),[0,2,3,4,6,8,9,10,12,14,15,16,18,20,22,50]);
  for(const value of points){assert.ok(VOICE_LINES[`points_${value}`]?.text);assert.ok(manifest[`points_${value}`]);}
});

test('endgame speech covers every reachable five-card total with Icelandic number agreement',()=>{
  const scores=CATEGORIES.map(()=>new Set()),hand=Array(5).fill(1);
  function visit(index){if(index===5){CATEGORIES.forEach((category,i)=>scores[i].add(scoreCategory(category.id,hand)));return;}for(let value=1;value<=6;value++){hand[index]=value;visit(index+1);}}
  visit(0);let totals=new Set([0]);for(const categoryScores of scores)totals=new Set([...totals].flatMap(total=>[...categoryScores].map(value=>total+value)));
  assert.equal(totals.size,116);assert.equal(Math.max(...totals),117);assert.equal(totals.has(1),false);assert.equal(totals.has(116),false);
  for(const total of totals){assert.ok(VOICE_LINES[`points_${total}`]?.text,`spoken total ${total}`);assert.ok(manifest[`points_${total}`],`recorded total ${total}`);}
  const examples={0:'Ekkert stig.',2:'Tvö stig.',3:'Þrjú stig.',4:'Fjögur stig.',13:'Þrettán stig.',17:'Sautján stig.',21:'Tuttugu og eitt stig.',34:'Þrjátíu og fjögur stig.',40:'Fjörutíu stig.',70:'Sjötíu stig.',80:'Áttatíu stig.',100:'Hundrað stig.',102:'Hundrað og tvö stig.',117:'Hundrað og sautján stig.'};
  for(const[value,text]of Object.entries(examples))assert.equal(VOICE_LINES[`points_${value}`].text,text);
  for(const id of ['welcomeMenu','winningRule','yourTotal','mosiTotal','youWin','mosiWin','tie'])assert.ok(manifest[id],`${id}: full spoken menu/rules/result`);
});
