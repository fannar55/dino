import * as THREE from 'three';

const MAX = 192;
const dust = new THREE.Color('#c4ad7d'), leaf = new THREE.Color('#8aab55'), gold = new THREE.Color('#f4cd71'), cream = new THREE.Color('#fff1bf');
const puff = new THREE.Color('#f3ead2'), water = new THREE.Color('#cfeaf0'), spray = new THREE.Color('#9fd2e0'), mud = new THREE.Color('#6b4f30'), silt = new THREE.Color('#8f7248');
// What a splash of mud is made of (a landing in the marsh passes it as `colours`): mostly brown, a little spray.
export const MUD_COLOURS = Object.freeze([mud, silt, mud, water]);
// The game's own bursts, each a small recipe: how fast they spread and rise, how long they last, how big they are,
// how hard they fall, how opaque; `grow` keeps a drop's size where a puff swells, `fade` how late it fades. Shapes: 0 soft ball, 2 star, 3 drop.
const STYLES = {
  // A leaf squashed flat: a soft round puff of dust spreading out along the ground.
  poof: { shape: 0, colours: [puff], spread: [.5, .5], rise: [.15, .3], life: [.55, .3], size: [.26, .2], fall: .02, alpha: .8 },
  // Something found: bigger golden stars thrown up and falling slowly, twinkling as they turn.
  stars: { shape: 2, colours: [gold, cream, gold], spread: [.3, .55], rise: [.9, .8], life: [.95, .45], size: [.15, .15], fall: .55, alpha: .96, spin: 3.2 },
  // Water thrown up from a landing: big drops that arc high and drop back (the size is a radius in metres), easy to see from the search view.
  splash: { shape: 3, colours: [water, spray], spread: [.5, .8], rise: [1.8, 1.4], life: [.8, .4], size: [.11, .08], fall: 5, alpha: 1, grow: 1, fade: .5 },
};
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** One transparent draw for grounded dust and soft leaf fragments. All motion
 * uses the game clock; foot contacts remain independent of camera/action time. */
