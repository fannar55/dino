import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {cachedAudioResponse, createServiceWorkerSource} from '../scripts/service-worker-source.mjs';

const url = 'https://mosi.example/leikir/assets/audio/score.mp3';
const bytes = Uint8Array.from({length: 37}, (_, i) => (i * 17 + 3) % 256);
const originalHeaders = {'content-type':'audio/mpeg','content-length':String(bytes.length),etag:'"score-v2"','cache-control':'public, max-age=3600'};
const complete = (headers={}) => new Response(bytes, {headers:{...originalHeaders,...headers}});
const request = (range, headers={}) => new Request(url, {headers:{...(range ? {range} : {}),...headers}});
const body = async response => new Uint8Array(await response.arrayBuffer());

test('cached audio returns the exact requested inclusive bytes and representation headers', async () => {
  const full=complete();
  for (const [range,start,end] of [['bytes=0-1',0,1],['bytes=8-14',8,14],['bytes=36-36',36,36],['bytes=30-90',30,36]]) {
    const response=await cachedAudioResponse(request(range),full);
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/37`);
    assert.equal(response.headers.get('content-length'),String(end-start+1));assert.equal(response.headers.get('accept-ranges'),'bytes');
    assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.equal(response.headers.get('etag'),'"score-v2"');
    assert.deepEqual(await body(response),bytes.slice(start,end+1));
  }
  assert.equal(full.bodyUsed,false,'Range reads must not consume the complete cache entry');
  assert.deepEqual(await body(full),bytes);
});

test('open-ended and suffix ranges include EOF, clamp large values and reconstruct the file', async () => {
  for (const [range,start,end] of [['bytes=25-',25,37],['bytes=-6',31,37],['bytes=-100',0,37],['bytes= 2-5 ',2,6],['bytes=1-'+ '9'.repeat(400),1,37],['bytes=-'+ '9'.repeat(400),0,37]]) {
    const response=await cachedAudioResponse(request(range),complete());
    assert.equal(response.status,206,range);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end-1}/37`);
    assert.deepEqual(await body(response),bytes.slice(start,end));
  }
  const parts=[];
  for(let start=0;start<37;start+=7)parts.push(...await body(await cachedAudioResponse(request(`bytes=${start}-${start+6}`),complete())));
  assert.deepEqual(Uint8Array.from(parts),bytes,'Consecutive range requests reconstruct every byte exactly once');
});

test('unsatisfiable starts and zero suffix return an empty 416 with the complete length', async () => {
  for(const range of ['bytes=37-','bytes=99-100','bytes=-0','bytes='+ '9'.repeat(400)+'-']) {
    const response=await cachedAudioResponse(request(range),complete());
    assert.equal(response.status,416,range);assert.equal(response.headers.get('content-range'),'bytes */37');
    assert.equal(response.headers.get('content-length'),'0');assert.equal((await body(response)).length,0);
  }
});

test('malformed, reversed, unsupported and multipart ranges safely retain the full response', async () => {
  for(const range of [undefined,'bytes=-','bytes=2-1','bytes=oops','bytes=0-1,5-6','items=0-2','bytes=1.5-3','bytes=+1-2']) {
    const full=complete(),response=await cachedAudioResponse(request(range),full);
    assert.equal(response,full,range);assert.equal(response.status,200);assert.deepEqual(await body(response),bytes);
  }
  const empty=new Response(null,{headers:{'content-type':'audio/mpeg'}});
  assert.equal(await cachedAudioResponse(request('bytes=-3'),empty),empty,'Empty representations may ignore Range');
});

