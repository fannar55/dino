import {createYatzyWorld} from '../yatzy-mosi/world.js';
import {createMosiOpponent} from '../yatzy-mosi/opponent.js';
import {createDiceAndCup,DINO_FACES} from '../yatzy-mosi/dice.js';
import {createYatzyEffects} from '../yatzy-mosi/effects.js';
import {createYatzyAudio} from '../yatzy-mosi/audio.js';
import {CATEGORIES,createGame,roll,hold,score,scoringDice,previews,totals,decideAI,restoreGame,validateGame} from './rules.js';
import {LESSON_STEPS,allowsAction} from './lesson.js';
import {VOICE_LINES} from './voice-lines.js';
import {createJuniorVoice} from './voice.js';
import {waitForStartup} from './startup.js';

const $=id=>document.getElementById(id),SAVE='mosi.yatzy.junior.save.v1',PREFS='mosi.yatzy.junior.prefs.v1';
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage is optional. */}};
// Seated at the near rail and a little higher than Mosi Yatzy's shot, so the held row clears the cards along the bottom and Mosi's
// whole head stays in view. On a screen narrower than 16:10 the camera backs away until the table is as wide as there (the cup's
// tag stays on screen); upright, until the cup and both ends of the held row fit.
const TABLE_SHOT=Object.freeze({position:[-.28,3.6,4.9],target:[-.28,1.48,-.42],fov:41,pull:aspect=>aspect>=1?Math.max(1,1.6/aspect):1.14/aspect,
  cup:[-1.85,.6],footprint:.26,ring:.4,elevation:54,safe:diceMargins});
// The dice view fits the dice into the free part of the screen, measured from the page on every resize: under the players' bar and
// Mosi's bubble band, over the cards' top edge with everything that sticks up over it (the badges, the chips, the best card's lift),
// 24 px clear of all of it and of the sides. What is drawn round a die (its number chip, a held die's gold frame and check, the
// held ring at its foot) and round the cup (its gold ring, and the Kasta tag over it) is counted in too: the zoom shrinks rather
// than let anything touch.
function diceMargins(width,height){
  const $$=selector=>[...document.querySelectorAll(selector)].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
  const screen=document.getElementById('table')?.getBoundingClientRect(),cards=$$('#score-rows .card-select');
  if(!screen?.height||!cards.length)return null;
  const u=document.querySelector('#score-rows .card-select').offsetWidth/176,clear=24,phone=width<=560,coach=document.getElementById('lesson-center');
  const cardTop=Math.min(...cards.map(r=>r.top))-(16+14)*u-4; // a badge sticks up 16u over a card and the best card lifts 14u more
  // The players' bar: on a wide screen the dice keep beside it (the bubble's band runs along the top beside it), on an upright one
  // or a phone below it.
  const bar=$$('.player-card, .rounds'),barBottom=Math.max(...bar.map(r=>r.bottom)),barRight=Math.max(...bar.map(r=>r.right)),below=phone||height>width;
  const bandBottom=(phone?coach.offsetTop:14)+Math.max(coach.offsetHeight,104)+8; // the bubble over the dice (yatzy-junior.css)
  const top=below?Math.max(barBottom,bandBottom):bandBottom;
  return {top:top+clear-screen.top,bottom:screen.bottom-cardTop+clear,left:(below?0:barRight-screen.left)+clear,right:clear,
    die:{top:52,bottom:12,side:22}, // the number chip over a die; a held die's frame, its check and its glow
    ring:{top:(phone?58:76)+26,bottom:10,side:10}}; // the Kasta tag over the ring, 12 px clear of it
}
// The cup waits at the left of the table (not in front of Mosi, where his bubble is) and rests a little further back after a roll;
// the held row sits a little nearer the middle and to the right, so the cup's gold ring, the held dice and the cards never touch.
const TABLE_LAYOUT=Object.freeze({home:[-1.7,.45,.6],park:[-1.85,.6],held:{left:-1.0,step:.58,near:1.2}});
const prefs=read(PREFS)||{},EXAMPLES={pair:[2,2],twoPairs:[2,2,4,4],threeKind:[3,3,3],smallStraight:[1,2,3,4,5],yatzy:[5,5,5,5,5]};
// Full Icelandic speech is separate from its brief reading support.
const CAPTIONS={welcomeMenu:'Hæ! Spilum saman.',yourTurn:'Þú átt leik!',mosiTurn:'Mosi á leik.',hold:'Geymdur!',release:'Laus aftur.',choose:'Veldu kort.',lastRoll:'Eitt kast eftir.',noRolls:'Veldu laust kort.',allHeld:'Allir geymdir!',zero:'Nota kortið fyrir 0 stig?',scored:'Stigin þín!',mosiScored:'Stigin hans Mosa!',good:'Gott kast!',great:'Vá!',bad:'Prófum aftur.',youWin:'Þú vannst!',mosiWin:'Mosi vann!',tie:'Jafntefli!',help:'Kasta · geyma · velja kort',pause:'Mosi bíður.',resume:'Höldum áfram!',pairHelp:'Par = 2 eins.',twoPairsHelp:'Tvö pör = 2 eins + 2 aðrir eins.',threeKindHelp:'Þrír teningar eins.',smallStraightHelp:'Röð: 1 · 2 · 3 · 4 · 5',yatzyHelp:'Yatzy = 5 eins.',yourTotal:'Þú fékkst',mosiTotal:'Mosi fékk'};
let muted=prefs.muted===true,reduced=typeof prefs.reduced==='boolean'?prefs.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio=createYatzyAudio();audio.mute(muted);
let world,opponent,dice,effects,voice,voiceManifest={},state=createGame(),saved=restoreGame(read(SAVE));
let phase='intro',timer=0,elapsed=0,last=performance.now(),frame=0,started=false,paused=true,disposed=false,qaFrozen=false,resizeObserver;
let pendingDiceView=-1,aiDecision=null,zeroCategory=null,recent=null,lesson=null,lessonReturn=null,lessonAdvance=-1,readyLast=false,captionTime=0,modalNarration=false;
let lessonFocus='';const chipHold=[null,null];
const cells=new Map(),dieButtons=[],canvas=$('table'),cupButton=$('cup-target'),coach=$('lesson-center'),roundPips=[...document.querySelectorAll('#rounds i')];
const pixels=Array.from({length:6},()=>({x:NaN,y:NaN,width:NaN,height:NaN,top:NaN,bottom:NaN}));
const cupAnchor={x:0,y:0},opponentFrame={thinking:false,rolling:false,target:null,reducedMotion:reduced};
let targetWidth=0,targetHeight=0;

