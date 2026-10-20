import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Use an isolated browser context. Only selected MP3 requests fail; the actual
// recordings stay untouched, and native media events own every completion.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const url=process.env.JUNIOR_URL||'http://127.0.0.1:4197/remake/yatzy-junior.html?qa';
const out='qa/yatzy-junior',PREFS='mosi.yatzy.junior.prefs.v1';
const errors=[],blocked=new Set(),abortedURLs=new Set();
const report={checks:[],captures:[],expectedNetworkErrors:[],warnings:[],errors};
let browser,page;
const watchdog=setTimeout(()=>{report.timedOut=true;void browser?.close();},210000);watchdog.unref();
const voice=()=>page.evaluate(()=>window.__juniorQA.voice.getDebugState());
const lesson=()=>page.evaluate(()=>window.__juniorQA.getTutorial());
const waitMode=(id,mode)=>page.waitForFunction(({id,mode})=>{const v=window.__juniorQA.voice.getDebugState();return v.currentId===id&&v.mode===mode;},{id,mode},{timeout:20000});
async function capture(name){await page.screenshot({path:`${out}/${name}.png`});report.captures.push(`${out}/${name}.png`);}
async function click(selector){
  const button=page.locator(selector);await button.waitFor({state:'visible'});assert.ok(await button.isEnabled(),`${selector}: enabled`);
  const hit=await button.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert.ok(hit.hit,`${selector}: reachable by a real click`);await page.mouse.click(hit.x,hit.y);
}
async function audibleProgress(id){
  await waitMode(id,'audio');
  const first=await page.evaluate(id=>{const clips=window.__speechMedia.filter(c=>c.id===id),clip=clips.at(-1);return{sequence:clip.sequence,time:clip.audio.currentTime,muted:clip.audio.muted,volume:clip.audio.volume,paused:clip.audio.paused,rate:clip.audio.playbackRate};},id);
  assert.equal(first.muted,false,`${id}: audio element is unmuted`);assert.ok(first.volume>0);assert.equal(first.paused,false);assert.equal(first.rate,1,'test uses natural recorded playback speed');
  await page.waitForFunction(({sequence,time})=>window.__speechMedia.find(c=>c.sequence===sequence)?.audio.currentTime>time+.25,{sequence:first.sequence,time:first.time},{timeout:10000});
  const after=await page.evaluate(sequence=>{const c=window.__speechMedia.find(c=>c.sequence===sequence);return{time:c.audio.currentTime,muted:c.audio.muted,paused:c.audio.paused};},first.sequence);
  assert.ok(after.time>first.time+.25);assert.equal(after.muted,false);
  return{...first,after};
}
async function unavailable(id,{dialog=null}={}){
  await waitMode(id,'unavailable');const failed=await voice();
  assert.equal(failed.busy,true);assert.equal(failed.speaking,false);assert.equal(failed.muted,false);assert.equal(failed.completed,false);
  await page.locator('#voice-recovery').waitFor({state:'visible'});
  assert.equal(await page.locator('#voice-retry').isEnabled(),true);
  const parent=await page.locator('#voice-recovery').evaluate(e=>({dialog:e.closest('dialog')?.id??null,inCoach:Boolean(e.closest('#lesson-center'))}));
  if(dialog)assert.equal(parent.dialog,dialog,'retry is inside the active modal, so it can receive input');
  else assert.equal(parent.inCoach,true,'lesson recovery stays in the centered coach');
  return failed;
}
async function waitEnded(sequence){
  await page.waitForFunction(sequence=>window.__speechEvents.some(e=>e.sequence===sequence&&e.kind==='ended'),sequence,{timeout:20000});
  assert.equal(await page.evaluate(sequence=>window.__speechEvents.filter(e=>e.sequence===sequence&&e.kind==='ended').length,sequence),1,'native clip ended exactly once');
}

