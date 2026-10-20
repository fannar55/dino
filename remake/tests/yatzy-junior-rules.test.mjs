import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,DICE_COUNT,MAX_ROLLS,SAVE_VERSION,ROUND_COUNT,MAX_TURNS,createGame,roll,hold,score,scoreCategory,previews,totals,decideAI,validateGame,restoreGame} from '../engine/yatzy-junior/rules.js';
import {createGame as createClassicGame} from '../engine/yatzy-mosi/rules.js';
const ids=CATEGORIES.map(category=>category.id);
const clone=value=>structuredClone(value);
function deepFreeze(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')deepFreeze(child);return value;}
function hand(dice,rollCount=1,options={}){const state=createGame(options);state.dice=[...dice];state.rollCount=rollCount;return state;}
function remaining(open,dice,rollCount=1){
  const state=hand(dice,rollCount);
  for(const player of state.players)for(const id of ids)if(!open.includes(id))player.scores[id]=0;
  state.turnCount=(ROUND_COUNT-open.length)*2;validateGame(state);return state;
}
function applyDecision(state,decision=decideAI(state)){
  if(decision.type==='score')return score(state,decision.categoryId);
  if(state.rollCount)for(let i=0;i<DICE_COUNT;i++)state=hold(state,i,decision.held[i]);
  return roll(state);
}

test('Junior exposes exactly five frozen scoring cards and five rounds without extra categories',()=>{
  assert.deepEqual(ids,['pair','twoPairs','threeKind','smallStraight','yatzy']);
  assert.deepEqual(CATEGORIES.map(category=>category.label),['Eitt par','Tvö pör','Þrír eins','Röð','Yatzy']);
  assert.deepEqual(CATEGORIES.map(category=>category.max),[12,22,18,15,50]);
  assert.ok(Object.isFrozen(CATEGORIES));assert.ok(CATEGORIES.every(category=>Object.isFrozen(category)&&category.description.length>15));
  assert.equal(DICE_COUNT,5);assert.equal(MAX_ROLLS,3);assert.equal(ROUND_COUNT,5);assert.equal(MAX_TURNS,10);assert.equal(SAVE_VERSION,1);
  for(const category of ['chance','fullHouse','fourKind','largeStraight','sixes','bonus','unknown','__proto__'])assert.throws(()=>scoreCategory(category,[1,2,3,4,5]),TypeError);
});

test('classic matched-dice values require distinct pairs and all five straight faces',()=>{
  assert.equal(scoreCategory('pair',[2,2,5,5,1]),10);
  assert.equal(scoreCategory('pair',[6,6,6,6,6]),12);
  assert.equal(scoreCategory('twoPairs',[4,4,4,4,6]),0);
  assert.equal(scoreCategory('twoPairs',[4,4,4,6,6]),20);
  assert.equal(scoreCategory('twoPairs',[5,5,6,6,1]),22);
  assert.equal(scoreCategory('threeKind',[4,4,4,2,6]),12);
  assert.equal(scoreCategory('threeKind',[6,6,6,6,6]),18);
  assert.equal(scoreCategory('smallStraight',[5,2,4,1,3]),15);
  assert.equal(scoreCategory('smallStraight',[1,2,3,4,4]),0);
  assert.equal(scoreCategory('smallStraight',[2,3,4,5,6]),0);
  assert.equal(scoreCategory('yatzy',[1,1,1,1,1]),50);
  assert.equal(scoreCategory('yatzy',[6,6,6,6,5]),0);
});

test('all 7776 ordered hands agree with an independent sorted-run scoring oracle',()=>{
  const maxima=Object.fromEntries(ids.map(id=>[id,0]));
  for(let encoded=0;encoded<6**5;encoded++){
    let rest=encoded;const dice=[];for(let i=0;i<5;i++){dice.push(1+rest%6);rest=Math.floor(rest/6);}
    const sorted=[...dice].sort((a,b)=>a-b),groups=[];
    for(const face of sorted){if(groups.at(-1)?.face===face)groups.at(-1).count++;else groups.push({face,count:1});}
    const pairs=groups.filter(group=>group.count>=2),triple=groups.find(group=>group.count>=3);
    const expected={pair:pairs.length?pairs.at(-1).face*2:0,twoPairs:pairs.length===2?pairs.reduce((sum,group)=>sum+group.face*2,0):0,threeKind:triple?triple.face*3:0,smallStraight:sorted.join('')==='12345'?15:0,yatzy:groups.length===1?50:0};
    for(const id of ids){const actual=scoreCategory(id,dice);assert.equal(actual,expected[id],`${id}: ${dice}`);maxima[id]=Math.max(maxima[id],actual);}
  }
  assert.deepEqual(ids.map(id=>maxima[id]),CATEGORIES.map(category=>category.max));
});

test('malformed, sparse or accessor-backed dice are rejected without executing getters',()=>{
  for(const dice of [null,[],[1,2,3,4],[1,2,3,4,5,6],[0,2,3,4,5],[7,2,3,4,5],[1.5,2,3,4,5],['1',2,3,4,5],[NaN,2,3,4,5],Array(5)])assert.throws(()=>scoreCategory('pair',dice),TypeError);
  let called=false;const dice=[1,2,3,4,5];Object.defineProperty(dice,0,{get(){called=true;return 1;}});
  assert.throws(()=>scoreCategory('pair',dice),TypeError);assert.equal(called,false);
});

test('totals count only recorded cards, with no upper bonus or repeated Yatzy reward',()=>{
  const card=createGame().players[0].scores;assert.deepEqual(totals(card),{upper:0,bonus:0,lower:0,total:0});
  Object.assign(card,{pair:12,twoPairs:22,threeKind:18,smallStraight:15});
  assert.deepEqual(totals(card),{upper:0,bonus:0,lower:67,total:67},'passing63 does not introduce a bonus');
  card.yatzy=50;assert.deepEqual(totals(card),{upper:0,bonus:0,lower:117,total:117});
  for(const bad of [{...card,pair:9},{...card,threeKind:20},{...card,smallStraight:20},{...card,yatzy:100},{...card,chance:30}])assert.throws(()=>totals(bad),TypeError);
});

test('creation, seeded rolls, holds and releases are immutable with a three-attempt limit',()=>{
  for(const startingPlayer of [0,1]){
    const initial=deepFreeze(createGame({seed:0,startingPlayer}));assert.equal(validateGame(initial),true);assert.deepEqual(previews(initial),{});
    const first=roll(initial);assert.deepEqual(first,roll(initial));assert.equal(first.rollCount,1);assert.deepEqual(initial.dice,[0,0,0,0,0]);
    let kept=hold(hold(first,0),3,true);assert.deepEqual(kept.held,[true,false,false,true,false]);assert.ok(first.held.every(value=>!value));
    const second=roll(deepFreeze(kept));assert.equal(second.dice[0],first.dice[0]);assert.equal(second.dice[3],first.dice[3]);assert.equal(second.rollCount,2);
    kept=hold(second,0,false);assert.equal(kept.held[0],false);assert.equal(second.held[0],true);
    const third=roll(kept);assert.equal(third.rollCount,3);assert.throws(()=>roll(third),/No rolls/);assert.throws(()=>hold(third,0),/attempts left/);
    assert.equal(validateGame(score(deepFreeze(third),'pair')),true);
  }
  for(const seed of [-1,2**32,NaN,Infinity,1.5,'2'])assert.throws(()=>createGame({seed}));
  for(const startingPlayer of [-1,2,.5,'0'])assert.throws(()=>createGame({startingPlayer}));
});

test('illegal actions and double scoring cannot consume turns or alter existing cards',()=>{
  const initial=deepFreeze(createGame());assert.throws(()=>hold(initial,0),/Holding/);assert.throws(()=>score(initial,'pair'),/Roll before/);
  let state=hand([4,4,4,2,6]);for(const index of [-1,5,NaN,1.5,'0'])assert.throws(()=>hold(state,index));
  for(const flag of [null,1,'true',[]])assert.throws(()=>hold(state,0,flag));
  for(let i=0;i<5;i++)state=hold(state,i,true);const before=clone(state);assert.throws(()=>roll(state),/all dice are held/);assert.deepEqual(state,before);
  state=score(deepFreeze(state),'threeKind');assert.equal(state.players[0].scores.threeKind,12);assert.equal(state.turnCount,1);assert.equal(state.currentPlayer,1);assert.equal(state.rollCount,0);assert.deepEqual(state.dice,[0,0,0,0,0]);assert.ok(state.held.every(value=>!value));
  assert.throws(()=>score(state,'pair'),/Roll before/);state=roll(score(roll(state),'pair'));assert.throws(()=>score(state,'threeKind'),/already filled/);
});

test('a no-match final hand still uses one zero card; previews do not secretly score anything',()=>{
  const state=deepFreeze(hand([1,2,3,4,6],3));assert.deepEqual(previews(state),Object.fromEntries(ids.map(id=>[id,0])));
  assert.ok(Object.values(state.players[0].scores).every(value=>value===null));
  const decision=decideAI(state);assert.equal(decision.type,'score');assert.ok(ids.includes(decision.categoryId));
  let next=score(state,'yatzy');assert.equal(next.players[0].scores.yatzy,0);assert.equal(next.turnCount,1);
  next=roll(score(roll(next),'pair'));assert.equal(Object.hasOwn(previews(next),'yatzy'),false);assert.throws(()=>score(next,'yatzy'),/already filled/);
});

test('restore preserves exact held rerolls, owns all data and rejects classic15-card saves',()=>{
  let state=roll(createGame({seed:0xffffffff,startingPlayer:1}));state=hold(hold(state,1,true),4,true);
  const restored=restoreGame(JSON.stringify(state));assert.deepEqual(restored,state);assert.deepEqual(roll(restored),roll(state));assert.notEqual(restored.held,state.held);assert.notEqual(restored.players[0].scores,state.players[0].scores);
  const extra=clone(state);extra.untrusted={event:'run-code'};extra.players[0].name='Foreign';assert.deepEqual(restoreGame(extra),state);
  assert.equal(restoreGame(createClassicGame()),null);assert.equal(restoreGame(JSON.stringify(createClassicGame())),null);
  restored.held[1]=false;assert.equal(state.held[1],true);
});

test('save guards reject impossible scores, malformed phase and forged ten-turn endings',()=>{
  const changes=[state=>{state.version=0;},state=>{state.rng=-1;},state=>{state.rng=2**32;},state=>{state.players.reverse();},state=>{state.players[0].scores.pair=9;},state=>{state.players[0].scores.threeKind=20;},state=>{state.players[0].scores.smallStraight=20;},state=>{state.players[0].scores.yatzy=40;},state=>{state.players[0].scores.twoPairs=12;},state=>{delete state.players[0].scores.pair;},state=>{state.currentPlayer=1;},state=>{state.startingPlayer=2;},state=>{state.turnCount=1;},state=>{state.turnCount=11;},state=>{state.rollCount=4;},state=>{state.dice[0]=1;},state=>{state.held[0]=true;},state=>{state.held[0]=0;},state=>{state.dice=Array(5);},state=>{state.held=Array(5);},state=>{state.status='finished';},state=>{state.winner='you';},state=>{delete state.status;}];
  for(const change of changes){const state=createGame();change(state);assert.throws(()=>validateGame(state));assert.equal(restoreGame(state),null);}
  for(const input of [null,undefined,[],1,'','{','null','[]',' '.repeat(20001),Object.create(createGame())])assert.equal(restoreGame(input),null);
  let called=false;const accessor=createGame();Object.defineProperty(accessor,'rng',{get(){called=true;return 1;}});assert.equal(restoreGame(accessor),null);assert.equal(called,false);
});

test('exactly ten scored turns finish five rounds with correct ties, winners and terminal guards',()=>{
  for(const startingPlayer of [0,1]){
    let state=createGame({startingPlayer});
    for(let turn=0;turn<MAX_TURNS;turn++){
      state=score({...state,dice:[1,2,3,4,5],rollCount:1},ids[Math.floor(turn/2)]);
      assert.equal(state.turnCount,turn+1);assert.equal(state.status,turn===9?'finished':'playing');assert.equal(validateGame(state),true);
    }
    assert.equal(state.winner,'tie');assert.equal(state.currentPlayer,startingPlayer);assert.equal(decideAI(state),null);assert.deepEqual(previews(state),{});
    for(const action of [()=>roll(state),()=>hold(state,0),()=>score(state,'pair')])assert.throws(action,/finished/);
    assert.deepEqual(restoreGame(JSON.stringify(state)),state);
    state.players[0].scores.pair=12;state.winner='you';assert.equal(validateGame(state),true);state.winner='mosi';assert.throws(()=>validateGame(state),/winner/);
    state.players[1].scores.pair=12;state.players[0].scores.pair=0;assert.equal(validateGame(state),true);
  }
});

test('Mosi pursues only open Junior patterns and handles duplicate straight/pair faces correctly',()=>{
  assert.deepEqual(decideAI(hand([5,5,5,5,5])),{type:'score',categoryId:'yatzy'});
  assert.deepEqual(decideAI(remaining(['pair'],[2,2,6,6,1])),{type:'score',categoryId:'pair'});
  assert.deepEqual(decideAI(remaining(['smallStraight'],[1,2,3,4,5])),{type:'score',categoryId:'smallStraight'});
  assert.deepEqual(decideAI(remaining(['smallStraight'],[1,2,3,4,4])),{type:'roll',held:[true,true,true,true,false]});
  assert.deepEqual(decideAI(remaining(['threeKind'],[6,6,1,2,3])),{type:'roll',held:[true,true,false,false,false]});
  const pairs=decideAI(remaining(['twoPairs'],[4,4,4,4,2]));assert.equal(pairs.type,'roll');assert.equal(pairs.held.slice(0,4).filter(Boolean).length,2);
  const yatzy=decideAI(remaining(['yatzy'],[6,6,6,1,2]));assert.deepEqual(yatzy,{type:'roll',held:[true,true,true,false,false]});
});

test('AI decisions are deterministic, do not inspect future RNG and return independent hold arrays',()=>{
  const random=Math.random;Math.random=()=>{throw new Error('AI cannot sample randomness');};
  try{
    const state=deepFreeze(remaining(['yatzy'],[4,4,4,2,6])),expected=decideAI(state);assert.equal(expected.type,'roll');
    for(const rng of [0,1,100,928019,0xffffffff])assert.deepEqual(decideAI({...state,rng}),expected);
    const changed=decideAI(state);changed.held.fill(false);assert.deepEqual(decideAI(state),expected);assert.ok(state.held.every(value=>!value));
  }finally{Math.random=random;}
});

test('seeded complete Junior matches terminate legally with only five filled cards per player',()=>{
  const results=new Set();
  for(let seed=0;seed<40;seed++){
    let state=createGame({seed,startingPlayer:seed%2}),decisions=0,rolls=0;
    while(state.status==='playing'){
      const before=clone(state),decision=decideAI(state);assert.deepEqual(state,before);assert.deepEqual(decision,decideAI({...state,rng:(state.rng+1)>>>0}));
      if(decision.type==='roll'){rolls++;assert.equal(decision.held.length,5);assert.ok(decision.held.some(value=>!value));}
      else{assert.ok(ids.includes(decision.categoryId));assert.equal(state.players[state.currentPlayer].scores[decision.categoryId],null);}
      state=applyDecision(state,decision);assert.equal(validateGame(state),true);assert.ok(++decisions<=40);
    }
    assert.equal(state.turnCount,10);assert.ok(rolls>=10&&rolls<=30);assert.ok(state.players.every(player=>Object.keys(player.scores).length===5&&Object.values(player.scores).every(value=>value!==null)));
    const points=state.players.map(player=>totals(player.scores).total);assert.equal(state.winner,points[0]===points[1]?'tie':points[0]>points[1]?'you':'mosi');assert.deepEqual(restoreGame(JSON.stringify(state)),state);results.add(points.join(':'));
  }
  assert.ok(results.size>20,'different seeded hands produce varied matches');
  let first=createGame({seed:173}),second=createGame({seed:173});while(first.status==='playing'){first=applyDecision(first);second=applyDecision(second);assert.deepEqual(first,second);}
});
