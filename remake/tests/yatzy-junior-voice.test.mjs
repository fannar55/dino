import test from 'node:test';
import assert from 'node:assert/strict';
import {createJuniorVoice} from '../engine/yatzy-junior/voice.js';

const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(options={}){
  const instances=[],behaviors=[],captions=[],speaking=[],unavailable=[];
  class FakeAudio {
    constructor(src){this.src=src;this.currentTime=0;this.muted=false;this.pauses=0;this.loads=0;this.plays=0;this.events=new Map();this.history=new Map();instances.push(this);}
    addEventListener(type,fn){this.events.set(type,fn);this.history.set(type,fn);}
    removeEventListener(type,fn){if(this.events.get(type)===fn)this.events.delete(type);}
    emit(type){this.events.get(type)?.();}
    play(){this.plays++;const behavior=behaviors.shift();return behavior?behavior():Promise.resolve();}
    pause(){this.pauses++;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){this.loads++;}
  }
  const voice=createJuniorVoice({
    lines:{first:{text:'Sæl! Prófum að kasta.'},second:{text:'Geymum tvo eins.'},missing:{text:'Textinn bíður eftir þér.'},optional:{text:'Næsti kastar!',optional:true}},
    manifest:{first:{src:'assets/audio/yatzy-junior/first.mp3',duration:2,mouth:'0f80f000'},second:{src:'assets/audio/yatzy-junior/second.mp3',duration:3,mouth:'0c400'}},
    onLine:(...args)=>captions.push(args),onSpeaking:value=>speaking.push(value),onUnavailable:info=>unavailable.push(info),AudioClass:FakeAudio,...options,
  });
  return {voice,instances,behaviors,captions,speaking,unavailable,clip:()=>instances.at(-1)};
}

test('native narration resolves local assets, captions once, and advances exactly once on ended',async()=>{
  const f=fixture(),ended=[];
  assert.equal(f.voice.say('first',{onEnd:id=>ended.push(id)}),true);
  assert.match(f.clip().src,/\/remake\/assets\/audio\/yatzy-junior\/first\.mp3$/);
  assert.equal(f.clip().preload,'auto');assert.equal(f.voice.busy,true);assert.equal(f.voice.speaking,false);
  await flush();assert.equal(f.voice.speaking,true);assert.equal(f.voice.getDebugState().mode,'audio');
  const late=f.clip().history.get('ended'),clip=f.clip();
  f.voice.update(1000);assert.deepEqual(ended,[]);assert.equal(f.voice.busy,true);
  clip.emit('ended');late();clip.emit('ended');
  assert.deepEqual(ended,['first']);assert.deepEqual(f.captions,[['first','Sæl! Prófum að kasta.']]);
  assert.equal(f.voice.busy,false);assert.equal(f.voice.currentId,'first');assert.equal(f.voice.mouth,0);
  assert.equal(clip.events.size,0);assert.equal(clip.loads,1);assert.equal(clip.src,'');assert.ok(clip.pauses>0);
  assert.deepEqual(f.speaking,[true,false]);
});

test('pending native audio has no dt watchdog, and a superseded promise or event cannot advance',async()=>{
  const f=fixture(),waiting=deferred(),ended=[];f.behaviors.push(()=>waiting.promise);
  f.voice.say('first',{onEnd:()=>ended.push('old')});const old=f.clip(),lateEnd=old.history.get('ended'),lateError=old.history.get('error');
  f.voice.update(999);assert.equal(f.voice.getDebugState().mode,'pending');assert.equal(f.voice.busy,true);
  f.voice.say('second',{onEnd:()=>ended.push('new')});await flush();
  waiting.reject(new Error('late rejection'));lateEnd();lateError();await flush();
  assert.equal(f.voice.currentId,'second');assert.equal(f.voice.getDebugState().mode,'audio');assert.deepEqual(ended,[]);
  f.clip().emit('ended');assert.deepEqual(ended,['new']);assert.equal(old.events.size,0);
});

test('replay transfers a pending completion once; replay after completion never scores or advances again',async()=>{
  const f=fixture();let count=0;f.voice.say('first',{onEnd:()=>count++});await flush();
  f.clip().currentTime=1.3;const late=f.clip().history.get('ended');
  assert.equal(f.voice.replay(),true);await flush();late();assert.equal(count,0);assert.equal(f.clip().currentTime,0);
  f.clip().emit('ended');assert.equal(count,1);
  assert.equal(f.voice.replay(),true);await flush();assert.equal(f.voice.busy,true);f.clip().emit('ended');assert.equal(count,1);
  assert.equal(f.instances.length,3);assert.equal(f.captions.length,3);
});

