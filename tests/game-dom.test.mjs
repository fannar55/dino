import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import * as progress from '../dist/progress.js';
import * as story from '../dist/story.js';
import * as content from '../dist/adventure-content.js';
import * as exploration from '../dist/exploration.js';
import * as celebration from '../dist/celebration-vfx.js';
import * as illustrations from '../dist/discovery-illustrations.js';
import * as miniProgress from '../dist/mini-progress.js';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const source=(await readFile(new URL('../dist/game.js',import.meta.url),'utf8'))
 .replace(/^import \{([^}]+)\} from '\.\/progress\.js';/m,'const {$1}=__progress;')
 .replace(/^import \{([^}]+)\} from '\.\/story\.js';/m,'const {$1}=__story;')
 .replace(/^import \{([^}]+)\} from '\.\/adventure-content\.js';/m,'const {$1}=__deps.content;')
 .replace(/^import \{([^}]+)\} from '\.\/exploration\.js';/m,'const {$1}=__deps.exploration;')
 .replace(/^import \{([^}]+)\} from '\.\/celebration-vfx\.js';/m,'const {$1}=__deps.celebration;')
 .replace(/^import \{([^}]+)\} from '\.\/discovery-illustrations\.js';/m,'const {$1}=__deps.illustrations;')
 .replace(/^import \{([^}]+)\} from '\.\/dinosaur-club\.js';/m,'const {$1}=__deps.club;')
 .replace(/^import \{([^}]+)\} from '\.\/mini-progress\.js';/m,'const {$1}=__deps.miniProgress;')
 .replace("import('./world.js')",'Promise.resolve(__deps.world)').replace("import('./audio.js')",'Promise.resolve(__deps.audio)');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}
