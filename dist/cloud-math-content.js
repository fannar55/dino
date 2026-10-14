// Original Icelandic questions; pure data so narration can be generated without a DOM.
const fish = ['engir fiskar','einn fiskur','tveir fiskar','þrír fiskar','fjórir fiskar','fimm fiskar','sex fiskar','sjö fiskar','átta fiskar','níu fiskar','tíu fiskar'];
const added = ['', 'bætist einn fiskur við', 'bætast tveir fiskar við', 'bætast þrír fiskar við', 'bætast fjórir fiskar við'];
const taken = ['', 'einn fisk úr körfunni', 'tvo fiska úr körfunni', 'þrjá fiska úr körfunni', 'fjóra fiska úr körfunni', 'fimm fiska úr körfunni'];
const entries = [
 [1,'+',1],[2,'+',1],[1,'+',3],[2,'+',2],[3,'+',2],
 [2,'−',1],[3,'−',1],[4,'−',2],[5,'−',3],[3,'−',3],
 [4,'+',2],[5,'+',3],[6,'+',4],[7,'+',2],
 [6,'−',2],[7,'−',3],[9,'−',4],[10,'−',5],
];
export const MATH_PROBLEMS = Object.freeze(entries.map(([left,op,right],index)=>{
 const id=`math_${left}_${op==='+'?'plus':'minus'}_${right}`;
 const setup=`Hér ${left===1?'er':'eru'} ${fish[left]}.`;
 const phrase=op==='+'?`${setup} Nú ${added[right]}. Hvað eru fiskarnir margir þá?`:`${setup} Við færum ${taken[right]}. Hvað eru margir eftir?`;
 return Object.freeze({id,left,op,right,result:op==='+'?left+right:left-right,level:index<10?1:2,phrase});
}));
export const CLOUD_MATH_NARRATION = Object.freeze({
 ...Object.fromEntries(MATH_PROBLEMS.map(p=>[p.id,p.phrase])),
 math_rain:'Úps, nú kemur smá skúr! Flugeðlan fer í skjól. Við getum prófað aftur.',
});
