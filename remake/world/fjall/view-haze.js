// The view east's own haze (chapter 6, scene 3): the slope stands 240 m up, where the look's height fog is thin, and that fog lies
// thick on the valley floor 2 km off (from up here it made the whole forest a white sea), so what the view looks over (the far land,
// its trees, its water, Þórseðla) takes no height fog but this: by distance alone, none to HAZE.from, then a warm red-gold air
// lit by the low sun behind them, and at the land's far end the sky's own colour at its horizon (sky.js: the look's fog colour), so
// the land's edge melts into the sky and no line shows. The engine's fog is not changed for anything else.
//
//   const haze = createViewHaze()
//   haze.uniforms             { uViewHaze: rgb the far end's colour (display values), w strength; uViewWarm: rgb the air's warm colour }
//   haze.patch(material, key, more) a three material: no height fog, this haze after its colour (its own program: key); more(shader)
//                             patches it further, after
//   haze.cards                for cards.js createCardMaterial's `haze` (its head, vertex and glsl), the view's trees
//   haze.update(world)        every frame: its colours from the look (the fog's colour, its sun colour)
import * as THREE from 'three';

export const HAZE = { from: 280, scale: 1300, most: 0.86, end: [4300, 5500], warm: 0.6 };

const FN = /* glsl */`
uniform vec4 uViewHaze;
uniform vec3 uViewWarm;
varying float vViewAway;
vec3 viewHazed( vec3 colour ) {
  float k = ( 1.0 - exp( -max( vViewAway - ${HAZE.from.toFixed(1)}, 0.0 ) / ${HAZE.scale.toFixed(1)} ) ) * ${HAZE.most.toFixed(3)};
  float end = smoothstep( ${HAZE.end[0].toFixed(1)}, ${HAZE.end[1].toFixed(1)}, vViewAway );
  vec3 air = mix( uViewWarm, uViewHaze.rgb, end );
  return mix( colour, air, max( k, end ) * uViewHaze.w );
}`;
const AWAY = '  vViewAway = distance( ( modelMatrix * vec4( transformed, 1.0 ) ).xz, cameraPosition.xz );';

export function createViewHaze() {
  const uniforms = { uViewHaze: { value: new THREE.Vector4(0.8, 0.72, 0.7, 1) }, uViewWarm: { value: new THREE.Color(0.95, 0.75, 0.6) } };
  const fog = { r: 0, g: 0, b: 0 }, sun = new THREE.Color();
  return {
    uniforms,
    patch(material, key, more = null) {
      material.fog = false;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying float vViewAway;\n${shader.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>\n${AWAY}`)}`;
        shader.fragmentShader = `${FN}\n${shader.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb = viewHazed( gl_FragColor.rgb );')}`;
        more?.(shader);
      };
      material.customProgramCacheKey = () => key;
      material.needsUpdate = true;
      return material;
    },
    cards: {
      uniforms,
      head: FN.replace('vec3 viewHazed', 'vec3 viewHazedCard'), // the vertex shader too has the head: a function it does not call
      vertex: (foot, away) => `  vViewAway = ${away};`,
      glsl: '  gl_FragColor.rgb = viewHazedCard( gl_FragColor.rgb );',
      key: 'view-haze',
    },
    update(world) {
      // the sky's own fog band (sky.js: what the sky shows at its horizon, as the light now is: light-blend.js sets it), else the fog's
      const sky = world.sky?.dome?.material?.uniforms;
      const colour = sky?.uFogColor?.value ?? world.scene?.fog?.color;
      if (!colour) return;
      colour.getRGB(fog, THREE.SRGBColorSpace);
      uniforms.uViewHaze.value.set(fog.r, fog.g, fog.b, 1);
      // the air in front of the far land, lit by the sun behind the camera: the fog's colour toward the sun's own
      sun.copy(sky?.uFogSun?.value ?? colour);
      const s = { r: 0, g: 0, b: 0 };
      sun.getRGB(s, THREE.SRGBColorSpace);
      uniforms.uViewWarm.value.setRGB(fog.r + (s.r - fog.r) * HAZE.warm, fog.g + (s.g - fog.g) * HAZE.warm, fog.b + (s.b - fog.b) * HAZE.warm);
    },
  };
}
