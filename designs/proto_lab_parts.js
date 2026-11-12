// Helpers for the "Lab" prototype: machined plates with milled pockets, socket screws, stand-offs,
// toothed rings, stator windings, PCBs, braided looms, flat flex ribbons. All sizes in millimetres.
import * as THREE from "three";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// Deterministic random numbers, so every load builds the same boards.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Convex hull of circles [cx, cy, r] as a list of points (counter-clockwise).
export function hullPts(circles, n = 32) {
  const P = [];
  for (const [cx, cy, r] of circles) {
    if (r <= 0) { P.push([cx, cy]); continue; }
    const k = Math.max(8, Math.round(n * Math.min(1, 0.35 + r / 20)));
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
export function pathOf(pts, Type = THREE.Shape) {
  const s = new Type();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
export const hull = (circles, Type = THREE.Shape) => pathOf(hullPts(circles), Type);
export const rrect = (x0, y0, x1, y1, r) => [[x0 + r, y0 + r, r], [x1 - r, y0 + r, r], [x1 - r, y1 - r, r], [x0 + r, y1 - r, r]];
export const circle = (cx, cy, r, n = 40, Type = THREE.Path) => {
  const p = new Type();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; i ? p.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : p.moveTo(cx + r, cy); }
  return p;
};

export function makeKit(K) {
  const { MM, part, turn } = K;
  const T = (g, at = [0, 0, 0]) => g.translate(at[0] * MM, at[1] * MM, at[2] * MM);
  // Turn a geometry built along +Z so that +Z points along the named axis.
  const orient = (g, axis = "z") => {
    switch (axis) {
      case "x": return g.rotateY(Math.PI / 2);
      case "-x": return g.rotateY(-Math.PI / 2);
      case "y": return g.rotateX(-Math.PI / 2);
      case "-y": return g.rotateX(Math.PI / 2);
      case "-z": return g.rotateX(Math.PI);
      default: return g;
    }
  };
  const boxG = (w, h, d) => new THREE.BoxGeometry(w * MM, h * MM, d * MM);
  // A cylinder along +Z, centred, radius r (r2 at the +z end).
  const cylG = (r, h, seg = 20, r2 = r) => new THREE.CylinderGeometry(r2 * MM, r * MM, h * MM, seg).rotateX(Math.PI / 2);
  // Extrude a shape (mm) from w0 to w1 along +Z with a chamfer that keeps the outline exact.
  function extG(shape, w0, w1, bevel = 0.4, holes = [], curve = 10) {
    shape.holes.push(...holes);
    const b = Math.min(bevel, (w1 - w0) / 2.2);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.02, w1 - w0 - 2 * b), bevelEnabled: b > 0.01, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: curve });
    return g.translate(0, 0, w0 + (b > 0.01 ? b : 0)).scale(MM, MM, MM);
  }
  // A rounded box, centred, w x h across, d deep along +Z.
  const rboxG = (w, h, d, r = 1, bevel = 0.3) => extG(hull(rrect(-w / 2, -h / 2, w / 2, h / 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01))), -d / 2, d / 2, bevel);
  // A ring (lathe) between radii, z0..z1, along +Z.
  const ringG = (rIn, rOut, z0, z1, seg = 48, f = 0.4) => turn([[rIn, z0], [rOut, z0, f], [rOut, z1, f], [rIn, z1, f], [rIn, z0]], { seg, steps: 2 });
  // Disc (solid) z0..z1.
  const discG = (r, z0, z1, seg = 48, f = 0.4) => turn([[0, z0], [r, z0, f], [r, z1, f], [0, z1]], { seg, steps: 2 });
  // Toothed ring: N teeth on the outside (tips rTip, roots rRoot), bore rIn, z0..z1.
  function gearG(rIn, rRoot, rTip, N, z0, z1, inner = false) {
    const pts = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, d = Math.PI * 2 / N;
      for (const [f, r] of [[0, rRoot], [0.22, rTip], [0.5, rTip], [0.72, rRoot]]) pts.push([r * Math.cos(a + f * d), r * Math.sin(a + f * d)]);
    }
    if (!inner) return extG(pathOf(pts), z0, z1, 0, rIn > 0 ? [circle(0, 0, rIn, 48)] : [], 6);
    // internal teeth: outer circle rIn (used as outside radius), tooth profile as the hole
    return extG(circle(0, 0, rIn, 64, THREE.Shape), z0, z1, 0, [pathOf(pts, THREE.Path)], 6);
  }
  // A lathe with fine circumferential grooves (a laminated stack, a braided sleeve, knurling).
  function groovedG(r, z0, z1, pitch = 0.8, depth = 0.25, seg = 40) {
    const pts = [[0, z0], [r - depth, z0]];
    for (let z = z0; z < z1 - 1e-6; z += pitch) { pts.push([r, z + pitch * 0.25]); pts.push([r, z + pitch * 0.6]); pts.push([r - depth, z + pitch * 0.85]); }
    pts.push([r - depth, z1], [0, z1]);
    return turn(pts, { seg, steps: 1 });
  }
  const add = (owner, g, role, name) => part(owner, g, role, name);
  function B(owner, role, name, size, at = [0, 0, 0], rot = [0, 0, 0]) {
    const g = boxG(...size);
    if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]);
    return part(owner, T(g, at), role, name);
  }
  function C(owner, role, name, r, h, at = [0, 0, 0], axis = "z", seg = 20, r2 = r) { return part(owner, T(orient(cylG(r, h, seg, r2), axis), at), role, name); }
  // Orient a geometry so +Y points along dir, then move it to `at` (mm).
  const along = (g, dir, at) => T(g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())), [at.x ?? at[0], at.y ?? at[1], at.z ?? at[2]]);
  // A rod / cylinder between two points (mm).
  function rod(owner, role, name, a, b, r, seg = 10) {
    const A = V(...a), Bv = V(...b), d = Bv.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(r * MM, r * MM, L * MM, seg);
    return part(owner, along(g, d, A.clone().add(Bv).multiplyScalar(0.5)), role, name);
  }
  // A hex stand-off between two points (mm).
  const standoff = (owner, a, b, r = 2.2, role = "titanium", name = "standoff") => rod(owner, role, name, a, b, r, 6);
  // A socket-head cap screw, head on the surface at `at`, axis `dir`.
  function screw(owner, at, dir, r = 1.4, name = "screw") {
    const h = r * 0.85;
    const head = new THREE.CylinderGeometry(r * 0.88 * MM, r * MM, h * MM, 12).translate(0, (h / 2) * MM, 0);
    const sock = new THREE.CylinderGeometry(r * 0.48 * MM, r * 0.48 * MM, 0.1 * MM, 6, 1).translate(0, (h + 0.03) * MM, 0);
    const p = at.isVector3 ? at : V(...at);
    part(owner, along(head, dir, p), "steel", name);
    part(owner, along(sock, dir, p), "gloss", `${name}_socket`);
  }
  function screwCircle(owner, n, R, center, axis, r, name = "screw", phase = 0) {
    const a = axis.clone().normalize();
    const u = Math.abs(a.z) < 0.9 ? V(0, 0, 1).cross(a).normalize() : V(1, 0, 0).cross(a).normalize();
    const w = a.clone().cross(u);
    for (let i = 0; i < n; i++) {
      const t = phase + (i / n) * Math.PI * 2;
      screw(owner, center.clone().addScaledVector(u, Math.cos(t) * R).addScaledVector(w, Math.sin(t) * R), a, r, `${name}${i}`);
    }
  }
  // Plane mappings for flat plates: shape (u, v), thickness along w.
  //   "xz": u -> x, v -> z, w -> -y      "yz": u -> y, v -> z, w -> x      "xy": u -> x, v -> y, w -> z
  const PLANES = {
    xz: new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, -1, 0)),
    yz: new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)),
    xy: new THREE.Matrix4(),
  };
  const wRange = (plane, c0, c1) => (plane === "xz" ? [-c1, -c0] : [c0, c1]);
  // A machined plate: outline (hull circles), through holes, milled pockets (recessed `depth` from the
  // `face` side: +1 = the +normal side), lying across normal coordinate c0..c0+t.
  function plate(owner, role, name, outline, { plane = "xz", c0 = 0, t = 4, holes = [], pockets = [], depth = 1.6, face = 1, bevel = 0.5, floorRole = role } = {}) {
    const shape = hull(outline);
    pockets = pockets.map((p) => (Array.isArray(p) ? { c: p, h: [] } : p));
    const H = [...holes.map((h) => (h instanceof THREE.Path ? h : hull(h, THREE.Path))), ...pockets.map((p) => hull(p.c, THREE.Path))];
    const [w0, w1] = wRange(plane, c0, c0 + t);
    const m = part(owner, extG(shape, w0, w1, bevel, H).applyMatrix4(PLANES[plane]), role, name);
    pockets.forEach((p, i) => {
      const [f0, f1] = face > 0 ? wRange(plane, c0, c0 + t - depth) : wRange(plane, c0 + depth, c0 + t);
      const fh = p.h.map((h) => (h instanceof THREE.Path ? h : hull(h, THREE.Path)));
      part(owner, extG(hull(p.c), f0 + 0.01, f1 - 0.01, fh.length ? 0.3 : 0, fh).applyMatrix4(PLANES[plane]), floorRole, `${name}_pocket${i}`);
    });
    return m;
  }
  // A group with +Z along `axis` at `at` (mm): build axial parts in it as if along Z.
  function axisFrame(owner, at = [0, 0, 0], axis = "z") {
    const g = new THREE.Group();
    g.position.set(at[0] * MM, at[1] * MM, at[2] * MM);
    if (axis === "y") g.rotation.x = -Math.PI / 2;
    else if (axis === "-y") g.rotation.x = Math.PI / 2;
    else if (axis === "x") g.rotation.y = Math.PI / 2;
    else if (axis === "-x") g.rotation.y = -Math.PI / 2;
    else if (axis === "-z") g.rotation.x = Math.PI;
    owner.add(g);
    return g;
  }
  // A group with local x = u, local z = n (mm origin), for boards and brackets.
  function basisFrame(owner, at, u, n) {
    const g = new THREE.Group();
    const x = u.clone().normalize(), z = n.clone().normalize(), y = z.clone().cross(x);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    g.position.set(at[0] * MM, at[1] * MM, at[2] * MM);
    owner.add(g);
    return g;
  }
  // A braided loom along a path of points (mm): a tube with a criss-cross weave pressed into it.
  function loom(owner, role, name, pts, r = 3, { radial = 12, pitch = 1.6, amp = 0.32 } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p).multiplyScalar(MM)));
    const L = curve.getLength() / MM, segs = Math.max(8, Math.round(L / (pitch * 0.5)));
    const g = new THREE.TubeGeometry(curve, segs, r * MM, radial, false);
    const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let j = 0; j <= segs; j++) {
      curve.getPointAt(j / segs, c);
      const s = (j / segs) * L;
      for (let k = 0; k <= radial; k++) {
        const i = j * (radial + 1) + k, th = (k / radial) * Math.PI * 2;
        v.fromBufferAttribute(p, i).sub(c);
        const wv = 0.5 * (Math.abs(Math.sin(3 * th + s * 1.9)) + Math.abs(Math.sin(3 * th - s * 1.9))) - 0.55;
        v.multiplyScalar((r + amp * wv) / r);
        p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
      }
    }
    g.computeVertexNormals();
    return part(owner, g, role, name);
  }
  // A plain cable along points (mm).
  function wire(owner, role, name, pts, r = 0.6, radial = 6) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p).multiplyScalar(MM)));
    const L = curve.getLength() / MM;
    return part(owner, new THREE.TubeGeometry(curve, Math.max(4, Math.round(L / 3)), r * MM, radial, false), role, name);
  }
  // A helix (worm thread) along +Z, centred.
  function helixG(rH, len, turns, rT = 0.5) {
    class H extends THREE.Curve { getPoint(t, o = new THREE.Vector3()) { const a = t * turns * Math.PI * 2; return o.set(rH * Math.cos(a) * MM, rH * Math.sin(a) * MM, (t - 0.5) * len * MM); } }
    return new THREE.TubeGeometry(new H(), Math.round(turns * 12), rT * MM, 5, false);
  }
  return { T, orient, boxG, cylG, extG, rboxG, ringG, discG, gearG, groovedG, add, B, C, along, rod, standoff, screw, screwCircle, plate, axisFrame, basisFrame, loom, wire, helixG, PLANES };
}

