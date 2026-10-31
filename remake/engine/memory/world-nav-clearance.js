// Navigation needs only a yes/no margin test. The independent scene auditor
// retains the signed SAT distance in memory-clearance.js.
function radius(box, x, y, z) {
  const a = box.axes, h = box.half;
  return h[0] * Math.abs(x * a[0][0] + y * a[0][1] + z * a[0][2])
    + h[1] * Math.abs(x * a[1][0] + y * a[1][1] + z * a[1][2])
    + h[2] * Math.abs(x * a[2][0] + y * a[2][1] + z * a[2][2]);
}

/** True iff one of the same fifteen SAT axes separates the boxes by margin.
 * Cross axes stay unnormalised; scaling the margin preserves the same test. */
export function hasBoxClearance(a, b, margin) {
  const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1], dz = b.center[2] - a.center[2];
  const separated = (x, y, z, length = 1) => Math.abs(dx * x + dy * y + dz * z)
    - radius(a, x, y, z) - radius(b, x, y, z) >= margin * length;
  for (let i = 0; i < 3; i++) {
    const u = a.axes[i], v = b.axes[i];
    if (separated(u[0], u[1], u[2]) || separated(v[0], v[1], v[2])) return true;
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const u = a.axes[i], v = b.axes[j], x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(x, y, z);
    if (length > 1e-6 && separated(x, y, z, length)) return true;
  }
  return false;
}
