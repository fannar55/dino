// Pitch tracks of the takes this song uses (diagnostic): frame time, pitch (- when unclear), * when loud.
import { decode } from './lib/io.mjs';
import { track } from './lib/pitch.mjs';
const H = 'C:/Risaeðla/dino-kafli5-sloedla/remake/assets/audio/kafli5/hljod/';
for (const [f, lo, hi] of [['frogs-1.mp3', 600, 2500], ['frogs-3.mp3', 600, 2500], ['flyers-3.mp3', 700, 2500], ['lizards-1.mp3', 500, 2500], ['grazers-3.mp3', 80, 500], ['turtles-2.mp3', 100, 500], ['frogs-5.mp3', 900, 3000]]) {
  const [x] = decode(H + f);
  const fr = track(x, { win: 1024, hop: 512, fmin: lo, fmax: hi });
  const pk = Math.max(...fr.map(q => q.rms));
  console.log(f, fr.filter(q => q.rms > pk * 0.1).map(q => `${q.t.toFixed(2)}:${q.ap < 0.25 ? Math.round(q.hz) : '-'}${q.rms > pk * 0.5 ? '*' : ''}`).join(' '));
}