async function setup(saved,{holdArrivalNarration=false,holdRideReturn=false,holdNarrations=[],rideKind=null,ridePhase='exploring',holdRideReplay=false}={}){
 const {window,document}=parseHTML(html);let now=0,sequence=0;const tasks=new Map(),writes=[],data=new Map(saved?[[progress.SAVE_KEY,JSON.stringify(saved)]]:[]),spoken=[],views=[],missing=[];
 const original=document.getElementById.bind(document);document.getElementById=id=>{const n=original(id);if(!n)missing.push(id);return n;};
 Object.defineProperty(document,'hidden',{value:false,writable:true});
 for(const d of document.querySelectorAll('dialog')){d.open=false;d.showModal=()=>{d.open=true;};d.close=()=>{d.open=false;};}
 const setTimeout=(fn,ms=0)=>{const id=++sequence;tasks.set(id,{fn,at:now+ms});return id;};const clearTimeout=id=>tasks.delete(id);
 let clubOptions;const invites=[];
 const stoppedNarrations=[],arrivals=[],narrationWaits=[],starNotes=[],rewards=[],rideReturns=[],rideReplays=[],focuses=[],pans=[],animalCalls=[],foley=[],touches=[];let worldPaused=false,activity=null,onDiscovery,onInteract,onActivityEvent,onWorldTouch,currentSpeech,currentRidePhase=ridePhase;
 const world={setView:v=>views.push(v),arrive:v=>new Promise(resolve=>arrivals.push({...v,resolve})),setPaused(v){worldPaused=v;},celebrate(){},dispose(){},resize(){},setActivity(value){activity=value;},updateActivityProgress(value){activity={...activity,...value};},clearActivity(){activity=null;},panExploration(x,y){pans.push([x,y]);},finishActivityRide(){return holdRideReturn?new Promise(resolve=>rideReturns.push(resolve)):Promise.resolve({completed:true});},getDiscoveryScreenPositions(){return[];},focusDiscovery(){return Promise.resolve({completed:true});},activateDiscovery(id){const a=content.ADVENTURES[activity.species],target=[...a.targets,a.secret].find(t=>t.id===id);if(target)onDiscovery({...target,secret:id===a.secret.id,screen:{x:.5,y:.4},pan:0});}};let muted=false;
 world.focusDiscovery=id=>{focuses.push(id);return Promise.resolve({completed:true});};
 if(rideKind||holdRideReplay)world.getActivityState=()=>({kind:rideKind,phase:currentRidePhase,busy:currentRidePhase==='pickup',canReturn:currentRidePhase==='exploring'});
 if(holdRideReplay)world.replayActivityRide=()=>{currentRidePhase='pickup';return new Promise(resolve=>rideReplays.push(resolve));};
 function finishSpeech(result){const pending=currentSpeech;currentSpeech=null;pending?.resolve(result);}
 const audio={unlock(){},narrate:(id,text)=>{finishSpeech(false);spoken.push({id,text});if(holdNarrations.includes(id))return new Promise(resolve=>{currentSpeech={id,resolve};});return holdArrivalNarration&&id.endsWith('Arrival')?new Promise(resolve=>narrationWaits.push(resolve)):Promise.resolve(true);},stopNarration(){if(currentSpeech)stoppedNarrations.push(currentSpeech.id);finishSpeech(false);},setWalking(){},setScene(){},setPaused(){},effect(){},star(options){starNotes.push(options);},celebrate(options){rewards.push(options);},animal(species,options){animalCalls.push({species,...options});},arrival(event){foley.push(event);},worldTouch(kind,options){touches.push({kind,...options});},setMuted(v){muted=v;},isMuted:()=>muted};
 await new AsyncFunction('__progress','__story','__deps','window','document','localStorage','navigator','performance','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','location',source)(progress,story,{content,exploration,celebration,illustrations,miniProgress,club:{createDinosaurClub:(dialog,options)=>{clubOptions=options;return {invite(id){invites.push(id);dialog.showModal();},collection(){dialog.showModal();},resetPuzzles(){writes.push(['jigsaw-reset',true]);}};}},world:{createWorld:(_canvas,options)=>{onDiscovery=options.onDiscovery;onInteract=options.onInteract;onActivityEvent=options.onActivityEvent;onWorldTouch=options.onWorldTouch;return world;}},audio:{createAudio:()=>audio}},window,document,{getItem:k=>data.get(k)||null,setItem:(k,v)=>{writes.push([k,v]);data.set(k,v);}}, {},{now:()=>now},setTimeout,clearTimeout,fn=>setTimeout(()=>fn(now),16),clearTimeout,{reload(){}});
 await flush();
 return{document,writes,spoken,views,missing,invites,async closeMini(){document.getElementById('club-dialog').close();clubOptions.onClose();await flush();},async winMini(species){clubOptions.onAward(species);await flush();},stoppedNarrations,arrivals,starNotes,rewards,pans,rideReturns,rideReplays,focuses,animalCalls,foley,touches,state:()=>JSON.parse(data.get(progress.SAVE_KEY)||'null'),paused:()=>worldPaused,
  async interact(id){onInteract(id);await flush();},async activityEvent(event){onActivityEvent(event);await flush();},async touch(event){onWorldTouch(event);await flush();},
  async finishSpeech(){finishSpeech(true);await flush();},
  async finishRide(){currentRidePhase='complete';rideReturns.shift()?.({completed:true,cancelled:false});await flush();},
  async finishReplay({cancelled=false}={}){currentRidePhase=cancelled?'complete':'exploring';rideReplays.shift()?.({completed:!cancelled,cancelled});await flush();},
  async finishArrival(index=arrivals.length-1){assert.ok(arrivals[index],'Entrance must have started');arrivals[index].resolve({completed:true,cancelled:false});await flush();},
  async finishNarration(){narrationWaits.shift()?.(true);await flush();},
  async click(selector){const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new window.Event('click',{bubbles:true}));await flush();},
  async advance(ms){const end=now+ms;for(let safety=0;safety<10000;safety++){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;await flush();return;}const[id,t]=next;now=t.at;tasks.delete(id);t.fn();await flush();}throw new Error('Timer runaway');}
 };
}
test('full real UI journey: invitation, walking, visible question, hint retries, six discoveries, book',async()=>{
 const g=await setup();assert.equal(g.writes.length,0);assert.equal(g.document.getElementById('stage-ui').hidden,true);
 await g.click('#start');await g.click('#actions button:nth-child(2)');assert.equal(g.state().stage,'invite');assert.equal(g.document.querySelectorAll('#actions button').length,1);await g.click('#actions button');
 for(const e of story.ENCOUNTERS){
  await g.advance(9000);assert.equal(g.state().stage,'travel');assert.equal(g.arrivals.at(-1).species,e.species);await g.finishArrival();assert.equal(g.state().stage,'question');assert.equal(g.views.at(-1).species,e.species);
  const previous=g.state();await g.click('.name-audio');assert.deepEqual(g.state(),previous);
  const wrong=e.choices.find(id=>id!==e.species);await g.click('[data-species="'+wrong+'"]');assert.equal(g.state().stage,'hint');assert.equal(g.document.querySelector('[data-species="'+wrong+'"]'),null);
  await g.click('[data-species="'+e.species+'"]');assert.equal(g.state().stage,'correct');assert.equal(g.document.getElementById('discovery-name').textContent,story.SPECIES[e.species].name);await g.click('#actions .button');
  const a=content.ADVENTURES[e.species];assert.equal(g.state().exploring,e.species);
  for(const target of a.targets){await g.click('[data-target="'+target.id+'"]');await g.advance(2500);if(g.document.getElementById('finding-dialog').open)await g.click('#finding-back');}
  await g.click('[data-target="'+a.secret.id+'"]');await g.advance(2500);if(g.document.getElementById('finding-dialog').open)await g.click('#finding-back');const allTargets=g.state();await g.click('[data-target="'+a.secret.id+'"]');assert.deepEqual(g.state(),allTargets,'Secrets cannot be farmed');if(g.document.getElementById('finding-dialog').open)await g.click('#finding-back');
  await g.click('#actions .button');assert.equal(g.state().explorePhase,'bonus');
  await g.click('[data-bonus="'+a.bonus.choices.find(c=>c.id!==a.bonus.answer).id+'"]');assert.equal(g.state().explorePhase,'bonusHint');
  await g.click('[data-bonus="'+a.bonus.answer+'"]');assert.equal(g.state().explorePhase,'bonusCorrect');
  assert.equal(exploration.adventureScore(g.state(),e.species),4);await g.click('#actions button:nth-child(2)');
 }
 assert.equal(g.state().stage,'complete');assert.equal(g.state().found.length,6);assert.equal(exploration.starCount(g.state()),24);await g.click('#actions .button');assert.equal(g.document.querySelectorAll('#collection button').length,6);assert.deepEqual(g.missing,[]);
});
test('modal stops auto-travel; closing resumes without losing saved progress',async()=>{
 const g=await setup();await g.click('#start');await g.click('#actions button');await g.advance(1200);await g.click('#book');await g.advance(20000);assert.equal(g.state().stage,'travel');assert.equal(g.arrivals.length,0);await g.click('#close-book');await g.advance(5300);await g.finishArrival();assert.equal(g.state().stage,'question');
});

