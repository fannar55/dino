// Foundation test scene: Mosi in the new forest. It exists to build and check the forest, the
// camera director and the scene system; it is not a story chapter.
//
// Units are metres, at real size (STYLE.md section 3): Mosi is 8.5 m nose to tail and 4.2 m tall,
// standing at the origin facing +X; Egill is 1.1 m. Egill waits in the clearing; Mosi walks up to
// him, Egill waves and takes a few steps toward him, and Mosi says hello. Egill is a Tripo model
// rigged and animated by remake/tools/bake/bake-biped.js (idle, walk, wave, waveLeft, point, sit,
// lifted). Cameras stay at a child's eye height, so Mosi towers over the frame.
// The morning sun sits toward -X/+Z (azimuth 135 deg), so the hero shot gets side light.

// The tracking shot rides ahead of Mosi on his right (+Z) side, so we see his face as he walks in.
const TRACK = { offset: [8.4, 1.5, 11.4], lookOffset: [1.9, 0.5, 0] };
// Close-ups frame a point above the head bone, so the horns and frill stay in the picture.
const FACE = { actor: 'mosi', part: 'head', offset: [0, 0.75, 0] };
// Canopy at the forest edge on Mosi's left, as seen from the introduction shot: enough pan that his
// head leaves the frame completely instead of hanging at its edge.
const CANOPY = [11.5, 11, -15.4];
// Where Mosi glances while he speaks: up and a little to his left, inside his comfortable head turn.
const GLANCE = [21, 12.7, -5];
// Where Mosi's walk in ends. Egill waits a little way off, facing that spot; once Mosi has stopped he
// walks up in front of Mosi's head, to a point in Mosi's own frame taken as he sets off (so it follows
// Mosi wherever he stops). There the dialogue frames him over his shoulder, and Mosi turns to face him.
const MOSI_STOP = [0.5, 0.1];
const EGILL_WAITS = { position: [7.9, 0, 2.3], heading: 209 };
const EGILL_SPOT = { actor: 'mosi', part: 'head', offset: [2.9, 0, 2.2], local: true }; // ahead, to his right
// How far apart the two stand when Mosi stops: Egill's cues are counted from there.
const APART = Math.hypot(EGILL_WAITS.position[0] - MOSI_STOP[0], EGILL_WAITS.position[2] - MOSI_STOP[1]);

export const chapter = {
  id: 'grunnur',
  title: 'Grunnprófun',
  look: 'morning',
  layout: {
    seed: 11,
    clearing: { center: [0, 0], radius: 15 },
    forestEdge: 21,
    // A footpath enters the clearing from the left and leaves to the right (x, z points).
    path: [[-54, 16], [-32, 9.6], [-16, 4], [-4.8, 1], [6.4, -1.6], [22.4, -6.4], [48, -16]],
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
    wide: { position: [27, 6, 21], target: [0, 2, 0], fov: 45 },
    hero: { position: [13.9, 1.6, 9.7], target: [1.3, 2.3, 0], fov: 38 },
    face: { position: [8.9, 1.8, 3.4], target: [3.6, 2.8, 0.2], fov: 32 },
    low: { position: [11, 0.5, -8.9], target: [0, 3.6, 2.1], fov: 52 },
    path: { position: [-43, 2.2, 17.6], target: [-9.6, 1.5, 2.9], fov: 42 },
    canopy: { position: [12.8, 1.2, 14.4], target: [25.6, 10, 27], fov: 58 },
    // Looking into the morning sun: backlit foliage, rim light on Mosi, sun-tinted fog.
    rim: { position: [11.6, 1.5, -10.6], target: [0, 2.5, 0.8], fov: 40 },
    // From inside the forest toward the clearing: depth layers, shade, fog, framing trunks.
    inside: { position: [-22.4, 1.6, -14.4], target: [-3.2, 2, 0], fov: 42 },

    // Scene shots.
    opening: { position: [11.2, 6.5, 24], target: [-12.8, 2.2, 5.6], fov: 46 },
    openingIn: { position: [6.8, 4.2, 19.5], target: [-13.6, 2.2, 5.1], fov: 44 },
    track: {
      position: { actor: 'mosi', part: 'feet', offset: TRACK.offset },
      target: { actor: 'mosi', offset: TRACK.lookOffset },
      fov: 40,
    },
    // Dialogue: over Egill's left shoulder, his head low right and clear of Mosi's face (STYLE.md 8).
    intro: { position: { actor: 'egill', part: 'feet', offset: [1.0, 1.3, 2.9] }, frame: { subject: FACE, screen: [0.38, 0.3] }, fov: 46 },
    // A calm, backlit two-shot of Mosi and Egill, pulled back from where the orbit ends.
    closing: {
      position: { actor: 'mosi', part: 'feet', offset: [15.2, 2.6, -5.5] },
      target: { actor: 'mosi', offset: [2.5, -0.2, 0.75] },
      fov: 42,
    },
  },

  // The scene: a generator that yields what it waits for (remake/engine/scene/scheduler.js).
  *script(s) {
    const mosi = s.actor('mosi');
    const egill = s.actor('egill');
    yield mosi.place(-20, 5.4, -19);
    yield s.camera.cut('opening');
    yield s.ready(); // the start button; immediate in captures

    // Opening: a wide view over the clearing, slow dolly in, while Mosi comes out of the forest.
    // At 0.95 m/s his walk (3.6 m a cycle) plays at about 0.77x: big animals step slower.
    const arrival = mosi.walkTo([[-16, 4], [-9.9, 2.3], [-4.8, 1], MOSI_STOP], { speed: 0.95 });
    yield s.all(s.fade(0, 2.5), s.camera.move('openingIn', { duration: 10 }));

    // A tracking shot beside him until he reaches the middle of the clearing. Egill sees him coming
    // and looks up at him; when Mosi stops in front of him (the camera has just brought Egill into the
    // frame), he waves, then walks a few steps up to him (the walk brings his arm down). The camera
    // sees his left side, so he waves with his left hand.
    yield s.camera.cut('track');
    yield s.camera.follow('mosi', TRACK);
    const distance = () => mosi.raw.root.position.distanceTo(egill.raw.root.position);
    const greeting = s.after(0, function* greet() {
      yield s.until(() => distance() < APART + 7);
      yield egill.lookAt('mosi.head', { weight: 0.8, maxPitch: 40 });
      yield s.until(() => arrival.done);
      yield egill.play('waveLeft');
      yield s.wait(1.9); // about two and a half waves
      yield egill.walkTo(EGILL_SPOT, { speed: 0.55 });
    });
    yield s.all(arrival, greeting);
    yield s.wait(0.6);

    // Introduction: over Egill's shoulder, a soft push while Mosi turns to him and looks down at him.
    yield s.camera.cut('intro');
    yield mosi.lookAt('egill.head', { weight: 0.85 });
    yield s.all(mosi.turnTo('egill'), s.camera.push({ distance: 0.4, duration: 4 }));
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

    // Celebration: a slow orbit into the sun's rim light, away from Egill, so it ends on Mosi alone
    // (at real size his face and Egill's head are too far apart for one close frame).
    yield s.camera.orbit({ around: 'mosi', degrees: -70, duration: 15, radius: 8.5, fov: 42 });
    yield s.say('mosi', 'together');

    // Pull back and up to a calm two-shot that shows how small Egill is beside him, and fade out.
    yield s.all(s.camera.move('closing', { duration: 12 }), s.after(8.5, () => s.fade(1, 3.5)));
  },
};
