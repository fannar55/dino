// The ride back (docs/superpowers/specs ride-back spec), the festival's last scene: a stub until its own tasks build it. It takes the
// hand-over the festival gives it as Egill is lifted (`hand`: egill, moth, mosi, top, sky, constellations, moon, seventh, lifted),
// holds the festival's last shot (the top from above, Egill in the light) a little with no cut, so the chapter ends the way it will (the
// book opens on the dinosaurs). The hand (hatid.js handOf, whole since Task 18): egill, moth (createMoth), mosi, top, sky (the night
// sky), constellations, moon (its face), seventh ({ azimuth, elevation, colour, point, star: createSeventh }), lifted ({ at, time }).
export const RIDE_STUB = { seconds: 6 };

export function* ride(s, c, hand) {
  c.log?.({ type: 'ride', stub: true, lifted: hand?.lifted ?? null });
  yield s.wait(RIDE_STUB.seconds);
}
