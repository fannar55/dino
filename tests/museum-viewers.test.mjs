import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import * as THREE from '../dist/vendor/three.module.js';
import {createMuseumOrbit,validateSpecimenBytes,statueFraming} from '../dist/statue-viewer.js';
import {createImageTransform,createMuseumImageViewer} from '../dist/museum-image-viewer.js';
import {timelineData,sizeComparison,tubeNote,createMuseumExhibit} from '../dist/museum-exhibits.js';

function dom(){const{document,window}=parseHTML('<html><body><main></main></body></html>');const original=globalThis.document;globalThis.document=document;Object.defineProperty(document,'hidden',{value:false,writable:true});return{document,host:document.querySelector('main'),event(node,type,properties={}){const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,properties);node.dispatchEvent(e);return e;},restore(){globalThis.document=original;}};}
const animals=[{id:'a',name:'Dýr A',time:{start:150,end:140,label:'150–140',source:'safn'},size:{unit:'m',kind:'length',value:20,label:'um20m',source:'safn'},question:{prompt:'Hversu margir?',options:['Tveir','Þrír'],answer:1,explanation:'Þrjú horn sjást.'}},{id:'b',name:'Dýr B',time:{start:85,end:85,label:'um85',source:'safn'},size:{unit:'m',kind:'wingspan',value:6,label:'um6m',source:'safn'}},{id:'c',name:'Dýr C',time:{start:145,end:135,label:'145–135',source:'safn'},size:null}];

test('two-finger model zoom never turns the animal and releasing a finger starts a continuous drag',()=>{
 const o=createMuseumOrbit();o.down(1,0,0);o.down(2,100,0);o.move(2,200,0);assert.equal(o.state.zoom,4);assert.equal(o.state.yaw,-.4);o.up(2);o.move(1,10,0);assert.ok(Math.abs(o.state.yaw-(-.28))<1e-10);o.zoomBy(-100);assert.equal(o.state.zoom,3.5);o.zoomBy(100);assert.equal(o.state.zoom,14);o.focus({yaw:Math.PI*2-.3});assert.ok(Math.abs(o.state.yaw-(-.3))<1e-10);o.reset();assert.deepEqual(o.state,{yaw:-.4,zoom:8,elevation:.38});
});
test('photo zoom preserves its chosen point and pan is bounded to the actual fitted image',()=>{
 const t=createImageTransform();t.resize(400,300,800,600);const point={x:60,y:30};t.zoom(2,point);assert.equal(t.state.x,-60);assert.equal(t.state.y,-30);assert.equal(t.state.x+point.x*t.state.scale,point.x);t.pan(10000,-10000);assert.equal(t.state.x,200);assert.equal(t.state.y,-150);t.resize(300,500,1600,600);assert.equal(Math.abs(t.state.y),0,'A letterboxed image cannot pan into empty vertical space');t.zoom(999);assert.equal(t.state.scale,5);t.reset();assert.equal(t.state.scale,1);assert.equal(t.state.x,0);assert.equal(t.state.y,0);
});
test('image controls, pinch, error, pause and disposal stay inside the museum',()=>{
 const d=dom();let closed=0;const viewer=createMuseumImageViewer(d.host,{images:[{src:'./assets/collection/trex.webp',alt:'Beinagrind',credit:'Höfundur',source:'https://example.org/source'},{src:'./assets/collection/stegosaurus.webp',alt:'Kambeðla'}],onClose:()=>closed++});
 try{const image=d.host.querySelector('img'),viewport=d.host.querySelector('.museum-image-viewport');Object.defineProperties(image,{naturalWidth:{value:1600},naturalHeight:{value:900}});viewport.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});d.event(image,'load');const buttons=()=>[...d.host.querySelectorAll('button')];d.event(buttons().find(b=>b.textContent==='+'),'click');assert.ok(viewer.getDebugInfo().scale>1);assert.equal(d.host.querySelectorAll('a').length,0,'Credits do not navigate the child outside the game');
 d.event(viewport,'pointerdown',{pointerId:1,clientX:100,clientY:100});d.event(viewport,'pointerdown',{pointerId:2,clientX:200,clientY:100});d.event(viewport,'pointermove',{pointerId:2,clientX:300,clientY:100});assert.ok(viewer.getDebugInfo().scale>2);d.event(viewport,'pointerup',{pointerId:2});d.event(viewport,'pointermove',{pointerId:1,clientX:20,clientY:280});assert.equal(closed,0,'Dragging never dismisses the image');
 viewer.setPaused(true);const before=viewer.getDebugInfo().scale;d.event(buttons().find(b=>b.textContent==='+'),'click');assert.equal(viewer.getDebugInfo().scale,before);viewer.setPaused(false);d.event(buttons().find(b=>b.textContent==='Næsta →'),'click');assert.equal(viewer.getDebugInfo().index,1);assert.equal(viewer.getDebugInfo().scale,1);d.event(image,'error');assert.match(d.host.textContent,/náði ekki/);viewer.setImages([]);assert.match(d.host.textContent,/Engin mynd/);viewer.dispose();assert.equal(d.host.children.length,0);d.event(image,'load');assert.equal(d.host.children.length,0);
 }finally{viewer.dispose();d.restore();}
});
test('specimen parser rejects external dependencies before a GLTF loader can request them',async()=>{
 const bytes=await readFile(new URL('../dist/assets/dinosaurs/triceratops.glb',import.meta.url));const valid=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);assert.ok(validateSpecimenBytes(valid).meshes.length);
 const source=JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'https://example.org/mesh.bin',byteLength:4}]}),json=source.padEnd(Math.ceil(source.length/4)*4,' '),bad=new ArrayBuffer(20+json.length),view=new DataView(bad);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bad.byteLength,true);view.setUint32(12,json.length,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(bad,20).set(new TextEncoder().encode(json));assert.throws(()=>validateSpecimenBytes(bad),/embedded/);assert.throws(()=>validateSpecimenBytes(new ArrayBuffer(20)),/Invalid/);
});
test('timeline preserves supplied point dates and excludes unsourced or absent ranges',()=>{
 const d=timelineData([...animals,{id:'bad',time:{start:300,end:200}},{id:'small',time:null}]);assert.equal(d.animals.length,3);assert.deepEqual(d.at(85).map(e=>e.id),['b']);assert.equal(d.at(84.5).length,0,'A point estimate does not invent a wider taxon interval');assert.deepEqual(d.at(142).map(e=>e.id),['a','c']);assert.equal(d.maximum,150);
});
test('size comparisons use sourced metres and distinguish wingspan from length',()=>{
 const c=sizeComparison([...animals,{id:'bad',size:{value:500,unit:'m',kind:'length'}}],'a','b');assert.equal(c.maximum,20);assert.equal(c.valid.length,2);assert.equal(c.ratio,20/6);assert.equal(c.sameMeasure,false);assert.equal(sizeComparison(animals,'a','a').ratio,1);assert.equal(tubeNote(1),5);assert.equal(tubeNote(6),0);assert.equal(tubeNote(999),0);
});
test('interactive laboratory allows retries but pause, repeat taps and disposal cannot duplicate progress sounds',()=>{
 const d=dom();let stars=0,close=0;const exhibit=createMuseumExhibit(d.host,{kind:'lab',entries:animals,audio:{effect(){},star(){stars++;},stopCelebration(){}},onClose(){close++;}});
 try{const find=text=>[...d.host.querySelectorAll('button')].find(b=>b.textContent===text);d.event(find('Tveir'),'click');assert.equal(stars,0);assert.match(d.host.textContent,/prófa annað/);exhibit.setPaused(true);d.event(find('Þrír'),'click');assert.equal(stars,0);exhibit.setPaused(false);d.event(find('Þrír'),'click');d.event(find('Þrír'),'click');assert.equal(stars,1);assert.match(d.host.textContent,/Þrjú horn/);const old=find('Þrír');d.event(find('Næsta vísbending →'),'click');assert.equal(stars,1);d.event(find('← Til baka í bókina'),'click');assert.equal(close,1);exhibit.dispose();d.event(old,'click');assert.equal(stars,1);assert.equal(d.host.children.length,0);
 }finally{exhibit.dispose();d.restore();}
});
test('timeline and size exhibits create usable controls from the same content without requiring a renderer',()=>{
 for(const kind of['timeline','scale']){const d=dom(),exhibit=createMuseumExhibit(d.host,{kind,entries:animals});try{assert.ok(d.host.querySelector('button'));if(kind==='timeline'){const input=d.host.querySelector('input');input.value='85';d.event(input,'input');assert.match(d.host.querySelector('.museum-time-present').textContent,/Dýr B/);}else assert.match(d.host.querySelector('.museum-readout').textContent,/vænghaf/);}finally{exhibit.dispose();d.restore();}}
});