test('questions wait for both visible entrance and narration; a book pause preserves the same entrance',async()=>{
 const g=await setup(undefined,{holdArrivalNarration:true});await g.click('#start');await g.click('#actions button');await g.advance(7000);
 assert.equal(g.document.getElementById('app').dataset.stage,'arrival');assert.equal(g.document.querySelectorAll('.choice').length,0);assert.equal(g.arrivals.length,1);
 await g.click('#book');assert.equal(g.paused(),true);await g.advance(30000);await g.click('#close-book');assert.equal(g.paused(),false);assert.equal(g.arrivals.length,1,'Do not start the animal again after closing the book');
 await g.finishArrival();assert.equal(g.state().stage,'travel','The narrator is still speaking');await g.finishNarration();assert.equal(g.state().stage,'question');
});

test('an old arrival cannot advance the story after selecting an animal from the book',async()=>{
 let s=progress.freshProgress();for(const event of [{type:'START'},{type:'ARRIVE'},{type:'ANSWER',species:'stegosaurus'},{type:'NEXT'}])s=progress.evolve(s,event);
 const g=await setup(s);await g.click('#start');await g.advance(7000);assert.equal(g.arrivals.length,1);await g.click('#book');await g.click('#collection button');
 assert.equal(g.document.getElementById('app').dataset.stage,'inspect');await g.finishArrival(0);assert.equal(g.state().stage,'travel');assert.equal(g.document.getElementById('app').dataset.stage,'inspect');
 await g.click('#actions button:nth-child(3)');await g.advance(7000);assert.equal(g.arrivals.length,2);await g.finishArrival(1);assert.equal(g.state().stage,'question');assert.equal(g.views.at(-1).species,'brachiosaurus');
});

test('a deliberate adult restart cancels both parts of the old arrival',async()=>{
 const g=await setup(undefined,{holdArrivalNarration:true});
 await g.click('#start');await g.click('#actions button');await g.advance(7000);
 assert.equal(g.arrivals.length,1);assert.equal(g.document.getElementById('app').dataset.stage,'arrival');
 await g.click('#book');await g.click('#adult');
 const down=new g.document.defaultView.Event('pointerdown',{bubbles:true,cancelable:true});
 Object.defineProperty(down,'pointerId',{value:1});g.document.getElementById('restart').dispatchEvent(down);
 await g.advance(3200);
 assert.equal(g.state().stage,'welcome');assert.equal(g.paused(),false);
 assert.equal(g.writes.filter(([key])=>key==='jigsaw-reset').length,1,'Only the completed adult hold resets saved puzzles');
 // A network-delayed narration and the previous animation may still settle.
 // Neither is allowed to skip the new child's welcome/invitation.
 await g.finishArrival(0);await g.finishNarration();
 assert.equal(g.state().stage,'welcome');assert.equal(g.document.getElementById('app').dataset.stage,'welcome');
 assert.equal(g.document.querySelectorAll('.choice').length,0);
});
test('intro does not overwrite a saved trip; resume restores the exact discovery',async()=>{
 let s=progress.evolve(progress.evolve(progress.freshProgress(),{type:'START'}),{type:'ARRIVE'});s=progress.evolve(s,{type:'ANSWER',species:'stegosaurus'});
 const g=await setup(s);assert.equal(g.writes.length,0);await g.click('#start');assert.deepEqual(g.state(),s);assert.equal(g.views.at(-1).species,'stegosaurus');
});

test('reeds keep their own musical note when played out of order or replayed without extra stars',async()=>{
 let state=progress.evolve(progress.freshProgress(),{type:'START'});
 for(const encounter of story.ENCOUNTERS){state=progress.evolve(state,{type:'ARRIVE'});state=progress.evolve(state,{type:'ANSWER',species:encounter.species});state=progress.evolve(state,{type:'NEXT'});}
 state=progress.evolve(state,{type:'EXPLORE',species:'parasaurolophus'});
 const g=await setup(state);await g.click('#start');
 await g.click('[data-target="reed-3"]');await g.click('[data-target="reed-1"]');
 const beforeRepeat=g.state();await g.click('[data-target="reed-3"]');assert.deepEqual(g.state(),beforeRepeat);
 await g.click('[data-target="reed-2"]');assert.deepEqual(g.starNotes.map(note=>note.index),[2,0,2,1]);
 assert.ok(g.starNotes.every(note=>note.total===3));assert.equal(exploration.starCount(g.state()),7);
 const complete=g.state();await g.click('[data-target="reed-2"]');assert.equal(g.starNotes.at(-1).index,1);assert.deepEqual(g.state(),complete);
 const count=g.starNotes.length;await g.click('#book');await g.click('[data-target="reed-1"]');assert.equal(g.starNotes.length,count,'Book pauses prevent even instrument replay');
 await g.click('#close-book');await g.click('[data-target="reed-1"]');assert.equal(g.starNotes.at(-1).index,0);assert.deepEqual(g.state(),complete);
});

