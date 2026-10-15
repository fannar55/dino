// Foundation test scene: Mosi in the new forest. It exists to build and check the forest, the
// camera director and the scene system; it is not a story chapter.
//
// Units are metres. Mosi is about 4 m nose to tail and 2 m tall, standing at the origin facing +X.
// Egill (1.1 m) waits in the clearing; Mosi walks up to him, Egill waves and takes a few steps
// toward him, and Mosi says hello. Egill is a Tripo model rigged and animated by
// remake/tools/bake/bake-biped.js (idle, walk, wave, waveLeft, point, sit, lifted).
// The morning sun sits toward -X/+Z (azimuth 135 deg), so the hero shot gets side light.

// The tracking shot rides ahead of Mosi on his right (+Z) side, so we see his face as he walks in.
const TRACK = { offset: [4.0, 1.3, 5.4], lookOffset: [0.9, 0.2, 0] };
// Close-ups frame a point a little above the head bone, so the horns and frill stay in the picture.
const FACE = { actor: 'mosi', part: 'head', offset: [0, 0.35, 0] };
// Canopy at the forest edge on Mosi's left, as seen from the introduction shot: about 60 degrees
// of pan, so his head leaves the frame completely instead of hanging at its edge.
const CANOPY = [7.2, 10, -9.6];
// Where Mosi glances while he speaks: up and a little to his left, inside his comfortable head turn.
const GLANCE = [13, 7.5, -3];
// Where Mosi's walk in ends, and where Egill stands for the dialogue, facing that spot; Mosi then
// turns 20 degrees to face him. Egill waits a metre further back and walks up after waving.
const MOSI_STOP = [0.3, 0.05];
const EGILL = { position: [2.74, 0, 0.94], heading: 200 };
const EGILL_WAITS = (() => {
  const h = (EGILL.heading * Math.PI) / 180;
  return { position: [EGILL.position[0] - Math.cos(h), 0, EGILL.position[2] - Math.sin(h)], heading: EGILL.heading };
})();
// How far apart the two stand when Mosi stops: Egill's cues are counted from there.
const APART = Math.hypot(EGILL_WAITS.position[0] - MOSI_STOP[0], EGILL_WAITS.position[2] - MOSI_STOP[1]);

