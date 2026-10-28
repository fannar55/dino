import * as THREE from 'three';

const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const vector = value => Array.isArray(value) ? new THREE.Vector3(...value) : value.clone();
const SHOT_KINDS = ['wide', 'face', 'hero', 'follow', 'shoulder'];

/** A deterministic, game-clock camera. Framing is solved on a separate camera
 * so requesting a view cannot move the paused scene. Overview is inspection.
 *
 * Two layers. The cue layer frames the current cue (the glade, a task) and glides between cues.
 * A scripted shot (shot()) overrides it until release(), which glides (or cuts) back to the cue's
 * frame, exactly as it was. nudge() and shake() are small offsets over either. World input is off
 * while a shot holds the camera. Reduced motion turns every glide into a cut, and drops nudge and shake. */
export function createCameraDirector({ camera, overview, fallback }) {
  const probe = camera.clone(), currentTarget = new THREE.Vector3(), fromPosition = new THREE.Vector3(), fromTarget = new THREE.Vector3();
  const basePosition = new THREE.Vector3(), baseTarget = new THREE.Vector3();
  let width = 1280, height = 800, mode = 'auto', cue = null, cueKey = '', initialized = false, reduced = false;
  let destination = null, age = 1, duration = 1, moving = false, intent = 'glade', phase = 'idle', lastPoints = [], lastDirection = null;
  // Shot layer: the pose a shot holds, where its glide started, and the glide back after release().
  let shot = null, returning = null, nudging = null, shaking = null, clock = 0;
  const shotPosition = new THREE.Vector3(), shotTarget = new THREE.Vector3(), offset = new THREE.Vector3();

  function solve(description) {
    const aspect = width / height, portrait = aspect < 1;
    const points = (description.points?.length ? description.points : fallback().points).map(vector);
    const focus = description.focus ? vector(description.focus) : new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const direction = vector(description.direction ?? (portrait ? [-.08, .84, .54] : [.25, .52, .82])).normalize();
    probe.aspect = aspect; probe.fov = camera.fov; probe.updateProjectionMatrix();
    const topPixels = width < 600 ? 164 : portrait ? 145 : 160, bottomPixels = mode === 'overview' ? 96 : width < 600 ? 140 : 130;
    const horizontal = 1 - 2 * (width < 600 ? 26 : 42) / width, top = 1 - 2 * topPixels / height, bottom = -1 + 2 * bottomPixels / height;
    const projected = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    let solvedTarget = focus.clone();
    function fits(distance) {
      const target = focus.clone();
      for (let iteration = 0; iteration < 4; iteration++) {
        probe.position.copy(target).addScaledVector(direction, distance); probe.lookAt(target); probe.updateMatrixWorld(true);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of points) { projected.copy(p).project(probe); minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x); minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y); }
        solvedTarget.copy(target);
        if (iteration === 3) return minX >= -horizontal && maxX <= horizontal && minY >= bottom && maxY <= top;
        const scale = distance * Math.tan(THREE.MathUtils.degToRad(probe.fov / 2));
        right.setFromMatrixColumn(probe.matrixWorld, 0); up.setFromMatrixColumn(probe.matrixWorld, 1);
        target.addScaledVector(right, (minX + maxX) * .5 * scale * aspect).addScaledVector(up, ((minY + maxY - top - bottom) * .5) * scale);
      }
    }
    let near = description.scale === 'close' ? 2.2 : description.scale === 'action' ? 8 : 12, far = 160;
    for (let i = 0; i < 27; i++) { const distance = (near + far) / 2; if (fits(distance)) far = distance; else near = distance; }
    fits(far * 1.015);
    if (!description.shot) { lastPoints = points.map(p => p.toArray()); lastDirection = direction.clone(); }
    return { position: probe.position.clone(), target: solvedTarget.clone() };
  }

  function request(force = false) {
    const description = mode === 'overview' ? overview() : cue ?? fallback();
    const key = `${mode}:${description.key ?? description.phase ?? 'glade'}`;
    phase = description.phase ?? 'idle';
    if (!force && key === cueKey) return;
    cueKey = key; intent = description.key ?? 'glade'; phase = description.phase ?? 'idle';
    destination = solve(description); fromPosition.copy(basePosition); fromTarget.copy(baseTarget);
    age = 0; duration = THREE.MathUtils.clamp(description.duration ?? 1.05, .8, 1.2); moving = true;
    if (!initialized) { basePosition.copy(destination.position); baseTarget.copy(destination.target); compose(); age = duration; moving = false; initialized = true; }
  }

  // The horizontal "front" of a shot: toward where the search camera stands, unless the shot says otherwise.
  function frontOf(options) {
    const given = typeof options.front === 'function' ? options.front() : options.front;
    const front = given ? vector(given) : (lastDirection ?? new THREE.Vector3(.25, .52, .82)).clone();
    front.y = 0; if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
    return front.normalize();
  }
  const lifted = (front, degrees) => { const r = THREE.MathUtils.degToRad(degrees); return front.clone().multiplyScalar(Math.cos(r)).setY(Math.sin(r)); };
  function solveShot(options) {
    const subjects = (options.subjects?.() ?? []).filter(Boolean).map(vector);
    if (!subjects.length) return null;
    const front = frontOf(options), points = [];
    const box = (p, r, below, above) => { for (const dx of [-r, r]) for (const dz of [-r, r]) for (const dy of [-below, above]) points.push(new THREE.Vector3(p.x + dx, Math.max(0, p.y + dy), p.z + dz)); };
    let direction, scale = 'action';
    if (options.kind === 'face') { subjects.forEach(p => box(p, .5, .55, .45)); direction = lifted(front, options.elevation ?? 11); scale = 'close'; }
    else if (options.kind === 'hero') { subjects.forEach(p => box(p, .7, p.y, .5)); direction = lifted(front, options.elevation ?? 3); scale = 'close'; }
    else if (options.kind === 'shoulder') {
      // subjects[0] is the shoulder (Mosi's head); the camera stands behind it, looking at the rest.
      const [shoulder, ...rest] = subjects, look = rest.length ? rest.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / rest.length) : shoulder.clone().add(front);
      const back = shoulder.clone().sub(look).setY(0); if (back.lengthSq() < 1e-6) back.copy(front);
      back.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), .32);
      box(shoulder, .4, .3, .4); rest.forEach(p => box(p, .9, p.y, .6)); direction = lifted(back, options.elevation ?? 18);
    } else { subjects.forEach(p => box(p, 1.3, p.y, 1.1)); direction = lifted(front, options.elevation ?? (options.kind === 'follow' ? 26 : 24)); scale = options.kind === 'wide' ? 'wide' : 'action'; }
    return solve({ shot: true, points, direction, scale: options.scale ?? scale });
  }

  function compose() {
    camera.position.copy(basePosition); currentTarget.copy(baseTarget);
    if (mode === 'auto' && shot?.active) { camera.position.copy(shotPosition); currentTarget.copy(shotTarget); }
    else if (mode === 'auto' && returning) {
      const blend = ease(Math.min(1, returning.age / returning.duration));
      camera.position.lerpVectors(returning.position, basePosition, blend); currentTarget.lerpVectors(returning.target, baseTarget, blend);
    }
    if (nudging) {
      // Along the ray from the camera through the point: the point keeps its place on screen.
      const envelope = Math.sin(Math.PI * Math.min(1, nudging.age / nudging.seconds));
      offset.copy(nudging.point).sub(camera.position).multiplyScalar(nudging.amount * envelope);
      camera.position.add(offset); currentTarget.add(offset);
    }
    if (shaking) {
      const fade = (1 - Math.min(1, shaking.age / shaking.seconds)) ** 2, t = clock * 31;
      camera.position.add(offset.set(Math.sin(t * 1.7), Math.sin(t * 2.3 + 1.1), Math.sin(t * 1.3 + 2.2)).multiplyScalar(shaking.strength * fade));
    }
    camera.lookAt(currentTarget); camera.updateMatrixWorld(true);
  }

  function updateShot(dt) {
    if (!shot) return;
    if (!shot.active) {
      // The shot starts on the first game tick after it was asked for: a paused camera never moves.
      const solved = solveShot(shot.options); if (!solved) { shot = null; return; }
      shot.active = true; shot.age = 0;
      shot.fromPosition = camera.position.clone(); shot.fromTarget = currentTarget.clone();
      shot.to = solved; returning = null;
      if (shot.cut || reduced) { shotPosition.copy(solved.position); shotTarget.copy(solved.target); shot.age = shot.duration; return; }
    } else if (shot.options.kind === 'follow') {
      const solved = solveShot(shot.options);
      if (solved) shot.to = solved;
    }
    shot.age = Math.min(shot.duration, shot.age + dt);
    if (shot.age < shot.duration) {
      const blend = ease(shot.age / shot.duration);
      shotPosition.lerpVectors(shot.fromPosition, shot.to.position, blend); shotTarget.lerpVectors(shot.fromTarget, shot.to.target, blend);
    } else if (shot.options.kind === 'follow' && !reduced) {
      // Track the moving group softly instead of locking to every footstep.
      const k = 1 - Math.exp(-dt / .35);
      shotPosition.lerp(shot.to.position, k); shotTarget.lerp(shot.to.target, k);
    } else { shotPosition.copy(shot.to.position); shotTarget.copy(shot.to.target); }
  }

  function update(dt) {
    if (!(dt > 0) || !destination) return;
    clock += dt;
    if (moving) {
      // Under a held shot the cue's own glide is not on screen: finish it at once.
      age = reduced || shot ? duration : Math.min(duration, age + dt);
      const blend = ease(age / duration);
      basePosition.lerpVectors(fromPosition, destination.position, blend); baseTarget.lerpVectors(fromTarget, destination.target, blend);
      moving = age < duration;
      if (!moving) { basePosition.copy(destination.position); baseTarget.copy(destination.target); }
    }
    updateShot(dt);
    if (returning) { returning.age += reduced ? returning.duration : dt; if (returning.age >= returning.duration) returning = null; }
    if (nudging) { nudging.age += dt; if (nudging.age >= nudging.seconds || reduced) nudging = null; }
    if (shaking) { shaking.age += dt; if (shaking.age >= shaking.seconds || reduced) shaking = null; }
    compose();
  }

  const held = () => Boolean(shot || returning);
  return {
    setViewport(w, h) { if (initialized && width === w && height === h) return; width = w; height = h; camera.aspect = width / height; camera.updateProjectionMatrix(); request(true); if (shot?.active) { const solved = solveShot(shot.options); if (solved) { shot.to = solved; shotPosition.copy(solved.position); shotTarget.copy(solved.target); shot.age = shot.duration; } } },
    setCue(value) { cue = value || null; request(); },
    setMode(value) { if (!['auto', 'overview'].includes(value)) return false; mode = value; request(); return true; },
    setReducedMotion(value) { reduced = Boolean(value); },
    reset() { mode = 'auto'; cue = null; cueKey = ''; initialized = false; shot = returning = nudging = shaking = null; request(true); },
    update,
    /** Hold a scripted shot until release(). `subjects` gives the points to frame (re-read every frame for 'follow'). */
    shot({ kind = 'wide', subjects, cut = true, duration = 1.05, front, elevation, scale } = {}) {
      if (!SHOT_KINDS.includes(kind) || typeof subjects !== 'function') return false;
      shot = { options: { kind, subjects, front, elevation, scale }, cut: Boolean(cut), duration: Math.max(.05, Number(duration) || 1.05), active: false, age: 0 };
      return true;
    },
    /** Back to the cue's frame: a glide (or a cut), after which world input returns. */
    release({ cut = false, duration = 1.05 } = {}) {
      if (!shot) return false;
      const from = shot.active ? { position: shotPosition.clone(), target: shotTarget.clone() } : null;
      shot = null;
      returning = from && !cut && !reduced ? { position: from.position, target: from.target, age: 0, duration: Math.max(.05, Number(duration) || 1.05) } : null;
      compose();
      return true;
    },
    shake(strength = .12, seconds = .35) { if (reduced) return false; shaking = { strength, seconds: Math.max(.05, seconds), age: 0 }; return true; },
    nudge(point, amount = .06, seconds = .5) { if (reduced || !point) return false; nudging = { point: vector(point), amount, seconds: Math.max(.05, seconds), age: 0 }; return true; },
    isInteractive: () => mode === 'auto' && !moving && !held(),
    isMoving: () => moving,
    isHeld: held,
    mode: () => mode,
    focus: () => currentTarget.clone(),
    getDebug: () => ({ mode, intent, phase, moving, settled: !moving && !held(), shot: shot ? shot.options.kind : null, held: held(), returning: Boolean(returning), nudging: Boolean(nudging), worldInputEnabled: mode === 'auto' && !moving && !held(), progress: duration ? Math.min(1, age / duration) : 1, position: camera.position.toArray(), target: currentTarget.toArray(), destinationPosition: destination?.position.toArray() ?? [], destinationTarget: destination?.target.toArray() ?? [], framingPoints: lastPoints }),
  };
}
