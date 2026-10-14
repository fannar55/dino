import test from 'node:test';
import assert from 'node:assert/strict';
import {shuffled,boardResult,playSquare,chooseRexSquare,suggestSquare,memoryDeck,reedSequence,checkTone,createPausableScheduler} from '../dist/mini-game-rules.js';

test('three in a row rules reject occupied/out-of-range moves and distinguish draws',()=>{
 let b=Array(9).fill(null);b=playSquare(b,0,'X');assert.equal(playSquare(b,0,'O'),null);assert.equal(playSquare(b,-1,'X'),null);assert.equal(playSquare(b,9,'X'),null);assert.equal(playSquare(b,2,'Z'),null);
 assert.deepEqual(boardResult(['X','X','X',null,'O',null,'O',null,null]),{winner:'X',line:[0,1,2]});
 assert.equal(boardResult(['X','O','X','X','O','O','O','X','X']).winner,'draw');
 assert.equal(playSquare(['O','O','O',null,'X',null,'X',null,null],3,'X'),null);
});
test('Rex sometimes overlooks an immediate block or win, but still recognizes them on careful turns',()=>{
 const block=['X','X',null,null,'O',null,null,null,null],win=['O','O',null,'X','X',null,null,null,'X'];
 assert.notEqual(chooseRexSquare(block,0),2,'A distracted Rex leaves a clear chance for the child');
 assert.equal(chooseRexSquare(block,1),2,'Careful Rex still notices a row');
 assert.equal(chooseRexSquare(win,0),2,'Careful Rex can still win honestly');
 assert.notEqual(chooseRexSquare(win,1),2,'Rex also sometimes misses his own opportunity');
 assert.notEqual(chooseRexSquare(block,1,{practice:true}),2,'Practice overlooks a threat that default play would block');
 assert.equal(chooseRexSquare(block,3,{practice:true}),2,'Practice retains an occasional attentive move');
 for(const board of[block,win])for(let round=0;round<12;round++)for(const practice of[false,true]){
  const copy=[...board],move=chooseRexSquare(board,round,{practice});assert.deepEqual(board,copy);assert.equal(board[move],null);assert.equal(chooseRexSquare(board,round,{practice}),move,'Replay behavior is deterministic');
 }
});

test('every replay allows real child wins, all moves stay legal, and practice is measurably gentler',()=>{
 const rates={default:0,practice:0};
 for(let round=0;round<12;round++)for(const practice of[false,true]){
  let states=0;
  function outcomes(board){
   states++;const totals={X:0,O:0,draw:0},available=board.flatMap((value,index)=>value?[]:[index]);
   for(const index of available){
    let next=playSquare(board,index,'X'),result=boardResult(next);
    if(!result){const before=[...next],move=chooseRexSquare(next,round,{practice});assert.ok(Number.isInteger(move)&&move>=0&&move<9);assert.equal(next[move],null);assert.deepEqual(next,before,'Rex must not alter earlier moves');next=playSquare(next,move,'O');result=boardResult(next);}
    const branch=result?{X:Number(result.winner==='X'),O:Number(result.winner==='O'),draw:Number(result.winner==='draw')}:outcomes(next);
    for(const winner of Object.keys(totals))totals[winner]+=branch[winner]/available.length;
   }
   return totals;
  }
  // Uniform legal child moves are a repeatable difficulty probe, not a claim
  // about how often actual children will win. A real line determines every end.
  const result=outcomes(Array(9).fill(null));assert.ok(states>20);assert.ok(result.X>(practice?.4:.2),`round ${round} must offer frequent real chances`);assert.ok(result.O>0&&result.draw>0);assert.ok(Math.abs(result.X+result.O+result.draw-1)<1e-10);rates[practice?'practice':'default']+=result.X/12;
 }
 assert.ok(rates.default>.25,'Default Rex cannot regress to near-perfect tactics');
 assert.ok(rates.practice>rates.default+.15,'Practice must be meaningfully softer');
 assert.equal(chooseRexSquare(['X','X','X',null,'O',null,'O',null,null]),-1);
 assert.equal(chooseRexSquare(['X','O','X','X','O','O','O','X','X']),-1);
});

test('Rex help suggests an actual winning square or a necessary block, never places it',()=>{
 const b=['X','X',null,'O',null,null,'O',null,null],copy=[...b];assert.equal(suggestSquare(b),2);assert.deepEqual(b,copy);
 assert.equal(suggestSquare(['O','O',null,'X',null,null,null,'X',null]),2);
});
test('replay changes layouts while preserving all pair and tone constraints',()=>{
 const layouts=new Set();for(let round=0;round<16;round++){const deck=memoryDeck(round);layouts.add(deck.join(''));assert.equal(deck.length,12);for(let t=0;t<6;t++)assert.equal(deck.filter(x=>x===t).length,2);const song=reedSequence(round);assert.equal(song.length,5);assert.equal(new Set(song).size,3);assert.ok(song.every(t=>Number.isInteger(t)&&t>=0&&t<3));assert.ok(new Set(song).size<song.length);assert.deepEqual(shuffled([1,2,3,4],round),shuffled([1,2,3,4],round));}assert.ok(layouts.size>4);
 const seq=[2,0,1];assert.deepEqual(checkTone(seq,[],0),{correct:false,complete:false});assert.deepEqual(checkTone(seq,[2,0],1),{correct:true,complete:true});assert.equal(checkTone(seq,[2,0,1],1).complete,false);
});
test('delayed notes and turns retain their remaining time over pause, and dispose cancels them',()=>{
 let now=0,id=0;const timers=new Map(),events=[];const clock=createPausableScheduler({now:()=>now,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimer:key=>timers.delete(key)});
 const advance=ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;break;}now=next[1].at;timers.delete(next[0]);next[1].fn();}};
 clock.after(()=>events.push('note'),1000);advance(350);clock.setPaused(true);advance(9999);assert.deepEqual(events,[]);clock.setPaused(false);advance(649);assert.deepEqual(events,[]);advance(1);assert.deepEqual(events,['note']);clock.after(()=>events.push('late-win'),50);clock.dispose();advance(100);assert.deepEqual(events,['note']);assert.equal(clock.pending,0);
});
