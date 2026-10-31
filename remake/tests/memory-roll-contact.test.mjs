import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './setup.mjs';
const THREE = await import('three');
const { createBridgeProps, BRIDGE } = await import('../engine/memory/bridge-props.js');
const { logPushOffset } = await import('../engine/memory/bridge-adventure.js');
const { objectBox, assessSceneClearances } = await import('../engine/memory/memory-clearance.js');

test('the captured late-push beak clears the rendered bark, not only its nose marker', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/memory-roll-head.json', import.meta.url)));
  const props = createBridgeProps({ scene: new THREE.Scene(), heightAt: () => 0 });
  try {
    const shell = props.log.children.find(mesh => mesh.geometry?.attributes.position.count === 533).geometry;
    const positions = shell.attributes.position, indices = shell.index;
    const bounds = new THREE.Box3().setFromBufferAttribute(positions), length = bounds.max.x - bounds.min.x;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), target = new THREE.Vector3(), ray = new THREE.Ray();
    const depth = point => {
      const ring = Math.min(11, Math.floor((point.x - bounds.min.x) / length * 12));
      ray.origin.set(point.x, 0, 0); ray.direction.set(0, point.y, point.z).normalize();
      let radius = Infinity;
      for (let segment = 0; segment < 40; segment++) for (let triangle = 0; triangle < 2; triangle++) {
        const offset = (ring * 40 + segment) * 6 + triangle * 3;
        a.fromBufferAttribute(positions, indices.getX(offset)); b.fromBufferAttribute(positions, indices.getX(offset + 1)); c.fromBufferAttribute(positions, indices.getX(offset + 2));
        if (ray.intersectTriangle(a, b, c, false, target)) radius = Math.min(radius, Math.hypot(target.y, target.z));
      }
      assert.ok(Number.isFinite(radius), 'each retained skin vertex has a rendered bark cross-section');
      return radius - Math.hypot(point.y, point.z);
    };
    const outward = -logPushOffset(0) - BRIDGE.radius - fixture.oldRelief;
    let before = -Infinity, after = -Infinity;
    for (const vertex of fixture.vertices) {
      const p = new THREE.Vector3(...vertex);
      before = Math.max(before, depth(p));
      p.z -= outward; p.y += fixture.groundDelta;
      after = Math.max(after, depth(p));
    }
    assert.ok(before > .04, 'fixture retains the original actual skin intrusion');
    assert.ok(after < -.005, `corrected beak must clear bark with a small gap; depth ${after}`);
  } finally { props.dispose(); }
});

test('only the initial withdrawal retains the same bounded nose contact', () => {
  const head={...objectBox('head',[.14,.5,0],[.02,.02,.02]),kind:'head',name:'Head'};
  const actor={id:'triceratops-1',species:'triceratops',nose:[.14,.5,0],parts:[head]};
  const wood={id:'main-log',parts:[{...objectBox('bark',[0,.5,0],[.2,.2,.2]),kind:'log',name:'bark-11'}]};
  const audit=(phase,progress)=>assessSceneClearances({collisionActors:[actor],collisionObjects:[wood],bridge:{action:{id:'roll',phase,progress},branch:{held:true},bridge:{built:true}}});
  assert.equal(audit('settle',.2).violations.length,0);
  assert.equal(audit('settle',.26).violations.length,1,'later settling has ordinary clearance requirements');
  assert.equal(audit('return',0).violations.length,1,'return travel is never working contact');
  assert.equal(audit('settle',undefined).violations.length,1,'an absent progress value cannot broaden the exception');
  head.center[0]=.1;
  assert.equal(audit('settle',.1).violations.length,1,'the original ten-centimetre depth cap remains');
  head.center[0]=.14;actor.nose=[1,.5,0];
  assert.equal(audit('settle',.1).violations.length,1,'the original nose-local bound remains');
});
