import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
const source=(await readFile(new URL('../dist/encyclopedia.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function');
const entry={id:'triceratops',name:'Þríhyrna',scientificName:'Triceratops',group:'prehistoric',intro:'Mosi er þríhyrna.',introNarration:'encyclopedia_triceratops_intro',topics:[{id:'body',title:'Hornin',summary:'Þrjú horn.',paragraphs:['Horn voru hulin hornslíðri. Steingervingur varðveitir ummerki.'],sources:[{title:'Safn',url:'https://museum.example/specimen'}],certainty:'evidence'}],hotspots:[{label:'Horn',text:'Tvö stór og eitt minna.',yaw:1}],question:{prompt:'Hvað eru hornin mörg?',options:['Tvö','Þrjú','Fjögur'],answer:1,explanation:'Teldu tvö stór og eitt minna.'},sources:[{title:'Safn',url:'https://museum.example/specimen'}]};
const entries=[entry,{...entry,id:'frog',name:'Froskur',scientificName:'Anura',group:'small',illustration:'frog',introNarration:'encyclopedia_frog_intro'}];
function setup(){
 const{document,window}=parseHTML('<html><body><main></main></body></html>');
 const host=document.querySelector('main'),saved=new Map(),state={found:[],games:{}},events=[],waits=[];let disposedModels=0,pausedModels=[],lightOptions,closed=0;
 const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 const audio={effect:id=>events.push(['effect',id]),stopNarration:()=>events.push(['stop']),narrate:(id,text)=>{events.push(['narrate',id,text]);return new Promise(resolve=>waits.push(resolve));},unlock(){},isMuted:()=>false};
 const model=()=>({ready:Promise.resolve(),dispose(){disposedModels++;},setPaused:v=>pausedModels.push(v),focusHotspot(){}});
 const factory=new Function('document','localStorage','ENCYCLOPEDIA','GLOSSARY','ENCYCLOPEDIA_NARRATION','ENCYCLOPEDIA_MEDIA','createStatueViewer','createSpecimenViewer','createMuseumImageViewer','createMuseumExhibit','discoveryIllustration','STATUE_FACTS','MINI_GAMES',source+';return {createEncyclopedia,searchEntries,readMuseumProgress};');
 const api=factory(document,localStorage,entries,[{term:'Steingervingur',definition:'Ummerki lífs.'}],{}, {triceratops:[{type:'image',src:'./a.webp',alt:'Bein',caption:'Beinagrind',credit:'Höfundur',license:'CC0'}]},model,model,(_host,o)=>{lightOptions=o;return {dispose(){events.push(['lightbox-disposed']);}};},()=>({dispose(){events.push(['exhibit-disposed']);}}),()=>'<svg/>',{},{});
 const museum=api.createEncyclopedia(host,{getState:()=>state,audio,onClose:()=>closed++});
 const click=text=>{const b=[...host.querySelectorAll('button')].find(n=>n.textContent===text);assert.ok(b,`button ${text}`);b.dispatchEvent(new window.Event('click'));};
 return{host,document,window,museum,api,state,events,waits,saved,click,light:()=>lightOptions,models:()=>({disposedModels,pausedModels}),closed:()=>closed};
}
test('every encyclopedia entry is accessible without wins, while reading saves only separate museum progress',()=>{
 const g=setup();assert.equal(g.host.querySelectorAll('[data-animal]').length,2);assert.ok([...g.host.querySelectorAll('[data-animal]')].every(n=>!n.disabled));
 g.museum.openEntry('triceratops');assert.equal(g.host.querySelector('h1').textContent,'Mosi · Þríhyrna');assert.deepEqual(g.state,{found:[],games:{}});assert.equal(g.saved.size,1);assert.equal(JSON.parse([...g.saved.values()][0]).last,'triceratops');assert.equal(g.events.some(e=>e[0]==='narrate'),false,'Reading must never auto-start speech');g.museum.dispose();
});
test('search understands Icelandic and scientific names; malformed progress is harmless',()=>{
 const g=setup();assert.equal(g.api.searchEntries('TRICERATOPS').length,1);assert.equal(g.api.searchEntries('mosi')[0].id,'triceratops');assert.equal(g.api.searchEntries('','small')[0].id,'frog');
 assert.deepEqual(g.api.readMuseumProgress({getItem:()=>'{broken'}),{visited:[],last:null});assert.deepEqual(g.api.readMuseumProgress({getItem:()=>JSON.stringify({visited:['unknown','frog'],last:'unknown'})}),{visited:['frog'],last:null});g.museum.dispose();
});
test('moving between pages disposes models, stale narration cannot change the new reading page',async()=>{
 const g=setup();g.museum.openEntry('triceratops');g.click('▷ Hlusta');assert.equal(g.events.at(-1)[0],'narrate');g.click('Lesa og hlusta');assert.equal(g.models().disposedModels,1);assert.equal(g.host.querySelector('.museum-article h2').textContent,'Hornin');g.waits[0](false);await Promise.resolve();await Promise.resolve();assert.equal(g.host.querySelector('.museum-live').textContent,'');assert.equal(g.host.querySelector('.museum-listen').textContent,'▷ Hlusta');assert.equal(g.host.querySelectorAll('a,iframe').length,0);g.museum.dispose();
});
test('photo close returns to the same animal, and back unwinds the museum without closing the game early',()=>{
 const g=setup();g.museum.openEntry('triceratops');const photo=g.host.querySelector('.museum-photo-card');photo.dispatchEvent(new g.window.Event('click'));assert.equal(g.models().pausedModels.at(-1),true);assert.equal(g.light().images[0].src,'./a.webp');assert.equal(g.museum.handleBack(),true);assert.equal(g.models().pausedModels.at(-1),false);assert.equal(g.host.querySelector('h1').textContent,'Mosi · Þríhyrna');assert.equal(g.museum.handleBack(),true);assert.equal(g.host.querySelector('h1').textContent,'Safn Egils');assert.equal(g.museum.handleBack(),false);assert.equal(g.closed(),0);g.museum.dispose();
});
test('investigation explains mistakes, permits retry and never awards game progress or locks facts',()=>{
 const g=setup();g.museum.openEntry('triceratops','investigate');g.click('Tvö');assert.match(g.host.querySelector('.museum-feedback').textContent,/Teldu tvö stór/);g.click('Þrjú');assert.match(g.host.querySelector('.museum-feedback').textContent,/Þú fannst/);assert.deepEqual(g.state,{found:[],games:{}});g.click('Rannsaka aftur');assert.ok([...g.host.querySelectorAll('.museum-answer')].every(b=>!b.disabled));g.museum.dispose();
});

test('glossary terms reveal a definition inside the reading page without leaving the museum',()=>{
 const g=setup();g.museum.openEntry('triceratops','read');g.click('Steingervingur');assert.match(g.host.querySelector('.museum-word-note').textContent,/Ummerki lífs/);assert.equal(g.host.querySelector('h1').textContent,'Mosi · Þríhyrna');g.click('Skil!');assert.equal(g.host.querySelector('.museum-word-note'),null);g.museum.dispose();
});

test('uncached photos fail gently offline without removing the animal or its facts',()=>{
 const g=setup(),card=g.host.querySelector('[data-animal="triceratops"]');card.querySelector('img').dispatchEvent(new g.window.Event('error'));assert.ok(card.querySelector('svg'));assert.match(card.textContent,/Þríhyrna/);assert.ok(card.querySelector('.museum-category'),'fallback retains animal badge');card.dispatchEvent(new g.window.Event('click'));const photo=g.host.querySelector('.museum-photo-card');photo.querySelector('img').dispatchEvent(new g.window.Event('error'));assert.match(photo.textContent,/netsambandi/);photo.dispatchEvent(new g.window.Event('click'));assert.equal(g.light().images[0].src,'./a.webp','original image remains retryable');g.museum.handleBack();g.click('Lesa og hlusta');assert.match(g.host.querySelector('.museum-article').textContent,/Horn voru/);g.museum.dispose();
});
