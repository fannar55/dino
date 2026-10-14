const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
/** Coordinates are relative to the centre of the fitted image viewport. */
export function createImageTransform(){
  const state={scale:1,x:0,y:0,width:1,height:1,imageWidth:1,imageHeight:1};
  function bounds(){const fit=Math.min(state.width/state.imageWidth,state.height/state.imageHeight);return{x:Math.max(0,(state.imageWidth*fit*state.scale-state.width)/2),y:Math.max(0,(state.imageHeight*fit*state.scale-state.height)/2)};}
  function constrain(){const b=bounds();state.x=clamp(state.x,-b.x,b.x);state.y=clamp(state.y,-b.y,b.y);}
  return{state,bounds,resize(width,height,imageWidth=state.imageWidth,imageHeight=state.imageHeight){if([width,height,imageWidth,imageHeight].some(v=>!Number.isFinite(v)||v<=0))return;Object.assign(state,{width,height,imageWidth,imageHeight});constrain();},reset(){state.scale=1;state.x=state.y=0;},pan(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;state.x+=dx;state.y+=dy;constrain();},zoom(next,anchor={x:0,y:0}){if(!Number.isFinite(next))return;const scale=clamp(next,1,5),ratio=scale/state.scale;state.x=anchor.x-(anchor.x-state.x)*ratio;state.y=anchor.y-(anchor.y-state.y)*ratio;state.scale=scale;constrain();}};
}
const element=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;};
export function createMuseumImageViewer(host,{images=[],index=0,onClose=()=>{}}={}){
  let entries=Array.isArray(images)?images:[],selected=0,paused=false,disposed=false,loaded=false,pinch=null;
  const cleanups=[],points=new Map(),transform=createImageTransform();
  const root=element('section','museum-image-viewer');root.setAttribute('aria-label','Myndaskoðari safnsins');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  const header=element('header','museum-image-header'),title=element('h2','','Nærmynd'),close=button('← Til baka í bókina',()=>onClose());header.append(title,close);
  const viewport=element('div','museum-image-viewport');viewport.tabIndex=0;viewport.setAttribute('role','group');viewport.setAttribute('aria-label','Stækkaðu með tveimur fingrum. Dragðu til að skoða myndina.');
  const picture=element('img','museum-zoom-image');picture.draggable=false;picture.decoding='async';
  const status=element('p','museum-image-status','Myndin er að koma…');status.setAttribute('role','status');viewport.append(picture,status);
  const tools=element('div','museum-image-tools'),previous=button('← Fyrri',()=>show(selected-1)),next=button('Næsta →',()=>show(selected+1));
  const smaller=button('−',()=>zoom(transform.state.scale/1.4)),larger=button('+',()=>zoom(transform.state.scale*1.4)),reset=button('Sýna allt',()=>{transform.reset();paint();});smaller.setAttribute('aria-label','Minnka mynd');larger.setAttribute('aria-label','Stækka mynd');reset.setAttribute('aria-label','Sýna alla myndina');previous.setAttribute('aria-label','Fyrri mynd');next.setAttribute('aria-label','Næsta mynd');
  const count=element('span','museum-image-count');count.setAttribute('aria-live','polite');tools.append(previous,smaller,reset,larger,next,count);
  const caption=element('p','museum-image-caption'),credits=element('details','museum-image-credits'),summary=element('summary','','Um myndina'),credit=element('p');credits.append(summary,credit);
  root.append(header,viewport,tools,caption,credits);host.append(root);
  function listen(target,name,fn,options){target.addEventListener(name,fn,options);cleanups.push(()=>target.removeEventListener(name,fn,options));}
  function blocked(){return disposed||paused||document.hidden;}
  function button(text,fn){const b=element('button','',text);b.type='button';b.addEventListener('click',()=>{if(!blocked())fn();});return b;}
  function paint(){const s=transform.state;picture.style.transform=`translate3d(${s.x}px,${s.y}px,0) scale(${s.scale})`;smaller.disabled=!loaded||s.scale<=1;larger.disabled=!loaded||s.scale>=5;reset.disabled=!loaded;viewport.setAttribute('aria-description',`Stækkun ${Math.round(s.scale*100)} prósent`);}
  function resize(){const rect=viewport.getBoundingClientRect();transform.resize(Math.max(1,rect.width),Math.max(1,rect.height),picture.naturalWidth||1,picture.naturalHeight||1);paint();}
  function zoom(value,point={x:0,y:0}){if(!loaded||blocked())return;transform.zoom(value,point);paint();}
  function clearGesture(){points.clear();pinch=null;}
  function local(event){const box=viewport.getBoundingClientRect();return{x:event.clientX-box.left-box.width/2,y:event.clientY-box.top-box.height/2};}
  function span(){const p=[...points.values()];return p.length===2?{distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}:null;}
  function show(value){if(disposed)return;if(!entries.length){loaded=false;picture.hidden=true;picture.removeAttribute('src');status.hidden=false;status.textContent='Engin mynd er á þessari síðu enn.';caption.textContent=credit.textContent=count.textContent='';previous.hidden=next.hidden=credits.hidden=true;paint();return;}selected=clamp(Math.trunc(value)||0,0,entries.length-1);const entry=entries[selected];clearGesture();transform.reset();loaded=false;status.hidden=false;status.textContent='Myndin er að koma…';picture.hidden=true;title.textContent=entry.title||'Skoðum myndina';picture.alt=entry.alt||entry.imageAlt||entry.caption||'';caption.textContent=entry.caption||entry.alt||'';credit.textContent=[entry.credit,entry.license,entry.licenseUrl,entry.source].filter(Boolean).join(' · ');credits.hidden=!credit.textContent;credits.open=false;count.textContent=`${selected+1} af ${entries.length}`;previous.hidden=next.hidden=entries.length<2;previous.disabled=selected===0;next.disabled=selected===entries.length-1;
    try{const url=new URL(entry.src,import.meta.url);if(url.origin!==new URL(import.meta.url).origin||!['http:','https:','file:'].includes(url.protocol))throw Error('Local image required');picture.src=url.href;}catch{picture.removeAttribute('src');status.textContent='Myndin náði ekki að opnast.';}paint();
  }
  listen(picture,'load',()=>{if(disposed)return;loaded=true;picture.hidden=false;status.hidden=true;resize();});
  listen(picture,'error',()=>{if(disposed)return;loaded=false;picture.hidden=true;status.hidden=false;status.textContent='Myndin náði ekki að opnast. Prófaðu næstu mynd.';paint();});
  listen(viewport,'pointerdown',event=>{if(blocked()||!loaded||points.size>=2)return;event.preventDefault();viewport.focus({preventScroll:true});points.set(event.pointerId,local(event));pinch=span();viewport.setPointerCapture?.(event.pointerId);});
  listen(viewport,'pointermove',event=>{if(blocked()||!points.has(event.pointerId))return;event.preventDefault();const point=local(event),previousPoint=points.get(event.pointerId);points.set(event.pointerId,point);if(points.size===2){const nextSpan=span();if(pinch&&pinch.distance>4&&nextSpan.distance>4){transform.zoom(transform.state.scale*nextSpan.distance/pinch.distance,pinch);transform.pan(nextSpan.x-pinch.x,nextSpan.y-pinch.y);}pinch=nextSpan;}else transform.pan(point.x-previousPoint.x,point.y-previousPoint.y);paint();});
  for(const name of['pointerup','pointercancel','lostpointercapture'])listen(viewport,name,event=>{points.delete(event.pointerId);pinch=span();});
  listen(viewport,'wheel',event=>{if(blocked()||!loaded)return;event.preventDefault();zoom(transform.state.scale*Math.exp(clamp(-event.deltaY*.002,-.6,.6)),local(event));},{passive:false});
  listen(root,'keydown',event=>{if(blocked())return;let handled=true;switch(event.key){case'Tab':{const targets=[...root.querySelectorAll('button,summary,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&!n.closest('[hidden]'));const at=targets.indexOf(document.activeElement);targets[(at+(event.shiftKey?-1:1)+targets.length)%targets.length]?.focus?.();break;}case'Escape':onClose();break;case'+':case'=':zoom(transform.state.scale*1.25);break;case'-':zoom(transform.state.scale/1.25);break;case'Home':transform.reset();paint();break;case'ArrowLeft':transform.pan(45,0);paint();break;case'ArrowRight':transform.pan(-45,0);paint();break;case'ArrowUp':transform.pan(0,45);paint();break;case'ArrowDown':transform.pan(0,-45);paint();break;default:handled=false;}if(handled){event.preventDefault();event.stopPropagation();}});
  listen(document,'visibilitychange',clearGesture);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(viewport);show(index);close.focus?.({preventScroll:true});
  return{show,setImages(value,next=0){entries=Array.isArray(value)?value:[];show(next);},setPaused(value){paused=Boolean(value);clearGesture();},dispose(){if(disposed)return;disposed=true;observer?.disconnect();clearGesture();cleanups.forEach(fn=>fn());picture.removeAttribute('src');root.remove();},getDebugInfo(){return{index:selected,loaded,paused,disposed,...transform.state};}};
}
