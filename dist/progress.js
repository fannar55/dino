import { ENCOUNTERS } from './story.js';
import {restoreAdventures,evolveExploration} from './exploration.js';
import {restoreGames,awardStatue} from './mini-progress.js';
export const SAVE_KEY = 'stjornufar.safari.v2';
const stages = ['welcome','invite','travel','question','hint','correct','complete'];
export const freshProgress = () => ({version:2,stage:'welcome',index:0,found:[],eliminated:[],adventures:{},exploring:null,explorePhase:'explore',games:{}});
export function evolve(state,event){
 if(event.type==='WIN_MINIGAME')return awardStatue(state,event.species);
 if(['EXPLORE','LEAVE_EXPLORE','COLLECT','ASK_BONUS','BACK_TO_EXPLORE','BONUS_ANSWER'].includes(event.type))return evolveExploration(state,event);
 const next={...state,found:[...state.found],eliminated:[...state.eliminated]}, encounter=ENCOUNTERS[state.index];
 if(event.type==='DECLINE'&&state.stage==='welcome')next.stage='invite';
 if(event.type==='START'&&['welcome','invite'].includes(state.stage))next.stage='travel';
 if(event.type==='ARRIVE'&&state.stage==='travel')next.stage='question';
 if(event.type==='ANSWER'&&['question','hint'].includes(state.stage)&&encounter.choices.includes(event.species)&&!state.eliminated.includes(event.species)){
  if(event.species===encounter.species){next.stage='correct';if(!next.found.includes(encounter.species))next.found.push(encounter.species);}
  else{next.stage='hint';next.eliminated.push(event.species);}
 }
 if(event.type==='NEXT'&&state.stage==='correct'){
  next.exploring=null;next.explorePhase='explore';
  if(state.index===ENCOUNTERS.length-1)next.stage='complete';
  else{next.index++;next.stage='travel';next.eliminated=[];}
 }
 return next;
}
export function restoreProgress(raw){
 try{
  const value=JSON.parse(raw);
  if(!value||value.version!==2||!stages.includes(value.stage)||!Number.isInteger(value.index)||value.index<0||value.index>=ENCOUNTERS.length)return null;
  const completedCount=value.stage==='complete'?ENCOUNTERS.length:value.index+(value.stage==='correct'?1:0);
  if(['welcome','invite'].includes(value.stage)&&value.index!==0)return null;
  if(value.stage==='complete'&&value.index!==ENCOUNTERS.length-1)return null;
  const found=ENCOUNTERS.slice(0,completedCount).map(e=>e.species);
  if(!Array.isArray(value.found)||value.found.length!==found.length||value.found.some((s,i)=>s!==found[i]))return null;
  const eliminated=[...new Set(Array.isArray(value.eliminated)?value.eliminated:[])].filter(s=>ENCOUNTERS[value.index].choices.includes(s)&&s!==ENCOUNTERS[value.index].species);
  const adventures=restoreAdventures(value.adventures,found),exploring=found.includes(value.exploring)?value.exploring:null;
  let explorePhase=exploring&&['explore','bonus','bonusHint','bonusCorrect'].includes(value.explorePhase)?value.explorePhase:'explore';
  if(explorePhase!=='explore'&&adventures[exploring]?.targets.length!==3)explorePhase='explore';
  if(explorePhase==='bonusCorrect'&&!adventures[exploring]?.bonus)explorePhase='bonus';
  return{version:2,stage:value.stage,index:value.index,found,eliminated,adventures,exploring,explorePhase,games:restoreGames(value.games,found)};
 }catch{return null;}
}

