import {createYatzyWorld} from '../yatzy-mosi/world.js';
import {createMosiOpponent} from '../yatzy-mosi/opponent.js';
import {createDiceAndCup,DINO_FACES} from '../yatzy-mosi/dice.js';
import {createYatzyEffects} from '../yatzy-mosi/effects.js';
import {createJuniorAudio} from './sounds.js';
import {CATEGORIES,createGame,roll,hold,score,scoringDice,previews,totals,decideAI,restoreGame,validateGame,roundOf} from './rules.js';
import {LESSON_STEPS,allowsAction} from './lesson.js';
import {VOICE_LINES,MULTI_LINES} from './voice-lines.js';
import {createJuniorVoice} from './voice.js';
import {waitForStartup} from './startup.js';
import {createPickEffects} from './pick-vfx.js';
import {createJuice} from './juice.js';
import {createFjolspil} from '../fjolspil/fjolspil.js';
import {avatarOf} from '../fjolspil/seats.js';
import {MOSI_AI,STORAGE_KEY,playersOf,phaseOf,yatzyView,actOf,keepFjolspil,readFjolspil,forgetFjolspil} from './fjolspil.js';

const $=id=>document.getElementById(id),SAVE='mosi.yatzy.junior.save.v1',PREFS='mosi.yatzy.junior.prefs.v1';
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage is optional. */}};
const local=()=>{try{return localStorage;}catch{return null;}}; // a blocked store throws even when only named
// The solo save is the child's and Mosi's: the rules take two to four players now, so a save of any others is not offered here.
const soloSave=value=>{const game=restoreGame(value);return game?.players.length===2&&game.players[0].id==='you'&&game.players[1].id==='mosi'?game:null;};
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
  const cardTop=Math.min(Math.min(...cards.map(r=>r.top))-(16+14)*u-4,...$$('#card-owner').map(r=>r.top)); // a badge sticks up 16u over a card and the best card lifts 14u more; in Fjölspil the owner's tag over the row
  // The players' bar: on a wide screen the dice keep beside it (the bubble's band runs along the top beside it), on an upright one
  // or a phone below it.
  const bar=$$('.player-card, .rounds'),barBottom=Math.max(...bar.map(r=>r.bottom)),barRight=Math.max(...bar.map(r=>r.right)),below=phone||height>width;
  const bandBottom=(phone?coach.offsetTop:14)+Math.max(coach.offsetHeight,104)+8; // the bubble over the dice (yatzy-junior.css)
  const top=below?Math.max(barBottom,bandBottom):bandBottom;
  return {top:top+clear-screen.top,bottom:screen.bottom-cardTop+clear,left:(below?0:barRight-screen.left)+clear,right:clear,
    die:{top:phone?40:52,bottom:12,side:22}, // the number chip over a die; a held die's frame, its check and its glow
    ring:{top:(phone?58:76)+26,bottom:10,side:10}}; // the Kasta tag over the ring, 12 px clear of it
}
// The cup waits at the left of the table (not in front of Mosi, where his bubble is) and rests a little further back after a roll;
// the held row sits a little nearer the middle and to the right, so the cup's gold ring, the held dice and the cards never touch.
const TABLE_LAYOUT=Object.freeze({home:[-1.75,.85,.55],park:[-1.85,.6],held:{left:-1.0,step:.58,near:1.2}});
const prefs=read(PREFS)||{},EXAMPLES={pair:[2,2],twoPairs:[2,2,4,4],threeKind:[3,3,3],smallStraight:[1,2,3,4,5],yatzy:[5,5,5,5,5]};
// Every line Mosi may say: the solo script, which the startup requires recorded, and Fjölspil's optional lines (voice.js).
const LINES=Object.freeze({...VOICE_LINES,...MULTI_LINES});
// Full Icelandic speech is separate from its brief reading support.
const CAPTIONS={welcomeMenu:'Hæ! Spilum saman.',yourTurn:'Þú átt leik!',mosiTurn:'Mosi á leik.',hold:'Geymdur!',release:'Laus aftur.',choose:'Veldu kort.',lastRoll:'Eitt kast eftir.',noRolls:'Veldu laust kort.',allHeld:'Allir geymdir!',zero:'Nota kortið fyrir 0 stig?',scored:'Stigin þín!',mosiScored:'Stigin hans Mosa!',good:'Gott kast!',great:'Vá!',bad:'Prófum aftur.',youWin:'Þú vannst!',mosiWin:'Mosi vann!',tie:'Jafntefli!',help:'Kasta · geyma · velja kort',pause:'Mosi bíður.',resume:'Höldum áfram!',pairHelp:'Par = 2 eins.',twoPairsHelp:'Tvö pör = 2 eins + 2 aðrir eins.',threeKindHelp:'Þrír teningar eins.',smallStraightHelp:'Röð: 1 · 2 · 3 · 4 · 5',yatzyHelp:'Yatzy = 5 eins.',yourTotal:'Þú fékkst',mosiTotal:'Mosi fékk'};
let muted=prefs.muted===true,reduced=typeof prefs.reduced==='boolean'?prefs.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio=createJuniorAudio();audio.mute(muted);
let world,opponent,dice,effects,pick,voice,voiceManifest={},state=createGame(),saved=soloSave(read(SAVE));
let phase='intro',timer=0,elapsed=0,last=performance.now(),frame=0,started=false,paused=true,disposed=false,qaFrozen=false,resizeObserver;
let pendingDiceView=-1,aiDecision=null,zeroCategory=null,recent=null,lesson=null,lessonReturn=null,lessonAdvance=-1,readyLast=false,captionTime=0,modalNarration=false;
let lessonFocus='';const chipHold=[null,null,null,null]; // a total held back while its score flies, one for each player
// The vfx round (juice.js): something held back on the game clock (a line after Mosi's hop, the result card after the fireworks),
// who played last (the turn pulse), how many round pips were full (their pop) and where Mosi's eyes go.
let later=null,lastWho=null,pipDone=-1,watchAt=null;const juice=createJuice({reduced:()=>reduced});
let idle=0,idleHint=null; // after a while with nothing done on the child's turn, Mosi's own choice glows (paintPicks)
const cells=new Map(),dieButtons=[],canvas=$('table'),cupButton=$('cup-target'),coach=$('lesson-center'),roundPips=[...document.querySelectorAll('#rounds i')];
const pixels=Array.from({length:6},()=>({x:NaN,y:NaN,width:NaN,height:NaN,top:NaN,bottom:NaN}));
const cupAnchor={x:0,y:0},opponentFrame={thinking:false,rolling:false,target:null,reducedMotion:reduced};
let targetWidth=0,targetHeight=0;
// "Fjölspil" (the owner's decisions of 2026-10-24): the page hosts a room of its own (STORAGE_KEY) for Egill at the big screen in
// seat 0, up to three guests whose phones are their cups, and Mosi, the one computer player, when the lobby adds him; player i of
// the rules is seat i. `multi` is the game of seats while one is on: its seats at "Byrjum!", the latest roll { seq, by } that tells
// the phones to tumble their dice, and `before`, the table as it stood while a roll is in the air (the phones see the new faces
// only once the dice lie). The five cards along the bottom are `owner`'s: the child's alone, in Fjölspil the player on turn's,
// kept through the score's flight until the turn moves on.
let fjolspil=null,multi=null,owner=0,seatsOff=null,lobbyUp=false;

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
  // "Tap here" (shown a few seconds into a pick, yatzy-junior.css): a ring closing onto the card and a drawn finger; and sparkles on its corner.
  const tap=document.createElement('span');tap.className='tap-hint';tap.setAttribute('aria-hidden','true');
  tap.innerHTML='<i class="tap-ring"></i><svg viewBox="0 0 24 24"><path d="M9.2 11.4V4.6a1.6 1.6 0 0 1 3.2 0v5.6m0-.4a1.6 1.6 0 0 1 3.2 0v1.2m0-.2a1.6 1.6 0 0 1 3.2 0v3.4c0 3.7-2.5 6.2-6.1 6.2h-1.1c-2.1 0-3.5-.8-4.7-2.4l-2.6-3.5a1.6 1.6 0 0 1 2.4-2.1l2.5 2.3"/></svg>';
  const sparkles=document.createElement('span');sparkles.className='card-sparks';sparkles.setAttribute('aria-hidden','true');sparkles.innerHTML='<i></i><i></i><i></i>';
  const shine=document.createElement('span');shine.className='card-shine';shine.setAttribute('aria-hidden','true');shine.innerHTML='<i></i>'; // the sweep of light when the card can be chosen
  select.append(shine,picture,name,rule,value);select.addEventListener('click',()=>chooseScore(category.id));card.append(select,scores,tap,sparkles);$('score-rows').append(card);cells.set(category.id,{card,select,picture,value,scores,shine:shine.firstChild,shown:'',pictured:'',woke:''});
}
for(let i=0;i<5;i++){
  const button=document.createElement('button');button.type='button';button.className='die-target';button.hidden=true;button.dataset.index=i;button.innerHTML='<span>Geymdur</span><i class="die-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>';
  button.addEventListener('click',()=>toggleHold(i));$('dice-targets').append(button);dieButtons.push(button);
}
// The players' bar, top left: a round portrait each, the score hanging under it and the name. The solo game's two are the child
// ("Þú" on teal) and Mosi (his picture on sage); a game of seats has a card for each, the avatar's picture in its colour (seats.js:
// Egill's in seat 0, Mosi's own when he plays). `players` is the list it was built from, `playerEls[i]` player i's card.
const SOLO_PLAYERS=Object.freeze([{name:'Þú',avatar:null,colour:'var(--teal)',deep:'var(--teal-deep)',isMosi:false},{name:'Mosi',avatar:null,colour:'var(--sage)',deep:'var(--sage-deep)',isMosi:true}]);
let players=SOLO_PLAYERS,playerEls=[];
function buildPlayers(list){
  const bar=document.querySelector('.players'),solo=list===SOLO_PLAYERS;players=list;
  playerEls=list.map(({name,avatar,colour,deep=`color-mix(in srgb,${colour} 64%,var(--ink))`,isMosi},i)=>{
    const card=document.createElement('div'),portrait=document.createElement('span'),total=document.createElement('strong'),label=document.createElement('span');
    card.className='player-card';card.style.setProperty('--c',colour);card.style.setProperty('--c-deep',deep);portrait.className='portrait';portrait.setAttribute('aria-hidden','true');
    const picture=avatar?avatarOf(avatar)?.picture:isMosi?'assets/eitt/mosi.webp':null;
    if(picture){const img=document.createElement('img');img.src=`./${picture}`;img.alt='';portrait.append(img);}else{const initial=document.createElement('b');initial.textContent=name;portrait.append(initial);}
    total.className='score';total.textContent='0';label.className='pname';label.textContent=name;
    if(solo){card.id=isMosi?'mosi-card':'you-card';total.id=isMosi?'mosi-total':'you-total';}else card.dataset.seat=String(i); // the check tools read the solo ids
    card.append(portrait,total,label);return {card,portrait,total,colour,deep};
  });
  bar.dataset.count=String(list.length);bar.setAttribute('aria-label',list.length===2?'Stig beggja':'Stig leikmanna');bar.replaceChildren(...playerEls.map(p=>p.card));barEnd();world?.resize(); // the dice view measured round the new bar
}
// Where the bar ends (--bar-right): over the dice, Mosi's bubble keeps beside a bar of three or four (yatzy-junior.css).
function barEnd(){$('game').style.setProperty('--bar-right',`${Math.ceil(document.querySelector('.players').getBoundingClientRect().right)}px`);}
buildPlayers(SOLO_PLAYERS);
const step=()=>lesson?LESSON_STEPS[lesson.index]:null;
const isHuman=()=>started&&!paused&&phase==='human'&&state.currentPlayer===0&&state.status==='playing';
const seatOf=i=>multi?fjolspil.seats.bySeat(i):null;
// Who plays the turn, and how: the child at the big screen ('human'; Egill's seat 0 in Fjölspil), a guest from her phone
// ('remote'), the computer ('ai-wait': Mosi, or a guest's seat he covers while she is away), or nobody yet ('waiting': her phone
// has gone, and the waiting card is up), read off the seat (fjolspil.js phaseOf). After a roll the turn goes on as it was played
// (going): a seat Mosi covers stays his till the turn is over, and a guest who went while her dice rolled is waited for.
function turnPhase(going=false){const who=state.currentPlayer;return multi?phaseOf(seatOf(who),{going}):who===0?'human':'ai-wait';}
function takeTurn(going=false){phase=turnPhase(going);if(phase==='waiting')waitTurn(state.currentPlayer);}
const mosiPlays=i=>players[i]?.isMosi===true; // Mosi himself: his lines and sounds, and his side of the table for the dice
const side=i=>mosiPlays(i)?1:0;
// Whom Mosi speaks to (spec §8; the owner's decision of 2026-10-24: new generic lines for a table of many, which he records himself):
// the child at the big screen ('you', Egill's seat 0 in Fjölspil) hears what he hears alone, and Mosi speaks of his own play
// ('mosi') as he does there. Any other seat ('seat': a guest on her phone, or one Mosi plays for her while she is away) gets the
// lines that fit anyone and the generic ones (MULTI_LINES), her name in the bubble (captionFor). A seat Mosi covers is played
// silently (spec §7) but for his reactions to its rolls and the score it gets: it has no turn's line, and he holds no die by tap.
const speaker=i=>i===0?'you':mosiPlays(i)?'mosi':'seat';
// Whose turn or score a generic line is about, for its bubble: { player, points }.
let named=null;
// A guest's phone may act only while the table waits for it: her turn from her phone, nothing moving, the page not paused.
const phoneMay=()=>!paused&&phase==='remote'&&settled();
const settled=()=>!!world&&phase!=='rolling'&&pendingDiceView<0&&!world.isViewTransitioning();
const allowed=(action,value)=>!lesson||(!voice?.unavailable&&allowsAction(step(),action,value));
// A game of seats is kept under its own key with its seats, and let go when it ends; the solo save stays the child's.
function save(){if(lesson)return;if(multi){if(state.status==='finished')forgetFjolspil(local());else keepFjolspil(local(),{state,seats:fjolspil.seats.snapshot()});return;}write(SAVE,state);saved=restoreGame(state);}
function savePrefs(){write(PREFS,{muted,reduced});$('sound-label').textContent=muted?'Hljóð af':'Hljóð á';$('sound').setAttribute('aria-pressed',String(muted));$('sound').setAttribute('aria-label',muted?'Kveikja á hljóði':'Slökkva á hljóði');$('motion').textContent=reduced?'Venjuleg hreyfing':'Rólegri hreyfing';$('motion').setAttribute('aria-pressed',String(reduced));cupButton.dataset.motion=reduced?'reduced':'full';$('game').dataset.motion=reduced?'reduced':'full';}
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
// The table holds still under a dialog, a hidden tab and the lobby; in Fjölspil every phone hears when it pauses and goes on.
function syncPause(){paused=qaFrozen||document.hidden||Boolean(document.querySelector('dialog[open]'))||lobbyUp;audio.pause(paused);voice?.pause(qaFrozen||document.hidden||(paused&&!modalNarration));cupButton.dataset.paused=String(paused);last=performance.now();if(world)renderUI();sendViews();}
function openDialog(id,line){if(!$(id).open)audio.cue('dialog',{id});if(line){voice?.stop();modalNarration=true;lessonAdvance=-1;}if(!$(id).open)$(id).showModal();syncPause();if(line)saySequence(Array.isArray(line)?line:[line]);}
function closeDialogs(){modalNarration=false;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();syncPause();}
function say(id,onEnd){
  captionTime=0;
  return voice?.say(id,{onEnd:()=>{if(!lesson)captionTime=1.2;onEnd?.();}});
}
function speakScore(player,points){
  const by=speaker(player);if(by!=='seat'){say(by==='mosi'?'mosiScored':'scored',()=>say(`points_${points}`));return;}
  named={player,points};if(points)say('multiScored',()=>say(`points_${points}`));else say('multiZero');
}
// A turn's first line: the child's and Mosi's own as alone, "Næsti kastar!" for a guest playing from her phone. A seat Mosi covers
// has none, and one whose guest has gone has the waiting card's (waitTurn).
function speakTurn(who){const by=speaker(who);if(by==='you')say('yourTurn');else if(by==='mosi')say('mosiTurn');else if(phase==='remote'){named={player:who};say('multiTurn');}}
// The bubble's words for a line: its brief reading support, and for Fjölspil's generic lines the player's name in the nominative
// (spec §8): "Anna á leik", "Anna: 12 stig", "Anna vann!" or "Jafntefli!". The welcome and the wait show their own words.
function captionFor(id){
  const name=players[named?.player]?.name;
  if(name&&id==='multiTurn')return `${name} á leik`;
  if(name&&(id==='multiScored'||id==='multiZero'))return `${name}: ${named.points} stig`;
  if(id==='multiOver'&&state.winner)return state.winner==='tie'?'Jafntefli!':`${players[Number(state.winner)]?.name} vann!`;
  return CAPTIONS[id];
}
function saySequence(ids,index=0){if(index<ids.length)say(ids[index],()=>saySequence(ids,index+1));}
function resultSpeech(){
  // In Fjölspil "Leik lokið! Sjáum hver vann." with the winner's name in the bubble, then the child's win or Mosi's own as alone;
  // the totals are the result card's (the solo game's "Þú fékkst … Ég fékk …" is for two).
  if(multi){const at=Number(state.winner);return ['multiOver',...(state.winner==='tie'?[]:at===0?['youWin']:mosiPlays(at)?['mosiWin']:[])];}
  return ['yourTotal',`points_${totals(state.players[0].scores).total}`,'mosiTotal',`points_${totals(state.players[1].scores).total}`,state.winner==='you'?'youWin':state.winner==='mosi'?'mosiWin':'tie'];}
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
  const preview=state.rollCount?previews(state):{},human=isHuman(),who=state.currentPlayer,still=settled(),rollKey=`${state.turnCount}:${state.rollCount}`;let woke=false;
  for(const c of CATEGORIES){
    // `you` is the cards' owner's (the child's, or in Fjölspil the player on turn's); Mosi's chip is the solo game's.
    const cell=cells.get(c.id),you=lesson?(lesson.awards[c.id]??null):state.players[owner].scores[c.id],mosi=lesson||multi?null:state.players[1].scores[c.id];
    const available=you===null&&human&&state.rollCount>0&&still&&allowed('score',c.id),possible=state.rollCount>0&&phase!=='rolling'&&phase!=='handoff';
    cell.select.disabled=!available;
    // The badge is the child's: what the card would give now, or the score laid on it (teal). Who used it hangs on its top-left
    // corner: a plain "Þú" chip (the badge has the number) and Mosi's face with his.
    const chips=`${multi?'seats:':''}${you??''}|${mosi??''}`;
    cell.value.textContent=you!==null?String(you):possible&&who===owner?`+${preview[c.id]??0}`:'';cell.value.dataset.who=you!==null?'you':'';
    // The picture row shows what the child really has: the dice that score here after a roll, the dice a filled card was filled with,
    // or the card's example, dimmed when the hand does not make it (before a roll, and on Mosi's turn, the example as it is).
    let faces=EXAMPLES[c.id],dim=false;
    if(you!==null){const kept=lesson?lesson.faces[c.id]:state.players[owner].faces?.[c.id];if(kept?.length)faces=kept;else dim=true;}
    else if(possible&&who===owner){const live=scoringDice(c.id,state.dice);if(live.length)faces=live;else dim=true;}
    const pictured=`${dim?'-':'+'}${faces.join('')}`;if(cell.pictured!==pictured){cell.pictured=pictured;cell.picture.replaceChildren(miniDice(faces));cell.picture.classList.toggle('dim',dim);}
    if(cell.shown!==chips){cell.shown=chips;cell.scores.innerHTML=(you!==null&&!multi?'<i class="who you"><span>Þú</span></i>':'')+(mosi!==null?`<i class="who mosi"><span></span><b>${mosi}</b></i>`:'');}
    if(available&&cell.woke!==rollKey){cell.woke=rollKey;woke=true;juice.wake(cell.select,cell.shine);} // a card that can be chosen now lifts and shines
    cell.card.classList.toggle('filled',you!==null);cell.card.classList.toggle('available',available);cell.card.classList.toggle('best',available&&(preview[c.id]??0)>0);cell.card.classList.toggle('recent',recent===c.id);
    cell.select.setAttribute('aria-label',`${c.label}. ${you!==null?`${you} stig, notað kort`:available?`${preview[c.id]} stig í boði`:'Laust kort'}`);
  }
  if(woke&&Object.values(preview).some(points=>points>0))opponent?.react('nod'); // Mosi nods at the cards that light up
  playerEls.forEach(({total},i)=>{total.textContent=chipHold[i]??(lesson?(i?0:Object.values(lesson.awards).reduce((a,b)=>a+b,0)):totals(state.players[i].scores).total);});
  const round=roundOf(state),over=state.status==='finished';$('round').textContent=lesson?'Æfum saman':`${round} af 5`;
  const pipsDone=over?5:round-1;if(started&&!lesson&&pipDone>=0&&pipsDone===pipDone+1)juice.pop(roundPips[pipsDone-1],1.7);pipDone=lesson?-1:pipsDone; // a round's pip fills with a pop
  roundPips.forEach((pip,i)=>{pip.classList.toggle('done',over||i<round-1);pip.classList.toggle('now',!over&&i===round-1);});
  $('turn-label').textContent=lesson?'Mosi kennir þér':!started?'Spilum saman':state.status==='finished'?'Leik lokið':multi?`${players[who].name} á leik`:who?'Mosi á leik':'Þú átt leik';
  // Whose five cards these are, in Fjölspil: a tag with her name in her colour at the row's left end; the solo game's are the child's.
  const tag=$('card-owner');tag.hidden=!multi;if(multi){const {name,colour}=players[owner];if(tag.textContent!==name)tag.textContent=name;tag.style.setProperty('--c',colour);}
  if(started&&!lesson&&lastWho!==null&&who!==lastWho)juice.pulse(playerEls[who].portrait);lastWho=started?who:null; // the turn passes: a pulse
  // Who plays is lit; in Fjölspil a guest whose phone has gone is dimmed (her seat waits for her, or Mosi covers it).
  playerEls.forEach(({card},i)=>{card.classList.toggle('current',i===who);if(multi){const seat=seatOf(i);card.classList.toggle('absent',Boolean(seat?.guestId)&&!seat.present);}});document.querySelector('.turn').classList.toggle('ai',mosiPlays(who));
  const canRoll=human&&state.rollCount<3&&!state.held.every(Boolean)&&allowed('roll')&&still;
  $('roll').disabled=!canRoll;$('roll-label').textContent=phase==='rolling'?'Teningarnir rúlla…':who?`${players[who].name} á leik`:state.rollCount===3?'Veldu kort':state.rollCount===0?'Kasta':'Kasta aftur';
  $('roll-count').textContent=`${3-state.rollCount} ${3-state.rollCount===1?'kast':'köst'}`;$('hint').textContent='';
  // On the child's turn the cup keeps its ring while everything is still: gold when it can be rolled, grey when not now. On a
  // guest's turn it waits for her phone in her colour, and takes no tap.
  const remote=!paused&&phase==='remote'&&state.status==='playing';cupButton.dataset.remote=String(remote);if(remote)cupButton.style.setProperty('--c',players[who].colour);
  dice?.setReady(canRoll);cupButton.disabled=!canRoll;cupButton.hidden=!(canRoll||((human||remote)&&still&&state.status==='playing'));cupButton.dataset.parked=String(state.rollCount>0);cupButton.dataset.rolls=String(3-state.rollCount);cupButton.setAttribute('aria-label',`Kasta teningunum: ${3-state.rollCount} ${3-state.rollCount===1?'kast':'köst'} eftir`);
  for(let i=0;i<5;i++){const b=dieButtons[i];b.disabled=!(human&&state.rollCount>0&&state.rollCount<3&&still&&allowed('hold',i));b.classList.toggle('held',state.held[i]);b.dataset.value=state.dice[i];b.setAttribute('aria-pressed',String(state.held[i]));b.setAttribute('aria-label',`Teningur ${i+1}: ${state.dice[i]}. ${state.held[i]?'Losa':'Geyma'}`);b.removeAttribute('aria-describedby');}
  paintCoach();paintPicks();updateTargets();syncVoiceRecovery();
  audio.cue('cards',{values:CATEGORIES.map(c=>cells.get(c.id).select.disabled?-1:preview[c.id]??0),pick:CATEGORIES.findIndex(c=>cells.get(c.id).card.classList.contains('pick'))});
}
// The Kasta tag stands over the cup's ring, 12 px clear of it, sliding sideways to stay on the screen; where something is in the
// way there (the players' bar, the buttons, the bubble, a die or its number, the cards) it stands at the ring's right, else its
// left, else under it, wherever is clear first.
let tagKey='';
function placeTag(){
  const ring=cupButton.firstElementChild.getBoundingClientRect(),tag=cupButton.querySelector('.cup-tag');if(!ring.width)return;
  const key=`${Math.round(ring.left)},${Math.round(ring.top)},${Math.round(ring.width)},${$('game').dataset.view},${innerWidth},${innerHeight},${pixels.map(p=>`${Math.round(p.x)}:${Math.round(p.y)}`).join(',')},${dieButtons.map(b=>b.hidden?0:1).join('')}`;
  if(key===tagKey)return;tagKey=key;
  const width=tag.offsetWidth,height=tag.offsetHeight+10,gap=12,cx=(ring.left+ring.right)/2,cy=(ring.top+ring.bottom)/2,natural=ring.left-ring.width*.04;
  const slide=left=>Math.min(Math.max(left,gap),innerWidth-gap-width);
  const spots=[['above',slide(natural),ring.top-15-height],['right',ring.right+15,cy-height/2],['left',ring.left-15-width,cy-height/2],['below',slide(natural),ring.bottom+15]];
  const rects=e=>e.getBoundingClientRect(),obstacles=[...document.querySelectorAll('.player-card, .rounds, .corner > button, #lesson-center, #help, #card-owner, #score-rows .card-select, #score-rows .card-value')].map(rects);
  for(const b of dieButtons)if(!b.hidden){const r=rects(b);obstacles.push({left:r.left,right:r.right,top:r.top-56,bottom:r.bottom});} // a die and its number chip
  const live=obstacles.filter(r=>r.right>r.left),clash=(left,top)=>live.reduce((sum,r)=>sum+Math.max(0,Math.min(r.right,left+width)+gap-Math.max(r.left,left)-0)*Math.max(0,Math.min(r.bottom,top+height)+gap-Math.max(r.top,top)),0);
  const scored=spots.map(([name,left,top])=>({name,left,top,cost:clash(left,top)+(left<gap||top<gap||left+width>innerWidth-gap||top+height>innerHeight-gap?1e9:0)}));
  const pick=scored.find(spot=>spot.cost===0)||scored.reduce((a,b)=>b.cost<a.cost?b:a);
  cupButton.dataset.tag=pick.name;cupButton.style.setProperty('--tag-shift',pick.name==='above'||pick.name==='below'?`${Math.round(pick.left-natural)}px`:'0px');
}
// What the child should pick now glows: the dice the lesson (or the idle hint) wants kept (pick-vfx.js, on the table), and the
// card to lay the score on: the lesson's, Mosi's hint, or the best one once there is nothing else left to do.
function paintPicks(){
  const spec=step(),ready=isHuman()&&settled()&&!voice?.unavailable&&state.rollCount>0;let wanted=[],card=null;
  if(lesson){if(ready&&spec?.type==='hold')wanted=spec.indices.filter(i=>!state.held[i]);if(ready&&spec?.type==='score')card=spec.category;}
  else if(ready&&(state.rollCount>=3||state.held.every(Boolean))){const open=Object.entries(previews(state)).sort((a,b)=>b[1]-a[1]);card=open[0]?.[1]>0?open[0][0]:decideAI(state)?.categoryId??null;}
  else if(ready&&idleHint){wanted=idleHint.dice.filter(i=>!state.held[i]);card=idleHint.card;}
  pick?.show(wanted);for(const [id,cell] of cells)cell.card.classList.toggle('pick',id===card);
}
function resetIdle(){idle=0;idleHint=null;}
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
  if(!isHuman()||!settled()||state.rollCount<1||state.rollCount>=3||!allowed('hold',index))return;holdDie(index);
}
// A die held or let go: the child's tap, or a guest's from her phone (her act was checked by actOf).
function holdDie(index){
  resetIdle();
  state=hold(state,index);dice.setHeld(state.held);world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();audio.cue(state.held[index]?'hold':'release',{index,count:state.held.filter(Boolean).length});
  if(!reduced)effects.trail(dice.dice[index],.36,state.held[index]?'hold':'settle'); // glitter behind it, gold stars where it lands
  if(state.held[index])opponent.react('lean',{target:dice.getFramingPoints()[index]});
  if(lesson){if(step().indices.every(i=>state.held[i]))nextLesson();}else say(state.held.every(Boolean)?'allHeld':state.held[index]?'hold':'release');renderUI();sendViews();
}
// A roll: the child's, Mosi's, or a guest's from her phone (phase 'remote', her act checked by actOf).
function beginRoll(){
  if(!started||paused||state.status!=='playing'||phase==='rolling'||state.rollCount>=3||state.held.every(Boolean))return;
  if(state.currentPlayer===0&&(!isHuman()||!settled()||!allowed('roll')))return;
  voice.stop();captionTime=0;if(!lesson)coach.hidden=true;resetIdle();effects.wake();
  const previous=state;state=roll(state);if(multi)multi.before=previous;
  if(lesson)state.dice=step().hand.map((face,i)=>previous.held[i]?previous.dice[i]:face);
  save();phase='rolling';timer=0;recent=null;view('table');audio.unlock();audio.cue('roll',{count:state.held.filter(h=>!h).length,reduced});dice.startRoll(state.dice,state.held,side(state.currentPlayer),reduced);opponent.react('anticipate');renderUI();sendViews();
}
function rolled(){
  const values=Object.values(previews(state)),best=Math.max(0,...values),kind=best>=40?'great':best>0?'good':'bad',who=state.currentPlayer;
  opponent.react(kind);audio.cue(kind,{strength:.6});effects.emit(dice.getWatchTarget(),{kind:best>=50?'yatzy':kind,reduced});
  if(reduced)view('dice',true);else pendingDiceView=.7;
  takeTurn(true);timer=2.6;if(multi){multi.before=null;multi.lastRoll={seq:++multi.seq,by:who};} // the dice lie: every phone tumbles onto them
  // The child is told what he may do next; any other seat's roll gets Mosi's reaction. A guest who went while it rolled is waited
  // for (takeTurn), and the waiting card's line stands.
  if(lesson)nextLesson();else if(phase!=='waiting')say(speaker(who)!=='you'?kind:state.rollCount===3?'noRolls':state.rollCount===2?'lastRoll':'choose');renderUI();sendViews();
}
function chooseScore(id){
  if(!isHuman()||!settled()||!state.rollCount||state.players[0].scores[id]!==null||!allowed('score',id))return;
  if(previews(state)[id]===0){zeroCategory=id;$('zero-title').textContent=`${CATEGORIES.find(c=>c.id===id).label}: 0 stig?`;openDialog('zero-dialog','zero');return;}record(id);
}
// The score moment (the vfx round): the dice that score fly from the table into the card's picture, the card stamps its score with a
// squash and sparkles, and the score flies on to the portrait (flyScore), where the chip pops and the total counts up to the new one.
// In the solo game Mosi's score stamps on his chip on the child's card; in Fjölspil every score is on its own player's cards.
const onMosiChip=player=>!multi&&player!==0;
function scoreFlight(id,player){
  const chip=playerEls[player].total,held=chipHold[player]??chip.textContent,faces=scoringDice(id,state.dice),used=new Set(),screen=canvas.getBoundingClientRect();chipHold[player]=held;
  const sources=faces.map(face=>{const i=state.dice.findIndex((value,k)=>value===face&&!used.has(k));used.add(i);const p=pixels[i]||{};return {x:screen.left+p.x,y:screen.top+p.y,size:Math.max(30,(p.width||60)-12),index:i};}).filter(s=>s.index>=0&&Number.isFinite(s.x)&&Number.isFinite(s.y));
  for(const s of sources)effects.emit(dice.dice[s.index].position,{kind:'lift',reduced});
  const serial=juice.serial;
  return()=>{const cell=cells.get(id);juice.flyDice(sources,cell.picture).then(()=>{if(serial!==juice.serial)return;juice.stamp(cell.select,onMosiChip(player)?cell.scores.querySelector('.who.mosi'):cell.value);setTimeout(()=>{if(serial===juice.serial)flyScore(id,player,held);},reduced?0:360);});};
}
function flyScore(id,player,held){
  const chipped=onMosiChip(player),cell=cells.get(id),badge=chipped?cell.scores.querySelector('.who.mosi')||cell.value:cell.value,chip=playerEls[player].total,from=badge.getBoundingClientRect(),to=chip.getBoundingClientRect(),points=chipped?state.players[1].scores[id]:cell.value.textContent;
  const land=()=>{audio.cue('land',{player:side(player)});chipHold[player]=null;renderUI();const target=Number(chip.textContent)||0;chipHold[player]=held;chip.textContent=held;juice.pop(chip,1.45);
    juice.countUp(chip,Number(held)||0,target,value=>{chipHold[player]=value;chip.textContent=value;}).then(()=>{chipHold[player]=null;renderUI();});};
  if(reduced||!from.width||!to.width){land();return;}
  chipHold[player]=held; // the old total stays until the score lands
  const flyer=document.createElement('strong');flyer.className='card-value score-flyer';flyer.dataset.who=multi?'seat':player?'mosi':'you';flyer.textContent=String(points);flyer.setAttribute('aria-hidden','true');
  if(multi){flyer.style.setProperty('--c',playerEls[player].colour);flyer.style.setProperty('--c-deep',playerEls[player].deep);} // in the player's own colour
  Object.assign(flyer.style,{left:`${from.left}px`,top:`${from.top}px`,minWidth:`${from.width}px`,height:`${from.height}px`,fontSize:getComputedStyle(badge).fontSize});document.body.append(flyer);
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2);
  flyer.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.45}px,${dy*.45-60}px) scale(1.25)`,offset:.45},{transform:`translate(${dx}px,${dy}px) scale(.7)`,opacity:.9}],{duration:720,easing:'cubic-bezier(.45,0,.25,1)'}).finished.then(()=>{flyer.remove();land();},()=>{flyer.remove();chipHold[player]=null;});
}
function record(id){
  const player=state.currentPlayer,points=previews(state)[id],flight=scoreFlight(id,player);voice.stop();resetIdle();state=score(state,id);recent=id;
  effects.emit(dice.getWatchTarget(),{kind:points>=50?'yatzy':points?'score':'bad',reduced});audio.cue(points?'score':'bad',{points,player:side(player)});
  // Mosi hops in his seat for a good score of the child's (or a guest's) and slumps, "aww", at a zero; his own get a nod or a sigh.
  const reaction=mosiPlays(player)?(points>=20?'great':points?'good':'bad'):points>=10?'cheer':points?'good':'aww';opponent.react(reaction);
  if(lesson){lesson.awards[id]=points;lesson.faces[id]=state.players[0].faces[id];phase='human';view('table');nextLesson();renderUI();flight();return;}
  save();phase='handoff';timer=1.8;view('table');effects.betweenTurns();
  // One important motion at a time: his hop (or slump) first, then the line.
  if(!reduced&&(reaction==='cheer'||reaction==='aww'))later={t:.8,fn:()=>{if(phase==='handoff')speakScore(player,points);}};else speakScore(player,points);
  renderUI();flight();sendViews();
}
function resultCopy(){
  if(multi){$('win-title').textContent=state.winner==='tie'?'Jafntefli!':`${players[Number(state.winner)].name} vann!`;$('win-copy').textContent=players.map(({name},i)=>`${name} ${totals(state.players[i].scores).total}`).join(' · ');return;}
  const a=totals(state.players[0].scores).total,b=totals(state.players[1].scores).total;$('win-title').textContent=state.winner==='tie'?'Jafntefli!':state.winner==='you'?'Þú vannst!':'Mosi vann!';$('win-copy').textContent=`Þú ${a} · Mosi ${b}`;}
function advanceTurn(){
  if(state.status==='finished'){phase='finished';resultCopy();opponent.react('win');audio.cue('win',{winner:!multi||state.winner==='tie'?state.winner:mosiPlays(Number(state.winner))?'mosi':'you'});
    // Confetti, two volleys of fireworks over the table and Mosi's celebration play out before the result card comes up.
    const open=()=>{if(phase==='finished'&&state.status==='finished')openDialog('win-dialog',resultSpeech());};if(reduced)open();else{effects.celebrate();later={t:2.7,fn:open};}renderUI();sendViews();return;}
  // The turn moves on to the next seat round the ring, played as its seat is (turnPhase); the cards are its player's now.
  const who=state.currentPlayer;recent=null;if(multi)owner=who;dice.sync(state.dice,state.held,side(who),{animate:!reduced});takeTurn();timer=.9;aiDecision=null;audio.cue('turn',{player:side(who)});speakTurn(who);renderUI();sendViews();
}
// The computer's turn, for whichever seat it plays: Mosi's own, or a guest's he covers while she is away.
function aiStep(){
  if(lesson||!phase.startsWith('ai-')||state.status!=='playing'||voice.busy||!settled())return;
  if(phase==='ai-wait'){aiDecision=decideAI(state);if(aiDecision.type==='score'){phase='ai-score';timer=.8;}
    else if(state.rollCount===0)beginRoll();else{for(let i=0;i<5;i++)if(state.held[i]!==aiDecision.held[i])state=hold(state,i,aiDecision.held[i]);dice.setHeld(state.held);audio.cue('hold',{count:state.held.filter(Boolean).length,run:true,strength:.7});world.setDiceFocus(dice.getFramingPoints(),{snap:reduced});save();phase='ai-hold';timer=.85;sendViews();}}
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
  if(multi)return; // the lesson is the child's alone with Mosi (spec §7)
  if(!lesson)lessonReturn={state:structuredClone(state),started,phase,scoreScroll:$('score-rows').scrollTop};
  voice.stop();audio.cancel();effects.clear();juice.cancel();chipHold.fill(null);later=null;opponent.reset();lesson={index:0,awards:{},faces:{}};state=createGame({seed:606});started=true;phase='human';timer=0;recent=null;aiDecision=null;zeroCategory=null;
  dice.sync(state.dice,state.held,0);view('table',true);$('controls').hidden=false;closeDialogs();audio.unlock();enterStep();
}
function leaveLesson(play=false){
  if(!lesson)return;voice.stop();lessonAdvance=-1;const previous=lessonReturn;lesson=null;lessonReturn=null;audio.cancel();effects.clear();juice.cancel();chipHold.fill(null);later=null;opponent.reset();state=previous.state;started=previous.started;recent=null;aiDecision=null;zeroCategory=null;
  phase=!started?'intro':state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.9;
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0?'dice':'table',true);$('controls').hidden=!started;coach.hidden=true;closeDialogs();renderUI();$('score-rows').scrollTo({top:previous.scoreScroll,behavior:'instant'});
  if(!started){if(play)start(Boolean(saved));else welcome();}else if(state.status==='finished'){resultCopy();openDialog('win-dialog');}else say('resume');
}
// Every game starts from a quiet table: no line, sound, flight or glow left from the one before, and no lesson.
function hush(){voice.stop();resetIdle();audio.cancel();effects.clear();juice.cancel();chipHold.fill(null);later=null;opponent.reset();lesson=null;lessonReturn=null;lessonAdvance=-1;zeroCategory=null;aiDecision=null;recent=null;}
// The welcome card, with "Halda áfram" when a solo game is kept and "Halda áfram (Fjölspil)" when a game of seats is.
function welcome(){$('continue').hidden=!saved;$('continue-multi').hidden=!readFjolspil(local());openDialog('welcome');}
function start(continuing=false){
  if(multi)endMulti();
  hush();
  state=continuing&&saved?structuredClone(saved):createGame({seed:crypto.getRandomValues(new Uint32Array(1))[0]});started=true;phase=state.status==='finished'?'finished':turnPhase();timer=.9;
  dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount>0&&state.status==='playing'?'dice':'table',true);$('controls').hidden=false;closeDialogs();audio.unlock();save();renderUI();$('score-rows').scrollTo({top:0,behavior:'instant'});
  if(state.status==='finished'){resultCopy();openDialog('win-dialog',resultSpeech());}else say(continuing?'resume':'yourTurn');
}
// "Byrjum!" in the lobby: a game of its seats, player i in seat i; Egill in seat 0 starts, as the child does alone. Mosi joins in
// when the lobby added him; the phones are sent the table at once.
function startMulti(seats){seatGame(seats,createGame({seed:crypto.getRandomValues(new Uint32Array(1))[0],players:playersOf(fjolspil.seats)}));}
// "Halda áfram (Fjölspil)": the kept game where it was left, in the seats fjolspil.resume took back, in the room this tab had (its
// sessionStorage), so the guests' phones come back to it by themselves; the turn of one who is not back yet waits for her.
function resumeMulti(kept){seatGame(fjolspil.seats.list(),structuredClone(kept),true);}
function seatGame(seats,game,resumed=false){
  hush();seatsOff?.();multi={seats,lastRoll:null,seq:0,before:null};seatsOff=fjolspil.seats.onChange(seatsChanged);state=game;owner=state.currentPlayer;started=true;
  buildPlayers(seats.map(seat=>({name:seat.name,avatar:seat.avatar,colour:avatarOf(seat.avatar)?.colour??'var(--teal)',isMosi:seat.kind==='ai'&&!seat.covered})));syncMultiButtons();
  takeTurn();timer=.9;dice.sync(state.dice,state.held,side(state.currentPlayer));view(resumed&&state.rollCount>0?'dice':'table',true);$('controls').hidden=false;closeDialogs();audio.unlock();save();renderUI();$('score-rows').scrollTo({top:0,behavior:'instant'});
  // A new game is welcomed, then its first turn's line; a kept one goes on, unless its turn waits for a guest (waitTurn's line).
  const who=state.currentPlayer;if(!resumed)say('multiWelcome',()=>{if(multi&&state.currentPlayer===who&&state.rollCount===0)speakTurn(who);});else if(phase!=='waiting')say('resume');sendViews();
}
// A guest's phone goes or comes back: her card dims or lights; when it goes on her own turn, the turn waits for her (once the seats'
// own change is over).
function seatsChanged(){if(!multi||!world)return;renderUI();if(phase==='remote'&&turnPhase()==='waiting')setTimeout(()=>{if(multi&&phase==='remote'&&turnPhase()==='waiting')takeTurn();});}
// A guest's turn while her phone is away: the lobby's waiting card over the table (fjolspil.waitFor: "Bíðum eftir …", and after 20 s
// "Halda áfram án …"). 'back': she plays it from her phone; 'cover': Mosi plays her seat, saying only his reactions to its rolls
// and its score (speaker), until she is back for its next turn (which waitFor gives her at once); 'closed': the game of seats is
// over (another tab took the room).
async function waitTurn(who){
  const game=multi,seat=seatOf(who);if(seat?.guestId&&!seat.present)say('multiWait'); // the waiting card comes up (fjolspil.waitFor)
  const result=await fjolspil.waitFor(who);
  if(multi!==game||state.currentPlayer!==who||phase!=='waiting')return; // the game ended, or the turn moved on, meanwhile
  if(result==='closed'){endMulti();welcome();return;}
  takeTurn();timer=.9;speakTurn(who);renderUI();sendViews(); // "Næsti kastar!" when she is back; nothing while Mosi covers her
}
// The game of seats ends ("Hætta Fjölspili", a solo game, a new lobby, the room taken by another tab): the phones wait for the next
// lobby, its kept game is let go, and the table is the solo one again, not started, with the child's and Mosi's bar (what comes next
// is the caller's: the welcome card, or the game it starts).
function endMulti(){
  fjolspil.closeGame();forgetFjolspil(local());seatsOff?.();seatsOff=null;multi=null;owner=0;hush();state=createGame();started=false;phase='intro';timer=0;
  buildPlayers(SOLO_PLAYERS);syncMultiButtons();dice.sync(state.dice,state.held,0);view('table',true);$('controls').hidden=true;renderUI();
}
// While a game of seats is on, the lesson and its demonstration are closed (spec §7: "Læra með Mosa", "Sýndu mér"), and the pause
// card's "Byrja upp á nýtt" is "Hætta Fjölspili", which ends it.
function syncMultiButtons(){$('learn').hidden=$('learn-help').hidden=Boolean(multi);$('new-game').textContent=multi?'Hætta Fjölspili':'Byrja upp á nýtt';}
// What each guest's phone shows (fjolspil.js yatzyView), sent after every change of the table: to the players of this game only
// (a guest seated since is not in it), never broadcast. While the dice are in the air the phones see the table as it stood, so the
// new faces show on both screens once they lie; a phone's controls are live only while the table waits for it. Nothing is sent
// while the lobby is up (the phones see its views then), and a game that is over is not said to be paused (its result card is up).
function sendView(seat){if(!multi||lobbyUp)return;fjolspil.send(seat,yatzyView(multi.before??state,fjolspil.seats,seat,{settled:phase==='remote'&&settled(),paused:paused&&state.status==='playing',lastRoll:multi.lastRoll}));}
function sendViews(){if(!multi||lobbyUp)return;for(const seat of fjolspil.seats.list())if(seat.guestId&&seat.seat<state.players.length)sendView(seat.seat);}
// A guest's act from her phone (fjolspil.js hears only a guest who is there and plays her own seat). It is played when actOf finds
// it fits now; anything else (not her turn, the dice moving, a card used) is let be, and her phone is sent her view again so it
// shows what it may do. The question before a card that scores nothing is her phone's.
function guestAct(seat,body){
  if(!multi||seat>=state.players.length)return;
  const act=actOf(state,seat,body,{settled:phoneMay()});
  if(!act){sendView(seat);return;}
  if(act.type==='roll')beginRoll();else if(act.type==='hold')holdDie(act.die);else record(act.card);
}
// "Fjölspil" on the welcome card: the lobby over the table (which holds still under it); its X goes back to the welcome card. A
// game of seats still on ends first: one at a time.
async function openMulti(){
  if(multi)endMulti();
  closeDialogs();lobbyUp=true;syncPause();let opened=null;
  try{opened=await fjolspil.openLobby({ai:MOSI_AI});}finally{lobbyUp=false;syncPause();}
  if(!opened){welcome();return;}
  startMulti(opened.seats);
}
// "Halda áfram (Fjölspil)": the room again with the kept seats; when this tab cannot have it (another took it), the seats there are
// not the kept game's, and the welcome card stays.
async function continueMulti(){
  const kept=readFjolspil(local());if(!kept||multi){welcome();return;}
  await fjolspil.resume(kept.seats);
  if(fjolspil.seats.count!==kept.state.players.length){welcome();return;}
  resumeMulti(kept.state);
}

$('start').addEventListener('click',()=>start());$('continue').addEventListener('click',()=>start(true));$('continue-multi').addEventListener('click',()=>{if(fjolspil)continueMulti();});$('multi').addEventListener('click',()=>{if(fjolspil)openMulti();});
$('play-again').addEventListener('click',()=>{if(multi)startMulti(fjolspil.seats.list());else start();}); // a game of seats plays again in the same seats
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
$('new-game').addEventListener('click',()=>{if(lesson)leaveLesson();if(multi)endMulti();voice.stop();closeDialogs();welcome();}); // "Hætta Fjölspili" in a game of seats
$('confirm-zero').addEventListener('click',()=>{const id=zeroCategory;zeroCategory=null;voice.stop();closeDialogs();if(id&&isHuman())record(id);});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&modalNarration){modalNarration=false;voice?.stop();coach.hidden=!lesson;syncPause();if(lesson)speakStep();}else syncPause();});
  dialog.addEventListener('cancel',event=>{if(dialog.id==='welcome'&&!started)event.preventDefault();});
});
document.addEventListener('visibilitychange',syncPause);
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>audio.cue('dialogClose',{id:dialog.id})));
// The raised buttons tap (the dice, the cards and the cup have sounds of their own, and the lobby's buttons tap through its audio).
document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button&&!button.matches('.die-target,.card-select,#cup-target')&&!button.closest('#fjolspil'))audio.cue('tap');});
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(/^[1-5]$/.test(event.key)&&isHuman()){event.preventDefault();toggleHold(Number(event.key)-1);}else if(event.code==='Space'&&isHuman()&&document.activeElement?.tagName!=='BUTTON'){event.preventDefault();beginRoll();}else if(event.code==='Escape'&&started&&!paused){event.preventDefault();openDialog('pause-dialog');}});
function cleanupScene(){pick?.dispose();effects?.dispose();dice?.dispose();opponent?.dispose();world?.dispose();}
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();voice?.dispose();audio.dispose();cleanupScene();}
// The page goes (the book closes its frame, a reload): the phones wait for the next lobby, but the kept game stays, for "Halda áfram
// (Fjölspil)" when the page is back; a wait for a guest that this ends ('closed') ends nothing more here.
addEventListener('pagehide',()=>{if(multi){multi=null;fjolspil.closeGame();}});
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
    voice=createJuniorVoice({lines:LINES,manifest:voiceManifest,
      onLine(id,text){if(coach.hidden){audio.cue('bubble');juice.bubble(coach);}coach.hidden=false;captionTime=0;coach.dataset.voice='pending';$('voice-recovery').hidden=true;$('lesson-line').textContent=lesson?step().caption:captionFor(id)||text;paintCoach();},
      onUnavailable(){lessonAdvance=-1;coach.dataset.voice='unavailable';syncVoiceRecovery();renderUI();},
      // A line not recorded yet (Fjölspil's) moves his mouth from its words over the time they take (talk.js mouthFromText).
      onSpeaking(speaking){audio.duck(speaking);coach.dataset.voice=voice.getDebugState().mode;if(speaking&&opponent){const id=voice.currentId,clip=voiceManifest[id],{elapsed:at,duration}=voice.getDebugState();opponent.actor.talk({duration:Math.max(0,duration-at),mouth:clip?.mouth?.slice(Math.floor(at*20))??null,text:LINES[id].text});}else opponent?.actor.stopTalking();}
    });voice.mute(muted);
    // A font download is optional; it must never hold the entire board hostage.
    await waitForStartup(document.fonts.ready,{signal,timeoutMs:1500,optional:true});check();
    onStage('forest');await wait(createYatzyWorld(canvas,{shot:TABLE_SHOT}).then(resource=>take(resource,value=>{world=value;})));check();effects=createYatzyEffects(world,{lively:true});effects.setAmbient(true);pick=createPickEffects(world);
    onStage('players');
    await wait(Promise.all([
      createMosiOpponent(world,{tableY:world.table.y,farZ:world.table.farZ,lively:true,onEvent(kind,data){audio.cue(kind==='hop'?'mosi-hop':`mosi-${data.kind}`,{strength:data.strength??1});}}).then(resource=>take(resource,value=>{opponent=value;})),
      createDiceAndCup(world,{layout:TABLE_LAYOUT,lively:true,onEvent(kind,data){audio.cue(kind,{strength:data.strength*(voice.busy?.55:1),pan:data.position.x/3,die:data.die,at:data.position});if(['impact','sweep','release','settle'].includes(kind))effects.emit(data.position,{kind,strength:data.strength,reduced});}}).then(resource=>take(resource,value=>{dice=value;}))
    ]));check();
    onStage('shaders');dice.setReducedMotion(reduced);world.update(0,0);opponent.update(.001,0,{reducedMotion:reduced});world.scene.updateMatrixWorld(true);world.resize();dice.dice.forEach(d=>{d.visible=true;});
    // compileAsync polls the driver forever after some context-loss failures.
    // Prepare programs while the loading cover is up; the first render completes them.
    world.renderer.compile(world.scene,world.camera);
    if(world.renderer.getContext().isContextLost())throw new Error('WebGL context lost while preparing the board');
    check();
    world.render();dice.sync(state.dice,state.held,0);world.render();check();
    if(world.renderer.getContext().isContextLost())throw new Error('WebGL context lost while drawing the board');
    // "Fjölspil": the page's own room, apart from the book's in the same tab (STORAGE_KEY); the lobby's taps are the page's tap.
    fjolspil=createFjolspil(document,{storageKey:STORAGE_KEY,audio:{sfx:()=>audio.cue('tap')}});fjolspil.onAct(guestAct);
    $('loading').hidden=true;$('game').inert=false;savePrefs();renderUI();welcome();
    let dirty=true;const measure=()=>{targetWidth=canvas.clientWidth;targetHeight=canvas.clientHeight;barEnd();};measure();resizeObserver=new ResizeObserver(()=>{measure();dirty=true;updateTargets();});resizeObserver.observe(canvas);
    document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{dirty=true;}));
    const tick=now=>{
      if(disposed)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;voice.update(dt);
      if(!paused){
        elapsed+=dt;timer-=dt;
        if(captionTime>0){captionTime-=dt;if(captionTime<=0&&!lesson&&!voice.busy)coach.hidden=true;}
        if(pendingDiceView>=0){pendingDiceView-=dt;if(pendingDiceView<=0)view('dice');}
        if(later){later.t-=dt;if(later.t<=0){const fn=later.fn;later=null;fn();}}
        if(phase==='rolling'&&dice.update(dt))rolled();else if(phase!=='rolling')dice.update(dt);
        if(lessonAdvance>=0){lessonAdvance-=dt;if(lessonAdvance<=0){lessonAdvance=-1;if(step()?.type==='finish')leaveLesson(true);else nextLesson();}}
        if(!lesson&&timer<=0&&!voice.busy&&!later){if(phase==='handoff')advanceTurn();else if(phase.startsWith('ai-'))aiStep();}
        opponentFrame.thinking=phase==='ai-wait'||phase==='ai-score';opponentFrame.rolling=phase==='rolling';watchAt??=new world.THREE.Vector3();opponentFrame.target=opponentFrame.rolling?dice.getWatchTarget(watchAt):null;const perch=effects.butterfly;opponentFrame.waiting=phase==='human'||phase==='remote'||(phase==='handoff'&&Boolean(perch));opponentFrame.watch=perch||(opponentFrame.waiting?dice.getWatchTarget(watchAt):null); // his eyes on the dice, or on a butterfly coming to sitopponentFrame.reducedMotion=reduced;
        if(opponentFrame.thinking&&!voice.busy&&timer>0)audio.cue('think'); // tick, tock while Mosi decides
        // The idle hint: ten quiet seconds on the child's turn with rolls left, and the dice Mosi would keep (or his card) glow.
        if(!lesson&&isHuman()&&settled()&&state.rollCount>0&&state.rollCount<3&&!idleHint){idle+=dt;if(idle>=10){const d=decideAI(state);idleHint={dice:d?.type==='roll'?d.held.flatMap((keep,i)=>keep&&!state.held[i]?[i]:[]):[],card:d?.type==='score'?d.categoryId:null};renderUI();opponent.react('nod');}}
        opponent.update(dt,elapsed,opponentFrame);effects.update(reduced?0:dt);pick.update(dt,dice.dice,reduced);world.update(reduced?0:dt,elapsed);
        pick.lift(dice.dice,1);world.render();pick.lift(dice.dice,-1); // the hop is drawn, the hit areas stay put
        const ready=settled();if(ready!==readyLast){readyLast=ready;renderUI();sendViews();}updateTargets();dirty=false; // the phones learn when the dice lie still
      }else if(modalNarration&&!document.hidden&&!qaFrozen){
        // A voiced dialog can animate Mosi while the board, turn and camera stay paused.
        opponentFrame.thinking=false;opponentFrame.rolling=false;opponentFrame.target=null;opponentFrame.waiting=false;opponentFrame.reducedMotion=reduced;
        opponent.update(dt,elapsed,opponentFrame);if(phase==='finished')effects.update(reduced?0:dt);world.render();dirty=false; // the win's fireworks finish behind its card
      }else if(dirty){world.render();updateTargets();dirty=false;}
      frame=requestAnimationFrame(tick);
    };last=performance.now();frame=requestAnimationFrame(tick);
    if(new URLSearchParams(location.search).has('qa'))window.__juniorQA={world,dice,opponent,effects,audio,voice,fjolspil,
      getState:()=>structuredClone(state),getStatus:()=>({phase,paused,reduced,started,timer,lessonAdvance,settled:settled()}),
      getMulti:()=>multi&&{seats:fjolspil.seats.list(),lastRoll:multi.lastRoll},
      getTutorial:()=>lesson?{active:true,...structuredClone(lesson),...step()}:{active:false},
      freeze(value){qaFrozen=Boolean(value);syncPause();},
      setState(value){validateGame(value);voice.stop();resetIdle();lesson=null;lessonReturn=null;lessonAdvance=-1;state=structuredClone(value);started=true;phase=state.status==='finished'?'finished':state.currentPlayer===0?'human':'ai-wait';timer=.8;dice.sync(state.dice,state.held,state.currentPlayer);view(state.rollCount?'dice':'table',true);$('controls').hidden=false;closeDialogs();renderUI();},dispose};
    onStage('ready');
  }catch(error){dispose();throw error;}
  finally{signal?.removeEventListener('abort',onAbort);}
}
