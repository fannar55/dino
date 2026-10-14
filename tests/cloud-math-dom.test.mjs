import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import {createCloudMath,MATH_PROBLEMS,mathRound} from '../dist/cloud-math.js';
import {createPausableScheduler} from '../dist/mini-game-rules.js';

function fixture({round=0,start=true}={}){
 const{document:doc,window}=parseHTML('<html><head></head><body><div id="stage"></div></body></html>');Object.defineProperty(doc,'hidden',{value:false,writable:true});
 let now=0,serial=0,paused=false,stops=0;const timers=new Map(),wins=[],progress=[],spoken=[],notes=[],messages=[];
 const clock=createPausableScheduler({now:()=>now,setTimer:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial;},clearTimer:id=>timers.delete(id)});
 const game=createCloudMath({doc,stage:doc.getElementById('stage'),clock,round,canPlay:()=>!paused,message:text=>messages.push(text),progress:(n,total)=>progress.push([n,total]),win:()=>wins.push(true),speak:id=>{spoken.push(id);return Promise.resolve(true);},stopSpeech:()=>stops++,audio:{star:value=>notes.push(value)},effect(){}});
 const el=selector=>{const node=doc.querySelector(selector);assert.ok(node,selector);return node;};
 const click=selector=>{const node=typeof selector==='string'?el(selector):selector;node.dispatchEvent(new window.Event('click',{bubbles:true}));};
 function advance(ms){const end=now+ms;for(let i=0;i<10000;i++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;return;}now=next[1].at;timers.delete(next[0]);next[1].fn();}throw Error('Timer runaway');}
 if(start)game.begin();
 return{game,doc,spoken,notes,wins,progress,messages,el,click,advance,get stops(){return stops;},problem:()=>MATH_PROBLEMS.find(p=>p.id===game.getState().problem),ready(){advance(3000);assert.equal(game.getState().phase,'answer');},pause(value){paused=value;game.setPaused(value);},hidden(value){doc.hidden=value;doc.dispatchEvent(new window.Event('visibilitychange'));},visibleFish(){return[...doc.querySelectorAll('[data-fish]')].filter(f=>!f.classList.contains('fish-waiting')&&!f.classList.contains('fish-gone'));}};
}

test('actual pictured fish start at the left operand and finish at the result for every bank equation, including zero and ten',()=>{
 const seen=new Set();for(let round=0;round<100&&seen.size<18;round++){const g=fixture({round});for(let index=0;index<5;index++){const p=g.problem();seen.add(p.id);assert.equal(g.visibleFish().length,p.left,`${p.id} before`);assert.equal(g.el('.math-answers').children.length,3);assert.ok([...g.el('.math-answers').children].every(b=>b.disabled));g.ready();assert.equal(g.visibleFish().length,p.result,`${p.id} after`);assert.equal(g.doc.querySelectorAll('[data-remaining="true"]').length,p.result);if(p.op==='−')assert.equal(g.doc.querySelectorAll('.fish-gone').length,p.right);g.click(`[data-answer="${p.result}"]`);if(index<4)g.click('.math-next');}g.game.dispose();}assert.equal(seen.size,18);
});

test('five solved questions never auto-award; next/claim are deliberate and each question locks synchronously',()=>{
 const g=fixture();const ids=[];for(let index=0;index<5;index++){g.ready();const p=g.problem();ids.push(p.id);const correct=g.el(`[data-answer="${p.result}"]`);g.click(correct);g.click(correct);assert.equal(g.game.getState().correct,index+1);assert.equal(g.el('.math-answer-result').textContent,String(p.result));assert.equal(g.el('.math-next').hidden,false);assert.equal(g.wins.length,0);g.advance(20000);assert.equal(g.game.getState().index,index);if(index<4)g.click('.math-next');}
 assert.equal(new Set(ids).size,5);assert.equal(g.el('.math-next').textContent,'Sækja styttuna');g.click('.math-next');g.click('.math-next');assert.equal(g.wins.length,1);assert.deepEqual(g.progress.at(-1),[5,5]);g.game.dispose();
});

