// Helpers for the "Maker" prototype: 2020 aluminium extrusion, NEMA stepper motors, GT2 pulleys and
// belts, spur gears, layer-lined printed parts, wire bundles with zip ties and spiral wrap.
// Inputs are millimetres; geometry comes out in metres like everything else in the kit.
import * as THREE from "three";
import { bolt } from "./parts.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
export const PR = "satin";   // printed plastic (matte white PLA)
export const PR2 = "dark";   // black printed parts (hinge tongues, small brackets)
export const WIRES = ["rubber", "paint", "gloss", "titanium"];
const MM = 0.001;

/* ---------- primitives (mm in, metres out) ---------- */
export const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w * MM, h * MM, d * MM).translate(x * MM, y * MM, z * MM);
export const cylZ = (r, z0, z1, seg = 24, x = 0, y = 0) => new THREE.CylinderGeometry(r * MM, r * MM, (z1 - z0) * MM, seg).rotateX(Math.PI / 2).translate(x * MM, y * MM, ((z0 + z1) / 2) * MM);
export const cylY = (r, y0, y1, seg = 24, x = 0, z = 0) => new THREE.CylinderGeometry(r * MM, r * MM, (y1 - y0) * MM, seg).translate(x * MM, ((y0 + y1) / 2) * MM, z * MM);
export const cylX = (r, x0, x1, seg = 24, y = 0, z = 0) => new THREE.CylinderGeometry(r * MM, r * MM, (x1 - x0) * MM, seg).rotateZ(-Math.PI / 2).translate(((x0 + x1) / 2) * MM, y * MM, z * MM);
export const circle = (x, y, r) => new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, true);
// A local frame at o (mm) with local x -> ex and local y -> ey.
export const frame = (o, ex, ey) => new THREE.Matrix4().makeBasis(ex, ey, ex.clone().cross(ey)).setPosition(o.x * MM, o.y * MM, o.z * MM);
// Matrix that takes local z (0..L) along the segment a -> b (mm).
export function along(a, b) {
  const d = b.clone().sub(a), L = d.length(), ez = d.normalize();
  const ex = (Math.abs(ez.z) > 0.9 ? X : Z).clone().cross(ez).normalize(), ey = ez.clone().cross(ex);
  return [new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(a.x * MM, a.y * MM, a.z * MM), L];
}
// Shapes drawn in the x-z plane, extruded across y0..y1; drawn in y-z, extruded across x0..x1.
const XZ = new THREE.Matrix4().makeBasis(X, Z, Y.clone().negate());
const YZ = new THREE.Matrix4().makeBasis(Y, Z, X);
export const xzSlab = (K, shape, y0, y1, bevel = 0, holes = []) => K.slab(shape, -y1, -y0, bevel, holes).applyMatrix4(XZ);
export const yzSlab = (K, shape, x0, x1, bevel = 0, holes = []) => K.slab(shape, x0, x1, bevel, holes).applyMatrix4(YZ);
export function poly(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }

// A bolt given in a local frame M (metres matrix), position/direction in that frame's mm.
export function boltM(K, owner, M, at, dir, r, h, name) {
  const p = at.clone().multiplyScalar(MM).applyMatrix4(M).divideScalar(MM), d = dir.clone().transformDirection(M);
  bolt(K, owner, p, d, r, h, name);
}
// Hex nut + washer on an axis.
export function nut(K, owner, at, dir, r, name) {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
  const put = (g, role, n) => K.part(owner, g.applyQuaternion(q).translate(at.x * MM, at.y * MM, at.z * MM), role, n);
  put(new THREE.CylinderGeometry(r * 1.25 * MM, r * 1.25 * MM, 0.5 * MM, 20).translate(0, 0.25 * MM, 0), "steel", `${name}_washer`);
  put(new THREE.CylinderGeometry(r * MM, r * MM, r * 0.8 * MM, 6).translate(0, (0.5 + r * 0.4) * MM, 0), "steel", `${name}_nut`);
}

