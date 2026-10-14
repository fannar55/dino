import {SAVE_KEY, freshProgress, restoreProgress, evolve} from './progress.js';
import {SPECIES, NARRATION, ENCOUNTERS, displayText} from './story.js';
import {ADVENTURES,DISCOVERY_CARDS} from './adventure-content.js';
import {discoveryIllustration,discoveryProgressIcon} from './discovery-illustrations.js';
import {emptyAdventure,starCount,adventureScore,MAX_STARS} from './exploration.js';
import {createCelebration} from './celebration-vfx.js';
import {createDinosaurClub} from './dinosaur-club.js';
import {statueCount} from './mini-progress.js';
const $ = id => document.getElementById(id);
const localPreview = ['127.0.0.1','localhost'].includes(location.hostname);
// Older previews installed the offline worker locally. Retire that worker so
// subsequent development reloads show the files actually being reviewed.
if(localPreview&&'serviceWorker'in navigator){
 try{
  const registrations=await navigator.serviceWorker.getRegistrations();
  const local=registrations.filter(reg=>new URL(reg.scope).origin===location.origin);
  const removed=await Promise.all(local.map(reg=>reg.unregister()));
  if(removed.some(Boolean)&&navigator.serviceWorker.controller)location.reload();
 }catch{/* Restricted browser profiles may disable workers; the game is still usable. */}
}
const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
let audio, world, club, state=freshProgress(), saved=null, started=false, epoch=0, lastNarration='welcome', inspectId=null, pending=new Set(), speakingId=0;
let hotspotFrame=0;
let findingCard=null,findingSequence=0,findingRequest=null,findingReturn=null,activityReady=false,returningRide=false,callExplained=false,callSequence=0,callPending=false;
let clubReturn=null;
const celebration=createCelebration($('celebration'),{target:()=>{const r=$('stars').getBoundingClientRect();return{x:(r.left+r.width/2)/innerWidth,y:(r.top+r.height/2)/innerHeight};}});
try{saved=restoreProgress(localStorage.getItem(SAVE_KEY));}catch{}
if(saved)$('start').querySelector('span').textContent='Höldum áfram, Egill!';
function save(){if(started)try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{}}
function modalOpen(){return $('book-dialog').open||$('adult-dialog').open||$('finding-dialog').open||$('club-dialog').open;}
function cancelFlow(){epoch++;speakingId++;findingSequence++;findingRequest=null;findingReturn=null;callSequence++;callPending=false;audio?.stopNarration();audio?.stopCelebration?.();celebration.clear();$('reward-status').textContent='';for(const stop of pending)stop();pending.clear();}
function waitActive(ms){
 return new Promise(resolve=>{let remaining=ms,last=performance.now(),timer,done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);pending.delete(stop);resolve(value);};
  const stop=()=>finish(false);pending.add(stop);
  const tick=()=>{const now=performance.now();if(!document.hidden&&!modalOpen())remaining-=Math.min(now-last,250);last=now;if(remaining<=0)finish(true);else timer=setTimeout(tick,100);};
  timer=setTimeout(tick,100);
 });
}
async function speak(id,{hide=false,delay=0}={}){
 const token=++speakingId,flow=epoch,text=NARRATION[id];if(!text)return;
 lastNarration=id;$('speech-text').textContent=displayText(text);$('speech').hidden=false;$('speech').classList.add('speaking');
 // Give a newly earned star its own short musical moment. A newer action or
 // scene cancels this deferred line, and book/background pauses hold the delay.
 if(delay){audio?.stopNarration();if(!await waitActive(delay)||flow!==epoch||token!==speakingId)return;}
 const spoken=Promise.resolve(audio?.narrate(id,text)).catch(()=>false);
 // Muted/unavailable narration still gives enough time to read before automatic travel.
 const result=await spoken;
 if(!result&&flow===epoch&&token===speakingId)await waitActive(Math.max(2600,text.split(/\s+/).length*220));
 if(flow!==epoch||token!==speakingId)return;
 $('speech').classList.remove('speaking');if(hide)$('speech').hidden=true;
}
function action(label,callback,{soft=false,symbol='arrow'}={}){
 const b=document.createElement('button');b.className='button'+(soft?' soft':'');b.innerHTML=`<span>${label}</span>${symbol?icon(symbol):''}`;
 b.addEventListener('click',()=>{if(modalOpen())return;audio?.effect('tap');callback();});$('actions').append(b);return b;
}
function updateStars(){const count=starCount(state);$('star-count').textContent=count;$('stars').hidden=!started;$('stars').setAttribute('aria-label',`${count} af ${MAX_STARS} stjörnum`);}
function reward({finale=false}={}){updateStars();celebration.burst({x:.5,y:.34,finale});world?.celebrate();audio?.celebrate?.({species:state.exploring||ENCOUNTERS[state.index].species,final:finale,stars:1});$('stars').classList.remove('earned');requestAnimationFrame(()=>$('stars').classList.add('earned'));$('reward-status').textContent=`Stjarna fundin! ${starCount(state)} af ${MAX_STARS} stjörnum.`;}
function dispatch(event){const before=starCount(state);state=evolve(state,event);save();const earned=starCount(state)>before;render({rewardLead:earned});if(earned)reward();}
function view(encounter,mode){world?.setView({biome:encounter?.biome||'forest',species:mode==='intro'?null:encounter?.species||null,mode});audio?.setScene(encounter?.biome||'forest');audio?.setWalking(mode==='travel');}
function showDiscovery(id){const d=SPECIES[id];$('discovery-name').textContent=d.name;$('discovery-latin').textContent=d.latin||d.kind||'';$('discovery').hidden=false;}
function render({rewardLead=false}={}){
 cancelFlow();if(!started)return;const token=epoch,stage=state.stage,e=ENCOUNTERS[state.index];
 $('app').dataset.stage=inspectId?'inspect':stage;$('repeat').hidden=stage==='travel';$('entrance').hidden=true;$('wordmark').hidden=true;$('trail').hidden=false;$('stage-ui').hidden=false;
 $('actions').replaceChildren();$('actions').className='actions';$('discovery').hidden=true;$('speech').hidden=true;$('activity-hud').hidden=true;$('look-hint').hidden=true;$('world-hotspots').hidden=true;cancelAnimationFrame(hotspotFrame);$('world-hotspots').replaceChildren();$('book-dot').hidden=state.found.length===0;updateStars();
 $('trail').innerHTML=ENCOUNTERS.map((item,i)=>`<i class="${state.found.includes(item.species)?'found':i===state.index?'current':''}"></i>`).join('');
 $('trail').setAttribute('aria-label',`${state.found.length} af ${ENCOUNTERS.length} dýrum fundin`);
 if(state.exploring){renderAdventure({rewardLead});return;}
 world?.clearActivity?.();
 if(inspectId){const found=ENCOUNTERS.find(item=>item.species===inspectId);view(found,'encounter');showDiscovery(inspectId);void speak(found.correct,{hide:true});action('Spila með vini',()=>openClub(inspectId),{symbol:'play'});action('Leita',()=>{const id=inspectId;inspectId=null;dispatch({type:'EXPLORE',species:id});},{soft:true,symbol:'star'});action('Til baka',()=>{inspectId=null;if(state.stage==='complete')openBook();else render();},{soft:true,symbol:''});return;}
 if(stage==='welcome'||stage==='invite'){
  view(null,'intro');void speak(stage);action(stage==='welcome'?'Já!':'Já, förum!',()=>dispatch({type:'START'}));
  if(stage==='welcome')action('Nei',()=>dispatch({type:'DECLINE'}),{soft:true,symbol:''});
 }else if(stage==='travel'){
  view(e,'travel');void(async()=>{
   await Promise.all([speak(e.travel,{hide:true}),waitActive(e.biome==='sky'?4500:6500)]);
   if(token!==epoch)return;audio?.setWalking(false);$('app').dataset.stage='arrival';
   const [arrival]=await Promise.all([world.arrive({biome:e.biome,species:e.species}),speak(e.arrival,{hide:true})]);
   if(token===epoch&&arrival.completed&&!arrival.cancelled)dispatch({type:'ARRIVE'});
  })();
 }else if(stage==='question'||stage==='hint'){
  view(e,'encounter');void speak(stage==='hint'?e.hint:e.question);
  const choices=e.choices.filter(id=>!state.eliminated.includes(id));
  for(const [i,id] of choices.entries()){
   const d=SPECIES[id],wrap=document.createElement('div');wrap.className='choice-wrap';
   const b=document.createElement('button');b.className='choice';b.dataset.species=id;b.setAttribute('aria-label',d.name+(d.latin?' — '+d.latin:''));
   b.innerHTML=`<span class="number">${i+1}</span><span class="choice-label"><strong>${d.name}</strong><small>${d.latin||d.kind||''}</small></span>`;
   b.addEventListener('click',()=>{if(modalOpen()||!['question','hint'].includes(state.stage))return;const right=id===e.species;if(!right)audio?.effect('tap');if(right)world?.celebrate();dispatch({type:'ANSWER',species:id});});
   const listen=document.createElement('button');listen.className='name-audio';listen.setAttribute('aria-label','Heyra nafnið '+d.name);listen.innerHTML=icon('sound');listen.addEventListener('click',()=>{if(!modalOpen())void speak('name_'+id);});
   wrap.append(b,listen);$('actions').append(wrap);
  }
 }else if(stage==='correct'){
  view(e,'encounter');showDiscovery(e.species);void speak(e.correct,{hide:true,delay:rewardLead?1050:0});action('Leikum og leitum!',()=>dispatch({type:'EXPLORE',species:e.species}),{symbol:'star'});action('Spila með vini',()=>openClub(e.species),{soft:true,symbol:'play'});
 }else if(stage==='complete'){
  view({biome:'lake'},'complete');void speak('finish',{hide:true});action('Skoðum stjörnurnar!',openBook,{symbol:'book'});
 }
}
function renderAdventure({rewardLead=false}={}){
 const id=state.exploring,a=ADVENTURES[id],e=ENCOUNTERS.find(item=>item.species===id),data=state.adventures[id]||emptyAdventure(),phase=state.explorePhase;
 $('app').dataset.stage='explore';$('repeat').hidden=false;view(e,'encounter');
 if(phase==='explore'){
  activityReady=false;returningRide=false;
  const ready=world?.setActivity?.({species:id,foundTargets:data.targets,secretFound:data.secret,completed:data.targets.length===a.targets.length});
  startHotspots(a);
  $('activity-hud').hidden=false;updateActivityHud();
  const flow=epoch;
  void Promise.resolve(ready).then(async result=>{
   if(flow!==epoch||result?.cancelled||state.exploring!==id)return;
   activityReady=true;adventureActions();$('look-hint').hidden=false;
   const introduction=id===ENCOUNTERS[0].species&&!data.targets.length&&!data.secret;
   if(introduction){for(const line of ['adventureIntro',a.instruction,'explorationDragHelp']){if(flow!==epoch||state.adventures[id]?.targets.length||state.adventures[id]?.secret)break;const narration=speak(line,{hide:true}),voice=speakingId;await narration;if(flow!==epoch||voice!==speakingId)break;}}
   else if(!world?.getActivityState?.()?.kind)void speak(data.targets.length===a.targets.length?a.complete:a.instruction,{hide:true});
   if(await waitActive(6500)&&flow===epoch)$('look-hint').hidden=true;
  });
  adventureActions();
 }else{
  world?.clearActivity?.();$('activity-hud').hidden=true;
  const answered=phase==='bonusCorrect';void speak(answered?a.bonusCorrect:phase==='bonusHint'?a.bonusHint:a.bonusQuestion,{hide:answered,delay:rewardLead?1050:0});
  if(answered){action('Leitum meira',()=>dispatch({type:'BACK_TO_EXPLORE'}),{soft:true,symbol:'star'});action('Áfram',leaveAdventure);}
  else for(const choice of a.bonus.choices.filter(c=>!data.eliminated.includes(c.id))){
    const wrap=document.createElement('div');wrap.className='choice-wrap';const b=document.createElement('button');b.className='choice bonus-choice';b.dataset.bonus=choice.id;b.innerHTML=`<span class="choice-label"><strong>${choice.label}</strong></span>`;
    b.addEventListener('click',()=>{if(modalOpen())return;dispatch({type:'BONUS_ANSWER',id:choice.id});});
    const listen=document.createElement('button');listen.className='name-audio';listen.setAttribute('aria-label','Heyra svarið '+choice.label);listen.innerHTML=icon('sound');listen.addEventListener('click',()=>{if(!modalOpen()&&choice.narration)void speak(choice.narration);});wrap.append(b,listen);$('actions').append(wrap);
  }
 }
}
function updateActivityHud(foundId=null){
 const a=ADVENTURES[state.exploring],data=state.adventures[state.exploring]||emptyAdventure();
 const kind=a.targets[0].kind,hud=$('activity-hud'),tokens=$('fossil-progress'),complete=data.targets.length===a.targets.length;
 const labels={fossil:'Steinar fundnir',leaf:'Lauf fundin',footprint:'Spor fundin',fish:'Fiskar fundnir',reed:'Strá fundin',windring:'Hringir fundnir'};
 hud.classList.add('collection-hud');hud.classList.toggle('fossil-hud',kind==='fossil');tokens.hidden=false;
 $('activity-title').textContent=labels[kind];$('activity-count').textContent=`${data.targets.length} / ${a.targets.length}`;
 $('activity-count').setAttribute('aria-label',`${labels[kind]}: ${data.targets.length} af ${a.targets.length}. ${data.secret?'Leynidýrið er fundið.':'Leynidýr er enn falið.'}`);
 $('activity-card').disabled=!complete;$('activity-card-icon').hidden=!complete;$('activity-card').setAttribute('aria-label',`Skoða uppgötvunina: ${DISCOVERY_CARDS[kind]?.title||labels[kind]}`);
 // Filled pictures follow saved target IDs, including partial sessions and replays.
 tokens.innerHTML=a.targets.map(target=>`<span class="collection-token${kind==='fossil'?' fossil-token':''}${data.targets.includes(target.id)?' found':''}${target.id===foundId?' just-found':''}" data-stone="${target.id}" data-kind="${kind}">${discoveryProgressIcon(kind)}<i>✓</i></span>`).join('');
}
function startHotspots(a){
 const container=$('world-hotspots');container.hidden=false;
 for(const target of [...a.targets,a.secret]){
  const button=document.createElement('button');button.className='world-target';button.dataset.target=target.id;button.hidden=true;
  let gesture=null,suppressClick=false;
  button.setAttribute('aria-label',target.label);
  button.addEventListener('pointerdown',event=>{if(modalOpen()||event.isPrimary===false)return;gesture={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};suppressClick=false;button.setPointerCapture?.(event.pointerId);});
  button.addEventListener('pointermove',event=>{if(!gesture)return;const dx=event.clientX-gesture.lastX,dy=event.clientY-gesture.lastY;gesture.moved ||= Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>10;if(gesture.moved){world?.panExploration?.(dx,dy);$('look-hint').hidden=true;}gesture.lastX=event.clientX;gesture.lastY=event.clientY;});
  button.addEventListener('pointerup',()=>{suppressClick=!!gesture?.moved;gesture=null;});
  button.addEventListener('pointercancel',()=>{gesture=null;suppressClick=true;});
  button.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}if(!modalOpen()&&activityReady&&!world?.getActivityState?.()?.busy)world?.activateDiscovery?.(target.id);});container.append(button);
 }
 function sync(){
  if(container.hidden)return;
  if(!document.hidden)for(const point of world?.getDiscoveryScreenPositions?.()||[]){
    const button=container.querySelector(`[data-target="${point.id}"]`);if(!button)continue;
    button.hidden=!point.visible||!activityReady||!!world?.getActivityState?.()?.busy;button.classList.toggle('found',point.found);
    button.style.left=`${point.screen.x*100}%`;button.style.top=`${point.screen.y*100}%`;
    const size=Math.max(48,Math.min(112,(point.radius||32)*2));button.style.width=`${size}px`;button.style.height=`${size}px`;
  }
  hotspotFrame=requestAnimationFrame(sync);
 }
 hotspotFrame=requestAnimationFrame(sync);
}
function adventureActions(){
 const a=ADVENTURES[state.exploring],data=state.adventures[state.exploring]||emptyAdventure();$('actions').replaceChildren();$('actions').className='actions activity-actions';
 const ride=world?.getActivityState?.();
 if(returningRide||ride?.busy)return;
 const fullActionRow=data.targets.length===a.targets.length&&!data.bonus&&!data.secret;
 if(ride?.canReturn&&!fullActionRow)action('Niður til Mosa',()=>void returnFromRide(),{soft:true,symbol:''}).classList.add('ride-return');
 if(!fullActionRow&&['brachiosaurus','pteranodon'].includes(state.exploring)&&(!ride?.kind||ride.phase==='complete')&&world?.replayActivityRide)action(state.exploring==='pteranodon'?'Fljúgum aftur':'Upp í trén',()=>void replayRide(),{soft:true,symbol:''});
 if(data.targets.length===a.targets.length){
  if(!data.bonus)action('Spurning',()=>void afterRide(()=>dispatch({type:'ASK_BONUS'})),{symbol:''});
  action('Áfram',leaveAdventure,{soft:!data.bonus,symbol:''});
 }else action('Sýndu mér',hintAdventure,{soft:true,symbol:''});
 if(data.targets.length===a.targets.length&&!data.secret)action('Leita',hintAdventure,{soft:true,symbol:''});
}
async function hintAdventure(){
 const a=ADVENTURES[state.exploring],data=state.adventures[state.exploring]||emptyAdventure();
 const missing=a.targets.find(target=>!data.targets.includes(target.id));
 const ride=world?.getActivityState?.(),flow=epoch;
 if(missing&&['brachiosaurus','pteranodon'].includes(state.exploring)&&(!ride?.kind||ride.phase==='complete')&&world?.replayActivityRide){await replayRide();if(flow!==epoch)return;}
 if(!missing&&ride?.canReturn){if(!await returnFromRide()||flow!==epoch)return;}
 void world?.focusDiscovery?.(missing?.id||a.secret.id);void speak(missing?a.instruction:a.secretHint,{hide:true});
}
async function returnFromRide(){
 if(returningRide)return false;
 const flow=epoch;returningRide=true;adventureActions();$('look-hint').hidden=true;
 const result=await Promise.resolve(world?.finishActivityRide?.());
 if(flow!==epoch||result?.cancelled)return false;
 returningRide=false;activityReady=true;adventureActions();return true;
}
async function afterRide(callback){if(await returnFromRide())callback();}
async function replayRide(){
 if(modalOpen()||returningRide)return;const flow=epoch;activityReady=false;
 const promise=world?.replayActivityRide?.();adventureActions();
 const result=await Promise.resolve(promise);if(flow!==epoch||result?.cancelled)return;activityReady=true;adventureActions();
}
async function leaveAdventure(){
 const id=state.exploring;if(!await returnFromRide())return;
 world?.clearActivity?.();state=evolve(state,{type:'LEAVE_EXPLORE'});inspectId=null;
 if(state.stage==='correct'&&ENCOUNTERS[state.index].species===id){const last=state.index===ENCOUNTERS.length-1;dispatch({type:'NEXT'});if(last){celebration.burst({finale:true});audio?.celebrate?.({final:true,stars:starCount(state)});}}
 else{save();render();openBook();}
}
function discover(event){
 if(!started||modalOpen()||!state.exploring||state.explorePhase!=='explore')return;
 const a=ADVENTURES[state.exploring],before=starCount(state),old=state.adventures[state.exploring]||emptyAdventure();
 if(event.id!==a.secret.id&&!a.targets.some(target=>target.id===event.id))return;
 const repeated=event.id===a.secret.id?old.secret:old.targets.includes(event.id);
 audio?.effect(event.secret?'secret':event.kind);
 // Each reed keeps its own note, including after its star has been earned.
 if(event.kind==='reed')audio?.star?.({index:a.targets.findIndex(target=>target.id===event.id),total:a.targets.length,pan:event.pan});
 if(repeated){if(event.secret||event.kind!=='reed'&&old.targets.length===a.targets.length)void queueFinding(event.kind);return;}
 state=evolve(state,{type:'COLLECT',id:event.id});save();const data=state.adventures[state.exploring];
 world?.updateActivityProgress?.({foundTargets:data.targets,secretFound:data.secret});
 updateActivityHud(event.secret?null:event.id);adventureActions();
 const earned=starCount(state)>before;
 if(earned){speakingId++;audio?.stopNarration();$('speech').hidden=true;reward();}
 else if(event.kind!=='reed')audio?.star?.({index:data.targets.length-1,total:a.targets.length,pan:event.pan});
 if(event.secret||data.targets.length===a.targets.length)void queueFinding(event.kind,earned?2400:650);
}
async function queueFinding(kind,delay=0){
 const card=DISCOVERY_CARDS[kind];if(!card||findingRequest?.kind===kind&&findingRequest.flow===epoch)return;
 const sequence=++findingSequence,flow=epoch,request={kind,flow};findingRequest=request;
 if(delay&&!await waitActive(delay)){if(findingRequest===request)findingRequest=null;return;}
 if(findingRequest===request)findingRequest=null;
 if(sequence!==findingSequence||flow!==epoch||modalOpen())return;
 findingCard=card;callSequence++;callPending=false;speakingId++;audio?.stopNarration();$('speech').hidden=true;
 const a=ADVENTURES[state.exploring],ride=world?.getActivityState?.();
 findingReturn=a?.targets[0].kind===kind&&ride?.canReturn?{flow,species:state.exploring}:null;
 $('finding-back-label').textContent=findingReturn?'Niður til Mosa':'Áfram að kanna';
 $('finding-title').textContent=card.title;$('finding-subtitle').textContent=card.subtitle||'';
 $('finding-story').textContent=displayText(NARRATION[card.narration]||'');$('finding-art').innerHTML=discoveryIllustration(card.art||kind);
 world?.setPaused(true);celebration.setPaused(true);$('finding-dialog').showModal();void narrateFinding();
}
async function narrateFinding(){if(!findingCard)return;audio?.stopNarration();await audio?.narrate(findingCard.narration,NARRATION[findingCard.narration]);}
function closeFinding(){
 const landing=findingReturn;findingReturn=null;findingSequence++;findingRequest=null;findingCard=null;audio?.stopNarration();$('finding-dialog').close();
 world?.setPaused(false);celebration.setPaused(false);$('speech').hidden=true;
 if(landing&&landing.flow===epoch&&landing.species===state.exploring&&world?.getActivityState?.()?.canReturn)void returnFromRide();
}
$('activity-card').addEventListener('click',()=>{const a=ADVENTURES[state.exploring];if(!modalOpen()&&state.explorePhase==='explore'&&a&&state.adventures[state.exploring]?.targets.length===a.targets.length)void queueFinding(a.targets[0].kind);});
function activityEvent(event){
 if(!started||!state.exploring)return;
 if(event.type==='step'||event.type==='wing'){if(!modalOpen())audio?.arrival?.(event);return;}
 const ids=event.kind==='canopy'?{invite:'rideBrachioInvite',pickup:'rideBrachioAscent',ready:'rideBrachioTop',return:'rideBrachioReturn'}:{invite:'ridePteraInvite',pickup:'ridePteraTakeoff',ready:'adventure_ptera_instruction',return:'ridePteraLanding'};
 const id=ids[event.type];if(id&&!modalOpen())void speak(id,{hide:true});
 if(event.type==='ready'||event.type==='landed'){activityReady=true;adventureActions();}
}
$('close-finding').addEventListener('click',closeFinding);$('finding-back').addEventListener('click',closeFinding);$('finding-listen').addEventListener('click',()=>void narrateFinding());$('finding-dialog').addEventListener('cancel',event=>{event.preventDefault();closeFinding();});
function fullscreen(){try{const request=document.documentElement.requestFullscreen?.();request?.catch(()=>{});}catch{}}
$('start').addEventListener('click',()=>{if(started||!world)return;audio?.unlock();fullscreen();state=saved||freshProgress();started=true;save();render();});
$('sound').addEventListener('click',()=>{audio?.unlock();audio?.setMuted(!audio.isMuted());const muted=audio?.isMuted();$('sound').innerHTML=icon(muted?'muted':'sound');$('sound').setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');$('sound').setAttribute('aria-pressed',String(muted));try{localStorage.setItem('stjornufar.muted',String(muted));}catch{}});
$('repeat').addEventListener('click',()=>{if(!modalOpen()&&state.stage!=='travel')void speak(lastNarration);});
// Preserve in-flight narration and entrance promises: closing the book continues
// at the same frame instead of making the animal enter a second time.
function pause(){audio?.setPaused(true);world?.setPaused(true);celebration.setPaused(true);}
function resume(redraw=false){
 audio?.setPaused(false);world?.setPaused(false);celebration.setPaused(false);
 const expected=state.exploring?'explore':inspectId?'inspect':state.stage,current=$('app').dataset.stage;
 const continuingArrival=expected==='travel'&&current==='arrival';
 if(started&&(redraw||current!==expected&&!continuingArrival))render();
}
function openBook(){
 pause();$('collection').replaceChildren();$('book-empty').hidden=state.found.length>0;
 $('book-score').textContent=`★ ${starCount(state)} / ${MAX_STARS} stjörnur · Við getum alltaf leitað aftur!`;
 $('open-club').disabled=!started;$('club-count').textContent=`14 dýr · ${statueCount(state)} / 6 styttur`;
 for(const id of state.found){const d=SPECIES[id],b=document.createElement('button');b.innerHTML=`<strong>${d.name}</strong><small>${d.latin||d.kind}</small><span>${d.clue}</span><span class="collection-stars">${'★'.repeat(adventureScore(state,id))}${'☆'.repeat(4-adventureScore(state,id))}</span>`;b.addEventListener('click',()=>{state=evolve(state,{type:'LEAVE_EXPLORE'});inspectId=id;save();$('book-dialog').close();resume(true);});$('collection').append(b);}
 $('book-dialog').showModal();
}
function closeBook(){$('book-dialog').close();resume();}
$('book').addEventListener('click',openBook);$('close-book').addEventListener('click',closeBook);$('back-game').addEventListener('click',closeBook);
$('book-dialog').addEventListener('cancel',e=>{e.preventDefault();closeBook();});
function openClub(species=null){
 if(!started||!club||species&&!state.found.includes(species))return;
 clubReturn={epoch,hidden:$('speech').hidden,text:$('speech-text').textContent};
 $('book-dialog').close();findingSequence++;findingRequest=null;callSequence++;callPending=false;speakingId++;
 audio?.stopNarration();audio?.setPaused(false);audio?.setWalking(false);$('speech').hidden=true;
 world?.setPaused(true);celebration.clear();celebration.setPaused(true);
 if(species)club.invite(species);else club.collection();
}
$('open-club').addEventListener('click',()=>openClub());
$('adult').addEventListener('click',()=>{$('book-dialog').close();$('adult-dialog').showModal();});
function closeAdult(){cancelHold();$('adult-dialog').close();resume();}
$('close-adult').addEventListener('click',closeAdult);$('adult-dialog').addEventListener('cancel',e=>{e.preventDefault();closeAdult();});$('fullscreen').addEventListener('click',fullscreen);
let holdStart=null,holdRaf=0;
function cancelHold(){cancelAnimationFrame(holdRaf);holdRaf=0;holdStart=null;$('restart').style.setProperty('--hold','0%');}
function tickHold(t){if(holdStart===null)holdStart=t;const progress=Math.min((t-holdStart)/3000,1);$('restart').style.setProperty('--hold',`${progress*100}%`);if(progress<1)holdRaf=requestAnimationFrame(tickHold);else{cancelHold();club?.resetPuzzles?.();state=freshProgress();saved=null;inspectId=null;started=true;save();$('adult-dialog').close();resume(true);}}
$('restart').addEventListener('pointerdown',e=>{e.preventDefault();$('restart').setPointerCapture?.(e.pointerId);if(!holdRaf)holdRaf=requestAnimationFrame(tickHold);});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('restart').addEventListener(ev,cancelHold);
$('restart').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&!e.repeat){e.preventDefault();if(!holdRaf)holdRaf=requestAnimationFrame(tickHold);}});$('restart').addEventListener('keyup',cancelHold);window.addEventListener('blur',cancelHold);
$('reload').addEventListener('click',()=>location.reload());
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();cancelHold();}});window.addEventListener('pagehide',save);
function interact(id){
 if(!started||modalOpen()||state.stage==='travel'&&!state.exploring)return;
 if(id==='mosi'){audio?.animal?.('triceratops',{mood:'curious'});world?.celebrate();void speak('mosi',{hide:true});return;}
 if(state.found.includes(id)){audio?.animal?.(id,{mood:'curious'});openClub(id);return;}
 void world?.inspectAnimal?.(id);
 if(callPending)return;
 if(!callExplained){callPending=true;const flow=epoch,sequence=++callSequence;void(async()=>{const narration=speak('dinosaurCalls',{hide:true}),voice=speakingId;await narration;if(sequence===callSequence)callPending=false;if(flow===epoch&&sequence===callSequence&&voice===speakingId&&!modalOpen()){callExplained=true;audio?.animal?.(id,{mood:'curious'});}})();}
 else audio?.animal?.(id,{mood:'curious'});
}
try{
 const [{createWorld},{createAudio}]=await Promise.all([import('./world.js'),import('./audio.js')]);audio=createAudio();
 club=createDinosaurClub($('club-dialog'),{getState:()=>state,audio,speak:id=>audio.narrate(id,NARRATION[id]),onAward:species=>{state=evolve(state,{type:'WIN_MINIGAME',species});save();},onClose:()=>{audio.setPaused(false);audio.setWalking(state.stage==='travel'&&!state.exploring);const muted=audio.isMuted();$('sound').innerHTML=icon(muted?'muted':'sound');$('sound').setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');$('sound').setAttribute('aria-pressed',String(muted));resume();if(clubReturn?.epoch===epoch){$('speech').hidden=clubReturn.hidden;$('speech-text').textContent=clubReturn.text;$('speech').classList.remove('speaking');}clubReturn=null;}});
 try{audio.setMuted(localStorage.getItem('stjornufar.muted')==='true');}catch{}
 if(audio.isMuted()){$('sound').innerHTML=icon('muted');$('sound').setAttribute('aria-label','Kveikja á hljóði');$('sound').setAttribute('aria-pressed','true');}
 world=await createWorld($('world'),{onInteract:interact,onDiscovery:discover,onActivityEvent:activityEvent,onWorldTouch:event=>{if(started&&!modalOpen())audio?.worldTouch?.(event.kind,{pan:event.pan||0});},onArrivalEvent:event=>audio.arrival(event),onProgress:({loaded,total})=>{
  if(total>0){$('loading-progress').value=loaded/total;$('loading-progress').setAttribute('aria-valuetext',`${Math.round(loaded/total*100)}%`);}
 }});$('loading').hidden=true;$('start').disabled=false;
}catch(error){console.error('Skógurinn náði ekki að ræsa:',error);$('loading').hidden=true;$('fallback').hidden=false;}
if('serviceWorker'in navigator&&!localPreview){
 const registerOffline=()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});};
 // Model loading can finish after the page's load event has already fired.
 if(document.readyState==='complete')registerOffline();
 else window.addEventListener('load',registerOffline,{once:true});
}

