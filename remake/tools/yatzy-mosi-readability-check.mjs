import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createGame,roll,hold} from '../engine/yatzy-mosi/rules.js';

// Measure the rendered meshes independently of the bounds used by the UI.
// This catches badges which clear their own die but cover a neighbouring face.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out='qa/yatzy-mosi',errors=[],report={layouts:[],camera:[],heldMotion:[],cupSafety:[],errors};
const cupSafetyOnly=process.argv.includes('--cup-safety');
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
function intersects(rect,polygon){
  const box=[{x:rect.x,y:rect.y},{x:rect.x+rect.w,y:rect.y},{x:rect.x+rect.w,y:rect.y+rect.h},{x:rect.x,y:rect.y+rect.h}];
  for(const shape of [box,polygon])for(let i=0;i<shape.length;i++){
    const a=shape[i],b=shape[(i+1)%shape.length],nx=a.y-b.y,ny=b.x-a.x;
    const p=polygon.map(v=>v.x*nx+v.y*ny),q=box.map(v=>v.x*nx+v.y*ny);
    if(Math.max(...p)<=Math.min(...q)+.2||Math.max(...q)<=Math.min(...p)+.2)return false;
  }
  return true;
}
async function inspect(page,label){
  const sample=await page.evaluate(label=>{
    const q=window.__yatzyQA,canvas=document.getElementById('table').getBoundingClientRect(),camera=q.world.camera;
    function bounds(points){const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};}
    function hull(points){
      const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lower=[],upper=[];
      for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
      for(const p of sorted.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
      lower.pop();upper.pop();return lower.concat(upper);
    }
    function area(points){return Math.abs(points.reduce((sum,p,i)=>{const n=points[(i+1)%points.length];return sum+p.x*n.y-n.x*p.y;},0))/2;}
    function pseudoRect(button,name){
      const s=getComputedStyle(button,name);if(s.content==='none'||s.display==='none')return null;
      const r=button.getBoundingClientRect(),b=getComputedStyle(button),number=v=>Number.parseFloat(v)||0;
      let w=number(s.width),h=number(s.height);
      if(s.boxSizing!=='border-box'){w+=number(s.paddingLeft)+number(s.paddingRight)+number(s.borderLeftWidth)+number(s.borderRightWidth);h+=number(s.paddingTop)+number(s.paddingBottom)+number(s.borderTopWidth)+number(s.borderBottomWidth);}
      const tr=s.translate.split(' '),shift=(value,length)=>value?.includes('%')?number(value)*length/100:number(value);
      return{x:r.x+number(b.borderLeftWidth)+number(s.left)+number(s.marginLeft)+shift(tr[0],w),y:r.y+number(b.borderTopWidth)+number(s.top)+number(s.marginTop)+shift(tr[1],h),w,h,content:s.content};
    }
    const models=q.dice.dice.map((die,index)=>{
      die.updateWorldMatrix(true,false);const p=die.geometry.attributes.position,world=[],v=die.position.clone();let top=-Infinity;
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(die.matrixWorld);top=Math.max(top,v.y);world.push(v.clone());}
      const project=v=>{v.project(camera);return{x:canvas.x+(v.x*.5+.5)*canvas.width,y:canvas.y+(-v.y*.5+.5)*canvas.height};};
      const topFace=hull(world.filter(v=>top-v.y<1e-5).map(v=>project(v.clone()))),silhouette=hull(world.map(project));
      const centre=project(die.getWorldPosition(v)),button=document.querySelector(`.die-target[data-index="${index}"]`),held=q.getState().held[index],text=button.querySelector('span'),r=text.getBoundingClientRect();
      return{index,visible:die.visible,held,centre,hit:button.contains(document.elementFromPoint(centre.x,centre.y)),silhouette,bounds:bounds(silhouette),face:{...bounds(topFace),area:area(topFace)},badge:pseudoRect(button,'::before'),check:held?pseudoRect(button,'::after'):null,heldLabel:held?{x:r.x,y:r.y,w:r.width,h:r.height}:null};
    });
    return{label,viewport:[innerWidth,innerHeight],canvas:{x:canvas.x,y:canvas.y,w:canvas.width,h:canvas.height},state:q.getState(),view:q.world.getViewState(),up:q.dice.getDebugState().up,models};
  },label);
  const widths=sample.models.map(m=>m.bounds.w),faces=sample.models.map(m=>m.face.w);
  sample.measurement={minDieWidth:Math.min(...widths),meanDieWidth:widths.reduce((a,b)=>a+b)/5,minTopFaceWidth:Math.min(...faces),meanTopFaceWidth:faces.reduce((a,b)=>a+b)/5};
  report.layouts.push(sample);await page.screenshot({path:`${out}/readability-${label}.png`});
  assert.deepEqual(sample.up,sample.state.dice,`${label}: true upward faces match the result`);
  assert.ok(sample.models.every(m=>m.visible&&m.hit),`${label}: every actual die centre is visible and unobstructed`);
  for(const model of sample.models){
    const r=model.bounds,c=sample.canvas;
    assert.ok(r.x>=c.x&&r.y>=c.y&&r.x+r.w<=c.x+c.w&&r.y+r.h<=c.y+c.h,`${label}: complete die ${model.index} stays in the scene`);
    assert.ok(model.face.area>100,`${label}: die ${model.index} presents a real upward face`);
    assert.ok(model.badge,`${label}: settled result badge is present`);
    for(const [kind,rect]of Object.entries({badge:model.badge,check:model.check,heldLabel:model.heldLabel}))if(rect){
      assert.ok(rect.x>=c.x&&rect.y>=c.y&&rect.x+rect.w<=c.x+c.w&&rect.y+rect.h<=c.y+c.h,`${label}: ${kind} ${model.index} stays inside the scene`);
      for(const neighbor of sample.models)assert.ok(!intersects(rect,neighbor.silhouette),`${label}: ${kind} ${model.index} must not cover die ${neighbor.index}`);
    }
  }
  return sample;
}
function layout(player,kind){let s=roll(createGame({seed:1703,startingPlayer:player}));for(let i=0;i<5;i++)if(kind==='all-held'||kind==='mixed'&&i%2===0)s=hold(s,i);return s;}
async function heldMotion(page,device,index){
  await page.evaluate(state=>{window.__yatzyQA.freeze(false);window.__yatzyQA.setState(state);},layout(0,'free'));
  await page.waitForTimeout(90);await page.locator(`.die-target[data-index="${index}"]`).click();
  const frames=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[];
    function step(time){
      const q=window.__yatzyQA,canvas=document.getElementById('table').getBoundingClientRect(),view=q.world.getViewState();
      const bounds=q.dice.dice.map(die=>{
        die.updateWorldMatrix(true,false);const p=die.geometry.attributes.position,v=die.position.clone();let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(die.matrixWorld).project(q.world.camera);const x=(v.x*.5+.5)*canvas.width,y=(-v.y*.5+.5)*canvas.height;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        return{left,right,top,bottom};
      });
      frames.push({time,view,bounds,width:canvas.width,height:canvas.height});
      if(frames.length>2&&!view.transitioning)resolve(frames);else requestAnimationFrame(step);
    }requestAnimationFrame(step);
  }));
  report.heldMotion.push({device,index,frames});
  for(const frame of frames)for(const [die,bounds]of frame.bounds.entries())assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=frame.width&&bounds.bottom<=frame.height,`${device}: keeping ${index} must not clip die ${die} during the camera reframe`);
  assert.ok(frames.length>3,`${device}: held reframe remains a visible smooth movement`);
}
async function setSafetyLayout(page,kind='free'){
  await page.evaluate(state=>{window.__yatzyQA.freeze(false);window.__yatzyQA.setState(state);},layout(0,kind));
  await page.waitForFunction(()=>!window.__yatzyQA.world.getViewState().transitioning);
}
async function cupSeparation(page,label){
  const sample=await page.evaluate(label=>{
    const q=window.__yatzyQA,c=document.getElementById('table').getBoundingClientRect(),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
    function projected(root){
      root.updateWorldMatrix(true,true);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;const p=root.position.clone();
      root.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(q.world.camera);const x=c.x+(p.x*.5+.5)*c.width,y=c.y+(-p.y*.5+.5)*c.height;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}});
      return{x:left,y:top,w:right-left,h:bottom-top};
    }
    return{label,cup:rect(document.getElementById('cup-target')),cupLabel:rect(document.getElementById('cup-label')),cupMesh:projected(q.dice.cup),cupScale:q.dice.cup.scale.x,targets:[...document.querySelectorAll('.die-target')].map(rect),meshes:q.dice.dice.map(projected)};
  },label);
  const gap=(a,b)=>Math.hypot(Math.max(a.x-b.x-b.w,b.x-a.x-a.w,0),Math.max(a.y-b.y-b.h,b.y-a.y-a.h,0));
  sample.targetGaps=sample.targets.map(d=>gap(sample.cup,d));sample.meshGaps=sample.meshes.map(d=>gap(sample.cupMesh,d));sample.labelGaps=sample.meshes.map(d=>gap(sample.cupLabel,d));
  report.cupSafety.push(sample);await page.screenshot({path:`${out}/cup-safety-${label}.png`});
  assert.ok(sample.targetGaps.every(g=>g>0),`${label}: the complete cup target must not overlap any die target: ${sample.targetGaps}`);
  assert.ok(sample.meshGaps.every(g=>g>0),`${label}: the parked cup must not cover a visible die: ${sample.meshGaps}`);
  assert.ok(sample.labelGaps.every(g=>g>0),`${label}: the cup invitation must not cover a visible die: ${sample.labelGaps}`);
  return sample;
}
async function runCupSafety(page){
  const points=[[.5,.5],[.12,.5],[.88,.5],[.5,.12],[.5,.88],[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
  for(const [device,size]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    await page.setViewportSize(size);await page.waitForTimeout(120);
    for(const kind of ['free','mixed']){
      await setSafetyLayout(page,kind);await page.waitForFunction(()=>!document.getElementById('cup-target').hidden&&!document.getElementById('cup-target').disabled);
      const sample=await cupSeparation(page,`${device}-${kind}`);sample.taps=[];
      for(let index=0;index<5;index++)for(const [u,v]of points){
        await setSafetyLayout(page,kind);
        const before=await page.evaluate(({index,u,v})=>{
          const q=window.__yatzyQA,b=document.querySelector(`.die-target[data-index="${index}"]`),r=b.getBoundingClientRect(),x=r.x+r.width*u,y=r.y+r.height*v;
          return{x,y,hit:b.contains(document.elementFromPoint(x,y)),state:q.getState(),serial:q.dice.getDebugState().serial};
        },{index,u,v});
        assert.ok(before.hit,`${device}-${kind}: die ${index} edge ${u},${v} has pointer priority`);
        await page.mouse.click(before.x,before.y);
        const after=await page.evaluate(()=>({state:window.__yatzyQA.getState(),serial:window.__yatzyQA.dice.getDebugState().serial}));
        const expected=structuredClone(before.state);expected.held[index]=!expected.held[index];
        assert.deepEqual(after.state,expected,`${device}-${kind}: tapping die ${index} must only toggle its held state`);
        assert.equal(after.serial,before.serial,'a die tap cannot start a new dice animation');sample.taps.push({index,u,v});
      }
    }
    await setSafetyLayout(page);
    const oldCup=await page.evaluate(()=>{const r=document.getElementById('cup-target').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,roll:window.__yatzyQA.getState().rollCount,serial:window.__yatzyQA.dice.getDebugState().serial};});
    await page.locator('.die-target[data-index="4"]').click();
    await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().transitioning&&(document.getElementById('cup-target').disabled||document.getElementById('cup-target').hidden));
    await page.mouse.click(oldCup.x,oldCup.y);
    assert.deepEqual(await page.evaluate(()=>({roll:window.__yatzyQA.getState().rollCount,serial:window.__yatzyQA.dice.getDebugState().serial})),{roll:oldCup.roll,serial:oldCup.serial},`${device}: a moving result cannot accidentally activate the parked cup`);
    await page.waitForFunction(()=>!window.__yatzyQA.world.getViewState().transitioning&&!document.getElementById('cup-target').disabled&&!document.getElementById('cup-target').hidden);
    const beforeRoll=await page.evaluate(()=>({count:window.__yatzyQA.getState().rollCount,serial:window.__yatzyQA.dice.getDebugState().serial}));
    await page.locator('#cup-target').click();await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='rolling');
    assert.deepEqual(await page.evaluate(()=>({count:window.__yatzyQA.getState().rollCount,serial:window.__yatzyQA.dice.getDebugState().serial})),{count:beforeRoll.count+1,serial:beforeRoll.serial+1},`${device}: a deliberate cup-body click still rolls`);
    await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human'&&!window.__yatzyQA.world.getViewState().transitioning&&!document.getElementById('cup-target').disabled&&!document.getElementById('cup-target').hidden);
    await setSafetyLayout(page,'all-held');assert.equal(await page.evaluate(()=>document.getElementById('cup-target').disabled&&document.getElementById('cup-target').hidden),true);
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/cup-safety-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,layouts:report.cupSafety.map(s=>({label:s.label,minTargetGap:Math.min(...s.targetGaps),minMeshGap:Math.min(...s.meshGaps),cupScale:s.cupScale,taps:s.taps.length})),errors},null,2));
}
try{
  await mkdir(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:4197/remake/yatzy-mosi.html?qa',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__yatzyQA);await page.locator('#start').click();
  if(cupSafetyOnly){await runCupSafety(page);}else{
  // A real pointer roll exercises the reaction beat and the production zoom.
  await page.locator('#cup-target').click();await page.waitForFunction(()=>window.__yatzyQA.getStatus().phase==='human');
  assert.equal(await page.evaluate(()=>window.__yatzyQA.world.getViewState().mode),'table');
  await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().transitioning);
  report.camera=await page.evaluate(()=>new Promise(resolve=>{const frames=[];function step(now){const q=window.__yatzyQA,s=q.world.getViewState();frames.push({time:now,blend:s.blend,position:q.world.camera.position.toArray(),quaternion:q.world.camera.quaternion.toArray()});if(!s.transitioning)resolve(frames);else requestAnimationFrame(step);}requestAnimationFrame(step);}));
  assert.ok(report.camera.length>8,'the zoom has multiple visible progressive frames');
  assert.ok(report.camera.every((f,i,a)=>i===0||f.blend>=a[i-1].blend),'zoom progresses without jumping backwards');
  assert.ok(report.camera.some(f=>f.blend>.2&&f.blend<.8),'zoom passes smoothly through its middle');
  await page.evaluate(()=>window.__yatzyQA.freeze(true));await inspect(page,'desktop-actual-roll');
  for(const [device,size]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    await page.setViewportSize(size);await page.waitForTimeout(120);
    for(const player of [0,1])for(const kind of ['free','mixed','all-held']){
      await page.evaluate(state=>{window.__yatzyQA.freeze(false);window.__yatzyQA.setState(state);},layout(player,kind));
      await page.waitForTimeout(80);await page.evaluate(()=>window.__yatzyQA.freeze(true));
      await inspect(page,`${device}-${player?'mosi':'human'}-${kind}`);
    }
    for(let index=0;index<5;index++)await heldMotion(page,device,index);
    await page.evaluate(()=>window.__yatzyQA.freeze(true));await inspect(page,`${device}-held-transition-end`);
  }
  // Pause in an actual zoom, then switch to calm mode while it is suspended.
  await page.evaluate(state=>{window.__yatzyQA.freeze(false);window.__yatzyQA.setState(state);},createGame({seed:504}));
  await page.locator('#cup-target').click();await page.waitForFunction(()=>window.__yatzyQA.world.getViewState().transitioning);
  await page.locator('#pause').click();const frozen=await page.evaluate(()=>({view:window.__yatzyQA.world.getViewState(),position:window.__yatzyQA.world.camera.position.toArray()}));
  await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>({view:window.__yatzyQA.world.getViewState(),position:window.__yatzyQA.world.camera.position.toArray()})),frozen);
  await page.locator('#motion').click();assert.equal(await page.evaluate(()=>window.__yatzyQA.world.getViewState().blend),1,'calm mode snaps the requested closer result view');
  await page.locator('#pause-dialog [data-close]').click();await page.waitForTimeout(50);await page.evaluate(()=>window.__yatzyQA.freeze(true));await inspect(page,'mobile-calm');
  assert.deepEqual(errors,[]);
  for(const [device,prior]of [['desktop',75],['mobile',28]]){
    const sample=report.layouts.find(s=>s.label===`${device}-human-free`);
    assert.ok(sample.measurement.meanDieWidth>prior*1.2,`${device}: the actual dice must be at least 20% larger than the previous result view`);
    sample.measurement.previousApproximateWidth=prior;sample.measurement.improvementPercent=100*(sample.measurement.meanDieWidth/prior-1);
  }
  await writeFile(`${out}/readability-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,layouts:report.layouts.map(s=>({label:s.label,...s.measurement})),cameraFrames:report.camera.length,errors},null,2));
  }
}catch(error){report.failure=error.message;await writeFile(`${out}/${cupSafetyOnly?'cup-safety':'readability'}-report.json`,JSON.stringify(report,null,2));throw error;}
finally{await browser.close();}
