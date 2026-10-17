// Chapter locations: one chapter, several forests (a clearing, a fern glade), switched under a fade.
//
//   chapter.locations = { rjodur: { layout, shots }, burknalaut: { layout, shots } }
//   chapter.start = 'rjodur'          the location built and shown first
//
// A location is a forest's layout plus the shots set in that place. The forest is built from the
// layout with the shots in `layout.shots`, which the planner keeps clear (world/forest/plan.js); the
// director gets the shots of every location (main.js). A layout may also carry `actors` ({ name: { position,
// heading } }: who stands in that place, which the planner keeps clear as well, else it keeps the chapter's
// actors clear), `glade` ({ ferns, shafts }: a fern glade) and `leafShadows` (true: leaf shadows drifting over the
// floor, which a glade has too), see world/forest/forest.js.
//
//   const locations = createLocations({ world, locations: chapter.locations, build: layout => createForest(world, layout) });
//   await locations.setLocation(chapter.start);   // builds the first forest and shows it
//   await locations.setLocation('burknalaut');    // hides it, builds the next one if need be, shows that
//
// A forest is built the first time its location is shown and kept after that, hidden while another
// one shows. world.forest, world.heightAt and world.location follow the location in view. A switch
// is real async work (a build), so setLocation returns a promise; call it one switch at a time, as
// a script does with s.goTo.

/**
 * Every shot of a chapter, wherever it is set, for the director: its own (`chapter.shots`) and, for a chapter in several places,
 * each location's. A name set twice would frame one of the two wrongly without a word, so it is said: the place listed last
 * keeps it, as it always did.
 */
export function shotsOf(chapter) {
  if (!chapter.locations) return chapter.shots;
  const shots = { ...chapter.shots };
  const setIn = new Map(Object.keys(shots).map(name => [name, 'the chapter']));
  for (const [place, location] of Object.entries(chapter.locations)) {
    for (const [name, shot] of Object.entries(location.shots ?? {})) {
      if (setIn.has(name)) console.warn(`[locations] shot "${name}" is set in ${setIn.get(name)} and in ${place}: the director keeps ${place}'s`);
      setIn.set(name, place);
      shots[name] = shot;
    }
  }
  return shots;
}

/** The place a chapter in several places begins in, `chapter.start`, said clearly when it is missing or not one of them. */
export function startOf(chapter) {
  const names = Object.keys(chapter.locations);
  if (chapter.start == null) throw new Error(`A chapter with locations needs \`start\`, the place it begins in: one of ${names.join(', ')}`);
  if (!names.includes(chapter.start)) throw new Error(`The chapter starts in "${chapter.start}", which is not one of its places (${names.join(', ')})`);
  return chapter.start;
}

export function createLocations({ world, locations, build }) {
  const names = Object.keys(locations);
  const forests = new Map(); // location name -> promise of its forest, so a build is never started twice
  let current = null; // the name in view
  let shown = null; // the forest in view

  function forestOf(name) {
    if (!forests.has(name)) {
      const { layout, shots = {} } = locations[name];
      const building = Promise.resolve(build({ ...layout, shots }));
      forests.set(name, building);
      building.catch(() => forests.delete(name)); // a failed build may be tried again
    }
    return forests.get(name);
  }

  return {
    names,
    get current() { return current; },
    async setLocation(name) {
      if (!names.includes(name)) throw new Error(`No location named "${name}" (the chapter has ${names.join(', ')})`);
      const old = shown;
      if (old) old.group.visible = false; // out of the picture while the next one builds
      let forest;
      try {
        forest = await forestOf(name);
      } catch (error) {
        if (old) old.group.visible = true; // a failed build leaves the old location in view
        throw error;
      }
      forest.group.visible = true;
      shown = forest;
      current = name;
      world.forest = forest;
      world.heightAt = (x, z) => forest.heightAt(x, z);
      world.location = name;
    },
  };
}
