/** Reserve room for the fixed-height child controls on shorter portrait phones.
 * This is a lens shift, not an actor/camera-position change: entrances retain
 * their continuous world-space path and use the same projection in every mode.
 */
export function applyViewportFraming(camera, viewport, { baseFov, sky = false }) {
  const { width, height, portrait } = viewport;
  const t = portrait && height < 800 ? Math.max(0, Math.min(1, (800 - height) / 232)) : 0;
  const compact = t * t * (3 - 2 * t);
  // A low, wide sky shot must fit both the flying animal and its seated friend.
  // Widening before shifting keeps the upper wings clear of the HUD. Fade back
  // to the original tablet lens above the landscape-phone control breakpoint.
  const landscapeT = sky && !portrait ? Math.max(0, Math.min(1, (640 - height) / 100)) : 0;
  const landscapeSky = landscapeT * landscapeT * (3 - 2 * landscapeT);
  // The sky camera includes more vertical space than the land camera. Retain
  // a few pixels for Mosi's feet as the compact portrait correction fades out,
  // then restore the already-reviewed tall-phone composition by 844px.
  const portraitTail = Math.max(0, Math.min(1, (844 - height) / 44));
  const skyFootroom = sky && portrait ? 10 * (1 - compact) * portraitTail * portraitTail * (3 - 2 * portraitTail) : 0;
  camera.fov = baseFov + compact * (sky ? 4 : 2) + landscapeSky * 9;
  const shift = compact * (sky ? 88 : 72) + landscapeSky * 49 + skyFootroom;
  if (shift > 0 && width > 0 && height > 0) {
    camera.setViewOffset(width, height, 0, shift, width, height);
  } else {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
}