test('pause freezes native playback and defers a queued ended event until resume',async()=>{
  const f=fixture();let count=0;f.voice.say('first',{onEnd:()=>count++});await flush();const clip=f.clip();clip.currentTime=.7;
  f.voice.pause(true);assert.equal(f.voice.speaking,false);assert.ok(clip.pauses>0);f.voice.update(999);
  assert.equal(f.voice.getDebugState().elapsed,.7);clip.emit('ended');
  assert.equal(count,0);assert.equal(f.voice.busy,true);assert.equal(f.voice.getDebugState().pendingEnd,true);
  f.voice.pause(false);assert.equal(count,1);assert.equal(f.voice.busy,false);assert.equal(clip.plays,1);
  f.voice.pause(false);assert.equal(count,1);
});

test('pause invalidates an in-flight play rejection and resume requests playback at the same time',async()=>{
  const f=fixture(),waiting=deferred();f.behaviors.push(()=>waiting.promise);f.voice.say('first');const clip=f.clip();clip.currentTime=.35;
  f.voice.pause(true);waiting.reject(Object.assign(new Error('interrupted'),{name:'AbortError'}));await flush();
  assert.notEqual(f.voice.getDebugState().mode,'fallback');assert.equal(f.voice.busy,true);
  f.voice.pause(false);await flush();assert.equal(clip.plays,2);assert.equal(clip.currentTime,.35);assert.equal(f.voice.getDebugState().mode,'audio');
});

test('blocked audible narration holds progression until a successful replay, completing only once',async()=>{
  const f=fixture();let count=0;f.behaviors.push(()=>Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'})));
  f.voice.say('first',{onEnd:()=>count++});await flush();
  const old=f.clip(),late=old.history.get('ended');
  assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.voice.unavailable,true);assert.equal(f.voice.getDebugState().reason,'NotAllowedError');
  assert.equal(f.voice.busy,true);assert.equal(f.voice.speaking,false);assert.equal(f.voice.mouth,0);
  assert.deepEqual(f.unavailable,[{id:'first',reason:'NotAllowedError',mediaCode:null,mediaMessage:null}]);
  f.voice.update(100);f.voice.pause(true);f.voice.update(20);f.voice.pause(false);f.voice.update(100);
  assert.equal(f.voice.getDebugState().elapsed,0);assert.equal(count,0);assert.equal(old.plays,1);assert.equal(f.unavailable.length,1);
  f.voice.replay();await flush();late();assert.equal(count,0);assert.equal(f.voice.unavailable,false);assert.equal(f.voice.getDebugState().mode,'audio');
  f.clip().emit('ended');f.voice.update(100);assert.equal(count,1);assert.equal(f.voice.getDebugState().mode,'ended');
});

test('media failure holds at the actual audio time and offers an explicit muted-caption fallback',async()=>{
  const f=fixture();let count=0;f.voice.say('second',{onEnd:()=>count++});await flush();const clip=f.clip();clip.currentTime=2.25;
  clip.error={code:2,message:'Network connection was lost'};clip.emit('error');
  assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.voice.getDebugState().reason,'media-error');
  assert.equal(f.voice.getDebugState().elapsed,2.25);f.voice.update(999);assert.equal(count,0);
  assert.deepEqual(f.unavailable,[{id:'second',reason:'media-error',mediaCode:2,mediaMessage:'Network connection was lost'}]);
  f.voice.mute(true);assert.equal(f.voice.getDebugState().mode,'fallback');f.voice.update(.74);assert.equal(count,0);f.voice.update(.02);assert.equal(count,1);
});

test('mute keeps native timing and does not restart clips; initially muted failures still finish via fallback',async()=>{
  const f=fixture();let count=0;f.voice.mute(true);f.voice.say('first',{onEnd:()=>count++});await flush();const clip=f.clip();
  assert.equal(clip.muted,true);clip.currentTime=.8;f.voice.mute(false);assert.equal(clip.muted,false);
  f.voice.mute(true);f.voice.update(99);assert.equal(count,0);assert.equal(clip.plays,1);assert.equal(clip.currentTime,.8);
  clip.emit('ended');assert.equal(count,1);
  f.behaviors.push(()=>Promise.reject(new Error('blocked')));f.voice.say('second',{onEnd:()=>count++});await flush();
  assert.equal(f.voice.getDebugState().mode,'fallback');f.voice.update(3);assert.equal(count,2);
});

