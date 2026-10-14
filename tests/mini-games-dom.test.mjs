import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import * as rules from '../dist/mini-game-rules.js';
const source=(await readFile(new URL('../dist/mini-games.js',import.meta.url),'utf8'))
 .replace(/^import \{createJigsaw\} from '.\/jigsaw-game.js';/m,'const createJigsaw=__jigsaw;')
 .replace(/^import \{createCloudMath\} from '.\/cloud-math.js';/m,'const createCloudMath=__cloud;')
 .replace(/^import \{createAerialMiniGame\} from '.\/mini-rides.js';/m,'const createAerialMiniGame=__aerial;')
 .replace(/^import \{([^}]+)\} from '.\/mini-game-rules.js';/m,'const {$1}=__rules;')
 .replace('export function createMiniGames','function createMiniGames');
const make=new Function('__rules','__aerial','__jigsaw','__cloud','globalThis',`${source};return createMiniGames;`);
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
function fixture({holdSpeech=false}={}){
 const{document,window}=parseHTML('<div id="host"></div>');Object.defineProperty(document,'hidden',{value:false,writable:true});let now=0,serial=0,muted=false;const timers=new Map(),wins=[],exits=[],progress=[],spoken=[],notes=[],effects=[],audioPauses=[],speech=[];
 const scheduler=()=>rules.createPausableScheduler({now:()=>now,setTimer:(fn,ms)=>{timers.set(++serial,{fn,at:now+ms});return serial;},clearTimer:id=>timers.delete(id)});
 const children=[],puzzles=[],clouds=[];const create=make({...rules,createPausableScheduler:scheduler},(stage,options)=>{const child={options,pauses:[],disposed:false,setPaused(v){this.pauses.push(v);},hint(){this.hints=(this.hints||0)+1;},dispose(){this.disposed=true;}};children.push(child);options.onProgress(0,options.species==='brachiosaurus'?10:5);return child;},context=>{const child={context,pauses:[],disposed:false,setPaused(v){this.pauses.push(v);},hint(){this.hints=(this.hints||0)+1;},dispose(){this.disposed=true;}};puzzles.push(child);context.progress(0,35);return child;},context=>{const child={context,pauses:[],disposed:false,begun:false,setPaused(v){this.pauses.push(v);},begin(){this.begun=true;},hint(){this.hints=(this.hints||0)+1;},dispose(){this.disposed=true;}};clouds.push(child);context.progress(0,5);context.message('Reiknum áður en rignir.');return child;},{localStorage:{setItem(){}}});
 const mini=create(document.getElementById('host'),{audio:{effect:n=>effects.push(n),star:n=>notes.push(n),animal(){},stopNarration(){speech.splice(0).forEach(resolve=>resolve(false));},setPaused:v=>audioPauses.push(v),isMuted:()=>muted,setMuted:v=>muted=v},speak:id=>{spoken.push(id);return holdSpeech?new Promise(resolve=>speech.push(resolve)):Promise.resolve(true);},onWin:s=>wins.push(s),onExit:s=>exits.push(s),onProgress:p=>progress.push(p)});
 return{document,mini,wins,exits,progress,spoken,notes,effects,audioPauses,children,puzzles,clouds,
  async start(species,options){assert.equal(mini.start(species,options),true);await flush();},
  async click(selector){const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new window.Event('click',{bubbles:true}));await flush();},
  async advance(ms){const end=now+ms;for(let i=0;i<10000;i++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;await flush();return;}now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}throw Error('timer runaway');},
  async hidden(value){document.hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));await flush();},
  async finishSpeech(){speech.splice(0).forEach(resolve=>resolve(true));await flush();},
 };
}
test('shell delegates the 35-piece jigsaw and preserves pause, hint, win-once and stale callback guards',async()=>{
 const g=fixture();await g.start('stegosaurus');const child=g.puzzles[0];assert.equal(g.progress.at(-1).total,35);assert.equal(g.document.querySelector('[data-piece]'),null);await g.click('.mini-help');assert.equal(child.hints,1);g.mini.setPaused(true);child.context.win();assert.equal(g.wins.length,0);g.mini.setPaused(false);child.context.progress(35,35);child.context.win();child.context.win();assert.deepEqual(g.wins,['stegosaurus']);await g.start('spinosaurus');assert.equal(child.disposed,true);child.context.progress(12,35);child.context.win();assert.deepEqual(g.progress.at(-1),{species:'spinosaurus',current:0,total:6});assert.equal(g.wins.length,1);g.mini.dispose();
});

