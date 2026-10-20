import {createAudioContext,createOutput} from '../audio/output.js';

// Original small Web Audio foley, through the REMAKE's shared limiter convention.
export function createYatzyAudio(){
  let context=null,output=null,muted=false,paused=false,disposed=false,noise=null;
  const voices=new Set(),last=new Map();let played=0;
  function initialize(){
    if(disposed)return false;if(!context){context=createAudioContext();if(!context)return false;output=createOutput(context);noise=context.createBuffer(1,Math.ceil(context.sampleRate*.22),context.sampleRate);const data=noise.getChannelData(0);let seed=37;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.exp(-i/data.length*5);}}
    return true;
  }
  function playVoice({hz=300,end=hz,duration=.1,level=.08,type='sine',delay=0,noisy=false,pan=0}={}){
    if(!context||muted||paused||disposed||voices.size>=28)return;
    const start=context.currentTime+delay,source=noisy?context.createBufferSource():context.createOscillator(),gain=context.createGain(),panner=context.createStereoPanner();
    const filter=noisy?context.createBiquadFilter():null;
    if(noisy){source.buffer=noise;filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=.8;source.connect(filter);filter.connect(gain);}else{source.type=type;source.frequency.setValueAtTime(hz,start);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+duration);source.connect(gain);}
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    panner.pan.value=Math.max(-.8,Math.min(.8,pan));gain.connect(panner);panner.connect(output);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();filter?.disconnect();};source.start(start);source.stop(start+duration+.015);played++;
  }
  function cue(kind,{strength=1,pan=0,index=0}={}){
    if(!context||muted||paused)return;const now=context.currentTime,gap=kind==='impact'?.028:kind==='rattle'?.045:.06;if(now-(last.get(kind)??-10)<gap)return;last.set(kind,now);
    const tone=(hz,duration,level,extra={})=>playVoice({hz,duration,level:level*strength,pan,...extra});
    if(kind==='impact'||kind==='rattle'){
      tone(kind==='rattle'?2300:1250,.045,.045,{noisy:true});tone(kind==='rattle'?980:330,.065,.055,{end:kind==='rattle'?700:170,type:'triangle'});
      if(kind==='rattle')tone(1700,.055,.025,{delay:.02});
    }else if(kind==='cup'){tone(370,.07,.035,{noisy:true});tone(160,.1,.065,{end:85,type:'triangle'});}
    else if(kind==='hold'){tone([523,587,659,784,880][index%5],.25,.065);tone([523,587,659,784,880][index%5]*2,.15,.022);}
    else if(kind==='release'||kind==='tap'){tone(420,.065,.035,{end:240,type:'triangle'});}
    else if(kind==='sweep'){tone(1700,.10,.02,{noisy:true});}
    else if(kind==='settle'){tone(660,.035,.012,{noisy:true});}
    else if(kind==='good'||kind==='great'){const notes=kind==='great'?[523,659,880]:[659,784];notes.forEach((hz,i)=>tone(hz,.23,.045,{delay:i*.085}));}
    else if(kind==='bad'){tone(294,.18,.035,{end:245,type:'triangle'});tone(220,.20,.025,{delay:.14,type:'triangle'});}
    else if(kind==='near'){tone(440,.16,.025,{end:494});}
    else if(kind==='score'||kind==='win'){const notes=kind==='win'?[523,659,784,1046,1318]:[659,784,1046];notes.forEach((hz,i)=>tone(hz,.42,.06,{delay:i*.1}));}
    else if(kind==='turn'){tone(392,.2,.04);tone(523,.26,.04,{delay:.11});}
  }
  function cancel(){const active=[...voices];voices.clear();for(const voice of active)try{voice.stop();}catch{}last.clear();}
  return{unlock(){if(initialize()&&!paused&&!muted)context.resume().catch(()=>{});},cue,mute(value){if(disposed)return;muted=Boolean(value);if(muted)cancel();else if(context&&!paused)context.resume().catch(()=>{});},pause(value){if(disposed)return;paused=Boolean(value);if(!context)return;if(paused)context.suspend().catch(()=>{});else if(!muted)context.resume().catch(()=>{});},cancel,getStats:()=>({voices:voices.size,played,muted,paused,state:context?.state||'uninitialized'}),dispose(){if(disposed)return;disposed=true;cancel();context?.close().catch(()=>{});output?.disconnect();}};
}
