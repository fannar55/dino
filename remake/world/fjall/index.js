// The mountain of chapter 6 (its spec 2 and 8: "Fjallið er nýtt land"): not a whole mountain walked up but three small stages, each a
// place a chapter's location builds (engine/locations.js: `build`), with the view far off. The festival uses the top too.
//
//   createSlope(world, options)   the slope (slope.js): a ledge on the path up, on the far land of chapter 4's flight, east of the
//                                 ridge Grameðla walked along, looking east over the whole forest; the cloud above it
//   createBelt(world, options)    the belt of cloud (belt.js): bare ground under the cloud, the prints and the cloud (cloud.js)
//   createTop(world, options)     the top (top.js): flat and wide, the sea of cloud lying below it
//
// Each stands where a forest would: `group`, `heightAt(x, z)`, `update(dt, time)` (main.js calls it each frame) and `dispose()`. With
// `grey: true` they are as chunk 1 had them: bare ground in the valley's stand-in colours (world/ardalur/terrain.js GREY). Otherwise
// each has the game's own ground material and plants (look.js), the slope its view's trees (view.js), and the cloud is cards (look.js
// createCloudCards) lit by the scene's light.


export { createSlope } from './slope.js';
export { createBelt } from './belt.js';
export { createTop } from './top.js';
export { FJALL, groundMesh, smooth, linear, mixRGB, patchAt, seeded } from './ground.js';

