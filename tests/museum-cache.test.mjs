import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createServiceWorkerSource} from '../scripts/service-worker-source.mjs';

test('museum downloads are lazy, only complete files are cached, and cache quota failure does not break viewing',async()=>{
 const scopeURL='https://example.test/game/',asset=scopeURL+'assets/encyclopedia/scan.glb';
 const listeners=new Map(),stored=new Map(),added=[];let requests=0,failWrite=false,partial=false;
 const cache={addAll:async files=>added.push(...files),match:async request=>stored.get(request.url)?.clone(),put:async(request,response)=>{if(failWrite)throw Error('quota');stored.set(request.url,response);}};
 vm.runInNewContext(createServiceWorkerSource('museum',['./index.html','./encyclopedia.js','./assets/encyclopedia/scan.glb','./assets/audio/encyclopedia_frog_intro.mp3']),{
  URL,Response,Request,Headers,Set,caches:{open:async()=>cache},fetch:async()=>{requests++;return new Response('museum-bytes',{status:partial?206:200,headers:partial?{'content-range':'bytes 0-11/90'}:{}});},
  self:{location:{origin:'https://example.test'},registration:{scope:scopeURL},addEventListener:(key,value)=>listeners.set(key,value)}
 });
 let work;listeners.get('install')({waitUntil:p=>work=p});await work;assert.deepEqual(added,['./index.html','./encyclopedia.js']);
 async function get(){let response;listeners.get('fetch')({request:new Request(asset),respondWith:p=>response=p});return response;}
 assert.equal(await(await get()).text(),'museum-bytes');assert.equal(requests,1);assert.equal(stored.size,1);
 assert.equal(await(await get()).text(),'museum-bytes');assert.equal(requests,1,'Reopening specimen works from cache');
 stored.clear();partial=true;assert.equal((await get()).status,206);assert.equal(stored.size,0,'Partial responses cannot poison full asset cache');
 partial=false;failWrite=true;assert.equal(await(await get()).text(),'museum-bytes');assert.equal(stored.size,0);
});
