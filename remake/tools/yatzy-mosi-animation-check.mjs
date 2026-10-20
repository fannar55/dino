import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createGame,roll,CATEGORIES} from '../engine/yatzy-mosi/rules.js';
import {rollFeedback} from '../engine/yatzy-mosi/feedback.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out='qa/yatzy-mosi',errors=[],report={};
const cupUiOnly=process.argv.includes('--cup-ui');
function sample(kind){
  for(let seed=1;seed<50000;seed++){
    const state=createGame({seed,startingPlayer:1});
    if(kind==='bad'){
      state.turnCount=28;
      for(const player of state.players)for(const c of CATEGORIES)player.scores[c.id]=c.id==='yatzy'?null:c.id==='chance'?5:0;
    }
    if(rollFeedback(roll(state)).kind===kind)return state;
  }
  throw new Error(`No sample for ${kind}`);
}
const samples={great:sample('great'),bad:sample('bad')};
function assertPlanted(actual,expected){actual.forEach((paw,i)=>assert.ok(Math.hypot(...paw.map((value,axis)=>value-expected[i][axis]))<1e-7,'Mosi must watch, not reach toward, the floating cup'));}
async function cupHit(page){
  await page.waitForFunction(()=>{const b=document.getElementById('cup-target');return!b.hidden&&!b.disabled;});
  return page.evaluate(()=>{const b=document.getElementById('cup-target'),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,focus=window.__yatzyQA.dice.screenCupPosition(),canvas=document.getElementById('table').getBoundingClientRect();return{x,y,w:r.width,h:r.height,hit:b.contains(document.elementFromPoint(x,y)),ready:window.__yatzyQA.dice.getDebugState().ready,projected:[canvas.x+focus.x*canvas.width,canvas.y+focus.y*canvas.height]};});
}
async function clickCup(page){const hit=await cupHit(page);assert.ok(hit.hit&&hit.ready,'the cup must be clickable at its visible projected centre');await page.mouse.click(hit.x,hit.y);return hit;}
async function inspectCupSilhouette(page){
  await cupHit(page);
  const result=await page.evaluate(()=>{
    const b=document.getElementById('cup-target'),r=b.getBoundingClientRect(),c=document.getElementById('table').getBoundingClientRect(),p=window.__yatzyQA.dice.screenCupPosition(),label=document.getElementById('cup-label').getBoundingClientRect();
    const parked=b.dataset.parked==='true';
    const x=c.x+(parked?(p.left+p.right)*.5:p.x)*c.width,y=c.y+(parked?(p.top+p.bottom)*.5:p.y)*c.height,w=(parked?p.right-p.left:p.width)*c.width,h=(parked?p.bottom-p.top:p.height)*c.height;
    const points=[{name:'rim',x,y:y-h*.43},{name:'body',x:x+w*.35,y:y+h*.20},{name:'left body',x:x-w*.35,y:y+h*.20}];
    return{parked,bounds:{x:r.x,y:r.y,w:r.width,h:r.height},silhouette:{x,y,w,h},label:{visible:getComputedStyle(document.getElementById('cup-label')).display!=='none',x:label.x,y:label.y,w:label.width,h:label.height},scene:{bottom:c.bottom,right:c.right},points:points.map(p=>({...p,hit:b.contains(document.elementFromPoint(p.x,p.y))}))};
  });
  const padding=result.parked?3:20,minimum=result.parked?44:64;
  assert.ok(result.bounds.w>=Math.max(minimum,result.silhouette.w+padding)&&result.bounds.h>=Math.max(minimum,result.silhouette.h+padding),'the click target encloses the projected cup with its appropriate parked/intro margin');
  assert.ok(result.points.every(point=>point.hit),'the rim and both sides of the cup must accept a real pointer hit');
  if(result.label.visible){
    assert.ok(result.label.y>=result.bounds.y+result.bounds.h+5||result.label.y+result.label.h<=result.bounds.y-5,'the invitation belongs outside the cup, not on its front');
    assert.ok(result.label.x>=0&&result.label.x+result.label.w<=result.scene.right&&result.label.y+result.label.h<=result.scene.bottom,'the invitation remains inside the scene');
  }else assert.ok(result.parked,'only the redundant parked invitation may be hidden');
  return result;
}
async function inspectDieHits(page){
  const hits=await page.evaluate(()=>[...document.querySelectorAll('.die-target')].map(b=>{const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{index:Number(b.dataset.index),visible:!b.hidden,hit:b.contains(document.elementFromPoint(x,y))};}));
  assert.ok(hits.length===5&&hits.every(hit=>hit.visible&&hit.hit),'the larger cup target must not cover any die centre');return hits;
}
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{
  await mkdir(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:4197/remake/yatzy-mosi.html?qa',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__yatzyQA);await page.locator('#start').click();
  report.cup=await cupHit(page);assert.ok(report.cup.hit&&report.cup.ready&&report.cup.w>=64);
  assert.ok(Math.hypot(report.cup.x-report.cup.projected[0],report.cup.y-report.cup.projected[1])<1,'the HTML hit target follows the actual 3D cup');
  await page.mouse.move(report.cup.x,report.cup.y);await page.waitForFunction(()=>document.getElementById('cup-target').matches(':hover'));
  report.cup.hover=await page.evaluate(()=>({hovered:document.getElementById('cup-target').matches(':hover'),aura:getComputedStyle(document.querySelector('.cup-aura')).animationName,label:document.getElementById('cup-label').textContent}));
  assert.ok(report.cup.hover.hovered&&report.cup.hover.aura!=='none'&&report.cup.hover.label.length>0);
  await page.screenshot({path:`${out}/black-cup-table.png`});
  if(cupUiOnly){
    report.desktopCup=await inspectCupSilhouette(page);await page.screenshot({path:`${out}/table.png`});
    const rim=report.desktopCup.points[0];await page.mouse.click(rim.x,rim.y);
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human'&&window.__yatzyQA.getState().rollCount===1);
    await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().blend===1&&!window.__yatzyQA.world.getViewState().transitioning);
    report.desktopResultCup=await inspectCupSilhouette(page);report.desktopDice=await inspectDieHits(page);
    await page.screenshot({path:`${out}/cup-ui-overview-desktop.png`});
    await page.setViewportSize({width:390,height:844});await page.evaluate(s=>window.__yatzyQA.setState(s),createGame({seed:818}));await page.waitForTimeout(350);
    report.mobileCup=await inspectCupSilhouette(page);await page.screenshot({path:`${out}/cup-ui-intro-mobile.png`});
    const body=report.mobileCup.points[1];await page.mouse.click(body.x,body.y);
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human'&&window.__yatzyQA.getState().rollCount===1);
    await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().blend===1&&!window.__yatzyQA.world.getViewState().transitioning);
    report.mobileResultCup=await inspectCupSilhouette(page);report.mobileDice=await inspectDieHits(page);
    await page.locator('.die-target[data-index="0"]').click();await page.waitForFunction(()=>!window.__yatzyQA.world.getViewState().transitioning);
    report.mobileHeldDice=await inspectDieHits(page);await page.screenshot({path:`${out}/cup-ui-overview-mobile.png`});
    assert.deepEqual(errors,[]);report.errors=errors;await writeFile(`${out}/cup-ui-report.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,desktopCup:report.desktopCup,mobileCup:report.mobileCup,desktopDice:report.desktopDice,mobileDice:report.mobileHeldDice,errors},null,2));
  }else{
  await clickCup(page);await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>1.52);
  await page.evaluate(()=>window.__yatzyQA.freeze(true));await page.screenshot({path:`${out}/black-cup-pour.png`});
  await page.evaluate(()=>window.__yatzyQA.freeze(false));await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human');
  assert.equal(await page.evaluate(()=>window.__yatzyQA.world.getViewState().mode),'table','reaction has a moment before camera moves');
  await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().transitioning);
  await page.locator('#pause').click();const frozen=await page.evaluate(()=>({view:window.__yatzyQA.world.getViewState(),camera:window.__yatzyQA.world.camera.position.toArray()}));
  await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>({view:window.__yatzyQA.world.getViewState(),camera:window.__yatzyQA.world.camera.position.toArray()})),frozen);
  await page.locator('#pause-dialog [data-close]').click();await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().blend===1&&!window.__yatzyQA.world.getViewState().transitioning);
  await page.evaluate(()=>window.__yatzyQA.freeze(true));await page.screenshot({path:`${out}/dice-overview.png`});
  report.overview=await page.evaluate(()=>{
    const q=window.__yatzyQA,w=q.world;
    return{state:q.getState(),view:w.getViewState(),topVisibility:q.dice.dice.map(d=>w.camera.position.clone().sub(d.position).normalize().y),snapshot:q.getSnapshot()};
  });
  // The close perspective has more parallax than the former wide shot. Keep
  // every die above a 47-degree viewing elevation; the dedicated readability
  // check independently verifies larger projected top faces and no overlays.
  assert.ok(report.overview.topVisibility.every(y=>y>.73),`camera clearly sees all upward faces: ${report.overview.topVisibility}`);
  assert.deepEqual(report.overview.snapshot.dice.up,report.overview.state.dice);
  await page.evaluate(()=>window.__yatzyQA.freeze(false));await page.locator('.die-target[data-index="0"]').click();
  await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__yatzyQA.getState().held[0]),true);
  for(let i=1;i<5;i++){await page.locator(`.die-target[data-index="${i}"]`).click();await page.waitForTimeout(360);}
  assert.equal(await page.evaluate(()=>document.getElementById('cup-target').hidden&&document.getElementById('cup-target').disabled&&!window.__yatzyQA.dice.getDebugState().ready),true,'an all-held hand must not advertise an illegal roll');
  await page.locator('.die-target[data-index="0"]').click();await cupHit(page);
  for(const [kind,state]of Object.entries(samples)){
    await page.evaluate(s=>window.__yatzyQA.setState(s),state);
    const paws=await page.evaluate(()=>window.__yatzyQA.opponent.getDebugState().paws);
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='rolling');
    await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>1.7);await page.evaluate(()=>window.__yatzyQA.freeze(true));
    const watch=await page.evaluate(()=>({opponent:window.__yatzyQA.opponent.getDebugState(),focus:window.__yatzyQA.dice.getFocusTarget().toArray()}));
    assertPlanted(watch.opponent.paws,paws);assert.equal(watch.opponent.watch.rolling,true);assert.deepEqual(watch.opponent.watch.target,watch.focus);
    await page.screenshot({path:`${out}/mosi-${kind}-pour.png`});await page.evaluate(()=>window.__yatzyQA.freeze(false));
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='ai-wait'&&window.__yatzyQA.getState().rollCount===1);
    await page.waitForTimeout(450);await page.evaluate(()=>window.__yatzyQA.freeze(true));
    report[kind]=await page.evaluate(()=>window.__yatzyQA.getSnapshot());
    assert.equal(report[kind].opponent.reaction,kind);
    assert.deepEqual(report[kind].dice.up,report[kind].dice.values,'the opponent roll must settle with the committed values upward');
    await page.screenshot({path:`${out}/mosi-${kind}-reaction.png`});await page.evaluate(()=>window.__yatzyQA.freeze(false));
    await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().blend===1&&!window.__yatzyQA.world.getViewState().transitioning);
    await page.evaluate(()=>window.__yatzyQA.freeze(true));await page.screenshot({path:`${out}/mosi-${kind}-overview.png`});
    await page.evaluate(()=>window.__yatzyQA.freeze(false));
  }
  const human=roll(createGame({seed:123}));await page.evaluate(s=>window.__yatzyQA.setState(s),human);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
  await page.locator('.die-target[data-index="0"]').click();await page.waitForFunction(()=>!window.__yatzyQA.world.getViewState().transitioning);
  await page.screenshot({path:`${out}/dice-overview-mobile.png`});
  report.mobile=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,view:window.__yatzyQA.world.getViewState(),targets:[...document.querySelectorAll('.die-target')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};}),totals:[...document.querySelectorAll('.player-card')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})}));
  assert.equal(report.mobile.width,390);assert.ok(report.mobile.targets.every(r=>r.hit&&r.x>=0&&r.y>=0&&r.x+r.w<=390&&r.y+r.h<472));
  assert.ok(report.mobile.totals.every(r=>r.y+r.h<=844));
  report.mobile.cup=await clickCup(page);await page.waitForFunction(()=>window.__yatzyQA.dice.getDebugState().elapsed>.5);
  const committed=await page.evaluate(()=>window.__yatzyQA.getState());
  await page.locator('#pause').click();const pausedDice=await page.evaluate(()=>window.__yatzyQA.dice.getDebugState());
  await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>window.__yatzyQA.dice.getDebugState()),pausedDice);
  await page.locator('#motion').click();assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cup-aura')).animationName),'none','calm mode disables the invitation pulse');
  await page.locator('#pause-dialog [data-close]').click();await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human');
  report.calm=await page.evaluate(()=>({state:window.__yatzyQA.getState(),snapshot:window.__yatzyQA.getSnapshot()}));
  assert.deepEqual(report.calm.state,committed,'changing motion mode must not reroll the committed result');
  assert.deepEqual(report.calm.snapshot.dice.up,committed.dice);assert.equal(report.calm.snapshot.view.blend,1);
  assert.deepEqual(errors,[]);
  report.errors=errors;await writeFile(`${out}/animation-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,overview:report.overview.view,topVisibility:report.overview.topVisibility,reactions:[report.great.opponent.reaction,report.bad.opponent.reaction],mobile:report.mobile.view,errors},null,2));
  }
}finally{await browser.close();}
