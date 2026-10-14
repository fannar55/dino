import {JIGSAW_PICTURES} from './jigsaw-art.js';

export const JIGSAW_COLUMNS=7,JIGSAW_ROWS=5,JIGSAW_COUNT=35;
const VERSION=1,PREFIX='mosi.jigsaw.v1.',LAST_KEY=PREFIX+'last';
const themes=new Set(JIGSAW_PICTURES.map(p=>p.id));
const keyFor=theme=>PREFIX+theme;
const validIndex=value=>Number.isInteger(value)&&value>=0&&value<JIGSAW_COUNT;
const quarter=value=>((value%4)+4)%4;
function hash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function random(seed){let n=seed||1;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

export function createJigsawState(theme,round=0){
 if(!themes.has(theme))throw Error('Óþekkt púslmynd');
 round=Number.isSafeInteger(round)&&round>=0?Math.min(round,9999):0;
 const rng=random(hash(theme+':'+round)),order=Array.from({length:JIGSAW_COUNT},(_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return{version:VERSION,theme,round,placed:[],turns:Array.from({length:JIGSAW_COUNT},()=>Math.floor(rng()*4)),order,claimed:false};
}
export function restoreJigsawState(raw,theme,round=0){
 const fresh=()=>createJigsawState(theme,round);
 try{
  const data=typeof raw==='string'?JSON.parse(raw):raw;
  if(!data||data.version!==VERSION||data.theme!==theme||!Number.isSafeInteger(data.round)||data.round<0||data.round>9999||typeof data.claimed!=='boolean')return fresh();
  if(!Array.isArray(data.placed)||data.placed.length>35||data.placed.some(v=>!validIndex(v))||new Set(data.placed).size!==data.placed.length)return fresh();
  if(!Array.isArray(data.turns)||data.turns.length!==35||data.turns.some(v=>!Number.isInteger(v)||v<0||v>3)||data.placed.some(id=>data.turns[id]!==0))return fresh();
  if(!Array.isArray(data.order)||data.order.length!==35||data.order.some(v=>!validIndex(v))||new Set(data.order).size!==35)return fresh();
  // Claimed pictures are deliberate new replays. Unfinished pictures retain their
  // own round/edge pattern even if another picture has since earned a statue.
  if(data.claimed)return fresh();
  return{version:VERSION,theme,round:data.round,placed:[...data.placed],turns:[...data.turns],order:[...data.order],claimed:false};
 }catch{return fresh();}
}
export function rotateJigsawPiece(state,id,steps){
 if(!validIndex(id)||state.claimed||state.placed.includes(id)||!Number.isInteger(steps))return state;
 const turns=[...state.turns];turns[id]=quarter(turns[id]+steps);return{...state,turns};
}
export function placeJigsawPiece(state,id,cell){
 if(!validIndex(id)||!validIndex(cell)||state.claimed||state.placed.includes(id))return{state,accepted:false,reason:'inactive'};
 if(id!==cell)return{state,accepted:false,reason:'position'};
 if(state.turns[id]!==0)return{state,accepted:false,reason:'rotation'};
 const next={...state,placed:[...state.placed,id]};return{state:next,accepted:true,complete:next.placed.length===35};
}
export function claimJigsaw(state){return!state.claimed&&state.placed.length===35?{...state,claimed:true}:state;}
export function clearJigsawDrafts(storage){
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{return;}
 if(!storage)return;
 for(const key of [LAST_KEY,...JIGSAW_PICTURES.map(p=>keyFor(p.id))])try{storage.removeItem(key);}catch{}
}

/** Clockwise edge normals. Adjacent tabs are exact complementary curves. */
export function jigsawEdges(id,theme,round=0){
 const row=Math.floor(id/7),col=id%7,sign=(axis,r,c)=>hash(`${theme}:${round}:${axis}:${r}:${c}`)%2?1:-1;
 return[top(row,col),col===6?0:sign('v',row,col+1),row===4?0:sign('h',row+1,col),col===0?0:-sign('v',row,col)];
 function top(r,c){return r===0?0:-sign('h',r,c);}
}
export function jigsawPiecePath(id,theme,round=0){
 const edges=jigsawEdges(id,theme,round),corners=[[0,0],[100,0],[100,100],[0,100]],parts=['M0 0'];
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4],dx=(b[0]-a[0])/100,dy=(b[1]-a[1])/100,s=edges[i];
  const p=(t,h=0)=>`${a[0]+dx*t+dy*h*s} ${a[1]+dy*t-dx*h*s}`;
  if(!s){parts.push(`L${b[0]} ${b[1]}`);continue;}
  parts.push(`L${p(35)} C${p(42)} ${p(43,-3)} ${p(40,-9)} C${p(27,-26)} ${p(73,-26)} ${p(60,-9)} C${p(57,-3)} ${p(58)} ${p(65)} L${p(100)}`);
 }
 return parts.join(' ')+' Z';
}

let serial=0;
const artUrl=picture=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(picture.svg);
function pieceSvg(picture,id,round,turn=0,scope='piece'){
 const path=jigsawPiecePath(id,picture.id,round),clip=`jigsaw-${scope}-${++serial}`,col=id%7,row=Math.floor(id/7);
 return`<svg viewBox="-27 -27 154 154" aria-hidden="true" focusable="false"><g transform="rotate(${turn*90} 50 50)"><defs><clipPath id="${clip}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="#f9efd0" stroke="#173f42" stroke-width="3"/><image href="${artUrl(picture)}" x="${-col*100}" y="${-row*100}" width="700" height="500" clip-path="url(#${clip})"/><path d="${path}" fill="none" stroke="#fff5d7" stroke-width="1.7" stroke-opacity=".8"/></g></svg>`;
}
function installCss(doc){if(doc.getElementById('jigsaw-style'))return;const link=doc.createElement('link');link.id='jigsaw-style';link.rel='stylesheet';link.href=new URL('./jigsaw-game.css',import.meta.url).href;(doc.head||doc.documentElement).append(link);}

export function createJigsaw({doc,stage,audio={},clock,round=0,canPlay=()=>true,message=()=>{},progress=()=>{},win=()=>{},effect=()=>{},stopSpeech=()=>{}}){
 installCss(doc);
 const root=doc.createElement('section');root.className='jigsaw-game';stage.append(root);
 let storage;try{storage=doc.defaultView?.localStorage||globalThis.localStorage;}catch{}
 let state=null,picture=null,selected=null,paused=false,disposed=false,won=false,chooser=true,zoom=1,reference=false,focusedCell=0;
 let workspace,viewport,board,overview,preview,tray,rotateLeft,rotateRight,claimButton,selectionText,referenceButton,zoomOut,zoomIn,drag=null,ghost=null,pan=null,suppressBoardClick=false;
 let hintTimer=null;const buttons=new Map(),slots=new Map(),cleanup=[];
 const enabled=()=>!disposed&&!paused&&!doc.hidden&&canPlay()&&!won;
 const make=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const button=(text,cls,fn,label)=>{const el=make('button',cls,text);el.type='button';if(label)el.setAttribute('aria-label',label);el.addEventListener('click',event=>{if(enabled())fn(event);});return el;};
 function read(theme){try{return storage?.getItem(keyFor(theme));}catch{return null;}}
 function persist(){if(!state)return;try{storage?.setItem(keyFor(state.theme),JSON.stringify(state));storage?.setItem(LAST_KEY,state.theme);}catch{}}
 function finishDrag(){drag=null;ghost?.remove();ghost=null;}
 function clearHint(){if(hintTimer!==null)clock?.cancel?.(hintTimer);hintTimer=null;root.querySelectorAll('.jigsaw-hint').forEach(el=>el.classList.remove('jigsaw-hint'));}
 function resetView(){finishDrag();clearHint();pan=null;buttons.clear();slots.clear();root.replaceChildren();}
 function showPictures(){
  if(disposed)return;persist();resetView();chooser=true;root.classList.add('choosing');
  const heading=make('h2','','Hvaða mynd eigum við að púsla?'),choices=make('div','jigsaw-pictures');
  for(const item of JIGSAW_PICTURES){
   const saved=restoreJigsawState(read(item.id),item.id,round),b=button('','jigsaw-picture',()=>openPicture(item.id));b.dataset.picture=item.id;
   const img=make('img');img.src=artUrl(item);img.alt=item.alt;
   b.append(img,make('strong','',item.name),make('span','',saved.placed.length===35?'Tilbúið — sækja styttuna':saved.placed.length?`Halda áfram · ${saved.placed.length} / 35`:'35 bútar · Snúum og púslum'));
   choices.append(b);
  }
  root.append(heading,choices);message('Veldu mynd. Púslið þitt geymist á meðan við könnum áfram.');progress(0,35);
 }
 function openPicture(id,initial=false){
  if(disposed||!initial&&!enabled()||!themes.has(id))return;persist();resetView();chooser=false;root.classList.remove('choosing');
  picture=JIGSAW_PICTURES.find(p=>p.id===id);state=restoreJigsawState(read(id),id,round);selected=null;reference=false;focusedCell=0;zoom=1;persist();
  const toolbar=make('div','jigsaw-toolbar'),title=make('strong','jigsaw-title',picture.name),tools=make('div','jigsaw-tools');
  referenceButton=button('Myndin','',()=>setReference(!reference),'Skoða alla myndina');referenceButton.setAttribute('aria-pressed','false');
  zoomOut=button('−','',()=>setZoom(zoom-.2),'Minnka púslflötinn');zoomIn=button('+','',()=>setZoom(zoom+.2),'Stækka púslflötinn');
  tools.append(button('Myndir','',showPictures),referenceButton,zoomOut,zoomIn);
  toolbar.append(title,tools);
  workspace=make('div','jigsaw-workspace');viewport=make('div','jigsaw-viewport');viewport.setAttribute('aria-label','Púslflötur. Dragðu til að færa myndina.');
  board=make('div','jigsaw-board');board.style.setProperty('--jigsaw-width','560px');board.setAttribute('role','group');board.setAttribute('aria-label','Mynd með 35 púslreitum');
  overview=make('div','jigsaw-overview');overview.hidden=true;const guide=make('img');guide.src=artUrl(picture);guide.alt=picture.alt;overview.append(guide);
  for(let cell=0;cell<35;cell++){
   const target=button('','jigsaw-cell',event=>{if(suppressBoardClick&&event.detail!==0){suppressBoardClick=false;return;}attempt(cell);},`Reitur, röð ${Math.floor(cell/7)+1}, dálkur ${cell%7+1}`);
   target.dataset.cell=String(cell);target.style.left=`${cell%7*100/7}%`;target.style.top=`${Math.floor(cell/7)*20}%`;target.tabIndex=cell===0?0:-1;
   target.innerHTML=`<svg viewBox="-27 -27 154 154" aria-hidden="true"><path d="${jigsawPiecePath(cell,id,state.round)}"/></svg>`;
   target.addEventListener('keydown',event=>boardKey(event,cell));target.addEventListener('focus',()=>{focusedCell=cell;});board.append(target);slots.set(cell,target);
  }
  viewport.append(board);workspace.append(viewport,overview);
  const dock=make('div','jigsaw-dock'),selectedPanel=make('div','jigsaw-selected');preview=make('div','jigsaw-preview');preview.setAttribute('aria-hidden','true');
  const controls=make('div','jigsaw-rotate');rotateLeft=button('↶','',()=>rotate(-1),'Snúa valda púslbútnum til vinstri');rotateRight=button('↷','',()=>rotate(1),'Snúa valda púslbútnum til hægri');
  controls.append(rotateLeft,rotateRight);selectionText=make('span','jigsaw-selected-label','Veldu bút');selectedPanel.append(preview,controls,selectionText);
  tray=make('div','jigsaw-tray');tray.setAttribute('aria-label','Púslbútar. Dragðu til hliðar til að skoða fleiri.');
  for(const [index,id]of state.order.entries()){
   const b=button('','jigsaw-piece',()=>select(id),`Púslbútur ${index+1}`);b.dataset.piece=String(id);b.innerHTML=pieceSvg(picture,id,state.round,state.turns[id]);
   b.addEventListener('pointerdown',event=>beginDrag(event,id,b));b.addEventListener('pointermove',moveDrag);b.addEventListener('pointerup',endDrag);b.addEventListener('pointercancel',finishDrag);b.addEventListener('lostpointercapture',finishDrag);
   b.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='r'&&enabled()){event.preventDefault();select(id);rotate(event.shiftKey?-1:1);}if(event.key==='ArrowUp'&&enabled()){event.preventDefault();select(id);slots.get(focusedCell)?.focus();}if(['ArrowLeft','ArrowRight'].includes(event.key)&&enabled()){event.preventDefault();const visible=state.order.filter(i=>!state.placed.includes(i)),at=visible.indexOf(id),next=visible[Math.max(0,Math.min(visible.length-1,at+(event.key==='ArrowRight'?1:-1)))];buttons.get(next)?.focus();}});
   tray.append(b);buttons.set(id,b);
  }
  dock.append(selectedPanel,tray);claimButton=button('Sækja styttuna','jigsaw-claim',claim);claimButton.hidden=true;
  root.append(toolbar,workspace,dock,claimButton);
  viewport.addEventListener('pointerdown',event=>{if(!enabled()||reference||event.isPrimary===false)return;pan={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};suppressBoardClick=false;});
  viewport.addEventListener('pointermove',event=>{if(!pan||event.pointerId!==pan.id||!enabled())return;if(Math.hypot(event.clientX-pan.x,event.clientY-pan.y)>8)pan.moved=true;if(pan.moved){event.preventDefault();viewport.scrollLeft-=event.clientX-pan.lastX;viewport.scrollTop-=event.clientY-pan.lastY;suppressBoardClick=true;viewport.setPointerCapture?.(event.pointerId);}pan.lastX=event.clientX;pan.lastY=event.clientY;});
  viewport.addEventListener('pointerup',()=>{pan=null;});viewport.addEventListener('pointercancel',()=>{pan=null;});
  update();message(state.placed.length?'Hér bíður myndin þín! Höldum áfram að púsla.':'Veldu bút, snúðu honum og finndu réttan stað. Dragðu púslflötinn til að sjá meira.');
 }
 function setReference(value){
  reference=Boolean(value);finishDrag();pan=null;workspace.classList.toggle('reference-open',reference);overview.hidden=!reference;viewport.inert=reference;
  // Keep the viewport laid out: its scroll position and zoom survive unchanged.
  referenceButton.textContent=reference?'Púslið':'Myndin';referenceButton.setAttribute('aria-label',reference?'Aftur í púslið':'Skoða alla myndina');referenceButton.setAttribute('aria-pressed',String(reference));zoomOut.disabled=zoomIn.disabled=reference;
 }
 function setZoom(value){if(!board||reference)return;const previous=zoom;zoom=Math.max(.8,Math.min(1.8,Math.round(value*10)/10));const centerX=viewport.scrollLeft+viewport.clientWidth/2,centerY=viewport.scrollTop+viewport.clientHeight/2;board.style.setProperty('--jigsaw-width',`${560*zoom}px`);viewport.scrollLeft=centerX*zoom/previous-viewport.clientWidth/2;viewport.scrollTop=centerY*zoom/previous-viewport.clientHeight/2;}
 function select(id){if(!enabled()||chooser||!validIndex(id)||state.placed.includes(id))return;clearHint();selected=id;updateSelection();}
 function updateSelection(){
  const active=selected!==null&&!state.placed.includes(selected);
  for(const[id,b]of buttons){b.classList.toggle('selected',active&&id===selected);b.setAttribute('aria-pressed',String(active&&id===selected));}
  preview.innerHTML=active?pieceSvg(picture,selected,state.round,state.turns[selected],'preview'):'<span aria-hidden="true">✦</span>';
  rotateLeft.disabled=rotateRight.disabled=!active;selectionText.textContent=active?'Snúðu · finndu staðinn':'Veldu bút';
 }
 function rotate(steps){if(!enabled()||selected===null)return;state=rotateJigsawPiece(state,selected,steps);persist();buttons.get(selected).innerHTML=pieceSvg(picture,selected,state.round,state.turns[selected]);updateSelection();effect('tap');}
 function update(){
  for(const[id,b]of buttons)b.hidden=state.placed.includes(id);
  if(state.placed.includes(focusedCell))focusedCell=state.order.find(id=>!state.placed.includes(id))??0;
  for(const[id,b]of slots){const placed=state.placed.includes(id);b.classList.toggle('placed',placed);b.disabled=placed;b.tabIndex=!placed&&id===focusedCell?0:-1;if(placed)b.innerHTML=pieceSvg(picture,id,state.round,0,'placed');}
  updateSelection();progress(state.placed.length,35);const complete=state.placed.length===35;root.classList.toggle('jigsaw-complete',complete);claimButton.hidden=!complete;
  if(complete){setReference(false);message('Öll 35 stykkin komin! Skoðaðu fallegu myndina þína.');}
 }
 function attempt(cell){
  if(!enabled()||chooser||reference||selected===null)return;clearHint();const result=placeJigsawPiece(state,selected,cell);
  if(!result.accepted){if(result.reason==='rotation')message('Þú fannst staðinn! Snúum bútnum svo brúnirnar passi.');else if(result.reason==='position')message('Skoðum litina og brúnirnar. Þessi bútur bíður annars staðar.');effect('leaf');return;}
  state=result.state;selected=null;persist();update();effect('fossil');if(!result.complete)message('Þetta passar! Myndin okkar vex, bút fyrir bút.');else audio.animal?.('stegosaurus',{mood:'happy'});
 }
 function claim(){if(!enabled()||!state)return;const next=claimJigsaw(state);if(next===state)return;state=next;persist();won=true;claimButton.disabled=true;stopSpeech();win();}
 function boardKey(event,cell){
  if(!enabled())return;let next=cell;
  if(event.key==='ArrowLeft')next=Math.max(0,cell-1);else if(event.key==='ArrowRight')next=Math.min(34,cell+1);else if(event.key==='ArrowUp')next=Math.max(0,cell-7);else if(event.key==='ArrowDown')next=Math.min(34,cell+7);else if(event.key.toLowerCase()==='r'){event.preventDefault();rotate(event.shiftKey?-1:1);return;}else return;
  event.preventDefault();const step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-7:7;
  while(state.placed.includes(next)&&next+step>=0&&next+step<35)next+=step;
  if(state.placed.includes(next))return;
  for(const[id,b]of slots)b.tabIndex=id===next?0:-1;focusedCell=next;slots.get(next)?.focus();
 }
 function beginDrag(event,id,node){
  if(!enabled()||event.isPrimary===false||event.button>0||state.placed.includes(id))return;
  select(id);drag={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false,scrolling:false,scrollLeft:tray.scrollLeft,node};node.setPointerCapture?.(event.pointerId);
 }
 function moveDrag(event){
  if(!drag||event.pointerId!==drag.pointer||!enabled())return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(Math.hypot(dx,dy)<8&&!drag.moved&&!drag.scrolling)return;
  // A sideways swipe browses the pieces. A vertical/diagonal drag lifts one
  // toward the board, avoiding a tiny unusable scroll gutter on touch screens.
  if(!drag.moved&&(drag.scrolling||Math.abs(dx)>Math.abs(dy)*1.5)){drag.scrolling=true;event.preventDefault();tray.scrollLeft=drag.scrollLeft-dx;return;}
  if(reference)return;
  drag.moved=true;event.preventDefault();
  if(!ghost){ghost=make('div','jigsaw-drag-ghost');ghost.innerHTML=pieceSvg(picture,drag.id,state.round,state.turns[drag.id],'drag');root.append(ghost);}
  ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
  const r=viewport.getBoundingClientRect();if(event.clientX>r.left&&event.clientX<r.right){if(event.clientY<r.top+32)viewport.scrollTop-=10;else if(event.clientY>r.bottom-32)viewport.scrollTop+=10;}if(event.clientY>r.top&&event.clientY<r.bottom){if(event.clientX<r.left+32)viewport.scrollLeft-=10;else if(event.clientX>r.right-32)viewport.scrollLeft+=10;}
 }
 function endDrag(event){
  if(!drag||event.pointerId!==drag.pointer)return;const moved=drag.moved;finishDrag();if(!moved||!enabled())return;
  const clip=viewport.getBoundingClientRect(),r=board.getBoundingClientRect();if(event.clientX<clip.left||event.clientX>clip.right||event.clientY<clip.top||event.clientY>clip.bottom||!r.width||!r.height)return;
  const col=Math.floor((event.clientX-r.left)*7/r.width),row=Math.floor((event.clientY-r.top)*5/r.height);if(col>=0&&col<7&&row>=0&&row<5)attempt(row*7+col);
 }
 function hint(){
  if(!enabled()||chooser||state.placed.length===35)return;
  if(reference)setReference(false);
  if(selected===null)select(state.order.find(id=>!state.placed.includes(id)));
  clearHint();const target=slots.get(selected);target.classList.add('jigsaw-hint');target.scrollIntoView?.({block:'center',inline:'center',behavior:'smooth'});
  message('Hér gæti búturinn passað. Skoðaðu brúnirnar og snúðu honum ef þarf.');hintTimer=clock?.after?.(()=>{if(!disposed)target.classList.remove('jigsaw-hint');hintTimer=null;},6500);
 }
 const saveOnHide=()=>{persist();if(doc.hidden){finishDrag();pan=null;}};doc.addEventListener('visibilitychange',saveOnHide);cleanup.push(()=>doc.removeEventListener('visibilitychange',saveOnHide));
 let last;try{last=storage?.getItem(LAST_KEY);}catch{}
 const raw=themes.has(last)?read(last):null,restored=raw?restoreJigsawState(raw,last,round):null;
 if(restored?.placed.length)openPicture(last,true);else showPictures();
 return{hint,setPaused(value){paused=Boolean(value);if(paused){finishDrag();pan=null;persist();}},dispose(){if(disposed)return;persist();disposed=true;finishDrag();clearHint();cleanup.forEach(fn=>fn());root.remove();},getState(){return state?structuredClone(state):null;}};
}
