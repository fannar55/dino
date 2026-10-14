import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import {createMiniSurface} from '../dist/mini-rides.js';

test('renderer failure remains visible and disposing a surface releases only registered resources once',()=>{
 const previous=new Map(['document','requestAnimationFrame','cancelAnimationFrame','devicePixelRatio','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const {document}=parseHTML('<html><head></head><body><div id="stage"></div></body></html>'),frames=new Map();let id=0,ownDisposals=0,sharedDisposals=0;
 const originalCreate=document.createElement.bind(document);document.createElement=name=>{const element=originalCreate(name);if(name==='canvas')element.getContext=()=>null;return element;};
 Object.assign(globalThis,{document,devicePixelRatio:1,ResizeObserver:undefined,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)});
 const oldError=console.error;console.error=()=>{};
 try{
  const host=document.getElementById('stage'),surface=createMiniSurface(host);surface.own({dispose(){ownDisposals++;}});const shared={dispose(){sharedDisposals++;}};
  assert.ok(shared);surface.setReady();assert.match(surface.status.textContent,/Þrívíddin náði ekki/);assert.equal(surface.getDebugInfo().ready,false);
  surface.setPaused(true);assert.equal(surface.getDebugInfo().paused,true);surface.dispose();surface.dispose();
  assert.equal(ownDisposals,1);assert.equal(sharedDisposals,0);assert.equal(frames.size,0);assert.equal(host.children.length,0);
 }finally{console.error=oldError;for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
