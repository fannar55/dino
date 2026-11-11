// Þrívíddarsafnið (?chapter=safn3d): a proof of concept for red/cyan glasses (engine/gler.js). The friends stand round the
// forest clearing; Egill taps one, the camera glides (or fades) to it, the friend looks at him and brings its head out of the
// screen, and Mosi's recorded fact about it plays. Then back to the overview, a sparkle for the friend, and when all seven are
// seen, one celebration. He can keep tapping.
//
// Comfort (the whole point): the zero-parallax distance D is set each frame to the nearer of the friend's body and the ground
// where it meets the bottom edge of the screen, so nothing cut by an edge comes out of the screen; only the head does, in the
// middle of the frame, to about half of D. D eases while the camera glides, and is held still while the head is out.
//
// Captures: ?chapter=safn3d&vinur=thorsedla&t=<s> picks that friend first (s.tap takes the first name while seeking).
// Units are metres; heading 0 faces +X, 90 faces +Z (toward the overview camera).
import { chapter as grunnur } from './grunnur.js';
import { sparkleBurst } from '../world/props/sparkles.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const CHARS = '../assets/characters/';

// home: where each friend stands, and its heading; clip and clipAt: a clip held part way at the pop-out (Þórseðla's lowerHead,
// her head at about 3 m); maxStep: the most it walks toward the camera; fact and name: Mosi's lines about it. The portrait
// camera and the step are worked out from the model (portraitFor; ?probe=1 prints them).
const FRIENDS = {
  thorsedla: { url: 'brontosaurus.glb', home: [0, -16], heading: 90, clip: 'lowerHead', clipAt: 0.62, headSize: 1.3, fov: 40, fact: 'statue_brachiosaurus_special', name: 'name_brachiosaurus' },
  mosi: { url: 'mosi.glb', home: [10, -8], heading: 135, pop: 0.67, maxStep: 4, headSize: 2.6, fov: 50, fact: 'encyclopedia_triceratops_horns', name: 'name_triceratops' },
  gramedla: { url: 'trex.glb', home: [-10, -9], heading: 50, pop: 0.66, headSize: 2.2, fov: 50, fact: 'statue_trex_special', name: 'name_trex' },
  uggedla: { url: 'spinosaurus.glb', home: [-12.5, -1], heading: 10, maxStep: 3.5, headSize: 2.2, fov: 50, fact: 'statue_spinosaurus_special', name: 'name_spinosaurus' },
  sloedla: { url: 'parasaurolophus.glb', home: [12, -1], heading: 175, headSize: 1.8, fov: 46, fact: 'statue_parasaurolophus_special', name: 'name_parasaurolophus' },
  kambedla: { url: 'stegosaurus.glb', home: [-8, 7], heading: -15, headSize: 1.2, fov: 44, fact: 'statue_stegosaurus_special', name: 'name_stegosaurus' },
  flugedla: { url: 'pteranodon.glb', home: [1.5, 10.5], heading: 240, maxStep: 4, headSize: 2.2, fov: 46, fact: 'statue_pteranodon_special', name: 'name_pteranodon' },
};
const NAMES = Object.keys(FRIENDS);
const EYES = [0.5, 0.7, 0.9, 1.1, 1.3]; // the camera's heights at a portrait: a child's eye, sitting to standing (low looks up, and the ground leaves the frame)
const HEAD_SHARE = 0.55; // the head may fill at most this share of the frame's height at the pop-out
const POP = 0.6; // the head bone's depth at the pop-out as a share of D: its snout comes nearer, to about 0.45-0.5 (measured 2026-11-11)
const PORTRAIT_FOV = 40;
const HEAD_V = 0.4; // where the head sits on the screen at the pop-out (0 top, 1 bottom): above the captions