/* ---------- layer lines ---------- */
// A lathe profile with fine printed layer ridges up its side.
export function ridged(z0, z1, r, { pitch = 1.6, amp = 0.22, f0 = 1.2, f1 = 1.2, r1 = r } = {}) {
  const pts = [[0, z0], [r, z0, f0]];
  const span = z1 - z0 - f0 - f1, n = Math.max(1, Math.floor(span / pitch));
  const za = z0 + f0 + (span - n * pitch) / 2;
  const rad = (z) => r + ((r1 - r) * (z - z0)) / (z1 - z0);
  for (let i = 0; i <= n; i++) {
    const z = za + i * pitch;
    pts.push([rad(z), z]);
    if (i < n) pts.push([rad(z + pitch / 2) - amp, z + pitch / 2]);
  }
  pts.push([r1, z1, f1], [0, z1]);
  return pts;
}
// A round printed part as stacked layers (every other one a hair smaller): crisp layer lines. Along +z.
export function stack(z0, z1, r, { r1 = r, pitch = 1.6, amp = 0.25, seg = 64, chamfer = 0.8 } = {}) {
  const n = Math.max(1, Math.round((z1 - z0) / pitch)), h = (z1 - z0) / n, geos = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, edge = i === 0 || i === n - 1;
    const rr = r + (r1 - r) * t - (i % 2 ? amp : 0) - (edge ? chamfer : 0);
    geos.push(new THREE.CylinderGeometry(rr * MM, rr * MM, h * MM, seg).rotateX(Math.PI / 2).translate(0, 0, (z0 + h * (i + 0.5)) * MM));
  }
  return mergeGeometries(geos, false);
}
// A printed block built from stacked layers (every other one inset a hair), so its walls show layer lines.
export function layered(K, owner, mk, z0, z1, pitch, role, name, holesFn) {
  let i = 0;
  for (let z = z0; z < z1 - 0.05; z += pitch, i++) {
    const inset = i % 2 ? 0.26 : 0;
    K.part(owner, K.slab(mk(inset), z, Math.min(z + pitch, z1), 0, holesFn ? holesFn(inset) : []), role, `${name}_l${i}`);
  }
}

