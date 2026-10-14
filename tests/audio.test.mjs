import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio,MUSIC_MIX} from '../dist/audio.js';

// A deterministic WebAudio contract harness. This tests lifecycle and scheduling,
// not subjective sound quality or browser/device-specific playback.
function harness({clips={welcome:'welcome.mp3',invite:'invite.mp3'},voices=[{lang:'en-US'}],webAudio=true,missingFiles=[],mediaSupport=true,playMode='resolve'}={}){
  const keys=['document','AudioContext','webkitAudioContext','Audio','speechSynthesis','SpeechSynthesisUtterance','fetch','setTimeout','clearTimeout','performance'];
  const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners=new Map(),timers=new Map(),nodes=[],contexts=[],utterances=[],held=new Map(),requests=[],media=[],playRequests=[];
  const originalRandom=Math.random;Math.random=()=>.5;
  let now=0,nextTimer=1;
  const install=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const param=()=>({value:0,events:[],automation:[],setValueAtTime(v,t){assert.ok(Number.isFinite(v));this.value=v;this.events.push(v);this.automation.push({v,t,type:'hold'});},linearRampToValueAtTime(v,t){assert.ok(Number.isFinite(v));this.value=v;this.automation.push({v,t});},exponentialRampToValueAtTime(v,t){assert.ok(Number.isFinite(v)&&v>0);this.value=v;this.automation.push({v,t});},setTargetAtTime(v,t,tau){assert.ok(Number.isFinite(v));this.value=v;this.automation.push({v,t,tau,type:'target'});},cancelScheduledValues(){}});
  class Node{
    constructor(kind){this.kind=kind;for(const key of ['gain','pan','frequency','Q','threshold','knee','ratio','attack','release'])this[key]=param();nodes.push(this);}
    connect(to){(this.connections??=[]).push(to);return to;}disconnect(){this.disconnected=true;}start(at=0){this.started=true;this.startAt=at;}
    stop(when){this.stopAt=when??contexts[0]?.currentTime??0;}
    end(){if(this.ended)return;this.ended=true;this.onended?.();}
  }
  class Context{
    constructor(){this.currentTime=0;this.sampleRate=22050;this.destination={};this.state='suspended';contexts.push(this);}
    createGain(){return new Node('gain');}createDynamicsCompressor(){return new Node('compressor');}
    createBufferSource(){return new Node('buffer');}createOscillator(){return new Node('oscillator');}
    createMediaElementSource(element){const source=new Node('media');source.mediaElement=element;return source;}
    createBiquadFilter(){return new Node('filter');}createStereoPanner(){return new Node('pan');}
    createBuffer(ch,length){return {getChannelData:()=>new Float32Array(length)};}
    async decodeAudioData(bytes){return bytes;}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
  }
  class Media{
    constructor(){this.paused=true;this.currentTime=0;this.playCalls=0;media.push(this);}
    set src(value){this._src=value;requests.push(value);if(missingFiles.includes(new URL(value).pathname.split('/').at(-1)))Promise.resolve().then(()=>this.onerror?.());}
    get src(){return this._src;}
    play(){this.playCalls++;if(playMode==='reject'){this.paused=true;return Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));}
      if(playMode==='hold')return new Promise((resolve,reject)=>playRequests.push({resolve:()=>{this.paused=false;resolve();},reject}));
      this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}removeAttribute(name){if(name==='src')this._src='';}load(){this.unloaded=true;}
  }
  install('document',{hidden:false,addEventListener:(key,value)=>listeners.set(key,value),removeEventListener:key=>listeners.delete(key)});
  install('AudioContext',webAudio?Context:undefined);install('webkitAudioContext',undefined);
  install('Audio',mediaSupport?Media:undefined);
  const speech={paused:false,getVoices:()=>voices,speak:u=>utterances.push(u),cancel(){this.paused=false;},pause(){this.paused=true;},resume(){this.paused=false;}};
  install('speechSynthesis',speech);install('SpeechSynthesisUtterance',class{constructor(text){this.text=text;}});
  install('fetch',async url=>{requests.push(String(url));return {ok:!missingFiles.includes(new URL(url).pathname.split('/').at(-1)),json:async()=>({clips}),arrayBuffer:async()=>{
    const file=new URL(url).pathname.split('/').at(-1);
    if(held.has(file))return held.get(file).promise;
    return {file};
  }}});
  install('setTimeout',(callback,ms)=>{const id=nextTimer++;timers.set(id,{callback,ms,due:now+ms});return id;});
  install('clearTimeout',id=>timers.delete(id));install('performance',{now:()=>now});
  const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  function advance(ms){
    now+=ms;for(const context of contexts)if(context.state==='running')context.currentTime+=ms/1000;
    if(contexts[0]?.state==='running')for(const element of media)if(!element.paused)element.currentTime+=ms/1000;
    for(const [id,timer] of [...timers])if(timer.due<=now){timers.delete(id);timer.callback();}
    for(const node of nodes)if(node.stopAt!==undefined&&node.stopAt<=(contexts[0]?.currentTime??0))node.end();
  }
  function hold(file){let release;const promise=new Promise(resolve=>release=()=>resolve({file}));held.set(file,{promise});return release;}
  const hide=value=>{document.hidden=value;listeners.get('visibilitychange')?.();};
  const restore=()=>{Math.random=originalRandom;for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
  return {nodes,contexts,timers,listeners,utterances,speech,requests,media,playRequests,advance,flush,hold,hide,restore};
}

