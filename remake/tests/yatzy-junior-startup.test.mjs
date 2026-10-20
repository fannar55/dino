import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForStartup} from '../engine/yatzy-junior/startup.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function trackedSignal(){
  const controller=new AbortController(),signal=controller.signal,listeners=new Set();
  const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(type,listener,options)=>{if(type==='abort')listeners.add(listener);add(type,listener,options);};
  signal.removeEventListener=(type,listener)=>{if(type==='abort')listeners.delete(listener);remove(type,listener);};
  return {controller,signal,listeners};
}
function trackTimers(t){
  const active=new Set(),set=globalThis.setTimeout,clear=globalThis.clearTimeout;
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{
    const timer=set(()=>{active.delete(timer);callback();},delay);active.add(timer);return timer;
  });
  t.mock.method(globalThis,'clearTimeout',timer=>{active.delete(timer);return clear(timer);});
  return active;
}

test('startup returns exact values and errors from promises, thenables and plain values',async()=>{
  const value={scene:true},error=new Error('asset failed');
  assert.equal(await waitForStartup(Promise.resolve(value)),value);
  assert.equal(await waitForStartup({then(resolve){resolve(value);}}),value);
  assert.equal(await waitForStartup(7),7);
  await assert.rejects(waitForStartup(Promise.reject(error)),actual=>actual===error);
  await assert.rejects(waitForStartup({get then(){throw error;}}),actual=>actual===error);
});

test('an already aborted signal wins and still consumes a late loader rejection',async t=>{
  const {controller,signal,listeners}=trackedSignal(),timers=trackTimers(t),loader=deferred(),reason=new Error('page closed');
  controller.abort(reason);
  await assert.rejects(waitForStartup(loader.promise,{signal,timeoutMs:10}),actual=>actual===reason);
  assert.equal(listeners.size,0);assert.equal(timers.size,0);
  loader.reject(new Error('late network error'));await nextTurn();
});

test('abort during a load releases the timer/listener and never publishes a late resource',async t=>{
  const {controller,signal,listeners}=trackedSignal(),timers=trackTimers(t),loader=deferred();
  const waiting=waitForStartup(loader.promise,{signal,timeoutMs:10}),reason={type:'navigation'};
  assert.equal(listeners.size,1);assert.equal(timers.size,1);
  controller.abort(reason);await assert.rejects(waiting,actual=>actual===reason);
  assert.equal(listeners.size,0);assert.equal(timers.size,0);
  loader.resolve({dispose(){}});await nextTurn();
});

test('abort without a reason produces AbortError; explicit null reasons are retained',async()=>{
  const signal=new EventTarget();signal.aborted=false;
  const waiting=waitForStartup(new Promise(()=>{}),{signal});signal.aborted=true;signal.dispatchEvent(new Event('abort'));
  await assert.rejects(waiting,{name:'AbortError'});
  const controller=new AbortController();controller.abort(null);
  let rejected=false;await waitForStartup(1,{signal:controller.signal}).catch(reason=>{rejected=true;assert.equal(reason,null);});
  assert.equal(rejected,true);
});

test('settled loads clear their timers and abort listeners on both success and failure',async t=>{
  const timers=trackTimers(t);
  for(const succeeds of [true,false]){
    const {controller,signal,listeners}=trackedSignal(),loader=deferred(),error=new Error('decode failed');
    const waiting=waitForStartup(loader.promise,{signal,timeoutMs:10});
    if(succeeds){loader.resolve('ready');assert.equal(await waiting,'ready');}
    else{loader.reject(error);await assert.rejects(waiting,actual=>actual===error);}
    assert.equal(timers.size,0);assert.equal(listeners.size,0);controller.abort();await nextTurn();
  }
});

test('required timeout rejects with a useful error and consumes late loader failures',async t=>{
  const {signal,listeners}=trackedSignal(),timers=trackTimers(t),loader=deferred();
  await assert.rejects(waitForStartup(loader.promise,{signal,timeoutMs:5}),error=>error.name==='TimeoutError'&&/5 ms/.test(error.message));
  assert.equal(listeners.size,0);assert.equal(timers.size,0);
  loader.reject(new Error('late asset failure'));await nextTurn();
});

test('optional timeout resolves undefined but does not suppress real errors or aborts',async t=>{
  const timers=trackTimers(t),first=trackedSignal(),loader=deferred();
  assert.equal(await waitForStartup(loader.promise,{signal:first.signal,timeoutMs:5,optional:true}),undefined);
  assert.equal(first.listeners.size,0);assert.equal(timers.size,0);
  loader.reject(new Error('font arrived too late'));await nextTurn();
  const error=new Error('actual rejection');
  await assert.rejects(waitForStartup(Promise.reject(error),{timeoutMs:5,optional:true}),actual=>actual===error);
  const second=trackedSignal(),waiting=waitForStartup(new Promise(()=>{}),{signal:second.signal,timeoutMs:5,optional:true});
  second.controller.abort(error);await assert.rejects(waiting,actual=>actual===error);
  assert.equal(second.listeners.size,0);assert.equal(timers.size,0);
});

test('zero timeout waits for the loader, and an abort after an optional timeout cannot change its result',async t=>{
  const timers=trackTimers(t),loader=deferred();
  const waiting=waitForStartup(loader.promise,{timeoutMs:0,optional:true});
  await nextTurn();assert.equal(timers.size,0);loader.resolve('complete');assert.equal(await waiting,'complete');
  const {controller,signal,listeners}=trackedSignal(),late=deferred();
  const timed=waitForStartup(late.promise,{signal,timeoutMs:5,optional:true});
  assert.equal(await timed,undefined);controller.abort(new Error('too late'));late.resolve('not adopted');
  assert.equal(await timed,undefined);assert.equal(listeners.size,0);assert.equal(timers.size,0);
});