export const chapter = {
  id: 'grunnur',
  title: 'Grunnprófun',
  look: 'morning',
  layout: {
    seed: 11,
    clearing: { center: [0, 0], radius: 9 },
    forestEdge: 13,
    // A footpath enters the clearing from the left and leaves to the right (x, z points).
    path: [[-34, 10], [-20, 6], [-10, 2.5], [-3, 0.6], [4, -1], [14, -4], [30, -10]],
  },
  actors: {
    mosi: { url: '../assets/characters/mosi.glb', position: [0, 0, 0], heading: 0 },
    egill: { url: '../assets/characters/egill.glb', ...EGILL_WAITS },
  },
  // Caption names; the colour is the dark tone of each character's main hue (STYLE.md section 3).
  cast: {
    mosi: { name: 'Mosi', colour: '#4f5433' },
    egill: { name: 'Egill', colour: '#355774' },
  },
  // Lines with a recording name its id in remake/assets/audio/lines.json; the rest are timed by text.
  lines: {
    welcome: { text: 'Halló, Egill! Velkominn heim til mín! Ég heiti Mosi. Eigum við að skoða okkur aðeins um saman?', audio: 'welcome' },
    yes: { text: 'Frábært! Sjáðu hvað skógurinn er fallegur í morgunsólinni.' },
    later: { text: 'Allt í lagi, við förum seinna. Sjáðu samt hvað skógurinn er fallegur.' },
    together: { text: 'Komdu, við skulum skoða skóginn saman!' },
  },
  // The camera shows this shot while the start button waits.
  startShot: 'opening',
  // Static review shots (?shot=name) and the scene's named shots. Metres; vertical fov in degrees.
  shots: {
    wide: { position: [17, 4.6, 13], target: [0, 1.0, 0], fov: 45 },
    hero: { position: [6.6, 1.45, 4.6], target: [0.6, 1.1, 0], fov: 38 },
    face: { position: [4.2, 1.45, 1.6], target: [1.7, 1.3, 0.1], fov: 32 },
    low: { position: [5.2, 0.4, -4.2], target: [0, 1.7, 1], fov: 52 },
    path: { position: [-27, 2.0, 11], target: [-6, 1.0, 1.8], fov: 42 },
    canopy: { position: [8, 1.0, 9], target: [16, 8, 17], fov: 58 },
    // Looking into the morning sun: backlit foliage, rim light on Mosi, sun-tinted fog.
    rim: { position: [5.5, 1.3, -5.0], target: [0, 1.2, 0.4], fov: 40 },
    // From inside the forest toward the clearing: depth layers, shade, fog, framing trunks.
    inside: { position: [-14, 1.6, -9], target: [-2, 1.2, 0], fov: 42 },

    // Scene shots.
    opening: { position: [7, 6.0, 15], target: [-8, 1.5, 3.5], fov: 46 },
    openingIn: { position: [3.5, 3.6, 11.5], target: [-8.5, 1.4, 3.2], fov: 44 },
    track: {
      position: { actor: 'mosi', part: 'feet', offset: TRACK.offset },
      target: { actor: 'mosi', offset: TRACK.lookOffset },
      fov: 40,
    },
    // Dialogue: over Egill's left shoulder, his head low right and clear of Mosi's face (STYLE.md 8).
    intro: { position: [2.86, 1.45, 2.37], frame: { subject: FACE, screen: [0.38, 0.32] }, fov: 44 },
    // A calm, backlit two-shot of Mosi and Egill, pulled back from where the orbit ends.
    closing: {
      position: { actor: 'mosi', part: 'feet', offset: [7.2, 2.3, -2.6] },
      target: { actor: 'mosi', offset: [1.2, -0.1, 0.35] },
      fov: 42,
    },
  },

  // The scene: a generator that yields what it waits for (remake/engine/scene/scheduler.js).
  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    yield mosi.place(-12.5, 3.4, -19);
    yield s.camera.cut('opening');
    yield s.ready(); // the start button; immediate in captures

    // Opening: a wide view over the clearing, slow dolly in, while Mosi comes out of the forest.
    // At 0.65 m/s his walk (1.7 m a cycle) plays at about 1.1x: a footfall every 0.65 s.
    const arrival = mosi.walkTo([[-10, 2.5], [-6.2, 1.45], [-3, 0.6], MOSI_STOP], { speed: 0.65 });
    yield s.all(s.fade(0, 2.5), s.camera.move('openingIn', { duration: 9 }));

    // A tracking shot beside him until he reaches the middle of the clearing. Egill sees him coming:
    // he looks up at him, and waves from when the camera brings him into the frame (Mosi about 0.9 m
    // from his stop). The camera sees his left side, so he waves with his left hand. Then he walks a
    // few steps toward Mosi (the walk brings his arm down), to where the dialogue frames him.
    yield s.camera.cut('track');
    yield s.camera.follow('mosi', TRACK);
    const distance = () => mosi.raw.root.position.distanceTo(egill.raw.root.position);
    const greeting = s.after(0, function* greet() {
      yield s.until(() => distance() < APART + 4.4);
      yield egill.lookAt('mosi.head', { weight: 0.8 });
      yield s.until(() => distance() < APART + 0.9);
      yield egill.play('waveLeft');
      yield s.wait(1.9); // about two and a half waves
      yield egill.walkTo([EGILL.position[0], EGILL.position[2]], { speed: 0.55 });
    });
    yield s.all(arrival, greeting);
    yield s.wait(0.6);

    // Introduction: over Egill's shoulder, a soft push while Mosi turns to him and looks at him.
    yield s.camera.cut('intro');
    yield mosi.lookAt('egill.head', { weight: 0.85 });
    yield s.all(mosi.turnTo('egill'), s.camera.push({ distance: 0.3, duration: 4 }));
    s.camera.handheld(0.6, { duration: 1.5 }); // fades in under the line
    yield s.say('mosi', 'welcome');

    // The camera settles completely before the child chooses (STYLE.md section 8).
    yield s.camera.handheld(0, { duration: 0.8 });
    const answer = yield s.choose([
      { label: 'Já, gerum það!', value: 'yes' },
      { label: 'Seinna', value: 'later' },
    ]);

    // He points the forest out (one motion at a time: he speaks, then the camera pans up into the
    // canopy on his left), then the camera comes back down with a zoom to his face.
    yield mosi.lookAt(GLANCE, { weight: 0.75 });
    yield s.say('mosi', answer);
    yield s.camera.lookAt(CANOPY, { duration: 8 });
    yield s.wait(1.2);
    yield mosi.lookAt('camera', { weight: 0.85 });
    yield s.camera.move({ frame: { subject: FACE, screen: [0.5, 0.46] }, fov: 34, label: 'face' }, { duration: 8.5 });

    // Celebration: a slow orbit into the sun's rim light that widens into a two-shot with Egill;
    // the camera stays above his head, so he never blocks Mosi's face.
    yield s.camera.orbit({ around: 'mosi', degrees: -55, duration: 9, radius: 5, fov: 42 });
    yield s.say('mosi', 'together');

    // Pull back and up to a calm closing frame, and fade out.
    yield s.all(s.camera.move('closing', { duration: 6 }), s.after(3.5, () => s.fade(1, 2.5)));
  },
};
