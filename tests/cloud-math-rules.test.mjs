import test from 'node:test';
import assert from 'node:assert/strict';
import {MATH_PROBLEMS,CLOUD_MATH_NARRATION,mathRound,mathChoices,createMathState,answerMath,advanceMath,claimMath} from '../dist/cloud-math.js';

test('all narrated equations and replay rounds have valid quantities, unique choices, increasing range and balanced operations',()=>{
 assert.equal(MATH_PROBLEMS.length,18);assert.equal(new Set(MATH_PROBLEMS.map(p=>p.id)).size,18);
 const coverage=new Set(),orders=new Set();
 for(const p of MATH_PROBLEMS){assert.equal(p.result,p.op==='+'?p.left+p.right:p.left-p.right);for(const n of[p.left,p.right,p.result])assert.ok(Number.isInteger(n)&&n>=0&&n<=10);assert.equal(CLOUD_MATH_NARRATION[p.id],p.phrase);assert.ok(p.phrase.endsWith('?'));}
 for(let round=0;round<100;round++){const run=mathRound(round);orders.add(run.map(p=>p.id).join(','));assert.equal(run.length,5);assert.equal(new Set(run.map(p=>p.id)).size,5);assert.equal(run.filter(p=>p.op==='+').length,round%2?2:3);
  run.forEach((p,index)=>{coverage.add(p.id);if(index<2)assert.ok(Math.max(p.left,p.right,p.result)<=5);const choices=mathChoices(p,round+index);assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);assert.equal(choices.filter(v=>v===p.result).length,1);assert.ok(choices.every(v=>Number.isInteger(v)&&v>=0&&v<=10));});
 }
 assert.equal(coverage.size,18);assert.ok(orders.size>50);
});

test('five genuine answers require a deliberate single claim and mistakes persist across equations',()=>{
 let state=createMathState(0);for(let index=0;index<5;index++){const p=mathRound(state.round)[index];if(index<4){const wrong=mathChoices(p,state.round+index).find(n=>n!==p.result);state=answerMath(state,wrong).state;assert.equal(state.mistakes,index+1);}
  const response=answerMath(state,p.result);assert.equal(response.correct,true);state=response.state;assert.equal(state.correct,index+1);assert.equal(answerMath(state,p.result).accepted,false);assert.equal(claimMath(state)===state,index<4);if(index<4)state=advanceMath(state);
 }
 assert.equal(state.mistakes,4);assert.equal(state.claimed,false);state=claimMath(state);assert.equal(state.claimed,true);assert.equal(state.phase,'won');assert.equal(claimMath(state),state);assert.equal(answerMath(state,0).accepted,false);
});

test('five distinct wrong choices cumulatively lose the attempt; repeat taps cannot charge twice and loss cannot award',()=>{
 let state=createMathState(2);for(let index=0;index<3;index++){const p=mathRound(state.round)[index],wrong=mathChoices(p,state.round+index).filter(n=>n!==p.result);for(const value of wrong){if(state.phase==='lost')break;state=answerMath(state,value).state;const mistakes=state.mistakes;assert.equal(answerMath(state,value).state,state);assert.equal(state.mistakes,mistakes);}
  if(state.phase!=='lost'){state=answerMath(state,p.result).state;state=advanceMath(state);}
 }
 assert.equal(state.mistakes,5);assert.equal(state.correct,2);assert.equal(state.phase,'lost');assert.equal(claimMath(state),state);assert.equal(advanceMath(state),state);for(let n=0;n<=10;n++)assert.equal(answerMath(state,n).accepted,false);
});
