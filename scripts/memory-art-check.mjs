// Look check of a memory-game baby through the game's own actor controller (eyelids, gestures, walk):
//   node scripts/memory-art-check.mjs [--species triceratops|brontosaurus|stegosaurus]
// The baby GLB is loaded in its species' place, so a baby the game does not load yet (its
// MEMORY_CHARACTER_ART entry still names the adult) can be reviewed before the switch.
// Captures go to qa/memory/art/ (Triceratops) or qa/memory/art/<species>/, with report.json.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/fannare/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2),flag=argv.findIndex(a=>a==='--species'||a.startsWith('--species='));
const species=flag<0?'triceratops':argv[flag].includes('=')?argv[flag].slice(10):argv[flag+1];
const LABELS={
  triceratops:['Þríhyrnuungi','Þríhyrnuungi · sama Mosa-fjölskylda','Nýr ungi úr upprunalega áferðarlagða Mosa-líkaninu.'],
  brontosaurus:['Þórseðluungi','Þórseðluungi · sama fjölskylda','Nýr ungi úr upprunalega áferðarlagða Þórseðlu-líkaninu.'],
  stegosaurus:['Kambeðluungi','Kambeðluungi · sama fjölskylda','Nýr ungi úr upprunalega áferðarlagða Kambeðlu-líkaninu.'],
};
if(!LABELS[species])throw new Error(`Unknown --species ${species}; use ${Object.keys(LABELS).join('|')}`);
const model=`/remake/assets/memory/${species}-baby.glb`;
const outDir=species==='triceratops'?path.join(root,'qa/memory/art'):path.join(root,'qa/memory/art',species);
const [title,label,status]=LABELS[species];
const page=`<!doctype html>
<html lang="is"><head><meta charset="utf-8"><title>${title} — útlitsprófun</title><style>body{margin:0;background:#e9e2d0;font-family:system-ui}canvas{display:block}#label{position:absolute;left:24px;top:20px;color:#3f4d35;font-size:20px}#status{position:absolute;left:24px;bottom:20px;color:#3f4d35}</style><script type="importmap">{"imports":{"three":"/dist/vendor/three.module.js"}}</script></head>
<body><div id="label">${label}</div><div id="status"></div><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from '/dist/vendor/GLTFLoader.js';
import {createBabyActors} from '/remake/engine/memory/baby-actors.js';
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e2d0');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.01,100);camera.position.set(3.2,1.9,3.6);camera.lookAt(0,.55,0);
scene.add(new THREE.HemisphereLight('#fff3db','#809477',2.2));const sun=new THREE.DirectionalLight('#fff0d5',3);sun.position.set(-2,5,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.bias=-.0002;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#d6c6a5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
try {
const gltf=new GLTFLoader(),loader={loadAsync:()=>gltf.loadAsync(${JSON.stringify(model)})};
const [baby]=await createBabyActors({scene,length:1.8,instancesPerSpecies:1,species:[${JSON.stringify(species)}],loader});baby.root.rotation.y=-.15;
let freeze=true;const clock=new THREE.Clock();function render(){const dt=Math.min(.04,clock.getDelta());if(!freeze)baby.update(dt);renderer.render(scene,camera);requestAnimationFrame(render);}render();
window.__art={baby,camera,scene,renderer,freeze(v){freeze=v},view(which){camera.position.copy(which==='side'?new THREE.Vector3(0,1.3,4.5):which==='front'?new THREE.Vector3(4,1.5,.1):new THREE.Vector3(3.2,1.9,3.6));camera.lookAt(0,.55,0)},step(dt){baby.update(dt)},ready:true};
document.querySelector('#status').textContent=${JSON.stringify(status)};
}catch(error){document.querySelector('#status').textContent=String(error);window.__artError=String(error);throw error;}
</script></body></html>`;
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/__memory-art/review.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;}const p=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
await fs.mkdir(outDir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-unsafe-swiftshader'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.toUpperCase()!=='__COMPAT_LAYER'))});
const errors=[],shot=name=>path.join(outDir,`baby-${name}.png`),captures=[];
const capture=async(page,name)=>{await page.waitForTimeout(150);await page.screenshot({path:shot(name)});captures.push(path.relative(root,shot(name)).replaceAll('\\','/'));};
try{const page=await browser.newPage({viewport:{width:1000,height:750}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/__memory-art/review.html`);await page.waitForFunction(()=>window.__art?.ready||window.__artError,{timeout:90000});if(await page.evaluate(()=>window.__artError||null))throw Error(await page.evaluate(()=>window.__artError));
for(const view of ['three-quarter','front','side']){await page.evaluate(v=>window.__art.view(v),view);await capture(page,view);}
await page.evaluate(()=>{window.__art.view('three-quarter');window.__art.baby.walk();for(let i=0;i<18;i++)window.__art.step(1/30);});await capture(page,'walk');
await page.evaluate(()=>{window.__art.baby.setMotion('idle');window.__art.baby.blink();window.__art.step(.085);});await capture(page,'blink');
if(species==='brontosaurus'){
  // Her work in the game: the head reaches down to the branch, then lifts it high.
  await page.evaluate(()=>{window.__art.view('side');window.__art.baby.reach();for(let i=0;i<30;i++)window.__art.step(1/30);});await capture(page,'reach');
  await page.evaluate(()=>{window.__art.baby.lift();for(let i=0;i<40;i++)window.__art.step(1/30);});await capture(page,'lift');
  await page.evaluate(()=>{window.__art.baby.release();for(let i=0;i<30;i++)window.__art.step(1/30);});
}
const report=await page.evaluate(()=>({actor:window.__art.baby.getDebugState(),triangles:window.__art.renderer.info.render.triangles,calls:window.__art.renderer.info.render.calls}));report.model=model;report.captures=captures;report.errors=errors;await fs.writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();server.close();}
