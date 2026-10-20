import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {LESSON_STEPS} from '../engine/yatzy-junior/lesson.js';
import {createGame,roll,hold,score,previews,validateGame} from '../engine/yatzy-junior/rules.js';

// Run serially with the other real-browser checks. Audio remains native: only
// playbackRate changes, and progression must still come from actual ended events.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out='qa/yatzy-junior',url=process.env.JUNIOR_URL||'http://127.0.0.1:4197/remake/yatzy-junior.html?qa';
const SAVE='mosi.yatzy.junior.save.v1',PREFS='mosi.yatzy.junior.prefs.v1';
const existing=hold(hold(roll(createGame({seed:91})),0),3),savedBytes=JSON.stringify(existing);
const errors=[],report={viewport:[360,740],checks:[],lesson:[],captures:[],errors};
let browser,page,releaseManifest;
const watchdog=setTimeout(()=>{report.timedOut=true;releaseManifest?.();void browser?.close();},360000);
watchdog.unref();
const currentState=()=>page.evaluate(()=>window.__juniorQA.getState());
const lessonState=()=>page.evaluate(()=>window.__juniorQA.getTutorial());
const saved=()=>page.evaluate(key=>localStorage.getItem(key),SAVE);
const waitStill=()=>page.waitForFunction(()=>window.__juniorQA.getStatus().settled,undefined,{timeout:45000});
async function capture(name){await page.screenshot({path:`${out}/${name}.png`});report.captures.push(`${out}/${name}.png`);}
async function ready(){
  await page.waitForFunction(()=>window.__juniorQA||!document.getElementById('error').hidden,undefined,{timeout:90000});
  assert.ok(await page.evaluate(()=>Boolean(window.__juniorQA)),'game resources initialized');
  assert.equal(await page.evaluate(()=>document.getElementById('game').inert),false,'ready game releases inert');
  assert.deepEqual(errors,[]);
}
async function hitInfo(selector){return page.locator(selector).evaluate(e=>{
  const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  let clipped=false;
  for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const b=p.getBoundingClientRect();if(r.top<b.top-.5||r.bottom>b.bottom+.5)clipped=true;}}
  return{x,y,width:r.width,height:r.height,disabled:e.disabled,focused:document.activeElement===e,inside:r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5,clipped,hit:e.contains(document.elementFromPoint(x,y))};
});}
async function activate(selector,{keyboard=false,appFocused=false}={}){
  await page.waitForFunction(selector=>{const e=document.querySelector(selector);return e&&!e.hidden&&!e.disabled&&e.getClientRects().length>0;},selector);
  if(appFocused)await page.waitForFunction(selector=>document.activeElement===document.querySelector(selector),selector);
  // Do not use Playwright's automatic scrolling or force-click. The application
  // must expose the complete target before a real pointer or Enter activation.
  await page.waitForFunction(selector=>{
    const e=document.querySelector(selector),r=e.getBoundingClientRect();
    if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)return false;
    for(let p=e.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();if(r.top<b.top-.5||r.bottom>b.bottom+.5)return false;}}
    return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  },selector,{timeout:10000});
  const hit=await hitInfo(selector);assert.ok(hit.inside&&!hit.clipped&&hit.hit,`${selector}: target must be visible and uncovered`);
  if(keyboard){if(!appFocused)await page.locator(selector).focus();await page.keyboard.press('Enter');}
  else await page.mouse.click(hit.x,hit.y);
  return hit;
}
async function layout(){return page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
  const inside=r=>r.x>=-.5&&r.y>=-.5&&r.x+r.w<=innerWidth+.5&&r.y+r.h<=innerHeight+.5;
  const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
  const coach=document.getElementById('lesson-center'),coachRect=rect(coach),scene=rect(document.querySelector('.scene'));
  const dice=[...document.querySelectorAll('.die-target')].filter(e=>!e.hidden&&e.getClientRects().length).map(e=>({index:Number(e.dataset.index),rect:rect(e),disabled:e.disabled}));
  const labels=[...document.querySelectorAll('.die-target')].filter(e=>!e.hidden&&e.getClientRects().length).map(e=>{const r=rect(e),css=getComputedStyle(e,'::before'),border=parseFloat(getComputedStyle(e).borderTopWidth),w=parseFloat(css.width),h=parseFloat(css.height);return{index:Number(e.dataset.index),rect:{x:r.x+border+parseFloat(css.left)-w/2,y:r.y+border+parseFloat(css.top),w,h}};});
  return{overflow:document.documentElement.scrollWidth>innerWidth,totals:[...document.querySelectorAll('.player-card')].map(e=>({rect:rect(e),visible:inside(rect(e))})),coach:coachRect,centerError:Math.abs(coachRect.x+coachRect.w/2-scene.x-scene.w/2),phase:coach.dataset.phase,coachHidden:coach.hidden,overlappingDice:coach.hidden||coach.dataset.phase!=='action'?[]:dice.filter(d=>overlap(coachRect,d.rect)).map(d=>d.index),overlappingLabels:coach.hidden||coach.dataset.phase!=='action'?[]:labels.filter(d=>overlap(coachRect,d.rect)).map(d=>d.index),cards:document.querySelectorAll('.junior-card').length,scroll:document.getElementById('score-rows').scrollTop};
});}
async function checkLayout(label){
  const value=await layout();assert.equal(value.overflow,false,`${label}: no page overflow`);assert.equal(value.cards,5);
  assert.ok(value.totals.every(t=>t.visible),`${label}: both totals remain visible`);
  if(!value.coachHidden)assert.ok(value.centerError<2,`${label}: one centered coach`);
  assert.deepEqual(value.overlappingDice,[],`${label}: action coach does not cover any die hit area`);assert.deepEqual(value.overlappingLabels,[],`${label}: action coach leaves every number badge visible`);return value;
}
async function waitNative(id){await page.waitForFunction(id=>{const v=window.__juniorQA.voice.getDebugState();return v.currentId===id&&v.mode==='audio'&&v.speaking;},id,{timeout:15000});}
async function finishInterruptions(){
  await page.waitForFunction(()=>window.__juniorQA.getStatus().lessonAdvance>0);
  assert.equal(await page.evaluate(()=>window.__juniorQA.voice.getDebugState().mode),'ended');
  await page.evaluate(()=>{window.__juniorAudioRate=1;});
  await activate('#lesson-replay');await waitNative('finishedLesson');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance),-1,'replay clears the previous finish countdown');
  await page.waitForTimeout(1450);
  assert.equal((await lessonState()).id,'done','old 1.3-second finish countdown cannot interrupt replay');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance),-1);
  await page.waitForFunction(()=>window.__juniorQA.getStatus().lessonAdvance>0,undefined,{timeout:15000});
  await page.evaluate(()=>{window.__juniorAudioRate=4;});
  await activate('#help');await waitNative('help');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance),-1,'help clears pending lesson advance');
  await page.waitForTimeout(1450);
  assert.equal((await lessonState()).id,'done','help interruption keeps the finish step');
  assert.ok(await page.evaluate(()=>window.__juniorQA.getStatus().paused));
  await activate('#help-dialog [data-close]');await waitNative('finishedLesson');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance),-1,'return from help narrates before scheduling completion');
  await page.waitForFunction(()=>!window.__juniorQA.getTutorial().active,undefined,{timeout:15000});
  report.checks.push('Finish replay and help cancel old lesson countdowns; natural speech completion alone schedules the new advance.');
}

