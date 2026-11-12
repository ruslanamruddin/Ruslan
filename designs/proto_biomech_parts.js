// Helpers for the "Biomech" prototype: organic sculpting (after designs/humanoid.js), braided McKibben
// muscle sleeves, and the tendon path maths (a cable wrapping a joint pulley) that keeps every muscle
// attached as the joints move.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const MM = 0.001;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Smooth normals and stitch duplicated vertices along lathe seams so no seam line shows.
export function smoothNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e6)},${Math.round(p.getY(i) * 1e6)},${Math.round(p.getZ(i) * 1e6)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const v = new THREE.Vector3();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of ids) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize();
    for (const i of ids) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return geo;
}
// Push a z-lathe's surface out along its radius: fn(z, a, r) -> dr (mm), a = angle from +X toward +Y.
export function sculpt(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / MM, y = p.getY(i) / MM, z = p.getZ(i) / MM;
    const r = Math.hypot(x, y);
    if (r < 1e-6) continue;
    const nr = Math.max(0.01, r + fn(z, Math.atan2(y, x), r)), k = nr / r;
    p.setXYZ(i, x * k * MM, y * k * MM, z * MM);
  }
  p.needsUpdate = true;
  return smoothNormals(geo);
}
// Radius of an ellipse with half-axes A (along a = 0) and B (along a = 90 deg), in direction a.
export const ellipseR = (a, A, B) => 1 / Math.sqrt((Math.cos(a) / A) ** 2 + (Math.sin(a) / B) ** 2);

// A lathe profile [[r, z], ...] from a radius function, with round caps (centred on the end) or flat ends.
export function radiusProfile(z0, z1, rf, n = 32, caps = ["flat", "flat"], capSteps = 10) {
  const pts = [], r0 = rf(z0), r1 = rf(z1);
  if (caps[0] === "round") for (let k = 0; k < capSteps; k++) { const t = -Math.PI / 2 + (Math.PI / 2) * (k / capSteps); pts.push([r0 * Math.cos(t), z0 + r0 * Math.sin(t)]); }
  else pts.push([0, z0]);
  for (let i = 0; i <= n; i++) { const z = z0 + ((z1 - z0) * i) / n; pts.push([rf(z), z]); }
  if (caps[1] === "round") for (let k = 1; k <= capSteps; k++) { const t = (Math.PI / 2) * (k / capSteps); pts.push([Math.max(0, r1 * Math.cos(t)), z1 + r1 * Math.sin(t)]); }
  else pts.push([0, z1]);
  pts[pts.length - 1][0] = 0;
  return pts;
}

// A rounded slab (rounded plan corners rp, rounded edges re) finely subdivided so it can be bent:
// half-sizes ax, ay, az around (cx, cy, cz), surface displaced by fn(x, y, z) -> dz. mm in, metres out.
export function roundedSlab(cx, cy, cz, ax, ay, az, rp, re, fn = () => 0, segs = [28, 28, 2]) {
  let g = new THREE.BoxGeometry(2, 2, 2, ...segs);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-6);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * ax, y = p.getY(i) * ay, z = p.getZ(i) * az;
    const ix = clamp(x, -(ax - rp), ax - rp), iy = clamp(y, -(ay - rp), ay - rp), iz = clamp(z, -(az - re), az - re);
    const dx = (x - ix) / rp, dy = (y - iy) / rp, dz = (z - iz) / re, l = Math.hypot(dx, dy, dz) || 1;
    x = ix + (dx / l) * rp; y = iy + (dy / l) * rp; z = iz + (dz / l) * re;
    x += cx; y += cy; z += cz;
    z += fn(x, y, z);
    p.setXYZ(i, x * MM, y * MM, z * MM);
    uv[i * 2] = x / 40; uv[i * 2 + 1] = y / 40;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// The outline of two circles joined by their outer tangents (a lug, a link plate), as a Shape.
export function hull2(x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), b = Math.acos(clamp((r0 - r1) / d, -1, 1));
  const s = new THREE.Shape();
  s.absarc(x0, y0, r0, a + b, a + 2 * Math.PI - b, false);
  s.absarc(x1, y1, r1, a - b, a + b, false);
  s.closePath();
  return s;
}

