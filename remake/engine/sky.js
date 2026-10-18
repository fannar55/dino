import * as THREE from 'three';

// Sky dome: a gradient from horizon to zenith, a soft sun glow and disc, drifting clouds from a
// tileable noise texture made once at start-up, and a horizon band that uses the same tint as the
// object fog so distant terrain melts into the sky. The same sky, rendered once through PMREM,
// becomes the scene's image-based lighting.

function tileableNoise(size = 256, seed = 7) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const data = new Uint8Array(size * size * 4);
  const octaves = [8, 16, 32, 64];
  const lattices = octaves.map(n => Float32Array.from({ length: n * n }, rand));
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let norm = 0;
      octaves.forEach((n, o) => {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
        const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
        const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
        const L = lattices[o];
        const a = L[y0 * n + x0] + (L[y0 * n + x1] - L[y0 * n + x0]) * tx;
        const b = L[y1 * n + x0] + (L[y1 * n + x1] - L[y1 * n + x0]) * tx;
        v += (a + (b - a) * ty) * amp;
        norm += amp;
        amp *= 0.5;
      });
      const byte = Math.round((v / norm) * 255);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragmentShader = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform vec3 uSunDir;
uniform float uCover;
uniform float uFogSunStrength;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.4));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.22 + pow(sd, 64.0) * 0.45);
  col = mix(col, uGlow * 1.5, smoothstep(0.99935, 0.9997, sd));
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.2) * 0.16 + vec2(uTime * 0.0016, uTime * 0.0007);
    float n = texture2D(uNoise, uv).r * 0.62 + texture2D(uNoise, uv * 2.7 + 0.31).r * 0.38;
    float m = smoothstep(uCover, uCover + 0.2, n) * smoothstep(0.015, 0.22, h);
    vec3 cloudCol = mix(uCloudShade, uCloud, 0.5 + 0.5 * pow(sd, 2.0));
    col = mix(col, cloudCol, m * 0.92);
  }
  vec3 fogTint = mix(uFogColor, uFogSun, pow(sd, 8.0) * uFogSunStrength);
  col = mix(col, fogTint, smoothstep(0.09, 0.0, h));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;

export function createSky({ renderer, scene, look, sunDir }) {
  const noise = tileableNoise();
  const color = hex => new THREE.Color(hex);
  const uniforms = {
    uZenith: { value: color(look.sky.zenith) },
    uHorizon: { value: color(look.sky.horizon) },
    uGlow: { value: color(look.sky.glow) },
    uCloud: { value: color(look.sky.cloud) },
    uCloudShade: { value: color(look.sky.cloudShade) },
    uFogColor: { value: color(look.fog.color) },
    uFogSun: { value: color(look.fog.sunColor) },
    uSunDir: { value: sunDir.clone() },
    uCover: { value: look.sky.cloudCover },
    uFogSunStrength: { value: look.fog.sunStrength },
    uTime: { value: 0 },
    uNoise: { value: noise },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  dome.name = 'Sky';
  dome.frustumCulled = false;
  dome.renderOrder = 1000; // after opaque geometry: only pixels nothing covers pay for the sky shader
  scene.add(dome);

  // Image-based lighting from this exact sky, rendered once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(dome.geometry, material));
  const env = pmrem.fromScene(envScene, 0, 0.1, 1000);
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = look.envIntensity;

  return {
    dome,
    environment: env.texture,
    update(time, camera) {
      uniforms.uTime.value = time;
      dome.position.copy(camera.position);
    },
    dispose() {
      scene.remove(dome);
      dome.geometry.dispose();
      material.dispose();
      noise.dispose();
      env.texture.dispose();
    },
  };
}
