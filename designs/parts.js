// Shape helpers shared by the designs: fasteners, plates, faceted shells.
import * as THREE from "three";

// A socket-head cap screw seen from outside: a steel head with a dark hex socket, its axis along `dir`.
export function bolt(K, owner, at, dir, headR = 2.2, headH = 1.6, name = "bolt") {
  const { MM, part } = K;
  const g = new THREE.CylinderGeometry(headR * MM, headR * MM, headH * MM, 20).translate(0, (headH / 2) * MM, 0);
  const s = new THREE.CylinderGeometry(headR * 0.45 * MM, headR * 0.45 * MM, 0.6 * MM, 6).translate(0, (headH + 0.05) * MM, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  for (const [geo, role, n] of [[g, "steel", name], [s, "joint", `${name}_socket`]]) {
    geo.applyQuaternion(q).translate(at.x * MM, at.y * MM, at.z * MM);
    part(owner, geo, role, n);
  }
}
// A ring of n screws on radius R around `axis` (unit vector), on the plane through `center` (mm).
export function boltCircle(K, owner, n, R, center, axis, headR, name = "bolt", phase = 0) {
  const a = axis.clone().normalize();
  const u = Math.abs(a.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(a).normalize() : new THREE.Vector3(1, 0, 0).cross(a).normalize();
  const w = a.clone().cross(u);
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    const p = center.clone().addScaledVector(u, Math.cos(t) * R).addScaledVector(w, Math.sin(t) * R);
    bolt(K, owner, p, a, headR, headR * 0.7, `${name}${i}`);
  }
}
// A flat plate whose outline is the hull of two circles (radius a at y=0, b at y=L) in the y-z plane,
// spanning x0..x1 (mm). The shape of a finger's side plate or a link's web.
export function stadiumPlate(K, a, b, L, x0, x1, bevel = 0.3) {
  const { MM } = K;
  const s = new THREE.Shape();
  s.moveTo(a, 0);
  s.lineTo(b, L);
  s.absarc(0, L, b, 0, Math.PI, false);
  s.lineTo(-a, 0);
  s.absarc(0, 0, a, Math.PI, Math.PI * 2, false);
  const t = Math.abs(x1 - x0);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.05, t - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: 20 });
  g.translate(0, 0, bevel);
  g.rotateY(-Math.PI / 2);   // shape x -> hand z, shape y -> hand y, extrusion -> -x
  g.translate(Math.max(x0, x1), 0, 0);
  return g.scale(MM, MM, MM);
}

// An anchor: an empty point on a moving part (mm), for cables to run between.
export function anchor(K, owner, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x * K.MM, y * K.MM, z * K.MM);
  owner.add(o);
  return o;
}
// A flexible cable or hose between two anchors on different moving parts. It leaves each anchor along a
// direction given in that anchor's own frame (tA, tB), sags a little, and is re-routed every frame:
// call .update() from the design's update(). `owner` is the static part it belongs to (usually K.base).
export function flexCable(K, owner, a, b, { tA = new THREE.Vector3(0, 0, 1), tB = new THREE.Vector3(0, 0, -1), radius = 2, sag = 0.015, role = "rubber", name = "cable", segments = 28, radial = 8, stiffness = 0.38 } = {}) {
  const mesh = K.live(K.part(owner, new THREE.BufferGeometry(), role, name));
  mesh.frustumCulled = false;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), da = new THREE.Vector3(), db = new THREE.Vector3(), inv = new THREE.Matrix4();
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  function update() {
    a.getWorldPosition(pa);
    b.getWorldPosition(pb);
    da.copy(tA).transformDirection(a.matrixWorld);
    db.copy(tB).transformDirection(b.matrixWorld);
    const len = pa.distanceTo(pb);
    inv.copy(owner.matrixWorld).invert();
    curve.v0.copy(pa);
    curve.v1.copy(pa).addScaledVector(da, len * stiffness);
    curve.v2.copy(pb).addScaledVector(db, len * stiffness);
    curve.v3.copy(pb);
    curve.v1.y -= sag; curve.v2.y -= sag;   // world y is up: a little droop
    for (const v of [curve.v0, curve.v1, curve.v2, curve.v3]) v.applyMatrix4(inv);
    const g = new THREE.TubeGeometry(curve, segments, radius * K.MM, radial, false);
    mesh.geometry.dispose();
    mesh.geometry = g;
  }
  return { mesh, update };
}