test('missing assets and synchronous failures hold audible lessons, but explicit mute permits finite captions',()=>{
  for(const options of [{AudioClass:null},{manifest:{}},{AudioClass:class{constructor(){throw new Error('unavailable');}}}]){
    const f=fixture(options);let count=0;f.voice.say('first',{onEnd:()=>count++});
    assert.equal(f.voice.getDebugState().mode,'unavailable');assert.ok(f.voice.getDebugState().duration>=2);assert.equal(f.unavailable.length,1);
    for(const dt of [NaN,Infinity,-2,0])f.voice.update(dt);assert.equal(f.voice.getDebugState().elapsed,0);
    f.voice.update(30);assert.equal(count,0);f.voice.mute(true);
    f.voice.update(30);assert.equal(count,1);f.voice.dispose();
  }
  const f=fixture();f.behaviors.push(()=>{throw new TypeError('unsupported');});f.voice.say('first');
  assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.voice.getDebugState().reason,'TypeError');assert.equal(f.unavailable.length,1);
});

// Fjölspil's lines (MULTI_LINES) are optional: the page opens before the owner records them, and until he does each is its
// caption alone for the time its words take, with no "Rödd Mosa náðist ekki" whether the sound is on or off (spec §8).
test('an optional line not recorded yet is its caption alone, sound on or off, and never waits for a voice',()=>{
  const f=fixture();let count=0;
  assert.equal(f.voice.say('optional',{onEnd:()=>count++}),true);
  assert.deepEqual(f.captions,[['optional','Næsti kastar!']]);assert.deepEqual(f.unavailable,[]);assert.deepEqual(f.speaking,[true]);
  assert.equal(f.voice.getDebugState().mode,'fallback');assert.equal(f.voice.unavailable,false);assert.equal(f.instances.length,0,'no audio is asked for');
  const {duration}=f.voice.getDebugState();assert.ok(duration>=2&&duration<3,`the time its two words take: ${duration}`);
  f.voice.mute(true);f.voice.mute(false);assert.equal(f.voice.getDebugState().mode,'fallback','the sound button changes nothing');
  f.voice.pause(true);f.voice.update(99);assert.equal(f.voice.speaking,false);assert.equal(count,0);f.voice.pause(false);assert.equal(f.voice.speaking,true);
  f.voice.update(duration-.05);assert.equal(count,0);f.voice.update(.1);assert.equal(count,1);assert.equal(f.voice.busy,false);
  assert.equal(f.voice.replay(),true);assert.equal(f.voice.getDebugState().mode,'fallback');assert.deepEqual(f.unavailable,[]);
  // A line that must be recorded keeps today's way: with no recording, an audible game waits for it.
  f.voice.say('missing');assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.voice.getDebugState().reason,'asset-unavailable');assert.equal(f.unavailable.length,1);
  // No audio at all on the page: an optional line not recorded is still its caption alone.
  const silent=fixture({AudioClass:null});silent.voice.say('optional');assert.equal(silent.voice.getDebugState().mode,'fallback');assert.deepEqual(silent.unavailable,[]);
  const muted=fixture();muted.voice.mute(true);muted.voice.say('optional');assert.equal(muted.voice.getDebugState().mode,'fallback');assert.deepEqual(muted.speaking,[true]);
});

test('an optional line once recorded plays as any other line',async()=>{
  const f=fixture({manifest:{optional:{src:'assets/audio/yatzy-junior/multiTurn.mp3',duration:1.4,mouth:'0f8000'}}});let count=0;
  f.voice.say('optional',{onEnd:()=>count++});assert.match(f.clip().src,/\/remake\/assets\/audio\/yatzy-junior\/multiTurn\.mp3$/);
  await flush();assert.equal(f.voice.getDebugState().mode,'audio');f.voice.update(99);assert.equal(count,0);f.clip().emit('ended');assert.equal(count,1);
});

test('mouth sampling follows recorded 20 Hz activity and closes when paused or complete',async()=>{
  const f=fixture();f.voice.say('first');await flush();
  for(const [time,value] of [[0,0],[.05,1],[.1,8/15],[.15,0],[.2,1],[1.9,0]]){f.clip().currentTime=time;assert.equal(f.voice.mouth,value);}
  f.clip().currentTime=.05;f.voice.pause(true);assert.equal(f.voice.mouth,0);f.voice.pause(false);await flush();assert.equal(f.voice.mouth,1);
  f.clip().emit('ended');assert.equal(f.voice.mouth,0);
  const fallback=fixture({AudioClass:null});fallback.voice.mute(true);fallback.voice.say('first');fallback.voice.update(.05);assert.equal(fallback.voice.mouth,1);
  fallback.voice.update(.05);assert.equal(fallback.voice.mouth,8/15);fallback.voice.update(2);assert.equal(fallback.voice.mouth,0);
});

