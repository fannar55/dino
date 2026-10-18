// Page hooks for the capture tool and for budget checks:
//   window.__demoStats  - fps, draw calls, triangles, texture MB, quality, render scale (about once a second)
//   window.__benchmark  - renders N frames back to back and returns the GPU median from timer queries
export function installStats({ renderer, scene, q, render, getScale, debugEl, extra }) {
  const gl = renderer.getContext();
  let frames = 0;
  let acc = 0;
  let fps = 0;

  function textureMB() {
    const seen = new Set();
    let bytes = 0;
    const add = tex => {
      if (!tex || seen.has(tex)) return;
      seen.add(tex);
      const img = tex.image;
      const w = img?.width || (Array.isArray(img) ? img[0]?.width : 0) || 0;
      const h = img?.height || (Array.isArray(img) ? img[0]?.height : 0) || 0;
      const faces = tex.isCubeTexture ? 6 : 1;
      bytes += w * h * 4 * faces * (tex.generateMipmaps !== false ? 1.33 : 1);
    };
    scene.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        for (const value of Object.values(m)) if (value && value.isTexture) add(value);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) add(u.value);
      }
    });
    if (scene.environment) add(scene.environment);
    return Math.round((bytes / 1048576) * 10) / 10;
  }

  function sample(realDelta) {
    frames++;
    acc += realDelta;
    if (acc < 1) return;
    fps = frames / acc;
    frames = 0;
    acc = 0;
    window.__demoStats = {
      fps: Math.round(fps),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textureMB: textureMB(),
      quality: q.name,
      renderScale: Math.round(getScale() * 100) / 100,
    };
    if (debugEl && !debugEl.hidden) {
      const s = window.__demoStats;
      const more = extra ? `\n${extra()}` : '';
      debugEl.textContent = `${s.fps} fps  ${s.quality}  scale ${s.renderScale}\n${s.drawCalls} calls  ${(s.triangles / 1000).toFixed(0)}k tris  ${s.textureMB} MB${more}`;
    }
  }

  async function gpuTimes(count) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const queries = [];
    for (let i = 0; i < count; i++) {
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      render();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(query);
      await new Promise(r => setTimeout(r, 0));
    }
    const times = [];
    for (let tries = 0; tries < 300 && times.length < queries.length; tries++) {
      await new Promise(r => setTimeout(r, 10));
      while (times.length < queries.length && gl.getQueryParameter(queries[times.length], gl.QUERY_RESULT_AVAILABLE)) {
        times.push(gl.getQueryParameter(queries[times.length], gl.QUERY_RESULT) / 1e6);
      }
    }
    queries.forEach(qq => gl.deleteQuery(qq));
    if (!times.length) return null;
    const sorted = [...times].sort((a, b) => a - b);
    return {
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
      avg: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
      n: times.length,
      disjoint: Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT)),
    };
  }

  window.__benchmark = async (frameCount = 120) => {
    const pixel = new Uint8Array(4);
    render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const gpuMs = await gpuTimes(Math.min(frameCount, 90));
    const t0 = performance.now();
    for (let i = 0; i < frameCount; i++) render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const msPerFrame = (performance.now() - t0) / frameCount;
    return { gpuMs, msPerFrame, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textureMB: textureMB() };
  };

  return { sample };
}
