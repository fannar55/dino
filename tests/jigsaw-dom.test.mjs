import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import {createJigsaw,createJigsawState,rotateJigsawPiece,placeJigsawPiece} from '../dist/jigsaw-game.js';
import {createPausableScheduler} from '../dist/mini-game-rules.js';

function fixture({store=new Map(),hidden=false}={}){
 const{document:doc,window}=parseHTML('<html><head></head><body><div id="stage"></div></body></html>');Object.defineProperty(doc,'hidden',{value:hidden,writable:true});
 const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
 let now=0,serial=0,paused=hidden;const timers=new Map(),wins=[],progress=[],messages=[],effects=[];
 const clock=createPausableScheduler({now:()=>now,setTimer:(fn,ms)=>{timers.set(++serial,{fn,at:now+ms});return serial;},clearTimer:id=>timers.delete(id)});
 const game=createJigsaw({doc,stage:doc.getElementById('stage'),audio:{animal(){}},clock,round:0,canPlay:()=>!paused,message:s=>messages.push(s),progress:(n,total)=>progress.push([n,total]),win:()=>wins.push(true),effect:n=>effects.push(n),stopSpeech(){}});
 const el=selector=>{const target=doc.querySelector(selector);assert.ok(target,selector);return target;};
 const emit=(selector,type,properties={})=>{const target=typeof selector==='string'?el(selector):selector,event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);return event;};
 return{doc,game,store,wins,progress,messages,effects,el,emit,click(selector){emit(selector,'click');},rotateToCorrect(id){while(game.getState().turns[id])emit('[aria-label="Snúa valda púslbútnum til hægri"]','click');},
  pause(value){paused=value;game.setPaused(value);clock.setPaused(value);},
  advance(ms){const end=now+ms;for(let i=0;i<10000;i++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;return;}now=next[1].at;timers.delete(next[0]);next[1].fn();}throw Error('Timer runaway');},
 };
}
test('all35 pieces need real position and rotation before a single explicit statue claim',()=>{
 const g=fixture();assert.equal(g.doc.querySelectorAll('[data-picture]').length,3);g.click('[data-picture="golden-forest"]');assert.equal(g.doc.querySelectorAll('[data-piece]').length,35);
 for(const id of g.game.getState().order){g.click(`[data-piece="${id}"]`);g.click(`[data-cell="${(id+1)%35}"]`);const before=g.game.getState().placed.length;
  if(g.game.getState().turns[id]){g.click(`[data-cell="${id}"]`);assert.equal(g.game.getState().placed.length,before);}
  g.rotateToCorrect(id);g.click(`[data-cell="${id}"]`);assert.equal(g.game.getState().placed.length,before+1);
 }
 assert.equal(g.wins.length,0);assert.deepEqual(g.progress.at(-1),[35,35]);assert.equal(g.el('.jigsaw-claim').hidden,false);g.click('.jigsaw-claim');g.click('.jigsaw-claim');assert.equal(g.wins.length,1);g.game.dispose();
});
test('partial exit/reload keeps exact turns and matches; switching pictures does not discard work',()=>{
 const store=new Map(),g=fixture({store});g.click('[data-picture="secret-pond"]');g.click('[data-piece="12"]');g.rotateToCorrect(12);g.click('[data-cell="12"]');g.click('[data-piece="5"]');g.click('[aria-label="Snúa valda púslbútnum til hægri"]');const saved=g.game.getState();g.game.dispose();
 const next=fixture({store});assert.deepEqual(next.game.getState(),saved);next.click('.jigsaw-tools button');next.click('[data-picture="starry-valley"]');assert.equal(next.game.getState().placed.length,0);next.click('.jigsaw-tools button');next.click('[data-picture="secret-pond"]');assert.deepEqual(next.game.getState(),saved);next.game.dispose();
});
test('full unclaimed draft is restored without reward; claiming then replaying starts a new puzzle',()=>{
 let state=createJigsawState('golden-forest');for(let id=0;id<35;id++){state=rotateJigsawPiece(state,id,-state.turns[id]);state=placeJigsawPiece(state,id,id).state;}
 const store=new Map([['mosi.jigsaw.v1.golden-forest',JSON.stringify(state)],['mosi.jigsaw.v1.last','golden-forest']]),g=fixture({store});assert.equal(g.game.getState().placed.length,35);assert.equal(g.wins.length,0);g.click('.jigsaw-claim');assert.equal(g.wins.length,1);g.game.dispose();
 const replay=fixture({store});assert.equal(replay.wins.length,0);replay.click('[data-picture="golden-forest"]');assert.equal(replay.game.getState().placed.length,0);replay.game.dispose();
});
test('hints neither rotate nor place, and paused/disposed controls cannot change the saved puzzle',()=>{
 const g=fixture();g.click('[data-picture="golden-forest"]');g.click('[data-piece="20"]');const before=g.game.getState();g.game.hint();assert.deepEqual(g.game.getState(),before);assert.equal(g.doc.querySelectorAll('.jigsaw-hint').length,1);
 g.pause(true);g.advance(10000);g.click('[aria-label="Snúa valda púslbútnum til hægri"]');g.click('[data-cell="20"]');assert.deepEqual(g.game.getState(),before);assert.equal(g.doc.querySelectorAll('.jigsaw-hint').length,1);g.pause(false);g.advance(6500);assert.equal(g.doc.querySelectorAll('.jigsaw-hint').length,0);
 const rotate=g.el('[aria-label="Snúa valda púslbútnum til hægri"]');g.game.dispose();g.emit(rotate,'click');g.advance(20000);assert.deepEqual(g.game.getState(),before);assert.equal(g.wins.length,0);
});
test('drag snaps at the real board coordinate; horizontal tray swipe scrolls instead of dropping a piece',()=>{
 const g=fixture();g.click('[data-picture="golden-forest"]');g.click('[data-piece="8"]');g.rotateToCorrect(8);
 g.el('.jigsaw-board').getBoundingClientRect=()=>({left:10,top:10,right:570,bottom:410,width:560,height:400});g.el('.jigsaw-viewport').getBoundingClientRect=()=>({left:10,top:10,right:570,bottom:410,width:560,height:400});
 g.emit('[data-piece="8"]','pointerdown',{pointerId:1,clientX:120,clientY:500,button:0});g.emit('[data-piece="8"]','pointermove',{pointerId:1,clientX:130,clientY:130});assert.ok(g.doc.querySelector('.jigsaw-drag-ghost'));g.emit('[data-piece="8"]','pointerup',{pointerId:1,clientX:130,clientY:130});assert.deepEqual(g.game.getState().placed,[8]);
 g.el('.jigsaw-tray').scrollLeft=0;g.emit('[data-piece="2"]','pointerdown',{pointerId:2,clientX:220,clientY:500,button:0});g.emit('[data-piece="2"]','pointermove',{pointerId:2,clientX:100,clientY:505});assert.equal(g.el('.jigsaw-tray').scrollLeft,120);assert.equal(g.doc.querySelector('.jigsaw-drag-ghost'),null);g.emit('[data-piece="2"]','pointerup',{pointerId:2,clientX:100,clientY:505});assert.deepEqual(g.game.getState().placed,[8]);g.game.dispose();
});
test('keyboard rotation and tap fallback work, including a restored draft mounted while hidden',()=>{
 const store=new Map(),g=fixture({store});g.click('[data-picture="secret-pond"]');g.click('[data-piece="7"]');const turn=g.game.getState().turns[7];g.emit('[data-piece="7"]','keydown',{key:'r',shiftKey:false});assert.equal(g.game.getState().turns[7],(turn+1)%4);g.rotateToCorrect(7);g.click('[data-cell="7"]');g.game.dispose();
 const hidden=fixture({store,hidden:true});assert.equal(hidden.game.getState().placed.length,1);hidden.click('[data-piece="9"]');assert.equal(hidden.game.getState().placed.length,1);hidden.doc.hidden=false;hidden.pause(false);hidden.click('[data-piece="9"]');hidden.rotateToCorrect(9);hidden.click('[data-cell="9"]');assert.equal(hidden.game.getState().placed.length,2);hidden.game.dispose();
});