function completedJourney(){let s=progress.evolve(progress.freshProgress(),{type:'START'});for(const e of story.ENCOUNTERS){s=progress.evolve(s,{type:'ARRIVE'});s=progress.evolve(s,{type:'ANSWER',species:e.species});s=progress.evolve(s,{type:'NEXT'});}return s;}

test('only the complete three-stone fossil collection opens a story, and the story can be replayed without points',async()=>{
 const g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'}));await g.click('#start');
 for(const id of ['fossil-1','fossil-2']){await g.click('[data-target="'+id+'"]');await g.advance(1000);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.paused(),false);}
 assert.equal(g.document.getElementById('activity-count').textContent,'2 / 3');assert.equal(g.document.querySelectorAll('.fossil-token.found').length,2);
 await g.click('[data-target="fossil-3"]');assert.deepEqual(g.state().adventures.stegosaurus.targets,['fossil-1','fossil-2','fossil-3']);assert.equal(g.document.getElementById('activity-count').textContent,'3 / 3');assert.equal(g.rewards.length,1);await g.advance(2300);assert.equal(g.document.getElementById('finding-dialog').open,false,'The earned star gets its entire visual and musical moment');await g.advance(200);
 assert.equal(g.document.getElementById('finding-dialog').open,true);assert.equal(g.paused(),true);assert.equal(g.document.getElementById('finding-title').textContent,'Steingervingur');
 assert.ok(g.document.querySelector('#finding-art svg'));assert.equal(g.spoken.at(-1).id,'discovery_fossil');
 const before=g.state();await g.click('[data-target="fossil-2"]');assert.deepEqual(g.state(),before,'Background discoveries cannot activate through the card');
 await g.click('#finding-listen');assert.equal(g.spoken.at(-1).id,'discovery_fossil');await g.click('#finding-back');assert.equal(g.paused(),false);
 await g.click('[data-target="fossil-1"]');assert.equal(g.document.getElementById('finding-dialog').open,true);assert.deepEqual(g.state(),before,'Reopening a found artifact does not farm stars');
 await g.click('#close-finding');assert.equal(g.state().exploring,'stegosaurus');
});

test('a pending discovery close-up cannot interrupt a different animal selected from the book',async()=>{
 const g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species:'spinosaurus'}));await g.click('#start');await g.click('[data-target="frog"]');
 assert.equal(g.state().adventures.spinosaurus.secret,true);await g.click('#book');await g.advance(10000);assert.equal(g.document.getElementById('finding-dialog').open,false);
 await g.click('#collection button');await g.advance(4000);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.document.getElementById('app').dataset.stage,'inspect');
});

test('dragging a discovery pans the view without collecting it; the next tap still works',async()=>{
 const g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'}));await g.click('#start');
 const target=g.document.querySelector('[data-target="fossil-1"]');
 for(const[type,x]of [['pointerdown',100],['pointermove',145],['pointerup',145]]){const e=new g.document.defaultView.Event(type,{bubbles:true});Object.assign(e,{clientX:x,clientY:150,pointerId:1});target.dispatchEvent(e);}
 await g.click('[data-target="fossil-1"]');assert.equal(g.state().adventures.stegosaurus,undefined);assert.deepEqual(g.pans,[[45,0]]);
 await g.click('[data-target="fossil-1"]');assert.deepEqual(g.state().adventures.stegosaurus.targets,['fossil-1']);
});

test('bonus questions wait for the visible ride return, preserving collected leaves',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'brachiosaurus'});for(const id of ['leaf-1','leaf-2','leaf-3'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved,{holdRideReturn:true});await g.click('#start');await g.click('#actions button');assert.equal(g.rideReturns.length,1);assert.equal(g.state().explorePhase,'explore');
 await g.advance(10000);assert.equal(g.state().explorePhase,'explore','No automatic bonus before the child lands');await g.finishRide();assert.equal(g.state().explorePhase,'bonus');assert.deepEqual(g.state().adventures.brachiosaurus.targets,['leaf-1','leaf-2','leaf-3']);
});

test('unidentified animal taps explain imagined calls; interruption never releases an old call',async()=>{
 const initial=progress.evolve(progress.evolve(progress.freshProgress(),{type:'START'}),{type:'ARRIVE'});
 const g=await setup(initial,{holdNarrations:['dinosaurCalls']});await g.click('#start');
 await g.interact('stegosaurus');for(let i=0;i<8;i++)await g.interact('stegosaurus');
 assert.equal(g.spoken.filter(line=>line.id==='dinosaurCalls').length,1);
 assert.equal(g.animalCalls.length,0);
 await g.interact('mosi');await g.interact('stegosaurus');await g.finishSpeech();
 assert.deepEqual(g.animalCalls.map(call=>call.species),['triceratops','stegosaurus']);
});

