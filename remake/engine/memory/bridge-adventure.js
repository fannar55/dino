import * as THREE from 'three';
import { BRIDGE, RIVER, createBridgeProps } from './bridge-props.js';
import { MARSH, WALKWAY, STAGING, DESTINATION, createBuildProps } from './build-props.js';
import { canDepart, sampleTravel } from './travel-traffic.js';
import { GESTURES, FAIL_GESTURES } from './gestures.js';

const Y=new THREE.Vector3(0,1,0),HELPERS=['triceratops','brontosaurus','stegosaurus'];
const HOLD_CROWNS=[[-7.15,-4.4],[-5.35,-3.3]],HOLD_YAW=.6;
const TRI_CONTACTS=[.1,1.7];
// Where the Þríhyrnur step back to once the log is a bridge, side by side on the glade's side of its near end and
// clear of the way onto it (Mosi comes past them), turned to the glade (the search camera's side) to cheer.
const TRI_WAIT=[[.1,-.3],[1.25,-1.45]],TRI_WAIT_YAW=-1.05;
// Park helpers outside the two working lanes; Stego wait already astride the
// bark supply, so neither companion must walk through the other's pickup spot.
const SUPPLY_STAND=[9.05,-15.6];
const FINAL_PARKING=[[-.8,-25.3],[2.8,-25.7],[.3,-28.3],[4,-28.5],[8,-25.3],[8,-28]];
// The crossing: one file over the log behind Mosi, every friend at one trot (metres a second), each a body
// length and `gap` behind the one ahead; a long neck may reach `reach` over the low tail in front. They cross
// in this order (the builders first, the long necks last) and stand in pairs just past the far end.
// Where each one stops (by member: Þríhyrnur, Þórseðlur, Kambeðlur), clear of the bark's lanes, all turned to
// watch the bridge's far end; the Kambeðlur nearest the bark. Mosi walks in first and stands furthest in.
const CROSS={speed:3.2,gap:.35,reach:.9,order:[0,1,4,5,2,3],face:[5.4,-8.6],leader:[8.1,-12]};
const CROSS_PARKING=[[6.4,-13.5],[4.5,-13.3],[2.3,-12],[6.9,-10.1],[9.7,-13.2],[10.3,-11.1]];
const TIMES={approach:1.8,reach:.45,lift:.95,brace:.4,roll:2.4,settle:.8,release:.65,return:1.6,pickup:.55,place:1.65};
const CALM={approach:.5,reach:.15,lift:.3,brace:.15,roll:.7,settle:.2,release:.2,return:.5,pickup:.2,place:.65};
const smooth=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t)};
// A wrong friend's try: where the pair stands to have a go at each obstacle (centre, facing yaw, the two
// members this far apart across it) and how it gets there and back: straight hops, lifted over closed leaves.
const FAIL_SPOTS={branch:{centre:[-2.9,-1.75],yaw:1.1,apart:1.5},bark:{centre:[5.1,-15.6],yaw:0,apart:2.1}};
const FAIL_HOP={reach:2.4,speed:5.6,arc:.2,min:.6,max:1.6};
// The authored nose landmark sits behind the leading beak skin in a push.
export const logPushOffset=vertical=>-Math.sqrt(Math.max(.1,BRIDGE.radius**2-vertical**2))-.145;

