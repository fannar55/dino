// Five-card Scandinavian Yatzy for two to four, the solo game the two-player case. Rendering, clocks and persistence live elsewhere.
export const DICE_COUNT=5;
export const MAX_ROLLS=3;
export const SAVE_VERSION=1;
export const CATEGORIES=Object.freeze([
  {id:'pair',label:'Eitt par',section:'lower',max:12,description:'Tveir eins teningar telja. Ef þú átt fleiri pör veljum við hæsta parið.'},
  {id:'twoPairs',label:'Tvö pör',section:'lower',max:22,description:'Tvö pör með ólíkum tölum. Þessir fjórir teningar telja.'},
  {id:'threeKind',label:'Þrír eins',section:'lower',max:18,description:'Þrír eins teningar telja. Hinir tveir bætast ekki við.'},
  {id:'smallStraight',label:'Röð',section:'lower',max:15,description:'1, 2, 3, 4 og 5, hver tala einu sinni. Gefur 15 stig.'},
  {id:'yatzy',label:'Yatzy',section:'lower',max:50,description:'Allir fimm teningarnir eins. Gefur 50 stig í þessum reit.'},
].map(category=>Object.freeze(category)));
export const ROUND_COUNT=CATEGORIES.length;
// Every player fills each card once: five rounds, a turn each round.
export const maxTurns=n=>ROUND_COUNT*n;
export const MAX_TURNS=maxTurns(2);
const BY_ID=new Map(CATEGORIES.map(category=>[category.id,category]));
const PLAYERS=['you','mosi'],UINT32_MAX=0xffffffff; // the solo game's seats, the default player list
const STATE_FIELDS=['version','players','currentPlayer','startingPlayer','turnCount','rollCount','dice','held','rng','status','winner'];
const assert=(condition,message)=>{if(!condition)throw new TypeError(message);};
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
// Two to four seats, each a distinct non-empty string; 'tie' is the winner's word for a shared top, so no seat may be called that.
// Array.from turns holes into undefined so a sparse list fails too.
const distinctIds=ids=>Array.isArray(ids)&&integer(ids.length,2,4)&&Array.from(ids).every(id=>typeof id==='string'&&id.length>0&&id!=='tie')&&new Set(ids).size===ids.length;
function ownValue(object,key){const descriptor=Object.getOwnPropertyDescriptor(object,key);assert(descriptor&&Object.hasOwn(descriptor,'value'),`Missing or non-data field: ${key}`);return descriptor.value;}
function categoryFor(id){const category=BY_ID.get(id);assert(category,`Unknown Yatzy Junior category: ${String(id)}`);return category;}
function diceCounts(dice){
  assert(Array.isArray(dice)&&dice.length===DICE_COUNT,'Exactly five dice are required');
  const counts=[0,0,0,0,0,0,0];
  for(let i=0;i<DICE_COUNT;i++){const face=ownValue(dice,i);assert(integer(face,1,6),'Dice must be integers from 1 to 6');counts[face]++;}
  return counts;
}
function scoreCounts(category,counts){
  if(category.id==='smallStraight')return counts.slice(1,6).every(count=>count===1)?15:0;
  if(category.id==='yatzy')return counts.includes(5)?50:0;
  if(category.id==='twoPairs'){
    const pairs=[];for(let face=6;face>=1;face--)if(counts[face]>=2)pairs.push(face);
    return pairs.length>=2?2*(pairs[0]+pairs[1]):0;
  }
  const needed=category.id==='pair'?2:3;
  for(let face=6;face>=1;face--)if(counts[face]>=needed)return face*needed;
  return 0;
}
export function scoreCategory(categoryId,dice){return scoreCounts(categoryFor(categoryId),diceCounts(dice));}
// The dice that make a card's score, smallest first (the pair, both pairs, the three, the run, the five); [] when the hand does not
// make it. The cards show these, and a filled card keeps the ones it was filled with (players[i].faces).
function facesFor(category,counts){
  if(!scoreCounts(category,counts))return [];
  if(category.id==='smallStraight')return [1,2,3,4,5];
  if(category.id==='yatzy'){const face=counts.indexOf(5);return Array(5).fill(face);}
  if(category.id==='twoPairs'){const pairs=[];for(let face=6;face>=1&&pairs.length<2;face--)if(counts[face]>=2)pairs.push(face);return [pairs[1],pairs[1],pairs[0],pairs[0]];}
  const needed=category.id==='pair'?2:3;for(let face=6;face>=1;face--)if(counts[face]>=needed)return Array(needed).fill(face);
  return [];
}
export function scoringDice(categoryId,dice){return facesFor(categoryFor(categoryId),diceCounts(dice));}
// What a kept set of scoring dice is worth on its card (NaN when they could not have scored there).
function facesScore(category,faces){
  if(!faces.length)return 0;const counts=[0,0,0,0,0,0,0];for(const face of faces)counts[face]++;
  const same=n=>faces.length===n&&counts.includes(n);
  if(category.id==='pair')return same(2)?2*faces[0]:NaN;
  if(category.id==='threeKind')return same(3)?3*faces[0]:NaN;
  if(category.id==='yatzy')return same(5)?50:NaN;
  if(category.id==='smallStraight')return faces.length===5&&counts.slice(1,6).every(count=>count===1)?15:NaN;
  const pairs=counts.map((count,face)=>count===2?face:0).filter(Boolean);
  return faces.length===4&&pairs.length===2?2*(pairs[0]+pairs[1]):NaN;
}
// Kept dice are only shown, never scored: a save is checked for their shape, and a copy keeps them only where they make the score.
function validateFaces(faces){
  assert(record(faces),'Kept dice must be a plain object');
  const keys=Object.keys(faces);assert(keys.length===ROUND_COUNT&&keys.every(key=>BY_ID.has(key)),'Kept dice cover exactly five categories');
  for(const category of CATEGORIES){
    const kept=ownValue(faces,category.id);if(kept===null)continue;
    assert(Array.isArray(kept)&&kept.length<=DICE_COUNT,'Kept dice must be a short list');
    for(let i=0;i<kept.length;i++)assert(integer(ownValue(kept,i),1,6),'Kept dice must be integers from 1 to 6');
  }
}
function keptFaces(category,player){const kept=player.faces?.[category.id],value=player.scores[category.id];return Array.isArray(kept)&&value!==null&&facesScore(category,kept)===value?[...kept]:null;}
const emptyFaces=()=>Object.fromEntries(CATEGORIES.map(category=>[category.id,null]));

