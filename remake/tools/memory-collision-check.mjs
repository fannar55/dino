#!/usr/bin/env node
// Real animated journey clearance probe. Run with PLAYWRIGHT_PATH set to the
// installed package. MEMORY_COLLISION_BASELINE=1 records failures for diagnosis.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.MEMORY_COLLISION_OUT||path.join(root,'qa/memory/polish/collision');
const report={startedAt:new Date().toISOString(),passed:false,errors:[],captures:[]};
let browser,page,timer;
await mkdir(out,{recursive:true});
const ready=()=>page.waitForFunction(()=>window.__memory.stats().camera.settled&&!window.__memory.stats().camera.moving,null,{timeout:30000});
async function click(selector){await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(s=>!document.querySelector(s)?.disabled,selector);await page.locator(selector).click();}
async function select(species){const index=await page.evaluate(s=>window.__memory.stats().nests.find(n=>n.species===s).index,species);await click(`[data-target="nest-${index}"]`);await ready();}
async function capture(name){await page.screenshot({path:path.join(out,`${name}.png`)});report.captures.push(name);(report.poses??={})[name]=await page.evaluate(()=>{const s=window.__memory.stats();return{actors:s.collisionActors,bridge:s.bridge,homeNavigation:s.homeNavigation,cells:s.cells};});report.audit=await page.evaluate(()=>window.__collisionAudit);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));const worst=Object.values(report.audit?.worst??{}).sort((a,b)=>a.clearance-b.clearance).slice(0,3);console.log(JSON.stringify({capture:name,frames:report.audit?.frames,worst:worst.map(({a,b,stage,clearance,kindA,kindB})=>({a,b,stage,clearance,kindA,kindB}))}));}
async function action(id,target){await click(`[data-target="task-${target}"]`);await page.waitForFunction(()=>window.__memory.bridge().active===null,null,{timeout:180000});await ready();await capture(id);const b=await page.evaluate(()=>window.__memory.bridge());assert.ok(id==='lift'?b.branch==='held':id==='roll'?b.bridgeBuilt:id==='cross'?b.atStaging:id==='lay'?b.boardwalkBuilt:b.visited,`${id} completed rather than returning a safe planning failure`);console.log(`Completed ${id}`);}
try{
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='__COMPAT_LAYER'))});
  timer=setTimeout(()=>void browser?.close(),600000);timer.unref();
  page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>report.errors.push(e.stack||e.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
  await page.goto(`${process.env.MEMORY_URL||'http://127.0.0.1:4206/remake/minnisspil.html'}?play=1&seed=321&qa=1`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__memoryReady===true,null,{timeout:120000});await ready();await capture('glade');
  await page.evaluate(async()=>{
    const {assessSceneClearances}=await import('/remake/engine/memory/memory-clearance.js');
    assessSceneClearances(window.__memory.stats());
    window.__collisionAudit={frames:0,stages:{},worst:{},minimum:Infinity,permitted:0,allIds:[],poses:{}};
    let previous=0;
    const tick=now=>{
      const audit=window.__collisionAudit;
      if(now-previous>80&&!audit.stopped){previous=now;const stats=window.__memory.stats();
        {const result=assessSceneClearances(stats),bridge=stats.bridge,stage=bridge.action?`${bridge.action.id}/${bridge.action.phase}/${bridge.action.panel}`:bridge.stage;
          audit.frames++;audit.stages[stage]=(audit.stages[stage]||0)+1;audit.minimum=Math.min(audit.minimum,result.minimum??Infinity);audit.permitted+=result.permittedContacts.length;
          for(const actor of stats.collisionActors??[]){if(!audit.allIds.includes(actor.id))audit.allIds.push(actor.id);audit.poses[actor.species]??={hull:actor.hull,parts:actor.parts.length,scale:actor.scale};}
          for(const hit of result.violations){const key=`${stage}:${hit.a}:${hit.b}:${hit.kindA}:${hit.kindB}`,old=audit.worst[key];
            if(!old||hit.clearance<old.clearance)audit.worst[key]={...hit,stage,phase:bridge.action,positions:(stats.collisionActors??[]).map(a=>({id:a.id,position:a.position,yaw:a.yaw,gesture:a.gesture})),cargo:bridge.boardwalk.cargo};
          }
        }
      }
      requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
  });
  for(const species of ['brontosaurus','triceratops','stegosaurus']){
    const ids=await page.evaluate(s=>window.__memory.state().cards.filter(c=>c.species===s).map(c=>c.id),species);
    for(const id of ids){await click(`[data-target="leaf-${id}"]`);await page.waitForFunction(()=>['one-open','ready','won'].includes(window.__memory.state().phase),null,{timeout:30000});}
  }
  await page.waitForFunction(()=>window.__memory.stats().cells.every(c=>c.moved&&!c.moving),null,{timeout:90000});await ready();await capture('homes');
  await select('brontosaurus');await action('lift','branch');
  await select('triceratops');await action('roll','log');
  await action('cross','staging');await select('stegosaurus');await action('lay','bark');await action('finish','grove');
  await page.waitForTimeout(1500);
  report.audit=await page.evaluate(()=>{window.__collisionAudit.stopped=true;return window.__collisionAudit;});
  report.worst=Object.values(report.audit.worst).sort((a,b)=>a.clearance-b.clearance);
  assert.equal(report.audit.allIds.filter(id=>id!=='mosi').length,6,'all six real animated characters are measured');
  assert.ok(report.audit.frames>100,'journey includes meaningful dynamic collision samples');
  assert.ok(Object.keys(report.audit.stages).some(s=>s.startsWith('lay/place')),'turning and placing cargo was sampled');
  assert.deepEqual(report.errors,[],'no browser exceptions');
  if(process.env.MEMORY_COLLISION_BASELINE!=='1')assert.equal(report.worst.length,0,'no material overlap between anatomical envelopes or non-contact props');
  report.passed=report.worst.length===0;
}catch(error){report.failure={message:error.message,stack:error.stack};if(page)await capture('failure').catch(()=>{});if(page)report.audit=await page.evaluate(()=>window.__collisionAudit).catch(()=>null);}
finally{clearTimeout(timer);await browser?.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,frames:report.audit?.frames,overlaps:report.worst?.length,worst:report.worst?.slice(0,12).map(({stage,a,b,clearance,kindA,kindB})=>({stage,a,b,clearance,kindA,kindB})),failure:report.failure?.message,out},null,2));
if(report.failure)process.exitCode=1;