export function createBridgeAdventure({scene,heightAt,nests,fx,planWalk,cancelWalk,onwardTravel=false,hopOver=()=>0}){
  const props=createBridgeProps({scene,heightAt}),build=createBuildProps({scene,heightAt});
  const pairs=Object.fromEntries(HELPERS.map(species=>[species,{members:[],ready:false}]));
  let snapshot={unlocked:[],selected:null},action=null,held=false,built=false,atStaging=false,boardwalkBuilt=false,visited=false;
  let lift=0,roll=0,reducedMotion=false,time=0,carryYaw=Math.PI;
  const events=[],ground=(x,z,rise=.04)=>new THREE.Vector3(x,heightAt(x,z)+rise,z);
  const feetCache=new WeakMap(),parkedWork=new Set(),riverArrivals=new Set(),finalArrivals=new Set();
  const trafficStats={checks:0,deferred:0,maxCheckMs:0};
  const burst=(kind,point)=>fx?.emit&&kind!=='ripple'?fx.emit(kind,point,{count:kind==='dust'?14:9,domain:'action'}):build.burst(kind,point);
  const pairActors=species=>pairs[species]?.members??[],allActors=()=>HELPERS.flatMap(pairActors),allReady=()=>HELPERS.every(s=>pairs[s].ready);
  const timing=()=>reducedMotion?CALM:TIMES;
  const homePoint=(species,member)=>{const nest=nests.find(n=>n.species===species);return nest?nest.root.position.clone().add(nest.restOffsets?.[member]??new THREE.Vector3((member?1:-1)*(species==='triceratops'?1.1:1),.04,.02)):ground(-.8,-.4)};
  const homeYaw=species=>nests.find(n=>n.species===species)?.restYaw??-Math.PI*.39;
  function route(points){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+points[i].distanceTo(points[i-1]));return{points,lengths,total:lengths.at(-1)}}
  const sample=sampleTravel;
  function logSurface(x,z){const dx=x-BRIDGE.near[0],dz=z-BRIDGE.near[1],s=dx*BRIDGE.axis[0]+dz*BRIDGE.axis[1],side=-dx*BRIDGE.axis[1]+dz*BRIDGE.axis[0];return Math.abs(side)<1.45&&s>=-1.7&&s<=BRIDGE.length+1.7?props.deckPoint(s).y-.04:null}
  function applyDeckPitch(actor){
    const root=actor.root,dx=root.position.x-BRIDGE.near[0],dz=root.position.z-BRIDGE.near[1],s=dx*BRIDGE.axis[0]+dz*BRIDGE.axis[1],side=-dx*BRIDGE.axis[1]+dz*BRIDGE.axis[0];
    if(action?.id!=='cross'||Math.abs(side)>1.1||s< -2.5||s>BRIDGE.length+2.5){root.rotation.z=0;return;}
    const forward=new THREE.Vector3(Math.cos(root.rotation.y),0,-Math.sin(root.rotation.y)),a=root.position.clone().addScaledVector(forward,-.75),b=root.position.clone().addScaledVector(forward,.75);
    const low=logSurface(a.x,a.z)??heightAt(a.x,a.z),high=logSurface(b.x,b.z)??heightAt(b.x,b.z);
    root.rotation.z=Math.atan2(high-low,1.5);
  }
  function follow(actor,travel,progress,dt,finalYaw=-Math.PI/3){const p=sample(travel,progress);actor.root.position.copy(p.point);const wanted=progress>.97?finalYaw:p.yaw,d=Math.atan2(Math.sin(wanted-actor.root.rotation.y),Math.cos(wanted-actor.root.rotation.y));actor.root.rotation.y+=d*(1-Math.exp(-dt/.09));applyDeckPitch(actor)}
  function holdPoint(actor,member){const marker=actor.supportLocal.clone().multiply(actor.root.scale).applyAxisAngle(Y,HOLD_YAW);return ground(HOLD_CROWNS[member][0]-marker.x,HOLD_CROWNS[member][1]-marker.z)}
  function triPose(member){const actor=pairActors('triceratops')[member],yaw=props.pivot.rotation.y-Math.PI/2+(member?-.65:.65),contact=props.logContact(TRI_CONTACTS[member],-1.1),nose=actor.noseLocal.clone().multiply(actor.root.scale).applyAxisAngle(Y,yaw),point=contact.clone().sub(nose);point.y=heightAt(point.x,point.z)+.04;return{point,yaw}}
  // The two Þríhyrnur at their places against the log as it turns (bracing: still where they stopped), heads turned `blend` of the way in.
  function pushPose(blend){pairActors('triceratops').forEach((actor,member)=>{const pose=triPose(member);actor.root.position.copy(action.phase==='brace'?action.contactStarts[member]:pose.point);actor.root.rotation.y=pose.yaw;actor.setPushYaw?.((member?.65:-.65)*blend)})}
  function correctTriContact(blend=1){pairActors('triceratops').forEach((actor,member)=>{actor.root.updateMatrixWorld(true);const actual=actor.getNosePosition(),vertical=THREE.MathUtils.clamp(actual.y-props.pivot.position.y,-.8,.8),target=props.logContact(TRI_CONTACTS[member],logPushOffset(vertical));actor.root.position.x+=(target.x-actual.x)*blend;actor.root.position.z+=(target.z-actual.z)*blend;actor.root.position.y=heightAt(actor.root.position.x,actor.root.position.z)+.04})}
  function beginTravel(member=0){
    member=action.phase==='approach'&&action.id==='roll'||action.phase==='return'&&action.species==='brontosaurus'?1-member:member;
    const actor=pairActors(action.species)[member],returning=action.phase==='return',goal=returning?{point:homePoint(action.species,member),yaw:homeYaw(action.species)}:action.id==='lift'?{point:holdPoint(actor,member),yaw:HOLD_YAW}:triPose(member);
    if(!returning){
      goal.point.add(new THREE.Vector3(action.id==='lift'?-.55*(actor.lengthFactor??1):-.4,0,0).applyAxisAngle(Y,goal.yaw));
      // Wait south of the held branch, then lower the head during the brace.
      if(action.id==='roll'){goal.point.z+=.35;goal.point.y=heightAt(goal.point.x,goal.point.z)+.04;}
    }
    actor.clearLook?.();if(returning&&actor.species==='brontosaurus'&&!built)actor.reach?.({duration:.1});else{actor.clearSupport?.();actor.walk?.(false)}
    action.pending={actor,member,goal,age:0,kind:'pair'};
  }
  function routeFailed(reason){
    if(action.pending)cancelWalk?.(action.pending.actor);
    const id=action.id;for(const actor of allActors()){actor.walk?.(false);parkedWork.add(actor.species);}
    if(action.phase==='return'&&(id==='roll'||id==='lower')){complete();return;}
    action=null;events.push({type:'bridge-blocked',id,reason,branch:held?'held':'down'});
  }
  function acceptTravel(points,pending){
    if(points.length===1)points.push(points[0].clone());
    const speed=reducedMotion?5.6:action.id==='cross'?CROSS.speed:pending.kind==='cross'?2.8:2.5,travel=route(points),duration=Math.max(reducedMotion?.25:.45,travel.total/speed)+.3;
    const ready={actor:pending.actor,member:pending.member,route:travel,duration,finalYaw:pending.finalYaw??pending.goal.yaw,age:0,waiting:0,retry:0,started:false,reservation:'timed-route',request:pending,arrivalRevision:action.routes.filter(t=>t.finished).length};
    action.pending=null;
    if(action.id!=='cross'){action.readyTravel=ready;return;}
    // The crossing keeps to a timetable instead of waiting for clear headway: each friend reaches the near
    // end of the deck one body length and a gap behind the one ahead (Mosi first) and leaves home in time for that.
    const pace=travel.total/(duration-.3),approach=travel.lengths[Math.min(pending.entry??0,travel.lengths.length-1)],half=1.3*(pending.actor.lengthFactor??1);
    const slot=action.lastEntry+(action.lastHalf+half+CROSS.gap-((pending.actor.lengthFactor??1)>1.3?CROSS.reach:0))/pace,entry=Math.max(slot,action.age+approach/pace);
    ready.departAt=entry-approach/pace;action.lastEntry=entry;action.lastHalf=half;action.queue.push(ready);
  }
  function stopQueue(reason){
    if(action.pending)cancelWalk?.(action.pending.actor);
    action.pending=null;action.readyTravel=null;action.abortReason=reason;if(action.queue)action.queue.length=0;
  }
  function pollRoute(dt){
    const pending=action.pending;pending.age+=dt;
    if(pending.age>12){stopQueue('planning-timeout');return;}
    pending.plannedAround??=action.routes.filter(t=>t.finished).map(t=>t.actor);
    const planned=planWalk?.(pending.actor,pending.goal.point,{yaw:pending.goal.yaw});
    if(planned===undefined)return;
    if(!planned?.length){stopQueue('no-clear-route');return;}
    if(pending.kind==='cross'){pending.entry=planned.length;finishCrossRoute(planned,pending.member)}
    acceptTravel(planned,pending);
  }
  function setState(value){snapshot={...value,unlocked:[...(value.unlocked??[])]}}
  function bindPair(species,members){if(!pairs[species]||pairs[species].ready||members.length!==2)return;pairs[species]={members,ready:true}}
  /**
   * Start a task. With `beats` the lift and the roll wait at each step for beat() (a tap of the child), emitting
   * beat-wait. The branch can be put down (lower) once the bridge is built, the friends no longer needed to hold it.
   * The crossing's `lead` is the one who walks in front (Mosi, moved by the world): when, in seconds from now, his
   * middle passes the near end of the deck, and his half length; the friends follow him on the timetable.
   */
  function start(id,{beats=0,lead=null}={}){
    if(action||visited)return false;
    const allowed={lift:pairs.brontosaurus.ready&&!held&&!built&&!atStaging&&snapshot.selected==='brontosaurus',lower:held&&!atStaging&&(built||snapshot.selected==='brontosaurus'),roll:pairs.triceratops.ready&&held&&!built&&snapshot.selected==='triceratops',cross:built&&!atStaging&&allReady(),lay:atStaging&&!boardwalkBuilt&&allReady()&&snapshot.selected==='stegosaurus',finish:atStaging&&boardwalkBuilt&&allReady()};
    if(!allowed[id])return false;
    const species=id==='roll'?'triceratops':id==='lay'?'stegosaurus':'brontosaurus';
    action={id,species,phase:'',age:0,elapsed:0,routes:[],crossed:[],startLift:lift,panel:0,duration:0,beats:id==='lift'||id==='roll'?Math.max(0,Math.floor(beats)||0):0,beatsGiven:0,beatIndex:0,
      queue:[],lastEntry:Math.max(0,Number(lead?.at)||0),lastHalf:lead?Math.max(0,Number(lead.half)||0):-1.3-CROSS.gap};
    if(id==='lay'){buildPhase('collect');return true}if(id==='finish'){phase('finish');return true}if(id==='cross'&&!held){phase('cross');return true}
    if(id==='lower'||id==='cross'){phase('release');pairActors('brontosaurus').forEach(a=>a.release?.({duration:timing().release}));events.push({type:'branch-lower'});return true}
    phase('approach');return true;
  }
  /** One beat of the child's tap-along: the next step of the lift or the roll (queued if the last one is still moving). */
  function beat(){if(!action?.beats||action.beatsGiven>=action.beats)return false;action.beatsGiven++;return true}
  // The wrong pair has a go: hops to the obstacle, its species' funny failure, hops back to where it stood.
  function failSpots(species,target){
    const actors=pairActors(species);
    if(target==='log'){const yaw=props.pivot.rotation.y-Math.PI/2;return actors.map((actor,member)=>{const p=props.logContact(TRI_CONTACTS[member],-2.3);return{point:ground(p.x,p.z),yaw}})}
    const spot=FAIL_SPOTS[target];if(!spot)return null;
    const across=new THREE.Vector3(Math.sin(spot.yaw),0,Math.cos(spot.yaw));
    return actors.map((actor,member)=>{const p=new THREE.Vector3(spot.centre[0],0,spot.centre[1]).addScaledVector(across,(member?.5:-.5)*spot.apart*(actor.lengthFactor??1));return{point:ground(p.x,p.z),yaw:spot.yaw}});
  }
  /** A wrong friend's go at `target` (fail-bump when it lands, fail-done when the pair is back). Returns its timing in seconds. */
  function startFail(species,target){
    if(action||visited||!pairs[species]?.ready||!FAIL_GESTURES[species])return null;
    const spots=failSpots(species,target);if(!spots)return null;
    const actors=pairActors(species),hops=actors.map((actor,member)=>{const from=actor.root.position.clone(),to=spots[member].point,distance=Math.hypot(to.x-from.x,to.z-from.z);
      return{actor,from,fromYaw:actor.root.rotation.y,to,yaw:spots[member].yaw,count:Math.max(2,Math.round(distance/FAIL_HOP.reach)),duration:THREE.MathUtils.clamp(distance/FAIL_HOP.speed,FAIL_HOP.min,FAIL_HOP.max),hop:-1}});
    const run=Math.max(...hops.map(h=>h.duration)),attempt=GESTURES[FAIL_GESTURES[species]].duration;
    action={id:'fail',species,target,phase:'run',age:0,elapsed:0,duration:run,routes:[],crossed:[],hops,fired:new Set()};
    actors.forEach(a=>{a.clearLook?.();a.clearSupport?.();a.walk?.(false)});
    return{run,attempt,back:run,total:run*2+attempt,yaw:spots[0].yaw};
  }
  function hopAlong(h,t,back){
    const actor=h.actor,from=back?h.to:h.from,to=back?h.from:h.to,run=Math.min(1,t),phase=h.count*run,hop=Math.min(h.count-1,Math.floor(phase));
    if(hop!==h.hop){if(h.hop>=0){fx?.emit?.('poof',actor.root.position,{count:3,ring:.3});events.push({type:'footstep',surface:'soil',pan:0})}h.hop=hop;actor.gesture?.('hop')}
    const x=THREE.MathUtils.lerp(from.x,to.x,run),z=THREE.MathUtils.lerp(from.z,to.z,run);
    actor.root.position.set(x,heightAt(x,z)+.04+(run<1?FAIL_HOP.arc*Math.sin(Math.PI*(phase-hop)):0),z);actor.root.position.y+=hopOver(actor.root.position);
    const travel=Math.atan2(-(to.z-from.z),to.x-from.x),wanted=run>.75?(back?h.fromYaw:h.yaw):travel,d=Math.atan2(Math.sin(wanted-actor.root.rotation.y),Math.cos(wanted-actor.root.rotation.y));
    actor.root.rotation.y+=d*(reducedMotion?1:Math.min(1,.25+run*.3));
  }
  function updateFail(){
    const p=Math.min(1,action.age/Math.max(.01,action.duration)),fire=(key,at,fn)=>{if(p>=at&&!action.fired.has(key)){action.fired.add(key);fn()}};
    if(action.phase==='run'||action.phase==='back'){action.hops.forEach(h=>hopAlong(h,action.age/h.duration,action.phase==='back'));
      if(action.age>=action.duration){
        action.hops.forEach(h=>{h.hop=-1;h.actor.root.position.copy(action.phase==='back'?h.from:h.to);h.actor.root.rotation.y=action.phase==='back'?h.fromYaw:h.yaw});
        if(action.phase==='back'){const{species,target}=action;action=null;pairActors(species).forEach(a=>a.setMotion?.('idle'));events.push({type:'fail-done',species,target});return}
        action.phase='try';action.age=0;action.duration=GESTURES[FAIL_GESTURES[action.species]].duration;
        action.hops.forEach(h=>h.actor.gesture?.(FAIL_GESTURES[action.species]));
      }
      return;
    }
    // The try: the moment each species' failure lands gets its puff, its stars or its dust.
    const heads=()=>action.hops.map(h=>h.actor.getNosePosition?.()??h.actor.root.position.clone().add(new THREE.Vector3(0,1,0)));
    if(action.species==='triceratops')fire('bump',.31,()=>{action.hops.forEach(h=>fx?.emit?.('poof',h.actor.root.position,{count:8,ring:.4}));events.push({type:'fail-bump',species:action.species})});
    if(action.species==='stegosaurus')fire('roll',.42,()=>{action.hops.forEach(h=>burst('dust',h.actor.root.position));events.push({type:'fail-bump',species:action.species})});
    if(action.species==='brontosaurus'){fire('stars',.06,()=>heads().forEach(p=>fx?.emit?.('stars',p,{count:8})));fire('stars2',.45,()=>heads().forEach(p=>fx?.emit?.('stars',p,{count:6})))}
    if(action.age>=action.duration){action.phase='back';action.age=0;action.duration=Math.max(...action.hops.map(h=>h.duration))}
  }
  // Over the log from just before its near end, a step on past the far end, then to `spot`.
  function deckRoute(points,spot,from=-2.6){
    for(let s=from;s<BRIDGE.length+1.7;s+=.4)points.push(props.deckPoint(s));points.push(props.deckPoint(BRIDGE.length+1.7),props.deckPoint(BRIDGE.length+2.5),ground(...spot));
    return points;
  }
  const facing=([x,z])=>Math.atan2(-(CROSS.face[1]-z),CROSS.face[0]-x);
  function finishCrossRoute(points,member){return deckRoute(points,CROSS_PARKING[member])}
  /** The far end of the log when it has rolled `progress` of the way (0 lying along the bank, 1 a bridge); its near end is the pivot. */
  function logEnd(progress=roll){const yaw=THREE.MathUtils.lerp(props.initialYaw,props.finalYaw,progress);return props.pivot.position.clone().add(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)).multiplyScalar(BRIDGE.length))}
  /** Mosi's way over, from `from` (his place in the glade): round to the near end of the deck and over it, to his place at staging. */
  function leaderRoute(from){
    const points=deckRoute([from.clone(),ground(.6,1.8),ground(-1.5,.4),ground(-2.4,-.9)],CROSS.leader,-2.2),deck=props.deckPoint(-2.6);
    return{points,yaw:facing(CROSS.leader),entry:points.findIndex(p=>(p.x-deck.x)*BRIDGE.axis[0]+(p.z-deck.z)*BRIDGE.axis[1]>=0),deckStart:points.findIndex(p=>(p.x-BRIDGE.near[0])*BRIDGE.axis[0]+(p.z-BRIDGE.near[1])*BRIDGE.axis[1]>=-1.7)};
  }
  function beginCrossTravel(index=0){
    // Fill the farther Stego bay first; its approach passes the nearer bay.
    const final=action.id==='finish',order=action.crossOrder;
    if(!order.length){complete();return;}
    const member=order[index],actor=allActors()[member];
    actor.clearSupport?.();actor.clearLook?.();actor.walk?.(false);
    const yaw=!final?facing(CROSS_PARKING[member]):actor.species==='brontosaurus'?-.2:actor.species==='stegosaurus'?-Math.PI*.37:-Math.PI/2;
    // A larger friend waits further back, so her head stays off the log while she lines up.
    if(!final){action.pending={actor,member,goal:{point:props.deckPoint(-3-1.6*((actor.lengthFactor??1)-1)),yaw:props.finalYaw},finalYaw:yaw,age:0,kind:'cross'};return;}
    const end=ground(...FINAL_PARKING[member]),points=[actor.root.position.clone(),ground(4.5,actor.root.position.z),build.deckPoint(-16.65)];
    for(let z=-17;z>-22.35;z-=.35)points.push(build.deckPoint(z));points.push(build.deckPoint(-22.35));
    if(actor.species==='triceratops'&&member===0)points.push(ground(end.x,-22.6));else points.push(ground(4.5,-23.1));
    if(actor.species==='brontosaurus')points.push(ground(5.7,-30),ground(end.x,-30));
    if(actor.species==='stegosaurus')points.push(ground(9.6,-23.1),ground(9.6,end.z));
    points.push(end);acceptTravel(points,{actor,member,goal:{yaw},kind:'cross'});
  }
  function startTravelGroup(){
    action.routes=[];action.pending=null;action.readyTravel=null;action.nextIndex=0;action.lastDepartureAt=-1;action.abortReason=null;
    const crossing=action.phase==='cross'||action.phase==='finish';
    if(crossing)action.crossOrder=action.id==='finish'?[2,3,1,0,5,4].filter(member=>!finalArrivals.has(member)):CROSS.order.filter(member=>!riverArrivals.has(member));
    // Retry keeps already-arrived friends solid even though their old travel
    // records belonged to the interrupted action.
    action.arrivalReservations=crossing?[...(action.id==='finish'?finalArrivals:riverArrivals)].map(member=>{
      const actor=allActors()[member],point=actor.root.position.clone();
      return{actor,member,route:route([point,point.clone()]),duration:.3,age:.3,finished:true,finalYaw:actor.root.rotation.y};
    }):[];
    action.travelCount=crossing?action.crossOrder.length:2;
    if(!action.travelCount){complete();return;}
    if(action.id==='cross')beginCrossTravel(action.nextIndex++);else if(crossing)beginCrossTravel();else beginTravel();
  }
  function updateTravelGroup(dt){
    const crossing=action.phase==='cross'||action.phase==='finish';
    // Planning and waiting for headway never stop friends already on the route.
    for(const t of action.routes){
      if(t.finished)continue;
      t.age=Math.min(t.duration,t.age+dt);follow(t.actor,t.route,Math.min(1,t.age/Math.max(.01,t.duration-.3)),dt,t.finalYaw);
      if(t.age>=t.duration){
        t.finished=true;t.finishedAt=action.age;t.actor.walk?.(false);t.actor.root.rotation.y=t.finalYaw;
        if(crossing){action.crossed.push(t.member);(action.id==='cross'?riverArrivals:finalArrivals).add(t.member);}
      }
    }
    if(action.abortReason){if(action.routes.every(t=>t.finished))routeFailed(action.abortReason);return;}
    if(action.pending)pollRoute(dt);
    if(action.abortReason)return;
    if(action.id==='cross'){
      // The timetable: each planned friend sets off when its time comes; the next one is planned at once.
      for(const t of action.queue.filter(t=>action.age>=t.departAt)){
        action.queue.splice(action.queue.indexOf(t),1);t.started=true;t.startedAt=t.delay=action.age;action.routes.push(t);action.duration=Math.max(action.duration,action.age+t.duration);t.actor.walk?.(true);
      }
      if(!action.pending&&action.nextIndex<action.travelCount)beginCrossTravel(action.nextIndex++);
      if(action.nextIndex===action.travelCount&&!action.pending&&!action.queue.length&&action.routes.every(t=>t.finished))complete();
      return;
    }
    const t=action.readyTravel;
    if(t){
      t.waiting+=dt;t.retry-=dt;
      if(t.retry<=0){
        t.retry=.18;
        // The full pair route was already checked against these parked actors
        // by the spatial planner. Only moving reservations need a second check.
        // Crossings retain all checks because their far-bank paths are authored.
        const reservations=[...action.routes,...action.arrivalReservations].filter(other=>!(t.request.kind==='pair'&&other.finished&&t.request.plannedAround?.includes(other.actor)));
        const checkStarted=performance.now(),clear=canDepart(t,reservations,detail=>{trafficStats.lastBlocked={...detail,id:action.id,phase:action.phase,age:action.age}});trafficStats.checks++;trafficStats.maxCheckMs=Math.max(trafficStats.maxCheckMs,performance.now()-checkStarted);if(!clear)trafficStats.deferred++;
        if(clear){
          t.started=true;t.startedAt=action.age;t.delay=action.age;action.routes.push(t);action.readyTravel=null;action.nextIndex++;action.lastDepartureAt=action.age;
          action.duration=Math.max(action.duration,action.age+t.duration);
          if(t.actor.species==='brontosaurus'&&action.phase==='return'&&!built)t.actor.reachWalk?.({duration:.1});else t.actor.walk?.(true);
        }else if(t.request.goal.point&&t.waiting>.5&&action.routes.filter(route=>route.finished).length>t.arrivalRevision){
          // A newly parked leader may need to be routed around. Its endpoint
          // now belongs to the spatial planner instead of the moving convoy.
          action.pending={...t.request,age:0,plannedAround:undefined};action.readyTravel=null;
        }else if(t.waiting>12&&action.routes.every(route=>route.finished))stopQueue('no-clear-headway');
      }
    }
    if(action.abortReason)return;
    if(!action.pending&&!action.readyTravel&&action.nextIndex<action.travelCount&&action.age-action.lastDepartureAt>=.3){
      if(crossing)beginCrossTravel(action.nextIndex);else beginTravel(action.nextIndex);
    }
    if(action.nextIndex===action.travelCount&&action.routes.every(t=>t.finished)){
      if(action.phase==='approach')phase(action.id==='lift'?'reach':'brace');else complete();
    }
  }
  function phase(next){
    action.phase=next;action.age=0;action.duration=timing()[next]||0;
    if(next==='reach')pairActors('brontosaurus').forEach(a=>{a.walk?.(false);a.reach?.({duration:timing().reach})});
    if(next==='contact'){action.contactStarts=pairActors('brontosaurus').map(a=>a.root.position.clone());action.duration=reducedMotion?.25:.65;pairActors('brontosaurus').forEach(a=>a.reachWalk?.({duration:.1}))}
    if(next==='withdraw'){action.contactStarts=pairActors('brontosaurus').map(a=>a.root.position.clone());action.duration=reducedMotion?.25:.65;pairActors('brontosaurus').forEach(a=>a.reachWalk?.({duration:.1}))}
    if(next==='lift'){pairActors('brontosaurus').forEach(a=>a.lift?.({duration:timing().lift}));events.push({type:'branch-lift'});burst('leaves',pairActors('brontosaurus').reduce((p,a)=>p.add(a.getSupportPosition()),new THREE.Vector3()).multiplyScalar(.5))}
    if(next==='beat-wait'){action.duration=Infinity;events.push({type:'beat-wait',id:action.id,index:action.beatIndex})}
    if(next==='beat-lift'){
      // One step of the lift (a third, for three beats): the necks push, both strain, dust at their feet, leaves fall.
      const index=action.beatIndex,brontos=pairActors('brontosaurus');action.duration=timing().lift*.6;action.liftFrom=index/action.beats;action.liftTo=(index+1)/action.beats;
      brontos.forEach(a=>{a.lift?.({duration:action.duration,amount:action.liftTo});a.gesture?.('strain');burst('dust',a.root.position)});
      burst('leaves',brontos.reduce((p,a)=>p.add(a.getSupportPosition()),new THREE.Vector3()).multiplyScalar(.5).add(new THREE.Vector3(0,.4,0)));
      if(!index)events.push({type:'branch-lift'});events.push({type:'beat',id:action.id,index});
    }
    if(next==='beat-roll'){
      // One push of the roll (a third, for three beats): both strain against the log, dust at their feet, the log turns that far.
      const index=action.beatIndex;action.duration=timing().roll*.32;action.rollFrom=index/action.beats;action.rollTo=(index+1)/action.beats;
      pairActors('triceratops').forEach(a=>{a.setMotion('push');a.gesture?.('strain');burst('dust',a.root.position)});
      if(!index)burst('dust',props.pivot.position);events.push({type:'beat',id:action.id,index});
    }
    if(next==='beat-wait'&&action.id==='roll')pairActors('triceratops').forEach(a=>a.setMotion('brace'));
    if(next==='brace'){action.contactStarts=pairActors('triceratops').map(a=>a.root.position.clone());pairActors('triceratops').forEach(a=>{a.walk?.(false);a.setMotion('brace')})}
    if(next==='roll'){pairActors('triceratops').forEach(a=>a.setMotion('push'));events.push({type:'log-roll'});burst('dust',props.pivot.position)}
    if(next==='settle'){built=true;roll=1;props.setLog(1);correctTriContact();action.contactStarts=pairActors('triceratops').map(a=>a.root.position.clone());action.settleYaw=pairActors('triceratops').map(a=>a.root.rotation.y);pairActors('triceratops').forEach(a=>{a.setPushYaw?.(0);a.walk?.(true)});events.push({type:'bridge-land'});burst('dust',props.deckPoint(0));burst('ripple',new THREE.Vector3(1.5,RIVER.waterY+.02,-6));
      // The log comes down over the river: water thrown up on both sides of it.
      for(const along of [.42,.5,.58])for(const side of [-1,1]){const p=props.pointAlong(along*BRIDGE.length,side*1.15);p.y=RIVER.waterY+.05;fx?.emit?.('splash',p,{count:9})}}
    if(next==='return'){if(action.id==='lower'){held=false;lift=0;if(!built)pairActors('brontosaurus').forEach(a=>a.reach?.({duration:.1}))}if(action.id==='roll')pairActors('triceratops').forEach(a=>{a.setPushYaw?.(0);a.walk?.(false)});startTravelGroup()}
    if(next==='approach')startTravelGroup();
    if(next==='cross'||next==='finish'){held=false;lift=0;startTravelGroup()}
  }
  const carryCentre=()=>pairActors('stegosaurus').reduce((p,a)=>p.add(a.root.position),new THREE.Vector3()).multiplyScalar(.5);
  // Both mouths support the rear edge of the broadside panel. It stays in front
  // of the shoulders and simply slides forward/down into its final orientation.
  function supportedCargo(){return build.carryPose(pairActors('stegosaurus').map(a=>a.getCarrySupportPosition?.()??a.getNosePosition()))}
  function updateSupportedCargo(progress=1){const pose=supportedCargo();if(action.phase==='pickup')pose.point.lerpVectors(action.cargoFrom,pose.point,smooth(progress));build.setCargo(pose.point,pose.quaternion)}
  // Measured feet span ±.344m locally; a2.6m stance fits the3.5m deck.
  const formation=(center,member,yaw)=>center.clone().add(new THREE.Vector3(0,0,member?1.3:-1.3).applyAxisAngle(Y,yaw));
  function buildPhase(next){
    action.phase=next;action.age=0;const actors=pairActors('stegosaurus'),speed=reducedMotion?5.2:2.5;
    if(next==='collect'){carryYaw=Math.PI;const center=ground(...SUPPLY_STAND);action.routes=actors.map((actor,member)=>{actor.clearLook?.();actor.clearSupport?.();actor.walk?.(false);const end=formation(center,member,carryYaw);end.y=heightAt(end.x,end.z)+.04;const travel=route([actor.root.position.clone(),end]),duration=Math.max(.35,travel.total/speed),delay=member*.08;return{actor,member,route:travel,duration,delay}});action.duration=Math.max(...action.routes.map(t=>t.delay+t.duration))}
    if(next==='pickup'){actors.forEach(a=>{a.walk?.(false);a.setMotion('brace')});build.takePanel(action.panel);action.cargoFrom=new THREE.Vector3(7,heightAt(7,-15.6)+.23+(2-action.panel)*.19,-15.6);action.duration=timing().pickup;events.push({type:'bark-pickup',panel:action.panel})}
    if(next==='carry'){actors.forEach(a=>a.walk?.(true));const endZ=-15.75-action.panel*1.5,points=[carryCentre(),ground(4.5,-15.6)];for(let z=-15.85;z>endZ;z-=.25)points.push(build.deckPoint(z));points.push(build.deckPoint(endZ));action.centerRoute=route(points);action.duration=action.centerRoute.total/speed}
    if(next==='place'){actors.forEach(a=>{a.walk?.(false);a.setMotion('brace')});action.cargoFrom=build.cargo.position.clone();action.cargoQuaternion=build.cargo.quaternion.clone();action.duration=timing().place}
    if(next==='align'){actors.forEach(a=>a.walk?.(false));action.fromYaw=carryYaw;action.duration=reducedMotion?.15:.55}
    if(next==='straighten'){actors.forEach(a=>a.walk?.(false));action.fromYaw=carryYaw;action.center=carryCentre();action.duration=reducedMotion?.15:.5}
    if(next==='back'){build.placePanel(action.panel);events.push({type:'bark-place',panel:action.panel});burst('dust',build.panelCenter(action.panel));actors.forEach(a=>a.walk?.(true));const center=carryCentre(),points=[center];for(let z=center.z+.25;z<-15.6;z+=.25)points.push(build.deckPoint(z));points.push(ground(4.5,-15.6),ground(...SUPPLY_STAND));action.centerRoute=route(points);action.duration=action.centerRoute.total/(reducedMotion?5.6:2.8)}
  }
  function updateBuild(progress,dt){
    const actors=pairActors('stegosaurus');
    if(action.phase==='collect')action.routes.forEach(t=>{const p=THREE.MathUtils.clamp((action.age-t.delay)/t.duration,0,1);if(p>0&&!t.started){t.started=true;t.actor.walk?.(true)}if(p>0)follow(t.actor,t.route,p,dt,Math.PI);if(p>=1&&!t.finished){t.finished=true;t.actor.walk?.(false)}});
    if(action.phase==='pickup')updateSupportedCargo(progress);
    if(action.phase==='align'){carryYaw=THREE.MathUtils.lerp(action.fromYaw,Math.PI,smooth(progress));const center=ground(...SUPPLY_STAND);actors.forEach((actor,member)=>{actor.root.position.copy(formation(center,member,carryYaw));actor.root.rotation.y=carryYaw})}
    if(action.phase==='straighten'){carryYaw=THREE.MathUtils.lerp(action.fromYaw,Math.PI/2,smooth(progress));actors.forEach((actor,member)=>{actor.root.position.copy(formation(action.center,member,carryYaw));actor.root.rotation.y=carryYaw});updateSupportedCargo()}
    if(action.phase==='carry'||action.phase==='back'){
      const p=sample(action.centerRoute,progress),backing=action.phase==='back';let wanted=backing&&p.point.z<-16.35?Math.PI/2:p.yaw;if(progress>.94)wanted=backing?Math.PI:Math.PI/2;
      const d=Math.atan2(Math.sin(wanted-carryYaw),Math.cos(wanted-carryYaw));carryYaw+=d*(1-Math.exp(-dt/.16));
      actors.forEach((actor,member)=>{actor.root.position.copy(formation(p.point,member,carryYaw));actor.root.rotation.y=carryYaw});
      if(!backing)updateSupportedCargo();
    }
    if(action.phase==='place'){
      const target=build.panelCenter(action.panel),ahead=target.clone();ahead.y=action.cargoFrom.y;
      const point=progress<.5?action.cargoFrom.clone().lerp(ahead,smooth(progress*2)):ahead.lerp(target,smooth((progress-.5)*2));build.setCargo(point,action.cargoQuaternion.clone().slerp(new THREE.Quaternion(),smooth(progress)));
    }
    if(['pickup','carry','place'].includes(action.phase)){const look=build.cargo.position.clone().add(new THREE.Vector3(1.1,-.195,0).applyAxisAngle(Y,carryYaw));actors.forEach(a=>a.lookAt?.(look,{weight:.3,maxAngle:8}));}
    if(progress>=1){if(action.phase==='collect'||action.phase==='align')buildPhase('pickup');else if(action.phase==='pickup')buildPhase('carry');else if(action.phase==='carry')buildPhase('straighten');else if(action.phase==='straighten')buildPhase('place');else if(action.phase==='place')buildPhase('back');else if(action.panel<2){action.panel++;buildPhase('align')}else{carryYaw=Math.PI;actors.forEach((a,m)=>{a.root.position.copy(formation(ground(...SUPPLY_STAND),m,carryYaw));a.root.rotation.y=carryYaw});complete()}}
  }
  function complete(){
    const id=action.id;if(id==='lift'){held=true;lift=1;pairActors('brontosaurus').forEach(a=>a.hold?.())}if(id==='lower'){held=false;lift=0}
    if(id==='cross'){atStaging=true;events.push({type:'staging-arrival'})}if(id==='lay'){boardwalkBuilt=true;events.push({type:'boardwalk-complete'})}if(id==='finish'){visited=true;build.openDestination();events.push({type:'final-arrival'})}
    if(id!=='lift')for(const t of action.routes){t.actor.walk?.(false);t.actor.setMotion('idle')}
    if(id==='lay')pairActors('stegosaurus').forEach(a=>{a.walk?.(false);a.greet?.()});if(id==='cross'||id==='finish')allActors().forEach(a=>a.species==='triceratops'?a.delight?.():a.greet?.());action=null;events.push({type:'bridge-complete',id});
  }
  function update(dt,externalTime){
    // Camera travel can withhold actor dt while the wider scene clock advances.
    // Keeping this clock on dt prevents resumed dust or ripples from skipping.
    if(dt>0)time+=dt;props.update(time,reducedMotion);build.update(time,reducedMotion);
    if(action&&dt>0){action.age+=dt;action.elapsed+=dt;const p=Math.min(1,action.age/Math.max(.01,action.duration));
      if(action.id==='fail')updateFail();
      else if(action.phase==='beat-wait'){if(action.beatsGiven>action.beatIndex)phase(action.id==='roll'?'beat-roll':'beat-lift')}
      else if(action.phase==='beat-roll'){roll=THREE.MathUtils.lerp(action.rollFrom,action.rollTo,smooth(p));props.setLog(roll);pushPose(1);if(p>=1){action.beatIndex++;phase(action.beatIndex>=action.beats?'settle':'beat-wait')}}
      else if(action.phase==='beat-lift'){lift=THREE.MathUtils.lerp(action.liftFrom,action.liftTo,smooth(p));if(p>=1){action.beatIndex++;if(action.beatIndex>=action.beats)complete();else phase('beat-wait')}}
      else if(action.id==='lay')updateBuild(p,dt);
      else if(['approach','return','cross','finish'].includes(action.phase))updateTravelGroup(dt);
      else{
        if(action.phase==='lift')lift=smooth(p);if(action.phase==='release')lift=action.startLift*(1-smooth(p));
        if(action.phase==='contact')pairActors('brontosaurus').forEach((actor,member)=>{actor.root.position.lerpVectors(action.contactStarts[member],holdPoint(actor,member),smooth(p));actor.root.rotation.y=HOLD_YAW});
        if(action.phase==='withdraw')pairActors('brontosaurus').forEach((actor,member)=>{const end=holdPoint(actor,member).add(new THREE.Vector3(-.55,0,0).applyAxisAngle(Y,HOLD_YAW));end.y=heightAt(end.x,end.z)+.04;actor.root.position.lerpVectors(action.contactStarts[member],end,smooth(p));actor.root.rotation.y=HOLD_YAW});
        if(action.phase==='brace'||action.phase==='roll'){if(action.phase==='roll'){roll=smooth(p);props.setLog(roll)}pushPose(action.phase==='brace'?smooth(p):1)}
        if(action.phase==='settle')pairActors('triceratops').forEach((actor,member)=>{const t=smooth(p),from=action.settleYaw[member];actor.root.position.lerpVectors(action.contactStarts[member],ground(...TRI_WAIT[member]),t);actor.root.rotation.y=from+Math.atan2(Math.sin(TRI_WAIT_YAW-from),Math.cos(TRI_WAIT_YAW-from))*t;if(p>=1)actor.walk?.(false)});
        if(p>=1){
          if(action.phase==='settle'&&onwardTravel){
            // Stay by the bridge they just made: the crossing starts from here (once every friend is found)
            // instead of sending the builders back to their nest.
            parkedWork.add('triceratops');pairActors('triceratops').forEach(a=>a.setPushYaw?.(0));complete();
          }else{const next={reach:'contact',contact:action.beats?'beat-wait':'lift',lift:null,brace:action.beats?'beat-wait':'roll',roll:'settle',settle:'return',release:action.id==='cross'?'cross':built?'return':'withdraw',withdraw:'return'}[action.phase];if(next)phase(next);else complete()}
        }
      }
    }
    // Only the next obstacle sways and glows (its gold ring, its wood warming, now and then a few sparks).
    const next=!action&&!visited?snapshot.next:null,swing=reducedMotion?0:1,beam=.5+.5*Math.sin(time*2.6);
    props.swayBranch(next==='branch'&&!held?.016*swing*Math.sin(time*1.7):0,next==='branch'&&!held?.008*swing*Math.sin(time*1.1+.6):0);
    if(!built&&(!action||action.id==='fail'))props.log.rotation.x=next==='log'?.03*swing*Math.sin(time*2.2):0;
    props.setGlow('branch',next==='branch'?.45+.55*beam:0);props.setGlow('log',next==='log'?.45+.55*beam:0);
    if(next&&dt>0&&Math.floor(time/1.4)!==Math.floor((time-dt)/1.4)){const at=targets().find(t=>t.id===next);if(at?.enabled)fx?.emit?.('hint',at.point.clone().add(new THREE.Vector3(0,-.4,0)),{count:5})}
    const current=targets();for(const[id,marker]of Object.entries(props.markers)){const target=current.find(t=>t.id===id);marker.visible=target.enabled&&(id===next||id==='staging'||id==='grove');marker.position.copy(target.point);marker.position.y=heightAt(marker.position.x,marker.position.z)+.08}
  }
  function afterActors(dt){
    const supporting=held||action?.id==='lift'&&['lift','beat-wait','beat-lift'].includes(action.phase)||['release','withdraw'].includes(action?.phase),crowns=pairActors('brontosaurus').map(a=>a.getSupportPosition()),rest=HOLD_CROWNS.map(([x,z])=>new THREE.Vector3(x,2.7,z));
    const spring=built?1-lift:0,supports=built?rest.map((p,i)=>supporting&&crowns[i]?crowns[i].clone().lerp(p,spring):p):supporting?crowns:[];
    props.setBranch(built?1+.8*spring:lift,supports);
    if(dt>0&&action?.id==='roll'&&['brace','roll','beat-wait','beat-roll'].includes(action.phase))correctTriContact(action.phase==='brace'?smooth(action.age/action.duration):1);
    if(dt>0&&['cross','lay','finish'].includes(action?.id))for(const actor of allActors()){
      if(!feetCache.has(actor)){const bones=[];actor.model.traverse(b=>{if(b.isBone&&/Foot/.test(b.name))bones.push(b)});feetCache.set(actor,bones)}
      actor.root.updateMatrixWorld(true);let correction=0;
      for(const foot of feetCache.get(actor)){const p=foot.getWorldPosition(new THREE.Vector3()),surface=action.id==='cross'?logSurface(p.x,p.z):build.walkingHeight(p.x,p.z);if(surface!==null)correction=Math.max(correction,surface+.015-p.y)}
      if(correction>0)actor.root.position.y+=correction;
    }
    if(dt>0&&action?.id==='lay'&&['pickup','carry','straighten'].includes(action.phase))updateSupportedCargo(Math.min(1,action.age/Math.max(.01,action.duration)));
  }
  // The obstacles the child may tap: the branch until it is held, the log until it is a bridge (before the
  // branch is up it only gets Mosi's "not yet"), the bark at the marsh; staging and grove only to retry a
  // crossing that found its way blocked. `next` is the one that glows.
  function targets(){const busy=Boolean(action);return[
    {type:'task',id:'branch',point:new THREE.Vector3(-3.6,1.55,-3.1),enabled:!busy&&!atStaging&&!built&&!held,next:snapshot.next==='branch'},
    // The log's near end: it is in the glade view on a phone too (that view looks west, so the far end leaves it).
    {type:'task',id:'log',point:props.logContact(.8,0).add(new THREE.Vector3(0,1.1,0)),enabled:!busy&&!built&&!atStaging,next:snapshot.next==='log'},
    {type:'task',id:'staging',point:ground(6.8,-12,1.3),enabled:!busy&&built&&!atStaging&&allReady()},
    {type:'task',id:'bark',point:ground(7,-15.6,1.2),enabled:!busy&&atStaging&&!boardwalkBuilt&&allReady(),next:snapshot.next==='bark'},
    {type:'task',id:'grove',point:ground(4.5,-26,1.5),enabled:!busy&&boardwalkBuilt&&!visited&&allReady()},
  ]}
  function ownsPair(species){return HELPERS.includes(species)&&(parkedWork.has(species)||atStaging||visited||['cross','finish'].includes(action?.id)||action?.species===species||species==='brontosaurus'&&held)}
  function pairCentre(species){const actors=pairActors(species);return actors.length?actors.reduce((p,a)=>p.add(a.root.position),new THREE.Vector3()).multiplyScalar(1/actors.length).add(new THREE.Vector3(0,.85,0)):ground(-.2,-1.5,.8)}
  function getCameraCue(){
    const cue=(key,focus,points,scale='action')=>({key,phase:action?.phase??'idle',focus,points:points.flatMap(p=>[p,[p[0],Math.min(p[1],heightAt(p[0],p[2])),p[2]]]),scale,priority:action?1:0});
    if(action?.id==='lay'&&action.phase==='collect')return cue('lay-approach',[6,.6,-15],[[1.7,2.3,-10.8],[10.8,2.3,-10.8],[1.7,.2,-18.2],[10.8,1,-18.2]]);
    if(action?.id==='lay')return cue('lay',[5.5,.6,-18.2],[[1.7,2.3,-13],[10.8,2.3,-13],[1.7,.2,-23.3],[8.2,1,-23.3]]);
    if(action?.id==='finish')return cue('marsh-crossing',[4.5,.7,-20.8],[[1.8,2.1,-15.5],[8.2,2,-15.5],[-1,2.1,-30.3],[11,2,-30.3]]);
    if(action?.id==='cross')return cue('river-crossing',[1.6,.9,-6],[[-3.2,2.3,-.5],[6.6,2,-.5],[-2,2.2,-12.2],[8,2.2,-12.2]]);
    if(action?.id==='roll')return cue('rolling-log',[-1.5,.9,-6],[[-10.5,3.0,-12.1],[5.8,3.0,-12.1],[-10.5,2.4,.6],[5.8,2.4,.6]]);
    if(action?.id==='lift'||action?.id==='lower')return cue('branch',[-4.8,1.1,-3.8],[[-10.5,3.8,-6],[-1.3,2.8,-3],[-10.2,1.2,.6],[-2.1,1.2,.6]]);
    if(visited)return cue('grove',[4.5,.5,-26.4],[[-1.1,2,-23],[10,2,-23],[-1,2,-29.8],[10,2,-29.8]],'wide');
    if(atStaging&&boardwalkBuilt)return cue('boardwalk-ready',[4.5,.6,-20],[[-1.5,2.4,-10.5],[10.5,2.4,-10.5],[-1,2,-28.5],[10,2,-28.5]],'wide');
    if(atStaging)return cue('staging',[4.5,.5,-17],[[-1.5,2.4,-10.5],[10.5,2.4,-10.5],[1.7,1,-23],[8,1,-23]],'wide');
    if(built&&allReady())return cue('bridge-ready',[1.4,.6,-4],[[-8,3.3,8],[9.5,2.3,8],[-8,3.3,-15.3],[10.5,2.3,-15.3]],'wide');
    return cue('glade',[-1.3,.5,.5],[[-8,2.7,-5.5],[6.8,2.1,-3.8],[-8,1.8,8],[7.5,2,8]],'wide');
  }
  function actorDebug(actor,index){actor.root.updateMatrixWorld(true);const feet=[];actor.model.traverse(b=>{if(b.isBone&&/Foot/.test(b.name))feet.push({name:b.name,position:b.getWorldPosition(new THREE.Vector3()).toArray()})});return{id:`${actor.species}-${index}`,position:actor.root.position.toArray(),carrySupport:actor.getCarrySupportPosition?.().toArray(),feet}}
  function getDebug(){const boardwalk=build.getDebug();boardwalk.cargo.carriers=pairActors('stegosaurus').map((_,i)=>`stegosaurus-${i}`);return{
    collision:{logMatrix:(props.log.updateWorldMatrix(true,false),props.log.matrixWorld.toArray()),logLength:BRIDGE.length,logRadius:BRIDGE.radius,tubes:Object.entries(props.getBranchCollision?.()??{}).map(([id,value])=>({id,...value}))},
    stage:visited?'visited':boardwalkBuilt?'boardwalk-built':atStaging?'staging':built?'bridge-built':held?'branch-held':'waiting',
    action:action?{id:action.id,phase:action.phase,panel:action.panel,elapsed:action.elapsed,age:action.age,progress:Math.min(1,action.age/Math.max(.01,action.duration)),planning:action.pending?{member:action.pending.member,age:action.pending.age,to:action.pending.goal.point.toArray()}:null,crossed:[...action.crossed]}:null,
    branch:{held,lift,restRaised:built&&!held,supports:pairActors('brontosaurus').map(a=>a.getSupportPosition().toArray())},
    bridge:{built,progress:roll,position:props.pivot.position.toArray(),rotation:props.pivot.rotation.y,walkable:{start:[BRIDGE.near[0],props.deckY,BRIDGE.near[1]],end:[BRIDGE.far[0],props.deckY,BRIDGE.far[1]],axis:[...BRIDGE.axis],halfWidth:BRIDGE.halfWidth,deckY:props.deckY}},
    river:{points:RIVER.points.map(p=>[...p]),halfWidth:RIVER.halfWidth,waterY:RIVER.waterY,bankBlend:RIVER.bankBlend,bounds:{minX:-15,maxX:13,minZ:-18,maxZ:10}},
    marsh:{...MARSH,center:[...MARSH.center],bounds:{...MARSH.bounds}},boardwalk,staging:{arrived:atStaging,...STAGING},destination:{...DESTINATION},grove:{visited},
    pairs:Object.fromEntries(Object.entries(pairs).map(([species,pair])=>[species,{ready:pair.ready,positions:pair.members.map(a=>a.root.position.toArray()),actors:pair.members.map(actorDebug)}])),
    traffic:{...trafficStats},
    routes:action?[...action.routes,...(action.readyTravel?[action.readyTravel]:[])].map(t=>({species:t.actor.species,member:t.member,started:Boolean(t.started),finished:Boolean(t.finished),reservation:t.reservation,age:t.age,waiting:t.waiting,startedAt:t.startedAt,finishedAt:t.finishedAt,delay:t.delay,entryAt:t.entryAt,duration:t.duration,finalYaw:t.finalYaw,headings:t.route.points.map(p=>p.heading??null),points:t.route.points.map(p=>p.toArray())})):[],
  }}
  function reset(){if(action?.pending)cancelWalk?.(action.pending.actor);action=null;trafficStats.checks=trafficStats.deferred=trafficStats.maxCheckMs=0;parkedWork.clear();riverArrivals.clear();finalArrivals.clear();held=built=atStaging=boardwalkBuilt=visited=false;lift=roll=0;events.length=0;snapshot={unlocked:[],selected:null};for(const pair of Object.values(pairs)){pair.members.forEach(a=>{a.walk?.(false);a.clearSupport?.();a.setPushYaw?.(0);a.root.rotation.z=0});pair.members=[];pair.ready=false}props.setBranch(0);props.setLog(0);build.reset();Object.values(props.markers).forEach(m=>{m.visible=false})}
  return{setState,bindPair,start,beat,startFail,waitingBeat:()=>action?.phase==='beat-wait'?action.beatIndex:null,isBuilt:()=>built,leaderRoute,logEnd,logNear:()=>props.pivot.position.clone(),crossSpeed:()=>reducedMotion?5.6:CROSS.speed,branchPoints:()=>props.getBranchCollision().branch.points.filter((_,i)=>i%6===0).map(p=>new THREE.Vector3(...p)),update,afterActors,ownsPair,pairCentre,reset,isBusy:()=>Boolean(action),isVisited:()=>visited,hasTravelReservation:actor=>Boolean(action?.routes.some(t=>t.actor===actor&&!t.finished)),getTargets:targets,getCameraCue,pollEvents:()=>events.splice(0),setReducedMotion(value){reducedMotion=Boolean(value)},getDebug,dispose(){props.dispose();build.dispose()}};
}

