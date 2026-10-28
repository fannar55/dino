import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/fannare/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),p=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-unsafe-swiftshader'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.toUpperCase()!=='__COMPAT_LAYER'))});
const errors=[];
try{const page=await browser.newPage({viewport:{width:1000,height:750}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/qa/memory/art/review.html`);await page.waitForFunction(()=>window.__art?.ready||window.__artError,{timeout:90000});if(await page.evaluate(()=>window.__artError||null))throw Error(await page.evaluate(()=>window.__artError));
for(const view of ['three-quarter','front','side']){await page.evaluate(v=>window.__art.view(v),view);await page.waitForTimeout(150);await page.screenshot({path:path.join(root,`qa/memory/art/baby-${view}.png`)});}
await page.evaluate(()=>{window.__art.view('three-quarter');window.__art.baby.walk();for(let i=0;i<18;i++)window.__art.step(1/30);});await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'qa/memory/art/baby-walk.png')});
await page.evaluate(()=>{window.__art.baby.setMotion('idle');window.__art.baby.blink();window.__art.step(.085);});await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'qa/memory/art/baby-blink.png')});
const report=await page.evaluate(()=>({actor:window.__art.baby.getDebugState(),triangles:window.__art.renderer.info.render.triangles,calls:window.__art.renderer.info.render.calls}));report.errors=errors;await fs.writeFile(path.join(root,'qa/memory/art/report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();server.close();}