/* ---------- 2020 extrusion ---------- */
let profileCache = null;
function extrusionShape() {
  const h = 10;
  const face = [[h, -3.1], [h - 1.8, -3.1], [h - 1.8, -4.6], [h - 4, -4.6], [h - 5.6, -2.6], [h - 5.6, 2.6], [h - 4, 4.6], [h - 1.8, 4.6], [h - 1.8, 3.1], [h, 3.1], [h, h - 0.7], [h - 0.7, h]];
  const s = new THREE.Shape();
  for (let f = 0; f < 4; f++) {
    const c = Math.cos((f * Math.PI) / 2), sn = Math.sin((f * Math.PI) / 2);
    face.forEach(([x, y], j) => { const u = x * c - y * sn, v = x * sn + y * c; (f === 0 && j === 0) ? s.moveTo(u, v) : s.lineTo(u, v); });
  }
  s.closePath();
  s.holes.push(new THREE.Path().absarc(0, 0, 2.1, 0, Math.PI * 2, true));
  return s;
}
// A length of 2020 from a to b (mm), with black end caps and a socket screw in each end.
export function extrusion(K, owner, a, b, name, { caps = true } = {}) {
  const [M, L] = along(a, b);
  const geo = new THREE.ExtrudeGeometry(profileCache ?? (profileCache = extrusionShape()), { depth: L - (caps ? 3 : 0), bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, caps ? 1.5 : 0).scale(MM, MM, MM);
  K.part(owner, geo.applyMatrix4(M), "metal", name);
  if (caps) for (const [z0, z1, e] of [[0, 1.5, "A"], [L - 1.5, L, "B"]]) {
    K.part(owner, K.slab(K.roundedShape(K.rect(-9.9, -9.9, 9.9, 9.9), 1.2), z0, z1, 0.4).applyMatrix4(M), "gloss", `${name}_cap${e}`);
  }
}

/* ---------- gears, pulleys, belts ---------- */
export function gearShape(r, n, depth) {
  const s = new THREE.Shape(), da = (Math.PI * 2) / n;
  for (let k = 0; k < n; k++) {
    const a = k * da;
    [[r - depth, a], [r - depth, a + 0.36 * da], [r, a + 0.52 * da], [r, a + 0.84 * da]].forEach(([rr, aa], j) => {
      const x = rr * Math.cos(aa), y = rr * Math.sin(aa);
      (k === 0 && j === 0) ? s.moveTo(x, y) : s.lineTo(x, y);
    });
  }
  s.closePath();
  return s;
}
const ringProfile = (r0, r1, y0, y1) => [[r0, y0], [r1, y0, 0.3], [r1, y1, 0.3], [r0, y1]];
// A pulley/gear as parts along local Y, centred on the origin. hub: which side (+1/-1) the clamping hub
// and the motor are on; shaftFrom: where the shaft comes from (signed y, mm) or null for no shaft.
export function pulleyParts(K, r, w, { printed = false, hub = 1, holes = 0, shaftFrom = null, gear = false, bore = null, hubLen = 5 } = {}) {
  const out = [];
  const n = gear ? Math.max(10, Math.round(r * 1.3)) : Math.max(16, Math.round((2 * Math.PI * r) / 2));
  const sh = gearShape(r, n, gear ? 1.8 : 0.75);
  if (holes) for (let k = 0; k < holes; k++) { const a = ((k + 0.5) / holes) * Math.PI * 2, rr = r * 0.56; sh.holes.push(circle(rr * Math.cos(a), rr * Math.sin(a), r * 0.2)); }
  const boreR = bore ?? (shaftFrom !== null ? 2.6 : printed ? 4.2 : 2.6);
  sh.holes.push(circle(0, 0, boreR));
  const fl = gear ? 0 : 0.9;
  out.push([K.alongY(K.slab(sh, -w / 2 + fl, w / 2 - fl, 0)), printed ? PR : "metal", "teeth"]);
  if (!gear) for (const s of [-1, 1]) out.push([K.alongY(K.turn(ringProfile(printed ? r * 0.82 : boreR, r + 1.5, s > 0 ? w / 2 - fl : -w / 2, s > 0 ? w / 2 : -w / 2 + fl), { seg: 48 })), printed ? PR : "metal", `flange${s > 0 ? "R" : "L"}`]);
  // the clamping hub with its set screw
  const hr = printed ? 7 : Math.min(r * 0.92, 7.5), y0 = hub * (w / 2), y1 = hub * (w / 2 + hubLen);
  if (!gear || printed) out.push([cylY(hr, Math.min(y0, y1), Math.max(y0, y1), 28), "metal", "hub"]);
  out.push([cylX(1.1, hr - 0.6, hr + 0.3, 10, (y0 + y1) / 2, 0), "dark", "setscrew"]);
  if (printed) for (let k = 0; k < 4; k++) {   // screws clamping the printed pulley to its hub
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    out.push([cylY(1.4, -hub * (w / 2 + 0.8), -hub * (w / 2), 14, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3), "steel", `screw${k}`]);
  }
  if (shaftFrom !== null) {   // D-cut shaft: from the motor through the pulley, 2 mm proud on the far side
    const d = new THREE.Shape(), a = Math.acos(2 / 2.5);
    d.absarc(0, 0, 2.5, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2, false);
    d.closePath();
    const ya = shaftFrom, yb = -hub * (w / 2 + 2);
    out.push([K.alongY(K.slab(d, Math.min(ya, yb), Math.max(ya, yb), 0)), "steel", "shaft"]);
  }
  return out;
}
// A spinning assembly: a group at `at` (mm) on `owner`, parts along its local Y (or Z when axis='z').
export function spinner(K, owner, at, axis, parts, name) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(at.x * MM, at.y * MM, at.z * MM);
  owner.add(g);
  for (const [geo, role, n] of parts) K.part(g, axis === "z" ? geo.rotateX(Math.PI / 2) : geo, role, `${name}_${n}`);
  return g;
}
// The convex hull of two circles (a closed belt path), as a 2D shape.
export function hull(c1, r1, c2, r2, path = new THREE.Shape()) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy), th = Math.atan2(dy, dx), ph = Math.acos((r1 - r2) / d);
  path.moveTo(c1[0] + r1 * Math.cos(th + ph), c1[1] + r1 * Math.sin(th + ph));
  path.absarc(c1[0], c1[1], r1, th + ph, th + Math.PI * 2 - ph, false);
  path.absarc(c2[0], c2[1], r2, th - ph, th + ph, false);
  path.closePath();
  return path;
}
// GT2 belt round two pulleys: shape + hole, ready for slab/xzSlab.
export const beltShape = (c1, r1, c2, r2) => { const s = hull(c1, r1 + 1.5, c2, r2 + 1.5); s.holes.push(hull(c1, r1 + 0.25, c2, r2 + 0.25, new THREE.Path())); return s; };
// Where to put an idler pressing on the outside of the belt run whose normal has a positive `pick` component.
export function idlerAt(c1, r1, c2, r2, ri, pick = (n) => n[0], t = 0.5) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy), th = Math.atan2(dy, dx), ph = Math.acos((r1 - r2) / d);
  for (const a of [th + ph, th - ph]) {
    const n = [Math.cos(a), Math.sin(a)];
    if (pick(n) > 0) {
      const p1 = [c1[0] + r1 * n[0], c1[1] + r1 * n[1]], p2 = [c2[0] + r2 * n[0], c2[1] + r2 * n[1]];
      return [p1[0] + (p2[0] - p1[0]) * t + n[0] * (1.5 + ri), p1[1] + (p2[1] - p1[1]) * t + n[1] * (1.5 + ri)];
    }
  }
}