// A McKibben muscle sleeve along +Z from 0 to L (mm): a bladder under a braided sheath. The sheath is a
// lattice whose two families of edges follow the two helices of the braid, so the strands stand out with
// few vertices. Scaled shorter and fatter at run time, the braid angle opens up, as a real one does.
export function braidGeo(L, r, { strands = 10, m = 4, angle = 0.5, neck = 10, taper = 9, rEnd = 0.56, amp = 0.55 } = {}) {
  const radial = strands * m, da = (2 * Math.PI) / radial;
  const rings = Math.max(12, Math.round(L / ((r * da * 0.5) / Math.tan(angle))));
  const H = m === 4 ? [1, 0.55, 0] : [1, 0.4, 0, 0];
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const z = (L * j) / rings, e = smooth((Math.min(z, L - z) - neck) / taper);
    const R = r * (rEnd + (1 - rEnd) * e);
    for (let i = 0; i <= radial; i++) {
      const k = i + j * 0.5, a = k * da;
      const dA = i % m, dB = (i + j) % m;
      const hA = H[Math.min(dA, m - dA)], hB = H[Math.min(dB, m - dB)];
      const h = Math.max(hA, hB) + 0.3 * Math.min(hA, hB);
      const rr = R + amp * (0.35 + 0.65 * e) * (h - 0.45);
      pos.push(rr * Math.cos(a) * MM, rr * Math.sin(a) * MM, z * MM);
      uv.push(k / radial, z / 40);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return smoothNormals(g);
}

// A tube along a path that lies in a plane y = const, re-routed every frame without reallocating.
export class PlanarTube {
  constructor(K, owner, n, radius, role, name, radial = 6) {
    this.n = n; this.radial = radial; this.r = radius * MM;
    const vc = n * (radial + 1);
    this.pos = new Float32Array(vc * 3);
    this.nor = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) { uv[(i * (radial + 1) + j) * 2] = j / radial; uv[(i * (radial + 1) + j) * 2 + 1] = i / n; }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = K.live(K.part(owner, g, role, name));
    this.mesh.frustumCulled = false;
    this.xs = new Float32Array(n); this.zs = new Float32Array(n);   // path, mm
  }
  // write the path from this.xs / this.zs (mm) at height y (mm)
  commit(y) {
    const { n, radial, r, pos, nor, xs, zs } = this;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = xs[i1] - xs[i0], tz = zs[i1] - zs[i0];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      // ring frame: u = +Y (plane normal), v = t x u
      const vx = -tz, vz = tx;
      for (let j = 0; j <= radial; j++) {
        const f = (j / radial) * Math.PI * 2, c = Math.cos(f), s = Math.sin(f);
        const nx = s * vx, ny = c, nz = s * vz, o = (i * (radial + 1) + j) * 3;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        pos[o] = xs[i] * MM + nx * r; pos[o + 1] = y * MM + ny * r; pos[o + 2] = zs[i] * MM + nz * r;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}

// The path of a cable from O to I (2D points {x, z}, mm, in the parent's frame) that must keep to the
// s side (+1: +x, -1: -x) of a pulley of radius R centred at C: straight if it clears it, otherwise
// O -> tangent T1 -> arc -> tangent T2 -> I. Returns the pieces and the total length.
function tangentFrom(px, pz, R, sign) {
  const d = Math.hypot(px, pz);
  if (d <= R * 1.001) return null;
  const Dx = -px / d, Dz = -pz / d, a = Math.asin(R / d) * sign, c = Math.cos(a), s = Math.sin(a);
  const ux = Dx * c - Dz * s, uz = Dx * s + Dz * c, L = Math.sqrt(d * d - R * R);
  return { x: px + ux * L, z: pz + uz * L };
}
export function wrapPath(O, I, C, R, s) {
  const ox = (O.x - C.x) * s, oz = O.z - C.z, ix = (I.x - C.x) * s, iz = I.z - C.z;
  const out = { wrapped: false, S: Math.hypot(ix - ox, iz - oz), lead: 0, R, s, C, O, I, t1: null, t2: null, a1: 0, sweep: 0 };
  out.lead = out.S;
  const T1 = tangentFrom(ox, oz, R, -1), T2 = tangentFrom(ix, iz, R, 1);
  if (T1 && T2) {
    const a1 = Math.atan2(T1.z, T1.x), a2 = Math.atan2(T2.z, T2.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    if (sweep > 1e-4) {
      const l1 = Math.hypot(T1.x - ox, T1.z - oz), l2 = Math.hypot(ix - T2.x, iz - T2.z);
      Object.assign(out, { wrapped: true, a1, sweep, lead: l1, S: l1 + R * sweep + l2, t1: { x: T1.x * s + C.x, z: T1.z + C.z }, t2: { x: T2.x * s + C.x, z: T2.z + C.z } });
    }
  }
  return out;
}
// The point at distance d along a path from wrapPath (mm, parent frame).
export function pathPoint(P, d, out) {
  const { O, I } = P;
  if (!P.wrapped) {
    const k = d / (P.S || 1);
    out.x = O.x + (I.x - O.x) * k; out.z = O.z + (I.z - O.z) * k;
    return out;
  }
  const arcL = P.R * P.sweep;
  if (d <= P.lead) {
    const k = d / (P.lead || 1);
    out.x = O.x + (P.t1.x - O.x) * k; out.z = O.z + (P.t1.z - O.z) * k;
  } else if (d <= P.lead + arcL) {
    const a = P.a1 + (d - P.lead) / P.R;
    out.x = Math.cos(a) * P.R * P.s + P.C.x; out.z = Math.sin(a) * P.R + P.C.z;
  } else {
    const l2 = P.S - P.lead - arcL, k = l2 > 1e-6 ? (d - P.lead - arcL) / l2 : 1;
    out.x = P.t2.x + (I.x - P.t2.x) * k; out.z = P.t2.z + (I.z - P.t2.z) * k;
  }
  return out;
}
