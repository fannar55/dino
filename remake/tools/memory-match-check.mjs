import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'C:/Users/fannare/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const film=process.env.MEMORY_MATCH_FILM==='1',baseline=process.env.MEMORY_MATCH_BASELINE==='1',out=process.env.MEMORY_CHECK_OUT||`qa/memory/playflow/match-${baseline?'before':'check'}`;
await mkdir(out,{recursive:true});
const overrides=new Map();
for(const name of ['world','world-home-nav','baby-actors','travel-traffic']){
  let source=await readFile(baseline?`qa/memory/playflow/movement-before/${name}.js`:`remake/engine/memory/${name}.js`,'utf8');
  if(name==='world')source=source.replace('updateTargets(); renderer.info.reset(); renderer.render(scene, camera);','updateTargets(); renderer.info.reset(); if(globalThis.__drawMatch)renderer.render(scene, camera);');
  overrides.set(`/remake/engine/memory/${name}.js`,source);
}
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%}canvas{width:100%;height:100%}</style><script type="importmap">{"imports":{"three":"/dist/vendor/three.module.js","three/addons/":"/dist/vendor/addons/"}}</script><canvas id="world"></canvas>';
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,s=p==='/match.html'?html:overrides.get(p);if(s!==undefined){res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':'text/javascript','Cache-Control':'no-store'});res.end(s)}else void handle(req,res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}});
const report={passed:false,baseline,errors:[],runs:[],violations:[],captures:[]};
page.on('pageerror',e=>report.errors.push(e.stack));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/match.html?quality=tablet`);
  await page.evaluate(async({baseline})=>{
    const {createMemoryWorld}=await import('/remake/engine/memory/world.js'),{createMemoryGame}=await import('/remake/engine/memory/rules.js'),{assessSceneClearances}=await import('/remake/engine/memory/memory-clearance.js');
    const world=await createMemoryWorld({canvas:document.getElementById('world')});world.resize(1280,800);
    globalThis.__drawMatch=false;
    const g=globalThis.__matchCheck={world,time:0,frames:0,violations:[],runs:[],captured:new Set()};
    g.board=seed=>{let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};g.cards=createMemoryGame({random}).getState().cards;g.unlocked=[];world.setBoard(g.cards);world.setBridgeState({selected:null,unlocked:[]});g.previous=new Map();};
    g.tick=()=>{g.time+=1/30;g.frames++;world.update(1/30,g.time);const s=world.getDebug({collision:false});
      if(g.run){
        const r=g.run;let moving=0;
        for(const c of s.cells.filter(c=>r.ids.includes(c.id))){const p=g.previous.get(c.id);if(p&&Math.hypot(c.position[0]-p[0],c.position[2]-p[2])>.002)moving++;if(c.moving&&!c.queued&&r.starts[c.id]===undefined)r.starts[c.id]=g.time-r.start;if(c.moved&&r.arrivals[c.id]===undefined)r.arrivals[c.id]=g.time-r.start;g.previous.set(c.id,[...c.position]);}
        r.maxMoving=Math.max(r.maxMoving,moving);
        if(!baseline&&g.frames%3===0){const precise=world.getDebug(),audit=assessSceneClearances(precise);r.anatomySamples++;for(const v of audit.violations){const key=`${v.a}/${v.b}/${v.partA}/${v.partB}`;if(!g.violations.some(x=>x.key===key))g.violations.push({key,...v,run:r.species,frame:g.frames,actors:precise.collisionActors});}}
        if(moving===2&&!g.captured.has(r.species)){g.captured.add(r.species);g.capture=r.species;}
      }return s;};
    g.begin=species=>{const ids=g.cards.filter(c=>c.species===species).map(c=>c.id);ids.forEach(id=>world.reveal(id));for(let i=0;i<20;i++)g.tick();g.run={species,ids,start:g.time,starts:{},arrivals:{},maxMoving:0,anatomySamples:0};world.match(ids,g.unlocked.length,species);g.unlocked.push(species);world.setBridgeState({selected:null,unlocked:[...g.unlocked]});};
    g.batch=()=>{for(let i=0;i<15;i++){const s=g.tick();if(g.capture)return{capture:g.capture};if(g.run.ids.every(id=>s.cells.find(c=>c.id===id).moved)){g.run.seconds=g.time-g.run.start;g.runs.push(g.run);g.run=null;return{done:true}}}return{};};g.board(613);
  },{baseline});
  for(const species of ['brontosaurus','triceratops','stegosaurus']){
    await page.evaluate(s=>__matchCheck.begin(s),species);
    let done=false;
    for(let i=0;i<120&&!done;i++){
      const result=await page.evaluate(()=>__matchCheck.batch());done=!!result.done;
      if(result.capture){await page.evaluate(()=>{__drawMatch=true;__matchCheck.world.update(0);__drawMatch=false;__matchCheck.capture=null});await page.screenshot({path:`${out}/${species}-paired.png`});report.captures.push(`${species}-paired.png`);
        if(film)for(let frame=1;frame<=8;frame++){
          await page.evaluate(()=>{for(let k=0;k<3;k++)__matchCheck.tick();__drawMatch=true;__matchCheck.world.update(0);__drawMatch=false;});
          const name=`${species}-motion-${frame}.png`;await page.screenshot({path:`${out}/${name}`});report.captures.push(name);
        }
      }
    }
    if(!done)throw new Error(`match ${species} did not settle in60game seconds`);
    report.runs=await page.evaluate(()=>__matchCheck.runs);report.violations=await page.evaluate(()=>__matchCheck.violations);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  }
  assert.deepEqual(report.errors,[]);if(!baseline){assert.deepEqual(report.violations.map(({actors,...v})=>v),[]);for(const r of report.runs)assert.equal(r.maxMoving,2,`${r.species} overlaps`)}report.passed=true;
}catch(e){report.failure=e.stack;report.runs=await page.evaluate(()=>__matchCheck?.runs).catch(()=>[]);report.violations=await page.evaluate(()=>__matchCheck?.violations).catch(()=>[]);}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,runs:report.runs,violations:report.violations.map(({actors,...v})=>v),failure:report.failure},null,2));if(!report.passed)process.exitCode=1;
