import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,roll,hold,score,scoreCategory,totals,validateGame} from '../engine/yatzy-mosi/rules.js';
import {LESSON_STEPS,createLesson,lessonStep,allowsLessonAction,advanceLesson,rollLesson} from '../engine/yatzy-mosi/tutorial.js';

const at=id=>({index:LESSON_STEPS.findIndex(step=>step.id===id),answer:null,feedback:''});

function finishFirstTurn(){
  let state=createGame({seed:123}),lesson=at('first-roll');
  state=rollLesson(lesson,state);state=hold(state,0,true);state=hold(state,1,true);
  state=rollLesson(at('second-roll'),state);state=hold(state,2,true);
  state=rollLesson(at('third-roll'),state);return score(state,'sixes');
}

test('lesson data is deeply frozen, uniquely identified and offers one clear task per step',()=>{
  assert.equal(new Set(LESSON_STEPS.map(step=>step.id)).size,LESSON_STEPS.length);
  assert.ok(Object.isFrozen(LESSON_STEPS));
  for(const step of LESSON_STEPS){
    assert.ok(Object.isFrozen(step));assert.ok(step.title&&step.copy&&step.task&&step.chapter);
    assert.ok(step.copy.split(/\s+/).length<=35,'copy stays short enough to read aloud');
    for(const hand of [step.hand,step.example].filter(Boolean)){
      assert.ok(Object.isFrozen(hand));assert.equal(hand.length,5);assert.ok(hand.every(face=>Number.isInteger(face)&&face>=1&&face<=6));
    }
    if(step.type==='quiz'){
      assert.ok(Object.isFrozen(step.choices));assert.equal(step.choices.filter(choice=>choice.correct).length,1);
      assert.ok(step.choices.every(choice=>Object.isFrozen(choice)&&choice.label&&choice.feedback));
    }
  }
  assert.throws(()=>{LESSON_STEPS[1].hand[0]=1;},TypeError);
  assert.equal(lessonStep(createLesson()).id,'intro');
  assert.throws(()=>lessonStep({index:-1}),TypeError);
  assert.throws(()=>lessonStep({index:LESSON_STEPS.length}),TypeError);
});

test('the complete lesson exercises real legal actions and preserves alternating scores',()=>{
  let state=createGame({seed:321}),lesson=createLesson(),actions=0;const history=[];
  while(lessonStep(lesson).type!=='finish'){
    const step=lessonStep(lesson);history.push(step.id);assert.ok(++actions<100);
    if(step.type==='next')lesson=advanceLesson(lesson,state,'next');
    else if(step.type==='roll'){
      assert.ok(allowsLessonAction(lesson,state,'roll'));
      const original=state,old=structuredClone(state),normal=roll(state);state=rollLesson(lesson,state);
      assert.deepEqual(original,old,'scripted rolling never mutates its input');
      assert.equal(state.rng,normal.rng);assert.equal(state.rollCount,normal.rollCount);
      assert.deepEqual(state.dice,step.hand);assert.equal(advanceLesson(lesson,state,'roll'),lesson,'starting the roll does not advance before animation');
      lesson=advanceLesson(lesson,state,'rolled');
    }else if(step.type==='hold'){
      for(const index of step.indices){
        assert.ok(allowsLessonAction(lesson,state,'hold',index));state=hold(state,index,step.held);
        const updated=advanceLesson(lesson,state,'hold',index);
        if(!step.indices.every(i=>state.held[i]===step.held))assert.equal(updated,lesson,'wait until both requested dice are held');
        lesson=updated;
      }
    }else if(step.type==='score'){
      assert.ok(allowsLessonAction(lesson,state,'score',step.category));state=score(state,step.category);
      assert.equal(state.players[0].scores[step.category],step.points);lesson=advanceLesson(lesson,state,'score',step.category);
    }else if(step.type==='opponent'){
      assert.equal(allowsLessonAction(lesson,state,'roll'),false,'the human cannot roll for Mosi');
      state=rollLesson(lesson,state);assert.deepEqual(state.dice,[2,2,4,4,5]);
      assert.equal(advanceLesson(lesson,state,'rolled'),lesson);
      state=score(state,step.category);lesson=advanceLesson(lesson,state,'opponentDone');
    }else if(step.type==='quiz'){
      const wrong=step.choices.findIndex(choice=>!choice.correct),correct=step.choices.findIndex(choice=>choice.correct);
      const before=structuredClone(state);lesson=advanceLesson(lesson,state,'answer',wrong);
      assert.equal(lessonStep(lesson).id,step.id);assert.ok(lesson.feedback);assert.equal(allowsLessonAction(lesson,state,'next'),false);
      lesson=advanceLesson(lesson,state,'answer',correct);assert.ok(allowsLessonAction(lesson,state,'next'));
      lesson=advanceLesson(lesson,state,'next');assert.deepEqual(state,before,'quizzes never mutate game scores or dice');
    }
    assert.equal(validateGame(state),true);
  }
  assert.equal(history.length,LESSON_STEPS.length-1);
  assert.equal(state.turnCount,3);assert.equal(state.players[0].scores.sixes,24);assert.equal(state.players[0].scores.fullHouse,13);assert.equal(state.players[1].scores.twoPairs,12);
  assert.equal(totals(state.players[0].scores).total,37);assert.equal(state.rollCount,0);
  for(const action of ['next','rolled','hold','score','opponentDone','answer'])assert.equal(advanceLesson(lesson,state,action,0),lesson,'the finish screen is terminal');
});

