// Shape helpers for the "Hydraulic" prototype: plates cut from 2D outlines, forged lugs, pivot pins,
// hex fasteners, bent hard lines, gears, hose fittings and live hydraulic cylinders. Units: mm in,
// metres out (like studio.js), unless a name says otherwise.
import * as THREE from "three";

const MM = 0.001;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/* ---------- 2D outlines ---------- */
// Convex hull of a set of circles [[x, y, r], ...]: the outline of a forged lug, lever or link plate.
export function hullShape(circles, seg = 20) {
  const pts = [];
  for (const [x, y, r] of circles) for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const h = lo.slice(0, -1).concat(hi.slice(0, -1));
  return new THREE.Shape(h.map(([x, y]) => new THREE.Vector2(x, y)));
}
export function circleHole(x, y, r, seg = 18) {
  const p = new THREE.Path();
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; i ? p.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : p.moveTo(x + r, y); }
  return p;
}
// A triangle shrunk toward its incentre by `web` (so neighbouring holes leave a web of that width), corners rounded.
export function triHole(roundedShape, a, b, c, web = 4, round = 2.5) {
  const la = Math.hypot(b[0] - c[0], b[1] - c[1]), lb = Math.hypot(a[0] - c[0], a[1] - c[1]), lc = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const per = la + lb + lc, ix = (la * a[0] + lb * b[0] + lc * c[0]) / per, iy = (la * a[1] + lb * b[1] + lc * c[1]) / per;
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, rin = (2 * area) / per;
  const k = Math.max(0.05, (rin - web) / rin);
  return roundedShape([a, b, c].map(([x, y]) => [ix + (x - ix) * k, iy + (y - iy) * k]), round);
}

/* ---------- Plates ---------- */
export function ext(shape, e0, e1, bevel = 0.6, cs = 10, bs = 2) {
  const depth = Math.max(0.05, e1 - e0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: bs, curveSegments: cs });
  return g.translate(0, 0, e0 + bevel).scale(MM, MM, MM);
}
// outline drawn in (x, z), thickness along y from y0 to y1
export const xzPlate = (shape, y0, y1, bevel = 0.6, cs = 10) => ext(shape, -y1, -y0, bevel, cs).rotateX(Math.PI / 2);
// outline drawn in (z, y) (the hand's side view: shape x -> z), thickness along x from x0 to x1
export const yzPlate = (shape, x0, x1, bevel = 0.6, cs = 10) => ext(shape, -x1, -x0, bevel, cs).rotateY(-Math.PI / 2);
// outline drawn in (x, y), thickness along z
export const xyPlate = (shape, z0, z1, bevel = 0.6, cs = 10) => ext(shape, z0, z1, bevel, cs);

/* ---------- Placing primitives ---------- */
// A geometry built along +Y (metres), turned to `dir` and moved to `at` (mm).
export function orient(geo, dir, at) {
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return geo.translate(at.x * MM, at.y * MM, at.z * MM);
}
// A cylinder along `dir` from `at`, length h (mm).
export const cylAlong = (r, h, dir, at, seg = 18, r2 = r) => orient(new THREE.CylinderGeometry(r2 * MM, r * MM, h * MM, seg).translate(0, (h / 2) * MM, 0), dir, at);
export function rodBetween(a, b, r, seg = 12) { const d = b.clone().sub(a); return cylAlong(r, d.length(), d, a, seg); }
// Hex head / nut on a face: a six-sided prism along dir with a washer under it.
export function hexNut(K, owner, at, dir, s, h, name = "nut", washer = true) {
  K.part(owner, cylAlong(s, h, dir, at.clone().addScaledVector(dir.clone().normalize(), washer ? 0.5 : 0), 6), "steel", name);
  if (washer) K.part(owner, cylAlong(s * 1.25, 0.6, dir, at, 16), "steel", `${name}_washer`);
}
// A pivot pin along the y axis through (x, z), from y0 to y1, with a head on the y1 end (a grease
// nipple on it) and a retaining clip in a groove on the y0 end.
export function pivotPin(K, owner, x, z, r, y0, y1, { name = "pin", nipple = true, clip = true, head = true, axis = "y" } = {}) {
  const geos = [];
  const add = (g, role, n) => geos.push([g, role, n]);
  const L = y1 - y0;
  add(new THREE.CylinderGeometry(r * MM, r * MM, L * MM, 20).translate(0, ((y0 + y1) / 2) * MM, 0), "steel", name);
  if (head) {
    add(new THREE.CylinderGeometry(r * 1.55 * MM, r * 1.55 * MM, 2.4 * MM, 6).translate(0, (y1 + 1.2) * MM, 0), "steel", `${name}_head`);
    if (nipple) {
      add(new THREE.CylinderGeometry(1.6 * MM, 1.6 * MM, 2.4 * MM, 6).translate(0, (y1 + 3.6) * MM, 0), "titanium", `${name}_nipple`);
      add(new THREE.SphereGeometry(1.3 * MM, 10, 8).translate(0, (y1 + 5.4) * MM, 0), "titanium", `${name}_nippleball`);
    }
  }
  if (clip) {
    add(new THREE.TorusGeometry(r * 1.02 * MM, 0.7 * MM, 6, 20, Math.PI * 1.7).rotateX(Math.PI / 2).translate(0, (y0 + 1.6) * MM, 0), "titanium", `${name}_clip`);
    add(new THREE.CylinderGeometry(r * 1.6 * MM, r * 1.6 * MM, 0.8 * MM, 20).translate(0, (y0 + 3.0) * MM, 0), "steel", `${name}_washer`);
  }
  for (const [g, role, n] of geos) {
    if (axis === "x") g.rotateZ(-Math.PI / 2);
    if (axis === "-y") g.rotateX(Math.PI);
    K.part(owner, axis === "x" ? g.translate(0, x * MM, z * MM) : g.translate(x * MM, 0, z * MM), role, n);
  }
}

