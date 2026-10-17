// Pass to capture.mjs as --eval "$(cat remake/tools/world/mask-eval.js)": draws the actors in
// flat white on black and hides everything else, so figure-ground.mjs can find their outline.
const w = window.__world;
const THREE = w.THREE;
const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
const roots = [...w.actors.values()].map(a => a.root);
const inActor = o => { for (let p = o; p; p = p.parent) if (roots.includes(p)) return true; return false; };
if (w.forest?.group) w.forest.group.visible = false; // the whole forest, its shadow casters too
w.scene.traverse(o => {
  if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
  if (inActor(o)) o.material = white;
  else o.visible = false;
});
w.scene.background = new THREE.Color(0x000000);
w.scene.fog = null;
w.scene.environment = null;
await new Promise(r => setTimeout(r, 300));
