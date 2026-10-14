import {ADVENTURES} from './adventure-content.js';

export const emptyAdventure = () => ({targets:[],secret:false,bonus:false,eliminated:[]});
export function restoreAdventures(raw, found) {
  const result={};
  for(const species of found){
    const definition=ADVENTURES[species],value=raw?.[species];
    if(!definition||!value||typeof value!=='object')continue;
    const targets=[...new Set(Array.isArray(value.targets)?value.targets:[])].filter(id=>definition.targets.some(target=>target.id===id));
    result[species]={targets,secret:value.secret===true,bonus:targets.length===definition.targets.length&&value.bonus===true,
      eliminated:[...new Set(Array.isArray(value.eliminated)?value.eliminated:[])].filter(id=>id!==definition.bonus.answer&&definition.bonus.choices.some(choice=>choice.id===id))};
  }
  return result;
}
export function adventureScore(state,species){
  if(!state.found.includes(species))return 0;
  const data=state.adventures?.[species]||emptyAdventure(),definition=ADVENTURES[species];
  return 1+Number(data.targets.length===definition.targets.length)+Number(data.secret)+Number(data.bonus);
}
export const starCount=state=>state.found.reduce((sum,species)=>sum+adventureScore(state,species),0);
export const MAX_STARS=Object.keys(ADVENTURES).length*4;

export function evolveExploration(state,event){
  if(event.type==='EXPLORE'&&state.found.includes(event.species)&&ADVENTURES[event.species]){
    return {...state,exploring:event.species,explorePhase:'explore'};
  }
  if(event.type==='LEAVE_EXPLORE')return {...state,exploring:null,explorePhase:'explore'};
  const species=state.exploring,definition=ADVENTURES[species];
  if(!definition||!state.found.includes(species))return state;
  const data=state.adventures?.[species]||emptyAdventure();
  const collecting=event.type==='COLLECT'&&state.explorePhase==='explore'&&(event.id===definition.secret.id||definition.targets.some(target=>target.id===event.id));
  const asking=event.type==='ASK_BONUS'&&data.targets.length===definition.targets.length;
  const answering=event.type==='BONUS_ANSWER'&&['bonus','bonusHint'].includes(state.explorePhase)&&definition.bonus.choices.some(choice=>choice.id===event.id)&&!data.eliminated.includes(event.id);
  if(!collecting&&!asking&&!answering&&event.type!=='BACK_TO_EXPLORE')return state;
  const next={...state,adventures:{...state.adventures,[species]:{...data,targets:[...data.targets],eliminated:[...data.eliminated]}}};
  const changed=next.adventures[species];
  if(event.type==='COLLECT'&&state.explorePhase==='explore'){
    if(event.id===definition.secret.id)changed.secret=true;
    else if(definition.targets.some(target=>target.id===event.id)&&!changed.targets.includes(event.id))changed.targets.push(event.id);
  }else if(event.type==='ASK_BONUS'&&data.targets.length===definition.targets.length){
    next.explorePhase=data.bonus?'bonusCorrect':'bonus';
  }else if(event.type==='BACK_TO_EXPLORE')next.explorePhase='explore';
  else if(event.type==='BONUS_ANSWER'&&['bonus','bonusHint'].includes(state.explorePhase)&&definition.bonus.choices.some(choice=>choice.id===event.id)&&!data.eliminated.includes(event.id)){
    if(event.id===definition.bonus.answer){changed.bonus=true;next.explorePhase='bonusCorrect';}
    else{changed.eliminated.push(event.id);next.explorePhase='bonusHint';}
  }
  return next;
}
