import * as THREE from 'three';

/** Readable moving currents inside the existing river draw. The old subtle
 * tint shimmer disappeared at the wide play camera, so distinct narrow crests
 * now travel along the river coordinates rather than flickering in place. */
export function installWaterFlow(material, { speed = 1, marsh = false } = {}) {
  const time = { value: 0 }, compile = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer); shader.uniforms.uStoryFlowTime = time;
    shader.vertexShader = `attribute vec2 aFlowUv; varying vec2 vStoryFlow;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStoryFlow=aFlowUv;');
    shader.fragmentShader = `uniform float uStoryFlowTime; varying vec2 vStoryFlow;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 flow=vStoryFlow;float t=uStoryFlowTime;
      float bend=sin(flow.y*.43-t*.36+flow.x*3.3)*.7;
      float broad=sin(flow.x*3.7+flow.y*.47-t*.58+bend);
      diffuseColor.rgb*=.96+broad*.065;
      float shore=smoothstep(.68,.98,abs(flow.x));
      float lace=pow(max(0.0,sin(flow.y*2.4-t*1.15+flow.x*13.0+bend)),5.0)*shore;
      float strand=pow(max(0.0,sin(flow.x*10.0+sin(flow.y*.8-t*.8)*1.6)),10.0);
      float flowPatch=pow(max(0.0,sin(flow.y*1.9-t*1.55+flow.x*6.1)),4.0);
      float crest=pow(max(0.0,sin(flow.y*4.8-t*3.0+sin(flow.x*6.0+t*.4)*.65)),18.0);
      float brokenCrest=pow(max(0.0,sin(flow.x*2.7+flow.y*.71-t*.36)),6.0);
      float glint=(strand*flowPatch*.65+crest*brokenCrest*.10)*(1.0-shore*.5);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.69,.88,.83),clamp(lace*${marsh ? '.11' : '.18'}+glint*${marsh ? '.15' : '.24'},0.0,.32));`);
  };
  material.customProgramCacheKey = () => `${previousKey()}-storybook-water-v2-${marsh ? 'marsh' : 'river'}`;
  material.needsUpdate = true;
  return { update(elapsed, reduced) { time.value = reduced ? 0 : elapsed * speed; } };
}

/** Soft irregular foam ribbon. Its tapered alpha replaces hard white dashes. */
export function createFoamTexture() {
  const width = 128, height = 32, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = (y + .5) / height, centre = .48 + Math.sin(u * Math.PI * 2.1) * .10;
    const main = Math.exp(-(((v - centre) / .12) ** 2)), echo = Math.exp(-(((v - centre - .21) / .065) ** 2)) * THREE.MathUtils.smoothstep(u, .2, .7) * .32;
    const alpha = Math.pow(Math.sin(u * Math.PI), .65) * (main + echo) * (.8 + Math.sin(u * 17) * .12), i = (y * width + x) * 4;
    data[i] = 229; data[i + 1] = 240; data[i + 2] = 219; data[i + 3] = Math.round(Math.min(1, alpha) * 255);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
}

export function installFoamFade(material) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = `attribute float aFlowAlpha; varying float vFlowAlpha;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowAlpha=aFlowAlpha;');
    shader.fragmentShader = `varying float vFlowAlpha;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vFlowAlpha;');
  };
  material.customProgramCacheKey = () => `${key()}-soft-foam-fade`; material.needsUpdate = true;
}

/** Chunky weathered bark, with broad seams and warm worn ridges. */
export function createStoryBarkTexture() {
  const size = 512, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, bend = Math.sin(u * 8.2) * .015 + Math.sin(u * 19.4 + v * 4) * .005;
    const ridge = (v + bend) * 13, centre = ridge - Math.floor(ridge);
    const seam = Math.exp(-(((centre - .08) / .055) ** 2)) * 30, shoulder = Math.exp(-(((centre - .24) / .16) ** 2)) * 11;
    const coarse = Math.sin(u * 9 + Math.floor(ridge) * 4.2) * 5 + Math.sin(v * 37 + u * 4) * 3;
    const hairline = Math.max(0, Math.sin((v + bend) * 245)) ** 9 * 5;
    const worn = shoulder + coarse - seam - hairline, i = (y * size + x) * 4;
    pixels[i] = 136 + worn; pixels[i + 1] = 101 + worn * .8; pixels[i + 2] = 64 + worn * .55; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true; return texture;
}