test('touching a known dinosaur invites its optional game, pauses the hunt and preserves its discoveries',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'});saved=progress.evolve(saved,{type:'COLLECT',id:'fossil-1'});
 const g=await setup(saved);await g.click('#start');await g.interact('stegosaurus');
 assert.deepEqual(g.invites,['stegosaurus']);assert.equal(g.document.getElementById('club-dialog').open,true);assert.equal(g.paused(),true);
 await g.click('[data-target="fossil-2"]');assert.deepEqual(g.state(),saved,'Covered world must not collect a target');
 await g.winMini('stegosaurus');const awarded=g.state();assert.equal(awarded.games.stegosaurus.wins,1);assert.deepEqual(awarded.adventures,saved.adventures);
 await g.closeMini();assert.equal(g.paused(),false);assert.equal(g.state().exploring,'stegosaurus');
 await g.click('[data-target="fossil-2"]');assert.equal(g.state().adventures.stegosaurus.targets.length,2);
});

test('the museum can open before any discovery and restores the same visible welcome on return',async()=>{
 const g=await setup();await g.click('#start');const before=g.state(),text=g.document.getElementById('speech-text').textContent;
 await g.click('#book');await g.click('#open-club');assert.equal(g.document.getElementById('club-dialog').open,true);assert.equal(g.paused(),true);
 assert.deepEqual(g.state(),before);await g.advance(15000);assert.deepEqual(g.state(),before);
 await g.closeMini();assert.equal(g.paused(),false);assert.equal(g.document.getElementById('speech').hidden,false);assert.equal(g.document.getElementById('speech-text').textContent,text);assert.deepEqual(g.state(),before);
});

test('a pending discovery card cannot interrupt a minigame or follow it back to the hunt',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'});for(const id of ['fossil-1','fossil-2'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved);await g.click('#start');await g.click('[data-target="fossil-3"]');await g.advance(400);await g.interact('stegosaurus');await g.advance(9000);
 assert.equal(g.document.getElementById('finding-dialog').open,false);await g.closeMini();await g.advance(5000);assert.equal(g.document.getElementById('finding-dialog').open,false);
 await g.click('#activity-card');assert.equal(g.document.getElementById('finding-dialog').open,true,'The completed learning card remains available explicitly');
});

test('ride phases speak the task and pass authored foot or wing events unchanged to positional sound',async()=>{
 for(const [species,kind,events,ids] of [
  ['brachiosaurus','canopy',['invite','pickup','ready','return'],['rideBrachioInvite','rideBrachioAscent','rideBrachioTop','rideBrachioReturn']],
  ['pteranodon','flight',['invite','pickup','ready','return'],['ridePteraInvite','ridePteraTakeoff','adventure_ptera_instruction','ridePteraLanding']],
 ]){
  const g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species}),{rideKind:kind});
  const beat={type:kind==='flight'?'wing':'step',kind,species,pan:-.3,progress:.7};
  await g.activityEvent(beat);assert.equal(g.foley.length,0,'No sound before the start gesture');await g.click('#start');
  for(let i=0;i<events.length;i++){await g.activityEvent({type:events[i],kind,species});assert.equal(g.spoken.at(-1).id,ids[i]);}
  if(kind==='flight'){
   const task=g.spoken.find(line=>line.id==='adventure_ptera_instruction');assert.match(task.text,/þrjá glitrandi vindhringi/);assert.match(task.text,/annan hring/,'The child is told that there is no one-lap deadline');
  }
  await g.activityEvent(beat);assert.deepEqual(g.foley,[beat],'No guessed extra beat or lost spatial information');
  await g.click('#book');await g.activityEvent(beat);assert.equal(g.foley.length,1,'Paused modal suppresses phase callbacks');
  await g.click('#close-book');await g.activityEvent(beat);assert.equal(g.foley.length,2);
  await g.touch({kind:'water',pan:.2});assert.deepEqual(g.touches,[{kind:'water',pan:.2}]);
  await g.click('#book');await g.touch({kind:'water',pan:.2});assert.equal(g.touches.length,1,'World touches do not sound through a modal');
 }
});

test('help on the ground replays an unfinished ride before focusing its first missing discovery',async()=>{
 for(const [species,kind,prefix] of [['brachiosaurus','canopy','leaf'],['pteranodon','flight','windring']]){
  let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species});saved=progress.evolve(saved,{type:'COLLECT',id:`${prefix}-1`});
  const g=await setup(saved,{rideKind:kind,ridePhase:'complete',holdRideReplay:true});await g.click('#start');
  const help=[...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Sýndu mér');assert.ok(help);help.click();await flush();
  assert.equal(g.rideReplays.length,1,'Help starts the return to the activity');assert.deepEqual(g.focuses,[],'Do not point to an inaccessible target during pickup/ascent');
  await g.advance(2000);assert.deepEqual(g.focuses,[]);assert.deepEqual(g.state().adventures[species].targets,[`${prefix}-1`]);
  await g.finishReplay();assert.deepEqual(g.focuses,[`${prefix}-2`],'The first already-found target is skipped');
  assert.equal(g.spoken.at(-1).id,content.ADVENTURES[species].instruction);assert.deepEqual(g.state().adventures[species].targets,[`${prefix}-1`],'Help does not award or erase discoveries');
 }
});