test('audio requires a touch and respects gait, modal, mute and background pauses',async()=>{
  const h=harness(),audio=createAudio();
  try{
    audio.setScene('lake');audio.setWalking(true);await audio.effect('splash');
    assert.equal(h.contexts.length,0,'Never construct or play audio before touch');
    await audio.unlock();await h.flush();assert.equal(h.contexts[0].state,'running');
    assert.ok([...h.timers.values()].some(timer=>timer.ms===1300),'Footsteps follow the authored paired-footfall cadence');
    for(const name of ['tap','discover','success','step','splash','wing','dino'])await audio.effect(name);
    audio.setPaused(true);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.timers.size,0);
    const count=h.nodes.length;await audio.effect('dino');assert.equal(h.nodes.length,count);
    audio.setPaused(false);assert.equal(h.contexts[0].state,'running');assert.ok(h.timers.size>=2);
    h.hide(true);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.timers.size,0);
    audio.setScene('sky');h.hide(false);assert.equal(h.contexts[0].state,'running');
    audio.setMuted(true);assert.equal(h.timers.size,0);audio.setMuted(false);
    audio.setWalking(false);assert.ok(![...h.timers.values()].some(timer=>timer.ms===1300));
    for(let i=0;i<100;i++)void audio.effect('dino');await h.flush();
    assert.ok(h.nodes.filter(node=>node.started&&!node.disconnected&&node.kind==='oscillator').length<50,'Tap storms remain bounded');
    audio.dispose();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.equal(h.contexts[0].state,'closed');
  }finally{audio.dispose();h.restore();}
});

test('narration promises finish, cancel pending fetches, and survive a long pause',async()=>{
  const h=harness(),release=h.hold('welcome.mp3'),audio=createAudio();
  try{
    await audio.unlock();const stale=audio.narrate('welcome','Halló!');await h.flush();
    const current=audio.narrate('invite','Komdu!');assert.equal(await stale,false,'Cancellation resolves even while fetch remains pending');
    await h.flush();release();await h.flush();
    assert.ok(!h.nodes.some(node=>node.buffer?.file==='welcome.mp3'&&node.started));
    const source=h.nodes.find(node=>node.buffer?.file==='invite.mp3');assert.ok(source);
    audio.setPaused(true);h.advance(90000);assert.equal(h.timers.size,0,'Guard countdown pauses with the scene');
    audio.setPaused(false);source.end();assert.equal(await current,true);
    const muted=audio.narrate('invite','Komdu!');await h.flush();audio.setMuted(true);assert.equal(await muted,false);
  }finally{audio.dispose();h.restore();}
});