test('exit disposes the jigsaw and prevents its late reward',async()=>{
 const g=fixture();await g.start('stegosaurus');const child=g.puzzles[0];await g.click('.mini-back');assert.equal(child.disposed,true);child.context.win();await g.advance(5000);assert.deepEqual(g.exits,['stegosaurus']);assert.deepEqual(g.wins,[]);assert.equal(g.document.querySelector('.mini-game'),null);g.mini.dispose();
});

test('memory mismatches teach without reward, rapid third taps are ignored and hidden time cannot flip cards',async()=>{
 const g=fixture();await g.start('spinosaurus');const deck=rules.memoryDeck(0),a=0,b=deck.findIndex(v=>v!==deck[a]);await g.click(`[data-card="${a}"]`);await g.click(`[data-card="${b}"]`);await g.click('[data-card="5"]');assert.equal(g.document.querySelectorAll('.is-open').length,2);await g.hidden(true);await g.advance(10000);assert.equal(g.document.querySelectorAll('.is-open').length,2);await g.hidden(false);await g.advance(1150);assert.equal(g.document.querySelectorAll('.is-open').length,0);assert.equal(g.wins.length,0);
 for(let fish=0;fish<6;fish++){for(const i of deck.map((v,i)=>v===fish?i:-1).filter(i=>i>=0))await g.click(`[data-card="${i}"]`);await g.advance(350);}assert.deepEqual(g.wins,['spinosaurus']);assert.equal(g.progress.at(-1).current,6);g.mini.dispose();
});
test('memory hint reveals information only, without granting pairs or stars',async()=>{
 const g=fixture();await g.start('spinosaurus');await g.click('.mini-help');assert.equal(g.document.querySelectorAll('.is-open').length,12);assert.equal(g.progress.at(-1).current,0);await g.advance(1900);assert.equal(g.document.querySelectorAll('.is-open').length,0);assert.equal(g.wins.length,0);g.mini.dispose();
});