test('If-Range requires the matching strong representation and does not reuse whole-body digests', async () => {
  const headers={'last-modified':'Mon, 12 Oct 2026 09:00:00 GMT',date:'Mon, 12 Oct 2026 09:02:00 GMT',digest:'sha-256=whole','content-md5':'whole'};
  for(const condition of ['"old"','W/"score-v2"','Mon, 12 Oct 2026 08:59:00 GMT']) {
    const full=complete(headers);assert.equal(await cachedAudioResponse(request('bytes=0-1',{'if-range':condition}),full),full);
  }
  for(const condition of ['"score-v2"',headers['last-modified']]) {
    const response=await cachedAudioResponse(request('bytes=0-1',{'if-range':condition}),complete(headers));
    assert.equal(response.status,206);assert.equal(response.headers.get('digest'),null);assert.equal(response.headers.get('content-md5'),null);
  }
  const weakDate=complete({...headers,date:headers['last-modified']});
  assert.equal(await cachedAudioResponse(request('bytes=0-1',{'if-range':headers['last-modified']}),weakDate),weakDate);
});

test('non-audio, non-GET, partial and HTTP-coded cached representations are not sliced', async () => {
  const html=new Response('<p>Mosi</p>',{headers:{'content-type':'text/html'}});
  assert.equal(await cachedAudioResponse(new Request('https://mosi.example/leikir/index.html',{headers:{range:'bytes=0-1'}}),html),html);
  const head=request('bytes=0-1');const full=complete();
  assert.equal(await cachedAudioResponse(new Request(head,{method:'HEAD'}),full),full);
  const partial=new Response(bytes.slice(0,2),{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-1/37'}});
  assert.equal(await cachedAudioResponse(request('bytes=0-1'),partial),partial);
  const coded=complete({'content-encoding':'gzip'});assert.equal(await cachedAudioResponse(request('bytes=0-1'),coded),coded);
  assert.equal((await cachedAudioResponse(request('bytes=0-1'),complete({'content-type':'application/octet-stream'}))).status,206,'Local MP3 suffix is sufficient when a host has a generic MIME type');
});

test('the exact generated worker serves offline audio ranges and preserves navigation/network behavior', async () => {
  const listeners=new Map(),stored=new Map([[url,complete()],['https://mosi.example/leikir/index.html',new Response('Mosi offline')]]);
  const network=[],added=[];let claimed=0;
  const cache={match:async key=>stored.get(typeof key==='string'?key:key.url||key.href)?.clone(),addAll:async files=>added.push(...files),put:()=>assert.fail('Never store a partial network response as the full audio asset')};
  const scope={URL,Request,Response,Headers,console,fetch:async req=>{network.push(req);return new Response('net-part',{status:206,headers:{'content-range':'bytes 5-12/99'}});},caches:{open:async()=>cache,keys:async()=>['stjornufar-old','unrelated'],delete:async key=>{assert.equal(key,'stjornufar-old');}},self:{location:{origin:'https://mosi.example'},registration:{scope:'https://mosi.example/leikir/'},clients:{claim:async()=>claimed++},addEventListener:(type,callback)=>listeners.set(type,callback)}};
  vm.runInNewContext(createServiceWorkerSource('test',['./index.html','./assets/audio/score.mp3']),scope);
  let work;listeners.get('install')({waitUntil:p=>work=p});await work;assert.deepEqual(added,['./index.html','./assets/audio/score.mp3']);
  listeners.get('activate')({waitUntil:p=>work=p});await work;assert.equal(claimed,1);
  const dispatch=req=>{let result;listeners.get('fetch')({request:req,respondWith:p=>result=p});return result;};
  const offline=await dispatch(request('bytes=0-1'));assert.equal(offline.status,206);assert.deepEqual(await body(offline),bytes.slice(0,2));assert.equal(network.length,0);
  const whole=await dispatch(request());assert.equal(whole.status,200);assert.deepEqual(await body(whole),bytes);
  const nav={url:'https://mosi.example/leikir/another',method:'GET',mode:'navigate',headers:new Headers()};
  assert.equal(await (await dispatch(nav)).text(),'Mosi offline');
  const missing=new Request('https://mosi.example/leikir/assets/audio/uncached.mp3',{headers:{range:'bytes=5-12'}});
  assert.equal((await dispatch(missing)).status,206);assert.equal(network[0],missing,'Cache miss preserves the original Range request for the server');
  assert.equal(dispatch(new Request('https://elsewhere.example/score.mp3')),undefined);
  assert.equal(dispatch(new Request(url,{method:'POST'})),undefined);
});