// Enumerate the 252 unordered hands once for strict saved-score validation.
// The opponent never enumerates 7,776 outcomes during a move.
const REACHABLE=new Map(CATEGORIES.map(category=>[category.id,new Set()])),validationCounts=[0,0,0,0,0,0,0];
function buildReachable(face=1,left=DICE_COUNT){
  if(face===6){validationCounts[face]=left;for(const category of CATEGORIES)REACHABLE.get(category.id).add(scoreCounts(category,validationCounts));return;}
  for(let count=0;count<=left;count++){validationCounts[face]=count;buildReachable(face+1,left-count);}
}
buildReachable();
function validateScorecard(card){
  assert(record(card),'A scorecard must be a plain object');
  const keys=Object.keys(card);
  assert(keys.length===ROUND_COUNT&&keys.every(key=>BY_ID.has(key)),'A Junior scorecard has exactly five categories');
  for(const category of CATEGORIES){const value=ownValue(card,category.id);assert(value===null||REACHABLE.get(category.id).has(value),`Impossible score for ${category.id}`);}
}
function sumCard(card){
  const total=CATEGORIES.reduce((sum,category)=>sum+(card[category.id]??0),0);
  // Retain the shared controller's totals shape, without introducing upper/bonus rules.
  return {upper:0,bonus:0,lower:total,total};
}
export function totals(card){validateScorecard(card);return sumCard(card);}
// The highest total wins, whoever holds it; a top total shared by two or more is a tie.
function findWinner(players){const points=players.map(player=>sumCard(player.scores).total),best=Math.max(...points);return points.indexOf(best)===points.lastIndexOf(best)?players[points.indexOf(best)].id:'tie';}
export function validateGame(value){
  assert(record(value),'Game must be a plain object');for(const key of STATE_FIELDS)ownValue(value,key);
  assert(value.version===SAVE_VERSION,'Unsupported Yatzy Junior save version');
  assert(Array.isArray(value.players)&&integer(value.players.length,2,4),'Two to four distinct players are required');const n=value.players.length;
  assert(integer(value.startingPlayer,0,n-1)&&integer(value.currentPlayer,0,n-1),'Invalid player index');
  assert(integer(value.turnCount,0,maxTurns(n)),'Invalid scored turn count');assert(integer(value.rollCount,0,MAX_ROLLS),'Invalid roll count');
  assert(integer(value.rng,0,UINT32_MAX),'Invalid random state');
  const ids=[],filled=[];
  for(let i=0;i<n;i++){
    const player=ownValue(value.players,i);assert(record(player),'Invalid player');ids.push(ownValue(player,'id'));
    const card=ownValue(player,'scores');validateScorecard(card);filled.push(CATEGORIES.filter(category=>card[category.id]!==null).length);
    if(Object.hasOwn(player,'faces'))validateFaces(ownValue(player,'faces')); // older saves have no kept dice
  }
  assert(distinctIds(ids),'Two to four distinct players are required');
  // Turns go round the ring from the starting player: the player k seats on from them has had a turn in each lap that reached them.
  const first=value.startingPlayer;
  assert(filled.every((count,i)=>count===Math.floor((value.turnCount+(n-1-((i-first+n)%n)))/n)),'Scores do not match the turn order');
  assert(value.currentPlayer===(first+value.turnCount)%n,'Current player does not match turn count');
  assert(Array.isArray(value.dice)&&value.dice.length===DICE_COUNT,'Exactly five dice are required');assert(Array.isArray(value.held)&&value.held.length===DICE_COUNT,'Exactly five hold flags are required');
  for(let i=0;i<DICE_COUNT;i++){
    const die=ownValue(value.dice,i),held=ownValue(value.held,i);assert(typeof held==='boolean','Hold flags must be booleans');
    assert(value.rollCount===0?die===0&&!held:integer(die,1,6),'Dice/holds do not match roll phase');
  }
  if(value.turnCount===maxTurns(n)){assert(value.status==='finished'&&value.rollCount===0,'Finished game has an active turn');assert(value.winner===findWinner(value.players),'Incorrect saved winner');}
  else{assert(value.status==='playing'&&value.winner===null,'Playing game has a terminal result');}
  return true;
}
function copyGame(game){return {
  version:SAVE_VERSION,players:game.players.map(player=>({id:player.id,scores:Object.fromEntries(CATEGORIES.map(category=>[category.id,player.scores[category.id]])),
    faces:Object.fromEntries(CATEGORIES.map(category=>[category.id,keptFaces(category,player)]))})),
  currentPlayer:game.currentPlayer,startingPlayer:game.startingPlayer,turnCount:game.turnCount,rollCount:game.rollCount,dice:[...game.dice],held:[...game.held],rng:game.rng,status:game.status,winner:game.winner,
};}
export function restoreGame(serializedOrObject){
  try{if(typeof serializedOrObject==='string'&&serializedOrObject.length>20000)return null;const candidate=typeof serializedOrObject==='string'?JSON.parse(serializedOrObject):serializedOrObject;validateGame(candidate);return copyGame(candidate);}catch{return null;}
}
export function createGame({seed=1,startingPlayer=0,players=PLAYERS}={}){
  assert(integer(seed,0,UINT32_MAX),'Seed must be an unsigned 32-bit integer');assert(distinctIds(players),'Two to four distinct players are required');assert(integer(startingPlayer,0,players.length-1),'Invalid starting player');
  return {version:SAVE_VERSION,players:players.map(id=>({id,scores:Object.fromEntries(CATEGORIES.map(category=>[category.id,null])),faces:emptyFaces()})),currentPlayer:startingPlayer,startingPlayer,turnCount:0,rollCount:0,dice:Array(DICE_COUNT).fill(0),held:Array(DICE_COUNT).fill(false),rng:seed,status:'playing',winner:null};
}
// The round being played, 1 to 5: a round is a turn for everyone, and a finished game stays in the last round.
export function roundOf(game){return Math.min(ROUND_COUNT,Math.floor(game.turnCount/game.players.length)+1);}
function requirePlaying(game){validateGame(game);assert(game.status==='playing','The game is finished');}
function randomWord(rng){const next=(rng+0x6d2b79f5)>>>0;let value=Math.imul(next^next>>>15,next|1);value^=value+Math.imul(value^value>>>7,value|61);return {rng:next,word:(value^value>>>14)>>>0};}
export function roll(game){
  requirePlaying(game);assert(game.rollCount<MAX_ROLLS,'No rolls remain');assert(!game.held.every(Boolean),'Release a die or choose a score: all dice are held');
  const next=copyGame(game);
  for(let i=0;i<DICE_COUNT;i++)if(!next.held[i]){let draw;do{draw=randomWord(next.rng);next.rng=draw.rng;}while(draw.word>=4294967292);next.dice[i]=1+draw.word%6;}
  next.rollCount++;return next;
}
export function hold(game,index,held){
  requirePlaying(game);assert(integer(index,0,DICE_COUNT-1),'Invalid die index');assert(game.rollCount>0&&game.rollCount<MAX_ROLLS,'Holding requires a rolled turn with attempts left');assert(held===undefined||typeof held==='boolean','Held must be a boolean');
  const next=copyGame(game);next.held[index]=held===undefined?!next.held[index]:held;return next;
}
export function previews(game){
  validateGame(game);if(game.status!=='playing'||game.rollCount===0)return {};
  const counts=diceCounts(game.dice),card=game.players[game.currentPlayer].scores;
  return Object.fromEntries(CATEGORIES.filter(category=>card[category.id]===null).map(category=>[category.id,scoreCounts(category,counts)]));
}
export function score(game,categoryId){
  requirePlaying(game);const category=categoryFor(categoryId);assert(game.rollCount>0,'Roll before choosing a score');assert(game.players[game.currentPlayer].scores[categoryId]===null,'That score category is already filled');
  const next=copyGame(game),counts=diceCounts(game.dice);next.players[game.currentPlayer].scores[categoryId]=scoreCounts(category,counts);next.players[game.currentPlayer].faces[categoryId]=facesFor(category,counts);next.turnCount++;next.currentPlayer=(next.startingPlayer+next.turnCount)%next.players.length;
  next.rollCount=0;next.dice.fill(0);next.held.fill(false);
  if(next.turnCount===maxTurns(next.players.length)){next.status='finished';next.winner=findWinner(next.players);}return next;
}