test('slow sample loading cannot release a burst of delayed taps',async()=>{
  const h=harness(),release=h.hold('sfx-tap.mp3'),audio=createAudio();
  try{
    await audio.unlock();await h.flush();
    const requests=[];for(let i=0;i<12;i++){requests.push(audio.effect('tap'));h.advance(50);}
    release();await Promise.all(requests);await h.flush();
    assert.equal(h.nodes.filter(node=>node.buffer?.file==='sfx-tap.mp3'&&node.started).length,0,'Discard the stale queued tap');
    h.advance(50);await audio.effect('tap');
    assert.equal(h.nodes.filter(node=>node.buffer?.file==='sfx-tap.mp3'&&node.started).length,1,'Fresh cached taps still play');
  }finally{audio.dispose();h.restore();}
});

test('speech fallback uses Icelandic only and cancellation never blocks progress',async()=>{
  const h=harness({clips:{},webAudio:false,voices:[{lang:'en-US'}]}),audio=createAudio();
  try{
    await audio.unlock();assert.equal(await audio.narrate('welcome','Halló!'),false);assert.equal(h.utterances.length,0);
  }finally{audio.dispose();h.restore();}
  const is=harness({clips:{},webAudio:false,voices:[{lang:'is-IS'}]}),spoken=createAudio();
  try{
    await spoken.unlock();const done=spoken.narrate('welcome','Halló!');await is.flush();assert.equal(is.utterances.length,1);
    spoken.setPaused(true);assert.equal(is.speech.paused,true);spoken.setPaused(false);assert.equal(is.speech.paused,false);
    spoken.setMuted(true);assert.equal(await done,false);assert.equal(is.timers.size,0);
  }finally{spoken.dispose();is.restore();}
});

test('positional animal sounds remain bounded and stop during pause, mute and backgrounding',async()=>{
 const h=harness(),audio=createAudio();
 try{
  audio.arrival({type:'foreshadow',species:'trex'});assert.equal(h.contexts.length,0);
  await audio.unlock();await h.flush();
  for(const species of ['stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon']){
   for(const type of ['foreshadow','step','wing','settled']){audio.arrival({type,species,progress:0.8,pan:species==='pteranodon'?1:-1});h.advance(600);}
  }
  assert.ok(h.nodes.filter(node=>node.kind==='pan').every(node=>Math.abs(node.pan.value)<=0.75),'Avoid hard headphone panning');
  for(const mode of ['pause','mute','hide']){
   if(mode==='pause')audio.setPaused(true);if(mode==='mute')audio.setMuted(true);if(mode==='hide')h.hide(true);
   const count=h.nodes.length;audio.arrival({type:'settled',species:'trex'});assert.equal(h.nodes.length,count);
   audio.setPaused(false);audio.setMuted(false);h.hide(false);
  }
  for(let i=0;i<100;i++)audio.arrival({type:'step',species:'brachiosaurus',pan:NaN,progress:Infinity});
  assert.ok(h.nodes.filter(node=>node.started&&!node.disconnected&&node.kind==='oscillator').length<50);
 }finally{audio.dispose();h.restore();}
});

test('seven animal voices have distinct contours and safe panning, with touch and retrigger guards',async()=>{
 const h=harness(),audio=createAudio();
 try{
  assert.equal(audio.animal('trex'),false);assert.equal(audio.star(),false);assert.equal(audio.celebrate(),false);
  assert.equal(h.contexts.length,0);
  await audio.unlock();await h.flush();
  const signatures=new Set();
  for(const species of ['triceratops','stegosaurus','brachiosaurus','trex','spinosaurus','parasaurolophus','pteranodon']){
   const before=h.nodes.length;
   assert.equal(audio.animal(species,{pan:Infinity,mood:'curious'}),true);
   const created=h.nodes.slice(before),oscillators=created.filter(node=>node.kind==='oscillator');
   signatures.add(JSON.stringify(oscillators.map(node=>node.frequency.automation.map(event=>event.v))));
   assert.ok(oscillators.length>=4&&oscillators.length<=10);
   const count=h.nodes.length;assert.equal(audio.animal(species),false);assert.equal(h.nodes.length,count,'Rapid repeat creates no nodes');
   assert.ok(created.filter(node=>node.kind==='pan').every(node=>Math.abs(node.pan.value)<=.7));
   h.advance(2000);
  }
  assert.equal(signatures.size,7,'Each species has its own pitch contour and phrase');
  assert.equal(audio.animal('constructor',{pan:NaN,mood:'happy'}),true,'Unknown identifiers use the safe Mosi voice');
 }finally{audio.dispose();h.restore();}
});

