import {MATH_PROBLEMS,CLOUD_MATH_NARRATION} from './cloud-math-content.js';
export {MATH_PROBLEMS,CLOUD_MATH_NARRATION};

const safeRound=value=>Number.isSafeInteger(value)&&value>=0?value%10000:0;
function rng(seed){let n=(seed+1)*19349663;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function shuffle(values,random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function mathRound(round=0){
 round=safeRound(round);const random=rng(round),used=new Set(),ops=round%2?['−','+','−','+','−']:['+','−','+','−','+'];
 return ops.map((op,i)=>{const pool=MATH_PROBLEMS.filter(p=>p.op===op&&p.level===(i<2?1:2)&&!used.has(p.id));const chosen=pool[Math.floor(random()*pool.length)];used.add(chosen.id);return chosen;});
}
export function mathChoices(problem,round=0){
 const random=rng(safeRound(round)+problem.left*31+problem.right*13+(problem.op==='−'?53:0));
 const nearby=[problem.result-1,problem.result+1,problem.result-2,problem.result+2].filter(n=>n>=0&&n<=10&&n!==problem.result);
 return shuffle([problem.result,...shuffle(nearby,random).slice(0,2)],random);
}
export function createMathState(round=0){return{round:safeRound(round),index:0,correct:0,mistakes:0,rejected:[],phase:'answer',claimed:false};}
export function answerMath(state,value){
 const problem=mathRound(state.round)[state.index];
 if(state.phase!=='answer'||!mathChoices(problem,state.round+state.index).includes(value)||state.rejected.includes(value))return{state,accepted:false};
 if(value===problem.result)return{state:{...state,correct:state.correct+1,phase:'correct'},accepted:true,correct:true};
 const mistakes=state.mistakes+1;return{state:{...state,mistakes,rejected:[...state.rejected,value],phase:mistakes===5?'lost':'answer'},accepted:true,correct:false};
}
export function advanceMath(state){if(state.phase!=='correct'||state.correct===5)return state;return{...state,index:state.index+1,rejected:[],phase:'answer'};}
export function claimMath(state){return state.phase==='correct'&&state.correct===5&&!state.claimed?{...state,phase:'won',claimed:true}:state;}

const svg=(body,box='0 0 600 300')=>`<svg viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;
const fishSvg=()=>svg('<path d="m65 28 27-20-3 42-23-14" fill="#e7974e" stroke="#835630" stroke-width="3"/><ellipse cx="42" cy="30" rx="32" ry="20" fill="#f6c76d" stroke="#835630" stroke-width="3"/><path d="m39 33 14 13 1-22M29 15 36 6 49 12" fill="#fff0b0"/><path d="M55 17q-8 13 0 26" fill="none" stroke="#d78b46" stroke-width="3"/><circle cx="23" cy="26" r="6" fill="#fff8e5"/><circle cx="21" cy="26" r="3" fill="#34535a"/><path d="M12 35q5 5 10 0" fill="none" stroke="#835630" stroke-width="2.5" stroke-linecap="round"/>','0 0 100 60');
const puffSvg=()=>svg('<path d="M7 31C-1 23 4 12 14 14 14 0 36-1 39 13 52 6 61 26 48 32Z"/>','0 0 58 37');
const sceneArt=(portrait=false)=>svg(`
 <defs><linearGradient id="math-sky" x2="0" y2="1"><stop stop-color="#96cfdb"/><stop offset="1" stop-color="#edf1cc"/></linearGradient><linearGradient id="math-rock" x2="0" y2="1"><stop stop-color="#82a394"/><stop offset="1" stop-color="#4c716b"/></linearGradient></defs>
 <rect width="600" height="500" rx="24" fill="url(#math-sky)"/><circle cx="${portrait?346:520}" cy="45" r="29" fill="#fff0ab"/><g fill="#f3f8e7" opacity=".8"><path d="M12 77Q-1 49 27 49 28 19 55 29 78 12 90 47 111 42 118 66Z"/><path d="M258 43Q263 20 282 25 296 2 315 27 342 21 345 46Z"/><path d="M479 115Q462 89 489 80 495 50 521 68 550 53 564 80 588 68 609 104Z"/></g>
 <g transform="${portrait?'translate(-115 145) scale(.92)':''}"><path d="M33 280 98 156 156 244 239 137 334 253 409 158 570 297Z" fill="#9bbcb1" opacity=".4"/><path d="M89 259Q216 209 519 251L492 300H125Z" fill="url(#math-rock)"/><path d="M100 247Q303 211 525 246L510 260Q331 231 104 264Z" fill="#97b881"/></g>
 <g transform="${portrait?'translate(-5 25) scale(1.2)':''}">
 <g class="math-friend"><path d="M84 92Q47 89 19 115L51 119 39 154Q76 138 103 114L123 148 147 131 175 135Q152 109 125 99Z" fill="#d99360" stroke="#8a6851" stroke-width="3"/><path d="M85 96 55 117 40 147M116 103 143 129 171 133" fill="none" stroke="#efd298" stroke-width="3"/><ellipse cx="106" cy="99" rx="18" ry="30" fill="#e2b57c"/><path d="M107 61 82 23 119 45Q141 45 146 67L191 82 148 88Q123 86 108 73Z" fill="#d5a670" stroke="#8a6851" stroke-width="3"/><path d="m147 73 42 9-41 4" fill="#fae0a3"/><ellipse cx="132" cy="62" rx="9" ry="10" fill="#fff9dc"/><ellipse cx="135" cy="63" rx="4" ry="5" fill="#354d50"/><circle cx="136" cy="61" r="1.5" fill="#fff"/><path d="m100 125-5 13m17-13 5 11" stroke="#8a6851" stroke-width="4" stroke-linecap="round"/></g>
 </g><g transform="${portrait?'translate(0 -95) scale(1.3)':''}" class="math-shelter"><path d="M32 273 50 147" stroke="#6a875e" stroke-width="6"/><path d="M3 181Q42 104 109 162L61 160 24 183Z" fill="#709a66" stroke="#426f54" stroke-width="3"/><path d="m17 172 45-20 28 10" fill="none" stroke="#bed58f" stroke-width="3"/></g>
 <g transform="${portrait?'translate(-115 145) scale(.92)':''}">
 <ellipse cx="340" cy="173" rx="205" ry="73" fill="#ab7953" stroke="#795b43" stroke-width="5"/><ellipse cx="340" cy="162" rx="195" ry="65" fill="#dfbd80" stroke="#f2dca2" stroke-width="9"/>
 <g fill="none" stroke="#e1b375" stroke-width="6" stroke-linecap="round"><path d="M151 205Q331 269 525 200M153 192Q333 252 531 186M169 216 155 181M200 230 183 190M239 239 223 199M282 242 271 208M329 244 323 210M377 241 384 207M422 235 436 201M471 222 485 191M504 209 514 183"/></g>
 </g><g transform="${portrait?'translate(-150 5)':''}"><g class="math-weather-cloud">${[[419,42,28],[451,25,35],[487,35,31],[520,45,27],[470,61,34]].map(([x,y,r],i)=>`<circle data-sky-puff="${i}" cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
 <g class="math-rain" stroke="#528ca9" stroke-width="4" stroke-linecap="round">${Array.from({length:8},(_,i)=>`<path style="animation-delay:${i*.11}s" d="m${419+i*15} ${87+(i%3)*9}-5 12"/>`).join('')}</g>
</g>`,portrait?'0 0 400 420':'0 0 600 300');

function installCss(doc){if(doc.getElementById('cloud-math-style'))return;const link=doc.createElement('link');link.id='cloud-math-style';link.rel='stylesheet';link.href=new URL('./cloud-math.css',import.meta.url).href;(doc.head||doc.documentElement).append(link);}
export function createCloudMath({doc,stage,audio={},clock,round=0,canPlay=()=>true,message=()=>{},progress=()=>{},win=()=>{},effect=()=>{},stopSpeech=()=>{},speak=()=>{}}){
 installCss(doc);let state={...createMathState(round),phase:'waiting'},paused=false,disposed=false,begun=false,epoch=0,questionSerial=0,pendingBegin=false,pendingHint=false,attempt=0,counting=false,portrait=false;
 const jobs=new Set();const root=doc.createElement('section');root.className='cloud-math';root.setAttribute('aria-label','Talnaleikur í skýjunum');
 root.innerHTML=`<div class="math-weather"><span class="math-mistakes" role="status"></span><span class="math-cloud-pieces" aria-hidden="true">${Array.from({length:5},()=>`<i>${puffSvg()}</i>`).join('')}</span></div><div class="math-equation" aria-live="polite"></div><div class="math-scene"><div class="math-canvas">${sceneArt()}<div class="math-fish-layer"></div></div><span class="math-count-bubble" hidden></span></div><div class="math-answers" role="group" aria-label="Veldu svar"></div><div class="math-actions"><button type="button" class="math-repeat">♪ Heyra dæmið</button><button type="button" class="math-next" hidden>Næsta</button></div><div class="math-loss" hidden><strong>Smá skúr! Við reynum aftur.</strong><button type="button" class="math-retry">Reyna aftur</button></div>`;
 stage.append(root);const el=selector=>root.querySelector(selector),equation=el('.math-equation'),fishLayer=el('.math-fish-layer'),answers=el('.math-answers'),repeat=el('.math-repeat'),next=el('.math-next'),bubble=el('.math-count-bubble'),loss=el('.math-loss');
 const active=()=>!disposed&&!paused&&!doc.hidden&&canPlay();
 const playable=()=>active()&&state.phase!=='lost'&&state.phase!=='won';
 const problem=()=>mathRound(state.round)[state.index];
 function later(fn,ms){const token=epoch;let id;id=clock.after(()=>{jobs.delete(id);if(!disposed&&token===epoch)fn();},ms);jobs.add(id);return id;}
 function cancelWork(){epoch++;for(const id of jobs)clock.cancel(id);jobs.clear();counting=false;pendingHint=false;bubble.hidden=true;fishLayer.querySelectorAll('.counted').forEach(f=>f.classList.remove('counted'));}
 function say(id){try{Promise.resolve(speak(id)).catch(()=>{});}catch{}}
 function drawWeather(){
  el('.math-mistakes').textContent=`Mistök: ${state.mistakes} / 5`;
  root.querySelectorAll('.math-cloud-pieces i').forEach((p,i)=>p.classList.toggle('filled',i<state.mistakes));
  root.querySelectorAll('[data-sky-puff]').forEach((p,i)=>p.classList.toggle('filled',i<state.mistakes));
  root.classList.toggle('math-lost',state.phase==='lost');loss.hidden=state.phase!=='lost';
 }
 function drawEquation(){const p=problem();equation.innerHTML=`<span>${p.left}</span><span class="math-operator">${p.op}</span><span>${p.right}</span><span class="math-equals">=</span><span class="math-answer-result">${state.phase==='correct'||state.phase==='won'?p.result:'?'}</span>`;equation.setAttribute('aria-label',`${p.left} ${p.op==='+'?'plús':'mínus'} ${p.right} jafnt og ${state.phase==='correct'||state.phase==='won'?p.result:'hvað'}`);root.dataset.problem=p.id;}
 function paintButtons(){
  for(const b of answers.children){const value=Number(b.dataset.answer);b.disabled=state.phase!=='answer'||state.rejected.includes(value);b.classList.toggle('math-ruled-out',state.rejected.includes(value));b.classList.toggle('math-correct',state.phase==='correct'&&value===problem().result);b.setAttribute('aria-label',`${value}${state.rejected.includes(value)?', prófum aðra tölu':''}`);}
  next.hidden=state.phase!=='correct';next.textContent=state.correct===5?'Sækja styttuna':'Næsta';repeat.disabled=state.phase==='lost'||state.phase==='won';
 }
 function drawFish(final=false){
  fishLayer.replaceChildren();const p=problem(),total=p.op==='+'?p.result:p.left;
  for(let i=0;i<total;i++){
   const node=doc.createElement('span');node.className='math-fish';node.dataset.fish=String(i);positionFish(node,i);
   node.innerHTML=fishSvg();node.setAttribute('aria-hidden','true');const extra=p.op==='+'&&i>=p.left,removed=p.op==='−'&&i>=p.result;
   node.dataset.remaining=String(final?!removed:!extra);
   if(extra&&!final)node.classList.add('fish-waiting');if(removed&&final)node.classList.add('fish-gone');fishLayer.append(node);
  }
  const count=final?p.result:p.left;fishLayer.setAttribute('aria-label',`${count} ${count===1?'fiskur':'fiskar'} í körfunni`);
 }
 function positionFish(node,i){const x=193+(i%5)*71,y=i<5?139:184;node.style.left=`${portrait?(x*.92-115)/4:x/6}%`;node.style.top=`${portrait?(y*.92+145)/4.2:y/3}%`;node.style.width=portrait?'13.8%':'10%';}
 function settleFish(){drawFish(true);if(state.phase==='moving')state={...state,phase:'answer'};paintButtons();}
 function question(silent=false){
  begun=true;if(!active()){pendingBegin=true;return;}cancelWork();pendingBegin=false;stopSpeech();state={...state,phase:'moving'};drawEquation();drawFish();answers.replaceChildren();
  const questionId=++questionSerial;
  for(const value of mathChoices(problem(),state.round+state.index)){const b=doc.createElement('button');b.type='button';b.dataset.answer=String(value);b.textContent=String(value);b.addEventListener('click',()=>{if(questionId===questionSerial)answer(value);});answers.append(b);}
  drawWeather();paintButtons();message('Teldu fiskana og veldu töluna.');if(!silent)say(problem().id);const p=problem();
  for(let i=0;i<p.right;i++)later(()=>{const id=p.op==='+'?p.left+i:p.left-1-i,node=fishLayer.querySelector(`[data-fish="${id}"]`);if(!node)return;node.classList.remove('fish-waiting');node.classList.add(p.op==='+'?'fish-arriving':'fish-leaving');node.dataset.remaining=String(p.op==='+');},650+i*220);
  later(()=>{settleFish();message('Hvað eru margir fiskar í körfunni?');},650+(p.right-1)*220+750);
 }
 function countFish(){
  if(!playable()||state.phase==='correct')return;cancelWork();settleFish();counting=true;const remaining=[...fishLayer.children].filter(f=>f.dataset.remaining==='true');
  if(!remaining.length){bubble.textContent='0';bubble.hidden=false;message('Karfan er tóm. Enginn fiskur eftir!');counting=false;return;}
  message('Teljum fiskana sem eru í körfunni.');remaining.forEach((node,i)=>later(()=>{
   fishLayer.querySelectorAll('.counted').forEach(f=>f.classList.remove('counted'));node.classList.add('counted');bubble.hidden=false;bubble.textContent=String(i+1);audio.star?.({index:i%5,total:5,pan:0});
  },100+i*600));later(()=>{counting=false;},100+remaining.length*600);
 }
 function answer(value){
  if(!playable())return;const result=answerMath(state,value);if(!result.accepted)return;cancelWork();stopSpeech();state=result.state;drawWeather();paintButtons();drawEquation();
  if(result.correct){progress(state.correct,5);message(problem().result===0?'Enginn eftir — það er núll!':'Já! Þú fannst svarið.');effect('leaf');return;}
  if(state.phase==='lost'){settleFish();message('Fimm skýjahnoð — nú kemur smá skúr.');say('math_rain');return;}
  message('Prófum aðra tölu. Teljum fiskana saman.');effect('breeze');countFish();
 }
 function advance(){
  if(!active()||state.phase!=='correct')return;cancelWork();stopSpeech();
  if(state.correct===5){const claimed=claimMath(state);if(claimed===state)return;state=claimed;paintButtons();win();return;}
  state=advanceMath(state);question();
 }
 function retry(){if(!active()||state.phase!=='lost')return;cancelWork();stopSpeech();state=createMathState(safeRound(round)+ ++attempt);progress(0,5);question();}
 function begin(){if(disposed||begun)return;begun=true;if(!active()){pendingBegin=true;return;}question();}
 function prepareHint(){if(!playable()||state.phase==='correct')return;if(!begun)question(true);cancelWork();settleFish();}
 function hint(){if(disposed||state.phase==='lost'||state.phase==='won'||state.phase==='correct')return;if(!active()){pendingHint=true;return;}if(!begun)prepareHint();countFish();}
 function syncPause(){const value=paused||Boolean(doc.hidden);root.classList.toggle('math-paused',value);clock.setPaused?.(value);if(!value&&active()){if(pendingBegin){pendingBegin=false;question();}else if(pendingHint){pendingHint=false;countFish();}}}
 repeat.addEventListener('click',()=>{if(!playable())return;if(state.phase==='correct'){stopSpeech();say(problem().id);}else question();});next.addEventListener('click',advance);el('.math-retry').addEventListener('click',retry);
 // The fish and the painted basket share one contained 2:1 coordinate frame.
 const scene=el('.math-scene'),canvas=el('.math-canvas');
 function fitScene(){const width=scene.clientWidth,height=scene.clientHeight;if(width>0&&height>0){const nextPortrait=height>width*.8;if(nextPortrait!==portrait){portrait=nextPortrait;canvas.firstElementChild.outerHTML=sceneArt(portrait);fishLayer.querySelectorAll('[data-fish]').forEach(node=>positionFish(node,Number(node.dataset.fish)));root.classList.toggle('math-portrait',portrait);drawWeather();}const ratio=portrait?400/420:2;canvas.style.width=`${Math.min(width,height*ratio)}px`;canvas.style.height=`${Math.min(height,width/ratio)}px`;}}
 const Observer=doc.defaultView?.ResizeObserver||globalThis.ResizeObserver;const observer=Observer?new Observer(fitScene):null;observer?.observe(scene);fitScene();
 const visibility=()=>syncPause();doc.addEventListener('visibilitychange',visibility);
 drawWeather();drawEquation();drawFish();paintButtons();progress(0,5);message('Fimm svör áður en regnskýið fyllist.');syncPause();
 return{begin,hint,prepareHint,hintAfterSpeech:true,setPaused(value){paused=Boolean(value);syncPause();},dispose(){if(disposed)return;cancelWork();disposed=true;stopSpeech();observer?.disconnect();doc.removeEventListener('visibilitychange',visibility);root.remove();},getState(){return{...state,rejected:[...state.rejected],problem:problem().id,counting};}};
}
