import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {CATEGORIES,createGame,roll,hold,score,scoreCategory} from '../engine/yatzy-mosi/rules.js';
import {LESSON_STEPS} from '../engine/yatzy-mosi/tutorial.js';

// Use lesson data to select intended actions, but independently audit the real
// controller state, mesh results, pointer hits, keyboard guards and save bytes.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const SAVE='mosi.yatzy.table.save.v1',PREFS='mosi.yatzy.table.prefs.v1',out='qa/yatzy-mosi';
const captureRefresh=process.argv.includes('--capture-refresh');
const url=process.env.YATZY_URL||'http://127.0.0.1:4197/remake/yatzy-mosi.html?qa';
let savedGame=score(roll(createGame({seed:881})), 'chance');
savedGame=score(roll(savedGame),'ones');savedGame=hold(roll(savedGame),1);
const savedBytes=JSON.stringify(savedGame),errors=[],report={steps:[],layouts:[],checks:[],captures:[],errors};
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
let page,checkedPause=captureRefresh;
const lesson=()=>page.evaluate(()=>window.__yatzyQA.getTutorial());
const game=()=>page.evaluate(()=>window.__yatzyQA.getState());
const waitStep=id=>page.waitForFunction(id=>window.__yatzyQA.getTutorial().id!==id,id);
const waitStill=()=>page.waitForFunction(()=>!window.__yatzyQA.world.getViewState().transitioning&&window.__yatzyQA.getStatus().phase!=='rolling');
function specFor(status){const spec=LESSON_STEPS[status.index];assert.ok(spec,`known lesson index ${status.index}`);assert.equal(spec.id,status.id);assert.equal(spec.type,status.type);return spec;}
async function assertSave(label){
  const result=await page.evaluate(key=>({bytes:localStorage.getItem(key),writes:window.__tutorialSaveWrites}),SAVE);
  assert.equal(result.bytes,savedBytes,`${label}: the normal save remains byte-for-byte unchanged`);
  assert.ok(result.writes.every(value=>value===savedBytes),`${label}: tutorial must never briefly write practice data into the normal save`);
}
async function capture(name){const file=`tutorial-${name}.png`;await page.screenshot({path:`${out}/${file}`});report.captures.push(file);}
async function waitInstructionReady(spec){
  const selector=spec.type==='hold'?`.die-target[data-index="${spec.indices[0]}"]`:spec.type==='score'?`.score[data-player="0"][data-category="${spec.category}"]`:spec.type==='roll'?'#roll':null;
  if(!selector)return;
  await page.waitForFunction(selector=>{const e=document.querySelector(selector);return e&&!e.disabled&&e.classList.contains('tutorial-target');},selector);
  // Controller focus scrolls the requested score row into view; observe that
  // behavior instead of fixing its scroll position on the test's behalf.
  await page.waitForFunction(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&e.contains(document.elementFromPoint(x,y));},selector);
  await page.waitForTimeout(120);
}
async function checkCoach(label){
  const result=await page.evaluate(label=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},coach=document.getElementById('tutorial-coach');
    const visible=e=>{const r=rect(e);return r.w>0&&r.h>0&&r.x>=0&&r.y>=0&&r.x+r.w<=innerWidth+.5&&r.y+r.h<=innerHeight+.5;};
    return{label,step:coach.dataset.step,coach:rect(coach),role:coach.getAttribute('role'),viewport:[innerWidth,innerHeight],width:document.documentElement.scrollWidth,totals:['you-card','mosi-card'].map(id=>visible(document.getElementById(id))),exit:visible(document.getElementById('tutorial-exit')),activeElement:document.activeElement?.id,bodyScroll:coach.scrollHeight>coach.clientHeight};
  },label);
  assert.ok(result.coach.w>0&&result.coach.h>0,`${label}: coach is visibly rendered`);
  assert.ok(result.coach.x>=0&&result.coach.y>=0&&result.coach.x+result.coach.w<=result.viewport[0]+.5&&result.coach.y+result.coach.h<=result.viewport[1]+.5,`${label}: tutorial card remains in the viewport`);
  assert.equal(result.width,result.viewport[0],`${label}: no horizontal document overflow`);
  assert.ok(result.totals.every(Boolean),`${label}: both player totals remain visible`);
  report.layouts.push(result);return result;
}
async function activate(selector,keyboard=false){
  const target=page.locator(selector);await target.waitFor({state:'visible'});await target.scrollIntoViewIfNeeded();
  await page.waitForFunction(selector=>{const node=document.querySelector(selector);return node&&!node.disabled&&!node.hidden;},selector);
  assert.equal(await target.isEnabled(),true,`${selector} is an available action`);
  if(keyboard){await target.focus();assert.ok(await target.evaluate(e=>document.activeElement===e),'the action accepts keyboard focus');await page.keyboard.press('Enter');}
  else{
    const point=await target.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
    assert.ok(point.hit,`${selector}: tutorial coach does not cover the real action target`);await page.mouse.click(point.x,point.y);
  }
}
async function checkTabNavigation(){
  await page.locator('#tutorial-next').focus();
  const visited=[];for(let count=0;count<35;count++){await page.keyboard.press('Tab');visited.push(await page.evaluate(()=>document.activeElement?.id));if(visited.includes('tutorial-exit')&&visited.includes('tutorial-next'))break;}
  assert.ok(visited.includes('tutorial-exit'),'the lesson exit is reachable with Tab');assert.ok(visited.includes('tutorial-next'),'Tab can return to the lesson action');report.checks.push({keyboardTabOrder:visited});
}
async function checkPause(){
  await page.keyboard.press('Escape');await page.waitForTimeout(150);assert.equal(await page.locator('#pause-dialog').isVisible(),true,'Escape opens the pause dialog and does not immediately dismiss it');await page.waitForFunction(()=>window.__yatzyQA.getStatus().paused);
  const snapshot=()=>page.evaluate(()=>({game:window.__yatzyQA.getState(),lesson:window.__yatzyQA.getTutorial(),dice:window.__yatzyQA.dice.getDebugState(),view:window.__yatzyQA.world.getViewState()}));
  const before=await snapshot();await page.waitForTimeout(350);assert.deepEqual(await snapshot(),before,'pausing freezes the teaching throw, instruction and camera');
  await activate('#pause-dialog [data-close]');await page.waitForFunction(()=>!window.__yatzyQA.getStatus().paused);report.checks.push('Pause freezes the actual teaching throw, camera and lesson until resume.');
}
async function wrongActions(status,spec){
  if(spec.type==='opponent'||spec.type==='finish')return;
  const before=await game(),allowedHolds=spec.type==='hold'?spec.indices:[];
  await page.evaluate(()=>document.activeElement?.blur());
  for(let index=0;index<5;index++)if(!allowedHolds.includes(index))await page.keyboard.press(String(index+1));
  if(spec.type!=='roll'){await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Space');}
  await page.evaluate(({type,category})=>{
    const stale=selector=>document.querySelector(selector)?.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
    if(type!=='roll')stale('#roll');stale('#advice');
    const wrong=[...document.querySelectorAll('.score[data-player="0"]')].find(b=>type!=='score'||b.dataset.category!==category);
    wrong?.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
    if(!['next','quiz','finish'].includes(type))stale('#tutorial-next');
  },{type:spec.type,category:spec.category});
  assert.deepEqual(await game(),before,`${spec.id}: wrong controls and keyboard shortcuts cannot change practice state`);
  assert.equal((await lesson()).id,status.id,`${spec.id}: a wrong action cannot advance the instruction`);await assertSave(spec.id);
}
async function takeStep({keyboard=false,stopBefore}={}){
  const status=await lesson();assert.equal(status.active,true);const spec=specFor(status);
  if(stopBefore?.(spec,status))return false;
  await waitInstructionReady(spec);await checkCoach(spec.id);await wrongActions(status,spec);const before=await game();
  const device=keyboard?'mobile':'desktop';
  if(['keep-sixes','score-full-house','full-house','chance','bonus-plan','upper-bonus'].includes(spec.id)){await waitStill();await waitInstructionReady(spec);await capture(`${device}-${spec.id}`);}
  if(spec.type==='next')await activate('#tutorial-next',keyboard);
  else if(spec.type==='roll'){
    await waitStill();await activate(keyboard?'#roll':'#cup-target',keyboard);
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='rolling');
    const committed=await game();assert.equal(committed.rollCount,spec.rollCount);assert.deepEqual(committed.dice,spec.hand,'the real throw commits the teaching hand');
    assert.ok(await page.evaluate(()=>window.__yatzyQA.dice.getDebugState().rolling),'the teaching roll uses the actual animated cup and dice');
    if(!checkedPause&&!keyboard){await checkPause();checkedPause=true;}
    for(let index=0;index<5;index++)if(before.held[index])assert.equal(committed.dice[index],before.dice[index],'a held die survives a teaching reroll');
    await waitStep(spec.id);
    const after=await page.evaluate(()=>({state:window.__yatzyQA.getState(),up:window.__yatzyQA.dice.getDebugState().up}));assert.deepEqual(after.up,after.state.dice);
  }else if(spec.type==='hold'){
    for(const index of spec.indices){
      const prior=await game();if(prior.held[index]===spec.held)continue;await waitStill();
      if(keyboard){await page.waitForFunction(index=>!document.querySelector(`.die-target[data-index="${index}"]`).disabled,index);await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press(String(index+1));}else await activate(`.die-target[data-index="${index}"]`);
      const after=await game(),expected=structuredClone(prior);expected.held[index]=spec.held;assert.deepEqual(after,expected,'holding/releasing changes only the requested flag');
    }
  }else if(spec.type==='score'){
    await waitStill();const expected=scoreCategory(spec.category,before.dice),who=before.currentPlayer;
    await activate(`.score[data-player="${who}"][data-category="${spec.category}"]`,keyboard);
    assert.equal((await game()).players[who].scores[spec.category],expected,'the real category receives exactly the dice value');
  }else if(spec.type==='opponent'){
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='rolling'||window.__yatzyQA.getTutorial().type!=='opponent');
    await waitStep(spec.id);
    assert.equal((await game()).players[1].scores[spec.category],scoreCategory(spec.category,spec.hand),'Mosi demonstrates a real scored turn');
  }else if(spec.type==='quiz'){
    const wrong=spec.choices.findIndex(choice=>!choice.correct),correct=spec.choices.findIndex(choice=>choice.correct);
    assert.ok(wrong>=0&&correct>=0,'a quiz has an incorrect choice and a correct choice');
    await activate(`.lesson-choice:nth-child(${wrong+1})`,keyboard);
    assert.equal((await lesson()).id,spec.id);assert.equal(await page.locator('#tutorial-next').isEnabled(),false,'an incorrect answer must allow a retry before Next');
    assert.ok((await lesson()).feedback?.length,'an incorrect answer explains how to retry');
    if(spec.id==='full-house')await capture(`${device}-quiz-retry`);
    await page.evaluate(()=>document.getElementById('tutorial-next').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal((await lesson()).id,spec.id,'a stale Next click cannot bypass incorrect feedback');
    await activate(`.lesson-choice:nth-child(${correct+1})`,keyboard);assert.equal(await page.locator('#tutorial-next').isEnabled(),true,'correct answer unlocks Next');
    assert.ok((await lesson()).feedback?.length,'a correct answer provides confirmation');
    await activate('#tutorial-next',keyboard);assert.deepEqual(await game(),before,'quiz choices do not alter the practice game');
  }else if(spec.type==='finish')return false;
  else throw new Error(`Unhandled tutorial type ${spec.type}`);
  await waitStep(spec.id);await assertSave(spec.id);report.steps.push({id:spec.id,type:spec.type,keyboard});return true;
}
async function playLesson(keyboard=false){
  for(let count=0;count<LESSON_STEPS.length+5;count++)if(!await takeStep({keyboard})){
    const final=await game();assert.equal(final.turnCount,3);assert.equal(final.players[0].scores.sixes,24);assert.equal(final.players[0].scores.fullHouse,13);assert.equal(final.players[1].scores.twoPairs,12);return;
  }
  throw new Error('Tutorial did not reach its finish step');
}
async function exitAndRestore(){
  await activate('#tutorial-exit');await page.waitForFunction(()=>!window.__yatzyQA.getTutorial().active);await assertSave('exit');
  if(await page.locator('#welcome').isVisible())await activate('#continue');
  assert.deepEqual(await game(),savedGame,'leaving the lesson restores the normal game exactly');
  assert.equal(await page.locator('[aria-describedby*="tutorial-"]').count(),0,'leaving clears tutorial descriptions from normal controls');
  await page.waitForTimeout(250);assert.deepEqual(await game(),savedGame,'a cancelled demonstration cannot finish later and overwrite the restored game');
}
async function launchHelpLesson(){await activate('#help');await activate('#learn-help');await page.waitForFunction(()=>window.__yatzyQA.getTutorial().active);await assertSave('Help entry');}

