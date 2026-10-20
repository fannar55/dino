// One spoken thought at a time. The child advances by playing, not by paging
// through explanations. These deterministic practice hands never enter a save.
export const LESSON_STEPS=Object.freeze([
  {id:'welcome',type:'listen',line:'welcome',caption:'Hæ! Spilum saman.'},
  {id:'intro',type:'listen',line:'intro',caption:'3 köst · geyma · velja kort'},
  {id:'roll-pair',type:'roll',line:'roll',caption:'Smelltu á ílátið.',newHand:true,hand:[2,2,3,4,6]},
  {id:'keep-pair',type:'hold',line:'keepPair',caption:'Geymdu báða tvistana.',indices:[0,1]},
  {id:'reroll-pair',type:'roll',line:'reroll',caption:'Kastaðu hinum aftur.',hand:[2,2,1,4,6]},
  {id:'score-pair',type:'score',line:'pair',caption:'Tveir eins = par.',category:'pair'},
  {id:'one-card',type:'listen',line:'once',caption:'Hvert kort einu sinni.'},
  {id:'winning',type:'listen',line:'winningRule',caption:'Fleiri stig vinna.'},
  {id:'roll-two-pairs',type:'roll',line:'twoPairsRoll',caption:'Prófum tvö pör!',newHand:true,hand:[2,2,4,4,6]},
  {id:'score-two-pairs',type:'score',line:'twoPairs',caption:'Tvö pör!',category:'twoPairs'},
  {id:'roll-three',type:'roll',line:'threeRoll',caption:'Leitum að þremur eins.',newHand:true,hand:[3,3,1,4,6]},
  {id:'keep-three',type:'hold',line:'keepThree',caption:'Geymdu báða þristana.',indices:[0,1]},
  {id:'reroll-three',type:'roll',line:'reroll',caption:'Kastaðu hinum aftur.',hand:[3,3,3,4,6]},
  {id:'score-three',type:'score',line:'threeKind',caption:'Þrír eins!',category:'threeKind'},
  {id:'roll-straight',type:'roll',line:'straightRoll',caption:'Prófum röð.',newHand:true,hand:[1,2,3,4,5]},
  {id:'score-straight',type:'score',line:'smallStraight',caption:'Röð: 1 · 2 · 3 · 4 · 5',category:'smallStraight'},
  {id:'roll-yatzy',type:'roll',line:'yatzyRoll',caption:'Eitt markmið eftir!',newHand:true,hand:[5,5,5,5,5]},
  {id:'score-yatzy',type:'score',line:'yatzy',caption:'Fimm eins = Yatzy!',category:'yatzy'},
  {id:'no-match',type:'listen',line:'noMatch',caption:'Ekkert passar? Veldu laust kort → 0.'},
  {id:'done',type:'finish',line:'finishedLesson',caption:'Vel gert! Nú spilum við.'},
].map(step=>Object.freeze(step)));

export function allowsAction(step,action,value){
  if(!step||step.type!==action)return false;
  if(action==='hold')return step.indices.includes(value);
  if(action==='score')return step.category===value;
  return action==='roll';
}