test('celebrations are bounded, star notes ascend, and cancellation removes scheduled tails only',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  const before=h.nodes.length;
  assert.equal(audio.celebrate({species:'spinosaurus',final:true,stars:6}),true);
  const celebration=h.nodes.slice(before),scheduled=celebration.filter(node=>node.started);
  assert.ok(scheduled.length<=40,'A finale stays well below the global source limit');
  assert.ok(scheduled.every(node=>node.stopAt<=4.1),'No long or unbounded scheduled finale');
  assert.ok(celebration.filter(node=>node.kind==='gain').every(node=>node.gain.automation.every(event=>event.v<=.3)),'Calibrated layers retain headroom; actual summed PCM is measured by the offline mix review');
  const count=h.nodes.length;assert.equal(audio.celebrate({final:true}),false);assert.equal(h.nodes.length,count);
  const notes=[];
  for(let index=0;index<3;index++){
   const start=h.nodes.length;assert.equal(audio.star({index,total:3,pan:index-1}),true);
   notes.push(h.nodes.slice(start).find(node=>node.kind==='oscillator').frequency.events[0]);h.advance(100);
  }
  assert.ok(notes[0]<notes[1]&&notes[1]<notes[2]);
  const activityStart=h.nodes.length;await audio.effect('leaf');
  const activity=h.nodes.slice(activityStart).filter(node=>node.started);
  audio.stopCelebration();
  assert.ok(scheduled.every(node=>node.disconnected),'Even notes scheduled in the future are cancelled');
  assert.ok(activity.every(node=>!node.disconnected),'Cancelling a score does not cut unrelated discovery sound');
  h.advance(5000);
  assert.equal(audio.star({index:Infinity,total:-20,pan:NaN}),true,'Malformed optional values remain finite and clamped');
 }finally{audio.dispose();h.restore();}
});

test('new rewards duck under speech and never resume stale notes after pause, mute or backgrounding',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  const effectsBus=h.nodes.filter(node=>node.kind==='gain')[3];
  const rewardBus=h.nodes.filter(node=>node.kind==='gain')[4];
  assert.equal(effectsBus.gain.value,1);assert.equal(rewardBus.gain.value,1);
  const spoken=audio.narrate('welcome','Halló!');await h.flush();
  assert.equal(effectsBus.gain.value,.76,'Activity effects remain audible while speech leads');
  assert.equal(rewardBus.gain.value,.86,'Rewards retain a little more presence on their separate bus');
  for(const name of ['fossil','leaf','track','splash','echo','breeze','secret','footprint','fish','reed','windring']){
   const before=h.nodes.length;await audio.effect(name);
   assert.ok(h.nodes.length>before,`${name} is audible when active`);
   assert.ok(h.nodes.slice(before).filter(node=>node.kind==='pan').every(node=>node.connections.includes(effectsBus)));
   h.advance(1000);
  }
  h.nodes.find(node=>node.buffer?.file==='welcome.mp3').end();assert.equal(await spoken,true);assert.equal(effectsBus.gain.value,1);assert.equal(rewardBus.gain.value,1);
  for(const mode of ['pause','mute','hide']){
   const before=h.nodes.length;assert.equal(audio.celebrate({species:'trex',final:true}),true);
   const reward=h.nodes.slice(before).filter(node=>node.started);
   if(mode==='pause')audio.setPaused(true);if(mode==='mute')audio.setMuted(true);if(mode==='hide')h.hide(true);
   assert.ok(reward.every(node=>node.disconnected));
   const count=h.nodes.length;audio.animal('pteranodon');audio.star();audio.celebrate();await audio.effect('secret');
   assert.equal(h.nodes.length,count,'No new effects while inactive');
   h.advance(60000);audio.setPaused(false);audio.setMuted(false);h.hide(false);await h.flush();
   assert.ok(reward.every(node=>node.disconnected),'A resumed context never replays a cancelled fanfare');
   h.advance(1000);
  }
  const before=h.nodes.length;audio.celebrate({final:true});const reward=h.nodes.slice(before).filter(node=>node.started);
  audio.setScene('lake');assert.ok(reward.every(node=>node.disconnected),'Leaving the biome also cancels a stale celebration');
 }finally{audio.dispose();h.restore();}
});