test('stop and dispose cancel queued events and promise fulfillment, with no further allocations',async()=>{
  const f=fixture(),waiting=deferred();let count=0;f.behaviors.push(()=>waiting.promise);f.voice.say('first',{onEnd:()=>count++});
  const late=f.clip().history.get('ended');f.voice.stop();waiting.resolve();late();await flush();
  assert.equal(f.voice.currentId,null);assert.equal(f.voice.busy,false);assert.equal(f.voice.speaking,false);assert.equal(f.voice.replay(),false);
  f.voice.say('second',{onEnd:()=>count++});await flush();const ended=f.clip().history.get('ended');f.voice.dispose();f.voice.dispose();ended();
  for(let i=0;i<1000;i++)f.voice.update(.016);
  assert.equal(f.voice.say('first'),false);assert.equal(f.voice.replay(),false);f.voice.pause(false);f.voice.mute(false);
  assert.equal(f.instances.length,2);assert.equal(count,0);assert.equal(f.voice.currentId,null);assert.ok(f.instances.every(clip=>clip.events.size===0&&clip.loads===1));
});

test('unknown narration leaves the current line intact, and starting paused does not autoplay',async()=>{
  const f=fixture();f.voice.pause(true);f.voice.say('first');assert.equal(f.clip().plays,0);assert.equal(f.voice.speaking,false);
  assert.equal(f.voice.say('not-in-script'),false);assert.equal(f.voice.currentId,'first');assert.equal(f.instances.length,1);
  f.voice.update(100);assert.equal(f.voice.busy,true);f.voice.pause(false);await flush();assert.equal(f.clip().plays,1);assert.equal(f.voice.speaking,true);
});

test('callbacks can synchronously move to the next line or cancel without corrupting playback',async()=>{
  const f=fixture();f.voice.say('first',{onEnd:()=>f.voice.say('second')});await flush();f.clip().emit('ended');await flush();
  assert.equal(f.voice.currentId,'second');assert.equal(f.voice.busy,true);assert.equal(f.voice.speaking,true);
  let voice;voice=fixture({AudioClass:null,onUnavailable:()=>voice.stop()}).voice;
  assert.doesNotThrow(()=>voice.say('first'));assert.equal(voice.currentId,null);assert.equal(voice.busy,false);
  let silent;silent=fixture({AudioClass:null,onSpeaking:value=>{if(value)silent.stop();}}).voice;silent.mute(true);
  assert.doesNotThrow(()=>silent.say('first'));assert.equal(silent.currentId,null);assert.equal(silent.busy,false);
  let canceled;const g=fixture({onLine:()=>canceled.stop()});canceled=g.voice;
  assert.equal(canceled.say('first'),false);assert.equal(g.instances.length,0);assert.equal(canceled.currentId,null);
});

test('muted failure follows caption time, freezes on pause, and holds again when sound is enabled',async()=>{
  const f=fixture();let count=0;f.voice.mute(true);f.behaviors.push(()=>Promise.reject(new Error('offline')));
  f.voice.say('first',{onEnd:()=>count++});await flush();assert.equal(f.voice.getDebugState().mode,'fallback');assert.equal(f.unavailable.length,0);
  f.voice.update(.75);f.voice.pause(true);f.voice.update(999);assert.equal(f.voice.getDebugState().elapsed,.75);assert.equal(f.voice.speaking,false);
  f.voice.pause(false);f.voice.mute(false);assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.voice.speaking,false);
  f.voice.update(999);assert.equal(f.voice.getDebugState().elapsed,.75);assert.equal(count,0);assert.equal(f.unavailable.length,1);
  f.voice.mute(false);f.voice.pause(true);f.voice.pause(false);assert.equal(f.unavailable.length,1);
  f.voice.replay();await flush();assert.equal(f.voice.getDebugState().elapsed,0);assert.equal(f.clip().muted,false);
  f.clip().emit('ended');assert.equal(count,1);
});

test('a failed replay remains recoverable and stale network events never finish or report a newer line',async()=>{
  const f=fixture();let count=0;f.voice.say('first',{onEnd:()=>count++});await flush();
  const old=f.clip(),oldError=old.history.get('error'),oldEnd=old.history.get('ended');old.emit('error');
  f.behaviors.push(()=>Promise.reject(new Error('still offline')));f.voice.replay();await flush();
  assert.equal(f.voice.getDebugState().mode,'unavailable');assert.equal(f.unavailable.length,2);assert.equal(count,0);
  f.voice.replay();await flush();oldError();oldEnd();assert.equal(f.unavailable.length,2);assert.equal(count,0);
  f.voice.stop();oldError();oldEnd();f.voice.update(999);assert.equal(count,0);assert.equal(f.voice.unavailable,false);
  f.voice.say('second');await flush();assert.equal(f.voice.currentId,'second');assert.equal(f.voice.getDebugState().failure,null);
});