export function createWorldFx({ scene, heightAt, wet = () => false, wood = () => false }) {
  const particles = [], steps = [], positions = new Float32Array(MAX * 3), colours = new Float32Array(MAX * 3), sizes = new Float32Array(MAX), alpha = new Float32Array(MAX), kinds = new Float32Array(MAX), angles = new Float32Array(MAX);
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', positions, 3], ['color', colours, 3], ['aSize', sizes, 1], ['aAlpha', alpha, 1], ['aKind', kinds, 1], ['aAngle', angles, 1]]) geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uViewportHeight: { value: 800 } };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, vertexColors: true, fog: true,
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aKind; attribute float aAngle;
      uniform float uViewportHeight; varying vec3 vColour; varying float vAlpha; varying float vKind; varying float vAngle;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
      gl_PointSize=clamp(aSize*uViewportHeight*projectionMatrix[1][1]/max(1.0,-mvPosition.z),1.0,52.0);
      vColour=color;vAlpha=aAlpha;vKind=aKind;vAngle=aAngle;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vColour; varying float vAlpha; varying float vKind; varying float vAngle;
      #include <common>
      #include <fog_pars_fragment>
      void main(){vec2 p=gl_PointCoord*2.0-1.0;float cs=cos(vAngle),sn=sin(vAngle);p=mat2(cs,-sn,sn,cs)*p;
      float a;vec3 tint=vColour;
      if(vKind<.5){float r=length(p);float soft=1.0-smoothstep(.12,1.0,r);a=soft*soft*(.82+.18*cos(p.x*8.0+p.y*5.0));}
      else if(vKind<1.5){float shape=p.x*p.x*3.4+p.y*p.y; a=1.0-smoothstep(.62,1.0,shape);tint*=.88+.12*(1.0-smoothstep(0.0,.12,abs(p.x)));}
      else if(vKind<2.5){float star=pow(abs(p.x),.65)+pow(abs(p.y),.65);a=max(1.0-smoothstep(.80,1.05,star),exp(-dot(p,p)*7.0)*.18);}
      else {float r=length(p);a=1.0-smoothstep(.72,1.0,r);tint*=1.12-.3*r-.1*p.y;}
      gl_FragColor=vec4(tint,a*vAlpha);if(gl_FragColor.a<.005)discard;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Points(geometry, material); mesh.name = 'Fótaryk, lauf og vinaglampi'; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 10; scene.add(mesh);
  let sequence = 0, reduced = false, clock = 0, lastStep = -1, emitted = 0, footPuffs = 0, tracking = new WeakMap();
  function emit(kind, point, { count = kind === 'dust' ? 5 : 7, domain = 'world', strength = 1, ring = 0, colours = null } = {}) {
    if (reduced) return;
    const style = STYLES[kind];
    if (style) {
      for (let i = 0; i < count; i++) {
        // `ring` starts them evenly round a circle that wide, e.g. a puff from under the rim of a leaf.
        const seed = sequence++, a = ring ? (i + hash(seed) * .5) / count * Math.PI * 2 : hash(seed) * Math.PI * 2, speed = (style.spread[0] + hash(seed + 7) * style.spread[1]) * strength;
        particles.push({ x: point.x + Math.cos(a) * (.1 + ring), y: point.y + .1, z: point.z + Math.sin(a) * (.1 + ring), vx: Math.cos(a) * speed, vy: (style.rise[0] + hash(seed + 21) * style.rise[1]) * Math.min(1.3, strength), vz: Math.sin(a) * speed,
          age: 0, life: style.life[0] + hash(seed + 41) * style.life[1], size: style.size[0] + hash(seed + 63) * style.size[1], angle: a, spin: (hash(seed + 19) - .5) * (style.spin ?? 4), kind: style.shape,
          colour: (colours ?? style.colours)[i % (colours ?? style.colours).length].clone().multiplyScalar(.9 + hash(seed + 71) * .2), domain, fall: style.fall, alpha: style.alpha, grow: style.grow, fade: style.fade });
      }
      emitted += count; if (particles.length > MAX) particles.splice(0, particles.length - MAX);
      return;
    }
    const celebration = kind === 'match' || kind === 'reunion' || kind === 'hint';
    const isLeaf = kind === 'leaves', tint = celebration ? gold : isLeaf ? leaf : dust;
    for (let i = 0; i < count; i++) {
      const seed = sequence++, a = hash(seed) * Math.PI * 2, speed = ((celebration ? .24 : .07) + hash(seed + 7) * (celebration ? .58 : .25)) * strength;
      particles.push({ x: point.x + Math.cos(a) * (celebration ? .24 : .06), y: point.y + (celebration ? .20 : .035), z: point.z + Math.sin(a) * (celebration ? .24 : .06), vx: Math.cos(a) * speed, vy: (celebration ? .72 : isLeaf ? .27 : .10) + hash(seed + 21) * (celebration ? .5 : isLeaf ? .4 : .16), vz: Math.sin(a) * speed, age: 0, life: (celebration ? .95 : isLeaf ? .8 : .55) + hash(seed + 41) * .35, size: (celebration ? .10 : isLeaf ? .085 : .12) + hash(seed + 63) * (celebration ? .12 : isLeaf ? .075 : .10), angle: a, spin: (hash(seed + 19) - .5) * (celebration ? 1.5 : 4), kind: celebration ? 2 : isLeaf ? 1 : 0, colour: (celebration && i % 3 === 0 ? cream : tint).clone().multiplyScalar(.88 + hash(seed + 71) * .22), domain });
    }
    emitted += count; if (particles.length > MAX) particles.splice(0, particles.length - MAX);
  }
  function update(dt, { actionDt = dt, actors = [], feet = () => [], camera, viewportHeight = 800 } = {}) {
    uniforms.uViewportHeight.value = viewportHeight;
    if (dt <= 0) return;
    clock += dt;
    for (const actor of actors) {
      if (!actor.root.visible) { tracking.delete(actor); continue; }
      let track = tracking.get(actor); const root = actor.root.position;
      if (!track) { track = { position: root.clone(), distance: 0, age: 0, lastFoot: -1 }; tracking.set(actor, track); continue; }
      const moved = root.distanceTo(track.position); track.position.copy(root); track.age += dt;
      if (moved < .0005 || moved > .6) { track.distance = 0; continue; }
      const motion = actor.getDebugState?.().motion;
      if (!['walk', 'reach-walk', 'push'].includes(motion)) continue;
      track.distance += moved;
      if (track.distance < .40 || track.age < .20) continue;
      const points = feet(actor).map(bone => bone.getWorldPosition(new THREE.Vector3()));
      if (!points.length) continue;
      const lowest = Math.min(...points.map(p => p.y));
      let foot = points.findIndex((p, i) => i !== track.lastFoot && p.y <= lowest + .04);
      if (foot < 0) foot = points.findIndex(p => p.y === lowest);
      const contact = points[foot]; track.lastFoot = foot; track.age = 0; track.distance = 0;
      // Wood on the log and the boardwalk, splashes in the river and the marsh and the mud sloping into it, dust on soil.
      const surface = root.y > heightAt(root.x, root.z) + .30 || wood(contact.x, contact.z) ? 'wood' : wet(contact.x, contact.z) ? 'mud' : 'soil';
      if (surface === 'soil') { emit('dust', contact, { count: 2, strength: .6 }); footPuffs++; }
      else if (surface === 'mud') { emit('splash', contact, { count: 7, strength: .7, colours: MUD_COLOURS }); footPuffs++; }
      if (clock - lastStep >= .16) {
        const projected = camera ? contact.clone().project(camera).x : 0;
        steps.push({ type: 'footstep', surface, pan: Number.isFinite(projected) ? THREE.MathUtils.clamp(projected * .65, -.8, .8) : 0 }); lastStep = clock;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].age += particles[i].domain === 'action' ? actionDt : dt; if (particles[i].age >= particles[i].life) particles.splice(i, 1); }
    particles.forEach((p, i) => {
      const t = p.age / p.life, flutter = p.kind === 1 ? Math.sin(p.age * 7 + p.angle) * .06 : 0;
      positions[i * 3] = p.x + p.vx * p.age + flutter; positions[i * 3 + 1] = p.y + p.vy * p.age - (p.fall ?? (p.kind === 2 ? .18 : p.kind === 1 ? .34 : .02)) * p.age * p.age; positions[i * 3 + 2] = p.z + p.vz * p.age;
      p.colour.toArray(colours, i * 3); sizes[i] = p.size * (p.grow ?? (p.kind ? 1 : 1 + t * 1.8)); alpha[i] = (p.alpha ?? (p.kind === 2 ? .96 : p.kind === 1 ? .88 : .36)) * Math.sin(Math.min(1, t * 7) * Math.PI / 2) * (1 - t) ** (p.fade ?? (p.kind === 2 ? .85 : 1.5)); kinds[i] = p.kind; angles[i] = p.angle + p.spin * p.age;
    });
    geometry.setDrawRange(0, particles.length); mesh.visible = particles.length > 0 && !reduced;
    for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
  }
  return { emit, update, setReducedMotion(value) { reduced = Boolean(value); if (reduced) { particles.length = 0; mesh.visible = false; } },
    pollSteps: () => steps.splice(0), reset() { particles.length = steps.length = 0; tracking = new WeakMap(); mesh.visible = false; sequence = emitted = footPuffs = 0; clock = 0; lastStep = -1; },
    getDebug: () => ({ active: particles.length, emitted, footPuffs, reduced }),
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