test('touching the natural world gives short, distinct responses without replaying swipe bursts',async()=>{
 const h=harness(),audio=createAudio();
 try{
  assert.equal(audio.worldTouch('water'),false);assert.equal(h.contexts.length,0);
  await audio.unlock();await h.flush();
  assert.equal(audio.worldTouch('constructor'),false,'Unknown surfaces never dispatch through a prototype');
  const signatures=new Set();
  for(const kind of ['grass','tree','path','water','rock']){
   const before=h.nodes.length,at=h.contexts[0].currentTime;
   assert.equal(audio.worldTouch(kind,{pan:Infinity}),true);
   const created=h.nodes.slice(before),sounds=created.filter(node=>node.started);
   signatures.add(JSON.stringify(created.filter(node=>['oscillator','filter'].includes(node.kind)).map(node=>[node.kind,node.frequency.automation])));
   assert.ok(sounds.length<=2,'A surface response is much smaller than a scoring phrase');
   assert.ok(sounds.every(node=>node.stopAt-at<=.35),'Surface sounds end promptly');
   assert.ok(created.filter(node=>node.kind==='gain').every(node=>node.gain.automation.every(event=>event.v<=.25)),'Calibrated textures stay bounded even during rapid swipes');
   assert.ok(created.filter(node=>node.kind==='pan').every(node=>Math.abs(node.pan.value)<=.65));
   const count=h.nodes.length;assert.equal(audio.worldTouch(kind),false);assert.equal(h.nodes.length,count);
   h.advance(400);
  }
  assert.equal(signatures.size,5,'Each surface has its own material response');
  const before=h.nodes.length;
  for(let i=0;i<100;i++){audio.worldTouch(['tree','water','grass','rock','path'][i%5],{pan:NaN});h.advance(2);}
  assert.ok(h.nodes.slice(before).filter(node=>node.started&&!node.disconnected).length<=8,'A dense swipe cannot flood the active sound graph');
  audio.setScene('lake');
  assert.ok(h.nodes.slice(before).filter(node=>node.started&&node.stopAt!==undefined).every(node=>node.disconnected),'Changing biome cancels old surface tails');
 }finally{audio.dispose();h.restore();}
});

test('earned-star accent leads the animation and remains stronger than taps under speech ducking',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  const peak=nodes=>Math.max(0,...nodes.filter(node=>node.kind==='gain').flatMap(node=>node.gain.automation.map(event=>event.v)));
  let before=h.nodes.length;audio.star({index:1});const target=h.nodes.slice(before);h.advance(100);
  before=h.nodes.length;audio.worldTouch('rock');const surface=h.nodes.slice(before);h.advance(100);
  const spoken=audio.narrate('welcome','Halló!');await h.flush();
  const effectsBus=h.nodes.filter(node=>node.kind==='gain')[3],rewardBus=h.nodes.filter(node=>node.kind==='gain')[4];assert.equal(effectsBus.gain.value,.76);
  before=h.nodes.length;const at=h.contexts[0].currentTime;audio.celebrate({species:'triceratops',stars:1});
  const earned=h.nodes.slice(before);
  assert.ok(earned.filter(node=>node.kind==='pan').every(node=>node.connections.includes(rewardBus)),'Every earned-star layer uses the independently ducked reward bus');
  assert.ok(peak(earned)>=peak(target)*1.8&&peak(earned)>peak(surface),'Only an earned star gets the strongest accent');
  const melodic=earned.filter(node=>node.kind==='oscillator'&&node.frequency.events[0]>=195&&node.frequency.events[0]<=400);
  assert.ok(melodic.filter(node=>Math.abs(node.startAt-at)<.001).length>=3,'The ta-dam starts immediately');
  assert.ok(melodic.filter(node=>node.startAt-at>.2&&node.startAt-at<.35).length>=3,'The resolving chord arrives while the large star is spinning');
  assert.ok(earned.filter(node=>node.started&&node.startAt-at<1.3).length>=15,'The musical focus is in the centered-star interval');
  assert.ok(surface.filter(node=>node.started).every(node=>node.disconnected),'A star clears the preceding quiet surface sound');
  const response=h.nodes.length;audio.arrival({type:'wing',species:'pteranodon',progress:1});
  for(let i=0;i<100;i++)audio.arrival({type:'wing',species:'pteranodon',progress:1});
  assert.equal(h.nodes.slice(response).filter(node=>node.started).length,2,'Duplicate render callbacks cannot stack wing sounds');
  h.nodes.find(node=>node.buffer?.file==='welcome.mp3').end();assert.equal(await spoken,true);
 }finally{audio.dispose();h.restore();}
});