test('a pending ride-help replay cannot focus or narrate after the child picks another animal',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'pteranodon'});saved=progress.evolve(saved,{type:'COLLECT',id:'windring-2'});
 const g=await setup(saved,{rideKind:'flight',ridePhase:'complete',holdRideReplay:true});await g.click('#start');
 const help=[...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Sýndu mér');assert.ok(help);help.click();await flush();assert.equal(g.rideReplays.length,1);
 await g.click('#book');await g.click('#collection button');const spokenBefore=g.spoken.length;await g.finishReplay();
 assert.deepEqual(g.focuses,[]);assert.equal(g.spoken.length,spokenBefore,'The old wind instruction must not replace the new animal story');
 assert.equal(g.document.getElementById('app').dataset.stage,'inspect');assert.equal(g.state().exploring,null);assert.deepEqual(g.state().adventures.pteranodon.targets,['windring-2']);
});

test('help stays on the ground once ride targets are complete and points to the remaining secret',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'brachiosaurus'});for(const id of ['leaf-1','leaf-2','leaf-3'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved,{rideKind:'canopy',ridePhase:'complete',holdRideReplay:true});await g.click('#start');
 const help=[...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Leita');assert.ok(help);help.click();await flush();
 assert.equal(g.rideReplays.length,0);assert.deepEqual(g.focuses,['beetle']);assert.equal(g.spoken.at(-1).id,content.ADVENTURES.brachiosaurus.secretHint);
});

test('secret help after all ride targets waits until the child has returned to ground level',async()=>{
 for(const [species,kind,prefix,secret] of [['brachiosaurus','canopy','leaf','beetle'],['pteranodon','flight','windring','butterfly']]){
  let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species});for(const i of [1,2,3])saved=progress.evolve(saved,{type:'COLLECT',id:`${prefix}-${i}`});
  const g=await setup(saved,{rideKind:kind,holdRideReturn:true});await g.click('#start');
  const help=[...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Leita');assert.ok(help);help.click();await flush();
  assert.equal(g.rideReturns.length,1);assert.deepEqual(g.focuses,[],'Ground-level secret cannot be pointed out from the canopy or flight loop');
  await g.advance(3000);assert.deepEqual(g.focuses,[]);assert.deepEqual(g.state().adventures[species].targets,[`${prefix}-1`,`${prefix}-2`,`${prefix}-3`]);
  await g.finishRide();assert.deepEqual(g.focuses,[secret]);assert.equal(g.spoken.at(-1).id,content.ADVENTURES[species].secretHint);
  assert.equal(g.state().adventures[species].secret,false,'The hint must not collect the secret for the child');
 }
});

test('a delayed secret-help landing cannot focus or speak after switching animals',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'brachiosaurus'});for(const id of ['leaf-1','leaf-2','leaf-3'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved,{rideKind:'canopy',holdRideReturn:true});await g.click('#start');
 const help=[...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Leita');assert.ok(help);help.click();await flush();assert.equal(g.rideReturns.length,1);
 await g.click('#book');await g.click('#collection button');const spokenBefore=g.spoken.length;await g.finishRide();
 assert.deepEqual(g.focuses,[]);assert.equal(g.spoken.length,spokenBefore);assert.equal(g.document.getElementById('app').dataset.stage,'inspect');
});

test('completed canopy and flight hunts pause on their learning card, then return exactly once on dismissal',async()=>{
 for(const [species,kind,prefix]of [['brachiosaurus','canopy','leaf'],['pteranodon','flight','windring']]){
  let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species});for(const i of [1,2])saved=progress.evolve(saved,{type:'COLLECT',id:prefix+'-'+i});
  const line=content.DISCOVERY_CARDS[prefix].narration,g=await setup(saved,{rideKind:kind,holdRideReturn:true,holdNarrations:[line]});await g.click('#start');await g.click('[data-target="'+prefix+'-3"]');
  assert.equal(g.rewards.length,1);await g.advance(2300);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.rideReturns.length,0);
  await g.advance(200);assert.equal(g.document.getElementById('finding-dialog').open,true);assert.equal(g.paused(),true);assert.equal(g.spoken.at(-1).id,line);assert.equal(g.document.getElementById('finding-back-label').textContent,'Niður til Mosa');
  await g.advance(30000);assert.equal(g.rideReturns.length,0,'No hidden landing timer can strand a paused ride');await g.finishSpeech();assert.equal(g.rideReturns.length,0,'The child chooses when to dismiss the learning picture');
  await g.click(species==='brachiosaurus'?'#finding-back':'#close-finding');assert.equal(g.paused(),false);assert.equal(g.rideReturns.length,1);
  await g.finishRide();assert.equal(g.state().exploring,species);assert.equal(g.state().adventures[species].targets.length,3);assert.equal(g.rewards.length,1);
 }
});