try{
  await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:360,height:740},deviceScaleFactor:1});page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(({SAVE,PREFS,savedBytes})=>{
    if(!sessionStorage.getItem('junior-edges-seeded')){localStorage.setItem(SAVE,savedBytes);localStorage.setItem(PREFS,JSON.stringify({muted:false,reduced:false}));sessionStorage.setItem('junior-edges-seeded','true');}
    window.__clipEvents=[];window.__juniorAudioRate=4;
    const NativeAudio=window.Audio;let serial=0;
    window.Audio=class extends NativeAudio{
      constructor(src){super(src);const sequence=++serial,id=new URL(src,location.href).pathname.split('/').at(-1).replace(/\.mp3$/,'');this.defaultPlaybackRate=this.playbackRate=window.__juniorAudioRate;
        for(const kind of ['playing','ended','error'])this.addEventListener(kind,()=>window.__clipEvents.push({kind,id,sequence,src,rate:this.playbackRate,time:performance.now(),mediaTime:this.currentTime}));
      }
    };
  },{SAVE,PREFS,savedBytes});
  let manifestRequested=false;const gate=new Promise(resolve=>{releaseManifest=resolve;});
  await page.route('**/assets/audio/yatzy-junior/manifest.json',async route=>{manifestRequested=true;await gate;await route.continue();});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  for(let attempt=0;!manifestRequested&&attempt<100;attempt++)await page.waitForTimeout(50);
  assert.ok(manifestRequested,'manifest request reached the controlled initialization gate');
  const loading=await page.evaluate(()=>{
    const game=document.getElementById('game'),help=document.getElementById('help');help.focus();
    return{inert:game.inert,focused:document.activeElement===help,qa:Boolean(window.__juniorQA),loading:!document.getElementById('loading').hidden};
  });
  assert.deepEqual(loading,{inert:true,focused:false,qa:false,loading:true});
  const helpRect=await page.locator('#help').boundingBox();await page.mouse.click(helpRect.x+helpRect.width/2,helpRect.y+helpRect.height/2);
  assert.equal(await page.locator('#help-dialog').isVisible(),false,'inert loading controls cannot open a dialog');
  releaseManifest();await ready();await page.unroute('**/assets/audio/yatzy-junior/manifest.json');
  report.checks.push('Delayed manifest keeps the game inert and excludes controls from focus/input until every resource is ready.');

  await activate('#welcome-voice',{keyboard:true});await waitNative('welcomeMenu');
  const welcome=await page.evaluate(async()=>{
    const qa=window.__juniorQA,board=()=>({state:qa.getState(),dice:qa.dice.dice.map(d=>[...d.position.toArray(),...d.quaternion.toArray()]),camera:[...qa.world.camera.position.toArray(),...qa.world.camera.quaternion.toArray()]}),before=board(),samples=[];
    for(let i=0;i<12;i++){samples.push({mouth:qa.opponent.actor.mouthOpen,jaw:qa.opponent.actor.model.getObjectByName('Jaw').quaternion.toArray(),voice:qa.voice.getDebugState()});await new Promise(resolve=>setTimeout(resolve,50));}
    return{before,after:board(),samples,paused:qa.getStatus().paused};
  });
  assert.deepEqual(welcome.after,welcome.before,'voiced welcome freezes logical hand, physical dice and camera');assert.equal(welcome.paused,true);
  const mouths=welcome.samples.map(s=>s.mouth);assert.ok(Math.max(...mouths)-Math.min(...mouths)>.005,'Mosi mouth changes during native audio while the board is paused');
  assert.ok(welcome.samples.some((s,i)=>i&&s.jaw.some((v,n)=>Math.abs(v-welcome.samples[0].jaw[n])>1e-5)),'actual jaw pose changes');report.welcome=welcome;
  await page.waitForFunction(()=>window.__clipEvents.some(e=>e.id==='welcomeMenu'&&e.kind==='ended'));
  report.checks.push('Welcome voice uses native recorded audio and moves Mosi’s actual jaw while dice/camera remain frozen.');

  await activate('#continue');await waitStill();assert.deepEqual(await currentState(),existing);
  await activate('#help');await activate('#learn-help');
  await page.waitForFunction(()=>window.__juniorQA.getTutorial().id==='welcome');await capture('edges-mobile-central-intro');
  const seen=new Set(),lessonDeadline=Date.now()+240000;
  for(let iteration=0;iteration<60&&(await lessonState()).active;iteration++){
    assert.ok(Date.now()<lessonDeadline,'full lesson finishes within four minutes');
    const info=await lessonState(),spec=LESSON_STEPS[info.index];assert.equal(info.id,spec.id);
    assert.equal(await saved(),savedBytes,'practice preserves the exact saved bytes');
    if(seen.has(spec.id)){await page.waitForTimeout(50);continue;}seen.add(spec.id);
    if(spec.type==='finish'){await checkLayout(spec.id);await finishInterruptions();report.lesson.push({id:spec.id,automatic:true,interrupted:true});continue;}
    if(spec.type==='listen'){
      assert.equal(await page.locator('#lesson-next').isVisible(),false,'informational steps do not ask for Next');
      await checkLayout(spec.id);
      await page.waitForFunction(id=>window.__juniorQA.getTutorial().id!==id,spec.id);
      assert.ok(await page.evaluate(line=>window.__clipEvents.some(e=>e.id===line&&e.kind==='ended'),spec.line),`${spec.id}: a real ended event advanced the lesson`);
      report.lesson.push({id:spec.id,automatic:true});continue;
    }
    await waitStill();assert.equal((await lessonState()).id,spec.id);
    const measured=await checkLayout(spec.id),before=await currentState();
    if(spec.type!=='roll'){
      assert.equal(await page.locator('#roll').isDisabled(),true,'unrelated roll is disabled');
      await page.keyboard.press('6');assert.deepEqual(await currentState(),before,'unsupported input cannot bypass the lesson');
    }
    if(spec.type==='roll')await activate('#cup-target');
    else if(spec.type==='hold'){
      if(spec.id==='keep-pair')await capture('edges-mobile-hold');
      for(const index of spec.indices){await waitStill();if(!(await currentState()).held[index])await activate(`.die-target[data-index="${index}"]`,{keyboard:true,appFocused:true});}
    }else{
      const selector=`.card-select[data-category="${spec.category}"]`;
      await page.waitForFunction(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=document.getElementById('score-rows').getBoundingClientRect();return e===document.activeElement&&r.top>=s.top-.5&&r.bottom<=s.bottom+.5;},selector,{timeout:10000});
      if(spec.category==='yatzy')await capture('edges-mobile-score-yatzy');
      const hit=await activate(selector,{keyboard:true,appFocused:true});measured.scoreHit=hit;
    }
    await page.waitForFunction(id=>window.__juniorQA.getTutorial().id!==id,spec.id);
    report.lesson.push({id:spec.id,action:spec.type,layout:measured});
  }
  assert.equal((await lessonState()).active,false,'bounded loop completed the lesson');
  assert.deepEqual(await currentState(),existing,'lesson restores exact live held hand, RNG and scorecard');assert.equal(await saved(),savedBytes);
  for(const spec of LESSON_STEPS.filter(s=>['roll','hold','score'].includes(s.type)))assert.ok(seen.has(spec.id),`real action covered: ${spec.id}`);
  await waitStill();report.normal=await checkLayout('restored normal hand');assert.equal(report.normal.scroll,0,'lesson restores the previous scorecard scroll position');await capture('edges-mobile-normal-hand');
  report.checks.push('All five lesson cards are reached with real controls at 360×740; held dice and score cards use Enter on application-managed focus. Both totals stay visible and action narration never covers dice.');
  report.checks.push('All practice rolls, holds, awards and finish interruptions preserve the normal save and restore its exact held hand.');

  const zeroHand=roll(createGame({seed:2468})),zeroId=Object.keys(previews(zeroHand)).find(id=>previews(zeroHand)[id]===0);validateGame(zeroHand);assert.ok(zeroId);
  await page.evaluate(value=>window.__juniorQA.setState(value),zeroHand);await waitStill();
  const zeroSelector=`.card-select[data-category="${zeroId}"]`;
  // Normal card choice is intentionally user-scrollable; unlike the lesson
  // target tests, this wheel gesture represents the child's own browsing.
  await page.locator('#score-rows').hover();await page.mouse.wheel(0,-600);await page.waitForTimeout(250);
  if(!(await hitInfo(zeroSelector)).inside){await page.mouse.wheel(0,250);await page.waitForTimeout(250);}
  await activate(zeroSelector);await page.waitForFunction(()=>document.getElementById('zero-dialog').open);
  await activate('#zero-dialog [data-close]');assert.deepEqual(await currentState(),zeroHand,'cancel leaves scorecard and hand untouched');assert.equal(await saved(),savedBytes,'cancel writes no save');
  await activate(zeroSelector);await page.waitForFunction(()=>document.getElementById('zero-dialog').open);
  const confirm=await hitInfo('#confirm-zero');assert.ok(confirm.hit);await page.mouse.dblclick(confirm.x,confirm.y,{delay:70});await page.evaluate(()=>window.__juniorQA.freeze(true));
  const committed=score(zeroHand,zeroId);assert.deepEqual(await currentState(),committed,'rapid double activation commits zero once');assert.deepEqual(JSON.parse(await saved()),committed);
  report.zero={category:zeroId,committed};
  report.clipEvents=await page.evaluate(()=>window.__clipEvents);assert.equal(report.clipEvents.some(e=>e.kind==='error'),false);
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});await ready();await activate('#continue');await page.evaluate(()=>window.__juniorQA.freeze(true));
  assert.deepEqual(await currentState(),committed,'reload resumes the committed turn without scoring again');assert.deepEqual(JSON.parse(await saved()),committed);
  report.checks.push('Zero-score cancel leaves state/save untouched; rapid double confirmation commits once and the exact committed turn survives reload.');
  assert.deepEqual(errors,[]);report.passed=true;
  console.log(JSON.stringify({checks:report.checks,steps:report.lesson.length,captures:report.captures,errors},null,2));
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  if(page){report.debug=await page.evaluate(()=>({status:window.__juniorQA?.getStatus(),lesson:window.__juniorQA?.getTutorial(),voice:window.__juniorQA?.voice.getDebugState(),active:document.activeElement?.outerHTML})).catch(()=>null);await capture('edges-failure').catch(()=>{});}
  throw error;
}finally{
  clearTimeout(watchdog);
  releaseManifest?.();
  if(browser)await browser.close();
  await mkdir(out,{recursive:true});await writeFile(`${out}/edges-report.json`,JSON.stringify(report,null,2));
}