function miniDice(values){
  const fragment=document.createDocumentFragment();
  for(const value of values){const tile=document.createElement('span'),img=document.createElement('img'),number=document.createElement('b');tile.className='mini-die';img.src=`./assets/${DINO_FACES[value-1].image}`;img.alt='';number.textContent=value;tile.append(img,number);fragment.append(tile);}
  return fragment;
}
for(const category of CATEGORIES){
  const card=document.createElement('div');card.className='junior-card';card.dataset.category=category.id;
  const select=document.createElement('button');select.type='button';select.className='card-select';select.dataset.category=category.id;
  const picture=document.createElement('span');picture.className='card-picture';picture.setAttribute('aria-hidden','true');picture.append(miniDice(EXAMPLES[category.id]));
  const name=document.createElement('span');name.className='card-name';name.textContent=category.label;
  const rule=document.createElement('span');rule.className='card-rule';rule.textContent=category.id==='smallStraight'?'1 · 2 · 3 · 4 · 5':category.id==='twoPairs'?'2 eins + 2 aðrir eins':category.id==='pair'?'2 eins':category.id==='threeKind'?'3 eins':'5 eins';
  const value=document.createElement('strong');value.className='card-value';const scores=document.createElement('span');scores.className='card-scores';scores.setAttribute('aria-hidden','true');
  // The card is the tap target: one that cannot be chosen now lets the tap through (yatzy-junior.css), and Mosi says what it is.
  card.addEventListener('click',event=>{if(!event.target.closest('.card-select')&&!lesson&&!paused){enableNarration();say(`${category.id}Help`);}});
  select.append(picture,name,rule,value);select.addEventListener('click',()=>chooseScore(category.id));card.append(select,scores);$('score-rows').append(card);cells.set(category.id,{card,select,picture,value,scores,shown:'',pictured:''});
}
for(let i=0;i<5;i++){
  const button=document.createElement('button');button.type='button';button.className='die-target';button.hidden=true;button.dataset.index=i;button.innerHTML='<span>Geymdur</span><i class="die-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>';
  button.addEventListener('click',()=>toggleHold(i));$('dice-targets').append(button);dieButtons.push(button);
}
const step=()=>lesson?LESSON_STEPS[lesson.index]:null;
const isHuman=()=>started&&!paused&&phase==='human'&&state.currentPlayer===0&&state.status==='playing';
const settled=()=>!!world&&phase!=='rolling'&&pendingDiceView<0&&!world.isViewTransitioning();
const allowed=(action,value)=>!lesson||(!voice?.unavailable&&allowsAction(step(),action,value));
function save(){if(lesson)return;write(SAVE,state);saved=restoreGame(state);}
function savePrefs(){write(PREFS,{muted,reduced});$('sound-label').textContent=muted?'Hljóð af':'Hljóð á';$('sound').setAttribute('aria-pressed',String(muted));$('sound').setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');$('motion').textContent=reduced?'Venjuleg hreyfing':'Rólegri hreyfing';$('motion').setAttribute('aria-pressed',String(reduced));cupButton.dataset.motion=reduced?'reduced':'full';}
function enableNarration(){muted=false;audio.mute(false);voice?.mute(false);audio.unlock();savePrefs();}
function syncVoiceRecovery(){
  const recovery=$('voice-recovery'),unavailable=Boolean(voice?.unavailable);
  if(recovery.hidden===unavailable)recovery.hidden=!unavailable;
  if(!unavailable)return;
  const parent=document.querySelector('dialog[open]')||coach;
  if(recovery.parentElement!==parent)parent.append(recovery);
  if(parent===coach)coach.hidden=false;
}
// After a roll the camera rises over the dice and closes in on them (the 'dice' view), between the players' bar and the cards
// (TABLE_SHOT.safe); it goes back to the table, Mosi in view, when the turn moves on. #game[data-view] tells the page which.
function view(mode,snap=reduced){pendingDiceView=-1;$('game').dataset.view=mode;if(mode==='dice')world?.setDiceFocus(dice.getFramingPoints(),{snap});world?.setView(mode,{reduced:snap});}
function syncPause(){paused=qaFrozen||document.hidden||Boolean(document.querySelector('dialog[open]'));audio.pause(paused);voice?.pause(qaFrozen||document.hidden||(paused&&!modalNarration));cupButton.dataset.paused=String(paused);last=performance.now();if(world)renderUI();}
function openDialog(id,line){if(line){voice?.stop();modalNarration=true;lessonAdvance=-1;}if(!$(id).open)$(id).showModal();syncPause();if(line)saySequence(Array.isArray(line)?line:[line]);}
function closeDialogs(){modalNarration=false;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();syncPause();}
function say(id,onEnd){
  captionTime=0;
  return voice?.say(id,{onEnd:()=>{if(!lesson)captionTime=1.2;onEnd?.();}});
}
function speakScore(player,points){say(player?'mosiScored':'scored',()=>say(`points_${points}`));}
function saySequence(ids,index=0){if(index<ids.length)say(ids[index],()=>saySequence(ids,index+1));}
function resultSpeech(){return ['yourTotal',`points_${totals(state.players[0].scores).total}`,'mosiTotal',`points_${totals(state.players[1].scores).total}`,state.winner==='you'?'youWin':state.winner==='mosi'?'mosiWin':'tie'];}
function paintCoach(){
  const spec=step();$('game').dataset.tutorial=String(Boolean(lesson));coach.dataset.voice=voice?.getDebugState().mode||'idle';coach.dataset.phase=voice?.unavailable||(spec&&['listen','finish'].includes(spec.type))?'listen':'action';
  coach.dataset.step=spec?.id||'';$('lesson-skip').hidden=!lesson;$('lesson-next').hidden=spec?.type!=='finish';$('lesson-next').textContent='Spila!';
  $('lesson-example').hidden=true;
  if(spec){coach.hidden=false;$('lesson-line').textContent=spec.caption;}
  for(const node of [...dieButtons,cupButton,$('roll'),...Array.from(cells.values(),c=>c.select)]){node.classList.remove('tutorial-target');node.removeAttribute('aria-describedby');}
  if(!spec){lessonFocus='';return;}if(paused||!settled()||voice?.unavailable)return;
  const targets=spec.type==='roll'?[cupButton,$('roll')]:spec.type==='hold'?spec.indices.filter(i=>!state.held[i]).map(i=>dieButtons[i]):spec.type==='score'?[cells.get(spec.category).select]:[];
  for(const node of targets){node.classList.add('tutorial-target');node.setAttribute('aria-describedby','lesson-line');}
  const target=targets[0],focusKey=target?`${spec.id}:${target.id||target.dataset.index||target.dataset.category}`:'';
  if(target&&lessonFocus!==focusKey){lessonFocus=focusKey;target.focus({preventScroll:true});if(spec.type==='score')cells.get(spec.category).card.scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'});}
}
function renderUI(){
  const preview=state.rollCount?previews(state):{},human=isHuman(),who=state.currentPlayer,still=settled();
  for(const c of CATEGORIES){
    const cell=cells.get(c.id),you=lesson?(lesson.awards[c.id]??null):state.players[0].scores[c.id],mosi=lesson?null:state.players[1].scores[c.id];
    const available=you===null&&human&&state.rollCount>0&&still&&allowed('score',c.id),possible=state.rollCount>0&&phase!=='rolling'&&phase!=='handoff';
    cell.select.disabled=!available;
    // The badge is the child's: what the card would give now, or the score laid on it (teal). Who used it hangs on its top-left
    // corner: a plain "Þú" chip (the badge has the number) and Mosi's face with his.
    const chips=`${you??''}|${mosi??''}`;
    cell.value.textContent=you!==null?String(you):possible&&who===0?`+${preview[c.id]??0}`:'';cell.value.dataset.who=you!==null?'you':'';
    // The picture row shows what the child really has: the dice that score here after a roll, the dice a filled card was filled with,
    // or the card's example, dimmed when the hand does not make it (before a roll, and on Mosi's turn, the example as it is).
    let faces=EXAMPLES[c.id],dim=false;
    if(you!==null){const kept=lesson?lesson.faces[c.id]:state.players[0].faces?.[c.id];if(kept?.length)faces=kept;else dim=true;}
    else if(possible&&who===0){const live=scoringDice(c.id,state.dice);if(live.length)faces=live;else dim=true;}
    const pictured=`${dim?'-':'+'}${faces.join('')}`;if(cell.pictured!==pictured){cell.pictured=pictured;cell.picture.replaceChildren(miniDice(faces));cell.picture.classList.toggle('dim',dim);}
    if(cell.shown!==chips){cell.shown=chips;cell.scores.innerHTML=(you!==null?'<i class="who you"><span>Þú</span></i>':'')+(mosi!==null?`<i class="who mosi"><span></span><b>${mosi}</b></i>`:'');}
    cell.card.classList.toggle('filled',you!==null);cell.card.classList.toggle('available',available);cell.card.classList.toggle('best',available&&(preview[c.id]??0)>0);cell.card.classList.toggle('recent',recent===c.id);
    cell.select.setAttribute('aria-label',`${c.label}. ${you!==null?`${you} stig, notað kort`:available?`${preview[c.id]} stig í boði`:'Laust kort'}`);
  }
  $('you-total').textContent=chipHold[0]??(lesson?Object.values(lesson.awards).reduce((a,b)=>a+b,0):totals(state.players[0].scores).total);
  $('mosi-total').textContent=chipHold[1]??(lesson?0:totals(state.players[1].scores).total);
  const round=Math.min(5,Math.floor(state.turnCount/2)+1),over=state.status==='finished';$('round').textContent=lesson?'Æfum saman':`${round} af 5`;
  roundPips.forEach((pip,i)=>{pip.classList.toggle('done',over||i<round-1);pip.classList.toggle('now',!over&&i===round-1);});
  $('turn-label').textContent=lesson?'Mosi kennir þér':!started?'Spilum saman':state.status==='finished'?'Leik lokið':who?'Mosi á leik':'Þú átt leik';
  $('you-card').classList.toggle('current',who===0);$('mosi-card').classList.toggle('current',who===1);document.querySelector('.turn').classList.toggle('ai',who===1);
  const canRoll=human&&state.rollCount<3&&!state.held.every(Boolean)&&allowed('roll')&&still;
  $('roll').disabled=!canRoll;$('roll-label').textContent=phase==='rolling'?'Teningarnir rúlla…':who?'Mosi á leik':state.rollCount===3?'Veldu kort':state.rollCount===0?'Kasta':'Kasta aftur';
  $('roll-count').textContent=`${3-state.rollCount} ${3-state.rollCount===1?'kast':'köst'}`;$('hint').textContent='';
  // On the child's turn the cup keeps its ring while everything is still: gold when it can be rolled, grey when not now.
  dice?.setReady(canRoll);cupButton.disabled=!canRoll;cupButton.hidden=!(canRoll||(human&&still&&state.status==='playing'));cupButton.dataset.parked=String(state.rollCount>0);cupButton.dataset.rolls=String(3-state.rollCount);cupButton.setAttribute('aria-label',`Kasta teningunum: ${3-state.rollCount} ${3-state.rollCount===1?'kast':'köst'} eftir`);
  for(let i=0;i<5;i++){const b=dieButtons[i];b.disabled=!(human&&state.rollCount>0&&state.rollCount<3&&still&&allowed('hold',i));b.classList.toggle('held',state.held[i]);b.dataset.value=state.dice[i];b.setAttribute('aria-pressed',String(state.held[i]));b.setAttribute('aria-label',`Teningur ${i+1}: ${state.dice[i]}. ${state.held[i]?'Losa':'Geyma'}`);b.removeAttribute('aria-describedby');}
  paintCoach();updateTargets();syncVoiceRecovery();
}
// The Kasta tag stands over the cup's ring, 12 px clear of it; where something is in the way up there, it stands at its right.
let tagKey='';
function placeTag(){
  const ring=cupButton.firstElementChild.getBoundingClientRect(),tag=cupButton.querySelector('.cup-tag');
  const key=`${Math.round(ring.left)},${Math.round(ring.top)},${Math.round(ring.width)},${$('game').dataset.view},${innerWidth}`;if(!ring.width||key===tagKey)return;tagKey=key;
  const width=tag.offsetWidth,height=tag.offsetHeight+10,left=ring.left-ring.width*.04,bottom=ring.top-15,top=bottom-height,gap=12;
  const blocked=[...document.querySelectorAll('.player-card, .rounds, .corner > button, #lesson-center, #help')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0)
    .some(r=>r.left<left+width+gap&&r.right>left-gap&&r.top<bottom+gap&&r.bottom>top-gap);
  cupButton.dataset.tag=!blocked&&top>=gap&&left>=gap&&left+width<=innerWidth-gap?'above':'right';
}
function placeTarget(button,target,index){const pixel=pixels[index],x=Math.round(target.x*targetWidth*4)/4,y=Math.round(target.y*targetHeight*4)/4;if(pixel.x!==x||pixel.y!==y){pixel.x=x;pixel.y=y;button.style.transform=`translate3d(${x}px,${y}px,0)`;}}
function updateTargets(){
  if(!dice||!world)return;
  for(const target of dice.screenPositions()){
    const b=dieButtons[target.index],hidden=!started||!target.visible||state.rollCount===0||phase==='rolling'||phase==='handoff';if(b.hidden!==hidden)b.hidden=hidden;if(hidden)continue;placeTarget(b,target,target.index);
    const pixel=pixels[target.index],minimum=targetWidth<=700?46:62,width=Math.max(minimum,Math.ceil((target.right-target.left)*targetWidth+10)),height=Math.max(minimum,Math.ceil((target.bottom-target.top)*targetHeight+10));
    const top=Math.floor((target.top-target.y)*targetHeight),bottom=Math.ceil((target.bottom-target.y)*targetHeight);
    if(pixel.width!==width){pixel.width=width;b.style.width=`${width}px`;}if(pixel.height!==height){pixel.height=height;b.style.height=`${height}px`;}
    if(pixel.top!==top){pixel.top=top;b.style.setProperty('--die-top',`${top}px`);}if(pixel.bottom!==bottom){pixel.bottom=bottom;b.style.setProperty('--die-bottom',`${bottom}px`);}
  }
  if(!cupButton.hidden){
    if(state.rollCount>0&&!settled()){cupButton.hidden=true;return;}
    const target=dice.screenCupPosition();cupButton.hidden=!target.visible;
    if(target.visible){const parked=state.rollCount>0;cupAnchor.x=parked?(target.left+target.right)*.5:target.x;cupAnchor.y=parked?(target.top+target.bottom)*.5:target.y;placeTarget(cupButton,cupAnchor,5);
      const pixel=pixels[5],padding=parked?4:22,minimum=parked?44:64,width=Math.ceil(Math.max(minimum,(parked?target.right-target.left:target.width)*targetWidth+padding)),height=Math.ceil(Math.max(minimum,(parked?target.bottom-target.top:target.height)*targetHeight+padding));
      if(pixel.width!==width){pixel.width=width;cupButton.style.width=`${width}px`;}if(pixel.height!==height){pixel.height=height;cupButton.style.height=`${height}px`;}
      if(settled())placeTag();
    }
  }
}
function toggleHold(index){
  if(!isHuman()||!settled()||state.rollCount<1||state.rollCount>=3||!allowed('hold',index))return;
  state=hold(state,index);dice.setHeld(state.held);world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();audio.cue(state.held[index]?'hold':'release',{index});
  if(state.held[index])effects.emit(dice.dice[index].position,{kind:'hold',reduced});
  if(lesson){if(step().indices.every(i=>state.held[i]))nextLesson();}else say(state.held.every(Boolean)?'allHeld':state.held[index]?'hold':'release');renderUI();
}
function beginRoll(){
  if(!started||paused||state.status!=='playing'||phase==='rolling'||state.rollCount>=3||state.held.every(Boolean))return;
  if(state.currentPlayer===0&&(!isHuman()||!settled()||!allowed('roll')))return;
  voice.stop();captionTime=0;if(!lesson)coach.hidden=true;
  const previous=state;state=roll(state);
  if(lesson)state.dice=step().hand.map((face,i)=>previous.held[i]?previous.dice[i]:face);
  save();phase='rolling';timer=0;recent=null;view('table');audio.unlock();dice.startRoll(state.dice,state.held,state.currentPlayer,reduced);opponent.react('anticipate');renderUI();
}
function rolled(){
  const values=Object.values(previews(state)),best=Math.max(0,...values),kind=best>=40?'great':best>0?'good':'bad';
  opponent.react(kind);audio.cue(kind,{strength:.6});effects.emit({x:0,y:world.table.y+.15,z:0},{kind,reduced});
  if(reduced)view('dice',true);else pendingDiceView=.7;
  phase=state.currentPlayer===0?'human':'ai-wait';timer=2.6;
  if(lesson)nextLesson();else say(state.currentPlayer===1?kind:state.rollCount===3?'noRolls':state.rollCount===2?'lastRoll':'choose');renderUI();
}
function chooseScore(id){
  if(!isHuman()||!settled()||!state.rollCount||state.players[0].scores[id]!==null||!allowed('score',id))return;
  if(previews(state)[id]===0){zeroCategory=id;$('zero-title').textContent=`${CATEGORIES.find(c=>c.id===id).label}: 0 stig?`;openDialog('zero-dialog','zero');return;}record(id);
}
function flyScore(id,player,points){
  const badge=cells.get(id).value,chip=$(player?'mosi-total':'you-total'),from=badge.getBoundingClientRect(),to=chip.getBoundingClientRect();
  const pop=()=>chip.animate(reduced?[{opacity:.25},{opacity:1}]:[{scale:1},{scale:1.4},{scale:1}],{duration:reduced?420:380,easing:'cubic-bezier(.22,1,.36,1)'});
  if(reduced||!from.width||!to.width){pop();return;}
  chipHold[player]=chip.textContent; // the old total stays until the score lands
  const flyer=document.createElement('strong');flyer.className='card-value score-flyer';flyer.dataset.who=player?'mosi':'you';flyer.textContent=String(points);flyer.setAttribute('aria-hidden','true');
  Object.assign(flyer.style,{left:`${from.left}px`,top:`${from.top}px`,minWidth:`${from.width}px`,height:`${from.height}px`,fontSize:getComputedStyle(badge).fontSize});document.body.append(flyer);
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2);
  flyer.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.45}px,${dy*.45-60}px) scale(1.25)`,offset:.45},{transform:`translate(${dx}px,${dy}px) scale(.7)`,opacity:.9}],{duration:720,easing:'cubic-bezier(.45,0,.25,1)'}).finished.then(()=>{flyer.remove();chipHold[player]=null;renderUI();pop();},()=>{flyer.remove();chipHold[player]=null;});
}
function record(id){
  const player=state.currentPlayer,points=previews(state)[id];voice.stop();flyScore(id,player,points);state=score(state,id);recent=id;
  effects.emit({x:0,y:world.table.y+.2,z:0},{kind:points?'score':'bad',reduced});audio.cue(points?'score':'bad');opponent.react(points>=20?'great':points?'good':'bad');
  if(lesson){lesson.awards[id]=points;lesson.faces[id]=state.players[0].faces[id];phase='human';view('table');nextLesson();renderUI();return;}
  save();phase='handoff';timer=1.8;view('table');speakScore(player,points);renderUI();
}
function resultCopy(){const a=totals(state.players[0].scores).total,b=totals(state.players[1].scores).total;$('win-title').textContent=state.winner==='tie'?'Jafntefli!':state.winner==='you'?'Þú vannst!':'Mosi vann!';$('win-copy').textContent=`Þú ${a} · Mosi ${b}`;}
function advanceTurn(){
  if(state.status==='finished'){phase='finished';resultCopy();opponent.react('win');audio.cue('win');openDialog('win-dialog',resultSpeech());renderUI();return;}
  recent=null;dice.sync(state.dice,state.held,state.currentPlayer,{animate:!reduced});phase=state.currentPlayer===0?'human':'ai-wait';timer=.9;aiDecision=null;audio.cue('turn');say(state.currentPlayer?'mosiTurn':'yourTurn');renderUI();
}
function aiStep(){
  if(lesson||state.currentPlayer!==1||state.status!=='playing'||voice.busy||!settled())return;
  if(phase==='ai-wait'){aiDecision=decideAI(state);if(aiDecision.type==='score'){phase='ai-score';timer=.8;}
    else if(state.rollCount===0)beginRoll();else{for(let i=0;i<5;i++)if(state.held[i]!==aiDecision.held[i])state=hold(state,i,aiDecision.held[i]);dice.setHeld(state.held);world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();phase='ai-hold';timer=.85;}}
  else if(phase==='ai-hold')beginRoll();else if(phase==='ai-score')record(aiDecision.categoryId);renderUI();
}
function speakStep(){
  if(!lesson)return;lessonAdvance=-1;const index=lesson.index,spec=step();paintCoach();
  say(spec.line,()=>{if(!lesson||lesson.index!==index)return;if(spec.type==='listen')lessonAdvance=.35;else if(spec.type==='finish')lessonAdvance=1.3;});
}
function enterStep(){
  voice.stop();lessonAdvance=-1;const spec=step();
  if(spec.newHand){state=createGame({seed:606+lesson.index});phase='human';dice.sync(state.dice,state.held,0,{animate:!reduced});view('table');}
  if(['listen','finish'].includes(spec.type))view('table');
  renderUI();speakStep();
}
function nextLesson(){if(!lesson)return;lesson.index++;if(lesson.index>=LESSON_STEPS.length){leaveLesson(true);return;}enterStep();}
function beginLesson(){
  if(!lesson)lessonReturn={state:structuredClone(state),started,phase,scoreScroll:$('score-rows').scrollTop};
  voice.stop();audio.cancel();effects.clear();opponent.reset();lesson={index:0,awards:{},faces:{}};state=createGame({seed:606});started=true;phase='human';timer=0;recent=null;aiDecision=null;zeroCategory=null;
  dice.sync(state.dice,state.held,0);view('table',true);$('controls').hidden=false;closeDialogs();audio.unlock();enterStep();
}
function leaveLesson(play=false){
  if(!lesson)return;voice.stop();lessonAdvance=-1;const previous=lessonReturn;lesson=null;lessonReturn=null;audio.cancel();effects.clear();opponent.reset();state=previous.state;started=previous.started;recent=null;aiDecision=null;zeroCategory=null;
  phase=!started?'intro':state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.9;
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0?'dice':'table',true);$('controls').hidden=!started;coach.hidden=true;closeDialogs();renderUI();$('score-rows').scrollTo({top:previous.scoreScroll,behavior:'instant'});
  if(!started){if(play)start(Boolean(saved));else{$('continue').hidden=!saved;openDialog('welcome');}}else if(state.status==='finished'){resultCopy();openDialog('win-dialog');}else say('resume');
}
function start(continuing=false){
  voice.stop();audio.cancel();effects.clear();opponent.reset();lesson=null;lessonReturn=null;lessonAdvance=-1;zeroCategory=null;aiDecision=null;recent=null;
  state=continuing&&saved?structuredClone(saved):createGame({seed:crypto.getRandomValues(new Uint32Array(1))[0]});started=true;phase=state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.9;
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0&&state.status==='playing'?'dice':'table',true);$('controls').hidden=false;closeDialogs();audio.unlock();save();renderUI();$('score-rows').scrollTo({top:0,behavior:'instant'});
  if(state.status==='finished'){resultCopy();openDialog('win-dialog',resultSpeech());}else say(continuing?'resume':'yourTurn');
}

$('start').addEventListener('click',()=>start());$('continue').addEventListener('click',()=>start(true));$('play-again').addEventListener('click',()=>start());
$('welcome-voice')?.addEventListener('click',()=>{enableNarration();openDialog('welcome','welcomeMenu');});
$('pause-voice')?.addEventListener('click',()=>{enableNarration();openDialog('pause-dialog','pause');});
$('learn').addEventListener('click',beginLesson);$('learn-help').addEventListener('click',beginLesson);$('lesson-skip').addEventListener('click',()=>leaveLesson());
$('lesson-next').addEventListener('click',()=>{if(lesson&&step().type==='finish'&&!paused&&!voice.unavailable)leaveLesson(true);});
$('lesson-replay').addEventListener('click',()=>{if(paused)return;enableNarration();lessonAdvance=-1;if(lesson)speakStep();else voice.replay();renderUI();});
$('voice-retry').addEventListener('click',()=>{enableNarration();lessonAdvance=-1;if(document.querySelector('dialog[open]')){modalNarration=true;syncPause();}voice.replay();renderUI();});
$('roll').addEventListener('click',()=>{if(isHuman())beginRoll();});
cupButton.addEventListener('click',event=>{
  if(!isHuman()||cupButton.hidden||cupButton.disabled)return;
  if(state.rollCount>0){if(!settled())return;if(event.detail>0){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;for(let i=0;i<5;i++){const b=dieButtons[i],p=pixels[i];if(!b.hidden&&!b.disabled&&Math.abs(x-p.x)<=p.width*.5+8&&Math.abs(y-p.y)<=p.height*.5+8)return;}}}beginRoll();
});
$('sound').addEventListener('click',()=>{muted=!muted;audio.mute(muted);voice.mute(muted);audio.unlock();savePrefs();if(!muted&&voice.unavailable)voice.replay();renderUI();});
$('motion').addEventListener('click',()=>{reduced=!reduced;dice.setReducedMotion(reduced);if(reduced){effects.clear();view(pendingDiceView>=0?'dice':world.getViewState().mode,true);}savePrefs();});
$('pause').addEventListener('click',()=>{if(started)openDialog('pause-dialog');});
$('help').addEventListener('click',()=>{enableNarration();openDialog('help-dialog','help');});
$('new-game').addEventListener('click',()=>{if(lesson)leaveLesson();voice.stop();closeDialogs();$('continue').hidden=!saved;openDialog('welcome');});
$('confirm-zero').addEventListener('click',()=>{const id=zeroCategory;zeroCategory=null;voice.stop();closeDialogs();if(id&&isHuman())record(id);});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&modalNarration){modalNarration=false;voice?.stop();coach.hidden=!lesson;syncPause();if(lesson)speakStep();}else syncPause();});
  dialog.addEventListener('cancel',event=>{if(dialog.id==='welcome'&&!started)event.preventDefault();});
});
document.addEventListener('visibilitychange',syncPause);
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(/^[1-5]$/.test(event.key)&&isHuman()){event.preventDefault();toggleHold(Number(event.key)-1);}else if(event.code==='Space'&&isHuman()&&document.activeElement?.tagName!=='BUTTON'){event.preventDefault();beginRoll();}else if(event.code==='Escape'&&started&&!paused){event.preventDefault();openDialog('pause-dialog');}});
function cleanupScene(){effects?.dispose();dice?.dispose();opponent?.dispose();world?.dispose();}
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();voice?.dispose();audio.dispose();cleanupScene();}
addEventListener('pagehide',dispose,{once:true});addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

export async function initialize({signal,onStage=()=>{}}={}){
  const check=()=>{if(disposed||signal?.aborted)throw signal?.reason||new Error('Yatzy startup canceled');};
  // Loaders can finish after cancellation. Release late resources immediately.
  const take=(resource,assign)=>{if(disposed||signal?.aborted){resource.dispose();check();}assign(resource);return resource;};
  const wait=promise=>waitForStartup(promise,{signal});
  const onAbort=()=>dispose();
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
    check();onStage('voice');
    const response=await fetch('./assets/audio/yatzy-junior/manifest.json',{signal});if(!response.ok)throw new Error('Mosi voice recordings are missing');voiceManifest=await response.json();check();
    for(const id of Object.keys(VOICE_LINES))if(!voiceManifest[id]?.src)throw new Error(`Missing recorded line: ${id}`);
    voice=createJuniorVoice({lines:VOICE_LINES,manifest:voiceManifest,
      onLine(id,text){coach.hidden=false;captionTime=0;coach.dataset.voice='pending';$('voice-recovery').hidden=true;$('lesson-line').textContent=lesson?step().caption:CAPTIONS[id]||text;paintCoach();},
      onUnavailable(){lessonAdvance=-1;coach.dataset.voice='unavailable';syncVoiceRecovery();renderUI();},
      onSpeaking(speaking){coach.dataset.voice=voice.getDebugState().mode;if(speaking&&opponent){const id=voice.currentId,clip=voiceManifest[id],at=voice.getDebugState().elapsed;opponent.actor.talk({duration:Math.max(0,clip.duration-at),mouth:clip.mouth.slice(Math.floor(at*20)),text:VOICE_LINES[id].text});}else opponent?.actor.stopTalking();}
    });voice.mute(muted);
    // A font download is optional; it must never hold the entire board hostage.
    await waitForStartup(document.fonts.ready,{signal,timeoutMs:1500,optional:true});check();
    onStage('forest');await wait(createYatzyWorld(canvas,{shot:TABLE_SHOT}).then(resource=>take(resource,value=>{world=value;})));check();effects=createYatzyEffects(world);
    onStage('players');
    await wait(Promise.all([
      createMosiOpponent(world,{tableY:world.table.y,farZ:world.table.farZ}).then(resource=>take(resource,value=>{opponent=value;})),
      createDiceAndCup(world,{layout:TABLE_LAYOUT,onEvent(kind,data){audio.cue(kind,{strength:data.strength*(voice.busy?.55:1),pan:data.position.x/3});if(['impact','sweep','release','settle'].includes(kind))effects.emit(data.position,{kind,strength:data.strength,reduced});}}).then(resource=>take(resource,value=>{dice=value;}))
    ]));check();
    onStage('shaders');dice.setReducedMotion(reduced);world.update(0,0);opponent.update(.001,0,{reducedMotion:reduced});world.scene.updateMatrixWorld(true);world.resize();dice.dice.forEach(d=>{d.visible=true;});
    // compileAsync polls the driver forever after some context-loss failures.
    // Prepare programs while the loading cover is up; the first render completes them.
    world.renderer.compile(world.scene,world.camera);
    if(world.renderer.getContext().isContextLost())throw new Error('WebGL context lost while preparing the board');
    check();
    world.render();dice.sync(state.dice,state.held,0);world.render();check();
    if(world.renderer.getContext().isContextLost())throw new Error('WebGL context lost while drawing the board');
    $('loading').hidden=true;$('game').inert=false;$('continue').hidden=!saved;savePrefs();renderUI();openDialog('welcome');
    let dirty=true;const measure=()=>{targetWidth=canvas.clientWidth;targetHeight=canvas.clientHeight;};measure();resizeObserver=new ResizeObserver(()=>{measure();dirty=true;updateTargets();});resizeObserver.observe(canvas);
    document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{dirty=true;}));
    const tick=now=>{
      if(disposed)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;voice.update(dt);
      if(!paused){
        elapsed+=dt;timer-=dt;
        if(captionTime>0){captionTime-=dt;if(captionTime<=0&&!lesson&&!voice.busy)coach.hidden=true;}
        if(pendingDiceView>=0){pendingDiceView-=dt;if(pendingDiceView<=0)view('dice');}
        if(phase==='rolling'&&dice.update(dt))rolled();else if(phase!=='rolling')dice.update(dt);
        if(lessonAdvance>=0){lessonAdvance-=dt;if(lessonAdvance<=0){lessonAdvance=-1;if(step()?.type==='finish')leaveLesson(true);else nextLesson();}}
        if(!lesson&&timer<=0&&!voice.busy){if(phase==='handoff')advanceTurn();else if(phase.startsWith('ai-'))aiStep();}
        opponentFrame.thinking=phase==='ai-wait'||phase==='ai-score';opponentFrame.rolling=phase==='rolling';opponentFrame.target=opponentFrame.rolling?dice.getFocusTarget():null;opponentFrame.reducedMotion=reduced;
        opponent.update(dt,elapsed,opponentFrame);effects.update(dt);world.update(reduced?0:dt,elapsed);world.render();
        const ready=settled();if(ready!==readyLast){readyLast=ready;renderUI();}updateTargets();dirty=false;
      }else if(modalNarration&&!document.hidden&&!qaFrozen){
        // A voiced dialog can animate Mosi while the board, turn and camera stay paused.
        opponentFrame.thinking=false;opponentFrame.rolling=false;opponentFrame.target=null;opponentFrame.reducedMotion=reduced;
        opponent.update(dt,elapsed,opponentFrame);world.render();dirty=false;
      }else if(dirty){world.render();updateTargets();dirty=false;}
      frame=requestAnimationFrame(tick);
    };last=performance.now();frame=requestAnimationFrame(tick);
    if(new URLSearchParams(location.search).has('qa'))window.__juniorQA={world,dice,opponent,effects,audio,voice,
      getState:()=>structuredClone(state),getStatus:()=>({phase,paused,reduced,started,timer,lessonAdvance,settled:settled()}),
      getTutorial:()=>lesson?{active:true,...structuredClone(lesson),...step()}:{active:false},
      freeze(value){qaFrozen=Boolean(value);syncPause();},
      setState(value){validateGame(value);voice.stop();lesson=null;lessonReturn=null;lessonAdvance=-1;state=structuredClone(value);started=true;phase=state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.8;dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount?'dice':'table',true);$('controls').hidden=false;closeDialogs();renderUI();},dispose};
    onStage('ready');
  }catch(error){dispose();throw error;}
  finally{signal?.removeEventListener('abort',onAbort);}
}