// A flat flex ribbon between two anchors (on different moving parts), re-routed every frame like
// flexCable, but a thin wide strip whose width runs along wA / wB (each in its anchor's frame).
export function ribbon(K, owner, a, b, { tA = V(0, 0, 1), tB = V(0, 0, -1), wA = V(0, 1, 0), wB = V(0, 1, 0), width = 20, thick = 0.5, sag = 0.006, stiffness = 0.4, role = "gloss", name = "ribbon", segments = 30 } = {}) {
  const N = segments, perRing = 8;
  const pos = new Float32Array((N + 1) * perRing * 3), uv = new Float32Array((N + 1) * perRing * 2), idx = [];
  for (let i = 0; i <= N; i++) for (let k = 0; k < perRing; k++) { uv[(i * perRing + k) * 2] = i / N; uv[(i * perRing + k) * 2 + 1] = k / perRing; }
  for (let f = 0; f < 4; f++) for (let i = 0; i < N; i++) {
    const p = (i * perRing + f * 2), q = ((i + 1) * perRing + f * 2);
    idx.push(p, p + 1, q, p + 1, q + 1, q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = K.live(K.part(owner, g, role, name));
  mesh.frustumCulled = false;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), da = new THREE.Vector3(), db = new THREE.Vector3(), ua = new THREE.Vector3(), ub = new THREE.Vector3();
  const inv = new THREE.Matrix4(), curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  const P = new THREE.Vector3(), Tn = new THREE.Vector3(), W = new THREE.Vector3(), Nn = new THREE.Vector3();
  const hw = (width / 2) * K.MM, ht = (thick / 2) * K.MM;
  // corner order around the section: (+w,+n) (-w,+n) (-w,-n) (+w,-n); each face uses two corners
  const faces = [[[1, 1], [-1, 1]], [[-1, 1], [-1, -1]], [[-1, -1], [1, -1]], [[1, -1], [1, 1]]];
  function update() {
    a.getWorldPosition(pa); b.getWorldPosition(pb);
    da.copy(tA).transformDirection(a.matrixWorld); db.copy(tB).transformDirection(b.matrixWorld);
    ua.copy(wA).transformDirection(a.matrixWorld); ub.copy(wB).transformDirection(b.matrixWorld);
    if (ua.dot(ub) < 0) ub.negate();
    const len = pa.distanceTo(pb);
    curve.v0.copy(pa); curve.v1.copy(pa).addScaledVector(da, len * stiffness);
    curve.v2.copy(pb).addScaledVector(db, len * stiffness); curve.v3.copy(pb);
    curve.v1.y -= sag; curve.v2.y -= sag;
    inv.copy(owner.matrixWorld).invert();
    for (const v of [curve.v0, curve.v1, curve.v2, curve.v3]) v.applyMatrix4(inv);
    ua.transformDirection(inv); ub.transformDirection(inv);
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      curve.getPoint(s, P); curve.getTangent(s, Tn);
      W.copy(ua).lerp(ub, s); W.addScaledVector(Tn, -W.dot(Tn)).normalize();
      Nn.copy(Tn).cross(W);
      faces.forEach((fc, f) => fc.forEach(([sw, sn], e) => {
        const o = (i * perRing + f * 2 + e) * 3;
        pos[o] = P.x + W.x * hw * sw + Nn.x * ht * sn; pos[o + 1] = P.y + W.y * hw * sw + Nn.y * ht * sn; pos[o + 2] = P.z + W.z * hw * sw + Nn.z * ht * sn;
      }));
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  return { mesh, update };
}
