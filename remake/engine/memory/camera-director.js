import * as THREE from 'three';

const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const vector = value => Array.isArray(value) ? new THREE.Vector3(...value) : value.clone();

/** A deterministic, game-clock camera. Framing is solved on a separate camera
 * so requesting a view cannot move the paused scene. Overview is inspection. */
export function createCameraDirector({ camera, overview, fallback }) {
  const probe = camera.clone(), currentTarget = new THREE.Vector3(), fromPosition = new THREE.Vector3(), fromTarget = new THREE.Vector3();
  let width = 1280, height = 800, mode = 'auto', cue = null, cueKey = '', initialized = false, reduced = false;
  let destination = null, age = 1, duration = 1, moving = false, intent = 'glade', phase = 'idle', lastPoints = [];

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
    let near = description.scale === 'action' ? 8 : 12, far = 160;
    for (let i = 0; i < 27; i++) { const distance = (near + far) / 2; if (fits(distance)) far = distance; else near = distance; }
    fits(far * 1.015);
    lastPoints = points.map(p => p.toArray());
    return { position: probe.position.clone(), target: solvedTarget.clone() };
  }

  function request(force = false) {
    const description = mode === 'overview' ? overview() : cue ?? fallback();
    const key = `${mode}:${description.key ?? description.phase ?? 'glade'}`;
    phase = description.phase ?? 'idle';
    if (!force && key === cueKey) return;
    cueKey = key; intent = description.key ?? 'glade'; phase = description.phase ?? 'idle';
    destination = solve(description); fromPosition.copy(camera.position); fromTarget.copy(currentTarget);
    age = 0; duration = THREE.MathUtils.clamp(description.duration ?? 1.05, .8, 1.2); moving = true;
    if (!initialized) { camera.position.copy(destination.position); currentTarget.copy(destination.target); camera.lookAt(currentTarget); camera.updateMatrixWorld(true); age = duration; moving = false; initialized = true; }
  }

  function update(dt) {
    if (!(dt > 0) || !destination) return;
    if (moving) {
      age = reduced ? duration : Math.min(duration, age + dt);
      const blend = ease(age / duration);
      camera.position.lerpVectors(fromPosition, destination.position, blend); currentTarget.lerpVectors(fromTarget, destination.target, blend);
      moving = age < duration;
    }
    camera.lookAt(currentTarget); camera.updateMatrixWorld(true);
  }

  return {
    setViewport(w, h) { if (initialized && width === w && height === h) return; width = w; height = h; camera.aspect = width / height; camera.updateProjectionMatrix(); request(true); },
    setCue(value) { cue = value || null; request(); },
    setMode(value) { if (!['auto', 'overview'].includes(value)) return false; mode = value; request(); return true; },
    setReducedMotion(value) { reduced = Boolean(value); },
    reset() { mode = 'auto'; cue = null; cueKey = ''; initialized = false; request(true); },
    update,
    isInteractive: () => mode === 'auto' && !moving,
    isMoving: () => moving,
    mode: () => mode,
    focus: () => currentTarget.clone(),
    getDebug: () => ({ mode, intent, phase, moving, settled: !moving, worldInputEnabled: mode === 'auto' && !moving, progress: duration ? Math.min(1, age / duration) : 1, position: camera.position.toArray(), target: currentTarget.toArray(), destinationPosition: destination?.position.toArray() ?? [], destinationTarget: destination?.target.toArray() ?? [], framingPoints: lastPoints }),
  };
}
