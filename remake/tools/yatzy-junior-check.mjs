import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {LESSON_STEPS} from '../engine/yatzy-junior/lesson.js';
import {createGame,roll,hold,score,decideAI} from '../engine/yatzy-junior/rules.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out='qa/yatzy-junior',SAVE='mosi.yatzy.junior.save.v1',PREFS='mosi.yatzy.junior.prefs.v1',errors=[],report={lesson:[],checks:[],captures:[],errors};
const existing=hold(roll(createGame({seed:91})),0),savedBytes=JSON.stringify(existing);
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
let page;
async function capture(name){await page.screenshot({path:`${out}/${name}.png`});report.captures.push(name);}
async function state(){return page.evaluate(()=>window.__juniorQA.getState());}
async function tutorial(){return page.evaluate(()=>window.__juniorQA.getTutorial());}
async function waitStill(){await page.waitForFunction(()=>window.__juniorQA.getStatus().settled);}
async function click(selector){
  await page.waitForFunction(selector=>{const e=document.querySelector(selector);return e&&!e.hidden&&!e.disabled;},selector);
  const hit=await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert.ok(hit.hit,`${selector} is not covered by narration or another control`);await page.mouse.click(hit.x,hit.y);
}
async function layout(){return page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},inside=r=>r.x>=0&&r.y>=0&&r.x+r.w<=innerWidth+.5&&r.y+r.h<=innerHeight+.5;
  return{viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,totals:[...document.querySelectorAll('.player-card')].map(e=>inside(rect(e))),coach:rect(document.getElementById('lesson-center')),scene:rect(document.querySelector('.scene')),cards:[...document.querySelectorAll('.junior-card')].map(e=>inside(rect(e)))};
});}
try{
  await mkdir(out,{recursive:true});page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
  await page.addInitScript(({SAVE,PREFS,savedBytes})=>{
    localStorage.setItem(SAVE,savedBytes);localStorage.setItem(PREFS,JSON.stringify({muted:false,reduced:false}));
    window.__clipEvents=[];const NativeAudio=window.Audio;
    window.Audio=class extends NativeAudio{constructor(src){super(src);this.addEventListener('playing',()=>window.__clipEvents.push({kind:'playing',src,time:this.currentTime}));this.addEventListener('ended',()=>window.__clipEvents.push({kind:'ended',src}));}};
  },{SAVE,PREFS,savedBytes});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:4197/remake/yatzy-junior.html?qa',{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>window.__juniorQA||!document.getElementById('error').hidden,undefined,{timeout:90000});assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>Boolean(window.__juniorQA)));
  await capture('welcome');await click('#learn');
  await page.waitForFunction(()=>window.__juniorQA.voice.getDebugState().mode==='audio');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__juniorQA.getStatus().paused);
  const paused=await page.evaluate(()=>({lesson:window.__juniorQA.getTutorial(),voice:window.__juniorQA.voice.getDebugState(),dice:window.__juniorQA.dice.getDebugState()}));
  await page.waitForTimeout(450);const after=await page.evaluate(()=>({lesson:window.__juniorQA.getTutorial(),voice:window.__juniorQA.voice.getDebugState(),dice:window.__juniorQA.dice.getDebugState()}));
  assert.deepEqual(after.lesson,paused.lesson);assert.deepEqual(after.dice,paused.dice);assert.ok(Math.abs(after.voice.elapsed-paused.voice.elapsed)<.05);await click('#pause-dialog [data-close]');report.checks.push('Escape freezes real narration, lesson and dice; resume continues.');
  let previous=null;
  while((await tutorial()).active){
    const info=await tutorial(),spec=LESSON_STEPS[info.index];assert.equal(info.id,spec.id);
    if(previous===spec.id){await page.waitForTimeout(100);continue;}previous=spec.id;
    await waitStill();const before=await state();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVE),savedBytes,'lesson does not overwrite the normal game');
    const measure=await layout();assert.equal(measure.overflow,false);assert.ok(measure.totals.every(Boolean));assert.ok(Math.abs((measure.coach.x+measure.coach.w/2)-(measure.scene.x+measure.scene.w/2))<2,'coach stays centered over the board');
    if(spec.type==='listen'||spec.type==='finish'){
      assert.equal(await page.locator('#lesson-next').isVisible(),spec.type==='finish','informational lessons advance by spoken completion, not Next');
      if(spec.id==='welcome')await capture('centered-intro');
      await page.waitForFunction(id=>window.__juniorQA.getTutorial().id!==id,spec.id);report.lesson.push({id:spec.id,automatic:true});continue;
    }
    // Deliberate wrong keyboard action must not affect the teaching hand.
    if(spec.type!=='roll'){await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Space');assert.deepEqual(await state(),before);}
    if(spec.type==='roll')await click('#cup-target');
    else if(spec.type==='hold'){
      await capture(spec.id);for(const i of spec.indices){await waitStill();if(!(await state()).held[i])await click(`.die-target[data-index="${i}"]`);}
    }else if(spec.type==='score'){
      assert.ok(await page.locator(`.card-select[data-category="${spec.category}"]`).isEnabled());
      if(spec.category==='smallStraight')await capture('straight-choice');await click(`.card-select[data-category="${spec.category}"]`);
    }
    await page.waitForFunction(id=>window.__juniorQA.getTutorial().id!==id,spec.id);report.lesson.push({id:spec.id,action:spec.type});
  }
  assert.deepEqual(await state(),existing,'finishing the isolated lesson resumes the exact saved held hand');
  report.checks.push('All five goals taught through real controls; two hold/reroll practices; no Next paging; save preserved.');
  console.log(`Tutorial: ${report.lesson.length} steps passed through real controls and recorded speech.`);
  const clips=await page.evaluate(()=>window.__clipEvents);report.clipEvents=clips;assert.ok(clips.filter(e=>e.kind==='ended').length>=report.lesson.filter(step=>step.automatic).length);
  await capture('normal-hand');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);const mobile=await layout();assert.equal(mobile.overflow,false);assert.ok(mobile.totals.every(Boolean));report.mobile=mobile;await capture('mobile-hand');
  await click('#help');await click('#learn-help');await page.waitForFunction(()=>window.__juniorQA.getTutorial().type==='roll');await click('#cup-target');await page.waitForTimeout(350);await click('#lesson-skip');assert.deepEqual(await state(),existing);report.checks.push('Exiting a mobile practice throw restores the committed hand.');
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(500);
  // Play a complete legal five-round match through the UI. Mosi uses the real AI.
  await page.evaluate(value=>window.__juniorQA.setState(value),createGame({seed:6081}));
  while((await state()).status!=='finished'){
    const game=await state();
    if(game.currentPlayer===1){await page.waitForTimeout(250);continue;}
    await page.waitForFunction(()=>window.__juniorQA.getStatus().phase==='human'&&window.__juniorQA.getStatus().settled);
    const current=await state(),decision=decideAI(current);
    if(decision.type==='score'){
      await click(`.card-select[data-category="${decision.categoryId}"]`);
      if(await page.locator('#zero-dialog').isVisible())await click('#confirm-zero');
    }else{
      for(let i=0;i<5;i++)if(current.held[i]!==decision.held[i]){await waitStill();await click(`.die-target[data-index="${i}"]`);}
      await waitStill();await click('#roll');await page.waitForFunction(()=>window.__juniorQA.getStatus().phase!=='rolling');
    }
  }
  await page.waitForFunction(()=>document.getElementById('win-dialog').open);await capture('finished');report.final=await state();assert.equal(report.final.turnCount,10);
  await page.waitForFunction(()=>!window.__juniorQA.voice.busy);report.resultVoice=await page.evaluate(()=>window.__clipEvents.slice(-10));
  assert.equal(report.resultVoice.at(-1).kind,'ended');assert.ok(/(?:youWin|mosiWin|tie)\.mp3$/.test(report.resultVoice.at(-1).src));assert.deepEqual(errors,[]);
  report.checks.push('Complete five-round human/Mosi match ends after ten legal scored turns.');
  console.log(JSON.stringify({steps:report.lesson.length,checks:report.checks,clips:clips.length,final:report.final.turnCount,errors},null,2));
}catch(error){report.failure={message:error.message,stack:error.stack};if(page){report.debug=await page.evaluate(()=>({status:window.__juniorQA?.getStatus(),lesson:window.__juniorQA?.getTutorial(),voice:window.__juniorQA?.voice.getDebugState()})).catch(()=>null);await capture('failure').catch(()=>{});}throw error;
}finally{await writeFile(`${out}/browser-report.json`,JSON.stringify(report,null,2));await browser.close();}