test('surface sounds share pause, mute and background cancellation with the rest of the world',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  for(const mode of ['pause','mute','hide']){
   h.advance(500);const before=h.nodes.length;assert.equal(audio.worldTouch('water'),true);
   const touch=h.nodes.slice(before).filter(node=>node.started);
   if(mode==='pause')audio.setPaused(true);if(mode==='mute')audio.setMuted(true);if(mode==='hide')h.hide(true);
   assert.ok(touch.every(node=>node.disconnected));
   const count=h.nodes.length;assert.equal(audio.worldTouch('grass'),false);assert.equal(h.nodes.length,count);
   h.advance(60000);audio.setPaused(false);audio.setMuted(false);h.hide(false);await h.flush();
   assert.ok(touch.every(node=>node.disconnected),'Resuming never replays an old touch');
  }
 }finally{audio.dispose();h.restore();}
});

test('foreground synthesis has audible body and small-speaker harmonics without raising ambience',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  const gains=h.nodes.filter(node=>node.kind==='gain'),ambienceBus=gains[2],effectsBus=gains[3],rewardBus=gains[4];
  const before=h.nodes.length;audio.animal('brachiosaurus');
  const animal=h.nodes.slice(before),tones=animal.filter(n=>n.kind==='oscillator');
  assert.ok(tones.some(n=>n.frequency.events[0]>=300),'Large animal voice includes a resonant midrange partial, not only bass');
  const body=tones[0].connections[0].gain.automation,peak=Math.max(...body.map(e=>e.v));
  assert.ok(body.some(e=>e.t>.25&&e.v>=peak*.6),'The call sustains a voiced body instead of disappearing immediately after attack');
  const voice=audio.narrate('welcome','Halló!');await h.flush();
  assert.ok(ambienceBus.gain.value<effectsBus.gain.value&&effectsBus.gain.value<rewardBus.gain.value,'Speech ducking preserves the foreground/background hierarchy');
  assert.ok(h.nodes.find(n=>n.buffer?.file==='welcome.mp3').connections.includes(gains[0]),'Recorded narration bypasses effect ducking');
  const tapStart=h.nodes.length;await audio.effect('tap');
  assert.equal(h.nodes.slice(tapStart).filter(n=>n.kind==='oscillator').length,2,'A touch has a rounded synthesized body as well as the short recorded click');
  audio.setMuted(true);assert.equal(await voice,false);
 }finally{audio.dispose();h.restore();}
});

