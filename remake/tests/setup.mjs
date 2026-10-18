// Lets Node resolve the bare 'three' import the way the browser's import map does, so the remake's
// engine modules can be tested without a bundler:
//   node --import ./remake/tests/setup.mjs --test remake/tests/
import { registerHooks } from 'node:module';

const THREE_URL = new URL('../../dist/vendor/three.module.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true, format: 'module' };
    return nextResolve(specifier, context);
  },
});
