// Litla Yatzy in "Fjölspil", checked headless (spec 2026-10-24-fjolspil-yatzy §12; the owner's decisions of 2026-10-24). The big
// screen (yatzy-junior.html?qa) opens its lobby; Anna (sloedla) joins from spil.html, Mosi is added, Bjarni (gramedla) joins, and
// "Byrjum!" seats four: Egill plays from the cup, Anna and Bjarni from their phones, Mosi by himself. On the way: the phones see
// the big screen's pause, a refused act changes nothing, Bjarni's phone goes during his turn (the waiting card, "Halda áfram án …"
// after COVER_AFTER_MS, Mosi plays his seat without a word) and comes back, in the same browser (the same guest id), for his next
// turn; the big screen is reloaded and "Halda áfram (Fjölspil)" takes the game up where it was. The game is played to its end,
// then "Spila aftur" in the same seats, then "Hætta Fjölspili" and a solo game with the child's and Mosi's bar. The owner's
// captures and browser-report.json go to qa/yatzy-junior-fjolspil/.
//   PLAYWRIGHT_PATH=… FJOLSPIL_URL=http://127.0.0.1:4198/remake/ npm run check:yatzy-junior:fjolspil   (the dev server, --lan)
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {COVER_AFTER_MS} from '../engine/fjolspil/protocol.js';
import {maxTurns} from '../engine/yatzy-junior/rules.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.FJOLSPIL_URL||'http://127.0.0.1:4198/remake/',out='qa/yatzy-junior-fjolspil';
const PREFS='mosi.yatzy.junior.prefs.v1',KEPT='mosi.yatzy.junior.fjolspil.v1',ANNA=1,MOSI=2,BJARNI=3,GUESTS=[ANNA,BJARNI],NAMES=['Egill','Anna','Mosi','Bjarni'];
const errors=[],report={checks:[],captures:[],lines:[],errors};
let browser,big,anna,bjarni,bjarniContext,code;
const watchdog=setTimeout(()=>{report.timedOut=true;void browser?.close();},720000);watchdog.unref();
const check=text=>{report.checks.push(text);console.log(`- ${text}`);};
async function capture(page,name){await page.screenshot({path:`${out}/${name}.png`});report.captures.push(`${out}/${name}.png`);}
function watch(name,page){
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));page.on('console',m=>{if(m.type()==='error')errors.push(`${name}: ${m.text()}`);});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${name}: ${r.status()} ${r.url()}`);});
}
const state=()=>big.evaluate(()=>window.__juniorQA.getState());
const seats=()=>big.evaluate(()=>window.__juniorQA.getMulti()?.seats??null);
const waitBig=(fn,arg,timeout=90000)=>big.waitForFunction(fn,arg,{timeout});
// The big screen waits for this seat's turn, played this way, with everything still.
const waitPhase=(phase,seat)=>waitBig(([phase,seat])=>{const s=window.__juniorQA.getStatus(),g=window.__juniorQA.getState();return s.settled&&s.phase===phase&&g.currentPlayer===seat&&g.status==='playing';},[phase,seat]);
const phoneView=page=>page.evaluate(()=>window.__spil.state);
const phoneSays=page=>page.evaluate(()=>document.querySelector('.spil-status')?.textContent??'');
async function click(page,selector){
  await page.waitForFunction(selector=>{const e=document.querySelector(selector);return e&&!e.hidden&&!e.disabled&&e.getBoundingClientRect().width>0;},selector,{timeout:60000});
  const hit=await page.locator(selector).first().evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};});
  assert.ok(hit.hit,`${selector} is under something else`);await page.mouse.click(hit.x,hit.y);
}
// Both screens show the same dice once the phone's tumble is over.
async function sameDice(phone){
  const dice=(await state()).dice;
  await phone.waitForFunction(dice=>[...document.querySelectorAll('.spil-yatzy-die')].map(b=>Number(b.getAttribute('data-face'))).join()===dice.join()&&!document.querySelector('.spil-tumble'),dice,{timeout:20000});
  return dice;
}
// Mosi's every line is logged with whose turn it is for (the scorer's, while a score is handed on), so a guest's turn can be
// shown to be silent (until Task 7's lines: spec §8).
const logLines=()=>big.evaluate(()=>{
  const qa=window.__juniorQA,voice=qa.voice,say=voice.say.bind(voice);window.__lines=[];
  voice.say=(id,options)=>{const g=qa.getState(),phase=qa.getStatus().phase,n=g.players.length;window.__lines.push({id,phase,seat:['handoff','finished'].includes(phase)?(g.turnCount+n-1)%n:g.currentPlayer});return say(id,options);};
});
const takeLines=async()=>{report.lines.push(...await big.evaluate(()=>window.__lines??[]));};
async function join(page,name,avatar){
  await page.goto(`${base}spil.html?r=${code}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{const e=document.querySelector('.spil-name');return e&&e.getBoundingClientRect().width>0;});
  await page.fill('.spil-name',name);await click(page,`.spil-avatar[data-id="${avatar}"]`);await click(page,'.spil-ready');
}
const owner=()=>big.evaluate(()=>{const e=document.getElementById('card-owner');return e.hidden?null:e.textContent;});
// Egill's turn at the big screen: the cup, perhaps a held die and the cup again, then the best card (or the 0 card, confirmed).
async function egillTurn({hold=false,shot=null}={}){
  await waitPhase('human',0);assert.equal(await owner(),'Egill');
  await click(big,'#cup-target');await waitPhase('human',0);if(shot)await capture(big,shot);
  if(hold){await click(big,'.die-target[data-index="0"]');await waitBig(()=>window.__juniorQA.getState().held[0]);await waitPhase('human',0);await click(big,'#cup-target');await waitPhase('human',0);}
  const card=await big.evaluate(()=>{const open=[...document.querySelectorAll('#score-rows .card-select:not(:disabled)')];return (open.find(b=>b.closest('.junior-card').classList.contains('best'))||open[0]).dataset.category;});
  await click(big,`.card-select[data-category="${card}"]`);if(await big.locator('#zero-dialog').isVisible())await click(big,'#confirm-zero');
  await waitBig(card=>window.__juniorQA.getState().players[0].scores[card]!==null,card);return card;
}
// A guest's turn from her phone: "Kasta!", perhaps a held die and "Kasta aftur!", then a free card (the 0 one asks first).
async function phoneTurn(phone,seat,{hold=false,shot=null,between=null}={}){
  await waitPhase('remote',seat);assert.equal(await owner(),NAMES[seat]);
  await phone.waitForFunction(()=>document.querySelector('.spil-yatzy-turn')?.textContent==='Þú átt leik!'&&!document.querySelector('.spil-yatzy-cup').disabled,undefined,{timeout:30000});
  const rolls=(await state()).rollCount;await click(phone,'.spil-yatzy-cup');await waitBig(rolls=>window.__juniorQA.getState().rollCount>rolls,rolls);await waitPhase('remote',seat);await sameDice(phone);
  if(shot){await capture(big,shot.big);await capture(phone,shot.phone);}
  if(hold){
    await phone.waitForFunction(()=>!document.querySelectorAll('.spil-yatzy-die')[2].disabled);await click(phone,'.spil-yatzy-dice li:nth-child(3) .spil-yatzy-die');
    await waitBig(()=>window.__juniorQA.getState().held[2]===true);await phone.waitForFunction(()=>document.querySelectorAll('.spil-yatzy-die')[2].classList.contains('held'));await waitPhase('remote',seat);
    await phone.waitForFunction(()=>!document.querySelector('.spil-yatzy-cup').disabled);await click(phone,'.spil-yatzy-cup');await waitBig(()=>window.__juniorQA.getState().rollCount===2);await waitPhase('remote',seat);await sameDice(phone);
  }
  await between?.();
  await phone.waitForFunction(()=>document.querySelector('.spil-yatzy-card.available'));
  const card=await phone.evaluate(()=>{const cards=[...document.querySelectorAll('.spil-yatzy-card.available')];return (cards.find(c=>!c.classList.contains('zero'))||cards[0]).dataset.card;});
  const zero=await phone.evaluate(card=>document.querySelector(`.spil-yatzy-card[data-card="${card}"]`).classList.contains('zero'),card);
  // A card lights up over 0.3 s (spil.css), and until it has, its 0 question is drawn under the cards after it: wait for it.
  await phone.waitForFunction(card=>getComputedStyle(document.querySelector(`.spil-yatzy-card[data-card="${card}"]`)).opacity==='1',card);
  await click(phone,`.spil-yatzy-card[data-card="${card}"] .spil-yatzy-pick`);if(zero)await click(phone,`.spil-yatzy-card[data-card="${card}"] .spil-yatzy-use`);
  await waitBig(([seat,card])=>window.__juniorQA.getState().players[seat].scores[card]!==null,[seat,card]);return card;
}
async function mosiTurn(){await waitBig(seat=>window.__juniorQA.getState().currentPlayer===seat,MOSI);await waitBig(seat=>window.__juniorQA.getState().currentPlayer!==seat,MOSI,120000);}
async function playTurn(){const {currentPlayer:who}=await state();if(who===0)await egillTurn();else if(who===ANNA)await phoneTurn(anna,ANNA);else if(who===MOSI)await mosiTurn();else await phoneTurn(bjarni,BJARNI);}

