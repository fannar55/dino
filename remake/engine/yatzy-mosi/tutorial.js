import {roll, scoreCategory} from './rules.js';

function freeze(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
const choice=(label,correct,feedback)=>({label,correct,feedback});

// These practice hands are deliberately chosen examples, never normal-game luck.
// Copy stays short; the UI shows the dice and asks for one action at a time.
export const LESSON_STEPS=freeze([
  {id:'intro',chapter:'Prófum saman',title:'Mosi kennir þér',copy:'Við spilum með fimm teninga. Þú mátt kasta allt að þrisvar þegar þú átt leik.',task:'Við prófum þetta saman, eitt skref í einu.',type:'next'},
  {id:'first-roll',chapter:'Prófum saman',title:'Kastaðu teningunum',copy:'Smelltu á svarta ílátið og sjáðu hvað kemur upp.',task:'Kastaðu einu sinni.',type:'roll',hand:[6,6,2,3,5],rollCount:1,turnCount:0},
  {id:'keep-sixes',chapter:'Prófum saman',title:'Tvær eins eru par',copy:'Tvær sexur! Smelltu á þær til að geyma þær fyrir næsta kast.',task:'Geymdu sexurnar tvær.',type:'hold',indices:[0,1],held:true},
  {id:'try-release',chapter:'Prófum saman',title:'Þú mátt skipta um skoðun',copy:'Smelltu aftur á merktu sexuna. Þá losnar hún og getur rúllað aftur.',task:'Losaðu merktu sexuna.',type:'hold',indices:[0],held:false},
  {id:'keep-again',chapter:'Prófum saman',title:'Geymum hana aftur',copy:'Við ætlum að safna sexum. Geymdu sexuna aftur.',task:'Geymdu lausu sexuna.',type:'hold',indices:[0],held:true},
  {id:'second-roll',chapter:'Prófum saman',title:'Kastaðu aftur',copy:'Sexurnar sem þú geymdir verða kyrrar. Hinir þrír teningarnir rúlla.',task:'Smelltu á ílátið aftur.',type:'roll',hand:[6,6,6,1,4],rollCount:2,turnCount:0},
  {id:'keep-third-six',chapter:'Prófum saman',title:'Enn ein sexa!',copy:'Nú eru sexurnar þrjár. Geymdu nýju sexuna líka.',task:'Geymdu lausu sexuna.',type:'hold',indices:[2],held:true},
  {id:'third-roll',chapter:'Prófum saman',title:'Síðasta kastið',copy:'Þú átt eitt kast eftir. Geymdu sexurnar þrjár og kastaðu hinum tveimur.',task:'Kastaðu í þriðja sinn.',type:'roll',hand:[6,6,6,6,2],rollCount:3,turnCount:0},
  {id:'score-sixes',chapter:'Veljum stig',title:'Sexurnar gefa stig',copy:'Fjórar sexur gefa 24 stig. Ljósu tölurnar sýna hvað þú getur valið.',task:'Veldu „Sexur“ í dálkinum „Þú“.',type:'score',category:'sixes',points:24,afterTurn:1},
  {id:'score-explained',chapter:'Veljum stig',title:'Einn reitur í einu',copy:'Nú eru 24 stig skráð í Sexur. Sá reitur er notaður og Mosi á næst leik.',task:'Í næstu umferð velurðu annan lausan reit.',type:'next'},
  {id:'mosi-turn',chapter:'Veljum stig',title:'Nú prófar Mosi',copy:'Mosi fékk tvo tvista og tvo fjarka. Hann velur „Tvö pör“ og fær 12 stig.',task:'Fylgstu með Mosa kasta og velja.',type:'opponent',hand:[2,2,4,4,5],category:'twoPairs',points:12,afterTurn:2},
  {id:'practice-roll',chapter:'Prófaðu aftur',title:'Aftur komið að þér',copy:'Nú prófar þú að safna þristum.',task:'Kastaðu teningunum.',type:'roll',hand:[3,3,2,4,6],rollCount:1,turnCount:2},
  {id:'keep-threes',chapter:'Prófaðu aftur',title:'Hvaða teninga geymum við?',copy:'Þristarnir tveir passa saman. Geymdu þá báða.',task:'Smelltu á þristana tvo.',type:'hold',indices:[0,1],held:true},
  {id:'practice-reroll',chapter:'Prófaðu aftur',title:'Hvað kemur næst?',copy:'Þristarnir bíða kyrrir meðan hinir rúlla.',task:'Kastaðu aftur.',type:'roll',hand:[3,3,3,2,2],rollCount:2,turnCount:2},
  {id:'score-full-house',chapter:'Prófaðu aftur',title:'Fullt hús!',copy:'Þrír þristar og tveir tvistar. Þetta er fullt hús og allir fimm telja: 13 stig.',task:'Veldu „Fullt hús“ í þínum dálki.',type:'score',category:'fullHouse',points:13,afterTurn:3},
  {id:'early-score',chapter:'Prófaðu aftur',title:'Þú mátt hætta að kasta',copy:'Þú valdir stig eftir tvö köst. Þú mátt líka velja strax eftir fyrsta kast.',task:'Þú þarft ekki að nota öll þrjú köstin.',type:'next'},
  {id:'upper-numbers',chapter:'Skoðum stigareitina',title:'Tölureitirnir efst',copy:'Í Sexum telja bara sexur. Þessar þrjár sexur gefa 18 stig.',task:'Hvaða teningar telja í Sexum?',type:'quiz',example:[6,6,6,2,1],choices:[choice('Sexurnar þrjár',true,'Já! Í hverjum tölureit telja bara teningar með þeirri tölu.'),choice('Allir fimm teningarnir',false,'Hér telja bara sexurnar. Prófaðu aftur.')]},
  {id:'pair',chapter:'Skoðum stigareitina',title:'Eitt par',copy:'Tvær sexur eru par. Þær gefa 6 + 6 = 12 stig.',task:'Hvaða teningar telja?',type:'quiz',example:[6,6,3,2,1],choices:[choice('Allir fimm teningarnir',false,'Par er tveir eins teningar. Leitaðu að sexunum tveimur.'),choice('Sexurnar tvær',true,'Rétt! Ef þú átt fleiri pör veljum við parið með hærri tölunni.')]},
  {id:'two-pairs',chapter:'Skoðum stigareitina',title:'Tvö pör',copy:'Tvistarnir eru eitt par og fimmurnar annað. Þessi fjögur saman gefa 14 stig.',task:'Hvað þarf í „Tvö pör“?',type:'quiz',example:[2,2,5,5,6],choices:[choice('Tvö pör með ólíkum tölum',true,'Já! Tveir tvistar og tvær fimmur. Sexan telur ekki.'),choice('Fjóra teninga sem eru allir eins',false,'Pörin þurfa að hafa ólíkar tölur. Prófaðu aftur.')]},
  {id:'three-kind',chapter:'Skoðum stigareitina',title:'Þrjár eins',copy:'Þrír eins teningar telja. Hér gefa fjarkarnir þrír 12 stig.',task:'Hvaða teningar telja?',type:'quiz',example:[4,4,4,2,6],choices:[choice('Fjarkarnir þrír',true,'Já! Hinir tveir teningarnir bætast ekki við.'),choice('Allir fimm teningarnir',false,'Í þessum reit telja bara þrír eins. Prófaðu fjarkana.')]},
  {id:'four-kind',chapter:'Skoðum stigareitina',title:'Fjórar eins',copy:'Fjórir eins teningar telja. Hér gefa þristarnir fjórir 12 stig.',task:'Telur sexan líka?',type:'quiz',example:[3,3,3,3,6],choices:[choice('Já, allir teningarnir telja',false,'Hér telja bara fjórir eins teningar. Prófaðu aftur.'),choice('Nei, bara þristarnir fjórir',true,'Rétt! Fjórir þristar telja, sexan bíður hjá.')]},
  {id:'small-straight',chapter:'Skoðum stigareitina',title:'Lítil röð',copy:'1, 2, 3, 4, 5 — allar tölurnar einu sinni. Litla röðin gefur 15 stig.',task:'Hvaða röð er þetta?',type:'quiz',example:[1,2,3,4,5],choices:[choice('Frá einum upp í fimm',true,'Já! Öll fimm sætin í röðinni þurfa að vera með.'),choice('Hvaða fjórar tölur sem er',false,'Við þurfum alla fimm teningana: 1, 2, 3, 4 og 5.')]},
  {id:'large-straight',chapter:'Skoðum stigareitina',title:'Stór röð',copy:'2, 3, 4, 5, 6 — allar tölurnar einu sinni. Stóra röðin gefur 20 stig.',task:'Á hvaða tölu byrjar stóra röðin?',type:'quiz',example:[2,3,4,5,6],choices:[choice('Á einum',false,'Þá væri það litla röðin. Stóra röðin byrjar á tveimur.'),choice('Á tveimur',true,'Rétt! Stóra röðin fer frá tveimur upp í sex.')]},
  {id:'full-house',chapter:'Skoðum stigareitina',title:'Munum eftir fullu húsi',copy:'Þrír þristar og tveir tvistar passa í fullt hús. Allir fimm telja og gefa 13 stig.',task:'Hvað er fullt hús?',type:'quiz',example:[3,3,3,2,2],choices:[choice('Þrír eins og tveir aðrir eins',true,'Já! Hópur með þremur og annar með tveimur.'),choice('Allir fimm eins',false,'Fimm eins eru YATZY. Fullt hús þarf tvo ólíka hópa.')]},
  {id:'yatzy',chapter:'Skoðum stigareitina',title:'YATZY!',copy:'Allir fimm teningarnir sýna sömu tölu. Í YATZY-reitnum færðu 50 stig!',task:'Hve margir þurfa að vera eins?',type:'quiz',example:[4,4,4,4,4],choices:[choice('Fjórir teningar',false,'Næstum! Síðasti teningurinn þarf líka að vera eins.'),choice('Allir fimm teningarnir',true,'Já! Hvaða tala sem er dugar, ef allir fimm eru eins.')]},
  {id:'chance',chapter:'Skoðum stigareitina',title:'Séns',copy:'Hér telja allir fimm teningarnir. Þeir þurfa ekki að passa saman.',task:'Hvaða teningar telja í Séns?',type:'quiz',example:[1,2,3,4,6],choices:[choice('Allir fimm',true,'Já! Þessi handfylli gefur 16 stig í Séns.'),choice('Bara tveir eins',false,'Það er par. Í Séns telja allir fimm teningarnir.')]},
  {id:'bonus-plan',chapter:'Nú kanntu þetta',title:'Þrír af hverri tölu',copy:'Þrjár sexur gefa 18 stig. Þrír af hverri tölu í efri reitunum gefa 63 stig.',task:'Stigin safnast saman milli umferða.',type:'next',example:[6,6,6,2,1]},
  {id:'upper-bonus',chapter:'Nú kanntu þetta',title:'50 aukastig!',copy:'Bónus þýðir aukastig! Náðu 63 stigum eða meira í tölureitunum efst og fáðu 50 aukastig.',task:'Hvar söfnum við í þennan bónus?',type:'quiz',reward:true,choices:[choice('Í öllum reitum á blaðinu',false,'Aðeins tölureitirnir efst safna þessum bónus.'),choice('Í tölureitunum efst',true,'Já! Einar, Tvíar, Þristar, Fjarkar, Fimmur og Sexur safna saman.')]},
  {id:'zero-score',chapter:'Nú kanntu þetta',title:'Stundum kemur núll',copy:'Hér er ekki YATZY. Ef þú velur YATZY-reitinn færðu 0 stig og reiturinn verður notaður.',task:'Má nota sama reitinn aftur?',type:'quiz',example:[1,2,3,4,6],choices:[choice('Nei, hann er búinn',true,'Rétt. Jafnvel núll fyllir reitinn, svo skoðum valið fyrst.'),choice('Já, af því að hann gaf núll',false,'Núll fyllir líka reitinn. Við veljum annan reit næst.')]},
  {id:'one-row',chapter:'Nú kanntu þetta',title:'Veldu einn reit',copy:'Þú og Mosi skiptist á. Í hvert sinn velur þú einn lausan reit fyrir stigin þín.',task:'Hvað velurðu eftir köstin þín?',type:'quiz',choices:[choice('Alla ljósu reitina',false,'Ljósu tölurnar eru valkostir. Þú velur bara einn þeirra.'),choice('Einn lausan reit',true,'Já! Þegar allir 15 reitirnir eru fylltir vinnur sá sem á fleiri stig.')]},
  {id:'finish',chapter:'Nú kanntu þetta',title:'Nú geturðu spilað!',copy:'Kastaðu, geymdu teninga og veldu einn stigareit. Eftir 15 umferðir vinnur sá sem á fleiri stig.',task:'Nú geturðu spilað við Mosa.',type:'finish'},
]);

export function createLesson(){return {index:0,answer:null,feedback:''};}
export function lessonStep(lesson){
  if(!lesson||!Number.isInteger(lesson.index)||lesson.index<0||lesson.index>=LESSON_STEPS.length)throw new TypeError('Invalid lesson position');
  return LESSON_STEPS[lesson.index];
}
const human=state=>state?.status==='playing'&&state.currentPlayer===0;
const hasDice=state=>Array.isArray(state?.dice)&&state.dice.length===5&&Array.isArray(state.held)&&state.held.length===5;
const nextLesson=lesson=>({index:lesson.index+1,answer:null,feedback:''});
const hasCorrectAnswer=(lesson,step)=>Number.isInteger(lesson.answer)&&step.choices?.[lesson.answer]?.correct===true;

/** Human input gate. Animation completion events are handled by advanceLesson. */
export function allowsLessonAction(lesson,state,action,value){
  const step=lessonStep(lesson);
  if(action==='next')return step.type==='next'||step.type==='quiz'&&hasCorrectAnswer(lesson,step);
  if(action==='answer')return step.type==='quiz'&&!hasCorrectAnswer(lesson,step)&&Number.isInteger(value)&&value>=0&&value<step.choices.length;
  if(!human(state)||!hasDice(state))return false;
  if(action==='roll')return step.type==='roll'&&state.turnCount===step.turnCount&&state.rollCount===step.rollCount-1&&!state.held.every(Boolean);
  if(action==='hold')return step.type==='hold'&&state.rollCount>0&&state.rollCount<3&&Number.isInteger(value)&&step.indices.includes(value)&&state.held[value]!==step.held;
  if(action==='score')return step.type==='score'&&value===step.category&&state.rollCount>0&&state.turnCount===step.afterTurn-1&&state.players?.[0]?.scores?.[value]===null&&scoreCategory(value,state.dice)===step.points;
  return false;
}

/** Consume committed state, not a click: a roll advances only after its animation. */
export function advanceLesson(lesson,state,action,value){
  const step=lessonStep(lesson);
  if(action==='answer'){
    if(!allowsLessonAction(lesson,state,action,value))return lesson;
    const answer=step.choices[value];return {index:lesson.index,answer:value,feedback:answer.feedback};
  }
  if(action==='next')return allowsLessonAction(lesson,state,action,value)?nextLesson(lesson):lesson;
  if(step.type==='roll'&&action==='rolled'&&human(state)&&hasDice(state)&&state.turnCount===step.turnCount&&state.rollCount===step.rollCount&&state.dice.every((face,index)=>face===step.hand[index]))return nextLesson(lesson);
  if(step.type==='hold'&&action==='hold'&&human(state)&&hasDice(state)&&state.rollCount>0&&state.rollCount<3&&Number.isInteger(value)&&step.indices.includes(value)&&step.indices.every(index=>state.held[index]===step.held))return nextLesson(lesson);
  if(step.type==='score'&&action==='score'&&value===step.category&&state?.turnCount===step.afterTurn&&state.currentPlayer===1&&state.players?.[0]?.scores?.[step.category]===step.points)return nextLesson(lesson);
  if(step.type==='opponent'&&action==='opponentDone'&&state?.turnCount===step.afterTurn&&state.currentPlayer===0&&state.players?.[1]?.scores?.[step.category]===step.points)return nextLesson(lesson);
  return lesson;
}

/** Keep real action validation, turn counters and RNG; replace only rolled faces. */
export function rollLesson(lesson,state){
  const step=lessonStep(lesson),opponent=step.type==='opponent'&&state?.status==='playing'&&state.currentPlayer===1&&state.turnCount===step.afterTurn-1&&state.rollCount===0;
  if(!opponent&&!allowsLessonAction(lesson,state,'roll'))throw new TypeError('This lesson is not ready for a roll');
  const next=roll(state);
  for(let index=0;index<5;index++)if(!state.held[index])next.dice[index]=step.hand[index];
  return next;
}