test('scripted rolls preserve held faces, input snapshots and real RNG consumption',()=>{
  let state=rollLesson(at('first-roll'),createGame({seed:987}));state=hold(hold(state,0,true),1,true);
  // A held face is sacred even if an outside caller supplies a different valid hand.
  state.dice[0]=5;const before=structuredClone(state),normal=roll(state),actual=rollLesson(at('second-roll'),state);
  assert.deepEqual(state,before);assert.equal(actual.dice[0],5);assert.equal(actual.dice[1],6);
  assert.deepEqual(actual.dice.slice(2),[6,1,4]);assert.equal(actual.rng,normal.rng);assert.deepEqual(actual.held,state.held);
  assert.equal(actual.rollCount,2);assert.equal(validateGame(actual),true);
  assert.throws(()=>rollLesson(at('second-roll'),actual),TypeError,'a double click cannot consume another roll at this step');
  assert.equal(advanceLesson(at('second-roll'),actual,'rolled').index,at('second-roll').index,'an unexpected committed hand cannot silently finish the lesson step');
});

test('hold and release gates accept only the intended unfinished action',()=>{
  const lesson=at('keep-sixes');let state=rollLesson(at('first-roll'),createGame());
  for(const index of [-1,2,3,4,5,NaN,undefined])assert.equal(allowsLessonAction(lesson,state,'hold',index),false);
  for(const action of ['roll','score','next','answer'])assert.equal(allowsLessonAction(lesson,state,action,0),false);
  state=hold(state,0,true);assert.equal(allowsLessonAction(lesson,state,'hold',0),false);assert.equal(advanceLesson(lesson,state,'hold',0),lesson);
  state=hold(state,1,true);assert.notEqual(advanceLesson(lesson,state,'hold',1),lesson);
  const release=at('try-release');assert.ok(allowsLessonAction(release,state,'hold',0));state=hold(state,0,false);
  assert.equal(allowsLessonAction(release,state,'hold',0),false);assert.equal(advanceLesson(release,state,'hold',0).index,release.index+1);
  const third=roll(roll(state));assert.equal(allowsLessonAction(lesson,third,'hold',0),false,'holds cannot be changed after the third roll');
});

