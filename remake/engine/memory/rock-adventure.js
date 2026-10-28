import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { makeContact } from './world-props.js';

const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const Y = new THREE.Vector3(0, 1, 0);
const GATHER = [[-1.8, -2.55], [-.65, -2.55]];
const SETTINGS = {
  home: { start: [-3, -3.55], end: [-4.28, -3.55], direction: -1, color: '#919b8d' },
  butterfly: { start: [3, -3.55], end: [4.28, -3.55], direction: 1, color: '#a8a18f' },
};

/** A small, deterministic scene action. Rules remain in adventure-rules.js. */
export function createRockAdventure({ scene, heightAt, contactResources, triNest }) {
  const root = new THREE.Group(); root.name = 'Tveir steinar og fiðrildi'; scene.add(root);
  const ownedGeometries = [], ownedMaterials = [], events = [];
  const material = options => { const value = new THREE.MeshStandardMaterial(options); ownedMaterials.push(value); return value; };
  const geometry = value => { ownedGeometries.push(value); return value; };
  let state = { unlocked: false, selected: false, active: null, completed: [] }, task = null, reducedMotion = false, elapsed = 0;
  let members = [], pairReady = false;
  const completed = new Set();
  const ground = (x, z, rise = .1) => new THREE.Vector3(x, heightAt(x, z) + rise, z);
  const rocks = [];

  // Rounded river stones have real volume, broad soft facets and a flat resting
  // face; their silhouette is deliberately different from every hiding leaf.
  const stoneGeometry = geometry(new THREE.SphereGeometry(1, 16, 10));
  const positions = stoneGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wobble = 1 + .035 * Math.sin(x * 7 + z * 3) * Math.cos(y * 5);
    positions.setXYZ(i, x * .64 * wobble, Math.max(.015, (y + 1) * .29), z * .57 * wobble);
  }
  stoneGeometry.computeVertexNormals();
  const ringGeometry = geometry(new THREE.RingGeometry(.72, .77, 40)); ringGeometry.rotateX(-Math.PI / 2);
  for (const [id, setting] of Object.entries(SETTINGS)) {
    const stone = new THREE.Group(); stone.name = id === 'home' ? 'Steinn við heimaleið' : 'Steinn við fiðrildi';
    const start = ground(...setting.start, .07), end = ground(...setting.end, .07); stone.position.copy(start); root.add(stone);
    const body = new THREE.Mesh(stoneGeometry, material({ color: setting.color, roughness: .96, metalness: 0 }));
    body.castShadow = true; body.receiveShadow = true; stone.add(body);
    const shadow = makeContact(contactResources, 1.65, 1.45); shadow.position.y = .018; stone.add(shadow);
    const rimMaterial = new THREE.MeshBasicMaterial({ color: '#f9dc8d', transparent: true, opacity: .75, depthWrite: false }); ownedMaterials.push(rimMaterial);
    const marker = new THREE.Mesh(ringGeometry, rimMaterial); marker.position.copy(start); marker.position.y += .03; marker.scale.z = .85; marker.visible = false; root.add(marker);
    rocks.push({ id, root: stone, body, marker, start, end, direction: setting.direction, moved: false });
  }

  // A continuous sandy entrance makes the home stone's purpose visible before
  // any label or animation: its body sits directly across this narrow opening.
  const pathPieces = [];
  for (let i = 0; i < 5; i++) {
    const z = -2.8 - i * .56, piece = new THREE.CircleGeometry(.57, 14); piece.rotateX(-Math.PI / 2);
    piece.scale(1, 1, .72); piece.translate(-3, heightAt(-3, z) + .085, z); pathPieces.push(piece);
  }
  const pathGeometry = geometry(mergeGeometries(pathPieces)); pathPieces.forEach(value => value.dispose());
  const path = new THREE.Mesh(pathGeometry, material({ color: '#c2af81', roughness: 1 })); path.receiveShadow = true; root.add(path);
  const flowerPieces = [];
  function flowerPart(shape, color) {
    const tint = new THREE.Color(color), values = new Float32Array(shape.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) tint.toArray(values, i);
    shape.setAttribute('color', new THREE.BufferAttribute(values, 3)); flowerPieces.push(shape);
  }
  for (const [x, z, rise] of [[2.35, -3.9, .3], [2.57, -4.02, .38], [3.5, -4.12, .27]]) {
    const y = heightAt(x, z) + .1, stem = new THREE.CylinderGeometry(.014, .021, rise, 5); stem.translate(x, y + rise / 2, z); flowerPart(stem, '#739456');
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * .4, part = new THREE.SphereGeometry(1, 6, 4); part.scale(.085, .025, .055); part.rotateY(-angle); part.translate(x + Math.cos(angle) * .064, y + rise, z + Math.sin(angle) * .064); flowerPart(part, '#edbea2');
    }
    const centre = new THREE.SphereGeometry(.04, 6, 4); centre.translate(x, y + rise + .02, z); flowerPart(centre, '#e4bd60');
  }
  const flowerGeometry = geometry(mergeGeometries(flowerPieces)); flowerPieces.forEach(value => value.dispose());
  const flowers = new THREE.Mesh(flowerGeometry, material({ vertexColors: true, roughness: 1 })); root.add(flowers);
  const pairRingGeometry = geometry(new THREE.RingGeometry(1.08, 1.12, 48)); pairRingGeometry.rotateX(-Math.PI / 2);
  const pairRingMaterial = new THREE.MeshBasicMaterial({ color: '#f3d583', transparent: true, opacity: .45, depthWrite: false }); ownedMaterials.push(pairRingMaterial);
  const pairRing = new THREE.Mesh(pairRingGeometry, pairRingMaterial); pairRing.scale.z = .54; pairRing.visible = false; root.add(pairRing);

  // The butterfly is a tiny articulated prop, hidden until the discovery rock
  // has moved. Four soft leaf-shaped wings share one geometry/material.
  const butterfly = new THREE.Group(); butterfly.name = 'Fiðrildi'; butterfly.visible = false; root.add(butterfly);
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.bezierCurveTo(.19, .38, .55, .42, .47, .13); wingShape.bezierCurveTo(.51, -.19, .24, -.3, 0, 0);
  const wingGeometry = geometry(new THREE.ShapeGeometry(wingShape, 10));
  const wingMaterial = material({ color: '#e9a54e', roughness: .85, side: THREE.DoubleSide });
  const wings = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); butterfly.add(hinge);
    const wing = new THREE.Mesh(wingGeometry, wingMaterial); wing.scale.x = side; hinge.add(wing); wings.push({ hinge, side });
  }
  const bodyGeometry = geometry(new THREE.CapsuleGeometry(.022, .22, 3, 6));
  const body = new THREE.Mesh(bodyGeometry, material({ color: '#745642', roughness: 1 })); butterfly.add(body);
  butterfly.rotation.x = -.35;
  const dustGeometry = geometry(new THREE.BufferGeometry()), dustPositions = new Float32Array(18 * 3);
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ size: .13, color: '#d9cba7', transparent: true, opacity: .35, depthWrite: false }); ownedMaterials.push(dustMaterial);
  const dust = new THREE.Points(dustGeometry, dustMaterial); dust.visible = false; dust.frustumCulled = false; root.add(dust);

  function gatherPoint(member) { return ground(...GATHER[member], .13); }
  function nestPoint(member) { return triNest.root.position.clone().add(new THREE.Vector3(member ? .43 : -.43, .1, .02)); }
  function pairCentre() { return completed.has('home') ? triNest.root.position.clone().add(new THREE.Vector3(0, .32, 0)) : ground(-1.225, -2.55, .52); }
  function ownsPair() { return pairReady && (Boolean(task) || !completed.has('home')); }
  function bindPair(actors) {
    if (pairReady || actors.length !== 2) return;
    members = actors; pairReady = true;
    members.forEach(actor => { actor.clearLook?.(); actor.setMotion('idle'); });
  }
  function setState(snapshot) {
    state = { ...snapshot, completed: [...(snapshot.completed ?? [])] };
    // State confirmation arrives after our completion event. Do not snap an
    // in-flight stone to the end when rules still retain the active task.
    for (const id of state.completed) completed.add(id);
  }
  function contactPose(rock, member, position = rock.root.position) {
    // Both beaks meet the same back face, while bodies fan apart instead of
    // interpenetrating at the broad frills and shoulders.
    const yaw = (rock.direction < 0 ? Math.PI : 0) + rock.direction * (member ? 1 : -1) * Math.PI / 9;
    const nose = (members[member]?.noseLocal?.clone() ?? new THREE.Vector3(.9, .4, 0)).multiply(members[member]?.root.scale ?? new THREE.Vector3(.82, .82, .82)).applyAxisAngle(Y, yaw);
    const nosePoint = new THREE.Vector3(position.x - rock.direction * .53, position.y + .32, position.z + (member ? .29 : -.29));
    const point = nosePoint.clone().sub(nose); point.y = heightAt(point.x, point.z) + .14;
    return { point, yaw, nosePoint };
  }
  function makeRoute(start, end, member, isReturn) {
    // Every route stays in the bare strip behind the leaf row. The intermediate
    // lane also prevents either actor cutting through a stationary stone.
    const lane = -2.15 - member * .12;
    const points = [start.clone()];
    if (isReturn && completed.has('home')) {
      points.push(ground(start.x, -4.45), ground(end.x, -4.45));
    } else {
      points.push(ground(start.x, lane), ground(end.x, lane));
    }
    points.push(end.clone());
    const lengths = [0]; for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + points[i].distanceTo(points[i - 1]));
    return { points, lengths, total: lengths.at(-1) };
  }
  function follow(actor, route, progress, dt, finalYaw) {
    const distance = smooth(progress) * route.total;
    let segment = 1; while (segment < route.lengths.length - 1 && distance > route.lengths[segment]) segment++;
    const a = route.points[segment - 1], b = route.points[segment], span = route.lengths[segment] - route.lengths[segment - 1];
    actor.root.position.lerpVectors(a, b, span > 0 ? (distance - route.lengths[segment - 1]) / span : 1);
    const direction = b.clone().sub(a), yaw = progress > .9 ? finalYaw : -Math.atan2(direction.z, direction.x);
    const difference = Math.atan2(Math.sin(yaw - actor.root.rotation.y), Math.cos(yaw - actor.root.rotation.y));
    actor.root.rotation.y += difference * (1 - Math.exp(-dt / .075));
  }
  function start(id) {
    const rock = rocks.find(value => value.id === id);
    if (!rock || !pairReady || task || completed.has(id) || !state.unlocked || !state.selected) return false;
    const durations = reducedMotion ? [.3, .1, .25, .1, .35] : [1.15, .35, .85, .3, 1.2];
    task = { id, phase: 'approach', age: 0, elapsed: 0, durations, rock, routes: members.map((actor, i) => makeRoute(actor.root.position, contactPose(rock, i).point, i, false)) };
    for (const actor of members) { actor.clearLook?.(); actor.walk?.(true); }
    return true;
  }
  function enterPhase(phase) {
    task.phase = phase; task.age = 0;
    if (phase === 'brace') {
      members.forEach(actor => { actor.walk?.(false); actor.setMotion('brace'); });
      events.push({ type: 'rock-push', id: task.id });
    } else if (phase === 'push') members.forEach(actor => actor.setMotion('push'));
    else if (phase === 'settle') {
      const rock = task.rock; rock.root.position.copy(rock.end); rock.moved = true; completed.add(task.id);
      if (task.id === 'butterfly') butterfly.position.copy(rock.start).add(new THREE.Vector3(0, .8, .08));
      members.forEach(actor => { actor.setMotion('idle'); if (task.id === 'butterfly') { actor.delight?.(); actor.lookAt?.(butterfly.position, { weight: .45, maxAngle: 18 }); } });
      butterfly.visible = completed.has('butterfly'); events.push({ type: 'rock-reveal', id: task.id });
    } else if (phase === 'return') {
      task.routes = members.map((actor, i) => makeRoute(actor.root.position, completed.has('home') ? nestPoint(i) : gatherPoint(i), i, true));
      members.forEach(actor => { actor.clearLook?.(); actor.walk?.(true); });
    }
  }
  function update(dt, clock) {
    if (dt > 0) elapsed = Number.isFinite(clock) ? clock : elapsed + dt;
    if (task && dt > 0) {
      task.age += dt; task.elapsed += dt;
      const stages = ['approach', 'brace', 'push', 'settle', 'return'], stageIndex = stages.indexOf(task.phase), duration = task.durations[stageIndex], progress = Math.min(1, task.age / duration);
      const rock = task.rock;
      if (task.phase === 'approach' || task.phase === 'return') {
        members.forEach((actor, i) => follow(actor, task.routes[i], progress, dt, task.phase === 'approach' ? contactPose(rock, i).yaw : (i ? -Math.PI * 2 / 3 : -Math.PI / 3)));
      } else if (task.phase === 'brace' || task.phase === 'push') {
        if (task.phase === 'push') { rock.root.position.lerpVectors(rock.start, rock.end, smooth(progress)); rock.body.rotation.z = reducedMotion ? 0 : Math.sin(progress * Math.PI * 4) * .018; }
        members.forEach((actor, i) => { const pose = contactPose(rock, i); actor.root.position.copy(pose.point); actor.root.rotation.y = pose.yaw; });
      }
      if (progress >= 1) {
        if (stageIndex < stages.length - 1) enterPhase(stages[stageIndex + 1]);
        else {
          const id = task.id;
          members.forEach((actor, i) => { actor.root.position.copy(completed.has('home') ? nestPoint(i) : gatherPoint(i)); actor.root.rotation.y = i ? -Math.PI * 2 / 3 : -Math.PI / 3; actor.walk?.(false); actor.clearLook?.(); actor.setMotion('idle'); });
          task = null; triNest.reunited = false; events.push({ type: 'rock-complete', id });
        }
      }
    }
    for (const rock of rocks) rock.marker.visible = pairReady && state.selected && !task && !completed.has(rock.id);
    pairRing.visible = pairReady && !task && state.unlocked && state.completed.length < 2;
    pairRing.position.copy(pairCentre()); pairRing.position.y = heightAt(pairRing.position.x, pairRing.position.z) + .12;
    pairRingMaterial.opacity = state.selected ? .62 : .2;
    butterfly.visible = completed.has('butterfly');
    if (butterfly.visible) {
      const origin = rocks[1].start, moving = !reducedMotion;
      butterfly.position.set(origin.x + (moving ? Math.sin(elapsed * 1.3) * .28 : 0), origin.y + .8 + (moving ? Math.sin(elapsed * 2.4) * .12 : 0), origin.z + .08 + (moving ? Math.cos(elapsed * 1.3) * .16 : 0));
      butterfly.rotation.y = moving ? Math.sin(elapsed * .8) * .35 : 0;
      wings.forEach(({ hinge, side }) => { hinge.rotation.y = side * (moving ? .35 + Math.sin(elapsed * 16) * .7 : .35); });
      if (task?.id === 'butterfly' && task.phase === 'settle') members.forEach(actor => actor.lookAt?.(butterfly.position, { weight: .45, maxAngle: 18 }));
    }
    dust.visible = !reducedMotion && task?.phase === 'push';
    if (dust.visible) {
      for (let i = 0; i < 18; i++) {
        const life = ((task.age * 1.8 + i / 18) % 1), angle = i * 2.39996;
        dustPositions[i * 3] = task.rock.root.position.x + Math.cos(angle) * (.3 + life * .38);
        dustPositions[i * 3 + 1] = task.rock.root.position.y + .04 + Math.sin(life * Math.PI) * .16;
        dustPositions[i * 3 + 2] = task.rock.root.position.z + Math.sin(angle) * (.3 + life * .32);
      }
      dustGeometry.attributes.position.needsUpdate = true;
    }
  }
  function alignContact() {
    if (!task || !['brace', 'push'].includes(task.phase)) return;
    members.forEach((actor, i) => {
      if (!actor.getNosePosition) return;
      actor.root.updateMatrixWorld(true);
      const actual = actor.getNosePosition(), wanted = contactPose(task.rock, i).nosePoint;
      actor.root.position.x += wanted.x - actual.x; actor.root.position.z += wanted.z - actual.z;
    });
  }
  function reset() {
    task = null; pairReady = false; members = []; elapsed = 0; events.length = 0; completed.clear();
    state = { unlocked: false, selected: false, active: null, completed: [] };
    for (const rock of rocks) { rock.root.position.copy(rock.start); rock.body.rotation.set(0, 0, 0); rock.moved = false; rock.marker.visible = false; }
    butterfly.visible = false; pairRing.visible = false; dust.visible = false;
  }
  return {
    setState, start, update, alignContact, reset, bindPair, ownsPair, gatherPoint, pairCentre,
    isHomeOpen: () => completed.has('home'),
    isBusy: () => Boolean(task),
    getTargets: () => rocks.map(rock => ({ type: 'rock', id: rock.id, point: rock.root.position.clone().add(new THREE.Vector3(0, .37, 0)), enabled: pairReady && state.selected && !task && !completed.has(rock.id) })),
    pollEvents() { return events.splice(0); },
    setReducedMotion(value) { reducedMotion = Boolean(value); if (reducedMotion) dust.visible = false; },
    getDebug: () => ({ active: task ? { id: task.id, phase: task.phase, elapsed: task.elapsed, progress: Math.min(1, task.age / task.durations[['approach', 'brace', 'push', 'settle', 'return'].indexOf(task.phase)]) } : null, selected: state.selected, pairReady, pathOpen: completed.has('home'), butterflyVisible: butterfly.visible, rocks: rocks.map(rock => ({ id: rock.id, moved: rock.moved, position: rock.root.position.toArray(), start: rock.start.toArray(), end: rock.end.toArray() })) }),
    dispose() { root.removeFromParent(); ownedGeometries.forEach(value => value.dispose()); ownedMaterials.forEach(value => value.dispose()); },
  };
}
