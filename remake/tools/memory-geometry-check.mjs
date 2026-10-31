// QA geometry only: work from actual actor positions and scene bounds, independently of authored routes.
const xz = point => {
  if (!Array.isArray(point) || ![2, 3].includes(point.length) || !point.every(Number.isFinite)) throw new Error('QA geometry requires finite coordinate arrays');
  return point.length === 2 ? point : [point[0], point[2]];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = vector => { const length = Math.hypot(...vector); if (!(length > 0)) throw new Error('QA geometry needs a nonzero direction'); return vector.map(value => value / length); };

export function riverDistance(point, river) {
  if (river.points?.length >= 2) {
    const p = xz(point); let nearest = Infinity, signed = Infinity;
    for (let i = 1; i < river.points.length; i++) {
      const a = xz(river.points[i - 1]), b = xz(river.points[i]), segment = subtract(b, a), squared = dot(segment, segment);
      if (!squared) continue;
      const t = Math.max(0, Math.min(1, dot(subtract(p, a), segment) / squared));
      const offset = subtract(p, [a[0] + segment[0] * t, a[1] + segment[1] * t]), distance = Math.hypot(...offset);
      if (distance < nearest) { nearest = distance; signed = distance * (Math.sign(dot(offset, [-segment[1], segment[0]])) || 1); }
    }
    if (!Number.isFinite(nearest)) throw new Error('QA river needs distinct centreline points');
    return signed;
  }
  return dot(subtract(xz(point), xz(river.center)), unit(xz(river.normal)));
}

export function overWater(point, river, margin = 0) {
  const [x, z] = xz(point), bounds = river.bounds;
  if (bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return false;
  return Math.abs(riverDistance(point, river)) < river.halfWidth - margin;
}

export function overMarsh(point, marsh, margin = 0) {
  const [x, z] = xz(point), [cx, cz] = xz(marsh.center);
  if (!(marsh.halfWidth > margin) || !(marsh.halfDepth > margin) || !Number.isFinite(marsh.waterY)) throw new Error('QA marsh requires finite ellipse dimensions and water height');
  return ((x - cx) / (marsh.halfWidth - margin)) ** 2 + ((z - cz) / (marsh.halfDepth - margin)) ** 2 < 1;
}

export function deckCoordinates(point, deck) {
  const start = xz(deck.start), delta = subtract(xz(deck.end), start), axis = unit(delta), offset = subtract(xz(point), start);
  return { along: dot(offset, axis), across: dot(offset, [-axis[1], axis[0]]), length: Math.hypot(...delta) };
}

export function supportedByDeck(point, deck, { swing = false } = {}) {
  const p = deckCoordinates(point, deck);
  return p.along >= -0.04 && p.along <= p.length + 0.04 && Math.abs(p.across) <= deck.halfWidth + 0.04
    && point[1] >= deck.deckY - 0.15 && point[1] <= deck.deckY + (swing ? 0.8 : 0.35);
}

export function bankSide(point, river, deck) {
  const farSign = Math.sign(riverDistance(deck.end, river));
  if (!farSign) throw new Error('The far bridge endpoint must be on a bank');
  const d = riverDistance(point, river) * farSign;
  return d < -river.halfWidth ? 'near' : d > river.halfWidth ? 'far' : 'water';
}

export function inDestination(point, destination) {
  const [x, z] = xz(point), bounds = destination.bounds ?? (destination.minX !== undefined ? destination : null);
  if (bounds) return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const centre = xz(destination.center);
  return Math.hypot(x - centre[0], z - centre[1]) <= destination.radius;
}

export function supportingSurface(point, world, options = {}) {
  if (world.bridge.built && supportedByDeck(point, world.bridge.walkable, options)) return 'bridge';
  for (const [index, panel] of (world.boardwalk?.panels ?? []).entries()) {
    if (panel.placed && supportedByDeck(point, panel, options)) return `boardwalk-${index}`;
  }
  return null;
}

export function assessBridgeGeometry(world, { extraActors = [], requireMarsh = false } = {}) {
  const deck = world.bridge.walkable, river = world.river, destination = world.destination;
  if (!deck?.start || !deck?.end || !(deck.halfWidth > 0) || !Number.isFinite(deck.deckY)
    || !(river?.points?.length >= 2 || river?.center && river?.normal) || !(river.halfWidth > 0) || !Number.isFinite(river.waterY) || !destination) {
    throw new Error('Missing rotated deck / river / destination QA metadata');
  }
  if (requireMarsh && (!world.marsh || !world.boardwalk?.panels || !world.staging)) throw new Error('Missing marsh / boardwalk / staging QA metadata');
  if (world.marsh) {
    overMarsh(world.marsh.center, world.marsh);
    if (!world.boardwalk?.panels) throw new Error('Missing boardwalk panel QA metadata');
    for (const panel of world.boardwalk.panels) {
      if (!panel.start || !panel.end || !(panel.halfWidth > 0) || !Number.isFinite(panel.deckY)) throw new Error('Missing boardwalk panel support dimensions');
      deckCoordinates(panel.start, panel);
    }
  }
  const errors = [], actors = [], violations = [];
  const hazards = point => [overWater(point, river, .02) && 'river', world.marsh && overMarsh(point, world.marsh, .02) && 'marsh'].filter(Boolean);
  const unsupported = (id, part, position) => {
    errors.push(`${id} ${part} is unsupported above water`);
    violations.push({ id, part, position, hazards: hazards(position), riverDistance: riverDistance(position, river), deck: deckCoordinates(position, deck), built: world.bridge.built });
  };
  for (const species of ['triceratops', 'brontosaurus', 'stegosaurus']) {
    const pair = world.pairs[species];
    if (!pair) continue;
    const actual = pair.actors ?? pair.positions.map((position, index) => ({ id: `${species}-${index}`, position }));
    for (const actor of actual) {
      const position = actor.position, water = overWater(position, river, 0.02);
      if (position.length !== 3) throw new Error('Actual actor positions must contain X/Y/Z');
      if (hazards(position).length && !supportingSurface(position, world)) unsupported(actor.id, 'root', position);
      const feet = actor.feet ?? [];
      for (const [index, foot] of feet.entries()) {
        const p = foot.position ?? foot;
        if (p.length !== 3) throw new Error('Actual foot positions must contain X/Y/Z');
        if (hazards(p).length && !supportingSurface(p, world, { swing: foot.planted !== true })) {
          unsupported(actor.id, `foot ${index}`, p);
        }
      }
      actors.push({ id: actor.id, species, position, water, marsh: Boolean(world.marsh && overMarsh(position, world.marsh, .02)), bank: bankSide(position, river, deck),
        onDeck: world.bridge.built && supportedByDeck(position, deck), destination: inDestination(position, destination),
        surface: supportingSurface(position, world), staging: Boolean(world.staging && inDestination(position, world.staging)),
        screen: actor.screen, headScreen: actor.headScreen, ...deckCoordinates(position, deck), feetChecked: feet.length });
    }
  }
  for (const actor of extraActors) {
    if (actor.position.length !== 3) throw new Error('Additional actor positions must contain X/Y/Z');
    if (hazards(actor.position).length && !supportingSurface(actor.position, world)) {
      unsupported(actor.id, 'root', actor.position);
    }
    for (const [index, foot] of (actor.feet ?? []).entries()) {
      const p = foot.position ?? foot;
      if (p.length !== 3) throw new Error('Actual foot positions must contain X/Y/Z');
      if (hazards(p).length && !supportingSurface(p, world, { swing: foot.planted !== true })) {
        unsupported(actor.id, `foot ${index}`, p);
      }
    }
  }
  return { actors, errors, violations };
}
