/**
 * The 3D world of each level. A level's description (levels/<id>.js) says what the rules, the story and the words need; its world
 * (levels/<id>/world.js) is what stands in the scene beyond the leaves: the ground, the props, the scenes of its steps and the mover that
 * plays them. world.js (shared) builds the renderer, the camera director, the leaves, the nests, the friends and Mosi, the reveal, the
 * match, the hops home, the gifts, the effects, the idle play, the dynamic resolution and the debug, and asks the level's world for the rest.
 *
 * A level's world is a module `levels/<id>/world.js` that exports `createLevelWorld(stage)`; `loadLevelWorld(id)` imports it when the
 * level is played (a level that is not played is never loaded).
 *
 * `stage` is what the shared world gives it:
 *   THREE, scene, params (the page's query), level (the description), nests, scenes (the scene runner), fx, cue(points, options)
 *   heightAt(x, z), time() (game seconds), reducedMotion(), giftsWait() (a gift pair is still to land in the basket)
 *   mosi (the scripts' Mosi: look, gesture, head, body, yaw; `mosi.actor` is the actor), babies (the friends' actors), forest, leaves (the
 *   leaves' places), onLeafGround(x, z, margin), hopOver(point) (how high a friend hops over the closed leaves on the way)
 *   director (the camera director), idle (the waiting friends' play), refresh() (the camera's cue or the targets changed: look again)
 *   planWalk(actor, end, { yaw, allowEndContact, allowStartContact }), planSpent(actor, id), cancelWalk(actor)  the friends' walks
 *   and what the scripts of the first minute use (scenes/first-minute.js): head, crown, camera, look, gesture, pair, friends, homeOf,
 *   pairGesture, say, cut, beat, gifts, sendHome, home, forceHome, homePoint, homeEnd, faceCamera, sideOn, faceOn, planMeeting.
 * `createLevelWorld(stage)` runs before the forest is grown, so it only makes closures and its `layout`; what needs the forest, the leaves
 * or the rests is made in `build()`. The scripts of its own steps (scenes/) get the stage with the level's additions (`task`, Mosi's walk).
 *
 * `createLevelWorld(stage)` returns
 *   layout            what the forest is grown from: { keepOut(x, z), path, lift(x, z), dress({ avoid }) }, and any other key of the forest's
 *                     layout (world/forest/forest.js) the level replaces: level 2 gives its own `clearing` and `farRings`
 *   build()           once the forest, the leaves and the rests stand: the ground's look, the props, the mover; it may return a promise
 *                     (a level that loads models), which the stage waits for
 *   afterBabies(actors)?   the friends' actors exist and have their levels of detail, before the scene is compiled: a level that changes their skins (level 2's
 *                     plates that glow) does it here
 *   overviewPoints    the points (besides the board, the rests and Mosi) the overview keeps in the frame: [[x, y, z]...]
 *   cameraCue(glade)  the camera's cue now (what the mover shows), or glade() (the search view's cue)
 *   getTargets()      the obstacles: [{ id, point, enabled, next, tapAlong, radius?, unbuilt? }] (tapAlong: a script waits for taps on it;
 *                     radius in metres, if given, makes the button at least as wide as the obstacle looks; unbuilt: its scene is not
 *                     built yet, so the gold arrow never points at it)
 *   tapPoint(id)      where the big tap-along button of obstacle `id` sits
 *   playStep(id, options)   plays step `id` (its script): the script's id, or null when it cannot start now
 *   startFail(species, target)   a wrong pair's go at an obstacle (true, or false when it cannot start now)
 *   isBusy()          a step, a walk or a go is running
 *   setStepState(state)   the step rules' state (step-rules.js getState()), every time it changes
 *   setReducedMotion(value)   calm motion (the mover's, and Mosi's clip: he is the level's when he walks)
 *   update(dt), afterActors(dt), updateMosi(dt)?   every frame, around the friends' own update (and, where Mosi's own update follows)
 *   pollEvents()      the events raised since the last call ({ type, id... }; 'bridge-complete' and 'bridge-blocked' end or stop a step)
 *   navObjects()      what the friends' walks keep clear of: [{ id, a, b, radius, parts }]
 *   mosiPlace()       where Mosi stands ({ x, z, heading }) or null while he walks; mosiObstacle(): the friends' walks keep clear of him
 *   bindPair(species, members), ownsPair(species), pairCentre(species), hasTravelReservation(actor), visited(), nestSelectable(species)
 *                     the pairs at work: who is on a job or on the way to it, where, and whether the child may greet a pair at its home
 *   wet(x, z)?, wood(x, z)?, riverDistance(x, z)?   the water and wood under the effects, the river the walks keep out of
 *   avoidIdle(x, z)   why a waiting friend may not play there ('wet', 'boardwalk'...); null when it may
 *   getDebug({ collision })   { bridge (the mover's debug), mosiWalk, mosiAcross, river, collisionObjects } for the page's debug
 *   reset()           a new round; dispose()
 * (A member marked ? may be left out.)
 */
const WORLDS = Object.freeze({
  berjalundur: () => import('./berjalundur/world.js'),
  steinagljufur: () => import('./steinagljufur/world.js'),
});

/** The `createLevelWorld` function of level `id`. */
export async function loadLevelWorld(id) {
  const load = Object.hasOwn(WORLDS, id) ? WORLDS[id] : null;
  if (!load) throw new RangeError(`There is no world for the level "${id}".`);
  return (await load()).createLevelWorld;
}
