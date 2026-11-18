// The fast take's company (round 3, fjor.js): the flock of Flugeðlas above the cloud sea, the little birds of the gorge and the falls'
// spray. The flock are the game's own Flugeðla (pteranodon.glb) made again as actors of their own (shared geometry, cloned skeletons,
// the engine's simpler levels far off), each a little smaller or darker than her, posed here each frame (not in world.actors: the
// engine does not walk them). The birds are the owner's songbird (critters/fugl.glb) in one instanced draw, their wings beaten in the
// birds' shader (world/critters/critters.js birdMaterial). The spray is code-made soft dots: a mist over the plunge pool and drops
// that come up at us as we climb the falls.
import * as THREE from 'three';
import { createActor } from '../../engine/actor.js';
import { crowdModelFrom } from '../../world/critters/crowd-models.js';
import { birdMaterial, BIRD_MODEL } from '../../world/critters/critters.js';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { FLOCK_MEMBERS, flockAt, BIRDS, FJOR_D, FALLS_CLIMB, CREST } from './fjor.js';
import { FALLS } from '../kafli4-route.js';
import { BODY_LOCAL } from './cast.js';

const rad = d => (d * Math.PI) / 180;
const TAU = Math.PI * 2;
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

export function createFjorLife(world, { url }) {
  const scene = world.scene;
  // ---- the flock ----
  const flock = [];
  const flockReady = Promise.all(FLOCK_MEMBERS.map(async (m, i) => {
    const actor = await createActor(world, { name: `flugedla3d flock ${i}`, url, position: [0, -200, 0], heading: 0, scale: m.scale });
    if (!actor.root.parent) scene.add(actor.root);
    // a little darker or greyer than her: their own copies of her materials
    actor.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      const tint = mat => { const c = mat.clone(); c.color?.multiplyScalar(m.tint); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
    });
    actor.root.visible = false;
    flock[i] = { m, actor, action: null, clip: null };
  }));

  const e = new THREE.Euler(), qPitch = new THREE.Quaternion(), qBank = new THREE.Quaternion(), qa = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0), body = new THREE.Vector3(), p = new THREE.Vector3();
  const info = [];
  /** The flock at story second t: placed in the picture (stage.framePoint) round the camera's heading `yaw` (degrees). */
  function poseFlock(t, { stage, stageCam, D, yaw, camPitch }) {
    info.length = 0;
    for (const f of flock) {
      if (!f) continue;
      const s = flockAt(f.m, t);
      if (!s) { f.actor.root.visible = false; continue; }
      f.actor.root.visible = true;
      const clipName = Math.abs(s.bank) > 30 || f.m.layer === 'far' ? 'glide' : 'fly';
      if (f.clip !== clipName) { f.action = f.actor.play(clipName, { fade: 0, timeScale: 0 }); f.clip = clipName; }
      const clip = f.action.getClip();
      f.action.time = ((t * (clipName === 'fly' ? 1.6 : 1) + f.m.phase * clip.duration) % clip.duration);
      f.actor.mixer.update(0);
      // as she is posed (cast.js poseHer): facing the camera's line, her pitch the camera's taken off, banked
      f.actor.root.quaternion.setFromEuler(e.set(0, -rad(90 + s.heading + yaw), 0))
        .multiply(qPitch.setFromAxisAngle(Z, rad(4 - camPitch)))
        .multiply(qBank.setFromAxisAngle(X, rad(s.bank)));
      stage.framePoint(s.at[0], s.at[1], (s.at[2] * FJOR_D) / D, p, stageCam, D);
      body.set(...BODY_LOCAL).multiplyScalar(f.m.scale).applyQuaternion(f.actor.root.quaternion);
      f.actor.root.position.copy(p).sub(body);
      f.actor.root.updateMatrixWorld(true);
      info.push({ layer: f.m.layer, k: s.at[2], u: s.at[0], v: s.at[1] });
    }
    return info;
  }
  const hideFlock = () => { for (const f of flock) if (f) f.actor.root.visible = false; };

  // ---- the little birds ----
  let birds = null;
  const birdsReady = (async () => {
    const gltf = await new GLTFLoader().loadAsync(BIRD_MODEL);
    const model = crowdModelFrom(gltf);
    const geometry = model.lods[0].geometry.clone();
    for (const name of Object.keys(geometry.morphAttributes)) delete geometry.morphAttributes[name];
    const flight = new THREE.InstancedBufferAttribute(new Float32Array(BIRDS.length * 2), 2);
    flight.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aFlight', flight);
    const mesh = new THREE.InstancedMesh(geometry, birdMaterial('bird', { wing: model.wing ?? null }), BIRDS.length);
    mesh.name = 'flugedla3d birds';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.visible = false;
    scene.add(mesh);
    birds = { mesh, flight };
  })().catch(error => console.warn('[flugedla3d] the birds could not be loaded:', error?.message ?? error));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), fwd = new THREE.Vector3(), dir = new THREE.Vector3();
  const birdInfo = [];
  /** The birds at story second t, in the picture; they face the way the camera flies (as she does), the darting ones across it. */
  function poseBirds(t, { stage, stageCam, D }) {
    birdInfo.length = 0;
    if (!birds) return birdInfo;
    let n = 0;
    fwd.set(0, 0, -1).applyQuaternion(stageCam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(stageCam.quaternion);
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      const a = b.at(t);
      if (!a) continue;
      stage.framePoint(a[0], a[1], (a[2] * FJOR_D) / D, p, stageCam, D);
      // facing: toward the camera (they fly with us), or across the picture (the darting ones), level
      if (b.dart) { const later = b.at(t + 0.05); dir.copy(right).multiplyScalar(later && later[0] < a[0] ? -1 : 1); }
      else dir.copy(fwd).multiplyScalar(-1);
      dir.y = 0;
      dir.normalize();
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dir.z, dir.x));
      m4.compose(p, q, sc.setScalar(b.scale));
      birds.mesh.setMatrixAt(n, m4);
      const beat = Math.sin(TAU * b.beat * t + b.phase);
      birds.flight.setXY(n, 0.15 + 0.75 * beat, 1);
      birdInfo.push({ k: a[2], u: a[0], v: a[1], dart: Boolean(b.dart), world: p.toArray() });
      n++;
    }
    birds.mesh.count = n;
    birds.mesh.visible = n > 0;
    birds.mesh.instanceMatrix.needsUpdate = true;
    birds.flight.needsUpdate = true;
    return birdInfo;
  }

  // ---- the spray: a mist over the plunge pool (the world's), drops up at us on the climb (the picture's) ----
  const MIST = 160, DROPS = 70;
  const sprayGeo = new THREE.BufferGeometry();
  const pos = new Float32Array((MIST + DROPS) * 3), size = new Float32Array(MIST + DROPS), alpha = new Float32Array(MIST + DROPS);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const sprayMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mv; gl_PointSize = min( 90.0, aSize * uScale / max( 0.5, -mv.z ) ); vAlpha = aAlpha; }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() { float r = length( gl_PointCoord - 0.5 ) * 2.0; float a = ( 1.0 - smoothstep( 0.2, 1.0, r ) ) * vAlpha; if ( a < 0.01 ) discard; gl_FragColor = vec4( 0.94, 0.97, 1.0, a ); }`,
    transparent: true, depthWrite: false,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.name = 'flugedla3d spray';
  spray.frustumCulled = false;
  spray.visible = false;
  spray.renderOrder = 11;
  scene.add(spray);
  /** The spray at story second t (only round the falls' climb). */
  function poseSpray(t, { stage, stageCam, D, height }) {
    const on = t > FALLS_CLIMB.from - 1.5 && t < CREST.from + 1.0;
    spray.visible = on;
    if (!on) return 0;
    sprayMat.uniforms.uScale.value = height / (2 * Math.tan(rad(stageCam.fov) / 2));
    const fade = Math.min(1, (t - (FALLS_CLIMB.from - 1.5)) / 0.8) * Math.min(1, (CREST.from + 1.0 - t) / 0.8);
    // the mist: boiling up off the pool at the falls' foot, drifting out from the face
    for (let i = 0; i < MIST; i++) {
      const life = 3 + 2 * hash(i, 1), age = ((t + hash(i, 2) * life) % life) / life;
      const x = FALLS.face + 1 + age * (5 + 6 * hash(i, 3)), z = FALLS.z + (hash(i, 4) - 0.5) * (FALLS.width + 6);
      const y = FALLS.base + 0.5 + age * (8 + 10 * hash(i, 5));
      pos.set([x, y, z], i * 3);
      size[i] = 1.6 + 2.4 * age;
      alpha[i] = 0.32 * Math.sin(Math.PI * age) * fade;
    }
    // the drops: from beside her (k 0.8) up at the camera (k 0.3), in front of the screen, on the climb
    const climb = Math.max(0, Math.min(1, (t - FALLS_CLIMB.from) / 0.6)) * Math.max(0, Math.min(1, (FALLS_CLIMB.to + 0.6 - t) / 0.6));
    for (let j = 0; j < DROPS; j++) {
      const i = MIST + j;
      const life = 0.7 + 0.5 * hash(j, 6), age = ((t + hash(j, 7) * life) % life) / life;
      const u = 0.12 + 0.3 * hash(j, 8) + (hash(j, 9) - 0.5) * 0.25 * age, v = 0.55 + 0.3 * hash(j, 10) - 0.5 * age;
      const k = 0.85 - 0.55 * age;
      stage.framePoint(u, v, (k * FJOR_D) / D, p, stageCam, D);
      pos.set([p.x, p.y, p.z], i * 3);
      size[i] = 0.05 + 0.05 * hash(j, 11);
      alpha[i] = 0.7 * Math.sin(Math.PI * age) * climb;
    }
    sprayGeo.attributes.position.needsUpdate = true;
    sprayGeo.attributes.aSize.needsUpdate = true;
    sprayGeo.attributes.aAlpha.needsUpdate = true;
    return climb;
  }

  return { ready: Promise.all([flockReady, birdsReady]), poseFlock, hideFlock, poseBirds, poseSpray, flock, get birds() { return birds; }, spray };
}