try{
  await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,args:['--enable-unsafe-swiftshader']});
  const bigContext=await browser.newContext({viewport:{width:1440,height:1000}});big=await bigContext.newPage();big.setDefaultTimeout(60000);watch('big',big);
  await big.addInitScript(PREFS=>{localStorage.setItem(PREFS,JSON.stringify({muted:true,reduced:false}));},PREFS);
  const phone=()=>browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const annaContext=await phone();anna=await annaContext.newPage();watch('anna',anna);
  bjarniContext=await phone();bjarni=await bjarniContext.newPage();watch('bjarni',bjarni);
  for(const page of [anna,bjarni])page.setDefaultTimeout(60000);
  await big.goto(`${base}yatzy-junior.html?qa`,{waitUntil:'domcontentloaded',timeout:90000});
  await big.waitForFunction(()=>window.__juniorQA&&document.getElementById('welcome').open,undefined,{timeout:90000});
  assert.equal(await big.evaluate(()=>document.getElementById('continue-multi').hidden),true,'no game of seats kept yet');

  // The lobby: Anna, then Mosi, then Bjarni; four seats.
  await click(big,'#multi');await big.waitForFunction(()=>document.querySelectorAll('.fjolspil-code .fjolspil-letter').length===4);
  code=await big.evaluate(()=>document.querySelector('.fjolspil-code').textContent.trim());assert.equal((await big.evaluate(()=>window.__juniorQA.getStatus())).paused,true);
  await join(anna,'Anna','sloedla');await big.waitForFunction(()=>document.querySelectorAll('.fjolspil-seat[data-state="taken"]').length===1);
  await click(big,'.fjolspil-ai');await big.waitForFunction(()=>document.querySelectorAll('.fjolspil-seat[data-state="ai"]').length===1);
  await join(bjarni,'Bjarni','gramedla');await big.waitForFunction(()=>document.querySelectorAll('.fjolspil-seat[data-state="taken"]').length===2);
  await capture(big,'lobby');check(`the lobby (${code}): Egill, Anna from her phone, Mosi added, Bjarni from his phone`);
  await click(big,'.fjolspil-start');await waitPhase('human',0);
  const bar=await big.evaluate(()=>({count:document.querySelector('.players').dataset.count,names:[...document.querySelectorAll('.player-card .pname')].map(e=>e.textContent)}));
  assert.deepEqual(bar,{count:'4',names:NAMES});assert.deepEqual((await state()).players.map(p=>p.id),['0','1','2','3']);
  const closed=await big.evaluate(()=>({learn:document.getElementById('learn').hidden,learnHelp:document.getElementById('learn-help').hidden,newGame:document.getElementById('new-game').textContent}));
  assert.deepEqual(closed,{learn:true,learnHelp:true,newGame:'Hætta Fjölspili'});
  await click(big,'#help');await big.waitForFunction(()=>document.getElementById('help-dialog').open);assert.equal(await big.locator('#learn-help').isVisible(),false,'no "Sýndu mér" in Fjölspil');
  await click(big,'#help-dialog [data-close]');await big.waitForFunction(()=>!document.getElementById('help-dialog').open);
  check('"Byrjum!": four seats, the bar Egill · Anna · Mosi · Bjarni, the lesson and "Sýndu mér" closed, the pause card says "Hætta Fjölspili"');
  await logLines();

  // Round 1: every way of playing a turn.
  await egillTurn({hold:true,shot:'egill-turn'});check('Egill plays from the cup: a roll, a held die, a roll again and a card; his name on the cards\' tag');
  await phoneTurn(anna,ANNA,{hold:true,shot:{big:'anna-turn',phone:'anna-phone'}});check('Anna plays from her phone: "Kasta!", a held die, "Kasta aftur!" and a card; the big screen shows her dice, her cards and "Anna" on their tag');
  await mosiTurn();check('Mosi plays seat 2 by himself');
  await phoneTurn(bjarni,BJARNI);check('Bjarni plays seat 3 from his phone');

  // Round 2: the pause on the phones, and a refused act.
  await waitPhase('human',0);await click(big,'#pause');await big.waitForFunction(()=>document.getElementById('pause-dialog').open);
  for(const phone of [anna,bjarni])await phone.waitForFunction(()=>window.__spil.state?.paused===true&&document.querySelector('.spil-status')?.textContent==='Stóri skjárinn er í hléi');
  await click(big,'#pause-dialog [data-close]');
  for(const phone of [anna,bjarni])await phone.waitForFunction(()=>window.__spil.state&&!('paused' in window.__spil.state)&&document.querySelector('.spil-status')?.textContent!=='Stóri skjárinn er í hléi');
  check('the pause card on the big screen: both phones are sent paused: true ("Stóri skjárinn er í hléi"), and a fresh view without it when it closes');
  await egillTurn();
  const filled=Object.entries((await state()).players[ANNA].scores).find(([,points])=>points!==null)[0];
  await phoneTurn(anna,ANNA,{between:async()=>{
    const before=await state();
    const views=await anna.evaluate(async card=>{const first=window.__spil.state;window.__spil.send({type:'score',card});
      await new Promise((resolve,reject)=>{const t0=performance.now(),poll=()=>window.__spil.state!==first?resolve():performance.now()-t0>10000?reject(new Error('no view after the act')):setTimeout(poll,50);poll();});
      return [JSON.stringify(first),JSON.stringify(window.__spil.state)];},filled);
    await big.waitForTimeout(300);assert.deepEqual(await state(),before,'a refused act changes nothing on the big screen');assert.equal(views[1],views[0],'her next view is the same');
  }});
  check(`a refused act: Anna sends "score" on her used card (${filled}); the table is as it was, and her next view the same`);
  await mosiTurn();

  // Bjarni's phone goes during his turn: the waiting card, and after COVER_AFTER_MS "Halda áfram án Bjarni"; Mosi plays his seat.
  await waitPhase('remote',BJARNI);await bjarni.close();
  await waitBig(()=>document.querySelector('.fjolspil-wait')&&window.__juniorQA.getStatus().phase==='waiting',undefined,30000);const shown=Date.now();
  const card=await big.evaluate(()=>({words:document.querySelector('.fjolspil-wait-words').textContent,absent:document.querySelector('.player-card[data-seat="3"]').classList.contains('absent'),letters:document.querySelector('.fjolspil-wait .fjolspil-code').textContent}));
  assert.deepEqual(card,{words:'Bíðum eftir Bjarni…',absent:true,letters:code});
  await big.waitForSelector('.fjolspil-continue',{timeout:COVER_AFTER_MS+15000});const waited=Date.now()-shown;assert.ok(waited>=COVER_AFTER_MS-1500,`"Halda áfram án …" after ${waited} ms`);
  assert.equal(await big.evaluate(()=>document.querySelector('.fjolspil-continue').textContent),'Halda áfram án Bjarni');await capture(big,'waiting');
  check(`Bjarni's phone goes on his turn: "Bíðum eftir Bjarni…" with the QR and ${code}, his portrait dim; "Halda áfram án Bjarni" after ${(waited/1000).toFixed(1)} s`);
  await click(big,'.fjolspil-continue');
  await waitBig(()=>{const g=window.__juniorQA.getState(),s=window.__juniorQA.getStatus();return g.currentPlayer===3&&g.rollCount>0&&s.settled&&s.phase.startsWith('ai-');});
  const covered=(await seats())[BJARNI];assert.deepEqual([covered.kind,covered.covered,covered.present],['ai',true,false],'the computer plays his seat while he is away');
  assert.equal(await big.evaluate(()=>!document.querySelector('.fjolspil-wait')&&document.getElementById('fjolspil').hidden),true,'the waiting card is gone');
  await capture(big,'covered');
  // He comes back (the same browser keeps his guest id) while Mosi is still playing for him: Mosi finishes that turn.
  bjarni=await bjarniContext.newPage();watch('bjarni',bjarni);bjarni.setDefaultTimeout(60000);await bjarni.goto(`${base}spil.html?r=${code}`,{waitUntil:'domcontentloaded'});
  await waitBig(()=>window.__juniorQA.getMulti().seats[3].present===true);
  await waitBig(seat=>window.__juniorQA.getState().currentPlayer!==seat,BJARNI,90000);
  assert.equal(Object.values((await state()).players[BJARNI].scores).filter(points=>points!==null).length,2,'Mosi scored the covered turn');
  check('"Halda áfram án Bjarni": Mosi plays seat 3 (covered, the waiting card gone); Bjarni\'s page comes back with the same guest id meanwhile, and Mosi finishes that turn');

  // Round 3: Bjarni's next turn is his again, from his phone.
  for(let turn=0;turn<3;turn++)await playTurn();
  await waitPhase('remote',BJARNI);assert.equal((await seats())[BJARNI].kind,'remote','his seat is uncovered at his next turn');
  await phoneTurn(bjarni,BJARNI);check('round 3: Bjarni\'s next turn comes to his phone again, and he plays it');

  // Round 4: the big screen reloads; "Halda áfram (Fjölspil)" takes the kept game up in the same room, and the phones come back.
  await waitPhase('human',0);const kept=await big.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEPT);assert.deepEqual(kept.state,await state());
  await takeLines();await big.reload({waitUntil:'domcontentloaded',timeout:90000});
  await big.waitForFunction(()=>window.__juniorQA&&document.getElementById('welcome').open,undefined,{timeout:90000});
  assert.deepEqual(await big.evaluate(()=>{const e=document.getElementById('continue-multi');return {hidden:e.hidden,text:e.textContent};}),{hidden:false,text:'Halda áfram (Fjölspil)'});
  await click(big,'#continue-multi');await waitPhase('human',0);await logLines();
  assert.deepEqual(await state(),kept.state,'the game where it was left');assert.equal(await big.evaluate(()=>window.__juniorQA.fjolspil.code),code,'the same room');
  await waitBig(()=>window.__juniorQA.getMulti().seats.every(seat=>seat.present),undefined,60000);
  for(const phone of [anna,bjarni])await phone.waitForFunction(()=>window.__spil.state?.screen==='yatzy'&&window.__spil.state.round===4&&document.querySelector('.spil-yatzy-turn')?.textContent==='Egill á leik',undefined,{timeout:60000});
  assert.deepEqual(await big.evaluate(()=>[...document.querySelectorAll('.player-card .pname')].map(e=>e.textContent)),NAMES);
  check('the big screen reloaded: the welcome card offers "Halda áfram (Fjölspil)", which takes the kept game up in the same room; both phones come back by themselves');

  // To the end, then "Spila aftur" in the same seats.
  while((await state()).status==='playing')await playTurn();
  await big.waitForFunction(()=>document.getElementById('win-dialog').open,undefined,{timeout:60000});await capture(big,'finished');
  const final=await state();report.final={turnCount:final.turnCount,winner:final.winner,totals:await big.evaluate(()=>document.getElementById('win-copy').textContent)};
  assert.equal(final.turnCount,maxTurns(4));assert.equal(await big.evaluate(key=>localStorage.getItem(key),KEPT),null,'a finished game is not kept');
  await anna.waitForFunction(winner=>window.__spil.state?.winner===winner,final.winner===null?null:final.winner==='tie'?'tie':Number(final.winner));
  assert.notEqual(await phoneSays(anna),'Stóri skjárinn er í hléi','the result card is not a pause on the phones');
  check(`the whole game at four seats: ${final.turnCount} turns, "${await big.evaluate(()=>document.getElementById('win-title').textContent)}" (${report.final.totals}), the phones show the winner`);
  await click(big,'#play-again');await waitPhase('human',0);
  assert.equal((await state()).turnCount,0);assert.deepEqual(await big.evaluate(()=>[...document.querySelectorAll('.player-card .pname')].map(e=>e.textContent)),NAMES);
  for(const phone of [anna,bjarni])await phone.waitForFunction(()=>window.__spil.state?.screen==='yatzy'&&window.__spil.state.round===1&&window.__spil.state.winner===null);
  check('"Spila aftur": a new game in the same four seats, Egill first, both phones on round 1');
  await takeLines();

  // "Hætta Fjölspili", then a solo game: the bar is the child's and Mosi's again.
  await click(big,'#pause');await big.waitForFunction(()=>document.getElementById('pause-dialog').open);await click(big,'#new-game');
  await big.waitForFunction(()=>document.getElementById('welcome').open);
  assert.equal(await big.evaluate(()=>document.getElementById('continue-multi').hidden),true);assert.equal(await big.evaluate(key=>localStorage.getItem(key),KEPT),null);
  for(const phone of [anna,bjarni])await phone.waitForFunction(()=>window.__spil.state?.screen==='closed');
  await click(big,'#start');await waitPhase('human',0);
  const solo=await big.evaluate(()=>({count:document.querySelector('.players').dataset.count,cards:[...document.querySelectorAll('.player-card')].map(e=>e.id),owner:document.getElementById('card-owner').hidden,learn:document.getElementById('learn').hidden,newGame:document.getElementById('new-game').textContent,players:window.__juniorQA.getState().players.map(p=>p.id),multi:window.__juniorQA.getMulti()}));
  assert.deepEqual(solo,{count:'2',cards:['you-card','mosi-card'],owner:true,learn:false,newGame:'Byrja upp á nýtt',players:['you','mosi'],multi:null});
  check('"Hætta Fjölspili": the phones wait for the next lobby, nothing is kept; "Spila" is the solo game, the bar back to two (#you-card, #mosi-card), no owner\'s tag');

  const spoken=report.lines.filter(line=>GUESTS.includes(line.seat)&&!['youWin','mosiWin','resume'].includes(line.id));
  assert.ok(report.lines.length>0,'lines were logged');assert.deepEqual(spoken,[],'no line on a guest\'s turn, nor on one Mosi covers');
  check(`Mosi said ${report.lines.length} lines, none on a guest's turn or the one he covered`);
  assert.deepEqual(errors,[]);report.passed=true;
  console.log(JSON.stringify({checks:report.checks.length,captures:report.captures,errors},null,2));
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  if(big)report.debug=await big.evaluate(()=>({status:window.__juniorQA?.getStatus(),state:window.__juniorQA?.getState(),multi:window.__juniorQA?.getMulti()})).catch(()=>null);
  for(const [name,page] of [['big',big],['anna',anna],['bjarni',bjarni]])if(page&&!page.isClosed())await page.screenshot({path:`${out}/failure-${name}.png`}).catch(()=>{});
  throw error;
}finally{clearTimeout(watchdog);await mkdir(out,{recursive:true});await writeFile(`${out}/browser-report.json`,JSON.stringify(report,null,2));await browser?.close();}