test('a pending flight-completion card cannot appear or land after the player changes scenes',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'pteranodon'});for(const id of ['windring-1','windring-2'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved,{rideKind:'flight',holdRideReturn:true});await g.click('#start');await g.click('[data-target="windring-3"]');await g.advance(500);
 await g.click('#book');await g.click('#collection button');await g.advance(10000);
 assert.equal(g.rideReturns.length,0);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.document.getElementById('app').dataset.stage,'inspect');assert.equal(g.state().exploring,null);assert.equal(g.state().adventures.pteranodon.targets.length,3);
});

test('earned-star speech leaves a musical lead, pauses with the book and cancels on a new scene',async()=>{
 for(const changeScene of [false,true]){
  const saved=progress.evolve(progress.evolve(progress.freshProgress(),{type:'START'}),{type:'ARRIVE'});
  const g=await setup(saved);await g.click('#start');await g.click('[data-species="stegosaurus"]');
  const correct=story.ENCOUNTERS[0].correct;
  assert.equal(g.state().stage,'correct');assert.ok(!g.spoken.some(line=>line.id===correct));
  await g.advance(500);await g.click('#book');await g.advance(10000);
  assert.ok(!g.spoken.some(line=>line.id===correct),'A modal holds the pending narration');
  await g.click('#close-book');
  if(changeScene){await g.click('#actions button');await g.advance(1500);assert.ok(!g.spoken.some(line=>line.id===correct),'Old praise cannot interrupt the next activity');}
  else {await g.advance(400);assert.ok(!g.spoken.some(line=>line.id===correct));await g.advance(300);assert.equal(g.spoken.filter(line=>line.id===correct).length,1);}
 }
});

test('a secret star stops the still-playing clue before its fanfare and learning card',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'});
 for(const id of ['fossil-1','fossil-2','fossil-3'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const hint=content.ADVENTURES.stegosaurus.secretHint;
 const g=await setup(saved,{holdNarrations:[hint]});await g.click('#start');
 [...g.document.querySelectorAll('#actions button')].find(button=>button.textContent==='Leita').click();await flush();
 assert.equal(g.spoken.at(-1).id,hint);await g.click('[data-target="snail"]');
 assert.ok(g.stoppedNarrations.includes(hint),'The secret reward must have an unmasked musical lead');
 assert.equal(g.document.getElementById('speech').hidden,true);await g.advance(2500);
 assert.equal(g.document.getElementById('finding-dialog').open,true);assert.equal(g.spoken.at(-1).id,'discovery_snail');
});

test('partial fossil counts survive reload, guide to the missing stone and never open a repeated partial card',async()=>{
 const g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'}));await g.click('#start');
 await g.click('[data-target="fossil-2"]');assert.equal(g.document.getElementById('activity-count').textContent,'1 / 3');
 assert.ok(g.document.querySelector('[data-stone="fossil-2"]').classList.contains('found'));
 for(let i=0;i<10;i++)await g.click('[data-target="fossil-2"]');await g.advance(5000);
 assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.rewards.length,0);assert.equal(g.state().adventures.stegosaurus.targets.length,1);
 await g.click('[data-target="fossil-1"]');const saved=g.state(),restored=await setup(saved);await restored.click('#start');
 assert.equal(restored.document.getElementById('activity-count').textContent,'2 / 3');assert.equal(restored.document.querySelectorAll('.fossil-token.found').length,2);
 assert.match(restored.document.getElementById('activity-count').getAttribute('aria-label'),/Steinar fundnir: 2 af 3/);
 await restored.click('#actions button');assert.deepEqual(restored.focuses,['fossil-3']);assert.deepEqual(restored.state(),saved,'Help does not collect or reset any stones');
 await restored.advance(5000);assert.equal(restored.document.getElementById('finding-dialog').open,false);assert.equal(restored.paused(),false);assert.equal(restored.rewards.length,0);assert.ok(!restored.spoken.some(line=>line.id==='discovery_fossil'));
});

test('repeated complete fossil taps cannot skip or restart its star lead; a book pause preserves it',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'});for(const id of ['fossil-1','fossil-2'])saved=progress.evolve(saved,{type:'COLLECT',id});
 const g=await setup(saved);await g.click('#start');await g.click('[data-target="fossil-3"]');
 for(let i=0;i<12;i++)await g.click('[data-target="fossil-1"]');assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.rewards.length,1);
 await g.advance(600);await g.click('#book');await g.advance(10000);assert.equal(g.document.getElementById('finding-dialog').open,false);
 await g.click('#close-book');await g.advance(1700);assert.equal(g.document.getElementById('finding-dialog').open,false);await g.advance(200);
 assert.equal(g.document.getElementById('finding-dialog').open,true);assert.equal(g.spoken.filter(line=>line.id==='discovery_fossil').length,1);assert.equal(g.rewards.length,1);
 await g.click('#finding-back');const complete=g.state();await g.click('[data-target="fossil-2"]');assert.equal(g.document.getElementById('finding-dialog').open,true);assert.deepEqual(g.state(),complete);assert.equal(g.rewards.length,1,'Revisiting the final card cannot farm another star');
});

