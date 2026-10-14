import {createAerialMiniGame} from './mini-rides.js';
import {createJigsaw} from './jigsaw-game.js';
import {createCloudMath} from './cloud-math.js';
import { boardResult, playSquare, suggestSquare, chooseRexSquare, memoryDeck, reedSequence, checkTone, createPausableScheduler} from './mini-game-rules.js';

const TITLES = {stegosaurus:'Stóra risaeðlupúslið',brachiosaurus:'Lauf í körfuna',trex:'Þrír í röð með Rex',spinosaurus:'Fiskavinir',parasaurolophus:'Söngur sefanna',pteranodon:'Talnaleikur í skýjunum'};
const AERIAL_INSTRUCTIONS = {
  brachiosaurus:'Gríptu tíu lauf. Láttu brúnu könglana falla fram hjá körfunni.',
};
function svg(content, viewBox='0 0 120 120', cls='') { return `<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`; }
function leafArt() { return svg('<path d="M27 96C2 57 43 7 103 14 99 77 64 109 27 96Z" fill="#eab65b" stroke="#704e29" stroke-width="4"/><path d="m23 105 62-65M48 80 41 48M62 66 84 67" fill="none" stroke="#fff0be" stroke-width="5" stroke-linecap="round"/>'); }
function footArt() { return svg('<path d="m31 82-17-8 24-21-4-31 20 26 18-37 7 41 28-15-18 37-25 23Z" fill="#78b8ab" stroke="#315e59" stroke-width="4"/>'); }
function fishArt(type) {
  const colors=['#efb85e','#6ab9b3','#cf8584','#729ed1','#ac86c3','#84af63'];
  const patterns=['','<path d="M50 38v42M65 39v39" stroke="#fff1bc" stroke-width="7"/>','<g fill="#fff1bc"><circle cx="49" cy="51" r="5"/><circle cx="66" cy="61" r="5"/><circle cx="53" cy="71" r="5"/></g>','<path d="M40 51q10-12 20 0t20 0M40 68q10-12 20 0t20 0" fill="none" stroke="#fff1bc" stroke-width="5"/>','<path d="m45 40 12 11-12 11 12 13m12-35 12 11-12 11 12 13" fill="none" stroke="#fff1bc" stroke-width="5"/>','<path d="m60 42 5 11 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z" fill="#fff1bc"/>'];
  return svg(`<path d="m84 53 26-20-3 49-24-15M46 39 58 21 72 39" fill="${colors[type]}" stroke="#365e5b" stroke-width="3"/><ellipse cx="53" cy="60" rx="38" ry="25" fill="${colors[type]}" stroke="#365e5b" stroke-width="3"/><path d="m52 67 17 14-1-22" fill="#fff0c0"/>${patterns[type]}<circle cx="29" cy="54" r="6" fill="#fff8e3"/><circle cx="28" cy="54" r="3" fill="#294740"/>`);
}
function friendArt(species) {
  if(species==='spinosaurus')return svg(`<g transform="translate(270 0) scale(-1 1)"><path d="M108 111Q54 137 7 89L15 133Q62 158 121 138" fill="#4d9294" stroke="#386766" stroke-width="3"/><path d="M9 90Q54 119 95 118M16 133Q58 135 101 125" fill="none" stroke="#77b2a6" stroke-width="5"/><path d="M80 91Q93 62 104 24Q109 10 124 28Q137 1 151 17Q170 10 177 38Q192 47 198 85Z" fill="#dbb36b" stroke="#927647" stroke-width="3"/><g stroke="#9f925c" stroke-width="3" fill="none"><path d="M107 28l6 55M125 29l7 54M149 21l2 61M174 39l-8 46"/></g><ellipse cx="135" cy="110" rx="66" ry="41" fill="#65a6a5" stroke="#386766" stroke-width="3"/><path d="M167 100Q163 69 184 49Q205 40 216 61L253 65Q267 67 265 80L254 91 212 89 185 100" fill="#67aca8" stroke="#386766" stroke-width="3"/><path d="M211 79Q240 85 263 76L256 88 217 88Z" fill="#49706a"/><path d="m225 81 4 7 4-7m14 0 4 7 4-8" fill="#fff1cd"/><path d="M212 91Q236 98 255 90" stroke="#bed6ad" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="201" cy="64" rx="10" ry="11" fill="#fff9e4"/><ellipse cx="204" cy="65" rx="5" ry="6" fill="#305350"/><circle cx="206" cy="63" r="2" fill="white"/><ellipse cx="255" cy="72" rx="3" ry="2" fill="#315c59"/><path d="M112 133 101 166 122 173 88 173 90 132M158 134 170 163 191 169 159 175 139 142" fill="#589898" stroke="#386766" stroke-width="3" stroke-linejoin="round"/><path d="M174 104 185 123 206 119M186 123 205 126M186 123 201 132" fill="none" stroke="#386766" stroke-width="9" stroke-linecap="round"/><path d="M174 103 185 121 205 118M186 121 204 125M186 121 200 131" fill="none" stroke="#89bcb0" stroke-width="5" stroke-linecap="round"/><path d="m204 117 5-3m-5 11 6-1m-10 7 5 2" fill="none" stroke="#fff0ce" stroke-width="3" stroke-linecap="round"/><path d="m106 99 8 12m12-16 9 14m13-15 9 12" fill="none" stroke="#4b8c8c" stroke-width="6" stroke-linecap="round"/></g>`,'0 0 275 180','mini-friend-art mini-spino-art');
  if(species==='trex')return svg(`<path d="M102 116Q48 145 8 91Q24 157 113 150" fill="#aa784f" stroke="#705537" stroke-width="3"/><path d="M100 130 85 168 72 172 74 177 115 177 125 136" fill="#a87b52"/><path d="M119 50Q83 62 80 110Q77 148 119 155L157 148Q177 122 158 86L151 53" fill="#c69b67" stroke="#795b3b" stroke-width="3"/><path d="M144 84Q166 112 143 150L120 151Q139 126 127 92" fill="#e2ca92"/><path d="M130 136 143 167 166 170 171 177 126 177 106 142" fill="#bc8b59" stroke="#795b3b" stroke-width="3"/><path d="m145 173 2 4m11-4 2 4" stroke="#f4e6b8" stroke-width="3"/><path d="M120 28Q146 5 172 14Q182 17 190 28L224 32Q241 36 240 58L231 75Q208 88 175 76L142 70Q124 58 120 28Z" fill="#c89c65" stroke="#795b3b" stroke-width="3"/><path d="M160 58Q198 69 236 55L231 71Q205 83 176 72Z" fill="#815746"/><g class="mini-rex-teeth" fill="#fff0c9"><path d="m179 63 5 10 5-9Z"/><path d="m198 64 5 9 5-10Z"/><path d="m217 60 5 9 5-11Z"/></g><path d="M174 76Q206 87 231 72" fill="none" stroke="#e6ce95" stroke-width="5" stroke-linecap="round"/><ellipse cx="161" cy="36" rx="13" ry="14" fill="#fff9df"/><ellipse cx="165" cy="37" rx="6.5" ry="8" fill="#344d3b"/><circle cx="167" cy="34" r="2.5" fill="white"/><path d="M149 18Q162 11 174 23" fill="none" stroke="#876540" stroke-width="4" stroke-linecap="round"/><ellipse cx="226" cy="45" rx="3.5" ry="2.5" fill="#705537"/><g class="mini-rex-arm"><path d="M142 98Q155 110 166 108L175 96M165 108 181 105" fill="none" stroke="#785737" stroke-width="10" stroke-linecap="round"/><path d="M142 97Q155 108 166 106L175 96M166 106 180 104" fill="none" stroke="#d3ad76" stroke-width="6" stroke-linecap="round"/><path d="m175 95 3-4m2 13 5-2" stroke="#fff0ca" stroke-width="3" stroke-linecap="round"/></g><g fill="#a57b50"><ellipse cx="104" cy="90" rx="8" ry="5"/><ellipse cx="93" cy="110" rx="5" ry="4"/><ellipse cx="114" cy="116" rx="6" ry="4"/></g>`,'0 0 248 184','mini-friend-art mini-rex-art');
  const colors={stegosaurus:'#80a87d',trex:'#bf9970',spinosaurus:'#69aab1',parasaurolophus:'#c5b969'};
  const crest=species==='parasaurolophus'?'<path d="M83 36Q119 -1 177 13Q140 15 106 47Z" fill="#d9b96e" stroke="#456452" stroke-width="4"/><path d="M99 32Q134 11 165 14" fill="none" stroke="#f1d99a" stroke-width="3" stroke-linecap="round"/>':species==='spinosaurus'?'<path d="m92 68 17-55 14 41 20-36 11 57" fill="#d6b478"/>':species==='stegosaurus'?'<path d="m98 69 5-43 21 27 11-35 20 42" fill="#d9b67a"/>':'';
  return svg(`${crest}<path d="M51 101Q51 43 110 44Q164 42 170 84L184 114H57Z" fill="${colors[species]||'#82b1a1'}"/><ellipse cx="83" cy="55" rx="57" ry="39" fill="${colors[species]||'#82b1a1'}"/><ellipse cx="86" cy="78" rx="39" ry="13" fill="#e6ddb0"/><circle cx="94" cy="39" r="12" fill="#fff9e5"/><circle cx="97" cy="40" r="6" fill="#274638"/><circle cx="99" cy="37" r="2" fill="white"/><circle cx="39" cy="59" r="4" fill="#355e4d"/><path d="M41 73Q65 91 93 74" fill="none" stroke="#355e4d" stroke-width="4" stroke-linecap="round"/>`,'0 0 190 120','mini-friend-art');
}
function button(doc, text, cls='') { const b=doc.createElement('button'); b.type='button'; b.className=cls; b.textContent=text; return b; }