// Captions and the facts' texts, unchanged from the old game (dist/story.js, dist/mini-content.js, dist/assets/audio/narration-is.json).
const TEXT = {
  name_triceratops: 'Þríhyrna. Tríseratops.',
  name_stegosaurus: 'Kambeðla. Stegósárus.',
  name_brachiosaurus: 'Þórseðla. Brontósárus.',
  name_trex: 'Grameðla. Týrannósárus rex.',
  name_spinosaurus: 'Uggeðla. Spínósárus.',
  name_parasaurolophus: 'Slóeðla. Parasárolófus.',
  name_pteranodon: 'Pteranódon. Flugeðla.',
  statue_stegosaurus_special: 'Plöturnar stóðu upp úr bakinu. Við vitum ekki nákvæmlega til hvers þær voru. Kannski hjálpuðu þær kambeðlum að þekkja hver aðra.',
  statue_brachiosaurus_special: 'Sjáðu langa halann! Hann mjókkaði út að endanum. Þórseðlan gekk á fjórum sterkum fótum, með halann upp frá jörðinni.',
  statue_trex_special: 'Grameðlan gekk á tveimur sterkum afturfótum. Framfæturnir voru stuttir og á hvorri framhönd voru tveir fingur.',
  statue_spinosaurus_special: 'Háir beinangar mynduðu seglið á bakinu. Til hvers var það? Við vitum það ekki örugglega. Kannski hjálpaði það dýrunum að sýna sig.',
  statue_parasaurolophus_special: 'Kamburinn aftan á höfðinu var holur. Loft gat farið um hann og hann gæti hafa hjálpað slóeðlum að kalla hver á aðra.',
  statue_pteranodon_special: 'Pteranódon var flugeðla, ekki risaeðla. Vængirnir voru úr himnu sem mjög langur fingur studdi við.',
  encyclopedia_triceratops_horns: 'Hvað er inni í horni?. Bein að innan, hornslíður utan um. Inni í hornunum voru beinkjarnar. Utan um þá var slíður úr keratíni, efni sem er líka í nöglunum þínum. Hornið á lifandi dýri var því stærra en beinkjarninn sem varðveitist í steingervingi. Á höfuðkúpu í American Museum of Natural History sést gróinn áverki. Hann gæti hafa komið eftir átök við aðra þríhyrnu.',
};

const rad = d => (d * Math.PI) / 180;
const forwardOf = heading => [Math.cos(rad(heading)), Math.sin(rad(heading))];

