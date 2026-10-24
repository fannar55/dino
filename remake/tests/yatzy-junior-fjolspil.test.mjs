// Litla Yatzy in "Fjölspil" (the owner's decisions of 2026-10-24): the seats are the players, a guest's phone is sent the
// view of the table and asks with acts, and a game of seats is kept under its own key. Pure, as engine/yatzy-junior/fjolspil.js is.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,createGame,roll,hold,score,scoringDice,previews,totals,validateGame,maxTurns} from '../engine/yatzy-junior/rules.js';
import {createSeats} from '../engine/fjolspil/seats.js';
import {MOSI_AI,STORAGE_KEY,SAVE_KEY,playersOf,phaseOf,yatzyView,actOf,keepFjolspil,readFjolspil,forgetFjolspil} from '../engine/yatzy-junior/fjolspil.js';
import {VOICE_LINES,MULTI_LINES} from '../engine/yatzy-junior/voice-lines.js';

const ids=CATEGORIES.map(category=>category.id);
/** Egill, Anna on her phone and Mosi: the table of three the tests play at. */
function table(){
  const seats=createSeats();
  seats.join({guestId:'anna-phone',name:'Anna',avatar:'sloedla'});
  seats.addAi({name:MOSI_AI.name,avatar:MOSI_AI.avatar});
  return seats;
}
function memory(){
  const map=new Map();
  return {map,getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}
const can=view=>[view.canRoll,view.canHold,view.canScore];
const still={settled:true,paused:false,lastRoll:null};

test('Mosi joins the lobby as the one computer player, and a game of seats is kept under keys of its own',()=>{
  assert.deepEqual(MOSI_AI,{name:'Mosi',avatar:'mosi',add:'Bæta Mosa við',remove:'Taka Mosa út'});
  assert.equal(STORAGE_KEY,'fjolspil.room.yatzy-junior');
  assert.equal(SAVE_KEY,'mosi.yatzy.junior.fjolspil.v1');
  assert.deepEqual(playersOf(table()),['0','1','2'],'the rules\' player ids are the seat numbers');
});

test('Mosi has six generic lines for a table of many, optional, and apart from the solo script the startup requires',()=>{
  assert.deepEqual(Object.keys(MULTI_LINES),['multiWelcome','multiTurn','multiScored','multiZero','multiWait','multiOver']);
  assert.deepEqual(MULTI_LINES,{
    multiWelcome:{text:'Velkomin að borðinu! Við skiptumst á.',optional:true},multiTurn:{text:'Næsti kastar!',optional:true},
    multiScored:{text:'Flott! Stigin fara á kortið.',optional:true},multiZero:{text:'Ekkert í þetta sinn. Næst gengur betur!',optional:true},
    multiWait:{text:'Við bíðum aðeins.',optional:true},multiOver:{text:'Leik lokið! Sjáum hver vann.',optional:true}});
  assert.ok(Object.isFrozen(MULTI_LINES)&&Object.values(MULTI_LINES).every(Object.isFrozen),'frozen as VOICE_LINES is');
  for(const [id,line] of Object.entries(MULTI_LINES)){
    assert.equal(line.optional,true,`${id} is optional`);assert.match(line.text,/^\p{Lu}[\p{L} ,]+[.!?](?: \p{Lu}[\p{L} ,]+[.!?])*$/u,`${id}: Icelandic sentences`);
    assert.match(line.text,/[áðéíóúýþæö]/i,`${id}: Icelandic letters`);assert.equal(Object.hasOwn(VOICE_LINES,id),false,`${id} is not one the startup requires`);
  }
  for(const line of Object.values(VOICE_LINES))assert.equal(line.optional,undefined,'the solo script is all required');
});

test('the view of a guest on her turn after one roll: what she may do, her cards with previews, everyone\'s totals',()=>{
  const seats=table(),game=roll(createGame({seed:7,startingPlayer:1,players:playersOf(seats)}));
  const view=yatzyView(game,seats,1,{settled:true,paused:false,lastRoll:{seq:3,by:1}});
  assert.equal(view.screen,'yatzy');assert.equal(view.you,1);assert.equal(view.turn,1);assert.equal(view.round,1);assert.equal(view.rolls,1);
  assert.deepEqual(view.dice,game.dice);assert.deepEqual(view.held,[false,false,false,false,false]);assert.deepEqual(view.roll,{seq:3,by:1});
  assert.deepEqual(can(view),[true,true,true]);
  assert.deepEqual(view.cards.map(card=>card.id),ids);
  const open=previews(game);
  for(const card of view.cards){
    assert.equal(card.label,CATEGORIES.find(category=>category.id===card.id).label);assert.equal(card.score,null);
    assert.equal(card.preview,open[card.id]);assert.equal(typeof card.preview,'number');
    assert.deepEqual(card.faces,scoringDice(card.id,game.dice),'an open card shows the dice that score on it, as the table does');
  }
  assert.deepEqual(view.players,[{seat:0,name:'Egill',avatar:'egill',total:0},{seat:1,name:'Anna',avatar:'sloedla',total:0},{seat:2,name:'Mosi',avatar:'mosi',total:0}]);
  assert.equal(view.winner,null);assert.equal('paused' in view,false,'paused is said only when it is so');
  assert.equal(JSON.stringify(view).includes('anna-phone'),false,'a guest\'s id is her secret');
});

test('the cards are the ones of the player on turn: a filled card has its score and the dice that filled it',()=>{
  const seats=table();let game=createGame({seed:11,startingPlayer:1,players:playersOf(seats)});
  for(let turn=0;turn<3;turn++)game=score(roll(game),ids[turn]); // Anna pair, Mosi twoPairs, Egill threeKind
  assert.equal(game.currentPlayer,1);
  const before=yatzyView(game,seats,1,still);
  assert.deepEqual(before.cards.map(card=>card.preview),[null,null,null,null,null],'nothing to preview before a roll');
  assert.equal(before.cards[0].score,game.players[1].scores.pair);assert.deepEqual(before.cards[0].faces,game.players[1].faces.pair);
  assert.deepEqual(before.cards[1].faces,[],'an open card before a roll has no dice of its own');
  assert.equal(before.round,2);
  game=roll(game);const view=yatzyView(game,seats,2,still);
  assert.equal(view.cards[0].preview,null,'a filled card has no preview');assert.equal(view.cards[1].preview,previews(game).twoPairs);
  assert.deepEqual(view.players.map(player=>player.total),game.players.map(player=>totals(player.scores).total));
  assert.deepEqual(can(view),[false,false,false],'Mosi\'s seat sees Anna play');
  seats.join({guestId:'dora-phone',name:'Dóra',avatar:'gramedla'});
  assert.equal(yatzyView(game,seats,1,still).players.length,3,'a guest seated since is not in this game');
});

test('a view for a seat that is not on turn, or while the dice move, or paused, allows nothing',()=>{
  const seats=table();let game=roll(createGame({seed:7,startingPlayer:1,players:playersOf(seats)}));
  assert.deepEqual(can(yatzyView(game,seats,0,still)),[false,false,false]);
  assert.deepEqual(can(yatzyView(game,seats,1,{...still,settled:false})),[false,false,false]);
  const paused=yatzyView(game,seats,1,{...still,paused:true});
  assert.deepEqual(can(paused),[false,false,false]);assert.equal(paused.paused,true);
  for(let i=0;i<5;i++)game=hold(game,i,true);
  assert.deepEqual(can(yatzyView(game,seats,1,still)),[false,true,true],'all held: hold or pick, no roll');
  game=roll(roll(hold(game,0,false)));
  assert.equal(game.rollCount,3);assert.deepEqual(can(yatzyView(game,seats,1,still)),[false,false,true],'three rolls: only a card');
  assert.deepEqual(can(yatzyView(createGame({players:playersOf(seats)}),seats,0,still)),[true,false,false],'before a roll: only the cup');
});

test('actOf lets through only what the rules allow now',()=>{
  const seats=createSeats();seats.join({guestId:'anna-phone',name:'Anna',avatar:'sloedla'});
  let game=createGame({seed:5,startingPlayer:1,players:playersOf(seats)});
  assert.deepEqual(actOf(game,1,{type:'roll'},{settled:true}),{type:'roll'});
  assert.equal(actOf(game,1,{type:'roll'},{settled:false}),null,'the dice move');
  assert.equal(actOf(game,0,{type:'roll'},{settled:true}),null,'not her turn');
  assert.equal(actOf(game,1,{type:'hold',die:0},{settled:true}),null,'nothing to hold before a roll');
  assert.equal(actOf(game,1,{type:'score',card:'pair'},{settled:true}),null,'nothing to score before a roll');
  game=roll(game);
  assert.deepEqual(actOf(game,1,{type:'hold',die:2},{settled:true}),{type:'hold',die:2});
  for(const die of [5,-1,2.5,'2',null])assert.equal(actOf(game,1,{type:'hold',die},{settled:true}),null,`die ${die}`);
  for(const act of [null,undefined,'roll',{},{type:'bogus'},{type:'score'},{type:'score',card:'chance'},{type:'score',card:'__proto__'}])assert.equal(actOf(game,1,act,{settled:true}),null,JSON.stringify(act));
  assert.deepEqual(actOf(game,1,{type:'score',card:'pair',extra:1},{settled:true}),{type:'score',card:'pair'},'normalised');
  assert.deepEqual(actOf(game,1,{type:'roll',again:true},{settled:true}),{type:'roll'});
  let all=game;for(let i=0;i<5;i++)all=hold(all,i,true);
  assert.equal(actOf(all,1,{type:'roll'},{settled:true}),null,'all held');
  game=roll(roll(game));
  assert.equal(actOf(game,1,{type:'roll'},{settled:true}),null,'no roll left');
  assert.equal(actOf(game,1,{type:'hold',die:0},{settled:true}),null,'no holding after the third roll');
  game=score(game,'pair');game=score(roll(game),'pair');game=roll(game); // Egill's pair, and Anna's turn again
  assert.equal(actOf(game,1,{type:'score',card:'pair'},{settled:true}),null,'a filled card');
  assert.deepEqual(actOf(game,1,{type:'score',card:'twoPairs'},{settled:true}),{type:'score',card:'twoPairs'});
});

test('a kept Fjölspil game reads back only when its seats fit its state',()=>{
  const seats=table(),storage=memory(),state=roll(createGame({seed:9,players:playersOf(seats)})),snapshot=seats.snapshot();
  keepFjolspil(storage,{state,seats:snapshot});
  assert.ok(storage.map.has(SAVE_KEY));
  assert.deepEqual(readFjolspil(storage),{state,seats:snapshot});
  keepFjolspil(storage,{state,seats:{...snapshot,seats:snapshot.seats.slice(0,-1)}});
  assert.equal(readFjolspil(storage),null,'one seat fewer than players');assert.equal(storage.map.has(SAVE_KEY),false,'a broken game is let go');
  const solo=createGame({seed:9}),two=createSeats();two.join({guestId:'anna-phone',name:'Anna',avatar:'sloedla'});
  keepFjolspil(storage,{state:solo,seats:two.snapshot()});
  assert.equal(readFjolspil(storage),null,'the solo game\'s players are not seats');
  const swapped=structuredClone(snapshot);swapped.seats.reverse();
  keepFjolspil(storage,{state,seats:swapped});assert.equal(readFjolspil(storage),null,'Egill is in the first seat');
  keepFjolspil(storage,{state:{...state,rollCount:7},seats:snapshot});assert.equal(readFjolspil(storage),null,'a state the rules refuse');
  storage.setItem(SAVE_KEY,'{not json');assert.equal(readFjolspil(storage),null);assert.equal(storage.map.has(SAVE_KEY),false);
  assert.equal(readFjolspil(memory()),null,'nothing kept');
  keepFjolspil(storage,{state,seats:snapshot});forgetFjolspil(storage);assert.equal(storage.map.has(SAVE_KEY),false);
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  assert.doesNotThrow(()=>keepFjolspil(blocked,{state,seats:snapshot}));assert.equal(readFjolspil(blocked),null);assert.doesNotThrow(()=>forgetFjolspil(blocked));
});

test('a kept Fjölspil game whose seat list is damaged is let go, never thrown at the table',()=>{
  const seats=table(),storage=memory(),state=roll(createGame({seed:9,players:playersOf(seats)})),snapshot=seats.snapshot();
  const damaged=change=>{const copy=structuredClone(snapshot);change(copy.seats);keepFjolspil(storage,{state,seats:copy});return readFjolspil(storage);};
  assert.equal(damaged(list=>{list[1]=null;}),null,'a null seat');assert.equal(storage.map.has(SAVE_KEY),false,'and it is let go');
  assert.equal(damaged(list=>{list[2].kind='x';}),null,'a seat of a kind the seats do not have');assert.equal(storage.map.has(SAVE_KEY),false);
  for(const [why,change] of [['a seat that is a list',list=>{list[1]=[];}],['a seat that is a word',list=>{list[1]='Anna';}],['a nameless seat',list=>{list[1].name='';}],
    ['no name',list=>{delete list[2].name;}],['an avatar that is not a word',list=>{list[1].avatar=7;}],['a second Egill',list=>{list[2].kind='host';}]]){
    assert.equal(damaged(change),null,why);assert.equal(storage.map.has(SAVE_KEY),false,why);
  }
  seats.presence(1,false);seats.cover(1);const covered=seats.snapshot();
  keepFjolspil(storage,{state,seats:covered});assert.deepEqual(readFjolspil(storage),{state,seats:covered},'a seat Mosi covers is whole');
  assert.equal(createSeats({from:readFjolspil(storage).seats}).count,3,'and a whole one seats its table again');
});

test('the winner in the view is a seat number or tie',()=>{
  const seats=createSeats();seats.join({guestId:'anna-phone',name:'Anna',avatar:'sloedla'});
  const finished=(you,anna)=>{
    const game=createGame({players:playersOf(seats)});
    for(const id of ids){game.players[0].scores[id]=you[id]??0;game.players[1].scores[id]=anna[id]??0;}
    Object.assign(game,{turnCount:maxTurns(2),currentPlayer:0,status:'finished'});
    const [a,b]=game.players.map(player=>totals(player.scores).total);game.winner=a===b?'tie':a>b?'0':'1';
    validateGame(game);return game;
  };
  const over=finished({pair:4},{yatzy:50}),anna=yatzyView(over,seats,1,still);
  assert.equal(anna.winner,1);assert.deepEqual(can(anna),[false,false,false]);assert.equal(anna.round,5);
  assert.deepEqual(anna.players.map(player=>player.total),[4,50]);
  assert.equal(yatzyView(finished({pair:12},{pair:4}),seats,1,still).winner,0);
  assert.equal(yatzyView(finished({},{}),seats,0,still).winner,'tie');
  assert.equal(over.currentPlayer,0);assert.deepEqual(can(yatzyView(over,seats,0,still)),[false,false,false],'a finished game allows nothing, not even its current player');
  for(const act of [{type:'roll'},{type:'hold',die:0},{type:'score',card:'pair'}])assert.equal(actOf(over,0,act,{settled:true}),null,`${act.type} after the end`);
});

test('a finished game of seats is never offered again, and forgetting lets the kept one go',()=>{
  const seats=table(),storage=memory(),snapshot=seats.snapshot();
  let game=createGame({seed:13,players:playersOf(seats)});
  while(game.status==='playing')game=score(roll(game),ids.find(id=>game.players[game.currentPlayer].scores[id]===null));
  assert.equal(game.turnCount,maxTurns(3));validateGame(game);
  keepFjolspil(storage,{state:game,seats:snapshot});
  assert.equal(readFjolspil(storage),null,'a finished game is not offered');assert.equal(storage.map.has(SAVE_KEY),false,'and is let go');
  const playing=roll(createGame({seed:13,players:playersOf(seats)}));
  keepFjolspil(storage,{state:playing,seats:snapshot});assert.ok(readFjolspil(storage));
  forgetFjolspil(storage);assert.equal(storage.map.has(SAVE_KEY),false);assert.equal(readFjolspil(storage),null);
  storage.setItem('mosi.yatzy.junior.save.v1','{"solo":true}');forgetFjolspil(storage);
  assert.equal(storage.getItem('mosi.yatzy.junior.save.v1'),'{"solo":true}','the solo save is the child\'s and stays');
});

test('a seat\'s turn is played as the seat is: at the big screen, from a phone, waited for, or by the computer',()=>{
  const seats=table();
  assert.equal(phaseOf(seats.bySeat(0)),'human','Egill at the big screen');
  assert.equal(phaseOf(seats.bySeat(1)),'remote','Anna from her phone');
  assert.equal(phaseOf(seats.bySeat(2)),'ai-wait','Mosi by himself');
  seats.presence(1,false);assert.equal(phaseOf(seats.bySeat(1)),'waiting','her phone has gone: the waiting card');
  seats.cover(1);assert.equal(phaseOf(seats.bySeat(1)),'ai-wait','"Halda áfram án …": the computer plays her seat');
  seats.presence(1,true);assert.equal(phaseOf(seats.bySeat(1)),'waiting','she is back: the wait gives her seat back at once');
  assert.equal(phaseOf(seats.bySeat(1),{going:true}),'ai-wait','back in the middle of a turn Mosi plays for her: he finishes it (spec §11)');
  assert.equal(phaseOf(seats.bySeat(2),{going:true}),'ai-wait');assert.equal(phaseOf(seats.bySeat(0),{going:true}),'human');
  seats.uncover(1);assert.equal(phaseOf(seats.bySeat(1)),'remote');
  assert.equal(phaseOf(seats.bySeat(1),{going:true}),'remote');seats.presence(1,false);assert.equal(phaseOf(seats.bySeat(1),{going:true}),'waiting','gone while her dice rolled: waited for');
  assert.equal(phaseOf(null),'ai-wait');assert.equal(phaseOf(undefined),'ai-wait');
});
