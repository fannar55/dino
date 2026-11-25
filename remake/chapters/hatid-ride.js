// The ride back (docs/superpowers/specs ride-back spec), the festival's last scene: a stub until its own tasks build it. It takes the
// hand-over the festival gives it as Egill is lifted (`hand`: egill, moth, mosi, top, sky, constellations, moon, seventh, lifted),
// cuts to the lift's shot from below and holds it a little, so the chapter ends the way it will (the book opens on the dinosaurs).
export const RIDE_STUB = { seconds: 6 };

export function* ride(s, c, hand) {
  c.log?.({ type: 'ride', stub: true, lifted: hand?.lifted ?? null });
  s.camera.cut('rise_down', { check: false });
  yield s.wait(RIDE_STUB.seconds);
}