test('the local score streams through one loop source activated synchronously by touch and preserves position',async()=>{
 const h=harness(),audio=createAudio();
 try{
  assert.equal(h.requests.length,1,'Only narration metadata is fetched before touch');
  const unlocked=audio.unlock();assert.equal(h.media[0]?.playCalls,1,'Media play happens in the synchronous unlock gesture, before any await');
  await unlocked;await h.flush();
  const music=()=>h.nodes.filter(node=>node.kind==='media');
  assert.equal(music().length,1);const source=music()[0],element=h.media[0];assert.equal(element.loop,true);
  assert.ok(source.connections.includes(h.nodes.filter(node=>node.kind==='gain')[1]),'Streaming audio uses the same ducking bus');
  for(const mode of ['pause','mute','hide']){
   h.advance(1000);const position=h.contexts[0].currentTime,musicPosition=element.currentTime;
   if(mode==='pause')audio.setPaused(true);if(mode==='mute')audio.setMuted(true);if(mode==='hide')h.hide(true);
   h.advance(50000);assert.equal(h.contexts[0].currentTime,position,'The context freezes the existing loop phase');
   assert.equal(element.currentTime,musicPosition,'The media element itself pauses while hidden or muted');
   assert.equal(source.stopAt,undefined,'Pause does not discard the soundtrack position');
   audio.setPaused(false);audio.setMuted(false);h.hide(false);await h.flush();
   assert.deepEqual(music(),[source]);
  }
  assert.equal(h.requests.filter(url=>url.endsWith('little-dino-green-valley.mp3')).length,1);
  assert.ok(!h.nodes.some(node=>node.buffer?.file==='little-dino-green-valley.mp3'),'The long stereo song never creates a full PCM AudioBuffer');
  assert.ok(!h.requests.some(url=>url.endsWith('dream-culture.mp3')),'The selected track is preferred whenever available');
  audio.dispose();assert.ok(source.disconnected);assert.ok(element.paused&&element.unloaded);assert.equal(element.src,'');assert.equal(element.onerror,null);assert.equal(h.contexts[0].state,'closed');
 }finally{audio.dispose();h.restore();}
});

test('music follows overlapping foreground priority and recovers after the last real source, never ambient chirps',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  const bus=h.nodes.filter(node=>node.kind==='gain')[1];
  assert.ok(bus.gain.value>.25,'Quiet exploration gives the score audible presence');
  for(let i=0;i<4;i++)h.advance(8000);
  assert.equal(bus.gain.value,MUSIC_MIX.quiet,'Continuous beds and intermittent birds do not duck the music');
  audio.arrival({type:'wing',species:'pteranodon',progress:1});assert.equal(bus.gain.value,MUSIC_MIX.movement);
  const at=h.nodes.length;await audio.effect('leaf');const leaf=h.nodes.slice(at).filter(node=>node.started);
  assert.equal(bus.gain.value,MUSIC_MIX.effect);
  const animalAt=h.nodes.length;audio.animal('brachiosaurus');const animal=h.nodes.slice(animalAt).filter(node=>node.started);
  assert.equal(bus.gain.value,MUSIC_MIX.featured);
  const spoken=audio.narrate('welcome','Halló!');await h.flush();assert.equal(bus.gain.value,MUSIC_MIX.speech);
  assert.ok(MUSIC_MIX.speech<MUSIC_MIX.featured&&MUSIC_MIX.featured<MUSIC_MIX.effect&&MUSIC_MIX.effect<MUSIC_MIX.quiet);
  h.nodes.find(node=>node.buffer?.file==='welcome.mp3').end();assert.equal(await spoken,true);
  assert.equal(bus.gain.value,MUSIC_MIX.featured,'Speech ending cannot uncover a still-playing animal');
  for(const node of animal)node.end();assert.equal(bus.gain.value,MUSIC_MIX.effect,'Ordinary sound remains ahead of music after the featured call');
  for(const node of leaf)node.end();assert.equal(bus.gain.value,MUSIC_MIX.movement);
  h.advance(1000);assert.equal(bus.gain.value,MUSIC_MIX.quiet);
  const automation=bus.gain.automation.filter(event=>event.type==='target');
  assert.ok(automation.every(event=>event.tau>0),'Every change is smoothed');
  assert.equal(automation.at(-1).tau,MUSIC_MIX.release);
 }finally{audio.dispose();h.restore();}
});