// Bounded pattern estimates: deterministic, independent of future RNG, and small
// enough to run synchronously for either Mosi or a human hint.
const BASELINE={pair:9,twoPairs:14,threeKind:12,smallStraight:15,yatzy:15};
const FACTORIAL=[1,1,2,6,24,120],completionCache=new Map();
function completionProbability(missing,free,attempts){
  const needs=missing.filter(count=>count>0).sort((a,b)=>a-b);if(!needs.length)return 1;
  if(needs.reduce((a,b)=>a+b,0)>free||attempts<=0)return 0;
  const key=`${attempts}:${free}:${needs.join(',')}`;if(completionCache.has(key))return completionCache.get(key);
  const kinds=needs.length,perFace=(1-(1-kinds/6)**attempts)/kinds,miss=1-kinds*perFace;
  function sum(index,left,weight){if(index===kinds)return weight*miss**left/FACTORIAL[left];let result=0;for(let count=needs[index];count<=left;count++)result+=sum(index+1,left-count,weight*perFace**count/FACTORIAL[count]);return result;}
  const probability=FACTORIAL[free]*sum(0,free,1);completionCache.set(key,probability);return probability;
}
function targets(category){
  if(category.id==='smallStraight')return [{needs:{1:1,2:1,3:1,4:1,5:1},points:15}];
  if(category.id==='twoPairs'){
    const pairs=[];for(let a=1;a<=6;a++)for(let b=a+1;b<=6;b++)pairs.push({needs:{[a]:2,[b]:2},points:2*(a+b)});return pairs;
  }
  const count=category.id==='pair'?2:category.id==='threeKind'?3:5;
  return Array.from({length:6},(_,i)=>({needs:{[i+1]:count},points:category.id==='yatzy'?50:(i+1)*count}));
}
const TARGETS=new Map(CATEGORIES.map(category=>[category.id,targets(category)]));
/** {type:'roll',held:boolean[5]} or {type:'score',categoryId}; null after completion. */
export function decideAI(game){
  validateGame(game);if(game.status==='finished')return null;if(game.rollCount===0)return {type:'roll',held:Array(DICE_COUNT).fill(false)};
  const card=game.players[game.currentPlayer].scores,open=CATEGORIES.filter(category=>card[category.id]===null),counts=diceCounts(game.dice),attempts=MAX_ROLLS-game.rollCount;
  const utility=(category,points)=>points-BASELINE[category.id];let bestScore=null,bestRoll=null;
  for(const category of open){const points=scoreCounts(category,counts),value=utility(category,points);if(!bestScore||value>bestScore.value+1e-9)bestScore={category,points,value};}
  if(!attempts)return {type:'score',categoryId:bestScore.category.id};
  for(const category of open)for(const target of TARGETS.get(category.id)){
    const missing={...target.needs},held=game.dice.map(face=>{if(missing[face]>0){missing[face]--;return true;}return false;}),count=held.filter(Boolean).length;
    if(count===DICE_COUNT)continue;
    const expected=target.points*completionProbability(Object.values(missing),DICE_COUNT-count,attempts),value=utility(category,expected);
    if(!bestRoll||value>bestRoll.value+1e-9||Math.abs(value-bestRoll.value)<=1e-9&&count>bestRoll.count)bestRoll={held,value,count};
  }
  if(!bestRoll||bestScore.points>=bestScore.category.max*.9&&bestScore.value>=bestRoll.value-.15)return {type:'score',categoryId:bestScore.category.id};
  return {type:'roll',held:[...bestRoll.held]};
}