/* ---------- stepper motors ---------- */
const oct = (h, c) => poly([[h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h]]);
// A NEMA-style stepper in local frame M: shaft along local +Y, front face at y = 0, body back to y = -L.
// The connector sits on the local +x side of the rear cap, a short pigtail of four wires leaving it.
export function stepper(K, owner, M, { s = 42, L = 40, name = "stepper", shaft = false, frontScrews = true, label = true } = {}) {
  const k = s / 42, h = s / 2, c = s * 0.14;
  const put = (geo, role, n) => K.part(owner, geo.applyMatrix4(M), role, `${name}_${n}`);
  const prism = (shape, y0, y1, bevel) => K.slab(shape, y0, y1, bevel).rotateX(-Math.PI / 2);
  const cap = 8.5 * k;
  put(prism(oct(h - 0.5, c), -cap, 0, 0.5), "dark", "frontcap");
  put(prism(oct(h - 0.5, c), -L, -L + cap, 0.5), "dark", "rearcap");
  // laminated stator stack between the caps, in three bands with dark seams
  const st0 = -L + cap, st1 = -cap, band = (st1 - st0) / 3;
  for (let i = 0; i < 3; i++) put(prism(oct(h - 0.6, c + 0.4), st0 + i * band + 0.3, st0 + (i + 1) * band - 0.3, 0), "metal", `stack${i}`);
  put(prism(oct(h - 1.6, c + 0.6), st0, st1, 0), "dark", "core");
  if (label) put(box(s * 0.5, (st1 - st0) * 0.62, 0.3, 0, (st0 + st1) / 2, h - 0.35), "paint", "label");
  put(cylY(11 * k, 0, 2, 40), "metal", "boss");
  put(cylY(4.5 * k, 2, 2.6, 24), "dark", "bearing");
  if (shaft) put(cylY(2.5 * k, 2, 2 + 20 * k, 16), "steel", "shaft");
  const sp = 15.5 * k;
  if (frontScrews) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) boltM(K, owner, M, V(a * sp, 0, b * sp), Y, 2.6 * k, 1.8 * k, `${name}_screw${a}${b}`);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) boltM(K, owner, M, V(a * sp, -L, b * sp), Y.clone().negate(), 1.8 * k, 0.6, `${name}_rear${a}${b}`);
  // connector housing and pigtail
  put(box(5.5, 7.5 * k, 13 * k, h + 2.7, -L + 4.4 * k, 0), "gloss", "connector");
  put(box(1.2, 6 * k, 11 * k, h + 6, -L + 4.4 * k, 0), "paint", "latch");
  const wires = [];
  for (let i = 0; i < 4; i++) {
    const zz = (i - 1.5) * 2.4 * k;
    const pts = [V(h + 6, -L + 4.4 * k, zz), V(h + 8.6, -L + 3.4 * k, zz * 1.05), V(h + 9.5, -L + 9, zz * 0.8), V(h + 9.5, -L + 16, zz * 0.45)];
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.multiplyScalar(MM))), 14, 0.7 * MM, 6, false);
    put(geo, WIRES[i], `wire${i}`);
    wires.push(pts);
  }
  put(cylY(2.6, -L + 15, -L + 24, 14, h + 9.5, 0), "rubber", "heatshrink");
  return { tail: V(h + 9.5, -L + 24, 0).multiplyScalar(MM).applyMatrix4(M).divideScalar(MM) };
}

