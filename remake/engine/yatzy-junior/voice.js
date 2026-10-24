const ASSET_ROOT=new URL('../../',import.meta.url);
const finiteTime=value=>Number.isFinite(value)&&value>=0?value:0;

/**
 * Native audio owns progression. A failed audible line waits for retry; only muted captions use dt. A line marked optional
 * ({ text, optional: true }: Fjölspil's, voice-lines.js MULTI_LINES) that has no recording yet is its caption alone for the time
 * its words take, muted or not, and never reports itself unavailable: the owner records those himself, after the page has them.
 */
export function createJuniorVoice({lines={},manifest={},onLine=()=>{},onSpeaking=()=>{},onUnavailable=()=>{},AudioClass=globalThis.Audio}={}){
  const entries=new Map(Object.entries(lines).map(([id,line])=>[id,typeof line==='string'?{text:line,optional:false}:{text:line?.text,optional:line?.optional===true}]));
  let current=null,audio=null,busy=false,speaking=false,paused=false,muted=false,disposed=false;
  let generation=0,playAttempt=0,elapsed=0,mode='idle',reason=null,failure=null,pendingEnd=false,listeners=null;

  function setSpeaking(value){
    if(speaking===value)return;
    speaking=value;onSpeaking(value);
  }
  function isCurrent(record,token,clip){
    return !disposed&&current===record&&generation===token&&(clip===undefined||audio===clip);
  }
  function playbackTime(){return audio?finiteTime(audio.currentTime):elapsed;}
  function releaseAudio(){
    const previous=audio;audio=null;
    if(!previous)return;
    if(listeners){previous.removeEventListener('ended',listeners.ended);previous.removeEventListener('error',listeners.error);listeners=null;}
    previous.pause();
    // Release the old request/decoder. Its already queued events still have token guards.
    if(typeof previous.removeAttribute==='function')previous.removeAttribute('src');
    if(typeof previous.load==='function')previous.load();
  }
  function complete(){
    if(!current||!busy)return;
    if(paused){pendingEnd=true;setSpeaking(false);return;}
    const record=current,token=generation,callback=record.completed?null:record.onEnd;
    record.completed=true;record.onEnd=null;busy=false;pendingEnd=false;playAttempt++;
    elapsed=record.duration;releaseAudio();mode='ended';setSpeaking(false);
    if(isCurrent(record,token)&&typeof callback==='function')callback(record.id);
  }
  function selectFailureMode(){
    const record=current,token=generation;
    mode=muted?'fallback':'unavailable';setSpeaking(muted&&!paused);
    if(!isCurrent(record,token)||!busy)return;
    if(mode==='unavailable')onUnavailable({...failure});
    else if(!paused&&elapsed>=record.duration)complete();
  }
  function fallback(why){
    if(!current||!busy)return;
    const record=current,at=playbackTime();
    failure={id:record.id,reason:why,mediaCode:audio?.error?.code??null,mediaMessage:audio?.error?.message??null};
    console.warn('[junior-voice] Narration could not play',{...failure});
    playAttempt++;releaseAudio();
    elapsed=Math.min(record.duration,at);reason=why;selectFailureMode();
  }
  // An optional line not recorded yet: expected, so no warning and no failure for the sound button to turn into "unavailable".
  function captionOnly(){mode='fallback';reason='unrecorded';setSpeaking(!paused);}
  function requestPlay(){
    if(!audio||!current||!busy||paused)return;
    const clip=audio,record=current,token=generation,attempt=++playAttempt;
    mode='pending';setSpeaking(false);
    if(!isCurrent(record,token,clip)||paused)return;
    let result;
    try{result=clip.play();}catch(error){if(isCurrent(record,token,clip)&&attempt===playAttempt)fallback(error?.name||'play-error');return;}
    Promise.resolve(result).then(()=>{
      if(!isCurrent(record,token,clip)||attempt!==playAttempt||!busy||paused)return;
      mode='audio';reason=null;setSpeaking(true);
    },error=>{
      if(!isCurrent(record,token,clip)||attempt!==playAttempt||!busy||paused)return;
      fallback(error?.name||'play-error');
    });
  }
  function start(record){
    generation++;playAttempt++;releaseAudio();
    current=record;busy=true;elapsed=0;mode='pending';reason=null;failure=null;pendingEnd=false;
    const token=generation;setSpeaking(false);
    if(!isCurrent(record,token))return false;
    onLine(record.id,record.text);
    if(!isCurrent(record,token))return false;
    const unrecorded=typeof record.asset.src!=='string'||!record.asset.src;
    if(unrecorded&&record.optional){captionOnly();return true;}
    if(typeof AudioClass!=='function'){fallback('audio-unavailable');return true;}
    if(unrecorded){fallback('asset-unavailable');return true;}
    try{
      const src=new URL(record.asset.src,ASSET_ROOT).href,clip=new AudioClass(src);
      audio=clip;clip.src=src;clip.preload='auto';clip.muted=muted;
      listeners={
        ended(){if(isCurrent(record,token,clip)&&busy)complete();},
        error(){if(isCurrent(record,token,clip)&&busy)fallback('media-error');},
      };
      clip.addEventListener('ended',listeners.ended);clip.addEventListener('error',listeners.error);
      if(!paused)requestPlay();
    }catch(error){if(isCurrent(record,token))fallback(error?.name||'audio-error');}
    return true;
  }
  function say(id,{onEnd}={}){
    if(disposed||!entries.has(id)||typeof entries.get(id).text!=='string')return false;
    const {text,optional}=entries.get(id),asset=manifest[id]||{},words=text.trim().split(/\s+/).filter(Boolean).length;
    const duration=Number.isFinite(asset.duration)&&asset.duration>0?asset.duration:Math.min(20,Math.max(2,.5+words*.45));
    return start({id,text,optional,asset,duration,onEnd:typeof onEnd==='function'?onEnd:null,completed:false});
  }
  function replay(){return !disposed&&current?start(current):false;}
  function stop(){
    generation++;playAttempt++;releaseAudio();current=null;busy=false;elapsed=0;mode='idle';reason=null;failure=null;pendingEnd=false;setSpeaking(false);
  }
  function pause(value){
    if(disposed||paused===Boolean(value))return;
    paused=Boolean(value);
    if(paused){playAttempt++;audio?.pause();setSpeaking(false);}
    else if(busy){if(pendingEnd)complete();else if(audio)requestPlay();else if(mode==='fallback')setSpeaking(true);}
  }
  function mute(value){
    if(disposed||muted===Boolean(value))return;
    muted=Boolean(value);if(audio)audio.muted=muted;
    if(busy&&failure&&(mode==='fallback'||mode==='unavailable'))selectFailureMode();
  }
  function update(dt){
    if(disposed||!busy||paused||mode!=='fallback'||!Number.isFinite(dt)||dt<=0)return;
    elapsed=Math.min(current.duration,elapsed+dt);if(elapsed>=current.duration)complete();
  }
  function mouth(){
    if(!speaking||!current||typeof current.asset.mouth!=='string')return 0;
    const sample=current.asset.mouth[Math.floor(playbackTime()*20)];
    return sample&&/^[0-9a-f]$/i.test(sample)?parseInt(sample,16)/15:0;
  }
  return {
    say,replay,stop,pause,mute,update,
    get speaking(){return speaking;},get busy(){return busy;},get currentId(){return current?.id??null;},get mouth(){return mouth();},get unavailable(){return mode==='unavailable';},
    getDebugState:()=>({currentId:current?.id??null,busy,speaking,paused,muted,mode,reason,failure:failure?{...failure}:null,elapsed:playbackTime(),duration:current?.duration??0,mouth:mouth(),completed:current?.completed??false,pendingEnd}),
    dispose(){if(disposed)return;disposed=true;stop();},
  };
}
