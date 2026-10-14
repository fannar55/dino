import test from 'node:test';
import assert from 'node:assert/strict';
import {createCelebration} from '../dist/celebration-vfx.js';

function harness({reduced=false,width=390,height=844,dpr=3}={}){
 const keys=['window','document','innerWidth','innerHeight','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','matchMedia'];
 const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const install=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const frames=[],raf=new Map(),windowListeners=new Map(),documentListeners=new Map();
 let now=100,next=1,frame,stack=[],pose={x:0,y:0,rotation:0,alpha:1},path=[];
 const finite=(...numbers)=>numbers.forEach(number=>assert.ok(Number.isFinite(number),'Canvas coordinates remain finite'));
 const ctx={
  setTransform(...args){finite(...args);},
  clearRect(x,y,w,h){frame={stars:[],fills:0,ellipses:0,glows:[],clear:[x,y,w,h]};frames.push(frame);},
  save(){stack.push({...pose});},restore(){pose=stack.pop();},
  translate(x,y){finite(x,y);pose.x+=x;pose.y+=y;},rotate(angle){finite(angle);pose.rotation+=angle;},
  beginPath(){path=[];},moveTo(x,y){finite(x,y);path.push([x,y]);},lineTo(x,y){finite(x,y);path.push([x,y]);},closePath(){},
  ellipse(...args){finite(...args);frame.ellipses++;},fill(){frame.fills++;},
  stroke(){frame.stars.push({...pose,radius:Math.hypot(...path[0])});},
  createRadialGradient(...args){finite(...args);return{addColorStop(){}};},
  fillRect(x,y,w,h){frame.glows.push([x,y,w,h]);},
  set globalAlpha(value){finite(value);assert.ok(value>=0&&value<=1);pose.alpha=value;},get globalAlpha(){return pose.alpha;},
 };
 const canvas={clientWidth:width,clientHeight:height,getContext:()=>ctx};
 install('window',{addEventListener:(type,fn)=>windowListeners.set(type,fn),removeEventListener:type=>windowListeners.delete(type)});
 install('document',{hidden:false,addEventListener:(type,fn)=>documentListeners.set(type,fn),removeEventListener:type=>documentListeners.delete(type)});
 install('innerWidth',width);install('innerHeight',height);install('devicePixelRatio',dpr);install('matchMedia',()=>({matches:reduced}));
 install('requestAnimationFrame',fn=>{const id=next++;raf.set(id,fn);return id;});install('cancelAnimationFrame',id=>raf.delete(id));
 function tick(ms=16){now+=ms;for(const [id,fn] of [...raf]){raf.delete(id);fn(now);}}
 function advance(ms){for(let remaining=ms;remaining>0;remaining-=16)tick(Math.min(16,remaining));}
 return {canvas,frames,raf,windowListeners,documentListeners,tick,advance,
  hide(value){document.hidden=value;documentListeners.get('visibilitychange')?.();},
  resize(w,h){canvas.clientWidth=w;canvas.clientHeight=h;windowListeners.get('resize')?.();},
  restore(){for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}},
 };
}

test('full-screen reward reaches its HUD target, respects density limits, then stops drawing',()=>{
 const h=harness();let destination={x:.2,y:.06};const effect=createCelebration(h.canvas,{target:()=>destination});
 try{
  effect.burst({x:.6,y:.35});assert.equal(h.raf.size,1);assert.equal(h.canvas.width,780);assert.equal(h.canvas.height,1688,'Pixel ratio is capped at two');
  h.advance(300);assert.deepEqual(h.frames.at(-1).glows,[[0,0,390,844]],'The glow covers the whole viewport');
  const early=h.frames.at(-1).stars[0];assert.ok(early.radius>40);
  destination={x:.25,y:.075};h.advance(2250);
  const settled=h.frames.at(-1).stars[0];assert.ok(Math.abs(settled.x-destination.x*390)<.01);assert.ok(Math.abs(settled.y-destination.y*844)<.01);
  assert.ok(settled.radius<=12.01,'Star shrinks into the score target');
  h.advance(1000);assert.equal(h.raf.size,0);const frames=h.frames.length;h.advance(10000);assert.equal(h.frames.length,frames,'Finished celebrations consume no animation frames');
 }finally{effect.dispose();h.restore();}
});

test('pause and hidden-tab time freeze the reward without a large resume jump',()=>{
 const h=harness(),effect=createCelebration(h.canvas);
 try{
  effect.burst();h.advance(1200);const before=h.frames.at(-1).stars[0];effect.setPaused(true);assert.equal(h.raf.size,0);
  const count=h.frames.length;h.advance(60000);assert.equal(h.frames.length,count);
  effect.setPaused(false);h.tick();assert.deepEqual(h.frames.at(-1).stars[0],before,'First resumed frame has no elapsed pause time');
  h.advance(100);const priorHidden=h.frames.at(-1).stars[0];h.hide(true);h.advance(60000);assert.equal(h.raf.size,0);
  h.hide(false);h.tick();assert.deepEqual(h.frames.at(-1).stars[0],priorHidden);
  effect.setPaused(true);h.hide(true);h.hide(false);assert.equal(h.raf.size,0,'Opening the app does not override an active book pause');
  effect.setPaused(false);h.advance(3000);assert.equal(h.raf.size,0);
 }finally{effect.dispose();h.restore();}
});

test('reduced motion is a stationary, non-pulsing star fade without confetti or travel',()=>{
 const h=harness({reduced:true}),effect=createCelebration(h.canvas,{target:()=>({x:.02,y:.02})});
 try{
  effect.burst({x:.72,y:.4,finale:true});h.advance(250);const first=h.frames.at(-1).stars[0];h.advance(600);const second=h.frames.at(-1).stars[0];
  assert.deepEqual([second.x,second.y,second.radius,second.rotation],[first.x,first.y,first.radius,0]);
  assert.ok(h.frames.every(frame=>frame.glows.length===0&&frame.ellipses===0&&frame.stars.length===1),'No full-screen confetti or flashing glow in reduced mode');
  h.advance(600);assert.equal(h.raf.size,0,'Reduced animation finishes after its short fade');
 }finally{effect.dispose();h.restore();}
});

test('rapid rewards keep at most three bursts and one RAF; clear and dispose stop pending work',()=>{
 const h=harness({width:1024,height:768}),effect=createCelebration(h.canvas);
 try{
  for(let i=0;i<200;i++)effect.burst({finale:true});assert.equal(h.raf.size,1);
  h.advance(350);const current=h.frames.at(-1);assert.equal(current.stars.length,3);assert.equal(current.glows.length,3);
  assert.ok(current.fills<=3*(135+3),'Particle work is bounded even after a tap storm');
  h.resize(844,390);assert.equal(h.canvas.width,1688);assert.equal(h.canvas.height,780);
  effect.clear();assert.equal(h.raf.size,0);assert.equal(h.frames.at(-1).stars.length,0);
  effect.setPaused(false);h.advance(1000);assert.equal(h.raf.size,0,'Cleared rewards do not revive on resume');
  effect.burst();assert.equal(h.raf.size,1);effect.dispose();assert.equal(h.raf.size,0);assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
 }finally{effect.dispose();h.restore();}
});

test('a missing canvas context leaves safe no-op controls',()=>{
 for(const canvas of [null,{}, {getContext:()=>null}]){
  const effect=createCelebration(canvas);effect.burst();effect.setPaused(true);effect.clear();effect.dispose();
 }
});