/* ---------- wiring ---------- */
// n wires along a centre line (mm points), with zip ties at fractions `ties` and spiral wrap over `wrap`.
export function bundle(K, owner, pts, { n = 4, rw = 0.8, ties = [], wrap = null, name = "bundle", roles = WIRES } = {}) {
  const C = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
  const len = C.getLength(), seg = Math.max(10, Math.round(len / 5));
  const F = C.computeFrenetFrames(seg, false);
  const rb = n > 1 ? rw * 1.2 : 0;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, P = [];
    for (let i = 0; i <= seg; i++) P.push(C.getPointAt(i / seg).addScaledVector(F.normals[i], Math.cos(a) * rb).addScaledVector(F.binormals[i], Math.sin(a) * rb).multiplyScalar(MM));
    K.part(owner, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), seg * 2, rw * MM, 6, false), roles[k % roles.length], `${name}_w${k}`);
  }
  const R = rb + rw;
  ties.forEach((t, i) => {
    const p = C.getPointAt(t), d = C.getTangentAt(t), q = new THREE.Quaternion().setFromUnitVectors(Z, d);
    K.part(owner, new THREE.TorusGeometry((R + 0.35) * MM, 0.42 * MM, 4, 16).applyQuaternion(q).translate(p.x * MM, p.y * MM, p.z * MM), "gloss", `${name}_tie${i}`);
    const head = box(2.4, 2.4, 2.8, R + 1.3, 0, 0).applyQuaternion(q).translate(p.x * MM, p.y * MM, p.z * MM);
    K.part(owner, head, "gloss", `${name}_tiehead${i}`);
  });
  if (wrap) {
    const [t0, t1] = wrap, turns = Math.max(2, Math.round(((t1 - t0) * len) / 4.2)), P = [], N = turns * 10;
    const F2 = C.computeFrenetFrames(N, false);
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N, a = (i / 10) * Math.PI * 2, fi = Math.round((t * N));
      const nn = F2.normals[Math.min(N, fi)], bb = F2.binormals[Math.min(N, fi)];
      P.push(C.getPointAt(t).addScaledVector(nn, Math.cos(a) * (R + 0.5)).addScaledVector(bb, Math.sin(a) * (R + 0.5)).multiplyScalar(MM));
    }
    K.part(owner, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), N * 2, 0.5 * MM, 5, false), "paint", `${name}_spiral`);
  }
}
