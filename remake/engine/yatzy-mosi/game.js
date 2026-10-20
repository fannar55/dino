import {createYatzyWorld} from './world.js';
import {createMosiOpponent} from './opponent.js';
import {createDiceAndCup,DINO_FACES} from './dice.js';
import {createYatzyEffects} from './effects.js';
import {createYatzyAudio} from './audio.js';
import {rollFeedback} from './feedback.js';
import {CATEGORIES,createGame,roll,hold,score,previews,totals,decideAI,restoreGame,validateGame} from './rules.js';
import {LESSON_STEPS,createLesson,lessonStep,allowsLessonAction,advanceLesson,rollLesson} from './tutorial.js';

const $=id=>document.getElementById(id),SAVE='mosi.yatzy.table.save.v1',PREFS='mosi.yatzy.table.prefs.v1';
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The game still works when storage is unavailable. */}};
const prefs=read(PREFS)||{};
let muted=prefs.muted===true,reduced=typeof prefs.reduced==='boolean'?prefs.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio=createYatzyAudio();audio.mute(muted);
let world,opponent,dice,effects,state=createGame(),saved=restoreGame(read(SAVE)),phase='intro',timer=0,elapsed=0,last=performance.now(),frame=0,disposed=false,zeroCategory=null,recent=null;
let aiDecision=null,noticeTime=0,started=false,paused=true,qaFrozen=false,resizeObserver=null,pendingDiceView=-1;
const cells=new Map(),dieButtons=[];
const cupButton=$('cup-target'),moment=$('moment'),canvas=$('table');
const targetPixels=Array.from({length:6},()=>({x:NaN,y:NaN,width:NaN,height:NaN,top:NaN,bottom:NaN}));
const cupAnchor={x:0,y:0};
const opponentFrame={thinking:false,rolling:false,target:null,reducedMotion:reduced};
let targetWidth=0,targetHeight=0,momentVisible=false;
let lesson=null,lessonReturn=null,lessonPainted=-1,lessonNeedsFocus=false,lessonWaiting=false,lessonFocusTarget=null;

