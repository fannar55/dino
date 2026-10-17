// Runs simplify() off the main thread for character-lod.js.
import { simplify } from './simplify.js';

self.onmessage = event => {
  const { id, positions, index, options } = event.data;
  try {
    const levels = simplify(positions, index, options);
    self.postMessage({ id, levels }, levels.map(l => l.corners.buffer));
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
