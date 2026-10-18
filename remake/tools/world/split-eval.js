// Pass to capture.mjs as --eval "$(cat remake/tools/world/split-eval.js)": renders the frame four
// ways and logs (console.warn, so it lands in report.json) the draw calls and triangles of the whole
// frame, the shadow pass alone, the main pass, and the forest's share. The forest's share is the
// frame minus the same frame with the forest hidden, so it includes the forest's own shadow casters
// (the budget counts them); forestMain is its main-pass part alone.
const w = window.__world;
const r = w.renderer;
const count = () => { r.info.reset(); r.render(w.scene, w.camera); return { calls: r.info.render.calls, tris: r.info.render.triangles }; };
const diff = (a, b) => ({ calls: a.calls - b.calls, tris: a.tris - b.tris });
const auto = r.shadowMap.autoUpdate;
const frame = count();
r.shadowMap.autoUpdate = false;
r.shadowMap.needsUpdate = false;
const main = count();
w.forest.group.visible = false;
const coreMain = count();
r.shadowMap.autoUpdate = auto;
const coreFrame = count();
w.forest.group.visible = true;
count();
console.warn('split ' + JSON.stringify({
  frame,
  shadowPass: diff(frame, main),
  mainPass: main,
  forest: diff(frame, coreFrame),
  forestMain: diff(main, coreMain),
}));