test('interrupted music release is continuous, and cancelled fanfares cannot leave permanent ducking',async()=>{
 const h=harness(),audio=createAudio();
 try{
  await audio.unlock();await h.flush();const bus=h.nodes.filter(node=>node.kind==='gain')[1];
  const start=h.nodes.length;audio.celebrate({species:'trex',final:true});const score=h.nodes.slice(start).filter(node=>node.started);
  assert.equal(bus.gain.value,MUSIC_MIX.featured);h.advance(500);
  audio.stopCelebration();assert.equal(bus.gain.value,MUSIC_MIX.quiet);
  const releaseStart=bus.gain.automation.filter(event=>event.type==='hold').at(-1).v;
  h.advance(180);await audio.effect('leaf');
  const hold=bus.gain.automation.filter(event=>event.type==='hold').at(-1);
  const expected=MUSIC_MIX.quiet+(releaseStart-MUSIC_MIX.quiet)*Math.exp(-.18/MUSIC_MIX.release);
  assert.ok(Math.abs(hold.v-expected)<1e-12,'A fresh effect continues from the actual rising envelope, not a jumped target');
  audio.setPaused(true);assert.equal(bus.gain.value,MUSIC_MIX.quiet);
  h.advance(60000);audio.setPaused(false);await h.flush();
  assert.equal(bus.gain.value,MUSIC_MIX.quiet);
  for(const node of score)node.end();assert.equal(bus.gain.value,MUSIC_MIX.quiet,'Late ended events from cancelled sources cannot retain focus');
  assert.ok(score.every(node=>node.disconnected));
 }finally{audio.dispose();h.restore();}
});

test('music loading has a local fallback and cannot recreate an audio graph after disposal',async()=>{
 const h=harness({missingFiles:['little-dino-green-valley.mp3']}),audio=createAudio();
 try{
  await audio.unlock();await h.flush();
  assert.equal(h.nodes.filter(node=>node.buffer?.file==='dream-culture.mp3'&&node.loop).length,1);
  assert.ok(h.requests.every(url=>url.startsWith(new URL('../dist/assets/audio/',import.meta.url).href)),'No external music host is used');
 }finally{audio.dispose();h.restore();}
 const late=harness({mediaSupport:false}),release=late.hold('dream-culture.mp3'),disposed=createAudio();
 try{
  await disposed.unlock();await late.flush();disposed.dispose();const count=late.nodes.length;release();await late.flush();
  assert.equal(late.nodes.length,count,'Finishing a pending load cannot create sources in a disposed context');
  assert.equal(late.timers.size,0);assert.equal(late.contexts[0].state,'closed');
 }finally{disposed.dispose();late.restore();}
});

test('media-play rejection stays bounded and pending resolution respects pause, resume and disposal',async()=>{
 const blocked=harness({playMode:'reject'}),audio=createAudio();
 try{
  await audio.unlock();await blocked.flush();assert.equal(blocked.media[0].playCalls,1);assert.ok(blocked.media[0].paused);
  blocked.advance(20000);await blocked.flush();assert.equal(blocked.media[0].playCalls,1,'Autoplay rejection cannot spin a retry loop');
  await audio.unlock();await blocked.flush();assert.equal(blocked.media[0].playCalls,2,'A later real gesture can retry activation');
  assert.ok(!blocked.nodes.some(node=>node.buffer?.file==='dream-culture.mp3'),'Permission denial is not misclassified as a corrupt music file');
 }finally{audio.dispose();blocked.restore();}
 const h=harness({playMode:'hold'}),pending=createAudio();
 try{
  await pending.unlock();await h.flush();const element=h.media[0];assert.equal(h.playRequests.length,1);
  pending.setPaused(true);h.playRequests[0].resolve();await h.flush();assert.ok(element.paused,'A late play resolution cannot restart music under a pause');
  pending.setPaused(false);await h.flush();assert.equal(h.playRequests.length,2);
  pending.setPaused(true);pending.setPaused(false);h.playRequests[1].reject(Object.assign(new Error('Paused'),{name:'AbortError'}));await h.flush();
  assert.equal(h.playRequests.length,3,'A resume that overtook an aborted play gets exactly one replacement request');
  pending.dispose();h.playRequests[2].resolve();await h.flush();assert.ok(element.paused);assert.equal(element.src,'');assert.equal(h.nodes.filter(node=>node.kind==='media').length,1);
 }finally{pending.dispose();h.restore();}
});