export const chapter = {
  id: 'safn3d',
  title: 'Þrívíddarsafnið',
  look: 'morning',
  gler: true, // main.js turns the glasses on
  layout: grunnur.layout,
  actors: Object.fromEntries(NAMES.map(n => [n, { url: CHARS + FRIENDS[n].url, position: [FRIENDS[n].home[0], 0, FRIENDS[n].home[1]], heading: FRIENDS[n].heading }])),
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    sogumadur: { name: 'Mosi', colour: '#4f5433' }, // his voice about a friend: no actor's mouth moves
  },
  lines: Object.fromEntries(Object.entries(TEXT).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'overview',
  shots: {
    // the whole clearing, every friend inside the frame, from the open south side
    overview: { position: [0, 3, 20.5], target: [0, 3.4, -3], fov: 54 },
    hero: { position: [0, 3, 20.5], target: [0, 3.4, -3], fov: 54 },
  },

  *script(s) {
    const world = s.actor('mosi').raw.world;
    const { THREE, camera, gler, director } = world;
    const actors = Object.fromEntries(NAMES.map(n => [n, s.actor(n).raw]));
    const v = new THREE.Vector3();
    const probeCam = new THREE.PerspectiveCamera();

    // ---- depth helpers (view-space depth: what parallax depends on) ----
    const depthOf = (cam, p) => -v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
    function groundEdgeDepth(cam) {
      const dir = new THREE.Vector3(0, -1, 0.5).unproject(cam).sub(cam.position).normalize();
      if (dir.y > -0.01) return Infinity;
      let t = (0 - cam.position.y) / dir.y;
      for (let i = 0; i < 3; i++) {
        const x = cam.position.x + dir.x * t;
        const z = cam.position.z + dir.z * t;
        t = (world.heightAt(x, z) - cam.position.y) / dir.y;
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      return t * dir.dot(forward);
    }
    // the nearer of the ground at the bottom edge, the bodies given, and any other friend in or at the edge of the frame
    const ndc = new THREE.Vector3();
    function comfortPlane(cam, bodies) {
      cam.updateMatrixWorld();
      let d = groundEdgeDepth(cam);
      for (const p of bodies) d = Math.min(d, depthOf(cam, p));
      for (const n of NAMES) {
        const c = actors[n].centre(ndc);
        const depth = depthOf(cam, c);
        c.project(cam);
        if (depth > 0 && Math.abs(c.x) < 1.7 && Math.abs(c.y) < 1.5) d = Math.min(d, depth); // (a big friend whose centre is just outside still pokes in)
      }
      return d;
    }
    // the point to aim at so that the head sits at HEAD_V on the screen (the camera tilts down by that much from the head)
    function aimFor(position, head, fov) {
      const tilt = Math.atan((HEAD_V - 0.5) * 2 * Math.tan(rad(director.effectiveFov(fov)) / 2));
      const d = head.clone().sub(position);
      const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + tilt;
      const flat = Math.hypot(d.x, d.z);
      return position.clone().add(new THREE.Vector3(d.x, Math.tan(pitch) * flat, d.z));
    }
    function poseCam(position, target, fov) {
      probeCam.fov = director.effectiveFov(fov);
      probeCam.aspect = camera.aspect;
      probeCam.near = camera.near;
      probeCam.far = camera.far;
      probeCam.position.copy(position);
      probeCam.up.set(0, 1, 0);
      probeCam.lookAt(target);
      probeCam.updateProjectionMatrix();
      probeCam.updateMatrixWorld();
      return probeCam;
    }

    // ---- the head's spot at the pop-out, measured once from the model: its pose there (the clip held part way) at home ----
    function headAtHome(name) {
      const f = FRIENDS[name];
      const a = actors[name];
      const clip = f.clip && a.clips.get(f.clip);
      const action = a.play(clip ? f.clip : 'idle', { fade: 0, timeScale: 0 });
      if (action && clip) action.time = clip.duration * f.clipAt;
      a.mixer.update(0);
      a.root.updateMatrixWorld(true);
      const head = a.headPosition(new THREE.Vector3());
      a.play('idle', { fade: 0 });
      a.mixer.update(0);
      return head;
    }

    // The portrait: the friend steps `step` m toward the camera, which stands in front of the head at a child's eye height. Of
    // the steps and distances that put the head at POP of D (D the camera arrives with: the body at home, or the ground at the
    // bottom edge), the one with the largest D, so the friend is as big and far as the comfort budget allows.
    function portraitFor(name) {
      const f = FRIENDS[name];
      const home = headAtHome(name);
      const centre = actors[name].centre(new THREE.Vector3());
      const [fx, fz] = forwardOf(f.heading);
      const fov = f.fov ?? PORTRAIT_FOV;
      const tanHalf = Math.tan(rad(director.effectiveFov(fov)) / 2);
      let best = null;
      let near = null;
      for (const eye of f.eye ? [f.eye] : EYES) {
        for (let step = 0.5; step <= (f.maxStep ?? 2.5) + 1e-6; step += 0.25) {
          const head = home.clone().add(new THREE.Vector3(fx * step, 0, fz * step));
          for (let r = 1.5; r <= 16; r += 0.1) {
            const position = new THREE.Vector3(head.x + fx * r, eye, head.z + fz * r);
            const aim = aimFor(position, head, fov);
            const cam = poseCam(position, aim, fov);
            const plane = comfortPlane(cam, [centre]);
            const headDepth = depthOf(cam, head);
            const ratio = headDepth / plane;
            if (Math.abs(ratio - (f.pop ?? POP)) > 0.03) continue;
            // the head (its frill, crest or snout) must fit well inside the frame, clear of the edges
            const share = f.headSize / (2 * headDepth * tanHalf);
            const pose = { r, eye, step, ratio, share, plane, position: position.toArray(), aim: aim.toArray(), head: head.toArray(), at: [f.home[0] + fx * step, f.home[1] + fz * step] };
            if (!near || share < near.share) near = pose;
            if (share > HEAD_SHARE) continue;
            if (!best || plane > best.plane) best = pose;
          }
        }
      }
      // nothing fits: the smallest head among the poses at POP of D
      if (!best) console.info(`[safn3d] ${name}'s head fills ${near?.share.toFixed(2)} of the frame at ${f.pop ?? POP} of D (wanted ${HEAD_SHARE} at most)`);
      return best ?? near;
    }

    const portraits = Object.fromEntries(NAMES.map(n => [n, portraitFor(n)]));
    world.safn = { portraits, state: {} }; // for probes and captures
    if (params.get('probe') === '1') {
      // who else is in each portrait's frame, and how near (a friend nearer than D at an edge breaks the comfort rule)
      for (const [n, p] of Object.entries(portraits)) {
        if (!p) continue;
        const cam = poseCam(new THREE.Vector3(...p.position), new THREE.Vector3(...p.aim), FRIENDS[n].fov ?? PORTRAIT_FOV);
        p.others = NAMES.filter(o => o !== n).map(o => {
          const c = actors[o].centre(new THREE.Vector3());
          const ndc = c.clone().project(cam);
          return { o, x: +ndc.x.toFixed(2), y: +ndc.y.toFixed(2), depth: +depthOf(cam, c).toFixed(1) };
        }).filter(q => q.depth > 0 && Math.abs(q.x) < 1.6 && Math.abs(q.y) < 1.6);
      }
      console.info('[safn3d] portraits', JSON.stringify(portraits));
    }

    // ---- the zero-parallax plane, every frame ----
    const state = world.safn.state;
    state.focus = null; // a friend's name, or null for the overview
    state.locked = false; // held while the head is out
    function* keepPlane() {
      for (;;) {
        if (gler && !state.locked) {
          const bodies = state.focus ? [actors[state.focus].centre(new THREE.Vector3())] : NAMES.map(n => actors[n].centre(new THREE.Vector3()));
          state.plane = comfortPlane(camera, bodies);
          gler.setPlane(state.plane, { jump: state.jump });
          state.jump = false;
        }
        if (state.focus) {
          const head = actors[state.focus].headPosition(new THREE.Vector3());
          camera.updateMatrixWorld();
          state.headDepth = depthOf(camera, head);
          state.ratio = state.headDepth / (gler?.plane ?? state.plane);
        }
        yield;
      }
    }

    // ---- setup, behind the start card ----
    for (const n of NAMES) {
      actors[n].play('idle', { fade: 0 });
      actors[n].lookAt('camera', { weight: 0.55 });
    }
    yield s.camera.cut('overview', { check: false });
    s.after(0, () => keepPlane());
    const card = document.createElement('p');
    card.textContent = 'Settu upp gleraugun! Rauða glerið á vinstra auga.';
    card.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:5;margin:0;padding:14px 22px;border-radius:16px;background:rgba(255,255,255,.92);color:#2b2b2b;font:700 clamp(22px,3vw,30px)/1.3 Nunito,sans-serif;text-align:center;max-width:80vw';
    document.body.append(card);
    try {
      yield s.ready();
    } finally {
      card.remove();
    }
    yield s.fade(0, 1.5);

    // ---- the museum ----
    const first = params.get('vinur');
    const visited = new Set();
    let celebrated = false;
    for (;;) {
      for (const n of NAMES) s.target(n, { point: n, radius: Math.max(2.2, actors[n].size?.y ?? 2.5) });
      // (the order only matters while seeking, where the first is taken: ?vinur= first, then the friends not seen yet)
      const fresh = NAMES.filter(n => !visited.has(n));
      const order = [...new Set([...(first && fresh.includes(first) ? [first] : []), ...fresh, ...NAMES])];
      const name = yield s.tap(order);
      for (const n of NAMES) s.target(n, null);
      yield* visit(name);
      visited.add(name);
      state.visited = [...visited];
      sparkleBurst(world, actors[name].headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)), { count: 26, duration: 1.3, size: 0.4, spread: 1.1, seed: `safn ${name}` });
      s.sfx('star');
      if (visited.size === NAMES.length && !celebrated) {
        celebrated = true;
        for (const [i, n] of NAMES.entries()) {
          s.after(i * 0.25, () => { sparkleBurst(world, actors[n].headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0)), { count: 40, duration: 1.6, size: 0.45, spread: 1.6, seed: `allir ${n}` }); s.sfx('star'); return s.wait(0); });
        }
        s.sun.hug();
        yield s.wait(2.5);
      }
    }

    function* visit(name) {
      const f = FRIENDS[name];
      const a = actors[name];
      const actor = s.actor(name);
      const p = portraits[name];
      const shot = { position: p.position, target: p.aim, fov: FRIENDS[name].fov ?? PORTRAIT_FOV, label: `portrait ${name}` };
      state.focus = name;
      state.ratio = null;
      for (const n of NAMES) if (n !== name) actors[n].lookAt(`${name}.head`, { weight: 0.4 }); // the others look at the one chosen
      actor.lookAt('camera', { weight: 0.8 });
      // glide when it is near; fade through black when it is far (a long glide is a long wait for a six-year-old)
      const far = camera.position.distanceTo(new THREE.Vector3(...p.position)) > 9;
      if (far) {
        yield s.fade(1, 0.6);
        state.jump = true;
        yield s.camera.cut(shot, { check: false });
        yield s.wait(0.2);
        yield s.fade(0, 0.7);
      } else {
        yield s.camera.move(shot);
      }
      // the head comes out: D holds where the camera arrived; the friend looks at him and steps in
      state.locked = true;
      const steps = actor.walkTo([p.at], { speed: 0.5 });
      yield s.wait(0.4);
      actor.lookAt('camera', { weight: 1, maxAngle: 70, maxPitch: 40 });
      yield steps;
      let held = null;
      if (f.clip) {
        // the clip runs to where the portrait was measured and holds there (Þórseðla's head comes down out of the sky)
        held = a.play(f.clip, { fade: 0.6 });
        yield s.wait(a.clips.get(f.clip).duration * f.clipAt);
        held.setEffectiveTimeScale(0);
      }
      yield s.wait(1);
      state.out = true;
      state.outAt = s.time;
      const speaker = name === 'mosi' ? 'mosi' : 'sogumadur';
      yield s.say(speaker, f.name, { hold: 0.3 });
      yield s.say(speaker, f.fact, { hold: 0.8 });
      state.out = false;
      // back: the friend straightens up, the camera returns, the friend goes home
      if (held) {
        held.setEffectiveTimeScale(-1); // and back up the way it came
        yield s.wait(a.clips.get(f.clip).duration * f.clipAt);
        a.play('idle', { fade: 0.5 });
      }
      actor.lookAt('camera', { weight: 0.55 });
      state.locked = false;
      state.focus = null;
      for (const n of NAMES) actors[n].lookAt('camera', { weight: 0.55 });
      if (far) {
        yield s.fade(1, 0.6);
        state.jump = true;
        yield s.camera.cut('overview', { check: false });
        a.place(f.home[0], f.home[1], f.heading);
        a.play('idle', { fade: 0 });
        yield s.wait(0.2);
        yield s.fade(0, 0.7);
      } else {
        const back = s.camera.move('overview');
        yield s.wait(1);
        yield actor.walkTo([[f.home[0] - forwardOf(f.heading)[0] * 0.01, f.home[1] - forwardOf(f.heading)[1] * 0.01]], { speed: 0.5 });
        yield actor.turnTo(f.heading);
        yield back;
      }
    }
  },
};
