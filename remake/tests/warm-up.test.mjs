import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warmUp } from '../engine/warm-up.js';

// The warm-up draw (engine/warm-up.js): what has never been drawn is drawn once, behind the black, so its shaders are built where
// no frame the child sees stalls. These tests use a renderer that records what each draw would have seen.

/** A renderer that notes, at every render, where the camera is and what is shown and culled; and the 1-pixel read that waits. */
function recordingRenderer(watch) {
  const log = [];
  const renderer = {
    info: { programs: [] },
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: false },
    getContext: () => ({ RGBA: 6408, UNSIGNED_BYTE: 5121, readPixels: () => log.push({ read: true }) }),
    render(scene, camera) {
      camera.updateMatrixWorld();
      log.push({
        position: camera.position.toArray().map(v => +v.toFixed(3) || 0),
        looking: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).toArray().map(v => +v.toFixed(3) || 0),
        fov: camera.fov,
        shadows: renderer.shadowMap.needsUpdate,
        objects: watch.map(o => ({ name: o.name, visible: o.visible, culled: o.frustumCulled })),
      });
      renderer.info.programs.push({ name: `program ${renderer.info.programs.length}` });
    },
  };
  return { renderer, log };
}

/** A small world: an actor out of the story (its root hidden), a lid shell under it, a shadow-only caster, and a throwaway. */
function stage() {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'actor';
  root.visible = false;
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  body.name = 'body';
  const lids = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  lids.name = 'lids';
  lids.visible = false; // shown only while the eyes are shut
  const caster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  caster.name = 'caster';
  caster.visible = false; // takes part in the shadow pass only
  caster.onAfterShadow = () => { caster.visible = false; };
  body.add(lids, caster);
  root.add(body);
  const place = new THREE.Group(); // a place not in view: its group hidden
  place.name = 'place';
  place.visible = false;
  const flower = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  flower.name = 'flower';
  place.add(flower);
  scene.add(root, place);
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
  camera.position.set(1, 2, 3);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  return { scene, camera, root, body, lids, caster, place, flower };
}

test('one draw a shot, with the objects shown and unculled wherever they hide, then every flag as it was', () => {
  const { scene, camera, root, body, lids, caster, place, flower } = stage();
  const watch = [root, body, lids, caster, place, flower];
  const before = watch.map(o => ({ visible: o.visible, culled: o.frustumCulled }));
  const { renderer, log } = recordingRenderer(watch);
  const result = warmUp(renderer, scene, camera, {
    objects: [root, flower],
    shots: [{ position: [10, 1.5, 0], target: [0, 1.5, 0], fov: 50 }, { position: [0, 1.5, 10], target: [0, 1.5, 0], fov: 30 }],
  });
  const draws = log.filter(entry => !entry.read);
  assert.equal(draws.length, 2, 'one draw a shot');
  for (const draw of draws) {
    const seen = Object.fromEntries(draw.objects.map(o => [o.name, o]));
    for (const name of ['actor', 'body', 'lids', 'flower']) {
      assert.equal(seen[name].visible, true, `${name} is drawn`);
      assert.equal(seen[name].culled, false, `${name} is not culled, wherever it is`);
    }
    assert.equal(seen.place.visible, true, 'the hidden place a throwaway stands in is shown with it');
    assert.equal(seen.caster.visible, false, 'a mesh that only takes part in the shadow pass is left to the shadow pass');
    assert.equal(draw.shadows, true, 'the shadow pass runs');
  }
  watch.forEach((o, i) => {
    assert.equal(o.visible, before[i].visible, `${o.name} shown as before`);
    assert.equal(o.frustumCulled, before[i].culled, `${o.name} culled as before`);
  });
  assert.equal(result.draws, 2);
  assert.equal(result.programs, 2, 'it says how many programs the draws built');
  assert.ok(result.ms >= 0);
});

test('the camera is posed for each shot, by a pose or by a function, and put back as it was', () => {
  const { scene, camera, root } = stage();
  const was = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
  const { renderer, log } = recordingRenderer([root]);
  warmUp(renderer, scene, camera, {
    objects: [root],
    shots: [
      { position: new THREE.Vector3(10, 1.5, 0), target: new THREE.Vector3(0, 1.5, 0), fov: 50 },
      cam => { cam.position.set(0, 4, 0); cam.lookAt(0, 0, -1); cam.fov = 70; cam.updateProjectionMatrix(); },
    ],
  });
  const [first, second] = log.filter(entry => !entry.read);
  assert.deepEqual(first.position, [10, 1.5, 0]);
  assert.deepEqual(first.looking, [-1, 0, 0]);
  assert.equal(first.fov, 50);
  assert.deepEqual(second.position, [0, 4, 0]);
  assert.equal(second.fov, 70);
  assert.ok(camera.position.equals(was.position) && camera.quaternion.equals(was.quaternion) && camera.fov === was.fov, 'the camera is back');
  const projection = camera.projectionMatrix.clone();
  camera.updateProjectionMatrix();
  assert.ok(camera.projectionMatrix.equals(projection), 'its projection is its own again');
});

test('it waits for the GPU once every draw is made, and with no shots it draws the camera as it is', () => {
  const { scene, camera, root } = stage();
  const { renderer, log } = recordingRenderer([root]);
  warmUp(renderer, scene, camera, { objects: [root] });
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].position, [1, 2, 3], 'the view as it is');
  assert.deepEqual(log[1], { read: true }, 'and the read comes last, so the builds are paid for here');
});

