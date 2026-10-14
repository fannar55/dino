import test from 'node:test';
import assert from 'node:assert/strict';
import {JIGSAW_PICTURES} from '../dist/jigsaw-art.js';
import {createJigsawState,restoreJigsawState,rotateJigsawPiece,placeJigsawPiece,claimJigsaw,jigsawEdges,jigsawPiecePath,clearJigsawDrafts} from '../dist/jigsaw-game.js';

test('35 image pieces only fit their actual position and orientation; one explicit claim completes each picture',()=>{
 for(const picture of JIGSAW_PICTURES){
  let state=createJigsawState(picture.id,2);assert.equal(new Set(state.order).size,35);assert.ok(state.turns.some(v=>v!==0));assert.ok(new Set(state.turns).size>1);
  for(const id of state.order){
   const before=state;assert.equal(placeJigsawPiece(state,id,(id+1)%35).accepted,false);assert.equal(state,before);
   const turned=rotateJigsawPiece(state,id,1-state.turns[id]);assert.equal(placeJigsawPiece(turned,id,id).reason,'rotation');
   state=rotateJigsawPiece(state,id,-state.turns[id]);const result=placeJigsawPiece(state,id,id);assert.equal(result.accepted,true);state=result.state;
   assert.equal(placeJigsawPiece(state,id,id).accepted,false);assert.equal(rotateJigsawPiece(state,id,1),state);
  }
  assert.equal(state.placed.length,35);assert.equal(state.claimed,false);const claimed=claimJigsaw(state);assert.equal(claimed.claimed,true);assert.equal(claimJigsaw(claimed),claimed);
  assert.equal(restoreJigsawState(claimed,picture.id,3).placed.length,0,'An intentional later replay is a new puzzle, not a free statue');
 }
});

// Flatten the exported SVG Bézier geometry independently, then measure its
// real area. Complementary tabs must tile the 700×500 picture without gaps.
function pathArea(path){
 const tokens=path.match(/[MLCZ]|-?\d+(?:\.\d+)?/g),points=[];let at=0,p=[0,0];const read=()=>[Number(tokens[at++]),Number(tokens[at++])];
 while(at<tokens.length){const op=tokens[at++];if(op==='M'||op==='L'){p=read();points.push(p);}else if(op==='C'){const a=p,b=read(),c=read(),d=read();for(let i=1;i<=40;i++){const t=i/40,u=1-t;points.push([0,1].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]));}p=d;}else if(op!=='Z')throw Error('Unexpected SVG command');}
 return Math.abs(points.reduce((n,a,i)=>{const b=points[(i+1)%points.length];return n+a[0]*b[1]-b[0]*a[1];},0))/2;
}
test('actual curved jigsaw shapes tile a full image with complementary tabs, blanks and flat outside edges',()=>{
 for(const picture of JIGSAW_PICTURES)for(const round of [0,3,17]){
  let area=0;
  for(let id=0;id<35;id++){
   const [top,right,bottom,left]=jigsawEdges(id,picture.id,round),row=Math.floor(id/7),col=id%7,path=jigsawPiecePath(id,picture.id,round);
   if(row===0)assert.equal(top,0);if(row===4)assert.equal(bottom,0);if(col===0)assert.equal(left,0);if(col===6)assert.equal(right,0);
   if(row<4)assert.equal(bottom,-jigsawEdges(id+7,picture.id,round)[0]);if(col<6)assert.equal(right,-jigsawEdges(id+1,picture.id,round)[3]);
   assert.match(path,/ C/);const a=pathArea(path);assert.ok(a>8000&&a<12000);area+=a;
  }
  assert.ok(Math.abs(area-350000)<.01,`No missing/duplicated picture area: ${area}`);
 }
});

test('validated per-picture drafts retain unfinished work across rounds and complete work requires an explicit claim',()=>{
 let state=createJigsawState('golden-forest',1);for(const id of [4,19,33]){state=rotateJigsawPiece(state,id,-state.turns[id]);state=placeJigsawPiece(state,id,id).state;}
 state=rotateJigsawPiece(state,7,2);const raw=JSON.stringify(state);
 assert.deepEqual(restoreJigsawState(raw,state.theme,9),state);assert.equal(claimJigsaw(state),state);
 assert.equal(restoreJigsawState(raw,'secret-pond',9).placed.length,0);
 for(const patch of [{version:99},{placed:[4,4]},{turns:Array(35).fill(4)},{order:Array(35).fill(1)},{round:Infinity},{placed:[-1]},{placed:['4']}])assert.equal(restoreJigsawState(JSON.stringify({...state,...patch}),state.theme,9).placed.length,0);
 assert.equal(restoreJigsawState('{broken',state.theme,9).placed.length,0);
});

test('adult reset removes only exact jigsaw keys and tolerates blocked storage',()=>{
 const data=new Map([['stjornufar.safari.v2','keep'],['mosi.jigsaw.v1.other-project','keep'],['mosi.jigsaw.v1.last','golden-forest'],...JIGSAW_PICTURES.map(p=>['mosi.jigsaw.v1.'+p.id,'draft'])]);
 clearJigsawDrafts({removeItem:key=>data.delete(key)});assert.deepEqual([...data.keys()],['stjornufar.safari.v2','mosi.jigsaw.v1.other-project']);
 const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Blocked');}});assert.doesNotThrow(()=>clearJigsawDrafts());}finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