/* ---------- Pipes, fittings, gears ---------- */
// A bent hard line through mm points, every corner bent on radius `bend`.
export function pipePath(pts, bend = 8) {
  const P = pts.map((p) => (p.isVector3 ? p.clone() : V(...p)));
  const path = new THREE.CurvePath();
  let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const u = a.clone().sub(b), w = c.clone().sub(b);
    const r = Math.min(bend, u.length() * 0.45, w.length() * 0.45);
    const p1 = b.clone().addScaledVector(u.normalize(), r), p2 = b.clone().addScaledVector(w.normalize(), r);
    if (cur.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(cur.clone(), p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  path.add(new THREE.LineCurve3(cur, P[P.length - 1].clone()));
  return path;
}
export function pipe(K, owner, pts, r, { bend = 8, role = "steel", name = "line", radial = 8 } = {}) {
  const path = pipePath(pts, bend), len = path.getLength();
  const g = new THREE.TubeGeometry(path, Math.max(4, Math.round(len / 5)), r, radial, false).scale(MM, MM, MM);
  K.part(owner, g, role, name);
  return path;
}
// A hose fitting on a face: hex body + crimped ferrule pointing along dir. Returns the point (mm) where
// the hose leaves it.
export function hoseEnd(K, owner, at, dir, r = 3, name = "fitting") {
  const d = dir.clone().normalize();
  K.part(owner, cylAlong(r * 1.35, 3.2, d, at, 6), "steel", `${name}_hex`);
  K.part(owner, cylAlong(r * 0.8, 1.6, d, at.clone().addScaledVector(d, 3.2), 12), "steel", `${name}_neck`);
  K.part(owner, cylAlong(r * 1.15, 6.5, d, at.clone().addScaledVector(d, 4.6), 14, r * 1.05), "steel", `${name}_ferrule`);
  return at.clone().addScaledVector(d, 10.5);
}
// Spur gear outline (x, y), n teeth between root and tip radius, with a bore.
export function gearShape(n, rRoot, rTip, bore = 0) {
  const s = new THREE.Shape(), pitch = (Math.PI * 2) / n;
  for (let k = 0; k < n; k++) {
    const a0 = k * pitch, pts = [[rRoot, a0], [rRoot, a0 + pitch * 0.18], [rTip, a0 + pitch * 0.34], [rTip, a0 + pitch * 0.62], [rRoot, a0 + pitch * 0.78]];
    pts.forEach(([r, a], i) => (k === 0 && i === 0 ? s.moveTo(r * Math.cos(a), r * Math.sin(a)) : s.lineTo(r * Math.cos(a), r * Math.sin(a))));
  }
  s.closePath();
  if (bore) s.holes.push(circleHole(0, 0, bore, 32));
  return s;
}

/* ---------- Live hydraulic cylinder ---------- */
// A double-acting cylinder between a pin A on `parent` (mm, parent frame) and a pin B on `child`
// (mm, child frame). The child turns about `axis` (parent frame) through `range` (rad). Barrel and rod
// are groups under `parent`; update() re-aims them at each other every frame. The pin axis is `pin`
// (parent frame); the barrel and rod are built along local +z with their eyes on local y.
// Lengths come from the pin-distance range so the rod never leaves the barrel and the barrel never
// hits the rod eye. style: "arm" (tie-rod cylinder with square caps) or "mini" (finger actuator).
export function hydraulic(K, { parent, child, A, B, axis, range, pin, out = 1, rb, rr, re, w, style = "arm", name = "cyl", sweep = 72 }) {
  const { part, turn } = K;
  // pin distance over the joint's range
  let dmin = Infinity, dmax = 0;
  const c0 = child.position.clone().divideScalar(MM);
  for (let i = 0; i <= sweep; i++) {
    const th = range[0] + ((range[1] - range[0]) * i) / sweep;
    const d = c0.clone().add(B.clone().applyAxisAngle(axis, th)).distanceTo(A);
    dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
  }
  const Lb = dmin - re - 1.5, Lr = dmin - re * 0.6;
  if (Lb + Lr < dmax + 2) console.warn(`[hydraulic] ${name}: stroke too short (${(Lb + Lr - dmax).toFixed(1)} mm overlap)`);
  const barrel = new THREE.Group(), rod = new THREE.Group();
  barrel.name = `${name}_barrel`; rod.name = `${name}_rod`;
  barrel.position.copy(A).multiplyScalar(MM);
  parent.add(barrel, rod);
  const Bobj = new THREE.Object3D();
  Bobj.position.copy(B).multiplyScalar(MM);
  child.add(Bobj);
  const lathe = (pts, seg = 28) => turn(pts, { seg, steps: 3 });
  const eyeGeo = (r, ww, seg = 24) => new THREE.CylinderGeometry(r * MM, r * MM, ww * MM, seg);
  // barrel: eye, caps, tube, gland
  if (style === "arm") {
    const s = rb + 2.5, capL = Math.max(8, rb * 0.75);
    const z0 = re + 1, z1 = z0 + capL, z3 = Lb - 3, z2 = z3 - capL;
    part(barrel, eyeGeo(re, w), "titanium", `${name}_eye`);
    part(barrel, eyeGeo(re * 0.55, w + 1.2, 16), "steel", `${name}_bush`);
    part(barrel, new THREE.BoxGeometry(re * 1.1 * MM, w * MM, (z0 + 1) * MM).translate(0, 0, (z0 / 2 + 0.5) * MM), "titanium", `${name}_neck`);
    const cap = (za, zb, n) => part(barrel, ext(K.roundedShape(K.rect(-s, -s, s, s), 3.5), za, zb, 1, 6), "joint", n);
    cap(z0, z1, `${name}_capR`);
    cap(z2, z3, `${name}_capF`);
    part(barrel, lathe([[0, z1 - 1], [rb, z1 - 1, 0.3], [rb, z2 + 1, 0.3], [0, z2 + 1]], 40), "metal", `${name}_tube`);
    part(barrel, lathe([[0, z3 - 0.5], [rr + 3.5, z3 - 0.5, 0.4], [rr + 3.5, Lb, 0.8], [0, Lb]]), "steel", `${name}_gland`);
    part(barrel, lathe([[0, Lb - 0.2], [rr + 1.8, Lb - 0.2, 0.2], [rr + 1.4, Lb + 1.4, 0.5], [0, Lb + 1.4]]), "rubber", `${name}_wiper`);
    // four tie rods with nuts at both ends
    const t = s - 3.2;
    for (const [x, y] of [[t, t], [-t, t], [t, -t], [-t, -t]]) {
      part(barrel, cylAlong(1.5, z3 - z0 + 2, V(0, 0, 1), V(x, y, z0 - 1), 8), "steel", `${name}_tierod`);
      part(barrel, cylAlong(2.3, 2, V(0, 0, -1), V(x, y, z0), 6), "steel", `${name}_tienutR`);
      part(barrel, cylAlong(2.3, 2, V(0, 0, 1), V(x, y, z3), 6), "steel", `${name}_tienutF`);
    }
    // ports on the outward face of both caps; the front one loops back along the barrel in a steel tube
    // to a load-holding valve block bolted on the rear cap.
    const oy = out * s;
    const vz0 = z1 + 1, vz1 = z1 + 14;
    part(barrel, ext(K.roundedShape(K.rect(-s + 3, 0, s - 3, 7), 1.5), vz0, vz1, 0.8, 4).rotateZ(out > 0 ? 0 : Math.PI).translate(0, oy * MM, 0), "metal", `${name}_valve`);
    for (const zz of [vz0 + 2.6, vz1 - 2.6]) part(barrel, cylAlong(1.3, 1.2, V(0, out, 0), V(1, oy + out * 7, zz), 6), "steel", `${name}_valvebolt`);
    part(barrel, cylAlong(3.2, 3, V(0, out, 0), V(-s + 7, oy + out * 7, (vz0 + vz1) / 2), 14), "gloss", `${name}_cartridge`);
    const fz = (z2 + z3) / 2;
    part(barrel, cylAlong(3, 4, V(0, out, 0), V(0, oy, fz), 6), "steel", `${name}_portF`);
    const tube = [V(0, oy + out * 4, fz), V(0, oy + out * 6, fz), V(0, oy + out * 6, vz1 + 3), V(0, oy + out * 5, vz1)];
    part(barrel, new THREE.TubeGeometry(pipePath(tube, 2.5), 16, 1.8, 8, false).scale(MM, MM, MM), "steel", `${name}_loop`);
    const end = hoseEnd(K, barrel, V(s - 6, oy + out * 7, (vz0 + vz1) / 2), V(0, out, 0), 2.6, `${name}_hosefit`);
    barrel.userData.port = end;   // where the supply hose plugs in (mm, barrel frame)
  } else {
    const z0 = re * 0.8, z3 = Lb;
    part(barrel, eyeGeo(re, w, 16), "titanium", `${name}_eye`);
    part(barrel, lathe([[0, z0], [rb * 0.8, z0, 0.3], [rb, z0 + 1.2, 0.3], [rb, z3 - 2.2, 0.3], [rr + 0.9, z3 - 1, 0.3], [rr + 0.9, z3], [0, z3]], 18), "metal", `${name}_tube`);
    part(barrel, lathe([[0, z3 - 2.6], [rb + 0.35, z3 - 2.6, 0.2], [rb + 0.35, z3 - 1.6, 0.2], [0, z3 - 1.6]], 6), "steel", `${name}_ring`);
    part(barrel, cylAlong(0.9, 1.6, V(0, 1, 0), V(0, rb - 0.3, z0 + 2.2), 6), "steel", `${name}_port`);
  }
  // rod: eye, end nut, chrome rod
  if (style === "arm") {
    part(rod, eyeGeo(re * 0.92, w), "steel", `${name}_rodeye`);
    part(rod, eyeGeo(re * 0.5, w + 1.2, 16), "titanium", `${name}_rodbush`);
    part(rod, lathe([[0, re * 0.5], [rr + 2.4, re * 0.5, 0.4], [rr + 2.4, re + 4, 0.6], [0, re + 4]], 6), "steel", `${name}_rodnut`);
    part(rod, lathe([[0, re], [rr, re, 0.2], [rr, Lr, 0.2], [0, Lr]], 28), "steel", `${name}_chrome`);
  } else {
    part(rod, eyeGeo(re * 0.85, w * 0.8, 14), "steel", `${name}_rodeye`);
    part(rod, lathe([[0, re * 0.5], [rr, re * 0.5, 0.1], [rr, Lr, 0.1], [0, Lr]], 12), "steel", `${name}_chrome`);
  }
  const ey = pin.clone().normalize(), tmp = new THREE.Vector3(), ex = new THREE.Vector3(), ez = new THREE.Vector3(), ey2 = new THREE.Vector3(), m = new THREE.Matrix4(), inv = new THREE.Matrix4();
  function update() {
    Bobj.getWorldPosition(tmp);
    inv.copy(parent.matrixWorld).invert();
    tmp.applyMatrix4(inv);
    ez.subVectors(tmp, barrel.position).normalize();
    ex.crossVectors(ey, ez).normalize();
    ey2.crossVectors(ez, ex);
    m.makeBasis(ex, ey2, ez);
    barrel.quaternion.setFromRotationMatrix(m);
    rod.position.copy(tmp);
    m.makeBasis(ex.negate(), ey2, ez.negate());
    rod.quaternion.setFromRotationMatrix(m);
  }
  return { barrel, rod, update, Lb, Lr, dmin, dmax };
}