test('all six fish pairs differ by visible markings as well as color',async()=>{
 const g=fixture();await g.start('spinosaurus');const cards=[...g.document.querySelectorAll('.mini-card-face svg')];assert.equal(cards.length,12);const markings=cards.map(node=>node.innerHTML.replace(/#[0-9a-f]{3,8}/gi,'color'));assert.equal(new Set(markings).size,6);for(const shape of new Set(markings))assert.equal(markings.filter(v=>v===shape).length,2);g.mini.dispose();
});
function findRexPath(goal,round=0,board=Array(9).fill(null),path=[],practice=false){for(let i=0;i<9;i++){const next=rules.playSquare(board,i,'X');if(!next)continue;let result=rules.boardResult(next);if(result){if(result.winner===goal)return[...path,i];continue;}const reply=rules.playSquare(next,rules.chooseRexSquare(next,round,{practice}),'O');result=rules.boardResult(reply);if(result){if(result.winner===goal)return[...path,i];continue;}const found=findRexPath(goal,round,reply,[...path,i],practice);if(found)return found;}return null;}
test('Rex legal turns pause correctly; an actual player line is required for reward',async()=>{
 const g=fixture();await g.start('trex');const path=findRexPath('X');assert.ok(path);await g.click(`[data-square="${path[0]}"]`);await g.click(`[data-square="${path[1]}"]`);assert.equal(g.document.querySelectorAll('.mini-cell svg').length,1);g.mini.setPaused(true);await g.advance(4000);assert.equal(g.document.querySelectorAll('.mini-cell svg').length,1);g.mini.setPaused(false);await g.advance(650);
 for(const i of path.slice(1)){await g.click(`[data-square="${i}"]`);await g.advance(650);}assert.deepEqual(g.wins,['trex']);assert.equal(g.document.querySelectorAll('.line-win').length,3);g.mini.dispose();
});
test('a Rex draw offers retry/help rather than treating it as victory',async()=>{
 const g=fixture();await g.start('trex');const path=findRexPath('draw');assert.ok(path);for(const i of path){await g.click(`[data-square="${i}"]`);await g.advance(650);}assert.equal(g.wins.length,0);assert.match(g.document.querySelector('.mini-status p').textContent,/Jafntefli/);await g.click('.mini-rex-retry button');assert.equal(g.document.querySelectorAll('.mini-cell svg').length,0);await g.click('.mini-help');assert.equal(g.document.querySelectorAll('.mini-cell.hinted').length,1);assert.equal(g.wins.length,0);g.mini.dispose();
});

test('Rex practice is an explicit post-game choice and still needs a real winning line',async()=>{
 const g=fixture();await g.start('trex');assert.equal(g.document.querySelector('.mini-practice'),null);for(const i of findRexPath('draw')){await g.click(`[data-square="${i}"]`);await g.advance(650);}assert.equal(g.wins.length,0);await g.click('.mini-help');assert.ok(g.document.querySelector('.mini-practice.hinted'));await g.click('.mini-practice');assert.equal(g.document.querySelector('.mini-stage').dataset.rexMode,'practice');assert.equal(g.document.querySelectorAll('.mini-cell svg').length,0);assert.equal(g.wins.length,0);const path=findRexPath('X',1,Array(9).fill(null),[],true);assert.ok(path);for(const i of path){await g.click(`[data-square="${i}"]`);await g.advance(650);}assert.deepEqual(g.wins,['trex']);assert.equal(g.document.querySelectorAll('.line-win').length,3);g.mini.dispose();
});

test('Rex reaches with his tiny arm on a real move, and pausing freezes the reaction interval',async()=>{
 const g=fixture();await g.start('trex');assert.equal(g.document.querySelector('.mini-status strong').hidden,true,'Turn-based game does not pretend collected-item progress');assert.ok(g.document.querySelector('.mini-rex-art .mini-rex-teeth'));assert.ok(g.document.querySelector('.mini-rex-arm'));await g.click('[data-square="0"]');await g.advance(650);assert.equal(g.document.querySelectorAll('.mini-cell svg').length,2);assert.ok(g.document.querySelector('.mini-opponent.is-moving'));g.mini.setPaused(true);await g.advance(5000);assert.ok(g.document.querySelector('.mini-opponent.is-moving'));g.mini.setPaused(false);await g.advance(600);assert.equal(g.document.querySelector('.mini-opponent.is-moving'),null);assert.equal(g.wins.length,0);await g.start('spinosaurus');assert.equal(g.document.querySelector('.mini-status strong').hidden,false);g.mini.dispose();
});
test('reed game waits for narration, then requires three, four and five correct tones including repeats',async()=>{
 const g=fixture({holdSpeech:true});await g.start('parasaurolophus');await g.advance(5000);assert.equal(g.notes.length,0);await g.finishSpeech();await g.advance(2600);const seq=rules.reedSequence(0);assert.deepEqual(g.notes.map(n=>n.index),seq.slice(0,3));await g.click(`[data-tone="${(seq[0]+1)%3}"]`);assert.equal(g.wins.length,0);await g.advance(4300);for(const t of seq.slice(0,3))await g.click(`[data-tone="${t}"]`);assert.equal(g.progress.at(-1).current,1);assert.equal(g.wins.length,0);
 await g.click('.mini-help');const count=g.notes.length;await g.advance(10000);assert.equal(g.notes.length,count,'Help narration cannot mask the pattern');await g.finishSpeech();await g.advance(4750);for(const t of seq.slice(0,4))await g.click(`[data-tone="${t}"]`);assert.equal(g.progress.at(-1).current,2);assert.equal(g.wins.length,0);await g.advance(5200);for(const t of seq)await g.click(`[data-tone="${t}"]`);assert.deepEqual(g.wins,['parasaurolophus']);assert.equal(g.progress.at(-1).current,3);g.mini.dispose();
});

test('shell normalizes aerial progress, gates paused wins and disposes prior games on replay',async()=>{
 const g=fixture();await g.start('brachiosaurus');const child=g.children[0];assert.deepEqual(g.progress.at(-1),{species:'brachiosaurus',current:0,total:10});g.mini.setPaused(true);child.options.onWin();assert.equal(g.wins.length,0);g.mini.setPaused(false);child.options.onWin();child.options.onWin();assert.deepEqual(g.wins,['brachiosaurus']);await g.start('brachiosaurus',{round:2});assert.equal(child.disposed,true);assert.equal(g.children[1].options.round,2);child.options.onProgress(5,6);child.options.onWin();assert.equal(g.wins.length,1,'Disposed child cannot award a new game');assert.deepEqual(g.progress.at(-1),{species:'brachiosaurus',current:0,total:10});await g.click('.mini-mute');assert.equal(g.document.querySelector('.mini-mute').getAttribute('aria-pressed'),'true');g.mini.dispose();assert.equal(g.children[1].disposed,true);
});
test('manual reed replay cancels narration and stale help without doubled patterns',async()=>{
 const g=fixture({holdSpeech:true});await g.start('parasaurolophus');await g.click('.mini-replay');await g.advance(2600);assert.equal(g.notes.length,3);await g.click('.mini-help');await g.advance(10000);assert.equal(g.notes.length,3);await g.click('.mini-replay');await g.advance(2600);await g.finishSpeech();await g.advance(5000);assert.equal(g.notes.length,6,'Cancelled hint must not schedule another song');assert.equal(g.wins.length,0);g.mini.dispose();
});

test('aerial games retain visible Icelandic directions when sound is muted or help is used',async()=>{
 const g=fixture();await g.start('brachiosaurus');assert.match(g.document.querySelector('.mini-status p').textContent,/tíu lauf.*könglana.*körfunni/);await g.click('.mini-mute');await g.click('.mini-help');assert.match(g.document.querySelector('.mini-status p').textContent,/körfunni/);assert.equal(g.children[0].hints,1);await g.start('pteranodon');assert.match(g.document.querySelector('.mini-status p').textContent,/Reiknum/);await g.click('.mini-help');assert.equal(g.clouds[0].hints,1);assert.match(g.document.querySelector('.mini-status p').textContent,/Reiknum/);assert.equal(g.wins.length,0);g.mini.dispose();
});
test('reed narration resolving while paused waits until resume and cannot restart a disposed game',async()=>{
 const g=fixture({holdSpeech:true});await g.start('parasaurolophus');g.mini.setPaused(true);await g.finishSpeech();await g.advance(5000);assert.equal(g.notes.length,0);g.mini.setPaused(false);await g.advance(2600);assert.equal(g.notes.length,3);await g.click('.mini-help');g.mini.dispose();await g.finishSpeech();await g.advance(5000);assert.equal(g.notes.length,3);
});


test('Pteranodon uses the math child, shares spoken questions and ignores disposed rewards',async()=>{
 const g=fixture({holdSpeech:true});await g.start('pteranodon',{round:4});const child=g.clouds[0];assert.equal(g.children.length,0);assert.equal(child.context.round,4);assert.equal(child.begun,false);await g.finishSpeech();assert.equal(child.begun,true);child.context.speak('math_2_plus_1');assert.equal(g.spoken.at(-1),'math_2_plus_1');g.mini.setPaused(true);await child.context.speak('math_1_plus_1');assert.equal(g.spoken.at(-1),'math_2_plus_1');child.context.win();assert.equal(g.wins.length,0);g.mini.setPaused(false);child.context.progress(5,5);child.context.win();child.context.win();assert.deepEqual(g.wins,['pteranodon']);await g.start('trex');assert.equal(child.disposed,true);const spoken=g.spoken.length;await child.context.speak('math_3_plus_2');assert.equal(g.spoken.length,spoken);child.context.win();assert.deepEqual(g.wins,['pteranodon']);g.mini.dispose();
});
