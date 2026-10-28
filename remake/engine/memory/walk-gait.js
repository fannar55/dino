import * as THREE from 'three';

/** Read the authored foot cycle in metres instead of guessing a playback rate.
 * During stance a foot travels backwards relative to the body; moving the root
 * forwards by that distance leaves the planted foot in one world position. */
export function measureWalkGait(model, root, clip, feet, strideLength) {
  if (!clip || !feet.length) return null;
  root.updateMatrixWorld(true);
  const rest = feet.map(foot => root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())));
  const probe = new THREE.AnimationMixer(model), count = 120, tracks = feet.map(() => []);
  probe.clipAction(clip).play();
  for (let i = 0; i <= count; i++) {
    probe.setTime(i / count * clip.duration); root.updateMatrixWorld(true);
    feet.forEach((foot, k) => tracks[k].push(root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()))));
  }
  probe.stopAllAction(); probe.uncacheRoot(model);
  const dt = clip.duration / count;
  const speeds = tracks.map(track => {
    const floor = Math.min(...track.map(point => point.y)), ceiling = Math.max(...track.map(point => point.y));
    const low = floor + Math.max(.001, (ceiling - floor) * .08);
    let distance = 0, stance = 0;
    for (let i = 1; i <= count; i++) {
      const backward = track[i - 1].x - track[i].x;
      if (backward > 0 && track[i].y <= low && track[i - 1].y <= low) { distance += backward; stance += dt; }
    }
    return stance > 0 ? distance / stance : 0;
  }).filter(speed => speed > .01);
  if (!speeds.length) return null;
  const authoredSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const strideScale = THREE.MathUtils.clamp((strideLength ?? authoredSpeed * clip.duration) / (authoredSpeed * clip.duration), 1, 2.6);
  tracks.forEach((track,k)=>track.forEach(point=>{point.x=rest[k].x+(point.x-rest[k].x)*strideScale;}));
  const naturalSpeed=authoredSpeed*strideScale;
  const duty = tracks.reduce((sum, track, k) => sum + track.slice(1).filter(point => point.y - rest[k].y < .004).length / count, 0) / tracks.length;
  return { naturalSpeed, authoredSpeed, strideScale, cycle: clip.duration, tracks, duty: THREE.MathUtils.clamp(duty, .35, .8) };
}

export function gaitFoot(gait, phase, index, out) {
  const track = gait.tracks[index], u = ((phase % 1 + 1) % 1) * (track.length - 1), i = Math.min(track.length - 2, Math.floor(u));
  return out.lerpVectors(track[i], track[i + 1], u - i);
}
