const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const element=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;};
const format=n=>new Intl.NumberFormat('is-IS',{maximumFractionDigits:n<.1?3:1}).format(n);
export function timelineData(entries){
  const animals=entries.filter(e=>e.time&&Number.isFinite(e.time.start)&&Number.isFinite(e.time.end)&&e.time.start>=0&&e.time.end>=0&&e.time.source).map(e=>({...e,older:Math.max(e.time.start,e.time.end),younger:Math.min(e.time.start,e.time.end)}));
  const maximum=Math.max(10,Math.ceil(Math.max(0,...animals.map(e=>e.older))/10)*10);
  return{animals,maximum,at:age=>animals.filter(e=>age>=e.younger&&age<=e.older)};
}
export function sizeComparison(entries,first,second){
  const valid=entries.filter(e=>e.size?.unit==='m'&&Number.isFinite(e.size.value)&&e.size.value>0&&['length','wingspan'].includes(e.size.kind)&&e.size.source);
  const a=valid.find(e=>e.id===first)||valid[0],b=valid.find(e=>e.id===second)||valid.find(e=>e!==a)||a;
  return{valid,a,b,maximum:Math.max(1,a?.size.value||0,b?.size.value||0),ratio:a&&b?Math.max(a.size.value,b.size.value)/Math.min(a.size.value,b.size.value):0,sameMeasure:!!a&&a.size.kind===b?.size.kind};
}
export const tubeNote=length=>5-Math.round(clamp(Number(length)||1,1,6)-1);
const SVG='http://www.w3.org/2000/svg';
function svg(tag,attributes={}){const e=document.createElementNS(SVG,tag);for(const[k,v]of Object.entries(attributes))e.setAttribute(k,String(v));return e;}
function drawing(entry){
  const graphic=svg('svg',{viewBox:'0 0 320 105','aria-hidden':'true'}),color=entry.color||'#4b8871';
  let path;
  if(entry.size.kind==='wingspan')path='M160 56 Q112 1 0 15 Q76 38 112 86 L155 62 L160 94 L165 62 L208 86 Q244 38 320 15 Q208 1 160 56';
  else if(['snail','beetle','frog','lizard','fish','dragonfly','butterfly'].includes(entry.id)){
    if(entry.id==='fish')path='M20 55 Q90 5 220 48 L308 15 L288 55 L308 96 L220 65 Q90 110 20 55';
    else if(entry.id==='snail')path='M10 83 L310 83 L292 71 L276 35 L265 39 L267 67 L250 68 C232 4 100 0 94 66 L33 69 Z';
    else if(entry.id==='lizard')path='M3 63 Q85 17 154 48 L197 26 L221 35 L197 47 L243 54 L299 39 L317 48 L272 63 L225 67 L211 94 L190 97 L194 75 L129 70 L106 95 L86 94 L100 64 Q41 51 3 63';
    else path='M18 69 Q50 36 101 42 Q126 3 177 25 Q234 20 270 57 L313 76 L287 89 L246 67 L223 89 L187 86 L174 64 L131 66 L105 88 L71 86 L83 66 Z';
  }else if(entry.id==='brachiosaurus')path='M1 58 Q62 41 105 39 Q167 4 211 45 Q221 50 235 43 L267 9 Q283 0 307 14 L319 27 L298 30 L283 20 L253 68 L213 76 L215 102 L197 102 L186 74 L121 72 L113 101 L95 101 L93 69 Q58 50 1 58';
  else if(entry.id==='stegosaurus')path='M0 64 L37 60 L60 35 L72 47 L83 15 L102 38 L119 1 L143 29 L163 5 L184 35 L204 21 L220 46 Q247 43 273 62 L314 63 L320 75 L275 78 L244 69 L235 101 L216 101 L205 76 L124 72 L115 101 L95 101 L96 73 Z';
  else if(entry.id==='triceratops')path='M0 63 Q46 43 104 34 Q162 17 213 51 L232 10 L256 20 L264 42 L301 24 L284 53 L319 60 L317 72 L271 76 L247 68 L237 101 L217 101 L209 73 L116 74 L110 102 L89 102 L90 73 Z';
  else path='M0 54 Q63 75 128 45 Q172 21 214 27 L247 5 L308 7 L320 27 L289 41 L250 39 L233 60 L205 64 L179 80 L190 100 L168 103 L148 80 L132 103 L111 103 L126 72 Q65 73 0 54';
  graphic.append(svg('path',{d:path,fill:color}));return graphic;
}
export function createMuseumExhibit(host,{kind='timeline',entries=[],audio,onClose=()=>{}}={}){
  let disposed=false,paused=false;const cleanups=[];
  const root=element('section','museum-exhibit museum-exhibit-'+kind),header=element('header','museum-exhibit-header'),titles={timeline:'Ferð um tímann',scale:'Hvað voru þau stór?',lab:'Rannsóknarstofa Mosa'};
  header.append(element('div','museum-exhibit-heading',titles[kind]||titles.lab),button('← Til baka í bókina',onClose));root.append(header);host.append(root);
  function blocked(){return disposed||paused||document.hidden;}
  // All event targets live below root. Removed question pages can be collected
  // immediately; do not retain their nodes in a growing cleanup array.
  function listen(target,name,fn){target.addEventListener(name,fn);}
  function button(text,fn){const b=element('button','museum-action',text);b.type='button';listen(b,'click',()=>{if(blocked())return;void audio?.effect?.('tap');fn();});return b;}
  function range(label,min,max,step,value,fn){const wrap=element('label','museum-slider'),text=element('span','',label),input=element('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',label);listen(input,'input',()=>{if(blocked())return;fn(Number(input.value));});wrap.append(text,input);return{wrap,input};}
  function sourceLabel(entry,which){const p=element('p','museum-source',entry?.[which]?.label||'');if(entry?.[which]?.source)p.title=Array.isArray(entry[which].source)?entry[which].source.join(' · '):entry[which].source;return p;}
  if(kind==='timeline'){
    const data=timelineData(entries);root.append(element('p','museum-intro','Færðu tímabendilinn. Hvaða dýr lifðu á þessum tíma? Hver rönd sýnir aldursbil úr heimildunum.'));
    const stage=element('div','museum-timeline'),ruler=element('div','museum-time-ruler');
    for(let i=0;i<=4;i++)ruler.append(element('span','',i===4?'Nú':format(data.maximum*(1-i/4))+' m. ára'));stage.append(ruler);
    const rows=new Map();for(const entry of data.animals){const row=element('button','museum-time-row'),label=element('strong','',entry.name),track=element('span','museum-time-track'),bar=element('span','museum-time-span');row.type='button';bar.style.left=`${100*(1-entry.older/data.maximum)}%`;bar.style.width=`${Math.max(.5,100*(entry.older-entry.younger)/data.maximum)}%`;bar.style.setProperty('--animal-color',entry.color||'#448b70');track.append(bar);row.append(label,track);listen(row,'click',()=>{if(blocked())return;slider.input.value=(entry.older+entry.younger)/2;select(Number(slider.input.value));});stage.append(row);rows.set(entry.id,row);}
    const cursor=element('i','museum-time-cursor');cursor.setAttribute('aria-hidden','true');stage.append(cursor);
    const readout=element('p','museum-readout'),present=element('div','museum-time-present');present.setAttribute('aria-live','polite');
    const initial=data.animals[0]?(data.animals[0].older+data.animals[0].younger)/2:0;
    const slider=range('Veldu tíma · milljónir ára fyrir nútímann',0,data.maximum,.5,initial,select);slider.input.dir='rtl';
    function select(age){cursor.style.left=`calc(120px + (100% - 132px) * ${1-age/data.maximum})`;readout.textContent=age===0?'Nútíminn':`Fyrir ${format(age)} milljónum ára`;const active=data.at(age);present.replaceChildren();for(const entry of active){const card=element('div','museum-time-card');card.append(element('strong','',entry.name),sourceLabel(entry,'time'));present.append(card);}if(!active.length)present.append(element('p','','Ekkert dýr úr þessari bók er merkt á þessu aldursbili.'));for(const[id,row]of rows)row.setAttribute('aria-pressed',String(active.some(e=>e.id===id)));slider.input.setAttribute('aria-valuetext',readout.textContent);}
    root.append(stage,slider.wrap,readout,present,element('p','museum-note','Aldursbil geta skarast án þess að dýrin hafi hist. Þau gátu búið á ólíkum stöðum.'));select(initial);
  }else if(kind==='scale'){
    let comparison=sizeComparison(entries),first=comparison.a?.id,second=comparison.b?.id;
    root.append(element('p','museum-intro','Veldu tvö dýr. Mælistikurnar nota sömu metra. Lengd er mæld frá nefi að hala; vænghaf er milli vængenda.'));
    const selectors=element('div','museum-size-selectors'),scene=element('div','museum-scale-stage'),readout=element('p','museum-readout');
    function chooser(label,value,fn){const wrap=element('label'),select=element('select');wrap.append(element('span','',label));select.setAttribute('aria-label',label);for(const entry of comparison.valid){const option=element('option','',entry.name);option.value=entry.id;option.selected=entry.id===value;select.append(option);}listen(select,'change',()=>{if(!blocked())fn(select.value);});wrap.append(select);return wrap;}
    selectors.append(chooser('Fyrra dýr',first,value=>{first=value;render();}),chooser('Seinna dýr',second,value=>{second=value;render();}));
    function render(){comparison=sizeComparison(entries,first,second);scene.replaceChildren();if(!comparison.a){readout.textContent='Stærðarmælingar vantar fyrir þessa sýningu.';return;}for(const entry of[comparison.a,comparison.b]){const row=element('section','museum-scale-row'),label=element('strong','',`${entry.name} · ${format(entry.size.value)} m ${entry.size.kind==='wingspan'?'vænghaf':'lengd'}`),measure=element('div','museum-scale-measure');measure.style.width=`${100*entry.size.value/comparison.maximum}%`;measure.append(drawing(entry),element('span','museum-measure-line'));row.append(label,measure,sourceLabel(entry,'size'));scene.append(row);}const ruler=element('div','museum-scale-ruler');for(let i=0;i<=4;i++)ruler.append(element('span','',format(comparison.maximum*i/4)+' m'));scene.append(ruler);readout.textContent=comparison.sameMeasure?`Lengri mælistikan er ${format(comparison.ratio)} sinnum sú styttri.`:'Hér berum við saman lengd annars dýrsins og vænghaf hins.';}
    root.append(selectors,scene,readout,element('p','museum-note','Teikningarnar eru einfaldar skýringarmyndir. Stærðargildin koma úr heimildunum; einstakir einstaklingar voru misstórir.'));render();
  }else{
    root.append(element('p','museum-intro','Hér má prófa, hlusta, skoða vísbendingar og skipta um skoðun.'));
    const experiment=element('section','museum-lab-tone'),title=element('h2','','Tónasmiðja'),pipe=element('div','museum-pipe'),wave=element('div','museum-pipe-wave'),toneText=element('p','museum-readout');pipe.append(wave);
    let length=3;const slider=range('Lengd tilraunarörsins',1,6,1,length,value=>{length=value;paintTube();});
    function paintTube(){pipe.style.width=`${35+length*10}%`;wave.style.backgroundSize=`${12+length*10}px 100%`;toneText.textContent=length<=2?'Stutt rör · hár tónn':length>=5?'Langt rör · lágur tónn':'Meðallangt rör · miðtónn';}
    experiment.append(title,element('p','','Breyttu rörinu og spilaðu tón. Prófaðu svo að breyta því aftur!'),pipe,slider.wrap,toneText,button('♫ Spila tón',()=>{audio?.unlock?.();audio?.star?.({index:tubeNote(length),total:6});}),element('p','museum-note','Þetta eru tilbúnir tónar í hljóðtilraun. Þeir eru ekki upptökur af risaeðlum.'));root.append(experiment);paintTube();
    const questions=entries.filter(entry=>(entry.question?.options||entry.question?.choices)?.length),quiz=element('section','museum-lab-quiz');let questionIndex=0;root.append(quiz);
    function showQuestion(){quiz.replaceChildren();if(!questions.length){quiz.append(element('p','','Skoðum fleiri vísbendingar á dýrasíðunum.'));return;}const entry=questions[questionIndex],q=entry.question,feedback=element('p','museum-quiz-feedback');feedback.setAttribute('aria-live','polite');quiz.append(element('h2','','Vísbendingaleikur'),element('span','museum-question-animal',entry.name),element('p','museum-question',q.prompt||q.text||q.question||''));const choices=element('div','museum-quiz-choices');let solved=false;(q.options||q.choices).forEach((choice,index)=>{const label=typeof choice==='string'?choice:choice.label||choice.text;const b=button(label,()=>{const correct=typeof choice==='object'&&typeof choice.correct==='boolean'?choice.correct:index===q.correct||index===q.answer||label===q.answer;if(solved)return;if(correct){solved=true;feedback.textContent=q.explanation||q.success||'Já! Þú fylgdir vísbendingunni.';b.classList.add('correct');audio?.star?.({index:2,total:3});}else{feedback.textContent=(typeof choice==='object'&&choice.hint)||q.hint||'Skoðum vísbendinguna aftur. Þú mátt prófa annað svar.';b.classList.add('tried');b.disabled=true;}});choices.append(b);});quiz.append(choices,feedback,button('Næsta vísbending →',()=>{questionIndex=(questionIndex+1)%questions.length;showQuestion();}));}showQuestion();
  }
  return{setPaused(value){paused=Boolean(value);if(paused)audio?.stopCelebration?.();},dispose(){if(disposed)return;disposed=true;audio?.stopCelebration?.();cleanups.splice(0).forEach(fn=>fn());root.remove();}};
}