try{
  await mkdir(out,{recursive:true});page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(({SAVE,PREFS,savedBytes,captureRefresh})=>{
    if(!sessionStorage.getItem('qa.tutorial.seeded')){localStorage.setItem(SAVE,savedBytes);localStorage.setItem(PREFS,JSON.stringify({muted:true,reduced:captureRefresh}));sessionStorage.setItem('qa.tutorial.seeded','true');}
    window.__tutorialSaveWrites=[];const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(this===localStorage&&key===SAVE)window.__tutorialSaveWrites.push(String(value));return original.call(this,key,value);};
  },{SAVE,PREFS,savedBytes,captureRefresh});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__yatzyQA?.getTutorial);await activate('#learn');await page.waitForFunction(()=>window.__yatzyQA.getTutorial().active);
  await capture('desktop-intro');await checkTabNavigation();await playLesson(false);await capture('desktop-finish');await assertSave('finished desktop lesson');
  if(captureRefresh){
    await checkPause();await activate('#tutorial-repeat');await page.setViewportSize({width:390,height:844});await capture('mobile-intro');await playLesson(true);await capture('mobile-finish');await exitAndRestore();await checkPause();
    assert.deepEqual(errors,[]);report.completed=true;await writeFile(`${out}/tutorial-capture-refresh.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,captureRefresh:true,captures:report.captures,errors},null,2));
  }else{
  await activate('#tutorial-repeat');assert.equal((await lesson()).index,0,'Repeat returns to the first instruction');await assertSave('repeat');
  while(await takeStep({stopBefore:spec=>spec.type==='roll'})){}
  await activate('#cup-target');await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().rolling);await exitAndRestore();report.checks.push('Repeat and exit during an active real roll preserve the normal save and restore its game.');
  await launchHelpLesson();while(await takeStep({stopBefore:spec=>spec.type==='hold'})){}
  const firstHold=specFor(await lesson()).indices[0];await waitStill();await activate(`.die-target[data-index="${firstHold}"]`);await exitAndRestore();report.checks.push('Help replay and exit during a hold restore the prior game without delayed lesson actions.');
  await page.setViewportSize({width:390,height:844});await activate('#pause');await activate('#motion');await activate('#pause-dialog [data-close]');assert.equal(await page.evaluate(()=>window.__yatzyQA.getStatus().reduced),true);
  await launchHelpLesson();await capture('mobile-intro');await checkTabNavigation();await playLesson(true);await capture('mobile-finish');await exitAndRestore();report.checks.push('The complete mobile lesson also works with reduced motion and keyboard actions.');
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__yatzyQA?.getTutorial);await activate('#continue');assert.deepEqual(await game(),savedGame);await assertSave('reload after lessons');
  await activate('#roll');await page.waitForFunction(()=>window.__yatzyQA.getState().rollCount===2&&window.__yatzyQA.getStatus().phase==='human');await waitStill();
  const normalBefore=await game();await activate('.die-target[data-index="0"]');assert.equal((await game()).held[0],!normalBefore.held[0]);
  const category=CATEGORIES.find(category=>normalBefore.players[0].scores[category.id]===null&&scoreCategory(category.id,normalBefore.dice)>0);assert.ok(category,'the normal game offers an unfilled scoring category');
  await activate(`.score[data-player="0"][data-category="${category.id}"]`);await page.waitForFunction(turn=>window.__yatzyQA.getState().turnCount>=turn+2&&window.__yatzyQA.getStatus().phase==='human',normalBefore.turnCount);
  assert.equal((await lesson()).active,false);report.checks.push('After tutorial exit/reload, a normal roll, hold, score and Mosi turn still complete.');
  assert.deepEqual(errors,[]);report.completed=true;await writeFile(`${out}/tutorial-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,steps:report.steps.length,checks:report.checks,captures:report.captures,errors},null,2));
  }
}catch(error){
  report.failure=error.message;
  if(page){
    report.failureState=await page.evaluate(()=>({lesson:window.__yatzyQA?.getTutorial(),status:window.__yatzyQA?.getStatus(),focus:document.activeElement?.id,targets:[...document.querySelectorAll('.tutorial-target')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:e.id,category:e.dataset.category,index:e.dataset.index,disabled:e.disabled,rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:hit?.id||hit?.tagName};})})).catch(()=>null);
    await page.screenshot({path:`${out}/tutorial-failure.png`}).catch(()=>{});
  }
  await writeFile(`${out}/${captureRefresh?'tutorial-capture-refresh':'tutorial-report'}.json`,JSON.stringify(report,null,2));throw error;
}
finally{await browser.close();}
