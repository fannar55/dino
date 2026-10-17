import * as THREE from 'three';

// Point specs name a place in the world. The camera director and actors resolve them every frame,
// so a shot or a look can follow a moving character.
//   [x, y, z]                          a fixed point in metres
//   'camera'                           the camera position
//   'mosi', 'mosi.head', 'mosi.feet'   an actor's body centre, head or ground point
//   { actor, part, offset, local }     an actor point plus an offset in metres; local = in the
//                                      actor's own frame (x forward, y up, z to its right side)
//   a THREE.Vector3, or a function(out) returning one
export function createPointResolver(world) {
  const offset = new THREE.Vector3();

  function actorPoint(name, part, offsetSpec, local, out) {
    const actor = world.actors.get(name);
    if (!actor) throw new Error(`No actor named "${name}"`);
    if (part === 'head') actor.headPosition(out);
    else if (part === 'feet' || part === 'ground') out.copy(actor.root.position);
    else actor.centre(out);
    if (offsetSpec) {
      offset.fromArray(offsetSpec);
      if (local) offset.applyQuaternion(actor.root.quaternion);
      out.add(offset);
    }
    return out;
  }

  return function resolvePoint(spec, out = new THREE.Vector3()) {
    if (spec == null) throw new Error('Missing point spec');
    if (Array.isArray(spec)) return out.fromArray(spec);
    if (spec.isVector3) return out.copy(spec);
    if (typeof spec === 'function') return out.copy(spec(out));
    if (spec === 'camera') return out.copy(world.camera.position);
    if (typeof spec === 'string') {
      const [name, part] = spec.split('.');
      return actorPoint(name, part, null, false, out);
    }
    if (typeof spec === 'object' && spec.actor) return actorPoint(spec.actor, spec.part, spec.offset, spec.local, out);
    throw new Error(`Unknown point spec: ${JSON.stringify(spec)}`);
  };
}

/** True when a spec follows something that can move (an actor or the camera). */
export function isLive(spec) {
  return typeof spec === 'string' || typeof spec === 'function' || Boolean(spec && typeof spec === 'object' && spec.actor);
}