export function createMiniGames(host, {audio = {}, speak = () => {}, onWin = () => {}, onExit = () => {}, onProgress = () => {}} = {}) {
  const doc=host.ownerDocument; let current=null, shell=null, clock=null, species=null, finished=false, disposed=false, externalPause=false, manualPause=false, paused=false, hintSerial=0, runSerial=0;
  let stage, status, progress, pauseButton, pauseCover, helpButton, muteButton;
  function say(kind) { try { const result=speak(`mini_${species}_${kind}`); result?.catch?.(()=>{}); return result; } catch {} }
  function effect(name) { if(!paused&&!finished)audio.effect?.(name); }
  function updateProgress(value,total) {
    if(disposed||finished)return;
    const currentValue=typeof value==='object'?value.current??value.count??0:value;
    const totalValue=typeof value==='object'?value.total??total:total;
    progress.textContent=`${currentValue} / ${totalValue}`;
    progress.setAttribute('aria-label',`${currentValue} af ${totalValue}`);
    onProgress({species,current:currentValue,total:totalValue});
  }
  function message(text) { if(status)status.textContent=text; }
  function canPlay() { return !disposed&&!finished&&!paused; }
  function win() {
    if(!canPlay())return; finished=true; clock.clear(); current?.setPaused?.(true);
    stage.inert=true; helpButton.disabled=true; message('Þú tókst þetta!'); onWin(species);
  }
  function applyPause() {
    const next=externalPause||manualPause||Boolean(doc.hidden);
    if(next===paused&&shell)return; paused=next; clock?.setPaused(next); current?.setPaused?.(next); audio.setPaused?.(next);
    if(shell){shell.classList.toggle('is-paused',next);stage.inert=next||finished;pauseCover.hidden=!next;pauseButton.textContent=manualPause?'Halda áfram':'Gera hlé';pauseButton.setAttribute('aria-pressed',String(manualPause));}
  }
  function visibility(){applyPause();}
  doc.addEventListener('visibilitychange',visibility);
  function cleanup() { runSerial++;hintSerial++;current?.dispose?.();current=null;clock?.dispose();clock=null;shell?.remove();shell=null; }
  function start(nextSpecies,{round=0}={}) {
    if(disposed)return false;if(!Object.hasOwn(TITLES,nextSpecies))return false;
    cleanup();species=nextSpecies;finished=false;manualPause=false;clock=createPausableScheduler();
    const run=++runSerial,isCurrent=()=>!disposed&&run===runSerial;
    const report=(value,total)=>{if(isCurrent())updateProgress(value,total);},complete=()=>{if(isCurrent())win();};
    shell=doc.createElement('section');shell.className=`mini-game mini-${species}`;shell.setAttribute('aria-label',TITLES[species]);
    shell.innerHTML='<div class="mini-sky" aria-hidden="true"><i></i><i></i><i></i></div><header class="mini-header"></header><div class="mini-status"><p aria-live="polite"></p><strong role="status"></strong></div><div class="mini-stage"></div><div class="mini-pause-cover" hidden><span>Við tökum smá hlé 🌿</span></div>';
    host.append(shell);const header=shell.querySelector('.mini-header');stage=shell.querySelector('.mini-stage');status=shell.querySelector('.mini-status p');progress=shell.querySelector('.mini-status strong');pauseCover=shell.querySelector('.mini-pause-cover');
    progress.hidden=species==='trex';
    const back=button(doc,'‹ Til baka','mini-back');back.addEventListener('click',()=>{if(!isCurrent())return;const leaving=species;cleanup();onExit(leaving);});
    const title=doc.createElement('h1');title.textContent=TITLES[species];
    helpButton=button(doc,'Mosi hjálpar','mini-help');helpButton.addEventListener('click',()=>{
      if(!isCurrent()||!canPlay())return;const child=current,request=++hintSerial;
      if(child?.hintAfterSpeech){child.prepareHint?.();Promise.resolve(say('hint')).catch(()=>{}).then(()=>{if(!disposed&&!finished&&current===child&&request===hintSerial)child.hint?.();});}
      else{say('hint');child?.hint?.();if(AERIAL_INSTRUCTIONS[species])message(AERIAL_INSTRUCTIONS[species]);}
    });
    pauseButton=button(doc,'Gera hlé','mini-pause');pauseButton.addEventListener('click',()=>{if(!isCurrent())return;manualPause=!manualPause;applyPause();});
    muteButton=button(doc,'','mini-mute');const updateMute=()=>{const muted=Boolean(audio.isMuted?.());muteButton.textContent=muted?'♪ ×':'♪';muteButton.setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');muteButton.setAttribute('aria-pressed',String(muted));};updateMute();
    muteButton.addEventListener('click',()=>{if(!isCurrent())return;audio.setMuted?.(!audio.isMuted?.());try{globalThis.localStorage?.setItem('stjornufar.muted',String(Boolean(audio.isMuted?.())));}catch{}updateMute();});
    header.append(back,title,helpButton,pauseButton,muteButton);
    const context={doc,stage,audio,clock,round,canPlay:()=>isCurrent()&&canPlay(),message:text=>{if(isCurrent())message(text);},progress:report,win:complete,effect,speak(id){if(!isCurrent()||!canPlay())return Promise.resolve(false);try{return Promise.resolve(speak(id)).catch(()=>false);}catch{return Promise.resolve(false);}},stopSpeech(){hintSerial++;audio.stopNarration?.();}};
    if(species==='stegosaurus')current=createJigsaw(context);
    else if(species==='trex')current=createRex(context);
    else if(species==='spinosaurus')current=createMemory(context);
    else if(species==='parasaurolophus')current=createReeds(context);
    else if(species==='pteranodon')current=createCloudMath(context);
    else{message(AERIAL_INSTRUCTIONS[species]);current=createAerialMiniGame(stage,{species,audio,speak,onWin:complete,onProgress:report,round});}
    // Always apply to a new scheduler/child, including an already-hidden start.
    paused=!(externalPause||manualPause||Boolean(doc.hidden));applyPause();
    const child=current;Promise.resolve(say('play')).catch(()=>{}).then(()=>{if(!disposed&&current===child&&!finished)child?.begin?.();});return true;
  }
  return{start,setPaused(value){externalPause=Boolean(value);applyPause();},dispose(){if(disposed)return;disposed=true;cleanup();doc.removeEventListener('visibilitychange',visibility);}};
}

function createRex({doc,stage,clock,round,canPlay,message,progress,win,effect}) {
  stage.innerHTML=`<div class="mini-rex"><aside class="mini-opponent">${friendArt('trex')}<p>Þú ${leafArt()} <span>Rex</span> ${footArt()}</p></aside><div class="mini-twig-board" role="group" aria-label="Þrír í röð"></div><div class="mini-rex-retry"></div></div>`;
  const boardNode=stage.querySelector('.mini-twig-board'),retryNode=stage.querySelector('.mini-rex-retry'),opponent=stage.querySelector('.mini-opponent');
  let board=Array(9).fill(null),turn='X',ended=false,attempt=round,practice=false;
  const cells=Array.from({length:9},(_,i)=>{const b=button(doc,'','mini-cell');b.dataset.square=String(i);b.setAttribute('aria-label',`Reitur ${i+1}, auður`);b.addEventListener('click',()=>human(i));boardNode.append(b);return b;});
  const turnMessage=()=>message(practice?'Æfing með Mosa — þín umferð!':'Þín umferð — þrjú lauf í röð!');
  function draw(){cells.forEach((b,i)=>{b.innerHTML=board[i]==='X'?leafArt():board[i]==='O'?footArt():'';b.disabled=ended||turn!=='X'||Boolean(board[i]);b.setAttribute('aria-label',`Reitur ${i+1}, ${board[i]==='X'?'lauf':board[i]==='O'?'fótspor':'auður'}`);b.classList.remove('hinted');});}
  function reset(nextPractice=practice){if(!canPlay())return;clock.clear();opponent.classList.remove('is-moving');board=Array(9).fill(null);turn='X';ended=false;attempt++;practice=nextPractice;stage.dataset.rexMode=practice?'practice':'challenge';retryNode.replaceChildren();cells.forEach(b=>b.classList.remove('line-win'));draw();progress(0,3);turnMessage();}
  function finish(){
    const result=boardResult(board);if(!result)return false;ended=true;draw();result.line.forEach(i=>cells[i].classList.add('line-win'));
    if(result.winner==='X'){progress(3,3);win();return true;}
    message(result.winner==='draw'?'Jafntefli! Prófum aðra leið eða æfum með Mosa.':'Rex fékk þrjá í röð. Mosi getur hjálpað okkur að æfa.');
    const retry=button(doc,'Aftur','mini-primary');retry.dataset.rexRetry='true';retry.addEventListener('click',()=>reset());retryNode.append(retry);
    if(!practice){const easier=button(doc,'Æfa með Mosa','mini-primary mini-practice');easier.addEventListener('click',()=>reset(true));retryNode.append(easier);}return true;
  }
  function human(i){
    if(!canPlay()||turn!=='X'||ended)return;const next=playSquare(board,i,'X');if(!next)return;board=next;effect('leaf');if(finish())return;turn='O';draw();message(practice?'Æfing — Rex hugsar sig um…':'Rex hugsar sig um…');
    clock.after(()=>{if(!canPlay())return;const move=chooseRexSquare(board,attempt,{practice});const nextBoard=playSquare(board,move,'O');if(nextBoard)board=nextBoard;opponent.classList.add('is-moving');clock.after(()=>opponent.classList.remove('is-moving'),600);effect('track');if(finish())return;turn='X';draw();turnMessage();},650);
  }
  stage.dataset.rexMode='challenge';draw();progress(0,3);message('Þú ert laufið. Fáðu þrjú lauf í röð!');
  return{hint(){if(ended){message(practice?'Veldu „Aftur“. Við æfum okkur saman.':'Veldu „Æfa með Mosa“ til að prófa léttari umferð.');retryNode.querySelector('.mini-practice')?.classList.add('hinted');return;}if(turn!=='X')return;const i=suggestSquare(board);if(i>=0){cells[i].classList.add('hinted');message(practice?'Æfing — þessi reitur getur hjálpað þér að mynda línu.':'Skoðaðu glitrandi reitinn. Geturðu myndað línu?');}},setPaused(){},dispose(){clock.clear();}};
}

function createMemory({doc,stage,clock,round,canPlay,message,progress,win,effect}) {
  stage.innerHTML=`<div class="mini-memory"><div class="mini-pond-friend">${friendArt('spinosaurus')}</div><div class="mini-memory-grid" role="group" aria-label="Finndu sex fiskapör"></div><span class="mini-pond-ripple r1"></span><span class="mini-pond-ripple r2"></span></div>`;
  const grid=stage.querySelector('.mini-memory-grid'),deck=memoryDeck(round),matched=new Set();let opened=[],busy=false,pairs=0;
  const names=['gullinn fiskur','röndóttur fiskur','doppóttur fiskur','fiskur með bylgjum','fiskur með sikksakki','fiskur með stjörnu'];
  const cards=deck.map((fish,i)=>{const b=button(doc,'','mini-memory-card');b.dataset.card=String(i);b.innerHTML=`<span class="mini-card-back">${svg('<path d="M23 86Q-6 43 50 15 114 4 102 75 74 115 23 86Z" fill="#81af7e"/><path d="M61 19 57 65 24 84" fill="none" stroke="#d9dca7" stroke-width="4"/><circle cx="59" cy="63" r="8" fill="#f0d395"/>')}</span><span class="mini-card-face">${fishArt(fish)}</span>`;b.setAttribute('aria-label',`Spjald ${i+1}, lokað`);b.addEventListener('click',()=>flip(i));grid.append(b);return b;});
  function paint(preview=false){cards.forEach((b,i)=>{const face=preview||matched.has(i)||opened.includes(i);b.classList.toggle('is-open',face);b.classList.toggle('is-matched',matched.has(i));b.disabled=matched.has(i)||busy;b.setAttribute('aria-label',face?`${names[deck[i]]}${matched.has(i)?', par fundið':''}`:`Spjald ${i+1}, lokað`);});}
  function flip(i){if(!canPlay()||busy||matched.has(i)||opened.includes(i))return;opened.push(i);effect('splash');paint();if(opened.length<2){message('Hvaða spjald á sama fisk?');return;}const[a,b]=opened;busy=true;paint();if(deck[a]===deck[b]){matched.add(a);matched.add(b);pairs++;progress(pairs,6);message('Þarna eru fiskavinirnir!');clock.after(()=>{opened=[];busy=false;paint();if(pairs===6)win();},350);}else{message('Tveir ólíkir fiskar. Nú vitum við hvar þeir eru!');clock.after(()=>{opened=[];busy=false;paint();},1150);}}
  paint();progress(0,6);message('Snúðu tveimur spjöldum og finndu sex fiskapör.');
  return{hint(){clock.clear();opened=[];busy=true;paint(true);message('Kíkjum saman. Mundu hvar fiskavinirnir eru.');clock.after(()=>{busy=false;paint();if(pairs===6)win();},1900);},setPaused(){},dispose(){clock.clear();}};
}

function createReeds({doc,stage,audio,clock,round,canPlay,message,progress,win,stopSpeech}) {
  stage.innerHTML=`<div class="mini-music"><div class="mini-music-friend">${friendArt('parasaurolophus')}</div><div class="mini-note-trail" aria-label="Tónar í laginu"></div><div class="mini-reed-keys"></div><button type="button" class="mini-primary mini-replay">Heyra aftur</button></div>`;
  const keyHost=stage.querySelector('.mini-reed-keys'),trail=stage.querySelector('.mini-note-trail'),replay=stage.querySelector('.mini-replay'),sequence=reedSequence(round);let length=3,entered=[],playing=true,begun=false,pendingBegin=false,pendingHint=false;
  const names=['Sólarstrá','Vatnsstrá','Stjörnustrá'],colors=['#e3b655','#62b5bb','#be8cbb'],symbols=['☀','●','✦'];
  const keys=Array.from({length:3},(_,i)=>{const b=button(doc,'','mini-reed-key');b.dataset.tone=String(i);b.style.setProperty('--reed-color',colors[i]);b.setAttribute('aria-label',names[i]);b.innerHTML=svg(`<path d="M58 211Q${45+i*9} 125 62 43" fill="none" stroke="#37775c" stroke-width="12"/><path d="M57 168Q9 135 14 93Q53 112 57 151M60 142Q115 98 110 62Q75 82 60 124" fill="#60976c"/><rect x="37" y="${20+i*13}" width="48" height="${77-i*10}" rx="24" fill="${colors[i]}" stroke="#f9e6b0" stroke-width="4"/><text x="61" y="${68+i*8}" text-anchor="middle" fill="#36534f" font-size="28" font-weight="bold">${symbols[i]}</text>`,'0 0 120 230');b.addEventListener('click',()=>tap(i));keyHost.append(b);return b;});
  function dots(){trail.innerHTML=Array.from({length},(_,i)=>`<span class="${i<entered.length?'done':''}" aria-hidden="true">${i<entered.length?'♪':'·'}</span>`).join('');trail.setAttribute('aria-label',`${entered.length} af ${length} tónum`);}
  function tone(i){if(!canPlay())return;keys[i].classList.add('sounding');audio.star?.({index:i,total:3,pan:(i-1)*.45});clock.after(()=>keys[i].classList.remove('sounding'),330);}
  function play(slow=false){if(!canPlay())return;begun=true;pendingBegin=false;pendingHint=false;clock.clear();keys.forEach(k=>k.classList.remove('sounding'));playing=true;entered=[];keys.forEach(k=>k.disabled=true);dots();message(length===3?'Hlustaðu á þrjá tóna. Svo er komið að þér.':length===4?'Nú koma fjórir tónar. Hlustum saman.':'Nú koma fimm tónar. Við getum hlustað aftur.');const gap=slow?1100:750;sequence.slice(0,length).forEach((t,i)=>clock.after(()=>tone(t),350+i*gap));clock.after(()=>{playing=false;keys.forEach(k=>k.disabled=false);message('Þín umferð! Spilaðu sama lag.');},350+length*gap);}
  function tap(i){if(!canPlay()||playing)return;tone(i);const result=checkTone(sequence.slice(0,length),entered,i);if(!result.correct){message('Prófum saman aftur. Hlustaðu á fyrsta tóninn.');playing=true;keys.forEach(k=>k.disabled=true);clock.after(()=>play(true),650);return;}entered.push(i);dots();if(result.complete){if(length===5){progress(3,3);win();}else{progress(length-2,3);message('Fallegt lag! Bætum við einum tóni.');playing=true;keys.forEach(k=>k.disabled=true);length++;clock.after(()=>play(),1100);}}}
  replay.addEventListener('click',()=>{if(!canPlay())return;stopSpeech();play();});progress(0,3);dots();keys.forEach(k=>k.disabled=true);message('Hlustum á Mosa. Svo spilum við saman.');
  return{hintAfterSpeech:true,begin(){if(begun)return;if(canPlay())play();else pendingBegin=true;},prepareHint(){begun=true;pendingHint=false;pendingBegin=false;clock.clear();playing=true;keys.forEach(k=>{k.disabled=true;k.classList.remove('sounding');});message('Mosi hjálpar okkur að hlusta.');},hint(){if(canPlay())play(true);else pendingHint=true;},setPaused(value){if(!value){if(pendingHint)play(true);else if(pendingBegin)play();}},dispose(){clock.clear();}};
}
