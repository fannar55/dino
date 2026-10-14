import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../.tools/dom-check/node_modules/linkedom/esm/index.js';
import {ADVENTURES,DISCOVERY_CARDS} from '../dist/adventure-content.js';
import {NARRATION} from '../dist/story.js';
import {discoveryIllustration,discoveryProgressIcon} from '../dist/discovery-illustrations.js';

test('each three-item activity has its own illustrated, narrated completion and recognizable progress icon',()=>{
 const pictures=new Set(),icons=new Set();
 for(const a of Object.values(ADVENTURES)){
  const kind=a.targets[0].kind,card=DISCOVERY_CARDS[kind];assert.ok(card,kind);
  assert.ok(NARRATION[card.narration]);assert.ok(card.title&&card.subtitle);assert.equal(card.art,kind);
  pictures.add(discoveryIllustration(card.art));icons.add(discoveryProgressIcon(kind));
 }
 assert.equal(pictures.size,6,'Activities must not silently fall back to the fossil picture');
 assert.equal(icons.size,6,'The six collections need distinguishable visual counters');
});

test('all book illustrations are self-contained SVG with valid paint references and no external resources',()=>{
 for(const [kind,card]of Object.entries(DISCOVERY_CARDS)){
  const markup=discoveryIllustration(card.art),{document}=parseHTML(markup),svg=document.querySelector('svg');
  assert.equal(svg.getAttribute('viewBox'),'0 0 360 270');
  assert.equal(document.querySelectorAll('image,script,foreignObject').length,0,kind);
  for(const reference of markup.matchAll(/url\(#([^\)]+)\)/g))assert.ok(document.getElementById(reference[1]),`${kind}: missing paint ${reference[1]}`);
  assert.doesNotMatch(markup,/(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:)/i);
  assert.ok(svg.querySelectorAll('path').length>=5,`${kind}: full illustration must have real subject detail`);
 }
});