test('cloud accumulates five mistakes across equations, deduplicates wrong options and retry starts only a fresh attempt',()=>{
 const g=fixture();let stale;
 for(let index=0;index<3;index++){g.ready();const p=g.problem(),wrong=[...g.el('.math-answers').children].filter(b=>Number(b.dataset.answer)!==p.result);for(const b of wrong){if(g.game.getState().phase==='lost')break;stale=b;g.click(b);const mistakes=g.game.getState().mistakes;g.click(b);assert.equal(g.game.getState().mistakes,mistakes);assert.equal(b.disabled,true);assert.equal(g.doc.querySelectorAll('.math-cloud-pieces .filled').length,mistakes);}if(g.game.getState().phase!=='lost'){g.click(`[data-answer="${p.result}"]`);assert.equal(g.game.getState().mistakes,(index+1)*2);g.click('.math-next');}}
 assert.equal(g.game.getState().phase,'lost');assert.equal(g.game.getState().correct,2);assert.equal(g.game.getState().mistakes,5);assert.equal(g.el('.math-loss').hidden,false);assert.equal(g.spoken.at(-1),'math_rain');assert.equal(g.wins.length,0);const count=g.notes.length;g.advance(10000);assert.equal(g.notes.length,count);g.pause(true);g.click('.math-retry');assert.equal(g.game.getState().phase,'lost');g.pause(false);g.click('.math-retry');assert.equal(g.game.getState().mistakes,0);assert.equal(g.game.getState().correct,0);assert.equal(g.el('.math-loss').hidden,true);g.ready();g.click(stale);assert.equal(g.game.getState().mistakes,0,'Old removed choice cannot charge the new attempt');assert.equal(g.wins.length,0);g.game.dispose();
});

test('pause and hidden tabs freeze both fish movement and counting; hints do not choose or award an answer',()=>{
 const g=fixture();g.advance(600);g.pause(true);g.advance(10000);assert.equal(g.game.getState().phase,'moving');assert.equal(g.visibleFish().length,g.problem().left);assert.ok(g.el('.cloud-math').classList.contains('math-paused'));g.pause(false);g.ready();const before=g.game.getState();g.game.prepareHint();g.game.hint();g.advance(100);assert.equal(g.notes.length,1);g.hidden(true);g.advance(10000);assert.equal(g.notes.length,1);g.hidden(false);g.advance(10000);assert.equal(g.notes.length,g.problem().result);assert.equal(g.game.getState().correct,before.correct);assert.equal(g.game.getState().mistakes,before.mistakes);assert.equal(g.el('.math-answer-result').textContent,'?');assert.equal(g.wins.length,0);g.game.dispose();
});

test('manual repeat and help before initial narration settles own the start and cannot be restarted by late begin',()=>{
 const repeat=fixture({start:false});repeat.click('.math-repeat');assert.equal(repeat.spoken.length,1);repeat.advance(800);repeat.game.begin();assert.equal(repeat.spoken.length,1);repeat.ready();assert.equal(repeat.game.getState().correct,0);repeat.game.dispose();
 const help=fixture({start:false});help.game.prepareHint();help.game.hint();help.advance(100);help.game.begin();assert.equal(help.spoken.length,0);assert.equal(help.notes.length,1);assert.equal(help.game.getState().phase,'answer');help.advance(10000);assert.equal(help.notes.length,help.problem().result);help.game.dispose();
});

test('repeating a question retains mistakes/rejected choices and disposal cancels scheduled work and controls',()=>{
 const g=fixture();g.ready();const p=g.problem(),wrong=[...g.el('.math-answers').children].find(b=>Number(b.dataset.answer)!==p.result);const rejected=Number(wrong.dataset.answer);g.click(wrong);g.click('.math-repeat');g.ready();assert.equal(g.game.getState().mistakes,1);assert.equal(g.el(`[data-answer="${rejected}"]`).disabled,true);g.game.prepareHint();g.game.hint();const button=g.el(`[data-answer="${p.result}"]`),notes=g.notes.length,stops=g.stops;g.game.dispose();g.advance(10000);g.click(button);g.game.begin();g.game.hint();assert.equal(g.notes.length,notes);assert.equal(g.wins.length,0);assert.equal(g.doc.querySelector('.cloud-math'),null);assert.equal(g.stops,stops+1);
});

test('empty-basket help shows zero without awarding and pending hidden help resumes only when visible',()=>{
 const round=Array.from({length:100},(_,i)=>i).find(r=>mathRound(r).some(p=>p.result===0));const g=fixture({round});while(g.problem().result!==0){g.ready();g.click(`[data-answer="${g.problem().result}"]`);g.click('.math-next');}g.ready();g.hidden(true);g.game.hint();g.advance(10000);assert.equal(g.el('.math-count-bubble').hidden,true);g.hidden(false);assert.equal(g.el('.math-count-bubble').textContent,'0');assert.equal(g.el('.math-count-bubble').hidden,false);assert.equal(g.game.getState().phase,'answer');assert.equal(g.el('.math-next').hidden,true);assert.equal(g.wins.length,0);g.game.dispose();
});
