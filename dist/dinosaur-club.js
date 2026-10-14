import {createMiniGames} from './mini-games.js';
import {createStatueViewer} from './statue-viewer.js';
import {clearJigsawDrafts} from './jigsaw-game.js';
import {MINI_GAMES,STATUE_FACTS} from './mini-content.js';
import {GAME_SPECIES,statueCount} from './mini-progress.js';
import {SPECIES,NARRATION,displayText} from './story.js';
import {createEncyclopedia} from './encyclopedia.js';

const element=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;};
export function createDinosaurClub(dialog,{getState,onAward,onClose,audio,speak}) {
 let game=null,viewer=null,museum=null,sequence=0,voice=0,delayed=null;
 function clear(){sequence++;voice++;clearTimeout(delayed);delayed=null;museum?.dispose();museum=null;audio?.stopNarration();audio?.stopCelebration?.();game?.dispose();game=null;viewer?.dispose();viewer=null;audio?.setPaused(false);dialog.replaceChildren();}
 function button(text,fn,soft=false){const b=element('button',`button${soft?' soft':''}`,text);b.type='button';b.addEventListener('click',()=>{audio?.effect('tap');fn();});return b;}
 function narrate(id){voice++;clearTimeout(delayed);delayed=null;audio?.stopNarration();return speak(id);}
 function afterActive(ms,fn){let remaining=ms,last=performance.now();const token=sequence;const tick=()=>{if(token!==sequence)return;const now=performance.now();if(!document.hidden)remaining-=Math.min(250,now-last);last=now;if(remaining<=0){delayed=null;fn();}else delayed=setTimeout(tick,100);};delayed=setTimeout(tick,100);}
 function close(){clear();dialog.close();onClose();}
 function heading(title,back){const h=element('header','club-heading'),copy=element('div');copy.append(element('span','eyebrow','EGILL OG MOSI · LEIKIR OG UPPGÖTVANIR'),element('h1','',title));h.append(copy,button(back?'← Safn Egils':'Til baka',back||close,true));dialog.append(h);}
 function mountViewer(host,species){viewer=createStatueViewer(host,{species});void viewer.ready?.catch(()=>{});}
 function show(){if(!dialog.open)dialog.showModal();}
 function invite(species){
  if(!getState().found.includes(species)||!MINI_GAMES[species])return;
  clear();dialog.className='club-dialog club-invitation';heading('Viltu spila með mér?');
  const data=MINI_GAMES[species],d=SPECIES[species],layout=element('div','club-invite-layout'),portrait=element('div','club-portrait');
  portrait.setAttribute('aria-label',d.name);const copy=element('div','club-invite-copy');
  copy.append(element('p','club-friend',d.name+' · '+(d.latin||d.kind)),element('h2','',data.title),element('p','',displayText(NARRATION[data.invitation]||'Viltu spila með mér?')));
  const actions=element('div','club-actions');actions.append(button('Já, leikum!',()=>play(species)),button('Seinna',close,true));copy.append(actions);
  copy.append(button('Heyra dýrið',()=>{const token=sequence,promise=narrate('dinosaurCalls'),spoken=voice;void Promise.resolve(promise).then(()=>{if(token===sequence&&spoken===voice&&!document.hidden)audio?.animal?.(species,{mood:'curious'});});},true));
  layout.append(portrait,copy);dialog.append(layout);show();mountViewer(portrait,species);void narrate(data.invitation);
 }
 function play(species){
  clear();dialog.className='club-dialog club-playing';show();const token=sequence;
  const host=element('div','club-game-host');dialog.append(host);
  game=createMiniGames(host,{audio,speak:narrate,onExit:close,onWin:id=>{if(token!==sequence||id!==species)return;const first=!getState().games?.[id]?.wins;onAward(id);detail(id,{reward:true,first});}});
  game.start(species,{round:getState().games?.[species]?.wins||0});
 }
 function collection(){
  clear();dialog.className='club-dialog safn-dialog';
  const host=element('div');dialog.append(host);show();
  museum=createEncyclopedia(host,{getState,audio,onClose:close,onPlay:invite,onStatue:detail});
 }
 function detail(species,{reward=false,first=false}={}){
  clear();dialog.className='club-dialog club-detail'+(reward?' statue-earned':'');const token=sequence;
  const facts=STATUE_FACTS[species],d=SPECIES[species];heading(reward?(first?'Ný stytta handa Agli!':'Vel gert, Egill!'):d.name,collection);
  if(reward){const sparkles=element('div','statue-sparkles');sparkles.setAttribute('aria-hidden','true');for(let i=0;i<14;i++){const s=element('i','','✦');s.style.setProperty('--i',i);sparkles.append(s);}dialog.append(sparkles);}
  const layout=element('div','statue-detail-layout'),visual=element('section','statue-visual'),tabs=element('div','statue-tabs');
  const model=element('div','statue-model'),photo=element('figure','statue-photo');photo.hidden=true;
  const img=element('img');img.src=facts.image;img.alt=facts.imageAlt;img.decoding='async';
  const caption=element('figcaption','',facts.imageAlt+' '+facts.credit);photo.append(img,caption);
  const modelTab=button('Styttan mín',()=>tab(false),true),photoTab=button('Beinagrind',()=>tab(true),true);
  function tab(isPhoto){model.hidden=isPhoto;photo.hidden=!isPhoto;viewer?.setPaused(isPhoto);modelTab.setAttribute('aria-pressed',String(!isPhoto));photoTab.setAttribute('aria-pressed',String(isPhoto));}
  modelTab.setAttribute('aria-pressed','true');photoTab.setAttribute('aria-pressed','false');tabs.append(modelTab,photoTab);visual.append(tabs,model,photo);
  const copy=element('section','statue-facts');copy.append(element('p','club-friend',d.name+' · '+(d.latin||d.kind)));
  const label=element('h2'),text=element('p','statue-fact-text'),factActions=element('div','statue-fact-buttons');
  let selected=facts.facts[0];const topicButtons=[];
  function topic(fact,index){selected=fact;label.textContent=fact.title;text.textContent=displayText(fact.text);topicButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));void narrate(fact.narration);}
  facts.facts.forEach((fact,index)=>{const b=button(fact.title,()=>topic(fact,index),true);topicButtons.push(b);factActions.append(b);});
  label.textContent=selected.title;text.textContent=displayText(selected.text);topicButtons[0]?.setAttribute('aria-pressed','true');
  const more=button('Segðu mér meira',()=>topic(facts.more,-1),true);const listen=button('Heyra aftur',()=>void narrate(selected.narration),true);
  copy.append(factActions,label,text,listen,more);layout.append(visual,copy);dialog.append(layout);
  const actions=element('div','club-actions statue-bottom');actions.append(button('Spilum aftur',()=>play(species),true),button('Áfram í ævintýrið',close));dialog.append(actions);show();mountViewer(model,species);
  if(reward){audio?.celebrate?.({species,final:true,stars:1});afterActive(2400,()=>{if(token!==sequence)return;const promise=narrate(MINI_GAMES[species].win),spoken=voice;void Promise.resolve(promise).then(()=>{if(first&&token===sequence&&spoken===voice&&!document.hidden)void narrate('mini_statue');});});}
  else void narrate(selected.narration);
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(museum?.handleBack())return;close();});
 return {invite,collection,close,isOpen:()=>dialog.open,dispose:clear,resetPuzzles:()=>clearJigsawDrafts()};
}