test('score and opponent transitions require the expected committed result',()=>{
  let state=createGame();state=rollLesson(at('first-roll'),state);state=hold(hold(state,0,true),1,true);state=rollLesson(at('second-roll'),state);state=hold(state,2,true);state=rollLesson(at('third-roll'),state);
  const lesson=at('score-sixes');assert.ok(allowsLessonAction(lesson,state,'score','sixes'));
  assert.equal(allowsLessonAction(lesson,state,'score','chance'),false);assert.equal(advanceLesson(lesson,state,'score','sixes'),lesson,'a click before scoring does not advance');
  const wrong=score(state,'chance');assert.equal(advanceLesson(lesson,wrong,'score','chance'),lesson);
  state=score(state,'sixes');assert.notEqual(advanceLesson(lesson,state,'score','sixes'),lesson);
  const opponent=at('mosi-turn');assert.equal(advanceLesson(opponent,state,'opponentDone'),opponent);
  const rolled=rollLesson(opponent,state);assert.equal(allowsLessonAction(opponent,rolled,'score','twoPairs'),false);
  assert.throws(()=>rollLesson(opponent,rolled),TypeError,'Mosi receives exactly one demonstration roll');
  assert.equal(advanceLesson(opponent,score(rolled,'pair'),'opponentDone'),opponent);
  assert.notEqual(advanceLesson(opponent,score(rolled,'twoPairs'),'opponentDone'),opponent);
});

test('quiz answers support gentle retries, lock a correct choice and only then allow Next',()=>{
  const state=finishFirstTurn(),lesson=at('pair'),step=lessonStep(lesson),copy=structuredClone(lesson);
  assert.equal(allowsLessonAction(lesson,state,'next'),false);
  for(const invalid of [-1,2,NaN,'1',undefined])assert.equal(advanceLesson(lesson,state,'answer',invalid),lesson);
  const wrong=advanceLesson(lesson,state,'answer',0);assert.equal(wrong.answer,0);assert.equal(wrong.feedback,step.choices[0].feedback);assert.deepEqual(lesson,copy);
  assert.equal(advanceLesson(wrong,state,'next'),wrong);assert.ok(allowsLessonAction(wrong,state,'answer',1));
  const right=advanceLesson(wrong,state,'answer',1);assert.equal(allowsLessonAction(right,state,'answer',0),false);assert.equal(advanceLesson(right,state,'answer',0),right);
  const next=advanceLesson(right,state,'next');assert.equal(next.index,lesson.index+1);assert.equal(next.answer,null);assert.equal(next.feedback,'');
});

test('all visual rule examples agree with the Scandinavian scoring implementation',()=>{
  const examples=[['upper-numbers','sixes',18],['pair','pair',12],['two-pairs','twoPairs',14],['three-kind','threeKind',12],['four-kind','fourKind',12],['small-straight','smallStraight',15],['large-straight','largeStraight',20],['full-house','fullHouse',13],['yatzy','yatzy',50],['chance','chance',16]];
  for(const [id,category,points]of examples)assert.equal(scoreCategory(category,lessonStep(at(id)).example),points,id);
  assert.equal(scoreCategory('twoPairs',[4,4,4,4,2]),0);assert.equal(scoreCategory('fullHouse',[4,4,4,4,4]),0);
  assert.equal(scoreCategory('yatzy',lessonStep(at('zero-score')).example),0);
  const card=createGame().players[0].scores;Object.assign(card,{ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18});
  assert.deepEqual(totals(card),{upper:63,bonus:50,lower:0,total:113});card.sixes=12;card.chance=30;assert.equal(totals(card).bonus,0,'lower points never enter the upper bonus');
});

test('practice can be replayed independently without modifying a normal saved game',()=>{
  let normal=roll(createGame({seed:999}));normal=hold(normal,2,true);const saved=JSON.stringify(normal);
  const lesson=createLesson(),practice=createGame({seed:1}),progress=advanceLesson(lesson,practice,'next'),rolled=rollLesson(progress,practice);
  assert.equal(JSON.stringify(normal),saved);assert.deepEqual(practice.dice,[0,0,0,0,0]);assert.equal(rolled.rollCount,1);
  assert.deepEqual(createLesson(),lesson);assert.notEqual(createLesson(),lesson);assert.deepEqual(createGame({seed:1}),practice);
});