for(const [index,c]of CATEGORIES.entries()){
  const row=document.createElement('tr');if(index===6)row.className='section-start';
  const label=document.createElement('th');label.scope='row';label.textContent=c.label;label.title=c.description;row.append(label);
  const playerCells=[];
  for(let p=0;p<2;p++){
    const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='score';button.dataset.category=c.id;button.dataset.player=p;button.textContent='—';button.disabled=true;
    button.addEventListener('click',()=>chooseScore(c.id));td.append(button);row.append(td);playerCells.push(button);
  }
  cells.set(c.id,playerCells);$('score-rows').append(row);
}
for(let i=0;i<5;i++){
  const button=document.createElement('button');button.type='button';button.className='die-target';button.hidden=true;button.dataset.index=i;button.setAttribute('aria-label',`Teningur ${i+1}`);button.innerHTML='<span>Geymdur</span>';
  button.addEventListener('click',()=>toggleHold(i));$('dice-targets').append(button);dieButtons.push(button);
}
function syncPause(){paused=qaFrozen||document.hidden||Boolean(document.querySelector('dialog[open]'));audio.pause(paused);cupButton.dataset.paused=String(paused);syncCupReady();last=performance.now();}
function openDialog(id){const node=$(id);if(!node.open)node.showModal();syncPause();}
function closeDialog(id){$(id).close();syncPause();}
function setNotice(kicker,text,duration=3){$('moment-kicker').textContent=kicker;$('moment-text').textContent=text;noticeTime=duration;momentVisible=true;moment.style.opacity='1';}
function save(){if(lesson)return;write(SAVE,state);saved=restoreGame(state);}
function savePrefs(){write(PREFS,{muted,reduced});cupButton.dataset.motion=reduced?'reduced':'full';$('sound').textContent=muted?'♩':'♫';$('sound').setAttribute('aria-pressed',String(muted));$('sound').setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');$('motion').setAttribute('aria-pressed',String(reduced));$('motion').textContent=reduced?'Venjuleg hreyfing':'Rólegri hreyfing';}
function view(mode,snap=reduced){pendingDiceView=-1;if(mode==='dice'&&dice)world?.setDiceFocus(dice.getFramingPoints(),{snap});world?.setView(mode,{reduced:snap});}
function isHuman(){return started&&!paused&&phase==='human'&&state.currentPlayer===0&&state.status==='playing';}
function lessonReady(){return!paused&&phase!=='rolling'&&pendingDiceView<0&&!world.isViewTransitioning();}
function lessonAllows(action,value){return!lesson||allowsLessonAction(lesson,state,action,value);}
function syncCupReady(){
  const ready=isHuman()&&state.rollCount<3&&!state.held.every(Boolean)&&lessonAllows('roll')&&(!lesson||lessonReady());
  dice?.setReady(ready);cupButton.disabled=!ready;cupButton.hidden=!ready;
}
function renderUI(){
  const preview=state.rollCount>0?previews(state):{},human=phase==='human'&&state.currentPlayer===0&&state.status==='playing',who=state.currentPlayer;
  const best=Math.max(0,...Object.values(preview));
  for(const c of CATEGORIES){
    const pair=cells.get(c.id);
    for(let p=0;p<2;p++){
      const button=pair[p],value=state.players[p].scores[c.id],possible=value===null&&p===who&&state.rollCount>0&&phase!=='rolling'&&phase!=='handoff';
      button.textContent=value!==null?value:possible?preview[c.id]:'—';
      button.className='score'+(value!==null?' filled':possible&&p===0?' available':possible?' opponent-preview':'')+(possible&&preview[c.id]>0&&preview[c.id]===best?' best':'')+(value===0?' zero':'')+(recent?.id===c.id&&recent.player===p?' recent':'');
      button.disabled=!(p===0&&human&&value===null&&state.rollCount>0&&lessonAllows('score',c.id)&&(!lesson||lessonReady()));
      button.setAttribute('aria-label',`${p?'Mosi':'Þú'}: ${c.label}, ${value!==null?`${value} skráð stig`:possible?`${preview[c.id]} stig í boði`:'laus reitur'}. ${c.description}`);
    }
  }
  const a=totals(state.players[0].scores),b=totals(state.players[1].scores);
  $('you-total').textContent=a.total;$('mosi-total').textContent=b.total;$('you-bonus').textContent=a.bonus;$('mosi-bonus').textContent=b.bonus;
  $('upper-copy').textContent=`${a.upper} / 63 · ${b.upper} / 63`;$('you-progress').style.width=`${Math.min(100,a.upper/63*100)}%`;$('mosi-progress').style.width=`${Math.min(100,b.upper/63*100)}%`;
  $('round').textContent=`UMFERÐ ${Math.min(15,Math.floor(state.turnCount/2)+1)} / 15`;
  $('you-card').classList.toggle('current',who===0);$('mosi-card').classList.toggle('current',who===1);
  $('turn-label').textContent=!started?'Velkomin að borðinu':state.status==='finished'?'Leik lokið':phase==='handoff'?'Stig skráð':who?'Mosi á leik':'Þú átt leik';document.querySelector('.turn').classList.toggle('ai',who===1);
  const canRoll=human&&state.rollCount<3&&!state.held.every(Boolean)&&lessonAllows('roll')&&(!lesson||lessonReady());
  $('roll').disabled=!canRoll;$('advice').disabled=!human||state.rollCount===0;
  $('roll-label').textContent=phase==='rolling'?'Teningarnir rúlla…':who===1&&state.status==='playing'?'Mosi hugsar…':state.status==='finished'?'Leik lokið':state.rollCount===0?'Kasta teningum':state.rollCount===3?'Veldu stigareit':'Kasta aftur';
  $('roll-count').textContent=`${3-state.rollCount} ${3-state.rollCount===1?'kast':'köst'} eftir`;
  $('hint').textContent=state.status==='finished'?'Vel gert! Þið hafið fyllt allt stigablaðið.':who===1?'Fylgstu með hvaða teninga Mosi geymir.':phase==='rolling'?'Hristum ílátið og látum vaða!':state.rollCount===0?'Smelltu á svarta ílátið til að kasta.':state.rollCount===3?'Veldu ljósan reit í þínum dálki.':state.held.every(Boolean)?'Allir geymdir. Veldu stig eða losaðu tening.':'Geymdu teninga, smelltu á ílátið eða skráðu stig.';
  cupButton.setAttribute('aria-label',state.rollCount===0?'Kasta teningum úr svarta ílátinu':'Hrista ílátið og kasta aftur');
  cupButton.dataset.parked=String(state.rollCount>0);
  $('cup-label').textContent=state.rollCount===0?'Smelltu til að kasta':'Kasta aftur';
  for(let i=0;i<5;i++){
    const b=dieButtons[i],value=state.dice[i],held=state.held[i];
    b.disabled=!(human&&state.rollCount>0&&state.rollCount<3&&lessonAllows('hold',i)&&(!lesson||lessonReady()));
    b.classList.toggle('held',held);b.dataset.value=String(value);b.setAttribute('aria-pressed',String(held));
    b.setAttribute('aria-label',`Teningur ${i+1}: ${value}, ${DINO_FACES[value-1]?.name||''}. ${held?'Losa':'Geyma'}`);
  }
  syncCupReady();
  renderLesson();
  updateTargets();
}
function placeTarget(button,target,index){
  const pixel=targetPixels[index],x=Math.round(target.x*targetWidth*4)/4,y=Math.round(target.y*targetHeight*4)/4;
  if(pixel.x!==x||pixel.y!==y){pixel.x=x;pixel.y=y;button.style.transform=`translate3d(${x}px,${y}px,0)`;}
}
function updateTargets(){
  if(!dice||!world)return;
  for(const target of dice.screenPositions()){
    const b=dieButtons[target.index],hidden=!started||!target.visible||state.rollCount===0||phase==='rolling'||phase==='handoff';
    if(b.hidden!==hidden)b.hidden=hidden;if(hidden)continue;
    placeTarget(b,target,target.index);
    const pixel=targetPixels[target.index],minimum=targetWidth<=700?46:62;
    const width=Math.max(minimum,Math.ceil((target.right-target.left)*targetWidth+10)),height=Math.max(minimum,Math.ceil((target.bottom-target.top)*targetHeight+10));
    const top=Math.floor((target.top-target.y)*targetHeight),bottom=Math.ceil((target.bottom-target.y)*targetHeight);
    if(pixel.width!==width){pixel.width=width;b.style.width=`${width}px`;}
    if(pixel.height!==height){pixel.height=height;b.style.height=`${height}px`;}
    if(pixel.top!==top){pixel.top=top;b.style.setProperty('--die-top',`${top}px`);}
    if(pixel.bottom!==bottom){pixel.bottom=bottom;b.style.setProperty('--die-bottom',`${bottom}px`);}
  }
  if(!cupButton.disabled){
    // Keep the reroll affordance out of the way until the result or hold move settles.
    if(state.rollCount>0&&(pendingDiceView>=0||world.isViewTransitioning())){if(!cupButton.hidden)cupButton.hidden=true;return;}
    const target=dice.screenCupPosition();if(cupButton.hidden===target.visible)cupButton.hidden=!target.visible;
    if(target.visible){
      const parked=state.rollCount>0;
      cupAnchor.x=parked?(target.left+target.right)*.5:target.x;cupAnchor.y=parked?(target.top+target.bottom)*.5:target.y;
      placeTarget(cupButton,cupAnchor,5);
      const pixel=targetPixels[5],padding=parked?4:22,minimum=parked?44:64;
      const width=Math.ceil(Math.max(minimum,(parked?target.right-target.left:target.width)*targetWidth+padding)),height=Math.ceil(Math.max(minimum,(parked?target.bottom-target.top:target.height)*targetHeight+padding));
      if(pixel.width!==width){pixel.width=width;cupButton.style.width=`${width}px`;}
      if(pixel.height!==height){pixel.height=height;cupButton.style.height=`${height}px`;}
    }
  }
}
function toggleHold(index){
  if(!isHuman()||state.rollCount<1||state.rollCount>=3||!lessonAllows('hold',index)||(lesson&&!lessonReady()))return;
  state=hold(state,index);dice.setHeld(state.held);world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();audio.cue(state.held[index]?'hold':'release',{index});
  if(lesson){lesson=advanceLesson(lesson,state,'hold',index);lessonNeedsFocus=true;}
  if(state.held[index])effects.emit(dice.dice[index].position,{kind:'hold',reduced});renderUI();
}
function beginRoll(teachingMosi=false){
  if(!started||paused||state.status!=='playing'||phase==='rolling'||state.rollCount>=3||state.held.every(Boolean))return;
  if(lesson&&!(teachingMosi&&lessonStep(lesson).type==='opponent')&&(!lessonAllows('roll')||!lessonReady()))return;
  state=lesson?rollLesson(lesson,state):roll(state);save();phase='rolling';timer=0;recent=null;view('table');audio.unlock();dice.startRoll(state.dice,state.held,state.currentPlayer,reduced);opponent.react('anticipate');renderUI();
}
function rolled(){
  const feedback=rollFeedback(state);opponent.react(feedback.kind);audio.cue(feedback.kind==='yatzy'?'win':feedback.kind);
  if(['great','yatzy','bad'].includes(feedback.kind))effects.emit({x:0,y:world.table.y+.15,z:0},{kind:feedback.kind,reduced});
  else if(feedback.kind==='good')for(const die of dice.dice)effects.emit(die.position,{kind:'settle',reduced});
  setNotice(feedback.kicker,feedback.text,3.3);
  // Let the face reaction read before travelling to the result, then leave the view still for choices.
  if(reduced)view('dice',true);else pendingDiceView=.7;
  // Leave the final close view readable before Mosi chooses his next action.
  phase=state.currentPlayer===0?'human':lesson?'tutorial-opponent':'ai-wait';timer=lesson?2.65:reduced?.35:2.65;
  if(lesson&&state.currentPlayer===0)lesson=advanceLesson(lesson,state,'rolled');renderUI();
}
function chooseScore(categoryId){
  if(!isHuman()||state.rollCount===0||state.players[0].scores[categoryId]!==null||!lessonAllows('score',categoryId)||(lesson&&!lessonReady()))return;
  const points=previews(state)[categoryId];if(points===0){zeroCategory=categoryId;$('zero-title').textContent=`Skrá 0 í ${CATEGORIES.find(c=>c.id===categoryId).label}?`;openDialog('zero-dialog');return;}
  record(categoryId);
}
function record(categoryId){
  if(lesson&&!((phase==='tutorial-opponent'&&lessonStep(lesson).category===categoryId)||lessonAllows('score',categoryId)))return;
  const player=state.currentPlayer,points=previews(state)[categoryId],category=CATEGORIES.find(c=>c.id===categoryId);
  if(lesson){
    state=score(state,categoryId);recent={id:categoryId,player};lesson=advanceLesson(lesson,state,player?'opponentDone':'score',categoryId);
    phase=state.currentPlayer===0?'human':'tutorial';timer=0;dice.sync(state.dice,state.held,state.currentPlayer,{animate:!reduced});view('table');
    effects.emit({x:0,y:world.table.y+.22,z:0},{kind:'score',reduced});audio.cue('score');opponent.react('good');renderUI();return;
  }
  state=score(state,categoryId);save();recent={id:categoryId,player};phase='handoff';timer=reduced?.45:1.8;view('table');
  effects.emit({x:0,y:world.table.y+.22,z:0},{kind:points?'score':'bad',strength:points?1:.3,reduced});audio.cue(points?'score':'bad');opponent.react(points>=20?'great':points===0?'bad':'good');
  setNotice(player?'MOSI SKRÁÐI STIG':'VEL GERT',`${category.label} · ${points} stig`,3);renderUI();
}
function setResultCopy(){
    const a=totals(state.players[0].scores).total,b=totals(state.players[1].scores).total;
    $('win-title').textContent=state.winner==='tie'?'Jafntefli!':state.winner==='you'?'Þú vannst!':'Mosi vann í þetta sinn!';
    $('win-copy').textContent=`Þú: ${a} stig · Mosi: ${b} stig. Takk fyrir góða stund við borðið.`;
}
function advanceTurn(){
  if(state.status==='finished'){
    phase='finished';setResultCopy();
    opponent.react('win');effects.emit({x:0,y:world.table.y+.5,z:0},{kind:'score',reduced});audio.cue('win');timer=1.8;renderUI();return;
  }
  recent=null;dice.sync(state.dice,state.held,state.currentPlayer,{animate:!reduced});phase=state.currentPlayer===0?'human':'ai-wait';timer=reduced?.3:.9;aiDecision=null;audio.cue('turn');renderUI();
}
function aiStep(){
  if(lesson||state.currentPlayer!==1||state.status!=='playing')return;
  if(phase==='ai-wait'){
    aiDecision=decideAI(state);
    if(aiDecision.type==='score'){phase='ai-score';timer=reduced?.3:.85;setNotice('MOSI VELUR',CATEGORIES.find(c=>c.id===aiDecision.categoryId).label,1.8);}
    else if(state.rollCount===0)beginRoll();
    else{
      for(let i=0;i<5;i++)if(state.held[i]!==aiDecision.held[i]){state=hold(state,i,aiDecision.held[i]);if(state.held[i])audio.cue('hold',{index:i,strength:.7});}
      dice.setHeld(state.held);world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();phase='ai-hold';timer=reduced?.2:.85;setNotice('MOSI HUGSAR',state.held.some(Boolean)?'Ég geymi þessa vini.':'Ég prófa aftur!',1.5);
    }
  }else if(phase==='ai-hold')beginRoll();else if(phase==='ai-score')record(aiDecision.categoryId);
  renderUI();
}
function renderLesson(){
  const panel=$('tutorial-coach'),step=lesson?lessonStep(lesson):null;
  panel.hidden=!lesson;$('game').dataset.tutorial=String(Boolean(lesson));$('game').dataset.lessonType=step?.type||'';
  for(const button of [...dieButtons,cupButton,$('roll'),...Array.from(cells.values(),pair=>pair[0])])button.classList.remove('tutorial-target');
  if(!lesson){lessonPainted=-1;return;}
  panel.dataset.step=step.id;panel.dataset.chapter=String(step.chapter);
  $('turn-label').textContent='Æfing með Mosa';$('round').textContent='KENNSLA';document.querySelector('.turn').classList.remove('ai');
  $('tutorial-progress').textContent=`${step.chapter} · ${lesson.index+1} / ${LESSON_STEPS.length}`;
  $('tutorial-title').textContent=step.title;$('tutorial-copy').textContent=step.copy;
  $('tutorial-task').textContent=phase==='rolling'?'Horfum á teningana rúlla…':step.task||'';
  $('hint').textContent=$('tutorial-task').textContent;
  $('tutorial-feedback').textContent=lesson.feedback||'';$('tutorial-feedback').hidden=!lesson.feedback;
  const correct=step.type==='quiz'&&step.choices[lesson.answer]?.correct;
  $('tutorial-next').hidden=!['next','quiz','finish'].includes(step.type);
  $('tutorial-next').disabled=step.type==='quiz'&&!correct;
  $('tutorial-next').textContent=step.type==='finish'?(lessonReturn?.started||saved?'Halda áfram að spila':'Spila við Mosa'):'Áfram';
  $('tutorial-repeat').hidden=step.type!=='finish';
  if(lessonPainted!==lesson.index){
    lessonPainted=lesson.index;lessonNeedsFocus=true;panel.scrollTop=0;
    $('tutorial-example').replaceChildren();$('tutorial-choices').replaceChildren();
    for(const value of step.example||[]){
      const die=document.createElement('span'),number=document.createElement('span'),img=document.createElement('img');die.className='lesson-die';
      number.textContent=String(value);img.src=`./assets/${DINO_FACES[value-1].image}`;img.alt='';die.append(number,img);$('tutorial-example').append(die);
    }
    if(step.id==='upper-bonus'){
      const reward=document.createElement('div');reward.className='lesson-bonus';reward.textContent='63 stig efst → 🎁 +50 aukastig';$('tutorial-example').append(reward);
    }
    $('tutorial-example').hidden=!step.example?.length&&step.id!=='upper-bonus';
    for(const [index,choice]of(step.choices||[]).entries()){
      const button=document.createElement('button');button.type='button';button.className='lesson-choice';button.textContent=choice.label;
      button.addEventListener('click',()=>answerLesson(index));$('tutorial-choices').append(button);
    }
  }
  for(const [index,button]of Array.from($('tutorial-choices').children).entries()){
    button.disabled=Boolean(correct);button.classList.toggle('correct',lesson.answer===index&&Boolean(correct));
    button.classList.toggle('try-again',lesson.answer===index&&!correct);button.setAttribute('aria-pressed',String(lesson.answer===index));
  }
  lessonWaiting=!lessonReady();
  if(!lessonWaiting){
    if(step.type==='roll'){if(!cupButton.hidden)cupButton.classList.add('tutorial-target');$('roll').classList.add('tutorial-target');}
    if(step.type==='hold')for(const index of step.indices)if(lessonAllows('hold',index))dieButtons[index].classList.add('tutorial-target');
    if(step.type==='score')cells.get(step.category)[0].classList.add('tutorial-target');
  }
}
function focusLesson(){
  if(!lesson||!lessonNeedsFocus||!lessonReady())return;
  const step=lessonStep(lesson);let target=$('tutorial-title');
  if(step.type==='next'||step.type==='finish'||(step.type==='quiz'&&step.choices[lesson.answer]?.correct))target=$('tutorial-next');
  else if(step.type==='quiz')target=$('tutorial-choices').children[0];
  else if(step.type==='roll')target=$('roll');
  else if(step.type==='hold')target=dieButtons[step.indices.find(index=>lessonAllows('hold',index))]||target;
  else if(step.type==='score'){target=cells.get(step.category)[0];target.scrollIntoView({block:'center',behavior:reduced?'instant':'smooth'});}
  if(lessonFocusTarget&&lessonFocusTarget!==target)lessonFocusTarget.removeAttribute('aria-describedby');
  lessonFocusTarget=target;target.setAttribute('aria-describedby','tutorial-copy tutorial-task');target.focus({preventScroll:true});lessonNeedsFocus=false;
}
function beginLesson(repeat=false){
  if(!world||(!repeat&&lesson))return;
  if(!repeat)lessonReturn={state:structuredClone(state),started,recent};
  lesson=createLesson();lessonPainted=-1;lessonNeedsFocus=true;audio.cancel();effects.clear();opponent.reset();zeroCategory=null;recent=null;aiDecision=null;
  state=createGame({seed:606});started=true;phase='human';timer=0;dice.sync(state.dice,state.held,0);view('table',true);$('controls').hidden=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();syncPause();audio.unlock();renderUI();focusLesson();
}
function leaveLesson(play=false){
  if(!lesson)return;
  if(lessonFocusTarget){lessonFocusTarget.removeAttribute('aria-describedby');lessonFocusTarget=null;}
  const previous=lessonReturn;lesson=null;lessonReturn=null;lessonWaiting=false;lessonNeedsFocus=false;
  audio.cancel();effects.clear();opponent.reset();zeroCategory=null;aiDecision=null;
  state=previous.state;started=previous.started;recent=previous.recent;
  phase=!started?'intro':state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.9;
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0?'dice':'table',true);$('controls').hidden=!started;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();syncPause();renderUI();
  if(!started){$('continue').hidden=!saved;if(play)start(Boolean(saved));else openDialog('welcome');}
  else{if(state.status==='finished')setResultCopy();$('help').focus({preventScroll:true});}
}
function nextLesson(){
  if(!lesson||paused)return;
  if(lessonStep(lesson).type==='finish'){leaveLesson(true);return;}
  if(!lessonAllows('next'))return;
  lesson=advanceLesson(lesson,state,'next');audio.cue('tap');
  if(lessonStep(lesson).type==='opponent'){
    dice.sync(state.dice,state.held,state.currentPlayer);phase='tutorial';beginRoll(true);
  }else renderUI();focusLesson();
}
function answerLesson(index){
  if(!lesson||paused||!lessonAllows('answer',index))return;
  lesson=advanceLesson(lesson,state,'answer',index);
  if(lessonStep(lesson).choices[lesson.answer]?.correct){audio.cue('good');opponent.react('good');lessonNeedsFocus=true;}else audio.cue('tap');
  renderUI();$('tutorial-coach').scrollTop=$('tutorial-coach').scrollHeight;focusLesson();
}
function start(continuing=false){
  if(lesson)leaveLesson();
  audio.cancel();effects.clear();opponent.reset();zeroCategory=null;recent=null;aiDecision=null;
  if(continuing&&saved)state=saved;else{const seed=crypto.getRandomValues(new Uint32Array(1))[0];state=createGame({seed});}
  started=true;phase=state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.9;if(state.status==='finished')setResultCopy();
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0&&state.status==='playing'?'dice':'table',true);$('controls').hidden=false;audio.unlock();save();
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();syncPause();renderUI();
  setNotice('SETJUMST AÐ BORÐINU',continuing?'Höldum áfram þar sem frá var horfið.':'Gaman að sjá þig! Þú mátt byrja.',4);
}
function advice(){
  if(lesson||!isHuman()||state.rollCount===0)return;
  const suggestion=decideAI(state);
  if(suggestion.type==='score'){const c=CATEGORIES.find(c=>c.id===suggestion.categoryId);setNotice('TILLAGA',`${c.label} gefur ${previews(state)[c.id]} stig.`,5);cells.get(c.id)[0].focus({preventScroll:true});cells.get(c.id)[0].scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'});}
  else{const list=suggestion.held.flatMap((on,i)=>on?[String(state.dice[i])]:[]);setNotice('TILLAGA',list.length?`Prófaðu að geyma teninga með ${list.join(' · ')}.`:'Prófaðu að kasta öllum aftur.',5);}
  audio.cue('tap');
}
$('start').addEventListener('click',()=>start());$('continue').addEventListener('click',()=>start(true));$('play-again').addEventListener('click',()=>start());
$('learn').addEventListener('click',()=>beginLesson());$('learn-help').addEventListener('click',()=>beginLesson(Boolean(lesson)));
$('tutorial-next').addEventListener('click',nextLesson);$('tutorial-exit').addEventListener('click',()=>leaveLesson());$('tutorial-repeat').addEventListener('click',()=>{if(lesson&&!paused)beginLesson(true);});
$('roll').addEventListener('click',()=>{if(isHuman())beginRoll();});$('advice').addEventListener('click',advice);
cupButton.addEventListener('click',event=>{
  if(!isHuman()||cupButton.hidden||cupButton.disabled)return;
  if(state.rollCount>0){
    if(pendingDiceView>=0||world.isViewTransitioning())return;
    // Protect near-miss taps around a die even if a moving/resized cup received the event.
    // Keyboard activation has no pointer coordinates and remains available.
    if(event.detail>0){
      const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      for(let i=0;i<5;i++){
        const b=dieButtons[i],pixel=targetPixels[i];
        if(!b.hidden&&!b.disabled&&Math.abs(x-pixel.x)<=pixel.width*.5+8&&Math.abs(y-pixel.y)<=pixel.height*.5+8)return;
      }
    }
  }
  beginRoll();
});
$('sound').addEventListener('click',()=>{muted=!muted;audio.mute(muted);audio.unlock();savePrefs();});
$('motion').addEventListener('click',()=>{reduced=!reduced;dice?.setReducedMotion(reduced);if(reduced){effects?.clear();view(pendingDiceView>=0?'dice':world.getViewState().mode,true);}savePrefs();});
$('pause').addEventListener('click',()=>{if(started)openDialog('pause-dialog');});$('help').addEventListener('click',()=>openDialog('help-dialog'));
$('new-game').addEventListener('click',()=>{if(lesson)leaveLesson();closeDialog('pause-dialog');$('continue').hidden=!saved;openDialog('welcome');});
$('confirm-zero').addEventListener('click',()=>{const id=zeroCategory;zeroCategory=null;closeDialog('zero-dialog');if(id&&isHuman())record(id);});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{b.closest('dialog').close();syncPause();}));
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',syncPause);d.addEventListener('cancel',e=>{if(d.id==='welcome'&&!started)e.preventDefault();});});
document.addEventListener('visibilitychange',syncPause);
document.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(/^[1-5]$/.test(event.key)&&isHuman()){event.preventDefault();toggleHold(Number(event.key)-1);}
  else if(event.code==='Space'&&isHuman()&&document.activeElement?.tagName!=='BUTTON'){event.preventDefault();beginRoll();}
  else if(event.code==='Escape'&&started&&!paused){event.preventDefault();openDialog('pause-dialog');}
});
function cleanupScene(){effects?.dispose();dice?.dispose();opponent?.dispose();world?.dispose();}
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();audio.dispose();cleanupScene();}
addEventListener('pagehide',dispose,{once:true});addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