test('a late museum scan is disposed instead of resurrecting a closed renderer; scans never dispose game templates',async()=>{
 const d=dom(),bytes=await readFile(new URL('../dist/assets/dinosaurs/triceratops.glb',import.meta.url));
 const source=(await readFile(new URL('../dist/statue-viewer.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','').replaceAll('import.meta.url',JSON.stringify(new URL('../dist/statue-viewer.js',import.meta.url).href));
 let parseResolve,parseStarted=false,aborted=false,surfaceDisposals=0;const geometry=new THREE.BoxGeometry(2,3,4),material=new THREE.MeshStandardMaterial(),texture=new THREE.Texture();material.map=texture;const scene=new THREE.Group();scene.add(new THREE.Mesh(geometry,material));const counts={geometry:0,material:0,texture:0};for(const[key,value]of Object.entries({geometry,material,texture}))value.addEventListener('dispose',()=>counts[key]++);
 class Loader{parseAsync(){parseStarted=true;return new Promise(resolve=>parseResolve=resolve);}}
 const makeSurface=host=>{const root=d.document.createElement('div'),canvas=d.document.createElement('canvas'),status=d.document.createElement('p');root.append(canvas,status);host.append(root);let disposed=false;return{root,canvas,status,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),get disposed(){return disposed;},get blocked(){return disposed;},listen(node,type,fn){node.addEventListener(type,fn);},setReady(){},setPaused(){},dispose(){if(!disposed){disposed=true;surfaceDisposals++;root.remove();}},getDebugInfo(){return{disposed};}};};
 const fakeFetch=async(_url,{signal})=>{signal.addEventListener('abort',()=>aborted=true);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
 try{const make=new Function('THREE','GLTFLoader','createMiniSurface','fetch','AbortController','document',source+';return createSpecimenViewer;')(THREE,Loader,makeSurface,fakeFetch,AbortController,d.document);const viewer=make(d.host,{src:'./assets/scan.glb'});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(parseStarted,true);viewer.dispose();assert.equal(aborted,true);parseResolve({scene});assert.deepEqual(await viewer.ready,{cancelled:true});assert.deepEqual(counts,{geometry:1,material:1,texture:1});assert.equal(surfaceDisposals,1);assert.equal(d.host.children.length,0);viewer.dispose();assert.equal(surfaceDisposals,1);assert.deepEqual(counts,{geometry:1,material:1,texture:1});}finally{d.restore();}
});
