import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import * as content from '../dist/mini-content.js';
import * as progress from '../dist/mini-progress.js';
import * as story from '../dist/story.js';
const source=(await readFile(new URL('../dist/dinosaur-club.js',import.meta.url),'utf8'))
 .replace(/^import .*;\r?\n/gm,'').replace('export function createDinosaurClub','function createDinosaurClub');
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
function controlledClock(){
 let now=0,serial=0;const timers=new Map();
 return {performance:{now:()=>now},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},get pending(){return timers.size;},
  async advance(ms){const end=now+ms;for(let i=0;i<10000;i++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;await flush();return;}now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}throw Error('Timer runaway');},
 };
}
function setup({clock=controlledClock(),holdWinSpeech=false}={}){
 const{document,window}=parseHTML('<html><body><dialog></dialog></body></html>'),dialog=document.querySelector('dialog');
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};Object.defineProperty(document,'hidden',{value:false,writable:true});
 let options,awarded=[],spoken=[],closed=0,disposed=0,modelDisposed=0,state={found:[...progress.GAME_SPECIES],games:{}};
 const speech=[];
 const audio={stopNarration(){speech.splice(0).forEach(resolve=>resolve(false));},stopCelebration(){},setPaused(){},effect(){},celebrate(){},animal(){}};
 const factory=new Function('document','createMiniGames','createStatueViewer','MINI_GAMES','STATUE_FACTS','GAME_SPECIES','statueCount','SPECIES','NARRATION','displayText','performance','setTimeout','clearTimeout',source+';return createDinosaurClub;');
 const make=factory(document,(_host,value)=>{options=value;return{start(){},dispose(){disposed++;}};},()=>({ready:Promise.resolve(),dispose(){modelDisposed++;},setPaused(){}}),content.MINI_GAMES,content.STATUE_FACTS,progress.GAME_SPECIES,progress.statueCount,story.SPECIES,story.NARRATION,story.displayText,clock.performance,clock.setTimeout,clock.clearTimeout);
 const club=make(dialog,{getState:()=>state,onAward:id=>{awarded.push(id);state=progress.awardStatue(state,id);},onClose:()=>{closed++;},audio,speak:id=>{spoken.push(id);return holdWinSpeech&&id.endsWith('_win')?new Promise(resolve=>speech.push(resolve)):Promise.resolve(true);}});
 return {club,dialog,document,clock,awarded,spoken,options:()=>options,state:()=>state,stats:()=>({closed,disposed,modelDisposed}),hidden(value){document.hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},click(text){const b=[...dialog.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,'Visible button '+text);b.dispatchEvent(new window.Event('click'));}};
}
test('a completed minigame immediately persists one statue; stale wins cannot duplicate it',()=>{
 const g=setup();g.club.invite('stegosaurus');g.click('Já, leikum!');const current=g.options();current.onWin('stegosaurus');current.onWin('stegosaurus');
 assert.deepEqual(g.awarded,['stegosaurus']);assert.equal(g.state().games.stegosaurus.wins,1);assert.equal(g.dialog.querySelector('h1').textContent,'Ný stytta handa Agli!');
 assert.ok(g.stats().disposed>0);g.club.close();
});
test('exiting an unfinished game grants nothing and disposes its renderer',()=>{
 const g=setup();g.club.invite('pteranodon');g.click('Já, leikum!');g.options().onExit();assert.equal(g.dialog.open,false);assert.deepEqual(g.awarded,[]);assert.equal(g.stats().closed,1);assert.ok(g.stats().modelDisposed>0);
});
test('gallery lets players replay, rotate a figure, view a local fossil image and hear each fact',()=>{
 const g=setup();g.club.invite('trex');g.click('Já, leikum!');g.options().onWin('trex');g.click('Beinagrind');
 assert.equal(g.dialog.querySelector('figure').hidden,false);assert.equal(g.dialog.querySelector('.statue-model').hidden,true);assert.match(g.dialog.querySelector('figure img').src,/assets\/collection\/trex\.webp/);
 for(const fact of content.STATUE_FACTS.trex.facts){g.click(fact.title);assert.equal(g.spoken.at(-1),fact.narration);}
 g.click('Segðu mér meira');assert.equal(g.spoken.at(-1),'statue_trex_more');
 g.click('Spilum aftur');g.options().onWin('trex');assert.equal(g.state().games.trex.wins,2);assert.equal(progress.statueCount(g.state()),1);assert.equal(g.dialog.querySelector('h1').textContent,'Vel gert, Egill!');g.club.close();
});

test('reward narration waits for 2400 visible milliseconds and resumes after a hidden tab',async()=>{
 const g=setup();g.club.invite('stegosaurus');g.click('Já, leikum!');g.options().onWin('stegosaurus');
 await g.clock.advance(1000);g.hidden(true);await g.clock.advance(30000);
 assert.deepEqual(g.spoken,['mini_stegosaurus_invite'],'Hidden time must not consume or drop reward speech');
 assert.equal(g.state().games.stegosaurus.wins,1,'The earned statue is already saved');
 g.hidden(false);await g.clock.advance(1399);assert.equal(g.spoken.length,1,'The remaining visible delay is preserved');
 await g.clock.advance(1);assert.deepEqual(g.spoken,['mini_stegosaurus_invite','mini_stegosaurus_win','mini_statue']);
 await g.clock.advance(10000);assert.equal(g.spoken.length,3,'Resuming must not duplicate either line');
 assert.equal(g.clock.pending,0);g.club.close();
});

test('choosing a fact cancels queued reward speech and closing cancels the next reward',async()=>{
 const g=setup();g.club.invite('trex');g.click('Já, leikum!');g.options().onWin('trex');
 await g.clock.advance(1000);g.click('Stærð');await g.clock.advance(10000);
 assert.deepEqual(g.spoken,['mini_trex_invite','statue_trex_size'],'A chosen fact must not be interrupted by a stale win or statue line');
 assert.equal(g.clock.pending,0);assert.equal(g.state().games.trex.wins,1);
 g.click('Spilum aftur');g.options().onWin('trex');await g.clock.advance(300);g.club.close();await g.clock.advance(10000);
 assert.deepEqual(g.spoken,['mini_trex_invite','statue_trex_size']);assert.equal(g.clock.pending,0);assert.equal(g.state().games.trex.wins,2);
});

test('choosing a fact during win narration suppresses the stale new-statue follow-up',async()=>{
 const g=setup({holdWinSpeech:true});g.club.invite('pteranodon');g.click('Já, leikum!');g.options().onWin('pteranodon');
 await g.clock.advance(2400);assert.equal(g.spoken.at(-1),'mini_pteranodon_win');
 g.click('Sérkenni');await flush();await g.clock.advance(10000);
 assert.deepEqual(g.spoken,['mini_pteranodon_invite','mini_pteranodon_win','statue_pteranodon_special']);
 assert.equal(g.clock.pending,0);g.club.close();
});