async function initialize(){
  try{
    await document.fonts.ready;if(disposed)return;world=await createYatzyWorld($('table'));if(disposed){cleanupScene();return;}effects=createYatzyEffects(world);
    const resources=await Promise.allSettled([createMosiOpponent(world,{tableY:world.table.y,farZ:world.table.farZ}),createDiceAndCup(world,{onEvent(kind,data){audio.cue(kind,{strength:data.strength,pan:data.position.x/3});if(['impact','sweep','release','settle'].includes(kind))effects.emit(data.position,{kind,strength:data.strength,reduced});}})]);
    if(resources[0].status==='fulfilled')opponent=resources[0].value;if(resources[1].status==='fulfilled')dice=resources[1].value;
    if(disposed){cleanupScene();return;}const failed=resources.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    dice.setReducedMotion(reduced);
    world.update(0,0);opponent.update(.001,0,{reducedMotion:reduced});world.scene.updateMatrixWorld(true);world.resize();
    dice.dice.forEach(d=>{d.visible=true;});await world.renderer.compileAsync(world.scene,world.camera);if(disposed){cleanupScene();return;}world.render();dice.sync(state.dice,state.held,state.currentPlayer);world.render();$('loading').hidden=true;$('continue').hidden=!saved;savePrefs();renderUI();openDialog('welcome');
    const measureTargets=()=>{targetWidth=canvas.clientWidth;targetHeight=canvas.clientHeight;};measureTargets();
    let dirty=true;resizeObserver=new ResizeObserver(()=>{measureTargets();dirty=true;updateTargets();});resizeObserver.observe(canvas);
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{dirty=true;}));
    const tick=now=>{
      if(disposed)return;
      const real=Math.max(0,(now-last)/1000),dt=Math.min(.05,real);last=now;
      if(!paused){
        elapsed+=dt;timer-=dt;noticeTime-=dt;if(momentVisible&&noticeTime<=0){moment.style.opacity='0';momentVisible=false;}
        if(pendingDiceView>=0){pendingDiceView-=dt;if(pendingDiceView<=0)view('dice');}
        if(phase==='rolling'&&dice.update(dt))rolled();else if(phase!=='rolling')dice.update(dt);
        if(timer<=0){if(phase==='tutorial-opponent'&&lesson)record(lessonStep(lesson).category);else if(phase==='handoff')advanceTurn();else if(phase.startsWith('ai-'))aiStep();else if(phase==='finished'&&timer>-10){timer=-100;openDialog('win-dialog');}}
        opponentFrame.thinking=phase==='ai-wait'||phase==='ai-score';opponentFrame.rolling=phase==='rolling';
        opponentFrame.target=opponentFrame.rolling?dice.getFocusTarget():null;opponentFrame.reducedMotion=reduced;
        opponent.update(dt,elapsed,opponentFrame);
        effects.update(dt);world.update(reduced?0:dt,elapsed);world.render();
        if(lesson&&lessonWaiting&&lessonReady())renderUI();focusLesson();updateTargets();dirty=false;
      }else if(dirty){world.render();updateTargets();dirty=false;}
      frame=requestAnimationFrame(tick);
    };
    last=performance.now();frame=requestAnimationFrame(tick);
    if(new URLSearchParams(location.search).has('qa'))window.__yatzyQA={
      world,dice,opponent,effects,audio,getState:()=>structuredClone(state),getStatus:()=>({phase,paused,reduced,started,timer}),freeze(value){qaFrozen=Boolean(value);syncPause();},
      getTutorial:()=>lesson?{active:true,...structuredClone(lesson),...structuredClone(lessonStep(lesson)),index:lesson.index}:{active:false},
      setState(value){validateGame(value);state=structuredClone(value);started=true;audio.cancel();effects.clear();opponent.reset();recent=null;aiDecision=null;phase=state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.8;if(state.status==='finished')setResultCopy();dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0&&state.status==='playing'?'dice':'table',true);$('controls').hidden=false;for(const d of document.querySelectorAll('dialog[open]'))d.close();syncPause();renderUI();},
      getSnapshot:()=>({dice:dice.getDebugState(),opponent:opponent.getDebugState(),effects:effects.getStats(),audio:audio.getStats(),render:world.getStats(),view:world.getViewState()}),dispose,
    };
  }catch(error){cleanupScene();if(!disposed){console.error('Yatzy initialization failed',error);$('loading').hidden=true;$('error').hidden=false;}}
}
initialize();
