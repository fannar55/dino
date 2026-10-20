import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
const errors=[];
function assertPlanted(actual,expected){actual.forEach((paw,i)=>assert.ok(Math.hypot(...paw.map((value,axis)=>value-expected[i][axis]))<1e-7,'Mosi watches the autonomous cup with planted paws'));}
async function clickCup(page){
  await page.waitForFunction(()=>{const b=document.getElementById('cup-target');return!b.hidden&&!b.disabled;});
  const hit=await page.evaluate(()=>{const b=document.getElementById('cup-target'),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,w:r.width,h:r.height,minimum:b.dataset.parked==='true'?44:64,hit:b.contains(document.elementFromPoint(x,y)),ready:window.__yatzyQA.dice.getDebugState().ready,label:b.getAttribute('aria-label')};});
  assert.ok(hit.hit&&hit.ready&&hit.w>=hit.minimum&&hit.h>=hit.minimum,'the visible cup is a usable, unobstructed roll target');
  await page.mouse.move(hit.x,hit.y);await page.mouse.click(hit.x,hit.y);return hit;
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:4197/remake/yatzy-mosi.html?qa',{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>window.__yatzyQA||!document.getElementById('error').hidden,undefined,{timeout:90000});
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>Boolean(window.__yatzyQA)));
  await mkdir('qa/yatzy-mosi',{recursive:true});
  await page.locator('#start').click();await page.waitForTimeout(600);await page.screenshot({path:'qa/yatzy-mosi/table.png'});
  const restingPaws=await page.evaluate(()=>window.__yatzyQA.opponent.getDebugState().paws);
  const firstCup=await clickCup(page);await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>1.2);
  await page.evaluate(()=>window.__yatzyQA.freeze(true));await page.screenshot({path:'qa/yatzy-mosi/cup.png'});
  const paused=await page.evaluate(()=>window.__yatzyQA.getSnapshot());await page.waitForTimeout(400);
  const frozen=await page.evaluate(()=>window.__yatzyQA.getSnapshot());assert.deepEqual(frozen.dice,paused.dice);assert.deepEqual(frozen.opponent,paused.opponent);
  assertPlanted(paused.opponent.paws,restingPaws);assert.equal(paused.opponent.watch.rolling,true);
  assert.equal(await page.evaluate(()=>document.getElementById('cup-target').hidden&&document.getElementById('cup-target').disabled),true);
  await page.evaluate(()=>window.__yatzyQA.freeze(false));await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human');
  await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().blend===1&&!window.__yatzyQA.world.getViewState().transitioning);
  await page.screenshot({path:'qa/yatzy-mosi/rolled.png'});
  const roll=await page.evaluate(()=>({state:window.__yatzyQA.getState(),snapshot:window.__yatzyQA.getSnapshot()}));
  assert.deepEqual(roll.snapshot.dice.up,roll.state.dice);
  await page.locator('.die-target[data-index="0"]').click();await page.waitForTimeout(400);const kept=await page.evaluate(()=>window.__yatzyQA.getState().dice[0]);
  await clickCup(page);await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human');
  assert.equal(await page.evaluate(()=>window.__yatzyQA.getState().dice[0]),kept);
  await page.locator('.score[data-player="0"][data-category="chance"]').click();
  await page.waitForFunction(()=>window.__yatzyQA.getState().currentPlayer===1&&window.__yatzyQA.getStatus().phase==='rolling');
  await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>.9);await page.evaluate(()=>window.__yatzyQA.freeze(true));
  await page.screenshot({path:'qa/yatzy-mosi/mosi-turn.png'});await page.evaluate(()=>window.__yatzyQA.freeze(false));
  await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>1.7);await page.evaluate(()=>window.__yatzyQA.freeze(true));
  const pourWatch=await page.evaluate(()=>({opponent:window.__yatzyQA.opponent.getDebugState(),focus:window.__yatzyQA.dice.getFocusTarget().toArray(),cupDisabled:document.getElementById('cup-target').disabled}));
  assertPlanted(pourWatch.opponent.paws,restingPaws);assert.equal(pourWatch.opponent.watch.rolling,true);assert.equal(pourWatch.cupDisabled,true);
  assert.deepEqual(pourWatch.opponent.watch.target,pourWatch.focus,'Mosi follows the actual autonomous cup during pouring');
  await page.screenshot({path:'qa/yatzy-mosi/mosi-pour.png'});await page.evaluate(()=>window.__yatzyQA.freeze(false));
  await page.waitForFunction(()=>window.__yatzyQA.getState().turnCount===2&&window.__yatzyQA.getStatus().phase==='human');
  await page.screenshot({path:'qa/yatzy-mosi/scores.png'});
  const scores=await page.evaluate(()=>({state:window.__yatzyQA.getState(),status:window.__yatzyQA.getStatus(),snapshot:window.__yatzyQA.getSnapshot()}));
  assert.ok(scores.state.players.every(p=>Object.values(p.scores).filter(n=>n!==null).length===1));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);await page.screenshot({path:'qa/yatzy-mosi/mobile.png'});
  const mobile=await page.evaluate(()=>({width:document.documentElement.scrollWidth,inner:innerWidth,totals:[...document.querySelectorAll('.player-card')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})}));
  assert.ok(mobile.width<=mobile.inner);assert.ok(mobile.totals.every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=390&&r.y+r.height<=844));
  assert.deepEqual(errors,[]);const report={firstCup,firstRoll:roll.state.dice,held:kept,paused:true,pourWatch,scores,mobile,errors};await writeFile('qa/yatzy-mosi/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