test('a pending final fossil story never blocks leaving the hunt or follows a new activity',async()=>{
 for(const throughBook of [false,true]){
  let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'stegosaurus'});for(const id of ['fossil-1','fossil-2'])saved=progress.evolve(saved,{type:'COLLECT',id});
  const g=await setup(saved);await g.click('#start');await g.click('[data-target="fossil-3"]');await g.advance(400);
  if(throughBook){await g.click('#book');await g.click('#collection button');}
  else {await g.click('#actions button');assert.equal(g.state().explorePhase,'bonus');}
  await g.advance(5000);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.ok(!g.spoken.some(line=>line.id==='discovery_fossil'));assert.equal(g.state().adventures.stegosaurus.targets.length,3);
 }
});

test('all six hunts show distinct nonmodal partial progress and a replayable completed learning card',async()=>{
 for(const [species,a]of Object.entries(content.ADVENTURES)){
  const kind=a.targets[0].kind,g=await setup(progress.evolve(completedJourney(),{type:'EXPLORE',species}));await g.click('#start');
  for(const [index,target]of a.targets.slice(0,2).entries()){
   await g.click('[data-target="'+target.id+'"]');await g.advance(2700);assert.equal(g.document.getElementById('finding-dialog').open,false,species+' partial find must not interrupt search');assert.equal(g.paused(),false);
   assert.equal(g.document.querySelectorAll('.collection-token.found').length,index+1);assert.equal(g.document.querySelectorAll('.collection-token[data-kind="'+kind+'"]').length,3);assert.equal(g.document.getElementById('activity-card').disabled,true);
  }
  const reloaded=await setup(g.state());await reloaded.click('#start');assert.equal(reloaded.document.getElementById('activity-count').textContent,'2 / 3');
  await reloaded.click('[data-target="'+a.targets[2].id+'"]');await reloaded.click('#activity-card');assert.equal(reloaded.document.getElementById('finding-dialog').open,false,'HUD replay must not skip the earned-star lead');
  await reloaded.advance(2500);assert.equal(reloaded.document.getElementById('finding-title').textContent,content.DISCOVERY_CARDS[kind].title);assert.equal(reloaded.spoken.at(-1).id,content.DISCOVERY_CARDS[kind].narration);assert.equal(reloaded.rewards.length,1);
  await reloaded.click('#finding-back');const complete=reloaded.state();await reloaded.click('#activity-card');assert.equal(reloaded.document.getElementById('finding-dialog').open,true);assert.deepEqual(reloaded.state(),complete);assert.equal(reloaded.rewards.length,1);
  const ground=await setup(complete,{rideKind:['leaf','windring'].includes(kind)?(kind==='leaf'?'canopy':'flight'):null,ridePhase:'complete',holdRideReturn:true});await ground.click('#start');await ground.click('#activity-card');assert.equal(ground.document.getElementById('finding-dialog').open,true,'A completed ride card remains accessible on the ground');await ground.click('#finding-back');assert.equal(ground.rideReturns.length,0);assert.deepEqual(ground.state(),complete);
 }
});

test('a hidden beetle card pauses the canopy in place and never returns it like a completed leaf card',async()=>{
 let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'brachiosaurus'});saved=progress.evolve(saved,{type:'COLLECT',id:'leaf-1'});
 const g=await setup(saved,{rideKind:'canopy',holdRideReturn:true});await g.click('#start');await g.click('[data-target="beetle"]');await g.advance(2500);
 assert.equal(g.document.getElementById('finding-title').textContent,'Bjalla');assert.equal(g.paused(),true);assert.equal(g.document.getElementById('finding-back-label').textContent,'Áfram að kanna');
 await g.advance(10000);await g.click('#finding-back');assert.equal(g.paused(),false);assert.equal(g.rideReturns.length,0);assert.equal(g.state().adventures.brachiosaurus.secret,true);assert.deepEqual(g.state().adventures.brachiosaurus.targets,['leaf-1']);
 await g.click('[data-target="leaf-2"]');assert.equal(g.state().adventures.brachiosaurus.targets.length,2);assert.equal(g.document.getElementById('finding-dialog').open,false);
});

test('completed reeds remain an instrument; only the explicit book control replays their learning card',async()=>{
 const a=content.ADVENTURES.parasaurolophus;let saved=progress.evolve(completedJourney(),{type:'EXPLORE',species:'parasaurolophus'});for(const target of a.targets)saved=progress.evolve(saved,{type:'COLLECT',id:target.id});
 const g=await setup(saved);await g.click('#start');for(const id of ['reed-3','reed-1','reed-2','reed-3'])await g.click('[data-target="'+id+'"]');await g.advance(3000);
 assert.deepEqual(g.starNotes.map(note=>note.index),[2,0,1,2]);assert.equal(g.document.getElementById('finding-dialog').open,false);assert.equal(g.rewards.length,0);assert.deepEqual(g.state(),saved);
 await g.click('#activity-card');assert.equal(g.document.getElementById('finding-dialog').open,true);assert.equal(g.spoken.at(-1).id,'discovery_reed');
});
