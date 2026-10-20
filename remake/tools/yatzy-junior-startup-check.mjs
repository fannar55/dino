import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Each case has a fresh, isolated cache/storage context. No saved user profile
// is opened and failure injection only intercepts this context's local requests.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const url=process.env.JUNIOR_URL||'http://127.0.0.1:4197/remake/yatzy-junior.html?qa';
const out='qa/yatzy-junior',baselineOnly=process.argv.includes('--baseline'),retryOnly=process.argv.includes('--retry-only');
const report={baselineOnly,retryOnly,cases:[],passed:false};let browser;
const watchdog=setTimeout(()=>{report.timedOut=true;void browser?.close();},240000);watchdog.unref();
async function runCase(name,{failure=null,stall=null}={}){
  const context=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],warnings=[],requests=[];let releaseStall,requestedAt=null;
  const entry={name,errors,warnings,requests};report.cases.push(entry);page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push({kind:'page',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')errors.push({kind:'console',message:message.text()});else if(message.type()==='warning')warnings.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push({kind:'http',status:response.status(),url:response.url()});});
  page.on('requestfailed',request=>requests.push({url:request.url(),failure:request.failure()?.errorText}));
  await page.addInitScript(()=>{
    localStorage.setItem('mosi.yatzy.junior.prefs.v1',JSON.stringify({muted:false,reduced:false}));
    window.__startupStages=[];let last='';
    const sample=()=>{const game=document.getElementById('game'),loading=document.getElementById('loading'),stage=loading?.dataset.stage||'',status=game?.dataset.startup||'',key=`${status}:${stage}`;if(key!==last){last=key;window.__startupStages.push({status,stage,time:performance.now()});}};
    addEventListener('DOMContentLoaded',()=>{sample();const observer=new MutationObserver(records=>{
      // A synchronous shader compile can enter/leave its stage in one task;
      // oldValue retains that intermediate stage without wrapping production APIs.
      for(const record of records)if(record.attributeName==='data-stage'&&record.oldValue&&!window.__startupStages.some(s=>s.stage===record.oldValue))window.__startupStages.push({stage:record.oldValue,time:performance.now(),fromMutation:true});
      sample();
    });observer.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-stage','data-startup']});},{once:true});
  });
  if(failure)await page.route('**/engine/yatzy-junior/game.js',async route=>{
    requestedAt=Date.now();
    if(failure==='missing')await route.fulfill({status:404,contentType:'text/javascript',body:'// Deliberately missing module in isolated startup regression.'});
    else await route.abort('failed');
  });
  if(stall){
    const gate=new Promise(resolve=>{releaseStall=resolve;});
    await page.route(stall,async route=>{requestedAt=Date.now();await gate;try{await route.continue();}catch{/* AbortController or page cleanup may already have cancelled it. */}});
  }
  const startedAt=Date.now();
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>{
      const error=document.getElementById('error');
      return Boolean(window.__juniorQA)||(error&&!error.hidden&&error.getClientRects().length>0);
    },undefined,{timeout:failure||stall?42000:90000});
    entry.elapsedMs=Date.now()-startedAt;
    entry.observed=await page.evaluate(()=>({startup:document.getElementById('game').dataset.startup,stage:document.getElementById('loading').dataset.stage,loadingHidden:document.getElementById('loading').hidden,errorVisible:!document.getElementById('error').hidden,errorText:document.getElementById('error').innerText,qa:Boolean(window.__juniorQA),stages:window.__startupStages,performance:performance.getEntriesByType('navigation').map(n=>({domContentLoaded:n.domContentLoadedEventEnd,load:n.loadEventEnd,responseEnd:n.responseEnd}))}));
    if(failure||stall){
      assert.ok(requestedAt!==null,'injected request was reached');entry.afterFaultMs=Date.now()-requestedAt;
      assert.equal(entry.observed.startup,'error','startup state records error');assert.equal(entry.observed.errorVisible,true);assert.equal(entry.observed.loadingHidden,true,'error replaces perpetual loading');assert.equal(entry.observed.qa,false,'failed startup exposes no ready game');
      assert.ok(entry.elapsedMs<=36000,'recovery appears within the overall 30-second deadline plus scheduler margin');
      if(stall)assert.ok(entry.elapsedMs>=24000,'test exercised the production deadline, without shortening it');
      const retry=page.locator('#error button');assert.ok(await retry.isVisible());assert.ok(await retry.isEnabled());
      assert.ok(await retry.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'retry remains reachable after startup fails');
      await page.screenshot({path:`${out}/startup-${name}.png`});
      if(stall){
        releaseStall();
        if(name==='late-module'){
          await page.waitForFunction(()=>document.querySelectorAll('.junior-card').length===5,undefined,{timeout:15000});entry.lateModuleExecuted=true;
        }
        await page.waitForTimeout(3000);
        entry.afterRelease=await page.evaluate(()=>{
          const retry=document.querySelector('#error button'),r=retry.getBoundingClientRect();retry.focus();
          return{startup:document.getElementById('game').dataset.startup,qa:Boolean(window.__juniorQA),welcome:document.getElementById('welcome').open,loadingHidden:document.getElementById('loading').hidden,errorVisible:!document.getElementById('error').hidden,retryFocused:document.activeElement===retry,retryReachable:!retry.disabled&&retry.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        });
        assert.deepEqual(entry.afterRelease,{startup:'error',qa:false,welcome:false,loadingHidden:true,errorVisible:true,retryFocused:true,retryReachable:true},'late resource completion cannot revive startup or disable Error Retry');
      }
      if(failure==='missing'){
        await page.unroute('**/engine/yatzy-junior/game.js');const errorsBefore=errors.length,retriedAt=Date.now();
        await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),retry.click()]);
        await page.waitForFunction(()=>window.__juniorQA&&document.getElementById('game').dataset.startup==='ready',undefined,{timeout:45000});
        entry.retry=await page.evaluate(()=>({startup:document.getElementById('game').dataset.startup,loadingHidden:document.getElementById('loading').hidden,errorHidden:document.getElementById('error').hidden,welcome:document.getElementById('welcome').open,model:window.__juniorQA.opponent.getDebugState().source}));
        entry.retry.elapsedMs=Date.now()-retriedAt;
        assert.equal(entry.retry.startup,'ready');assert.ok(entry.retry.loadingHidden&&entry.retry.errorHidden&&entry.retry.welcome);assert.match(entry.retry.model,/\/assets\/characters\/mosi\.glb$/);assert.deepEqual(errors.slice(errorsBefore),[],'real Retry reload succeeds without new startup errors');
      }
    }else{
      assert.equal(entry.observed.qa,true,'cold start reaches the real game');assert.equal(entry.observed.loadingHidden,true);assert.equal(entry.observed.errorVisible,false);assert.deepEqual(errors,[]);
      if(!baselineOnly){assert.equal(entry.observed.startup,'ready');assert.equal(entry.observed.stage,'ready');for(const stage of ['voice','forest','players','shaders','ready'])assert.ok(entry.observed.stages.some(s=>s.stage===stage),`startup reports ${stage}`);}
      entry.model=await page.evaluate(()=>{
        const qa=window.__juniorQA,actor=qa.opponent.actor,debug=qa.opponent.getDebugState();let skinnedMeshes=0;actor.model.traverse(node=>{if(node.isSkinnedMesh)skinnedMeshes++;});
        return{source:debug.source,triangles:debug.triangles,bones:debug.bones,head:Boolean(actor.model.getObjectByName('Head')),jaw:Boolean(actor.model.getObjectByName('Jaw')),skinnedMeshes,welcome:document.getElementById('welcome').open,canvas:[qa.world.renderer.domElement.width,qa.world.renderer.domElement.height]};
      });
      assert.match(entry.model.source,/\/assets\/characters\/mosi\.glb$/);assert.ok(entry.model.head&&entry.model.jaw&&entry.model.skinnedMeshes>0&&entry.model.triangles>100,'actual remake Mosi rig is loaded');assert.equal(entry.model.welcome,true);
    }
    const expectedError=error=>{
      if(error.kind==='http')return failure==='missing'&&error.status===404&&error.url.endsWith('/engine/yatzy-junior/game.js');
      if(error.kind!=='console')return false;
      if(failure==='missing'&&/^Failed to load resource: the server responded with a status of 404/.test(error.message))return true;
      if(failure==='blocked'&&/^Failed to load resource: net::ERR_FAILED/.test(error.message))return true;
      if(failure&&/^Junior Yatzy initialization failed TypeError: Failed to fetch dynamically imported module: .*\/engine\/yatzy-junior\/game\.js/.test(error.message))return true;
      return Boolean(stall)&&new RegExp(`^Junior Yatzy initialization failed Error: Yatzy startup timed out: ${name==='late-module'?'modules':'voice'}(?:\\n|$)`).test(error.message);
    };
    entry.expectedErrors=errors.filter(expectedError);entry.unexpectedErrors=errors.filter(error=>!expectedError(error));
    assert.deepEqual(entry.unexpectedErrors,[],'injected failures must not hide unrelated runtime errors');
    entry.passed=true;console.log(JSON.stringify({case:name,elapsedMs:entry.elapsedMs,afterFaultMs:entry.afterFaultMs,stage:entry.observed.stage,startup:entry.observed.startup,expectedErrors:entry.expectedErrors.length,model:entry.model}));
  }catch(error){entry.failure={message:error.message,stack:error.stack};entry.debug=await page.evaluate(()=>({stage:document.getElementById('loading')?.dataset.stage,startup:document.getElementById('game')?.dataset.startup,error:document.getElementById('error')?.innerText,stages:window.__startupStages})).catch(()=>null);await page.screenshot({path:`${out}/startup-${name}-failure.png`}).catch(()=>{});throw error;}
  finally{releaseStall?.();await context.close();}
}

try{
  await mkdir(out,{recursive:true});browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
  if(retryOnly)await runCase('missing-module',{failure:'missing'});
  else{
    await runCase('cold-ready');
    if(!baselineOnly){await runCase('missing-module',{failure:'missing'});await runCase('blocked-module',{failure:'blocked'});await runCase('stalled-voice',{stall:'**/assets/audio/yatzy-junior/manifest.json'});await runCase('late-module',{stall:'**/engine/yatzy-junior/game.js'});}
  }
  report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
finally{clearTimeout(watchdog);if(browser)await browser.close();await mkdir(out,{recursive:true});await writeFile(`${out}/startup-${baselineOnly?'baseline':retryOnly?'retry':'report'}.json`,JSON.stringify(report,null,2));}