test('whole-picture reference preserves the zoomed and panned board, disables hidden placement, and returns for a hint',()=>{
 const g=fixture();g.click('[data-picture="golden-forest"]');g.click('[data-piece="8"]');g.rotateToCorrect(8);
 const viewport=g.el('.jigsaw-viewport'),board=g.el('.jigsaw-board');
 Object.defineProperties(viewport,{clientWidth:{value:290},clientHeight:{value:190}});viewport.scrollLeft=60;viewport.scrollTop=40;
 g.click('[aria-label="Stækka púslflötinn"]');const view={width:board.style.getPropertyValue('--jigsaw-width'),left:viewport.scrollLeft,top:viewport.scrollTop},before=g.game.getState();
 g.click('[aria-label="Skoða alla myndina"]');assert.equal(g.el('.jigsaw-overview').hidden,false);assert.ok(g.el('.jigsaw-overview img').getAttribute('src').startsWith('data:image/svg+xml;'));assert.equal(viewport.inert,true);
 assert.equal(g.el('[aria-label="Stækka púslflötinn"]').disabled,true);g.click('[aria-label="Stækka púslflötinn"]');g.click('[data-cell="8"]');
 viewport.getBoundingClientRect=()=>({left:0,top:0,right:290,bottom:190});g.emit('[data-piece="8"]','pointerdown',{pointerId:1,clientX:100,clientY:300,button:0});g.emit('[data-piece="8"]','pointermove',{pointerId:1,clientX:100,clientY:5});g.emit('[data-piece="8"]','pointerup',{pointerId:1,clientX:100,clientY:5});
 assert.equal(g.doc.querySelector('.jigsaw-drag-ghost'),null);assert.deepEqual(g.game.getState(),before);
 g.click('[aria-label="Aftur í púslið"]');assert.equal(g.el('.jigsaw-overview').hidden,true);assert.equal(viewport.inert,false);assert.equal(g.el('[aria-label="Stækka púslflötinn"]').disabled,false);
 assert.deepEqual({width:board.style.getPropertyValue('--jigsaw-width'),left:viewport.scrollLeft,top:viewport.scrollTop},view);assert.equal(g.el('[data-piece="8"]').getAttribute('aria-pressed'),'true');
 g.click('[aria-label="Skoða alla myndina"]');g.game.hint();assert.equal(g.el('.jigsaw-overview').hidden,true);assert.equal(g.el('[data-cell="8"]').classList.contains('jigsaw-hint'),true);assert.deepEqual(g.game.getState(),before);
 g.click('[data-cell="8"]');assert.deepEqual(g.game.getState().placed,[8]);g.game.dispose();
});