test('a shot that fails still puts every flag and the camera back', () => {
  const { scene, camera, root, lids } = stage();
  const { renderer } = recordingRenderer([root]);
  const was = camera.position.clone();
  assert.throws(() => warmUp(renderer, scene, camera, { objects: [root], shots: [() => { throw new Error('no such shot'); }] }), /no such shot/);
  assert.equal(root.visible, false);
  assert.equal(lids.visible, false);
  assert.ok(camera.position.equals(was));
});

test('main.js draws the chapter once before the start button shows, builds its later places then, and draws each new place before it fades in', async () => {
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(main, /import \{ warmUp \} from '\.\/engine\/warm-up\.js';/);
  // behind the start button: black until the warm-up is done, then the button
  const start = main.slice(main.indexOf('// Wait for a tap'), main.indexOf("if (params.get('orbit') === '1')"));
  assert.match(start, /ui\.setFade\(1\);/);
  assert.match(start, /getReady\(\)[\s\S]*\.finally\(\(\) => \{[\s\S]*ui\.setFade\(0\.35\);[\s\S]*button\.hidden = false;/);
  assert.doesNotMatch(start.slice(0, start.indexOf('getReady()')), /button\.hidden = false/, 'the button waits for the warm-up');
  const ready = main.slice(main.indexOf('async function getReady()'), main.indexOf('// Wait for a tap'));
  assert.match(ready, /await characterLodsReady\(\);/);
  assert.match(ready, /chapter\.warmUp\?\.\(world\)/);
  assert.match(ready, /for \(const name of chapter\.prepare \?\? \[\]\) warmed\.push\(await prepareAndWarm\(name\)\);/);
  assert.match(ready, /ui\.tray\.prepare\(warm\.tray\);/);
  // a new place: drawn once in the frame it is set up, under the black, with the music lenient round it
  const loop = main.slice(main.indexOf('renderer.setAnimationLoop('));
  assert.match(loop, /if \(warmedPlace !== null && world\.location !== warmedPlace\) \{[\s\S]*music\.lenient\(PLACE_CHANGE\);[\s\S]*warmPlace\([\s\S]*\}\s*render\(\);/);
  assert.match(main, /beforeBuild = \(\) => music\.lenient\(PLACE_CHANGE\);/);
  assert.match(main, /build: layout => \{\s*beforeBuild\?\.\(\);\s*return createForest\(world, layout\);/);
  assert.match(loop, /lodsReady && startReady\) window\.__demoReady = true;/, 'a page is ready for a probe only once the button shows');
  // A frame under a black screen (the warm-up, a build) says nothing of how the scene draws: the resolution does not adapt to it.
  assert.match(loop, /adapt\(real, clock\.frozen \|\| ui\.fadeLevel >= 0\.999\);/);
});

test('while the start screen is black for the warm-up a small gold star breathes in the middle, and fades with the black as the button shows', async () => {
  const fs = await import('node:fs');
  const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // The page has it put away (captures and review shots never show it), over the black and under the button, with no words.
  const html = read('index.html');
  const element = /<div id="loading"[^>]*><\/div>/.exec(html);
  assert.ok(element, 'index.html has an empty #loading');
  assert.match(element[0], /class="loading"/);
  assert.match(element[0], /\bhidden\b/, 'put away until the start screen asks for it');
  assert.match(element[0], /aria-hidden="true"/);
  assert.ok(html.indexOf('id="fade"') < element.index && element.index < html.indexOf('id="start"'), 'after the fade (over the black), before the button');
  // It is the journal's star gold, breathes gently on its own (opacity and scale: the browser animates them off the main
  // thread, so it goes on through a long frame), never takes a tap, and fades out.
  const css = read('style.css');
  const rule = selector => {
    const found = new RegExp(`^${selector.replace(/[.[\]#]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    assert.ok(found, `${selector} has a rule`);
    return found[1];
  };
  const loading = rule('.loading');
  assert.match(loading, /#f2b630|%23f2b630|var\(--star\)/i, 'STYLE.md\'s star gold');
  assert.match(css, /--star:\s*#f2b630/i);
  assert.match(loading, /left:\s*50%/);
  assert.match(loading, /top:\s*50%/);
  assert.match(loading, /pointer-events:\s*none/);
  const breathing = /animation:\s*([\w-]+)/.exec(loading)?.[1];
  assert.ok(breathing, 'it breathes');
  const keyframes = new RegExp(`@keyframes ${breathing}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  assert.ok(keyframes && /scale\(/.test(keyframes[1]) && !/(left|top|width|height):/.test(keyframes[1]), 'by its scale alone');
  assert.match(loading, /transition:\s*opacity/);
  assert.match(rule('.loading.done'), /opacity:\s*0/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.loading\s*\{\s*animation:\s*none/, 'and holds still for whoever asks for less motion');
  // main.js shows it with the black of the start screen and lets it go with the black when the button shows; only there.
  const main = read('main.js');
  const start = main.slice(main.indexOf('// Wait for a tap'), main.indexOf("if (params.get('orbit') === '1')"));
  assert.match(start, /ui\.setFade\(1\);[\s\S]*loading\.hidden = false;[\s\S]*getReady\(\)/);
  assert.match(start, /\.finally\(\(\) => \{[\s\S]*loading\.classList\.add\('done'\);[\s\S]*ui\.setFade\(0\.35\);[\s\S]*button\.hidden = false;/);
  assert.equal((main.match(/loading\.hidden = false/g) ?? []).length, 1, 'nowhere else');
});
