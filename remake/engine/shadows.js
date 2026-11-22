import * as THREE from 'three';

// The sun's shadow map as a depth texture, read with hardware depth comparison.
//
// three r180 renders a directional shadow map into an RGBA8 colour target (depth packed into four
// bytes) and reads it with 17 unpacked taps per pixel. On the reference laptop (Iris Xe, ANGLE on
// D3D11) clearing that colour target alone costs about 0.45 ms a frame at 1024 px, whatever the
// clear value, and the 17 taps another 0.1 to 0.5 ms wherever shadows land. Here the shadow pass
// clears depth only, the lights read the target's depth texture, and getShadow() takes four
// bilinear compares (each is a 2x2 PCF in hardware): about the same softness as three's PCF, for
// 0.9 to 1.1 ms less in wide shots and about 0.5 ms in close ones (qa/remake/ledger.md, "Wide
// shots at real sizes").
//
// The colour texture three needs on the target is never cleared or read. If three's shadow chunk
// changes (an upgrade), this warns and leaves three's own shadows in place.

const DECLARATION = 'uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];';
const ANCHOR = 'vec2 cubeToUV(';

/** three's shadow chunk with directional shadow maps read as sampler2DShadow, or null if it changed. */
export function depthShadowChunk(chunk = THREE.ShaderChunk.shadowmap_pars_fragment) {
  if (!chunk.includes(DECLARATION) || !chunk.includes(ANCHOR)) return null;
  return chunk
    .replace(DECLARATION, 'uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];')
    .replace(ANCHOR, `float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		if ( inFrustum && shadowCoord.z <= 1.0 ) {
			vec2 d = shadowRadius * 0.5 / shadowMapSize;
			shadow = 0.25 * (
				texture( shadowMap, vec3( shadowCoord.xy + vec2( - d.x, - d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( d.x, - d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( - d.x, d.y ), shadowCoord.z ) ) +
				texture( shadowMap, vec3( shadowCoord.xy + vec2( d.x, d.y ), shadowCoord.z ) ) );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	${ANCHOR}`);
}

/**
 * Give `light` (a shadow-casting DirectionalLight) a depth-texture shadow map. Call before the
 * first frame: the shader chunk is read when materials compile.
 */
export function installDepthShadows(renderer, light) {
  const shadow = light?.shadow;
  if (!light?.castShadow || !shadow) return null;
  if (!THREE.ShaderChunk.shadowmap_pars_fragment.includes(PATCHED)) {
    const chunk = depthShadowChunk();
    if (!chunk) {
      console.warn('[shadows] three\'s shadowmap_pars_fragment changed; keeping three\'s RGBA shadow maps');
      return null;
    }
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk;
  }
  return attachDepthShadow(renderer, light);
}

// A second scene drawn by the same renderer (the valley of Háls og hali, opened over the chapter) brings its own sun. Its shaders
// compile with the patched chunk too, so its sun needs a depth-texture map of its own: installDepthShadows again, which leaves the
// chunk as it is and only attaches the map. The shadow pass skips clearing the colour of every such target.
const PATCHED = 'uniform sampler2DShadow directionalShadowMap';
const colourless = new WeakSet();
const wrapped = new WeakSet();
const depthTargets = new WeakMap(); // renderer -> Set<{ target, colour, depth }>

function rebuildDepthTarget(renderer, entry) {
  const { target, colour, depth } = entry;
  // Restore the colour texture while Three.js sets up the framebuffer so COLOR_ATTACHMENT0 receives a colour texture
  // (attaching a DepthTexture to COLOR_ATTACHMENT0 after webglcontextrestored fails FBO completeness).
  target.textures[0] = colour;
  const before = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.setRenderTarget(before);
  target.textures[0] = depth;
}

function attachDepthShadow(renderer, light) {
  const shadow = light.shadow;
  const { x: width, y: height } = shadow.mapSize;
  const depth = new THREE.DepthTexture(width, height);
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = THREE.LinearFilter;
  depth.magFilter = THREE.LinearFilter;
  depth.name = `${light.name || 'sun'}.shadowMap.depth`;
  const target = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth });
  const colour = target.textures[0];
  colour.name = `${light.name || 'sun'}.shadowMap.colour (unused)`;
  const entry = { target, colour, depth };
  // Build the framebuffer (colour texture and depth texture attached), then hand the lights the
  // depth texture: three binds `shadow.map.texture` to directionalShadowMap. The framebuffer keeps
  // its attachments; three does not re-attach a target's textures once it is set up.
  rebuildDepthTarget(renderer, entry);
  shadow.map = target; // three only makes its own map while shadow.map is null

  let list = depthTargets.get(renderer);
  if (!list) {
    list = new Set();
    depthTargets.set(renderer, list);
    renderer.domElement?.addEventListener?.('webglcontextrestored', () => {
      for (const item of list) rebuildDepthTarget(renderer, item);
    });
  }
  list.add(entry);

  // Restore target.textures[0] to the colour texture on dispose so Three.js deallocates both the unused RGBA8 colour
  // texture and the depth texture instead of leaking 4-16 MB of GPU VRAM.
  const rawDispose = target.dispose.bind(target);
  target.dispose = () => {
    list.delete(entry);
    target.textures[0] = colour;
    rawDispose();
  };

  // The shadow pass clears the colour target too; skip that one (it is never read).
  colourless.add(target);
  if (!wrapped.has(renderer)) {
    wrapped.add(renderer);
    const clear = renderer.clear.bind(renderer);
    renderer.clear = (color = true, depthBit = true, stencil = true) => clear(color && !colourless.has(renderer.getRenderTarget()), depthBit, stencil);
  }
  return { target, depth };
}