try{
  await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    const text=message.text(),location=message.location().url;
    if(message.type()==='warning')report.warnings.push({text,url:location});
    if(message.type()!=='error')return;
    if(/net::ERR_(?:FAILED|ABORTED)/.test(text)&&(abortedURLs.has(location)||(!location&&abortedURLs.size)))report.expectedNetworkErrors.push({text,url:location});
    else errors.push(`${location}: ${text}`);
  });
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(({PREFS})=>{
    localStorage.setItem(PREFS,JSON.stringify({muted:true,reduced:false}));
    window.__speechEvents=[];window.__speechMedia=[];const NativeAudio=window.Audio;let serial=0;
    window.Audio=class extends NativeAudio{
      constructor(src){super(src);const sequence=++serial,id=new URL(src,location.href).pathname.split('/').at(-1).replace(/\.mp3$/,'');
        window.__speechMedia.push({sequence,id,audio:this});
        for(const kind of ['playing','ended','error'])this.addEventListener(kind,()=>window.__speechEvents.push({sequence,id,kind,muted:this.muted,mediaTime:this.currentTime,time:performance.now()}));
      }
    };
  },{PREFS});
  await page.route('**/assets/audio/yatzy-junior/*.mp3',async route=>{
    const requestURL=route.request().url(),id=new URL(requestURL).pathname.split('/').at(-1).replace(/\.mp3$/,'');
    if(blocked.has(id)){abortedURLs.add(requestURL);await route.abort('failed');}else await route.continue();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__juniorQA||!document.getElementById('error').hidden,undefined,{timeout:90000});
  assert.ok(await page.evaluate(()=>Boolean(window.__juniorQA)),'resources initialize');assert.deepEqual(errors,[]);
  assert.equal((await voice()).muted,true,'stored mute preference was loaded');

  await click('#welcome-voice');report.explicitListen=await audibleProgress('welcomeMenu');
  assert.equal((await voice()).muted,false,'explicit listen unmutes narration');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).muted,PREFS),false,'explicit listen persists the audible preference');
  await waitEnded(report.explicitListen.sequence);
  report.checks.push('Saved mute is respected initially; explicit “Heyra Mosa” unmutes and plays a real MP3 at natural speed with advancing media time.');

  blocked.add('welcomeMenu');await click('#welcome-voice');
  report.dialogFailure=await unavailable('welcomeMenu',{dialog:'welcome'});await capture('speech-dialog-recovery');
  blocked.delete('welcomeMenu');await click('#voice-retry');report.dialogRetry=await audibleProgress('welcomeMenu');await waitEnded(report.dialogRetry.sequence);
  assert.equal(await page.locator('#voice-recovery').isVisible(),false,'successful modal retry hides recovery');
  report.checks.push('Missing welcome recording exposes a reachable retry inside the modal; restoring the route plays actual audio and completes once.');

  blocked.add('welcome');await click('#learn');
  report.lessonFailure=await unavailable('welcome');const stopped=await lesson();
  assert.equal(stopped.id,'welcome');const failedSequence=await page.evaluate(()=>window.__speechMedia.at(-1).sequence);
  const beforeHand=await page.evaluate(()=>window.__juniorQA.getState());
  // This exceeds the entire missing line, so a silent timer would incorrectly
  // advance the lesson. Nothing calls or fakes ended, update, or completion.
  await page.waitForTimeout(Math.ceil((report.lessonFailure.duration+.6)*1000));
  assert.equal((await lesson()).index,stopped.index,'unavailable speech never silently advances the lesson');
  assert.deepEqual(await page.evaluate(()=>window.__juniorQA.getState()),beforeHand,'failed instruction leaves the teaching hand unchanged');
  const still=await voice();assert.equal(still.mode,'unavailable');assert.equal(still.busy,true);assert.equal(still.speaking,false);assert.equal(still.elapsed,report.lessonFailure.elapsed);
  assert.equal(await page.evaluate(sequence=>window.__speechEvents.filter(e=>e.sequence===sequence&&e.kind==='ended').length,failedSequence),0,'failed native clip has no completion');
  await capture('speech-lesson-recovery');
  blocked.delete('welcome');await click('#voice-retry');report.lessonRetry=await audibleProgress('welcome');
  assert.equal((await lesson()).index,stopped.index,'retry remains on the same instruction until its actual ended event');
  assert.equal(await page.locator('#voice-recovery').isVisible(),false);await waitEnded(report.lessonRetry.sequence);
  await page.waitForFunction(index=>window.__juniorQA.getTutorial().index>index,stopped.index);
  assert.equal((await lesson()).index,stopped.index+1,'completed retry advances exactly one lesson step');
  await waitMode('intro','audio');
  const introSequence=await page.evaluate(()=>window.__speechMedia.filter(c=>c.id==='intro').at(-1).sequence);await waitEnded(introSequence);
  await page.waitForFunction(()=>window.__juniorQA.getTutorial().id==='roll-pair');await page.waitForTimeout(700);
  assert.equal((await lesson()).id,'roll-pair','no late callback from failed/retried audio skips the next action');
  assert.equal(await page.evaluate(sequence=>window.__speechEvents.filter(e=>e.sequence===sequence&&e.kind==='ended').length,report.lessonRetry.sequence),1);
  await capture('speech-recovered-lesson');
  report.checks.push('Unavailable unmuted lesson speech stays busy and silent for longer than its full duration, without advancing; retry waits for native completion and advances exactly once.');

  // A line can fail before the child opens Pause. Retry must then opt into
  // voiced-modal playback rather than leaving the new native clip paused.
  await click('#lesson-skip');await page.waitForFunction(()=>document.getElementById('welcome').open);
  blocked.add('welcome');await click('#learn');await unavailable('welcome');
  const pausedStep=await lesson();await click('#pause');
  await unavailable('welcome',{dialog:'pause-dialog'});
  assert.equal((await voice()).paused,true,'opening Pause initially pauses the failed instruction');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().paused),true);
  const frozenBoard=await page.evaluate(()=>{
    const q=window.__juniorQA;
    return{hand:q.getState(),timer:q.getStatus().timer,dice:q.dice.dice.map(d=>[...d.position.toArray(),...d.quaternion.toArray()]),camera:[...q.world.camera.position.toArray(),...q.world.camera.quaternion.toArray()]};
  });
  await capture('speech-pause-recovery');
  blocked.delete('welcome');await click('#voice-retry');report.pausedRetry=await audibleProgress('welcome');
  assert.equal((await voice()).paused,false,'modal retry releases narration while retaining the game pause');
  assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().paused),true,'Retry does not resume the board');
  await waitEnded(report.pausedRetry.sequence);
  assert.equal((await lesson()).index,pausedStep.index,'completed speech cannot advance the paused lesson');
  assert.ok(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance>0),'completion waits in the paused game clock');
  assert.deepEqual(await page.evaluate(()=>{
    const q=window.__juniorQA;
    return{hand:q.getState(),timer:q.getStatus().timer,dice:q.dice.dice.map(d=>[...d.position.toArray(),...d.quaternion.toArray()]),camera:[...q.world.camera.position.toArray(),...q.world.camera.quaternion.toArray()]};
  }),frozenBoard,'modal narration leaves hand, turn clock, physical dice and camera frozen');
  await click('#pause-dialog [data-close]');report.afterPause=await audibleProgress('welcome');
  assert.ok(report.afterPause.sequence>report.pausedRetry.sequence,'closing the voiced dialog repeats the current instruction');
  assert.equal((await lesson()).index,pausedStep.index);assert.equal(await page.evaluate(()=>window.__juniorQA.getStatus().lessonAdvance),-1,'old paused completion was cleared');
  await waitEnded(report.afterPause.sequence);
  await page.waitForFunction(index=>window.__juniorQA.getTutorial().index>index,pausedStep.index);
  assert.equal((await lesson()).index,pausedStep.index+1,'resuming advances one step after the new native completion');
  await waitMode('intro','audio');
  report.checks.push('Failed lesson → Pause → Retry plays real unmuted audio with the board frozen; closing Pause repeats the current instruction and advances once without a stale completion.');
  report.events=await page.evaluate(()=>window.__speechEvents);report.abortedURLs=[...abortedURLs];
  assert.equal(report.abortedURLs.length,2);assert.deepEqual(errors,[]);report.passed=true;
  console.log(JSON.stringify({checks:report.checks,captures:report.captures,expectedNetworkErrors:report.expectedNetworkErrors.length,errors},null,2));
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  if(page){report.debug=await page.evaluate(()=>({status:window.__juniorQA?.getStatus(),lesson:window.__juniorQA?.getTutorial(),voice:window.__juniorQA?.voice.getDebugState(),events:window.__speechEvents})).catch(()=>null);await capture('speech-failure').catch(()=>{});}
  throw error;
}finally{
  clearTimeout(watchdog);if(browser)await browser.close();
  await mkdir(out,{recursive:true});await writeFile(`${out}/speech-report.json`,JSON.stringify(report,null,2));
}
