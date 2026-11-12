// "Biomech": a tendon-driven, bio-inspired prototype arm.
// A sculpted bone-white skeleton (a scapula yoke, a humerus with flared ends and a grooved trochlea, twin
// radius/ulna forearm bones with eyes round the elbow and wrist axles, carpal pebbles, metacarpals and
// phalanges) driven by braided McKibben air muscles. Each muscle hangs from a banjo-fed clevis on one
// bone; a steel tendon from its far crimp runs over the joint's grooved condyle to a clevis on the next
// bone, so as a joint bends the muscles on its inside shorten and swell and those outside stretch thin.
// Finger tendons come off five spools in the forearm (they turn as the fingers curl), pass the hollow
// roll joints, run over little pulleys at the wrist and fan out through the palm to the fingertips.
// Valve manifolds with pressure LEDs feed each muscle group; a pump, accumulator and gauge sit on the
// base. Translucent smoke skin covers part of the forearm, the palm and the back of the hand.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bolt, boltCircle, anchor, flexCable, stadiumPlate } from "./parts.js";
import { smooth, bump, clamp, sculpt, smoothNormals, ellipseR, radiusProfile, roundedSlab, hull2, braidGeo, PlanarTube, wrapPath, pathPoint } from "./proto_biomech_parts.js";

export const label = "Biomech";

// Everything update() animates.
const ST = { muscles: [], tendons: [], spools: [], leds: [], cables: [], fan: null, needle: null, activity: 0, K: null };
const MMc = 0.001;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Finger proportions (fractions of the finger radius d/2).
const KR = 0.74, KH = 0.74;          // knuckle (metacarpal head) radius, half-width
const CR = [0.64, 0.57];             // condyle radius at the far end of bones 0, 1
const CH = [0.66, 0.58];             // condyle half-width
const SR = [0.4, 0.37, 0.36];        // mid-shaft radius
const TIP = 0.62;                    // fingertip skin radius
// Order of the finger tendons across the wrist (link y, mm) and in the palm trunk (palm x offset, mm).
const LANE = { little: -6, ring: -3, middle: 0, index: 3, thumb: 6 };

/* ------------------------------------------------------------------ shared builders */
function kit(K) {
  const { MM, part, turn, alongY } = K;
  // like K.slab, at a resolution suited to small parts
  const slab = (shape, z0, z1, bevel, holes = [], curve = 8) => {
    shape.holes.push(...holes);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, z1 - z0 - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: curve });
    return g.translate(0, 0, z0 + bevel).scale(MM, MM, MM);
  };
  const lathe = (pts, o = {}) => turn(pts, { seg: 40, steps: 3, ...o });
  const at = (g, x, y, z) => g.translate(x * MM, y * MM, z * MM);
  const band = (owner, z0, z1, r, role, name, o = {}) => part(owner, lathe([[0, z0], [r, z0, Math.min(0.6, (z1 - z0) / 3)], [r, z1, Math.min(0.6, (z1 - z0) / 3)], [0, z1]], { steps: 3, ...o }), role, name);
  const torusZ = (R, r, seg = 40, arc = Math.PI * 2, radial = 5) => new THREE.TorusGeometry(R * MM, r * MM, radial, seg, arc);
  const torusY = (R, r, seg = 40) => torusZ(R, r, seg).rotateX(Math.PI / 2);
  const torusX = (R, r, seg = 40) => torusZ(R, r, seg).rotateY(Math.PI / 2);
  const cylY = (r, y0, y1, seg = 20) => new THREE.CylinderGeometry(r * MM, r * MM, (y1 - y0) * MM, seg).translate(0, ((y0 + y1) / 2) * MM, 0);
  const cylX = (r, x0, x1, seg = 20) => cylY(r, x0, x1, seg).rotateZ(-Math.PI / 2);
  const cylZ = (r, z0, z1, seg = 20) => cylY(r, z0, z1, seg).rotateX(Math.PI / 2);
  // a lathe whose axis is y: profile [[r, y], ...]
  const axleY = (pts, o = {}) => alongY(lathe(pts, o));
  // a lathe whose axis is x
  const axleX = (pts, o = {}) => lathe(pts, o).rotateY(Math.PI / 2);
  // a rod between two points (mm)
  const rod = (p0, p1, r, seg = 10) => {
    const d = new THREE.Vector3().subVectors(p1, p0), g = new THREE.CylinderGeometry(r * MM, r * MM, d.length() * MM, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
    return g.translate(((p0.x + p1.x) / 2) * MM, ((p0.y + p1.y) / 2) * MM, ((p0.z + p1.z) / 2) * MM);
  };
  // a smooth tube through points (mm)
  const hose = (owner, pts, r, role, name, seg = 48, radial = 8) => part(owner, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p.clone() : V(...p)).multiplyScalar(MM)), false, "centripetal"), seg, r * MM, radial), role, name);
  // a lug: two circles in the x-z plane joined by tangents, y0..y1 thick
  const lug = (owner, x0, z0, r0, x1, z1, r1, y0, y1, role, name, bevel = 0.5) => part(owner, slab(hull2(x0, z0, r0, x1, z1, r1), -y1, -y0, bevel, [], 5).rotateX(Math.PI / 2), role, name);
  // a thin strap in the y-z plane (circles r0 at y0, r1 at y1), x0..x1 thick
  const strap = (r0, y0, r1, y1, x0, x1) => slab(hull2(y0, 0, r0, y1, 0, r1), x0, x1, 0.12, [], 5).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  // a bone along z (link frame): radius rf(z), caps, sculpt fn(z, a, r) (a from +X toward +Y)
  const boneZ = (owner, name, z0, z1, rf, { n = 40, seg = 64, caps = ["flat", "flat"], fn = null, sx = 1, sy = 1, role = "satin", x = 0, y = 0 } = {}) => {
    let g = turn(radiusProfile(z0, z1, rf, n, caps), { seg, steps: 0 });
    if (fn) g = sculpt(g, fn);
    g.scale(sx, sy, 1).translate(x * MM, y * MM, 0);
    return part(owner, g, role, name);
  };
  // a bone between two points (mm): radius rf(t), sculpt fn(t, a, r) in the bone's own frame
  const boneBetween = (p0, p1, rf, { n = 36, seg = 48, fn = null, caps = ["round", "round"] } = {}) => {
    const d = new THREE.Vector3().subVectors(p1, p0), len = d.length();
    let g = turn(radiusProfile(0, len, (z) => rf(z / len), n, caps), { seg, steps: 0 });
    if (fn) g = sculpt(g, (z, a, r) => fn(z / len, a, r));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d.clone().normalize()));
    return g.translate(p0.x * MM, p0.y * MM, p0.z * MM);
  };
  return { strap, slab, lathe, at, band, torusZ, torusY, torusX, cylY, cylX, cylZ, axleY, axleX, rod, hose, lug, boneZ, boneBetween };
}

// A pulsing light. kind: "valve" (follows a muscle's pressure), "beat" (slow heartbeat), "tip" (finger
// pressure), "status".
function led(K, owner, at, r, name, kind, extra = {}) {
  const role = extra.role ?? "glow";
  const mesh = K.livePart(owner, new THREE.SphereGeometry(r * K.MM, 10, 8), role, name, at);
  const L = { mesh, kind, phase: Math.random() * 6.28, mat: null, base: 1, ...extra };
  ST.leds.push(L);
  return L;
}

/* ------------------------------------------------------------------ the muscles */
// A McKibben muscle from a clevis at O (parent frame, mm) to a tendon clevis at I = [x, z] in the child
// link's frame (same y). R: radius the tendon wraps at round the joint; rM: muscle radius; L0: its length
// straight. The muscle, its crimps and its tendon are re-placed every frame from the joint angle.
function muscle(K, B, parent, child, O, I, R, rM, L0, name, { tendonR = 0.9, strands = 10 } = {}) {
  const { MM, part, live } = K; const slab = B.slab;
  const s = Math.sign(O[0]), y = O[1], sy = Math.sign(y) || 1, rE = rM * 0.56, ey = rE + 1.6;
  const body = live(part(parent, braidGeo(L0, rM, { strands, rEnd: 0.56, angle: 0.38 }), "carbon", name));
  body.frustumCulled = false;
  const og = new THREE.Group(), eg = new THREE.Group();
  og.name = `${name}_origin`; eg.name = `${name}_end`;
  parent.add(og, eg);
  // origin: a rod eye on the pin, a ferrule crimped over the sleeve
  part(og, B.axleY([[0, -ey], [3.6, -ey, 0.5], [3.6, ey, 0.5], [0, ey]], { seg: 24, steps: 3 }), "titanium", `${name}_eye`);
  part(og, B.lathe([[0, 1], [rE + 1.5, 1, 0.5], [rE + 1.5, 10, 0.6], [rE + 0.7, 11.5, 0.3], [0, 11.5]], { seg: 20, steps: 2 }), "titanium", `${name}_ferrule0`);
  for (const z of [3.6, 7.6]) part(og, B.torusZ(rE + 1.6, 0.45, 18, Math.PI * 2, 4).translate(0, 0, z * MM), "steel", `${name}_crimp0`);
  // far end: ferrule, then a swaged cone down to the tendon
  part(eg, B.lathe([[0, -11.5], [rE + 0.7, -11.5, 0.3], [rE + 1.5, -10, 0.6], [rE + 1.5, -1, 0.5], [2.6, 1, 0.8], [1.3, 8, 0.3], [0, 8.4]], { seg: 20, steps: 2 }), "titanium", `${name}_ferrule1`);
  for (const z of [-3.6, -7.6]) part(eg, B.torusZ(rE + 1.6, 0.45, 18, Math.PI * 2, 4).translate(0, 0, z * MM), "steel", `${name}_crimp1`);
  // the clevis it hangs from, its pin and a banjo fitting for the air
  const bx = O[0] * 0.55, bz = O[2] - 5;
  for (const side of [-1, 1]) B.lug(parent, O[0], O[2], 5.2, bx, bz, 7, y + side * (ey + 0.2) + (side < 0 ? -2.2 : 0), y + side * (ey + 0.2) + (side > 0 ? 2.2 : 0), "titanium", `${name}_clevis`);
  part(parent, B.cylY(1.7, y - ey - 3.2, y + ey + 3.2, 16).translate(O[0] * MM, 0, O[2] * MM), "steel", `${name}_pin`);
  part(parent, B.cylY(3.2, sy > 0 ? y + ey + 2.4 : y - ey - 6.6, sy > 0 ? y + ey + 6.6 : y - ey - 2.4, 6).translate(O[0] * MM, 0, O[2] * MM), "titanium", `${name}_banjo`);
  part(parent, B.cylY(1.5, sy > 0 ? y + ey + 6.6 : y - ey - 9.4, sy > 0 ? y + ey + 9.4 : y - ey - 6.6, 12).translate(O[0] * MM, 0, O[2] * MM), "steel", `${name}_barb`);
  // the tendon's clevis on the next bone
  const ix = I[0] * 0.6, iz = I[1] - 4;
  for (const side of [-1, 1]) B.lug(child, I[0], I[1], 3.6, ix, iz, 5, y + side * 3.2 + (side < 0 ? -1.8 : 0), y + side * 3.2 + (side > 0 ? 1.8 : 0), "titanium", `${name}_tclevis`);
  part(child, B.axleY([[0, y - 3], [2.4, y - 3, 0.4], [2.4, y + 3, 0.4], [0, y + 3]], { seg: 20, steps: 2 }).translate(I[0] * MM, 0, I[1] * MM), "titanium", `${name}_teye`);
  part(child, B.cylY(1.1, y - 5.6, y + 5.6, 12).translate(I[0] * MM, 0, I[1] * MM), "steel", `${name}_tpin`);
  const tendon = new PlanarTube(K, parent, 34, tendonR, "steel", `${name}_tendon`);
  const Jz = child.position.z / MM, Op = { x: O[0], z: O[2] }, C = { x: 0, z: Jz };
  const Lt = wrapPath(Op, { x: I[0], z: I[1] + Jz }, C, R, s).S - L0;
  const v = new THREE.Vector3(), pt = { x: 0, z: 0 };
  const M = {
    ratio: 1, inlet: V(O[0], y + sy * (ey + 9.4), O[2]), sy, led: null,
    update() {
      v.set(I[0] * MM, y * MM, I[1] * MM).applyMatrix4(child.matrix);
      const P = wrapPath(Op, { x: v.x / MM, z: v.z / MM }, C, R, s);
      const Lm = clamp(P.S - Lt, 0.7 * L0, Math.min(1.25 * L0, P.lead - 14));
      const ratio = Lm / L0, k = 1 / Math.sqrt(ratio);
      pathPoint(P, P.lead * 0.5, pt);
      const dx = pt.x - O[0], dz = pt.z - O[2], l = Math.hypot(dx, dz) || 1, phi = Math.atan2(dx, dz);
      body.position.set(O[0] * MM, y * MM, O[2] * MM);
      body.rotation.set(0, phi, 0);
      body.scale.set(k, k, ratio);
      og.position.copy(body.position);
      og.rotation.set(0, phi, 0);
      eg.position.set((O[0] + (dx / l) * Lm) * MM, y * MM, (O[2] + (dz / l) * Lm) * MM);
      eg.rotation.set(0, phi, 0);
      const d0 = Lm + 8, n = tendon.n;
      for (let i = 0; i < n; i++) { pathPoint(P, d0 + ((P.S - d0) * i) / (n - 1), pt); tendon.xs[i] = pt.x; tendon.zs[i] = pt.z; }
      tendon.commit(y);
      M.ratio = ratio;
    },
  };
  ST.muscles.push(M);
  return M;
}
// A bare tendon from O (parent frame) to I (child frame, [x, z]) over a pulley of radius R at the joint.
function jointTendon(K, parent, child, O, I, R, r, name, role = "steel") {
  const MM = K.MM, s = Math.sign(O[0]) || 1, y = O[1], Jz = child.position.z / MM, Op = { x: O[0], z: O[2] }, C = { x: 0, z: Jz };
  const tube = new PlanarTube(K, parent, 30, r, role, name, 5), v = new THREE.Vector3(), pt = { x: 0, z: 0 };
  ST.tendons.push({
    update() {
      v.set(I[0] * MM, y * MM, I[1] * MM).applyMatrix4(child.matrix);
      const P = wrapPath(Op, { x: v.x / MM, z: v.z / MM }, C, R, s);
      for (let i = 0; i < tube.n; i++) { pathPoint(P, (P.S * i) / (tube.n - 1), pt); tube.xs[i] = pt.x; tube.zs[i] = pt.z; }
      tube.commit(y);
    },
  });
}
// A valve manifold: a titanium block on a link with one solenoid valve (and pressure LED) per muscle, and
// an air line from each valve round the bone to that muscle's banjo. Block centred at c (mm), its face
// pointing along -y (face = -1) or +y; valves stacked along z.
function manifold(K, B, owner, c, muscles, name, { w = 16, h = null, face = -1, rr = 44, lineR = 1.15, under = 10 } = {}) {
  const { MM, part, roundedShape, rect } = K; const slab = B.slab;
  const n = muscles.length, pitch = 8.6, H = h ?? n * pitch + 6, d = 7;
  const y0 = c.y, yF = y0 + face * d;   // block from y0 (against the bone) to its face
  part(owner, slab(roundedShape(rect(-w / 2, c.z - H / 2, w / 2, c.z + H / 2), 2), Math.min(-y0, -yF), Math.max(-y0, -yF), 0.8).rotateX(Math.PI / 2).translate(c.x * MM, 0, 0), "titanium", `${name}_block`);
  // end caps and fixing screws
  for (const zz of [c.z - H / 2 + 2.4, c.z + H / 2 - 2.4]) for (const xx of [-w / 2 + 2.6, w / 2 - 2.6]) bolt(K, owner, V(c.x + xx, yF, zz), V(0, face, 0), 1.2, 0.9, `${name}_screw`);
  muscles.forEach((m, i) => {
    const z = c.z - ((n - 1) / 2) * pitch + i * pitch;
    // valve body and coil
    part(owner, slab(roundedShape(rect(-w / 2 + 1, z - 3.6, w / 2 - 4, z + 3.6), 1.2), face < 0 ? 0 : -5.4, face < 0 ? 5.4 : 0, 0.5).rotateX(Math.PI / 2).translate(c.x * MM, yF * MM, 0), "dark", `${name}_valve${i}`);
    part(owner, B.cylY(2.6, face < 0 ? -6.2 : 0, face < 0 ? 0 : 6.2, 18).translate((c.x + w / 2 - 2.2) * MM, yF * MM, z * MM), "gloss", `${name}_coil${i}`);
    part(owner, B.cylY(1.1, face < 0 ? -7.4 : 0, face < 0 ? 0 : 7.4, 10).translate((c.x + w / 2 - 2.2) * MM, yF * MM, z * MM), "steel", `${name}_stem${i}`);
    m.led = led(K, owner, [c.x - w / 2 + 3.4, yF + face * 5.8, z], 0.9, `${name}_led${i}`, "valve", { muscle: m });
    // fitting on the block's side and the line to the muscle
    const sx = m.inlet.x >= c.x ? 1 : -1, P0 = V(c.x + sx * (w / 2 + 2.6), y0 + face * d * 0.5, z);
    part(owner, B.cylX(1.6, sx > 0 ? 0 : -3, sx > 0 ? 3 : 0, 8).translate((c.x + sx * w / 2) * MM, P0.y * MM, z * MM), "steel", `${name}_fit${i}`);
    const E = m.inlet, sy = m.sy, Ea = V(E.x, E.y + sy * 6, E.z), zU = E.z - under;
    const pts = [P0, V(P0.x + sx * 5, P0.y + face * 0.5, P0.z - 2.5), V(P0.x + sx * 7, P0.y + face * 0.5, Math.min(P0.z - 6, (P0.z + zU) / 2)), V(E.x * 0.92 + P0.x * 0.08, P0.y * 0.75 + Ea.y * 0.25, zU), V(E.x * 1.06, Ea.y * 0.8 + P0.y * 0.2, zU + 1), V(E.x, Ea.y + sy * 1.5, E.z - 3), Ea, E];
    B.hose(owner, pts, lineR, "rubber", `${name}_line${i}`, 40, 6);
  });
}
// A partial skin: a translucent shell round a link, centred on angle phiC (lathe angle: pi/2 = +X,
// 3pi/2 = -X), from z0 to z1, with titanium edge rods and a few screws.
function skin(K, B, owner, phiC, half, z0, z1, r0, r1, name) {
  const { MM, part } = K;
  const prof = [[r0 - 1.6, z0], [r0, z0 + 3, 2], [r1, z1 - 3, 2], [r1 - 1.6, z1]];
  part(owner, B.lathe(prof, { seg: 48, phiStart: phiC - half, phiLength: half * 2 }), "smoke", `${name}_skin`);
  for (const ph of [phiC - half, phiC + half]) {
    const x = (r) => r * Math.sin(ph), y = (r) => -r * Math.cos(ph);
    part(owner, B.rod(V(x(r0 + 0.4), y(r0 + 0.4), z0 + 3), V(x(r1 + 0.4), y(r1 + 0.4), z1 - 3), 0.9, 8), "titanium", `${name}_edge`);
    for (const zz of [z0 + 6, z1 - 6]) {
      const r = zz < (z0 + z1) / 2 ? r0 : r1, n = V(Math.sin(ph), -Math.cos(ph), 0);
      bolt(K, owner, V(x(r + 0.4), y(r + 0.4), zz), n, 1.1, 0.7, `${name}_screw`);
    }
  }
}

/* ------------------------------------------------------------------ the arm */
export function arm(K) {
  ST.K = K;
  const { MM, rig, base, part, turn, livePart, roundedShape, rect } = K;
  const B = kit(K), slab = B.slab;
  const { lathe, band, torusY, torusZ, cylY, cylX, cylZ, axleY, rod, hose, lug, boneZ, boneBetween } = B;
  const polar = (r, deg, z) => V(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), z);

  /* ---------------- base: plinth, pump, accumulator, gauge, main manifold ---------------- */
  part(base, lathe([[0, -0.5], [88, -0.5, 1], [88, 2.2, 1], [0, 2.2]], { seg: 128, steps: 3 }), "rubber", "foot");
  part(base, lathe([[0, 2], [90, 2, 2], [90, 13, 3], [86, 22, 5], [80, 25, 2], [0, 25]], { seg: 128 }), "dark", "plinth");
  band(base, 11.6, 13.2, 90.5, "titanium", "plinth_line", { seg: 128 });
  part(base, lathe([[0, 24.6], [78, 24.6, 0.6], [78, 27, 0.8], [0, 27]], { seg: 128, steps: 3 }), "carbon", "deck");
  part(base, lathe([[0, 26], [60, 26, 0.8], [60, 31, 0.8], [58, 31.6, 0.3], [58, 36, 0.3], [60, 36.6, 0.6], [60, 44.5, 1], [0, 44.5]], { seg: 96 }), "titanium", "bearing");
  band(base, 32, 35.6, 58.6, "dark", "bearing_seal", { seg: 128 });
  boltCircle(K, base, 12, 70, V(0, 0, 27), V(0, 0, 1), 1.7, "deck_bolt", 0.13);
  boltCircle(K, base, 18, 59.4, V(0, 0, 44.5), V(0, 0, 1), 1.3, "bearing_bolt", 0.1);
  led(K, base, [90.6 * Math.cos(-0.9), 90.6 * Math.sin(-0.9), 18.5], 1.4, "base_status", "status", { role: "ring" });
  // pump: motor, cooling fan (spins faster when the muscles are working), finned head
  {
    const th = (-20 * Math.PI) / 180, g = new THREE.Group();
    g.name = "pump";
    g.position.set(70 * Math.cos(th) * MM, 70 * Math.sin(th) * MM, 27 * MM);
    g.rotation.z = th - Math.PI / 2;
    base.add(g);
    part(g, slab(roundedShape(rect(-20, -9, 24, 9), 3), 0, 3, 0.8), "titanium", "pump_plate");
    for (const x of [-16, 20]) for (const yy of [-6, 6]) bolt(K, g, V(x, yy, 3), V(0, 0, 1), 1.3, 1, "pump_bolt");
    part(g, B.axleX([[0, -16], [10, -16, 1.5], [10, 8, 1.5], [0, 8]], { seg: 40 }).translate(0, 0, 14 * MM), "dark", "pump_motor");
    for (let i = 0; i < 7; i++) part(g, B.torusX(10.1, 0.5, 40).translate((-12 + i * 3) * MM, 0, 14 * MM), "gloss", "pump_rib");
    part(g, B.axleX([[0, 7.5], [10.6, 7.5, 0.6], [10.6, 11, 0.6], [0, 11]], { seg: 40, steps: 3 }).translate(0, 0, 14 * MM), "titanium", "pump_bell");
    part(g, B.axleX([[0, -19.5], [10.6, -19.5, 0.6], [10.6, -16, 0.6], [0, -16]], { seg: 40, steps: 3 }).translate(0, 0, 14 * MM), "titanium", "pump_bell_rear");
    // finned pump head
    part(g, slab(roundedShape(rect(11, -8, 24, 8), 2), 3, 24, 0.8), "titanium", "pump_head");
    for (let i = 0; i < 5; i++) part(g, slab(roundedShape(rect(12, -10.5, 23, 10.5), 0.8), 6 + i * 3.4, 6.9 + i * 3.4, 0.25), "titanium", "pump_fin");
    part(g, cylZ(1.6, 24, 30, 12).translate(17 * MM, 3 * MM, 0), "steel", "pump_out");
    part(g, cylZ(1.6, 24, 30, 12).translate(17 * MM, -3 * MM, 0), "steel", "pump_in");
    // fan behind a wire guard
    const blades = [];
    for (let k = 0; k < 5; k++) blades.push(new THREE.BoxGeometry(0.7 * MM, 7.4 * MM, 3.4 * MM).translate(0, 4.6 * MM, 0).rotateY(0.45).rotateX((k * Math.PI * 2) / 5));
    blades.push(new THREE.CylinderGeometry(2.4 * MM, 2.4 * MM, 3 * MM, 16).rotateZ(Math.PI / 2));
    ST.fan = livePart(g, mergeGeometries(blades.map((b) => b.toNonIndexed())), "gloss", "pump_fan", [-22, 0, 14]);
    part(g, B.torusX(10.4, 0.55, 40).translate(-24.5 * MM, 0, 14 * MM), "steel", "fan_guard");
    for (let k = 0; k < 4; k++) part(g, cylY(0.45, -10.4, 10.4, 6).rotateX((k * Math.PI) / 4).translate(-24.5 * MM, 0, 14 * MM), "steel", "fan_wire");
  }
  // accumulator: titanium caps, smoke shell, milky bladder inside, straps, and a gauge on top
  {
    const c = polar(72, -95, 0), tank = new THREE.Group();
    tank.position.set(c.x * MM, c.y * MM, 0);
    base.add(tank);
    part(tank, lathe([[0, 27], [14, 27, 0.6], [14, 33.5, 1.5], [12.6, 34, 0.3], [0, 34]], { seg: 48 }), "titanium", "tank_base");
    part(tank, lathe([[12.9, 33], [13.1, 33.5], [13.1, 76.5], [12.9, 77]], { seg: 48, steps: 0 }), "smoke", "tank_shell");
    part(tank, lathe([[0, 35], [10, 35, 5], [10.8, 55, 0], [10, 74, 5], [0, 74]], { seg: 40 }), "satin", "tank_bladder");
    part(tank, lathe([[0, 76], [12.6, 76, 0.3], [14, 76.6, 0.6], [14, 80, 2], [6, 84, 3], [0, 84.5]], { seg: 48 }), "titanium", "tank_cap");
    for (const z of [45, 65]) band(tank, z - 1.1, z + 1.1, 13.6, "titanium", "tank_strap", { seg: 48 });
    for (const z of [45, 65]) bolt(K, tank, V(Math.cos(-95 * Math.PI / 180) * 13.6, Math.sin(-95 * Math.PI / 180) * 13.6, z), V(Math.cos(-95 * Math.PI / 180), Math.sin(-95 * Math.PI / 180), 0), 1, 0.8, "tank_strap_bolt");
    // gauge, tilted out toward the room
    const gg = new THREE.Group(), out = V(Math.cos(-95 * Math.PI / 180), Math.sin(-95 * Math.PI / 180), 0);
    gg.position.set(out.x * 4 * MM, out.y * 4 * MM, 89 * MM);
    gg.quaternion.setFromUnitVectors(V(0, 0, 1), out.clone().add(V(0, 0, 1.1)).normalize());
    tank.add(gg);
    part(tank, rod(V(0, 0, 84), V(out.x * 4, out.y * 4, 89), 1.4, 10), "steel", "gauge_stem");
    part(gg, lathe([[0, -2], [8.6, -2, 0.6], [8.6, 1.4, 0.5], [7.4, 1.6, 0.2], [7.4, 0.6, 0], [0, 0.6]], { seg: 48, steps: 3 }), "titanium", "gauge_bezel");
    part(gg, lathe([[0, 0.4], [7.4, 0.4], [7.4, 0.8], [0, 0.8]], { seg: 48, steps: 0 }), "paint", "gauge_face");
    for (let k = 0; k <= 10; k++) { const a = -Math.PI * 0.75 + (k / 10) * Math.PI * 1.5, big = k % 5 === 0; part(gg, new THREE.BoxGeometry(0.45 * MM, (big ? 1.8 : 1.1) * MM, 0.3 * MM).translate(0, (6.2 - (big ? 0.35 : 0)) * MM, 0.95 * MM).rotateZ(-a), "dark", "gauge_tick"); }
    ST.needle = livePart(gg, new THREE.BoxGeometry(0.55 * MM, 6 * MM, 0.35 * MM).translate(0, 2.2 * MM, 0), "dark", "gauge_needle", [0, 0, 1.25]);
    part(gg, lathe([[0, 0.8], [1.2, 0.8, 0.3], [1.2, 1.9, 0.4], [0, 1.9]], { seg: 16, steps: 2 }), "steel", "gauge_hub");
  }
  // main manifold with three valves, feeding the rotary union in the turntable
  {
    const th = 35, gm = new THREE.Group(), c = polar(68, th, 27);
    gm.position.set(c.x * MM, c.y * MM, c.z * MM);
    gm.rotation.z = (th * Math.PI) / 180 + Math.PI / 2;
    base.add(gm);
    part(gm, slab(roundedShape(rect(-15, -6, 15, 6), 2), 0, 9, 0.8), "titanium", "main_block");
    for (let i = 0; i < 3; i++) {
      const x = -9 + i * 9;
      part(gm, slab(roundedShape(rect(x - 3.4, -4.6, x + 3.4, 4.6), 1.2), 9, 15, 0.5), "dark", `main_valve${i}`);
      part(gm, cylZ(2.4, 15, 21, 18).translate(x * MM, 0, 0), "gloss", `main_coil${i}`);
      part(gm, cylZ(1, 21, 23, 10).translate(x * MM, 0, 0), "steel", `main_stem${i}`);
      led(K, gm, [x + 2.6, -4.9, 13], 0.8, `main_led${i}`, "beat");
      part(gm, cylY(1.5, 6, 9, 10).translate(x * MM, 0, 4.5 * MM), "steel", `main_out${i}`);
    }
    for (const x of [-12.5, 12.5]) for (const y of [-3.5, 3.5]) bolt(K, gm, V(x, y, 9), V(0, 0, 1), 1.1, 0.8, "main_bolt");
  }
  {
    // the air system's hoses (base frame)
    const pumpOut = polar(70, -20, 0).add(polar(17, -110, 0)).add(polar(-3, -20, 30));   // approx head barb
    const tankC = polar(72, -95, 0);
    hose(base, [pumpOut, pumpOut.clone().add(V(0, 0, 4)), polar(80, -45, 36), polar(82, -80, 34), tankC.clone().add(polar(13.5, -95, 0)).add(V(0, 0, 30)).add(polar(3, -95, 0)), tankC.clone().add(polar(14, -95, 30))], 1.6, "rubber", "hose_pump_tank", 48, 8);
    hose(base, [tankC.clone().add(V(0, 0, 84.5)), tankC.clone().add(V(0, 0, 92)), polar(84, -120, 70), polar(86, -170, 40), polar(84, 130, 34), polar(80, 70, 33), polar(70, 41, 33), polar(68, 35, 31.5)], 1.6, "rubber", "hose_tank_main", 80, 8);
    for (let i = 0; i < 3; i++) {
      const p0 = polar(68, 35, 0).add(polar(-9 + i * 9, 35 + 90, 0)).add(polar(-9, 35, 31.5));
      hose(base, [p0, p0.clone().add(polar(-4, 35, 0)), polar(63.5, 20 - i * 6, 34 - i * 0.2), polar(60.6, 12 - i * 6, 34)], 1.2, "rubber", `hose_union${i}`, 24, 6);
    }
    part(base, new THREE.BoxGeometry(5 * MM, 22 * MM, 7 * MM).translate(61 * MM, 0, 34 * MM).rotateZ((6 * Math.PI) / 180), "titanium", "union_port");
    // power cable off the back, dropping through a grommet
    const p = (x, y, z) => V(x, y, z);
    hose(base, [polar(89, 160, 15), polar(98, 160, 14), polar(118, 158, 8), polar(146, 156, 3.4), polar(178, 154, 3.4)], 4.6, "rubber", "power_cable", 40, 12);
    part(base, slab(roundedShape(rect(9, -9, 22, 9), 3), 0, 7, 1.2).rotateY(-Math.PI / 2).translate(-86 * MM, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(((160 - 180) * Math.PI) / 180)), "dark", "power_boot");
  }

  /* ---------------- link1: turntable, hub, scapula yoke, shoulder muscles ---------------- */
  const l1 = rig.link1, l2 = rig.link2, l3 = rig.link3, l4 = rig.link4, l5 = rig.link5, l6 = rig.link6, l7 = rig.link7;
  part(l1, lathe([[0, 0], [54, 0, 0.8], [54, 4.5, 1], [48, 6.5, 1], [0, 6.5]], { seg: 128 }), "titanium", "turntable");
  boltCircle(K, l1, 12, 50.5, V(0, 0, 4.4), V(0, 0, 1), 1.5, "tt_bolt");
  part(l1, lathe([[0, 6], [36, 6, 1], [36, 20, 2], [30, 26, 3], [0, 26]], { seg: 96 }), "dark", "hub");
  // scapula column and the two paddles of the yoke
  part(l1, sculpt(turn([[0, 14], [28, 14], [27.4, 24], [25.6, 36], [24.6, 50], [25, 62, 4], [19, 72, 6], [0, 77]], { seg: 96, steps: 6 }), (z, a) =>
    14 * smooth((z - 38) / 32) * Math.sin(a) ** 2 - 4 * smooth((z - 44) / 26) * Math.cos(a) ** 2 + 2.2 * bump(z, 46, 14) * Math.cos(a) ** 12 - 1.2 * bump(z, 30, 8) * Math.cos(3 * a) ** 2), "satin", "scapula");
  for (const sy of [-1, 1]) {
    const yc = sy * 37.5;
    part(l1, boneBetween(V(0, yc, 58), V(0, yc, 118), (t) => 22 - 7 * bump(t, 0.42, 0.2) + 5 * smooth((t - 0.6) / 0.4), {
      n: 32, seg: 56, fn: (t, a, r) => ellipseR(a, r, 4.4 + 1.2 * bump(t, 0.4, 0.3) - 0.8 * smooth((t - 0.8) / 0.2)) - r + 2.4 * smooth(t / 0.3) * (1 - smooth((t - 0.7) / 0.2)) * Math.max(0, sy * Math.sin(a)) ** 40 + 1.6 * bump(t, 0.25, 0.12) * Math.cos(a) ** 6,
    }), "satin", `paddle${sy}`);
    // shoulder bearing boss, bolts, and the pin cap (on link2)
    part(l1, axleY(sy > 0 ? [[0, 41.5], [17.5, 41.5, 0.8], [17.5, 44.5, 1.2], [14, 46.4, 1], [0, 46.4]] : [[0, -46.4], [14, -46.4, 1], [17.5, -44.5, 1.2], [17.5, -41.5, 0.8], [0, -41.5]], { seg: 72 }).translate(0, 0, 118 * MM), "titanium", `shoulder_boss${sy}`);
    boltCircle(K, l1, 6, 15.6, V(0, sy * 44.6, 118), V(0, sy, 0), 1.2, `shoulder_bolt${sy}`, 0.5);
    for (const [x, z] of [[-13, 70], [13, 70], [-9, 92], [9, 92]]) bolt(K, l1, V(x, sy * 41.4, z), V(0, sy, 0), 1.4, 1, `paddle_rivet${sy}`);
    part(l2, axleY(sy > 0 ? [[0, 46], [7, 46, 0.6], [7, 48, 0.8], [0, 48]] : [[0, -48], [7, -48, 0.8], [7, -46, 0.6], [0, -46]], { seg: 32, steps: 3 }), "steel", `shoulder_pin${sy}`);
    part(l2, cylY(2.2, 0, 1, 6).scale(1, sy, 1).translate(0, sy * 48 * MM, 0), "dark", `shoulder_pin_hex${sy}`);
  }
  // shoulder muscles: two in front, two behind, hung from lugs off the hub
  const shoulderMs = [];
  for (const sx of [1, -1]) for (const sy of [-1, 1]) {
    shoulderMs.push(muscle(K, B, l1, l2, [sx * 44, sy * 14, 24], [sx * 36, 50], 28.6, 10, 80, `delt${sx > 0 ? "F" : "B"}${sy > 0 ? "L" : "R"}`));
  }
  manifold(K, B, l1, V(0, -26.5, 42), shoulderMs, "sh_manifold", { w: 18, rr: 54 });
  // sensor node on the +Y paddle
  part(l1, slab(roundedShape(rect(-9, 66, 9, 90), 1.5), 0, 1.6, 0.3).rotateX(-Math.PI / 2).translate(0, 42.6 * MM, 0), "dark", "imu_board");
  for (const [x, z] of [[-5, 72], [3, 80], [-2, 85]]) part(l1, new THREE.BoxGeometry(4 * MM, 1 * MM, 3 * MM).translate(x * MM, 44.6 * MM, z * MM), "gloss", "imu_chip");
  led(K, l1, [6, 44.6, 70], 1, "imu_led", "beat");

  /* ---------------- link2: humeral head condyle, neck, insertion collar ---------------- */
  {
    const g = [[0, -32], [18, -32, 1], [24, -30, 2], [32, -26, 4], [33, -21.5, 2], [28.5, -18, 1], [27, -17, 0.6], [27, -11, 0.6], [28.5, -10, 1], [31, -6, 3], [30, 0], [31, 6, 3], [28.5, 10, 1], [27, 11, 0.6], [27, 17, 0.6], [28.5, 18, 1], [33, 21.5, 2], [32, 26, 4], [24, 30, 2], [18, 32, 1], [0, 32]];
    part(l2, sculpt(turn(g, { seg: 72, steps: 3 }), (z, a) => 0.6 * Math.cos(2 * a) * bump(Math.abs(z), 22, 6)).rotateX(-Math.PI / 2), "satin", "humeral_head");
    for (const sy of [-1, 1]) for (const dy of [-1.6, 0, 1.6]) part(l2, torusY(27.75, 0.75, 72).translate(0, (sy * 14 + dy) * MM, 0), "steel", "head_wound");
  }
  boneZ(l2, "neck", 14, 64, (z) => 22 - 4 * bump(z, 36, 12) + 4 * smooth((z - 44) / 18), { sy: 0.9, fn: (z, a) => 1.2 * bump(z, 30, 10) * Math.cos(a) ** 8 });
  band(l2, 44, 55, 23.4, "titanium", "insertion_collar", { seg: 72 });
  part(l2, lathe([[0, 58], [30, 58, 0.6], [30, 70, 0.8], [0, 70]], { seg: 64 }), "titanium", "roll3_lower");
  band(l2, 63, 64.6, 30.3, "dark", "roll3_seal", { seg: 64 });

  /* ---------------- link3: humerus, elbow trochlea, biceps & triceps ---------------- */
  part(l3, lathe([[0, 0], [30, 0, 0.8], [30, 7, 0.8], [26, 9, 1.5], [0, 9]], { seg: 64 }), "titanium", "roll3_upper");
  boltCircle(K, l3, 10, 23.5, V(0, 0, 8.6), V(0, 0, 1), 1.4, "roll3_bolt");
  band(l3, 16, 28, 24, "titanium", "elbow_origin_ring", { seg: 72 });
  boneZ(l3, "humerus", 6, 222, (z) => 14.5 + 11 * (1 - smooth((z - 6) / 52)) + 9 * smooth((z - 158) / 60), {
    n: 48, seg: 60, sy: 0.92,
    fn: (z, a, r) => -r * 0.22 * smooth((z - 150) / 60) * Math.sin(a) ** 2 + 2.6 * bump(z, 78, 16) * Math.max(0, Math.cos(a + 0.7)) ** 4 + 1.1 * bump(z, 125, 45) * Math.max(0, -Math.cos(a)) ** 12 + 2 * bump(z, 204, 12) * Math.cos(a) ** 8 - 0.7 * bump(z, 110, 30) * Math.sin(2 * a + z * 0.03) ** 8,
  });
  {
    const g = [[0, -20.5], [17, -20.5, 1], [22, -19, 2], [25, -15.5, 2], [21.6, -13.6, 0.6], [21, -13, 0.5], [21, -9, 0.5], [21.6, -8.4, 0.6], [24.5, -6, 2], [23, 0], [24.5, 6, 2], [21.6, 8.4, 0.6], [21, 9, 0.5], [21, 13, 0.5], [21.6, 13.6, 0.6], [25, 15.5, 2], [22, 19, 2], [17, 20.5, 1], [0, 20.5]];
    part(l3, turn(g, { seg: 64, steps: 3 }).rotateX(-Math.PI / 2).translate(0, 0, 230 * MM), "satin", "trochlea");
    for (const sy of [-1, 1]) for (const dy of [-1.3, 0, 1.3]) part(l3, torusY(21.7, 0.7, 60).translate(0, (sy * 11 + dy) * MM, 230 * MM), "steel", "trochlea_wound");
    part(l3, cylY(3.4, -36, 36, 20).translate(0, 0, 230 * MM), "steel", "elbow_axle");
  }
  const elbowMs = [];
  for (const sx of [1, -1]) for (const sy of [-1, 1]) {
    elbowMs.push(muscle(K, B, l3, l4, [sx * 34, sy * 11, 24], [sx * 30, 38], 22.4, 10, 148, `${sx > 0 ? "bicep" : "tricep"}${sy > 0 ? "L" : "R"}`));
  }
  manifold(K, B, l3, V(0, -13.4, 60), elbowMs, "el_manifold", { w: 16, rr: 47 });
  // wiring harness down the +Y side, clipped to the bone, and a sensor node
  hose(l3, [[-6, 4, 12], [-7, 17, 40], [-7, 15.6, 100], [-7, 16.4, 160], [-12, 20, 192], [-20, 27, 198]], 1.8, "rubber", "harness3", 60, 8);
  for (const z of [60, 110, 160]) part(l3, torusZ(2.6, 0.6, 16).rotateX(Math.PI / 2).translate(-7 * MM, 16.2 * MM, z * MM), "titanium", "harness_clip");
  part(l3, slab(roundedShape(rect(0, 118, 13, 138), 1.4), 0, 1.4, 0.3).rotateX(-Math.PI / 2).translate(0, 14.4 * MM, 0), "dark", "node3_board");
  part(l3, new THREE.BoxGeometry(5 * MM, 1 * MM, 4 * MM).translate(6 * MM, 16.2 * MM, 126 * MM), "gloss", "node3_chip");
  led(K, l3, [10, 16.2, 134], 0.9, "node3_led", "beat");
  // cable clamps where the elbow-crossing hoses leave the humerus
  for (const sy of [-1, 1]) {
    part(l3, rod(V(-8, sy * 14, 192), V(-20, sy * 27, 196), 1.6, 10), "titanium", "clamp3_arm");
    part(l3, torusZ(2.8, 0.7, 16).translate(-20 * MM, sy * 27 * MM, 196 * MM), "titanium", "clamp3");
  }

  /* ---------------- link4: radius & ulna (lower), spool pack, insertion bridge ---------------- */
  const forearmBone = (owner, p0, p1, rf, B0, name, inner) => part(owner, boneBetween(p0, p1, rf, {
    n: 36, seg: 44,
    fn: (t, a, r) => ellipseR(a, r, Math.min(r, B0(t))) - r + 0.8 * bump(t, 0.5, 0.25) * Math.max(0, inner * Math.sin(a)) ** 8,
  }), "satin", name);
  for (const sy of [-1, 1]) {
    forearmBone(l4, V(0, sy * 26, 0), V(0, sy * 19.5, 124), (t) => 6.2 + 9.4 * (1 - smooth(t / 0.3)) + 2.6 * smooth((t - 0.6) / 0.4), (t) => 5 + 1.6 * smooth((t - 0.05) / 0.2), sy > 0 ? "ulna" : "radius", -sy);
    part(l4, axleY(sy > 0 ? [[0, 30.5], [11, 30.5, 0.6], [11, 32.6, 0.8], [0, 32.6]] : [[0, -32.6], [11, -32.6, 0.8], [11, -30.5, 0.6], [0, -30.5]], { seg: 48, steps: 3 }), "titanium", `elbow_bush${sy}`);
    part(l4, axleY(sy > 0 ? [[0, 32.4], [5.4, 32.4, 0.4], [5.4, 34.4, 0.6], [0, 34.4]] : [[0, -34.4], [5.4, -34.4, 0.6], [5.4, -32.4, 0.4], [0, -32.4]], { seg: 24, steps: 2 }), "steel", `elbow_pin${sy}`);
    boltCircle(K, l4, 5, 8.4, V(0, sy * 32.6, 0), V(0, sy, 0), 0.9, `elbow_bolt${sy}`);
  }
  // olecranon: the ulna's hook behind the elbow
  part(l4, boneBetween(V(-8, 26, -3), V(-19, 26, -11), (t) => 7.5 - 2.5 * t, { n: 16, seg: 32, fn: (t, a, r) => ellipseR(a, r, Math.min(r, 4.6)) - r }), "satin", "olecranon");
  {
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 11, 13, 0, Math.PI * 2, false);
    part(l4, slab(roundedShape(rect(-35, -21, 35, 21), 8), 30, 34.5, 0.8, [hole]), "titanium", "bridge");
    for (const x of [-26, 26]) for (const y of [-17, 17]) bolt(K, l4, V(x, y, 34.5), V(0, 0, 1), 1.1, 0.8, "bridge_bolt");
  }
  // spool pack: five gear motors on a carbon carrier, a row of spools on a cross shaft
  part(l4, slab(roundedShape(rect(46, -14.5, 112, 14.5), 3), 0, 3, 0.6).rotateY(-Math.PI / 2).translate(-14 * MM, 0, 0), "carbon", "carrier");
  for (const z of [52, 106]) for (const y of [-10, 10]) bolt(K, l4, V(-14, y, z), V(1, 0, 0), 1.1, 0.8, "carrier_bolt");
  part(l4, cylY(1.6, -21, 21, 12).translate(8 * MM, 0, 102 * MM), "steel", "spool_shaft");
  for (const sy of [-1, 1]) part(l4, slab(roundedShape(rect(-2, 94, 14, 108), 2.5), 0, 3, 0.5).rotateX(Math.PI / 2).translate(0, (sy > 0 ? 20.5 : -17.5) * MM, 0), "titanium", "spool_cheek");
  const fingers = ["little", "ring", "middle", "index", "thumb"];
  fingers.forEach((f, i) => {
    const yy = -14 + i * 7, mx = i % 2 ? 1 : 12;
    // motor + gearhead + pinion
    part(l4, lathe([[0, 56], [4.4, 56, 1], [4.4, 84, 0.6], [0, 84]], { seg: 28 }).translate(mx * MM, yy * MM, 0), "dark", "motor");
    part(l4, lathe([[0, 84], [4.6, 84, 0.4], [4.6, 90, 0.6], [2, 91.5, 0.4], [0, 91.5]], { seg: 28, steps: 3 }).translate(mx * MM, yy * MM, 0), "steel", "gearhead");
    part(l4, lathe([[0, 50], [2.6, 50, 0.4], [2.6, 56, 0.2], [0, 56]], { seg: 16, steps: 2 }).translate(mx * MM, yy * MM, 0), "titanium", "motor_cap");
    part(l4, rod(V(mx, yy, 91.5), V(mx + (8 - mx) * 0.5, yy, 96.5), 0.9, 8), "steel", "pinion");
    part(l4, rod(V(mx, yy, 70), V(-12.5, yy, 70), 1.4, 8), "titanium", "motor_strap");
    // the spool: turns as the finger curls
    const g = new THREE.Group();
    g.name = `spool_${f}`;
    g.position.set(8 * MM, yy * MM, 102 * MM);
    l4.add(g);
    part(g, axleY([[0, -2.7], [4.4, -2.7], [4.4, 2.7], [0, 2.7]], { seg: 28, steps: 0 }), "titanium", "spool_core");
    for (const sy of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, 6.6, 0, Math.PI * 2, false);
      for (let k = 0; k < 3; k++) { const h = new THREE.Path(); h.absarc(5.2 * Math.cos(k * 2.094), 5.2 * Math.sin(k * 2.094), 0.85, 0, Math.PI * 2, true); sh.holes.push(h); }
      part(g, slab(sh, -0.45, 0.45, 0.2, [], 6).rotateX(-Math.PI / 2).translate(0, sy * 3.1 * MM, 0), "titanium", "spool_flange");
    }
    for (let k = 0; k < 4; k++) part(g, torusY(4.85, 0.45, 28).translate(0, (-1.8 + k * 1.2) * MM, 0), "steel", "spool_wound");
    bolt(K, g, V(3.4, -3.55, 0), V(0, -1, 0), 0.8, 0.5, "spool_mark");
    ST.spools.push({ group: g, f, gain: i % 2 ? 1.5 : -1.5 });
    // the cable from the top of the spool up to the comb and into the roll joint
    hose(l4, [[8, yy, 106.9], [8, yy, 113], [6, yy * 0.75, 119], [2, yy * 0.2, 128], [0, 0, 136]], 0.55, "steel", `cable4_${f}`, 24, 5);
  });
  part(l4, slab(roundedShape(rect(2, -18, 13, 18), 2), 115.5, 118.5, 0.5), "titanium", "comb4");
  part(l4, lathe([[0, 120], [22, 120, 0.6], [27, 124, 1], [27, 135.4, 0.8], [0, 135.4]], { seg: 64 }), "titanium", "roll5_lower");
  band(l4, 128, 129.6, 27.3, "dark", "roll5_seal", { seg: 64 });
  // motor driver board on the back, under a smoke skin
  part(l4, slab(roundedShape(rect(54, -12, 104, 12), 2), 0, 1.6, 0.3).rotateY(-Math.PI / 2).translate(-18.5 * MM, 0, 0), "dark", "driver_board");
  for (const [z, y, w] of [[62, -5, 6], [62, 5, 6], [76, 0, 9], [90, -6, 4], [92, 4, 5]]) part(l4, new THREE.BoxGeometry(1.2 * MM, w * MM, w * MM).translate(-20.6 * MM, y * MM, z * MM), "gloss", "driver_chip");
  led(K, l4, [-20.8, 8, 100], 0.9, "driver_led", "beat");
  skin(K, B, l4, Math.PI * 1.5, 0.9, 44, 116, 32, 30.5, "fore_back");
  // hoses: the elbow-crossing air line and the motor cable, and their clamps on the forearm
  for (const sy of [-1, 1]) {
    part(l4, rod(V(-12, sy * 19, 100), V(-22, sy * 30, 100), 1.6, 10), "titanium", "clamp4_arm");
    part(l4, torusZ(2.8, 0.7, 16).translate(-22 * MM, sy * 30 * MM, 100 * MM), "titanium", "clamp4");
  }
  hose(l4, [[-22, -30, 102], [-20, -26, 112], [-10, -12, 121], [-6, -6, 124]], 2, "rubber", "air4", 20, 8);
  hose(l4, [[-22, 30, 98], [-20, 18, 90], [-19.6, 8, 84]], 1.5, "rubber", "motor_cable4", 16, 8);

  /* ---------------- link5: radius & ulna (upper), wrist muscles, tendon channel, skin ---------------- */
  part(l5, lathe([[0, 0], [27, 0, 0.8], [27, 6, 0.8], [23, 9, 1.5], [0, 9]], { seg: 64 }), "titanium", "roll5_upper");
  boltCircle(K, l5, 10, 21, V(0, 0, 8.6), V(0, 0, 1), 1.2, "roll5_bolt");
  band(l5, 14, 24, 19, "titanium", "wrist_origin_ring", { seg: 64 });
  for (const sy of [-1, 1]) {
    forearmBone(l5, V(0, sy * 16.5, 8), V(0, sy * 23.5, 134), (t) => 6 + 2.6 * (1 - smooth(t / 0.25)) + 7 * smooth((t - 0.78) / 0.22), (t) => 5.5 - 1 * smooth((t - 0.8) / 0.2), sy > 0 ? "ulna_hi" : "radius_hi", -sy);
    part(l5, axleY(sy > 0 ? [[0, 27.8], [9.4, 27.8, 0.6], [9.4, 30, 0.8], [0, 30]] : [[0, -30], [9.4, -30, 0.8], [9.4, -27.8, 0.6], [0, -27.8]], { seg: 40, steps: 3 }).translate(0, 0, 134 * MM), "titanium", `wrist_bush${sy}`);
    part(l5, axleY(sy > 0 ? [[0, 29.8], [4.6, 29.8, 0.4], [4.6, 31.6, 0.6], [0, 31.6]] : [[0, -31.6], [4.6, -31.6, 0.6], [4.6, -29.8, 0.4], [0, -29.8]], { seg: 24, steps: 2 }).translate(0, 0, 134 * MM), "steel", `wrist_pin${sy}`);
    boltCircle(K, l5, 5, 7.2, V(0, sy * 30, 134), V(0, sy, 0), 0.8, `wrist_bolt${sy}`);
  }
  const wristMs = [];
  for (const sx of [1, -1]) for (const sy of [-1, 1]) {
    wristMs.push(muscle(K, B, l5, l6, [sx * 24, sy * 12, 20], [sx * 20, 38], 14.2, 7, 80, `${sx > 0 ? "flexor" : "extensor"}${sy > 0 ? "L" : "R"}`, { tendonR: 0.75, strands: 8 }));
  }
  manifold(K, B, l5, V(0, -24, 48), wristMs, "wr_manifold", { w: 14, rr: 36, lineR: 1, under: 7 });
  hose(l5, [[-6, -6, 9.2], [-8, -12, 16], [-6, -24, 26], [-3, -28, 32]], 1.6, "rubber", "air5", 20, 8);
  // finger tendons up the middle of the forearm, through a comb, to the wrist pulleys
  for (const f of fingers) {
    const yy = LANE[f];
    hose(l5, [[0, 0, 4], [1.5, yy * 0.3, 30], [5.4, yy * 0.9, 80], [6.8, yy, 100], [6.8, yy, 112]], 0.55, "steel", `cable5_${f}`, 30, 5);
    jointTendon(K, l5, l6, [6.8, yy, 112], [6.8, 24], 6.25, 0.55, `wrist_tendon_${f}`);
  }
  part(l5, slab(roundedShape(rect(3, -9, 11, 9), 1.5), 104, 107, 0.5), "titanium", "comb5");
  skin(K, B, l5, Math.PI / 2, 0.95, 28, 114, 35, 33.4, "fore_front");
  // the hand's sensor cable leaves from a clip on the back of the wrist
  part(l5, rod(V(-9, 0, 112), V(-18, 0, 116), 1.4, 10), "titanium", "clamp5_arm");
  part(l5, torusZ(2.6, 0.6, 16).translate(-18 * MM, 0, 116 * MM), "titanium", "clamp5");

  /* ---------------- link6: carpal sheaves and struts, finger pulleys, wrist insertions ---------------- */
  for (const sy of [-1, 1]) {
    const prof = [[0, 8.5], [15, 8.5, 0.5], [15, 9.8, 0.4], [13.2, 10.6, 0.4], [13.2, 13.4, 0.4], [15, 14.2, 0.4], [15, 17.5, 0.5], [0, 17.5]];
    part(l6, axleY(sy > 0 ? prof : prof.map(([r, y]) => [r, -y]).reverse(), { seg: 64 }), "titanium", `carpal_sheave${sy}`);
    for (const dy of [-0.8, 0, 0.8]) part(l6, torusY(13.8, 0.55, 44).translate(0, (sy * 12 + dy) * MM, 0), "steel", "sheave_wound");
    part(l6, boneBetween(V(0, sy * 13, 6), V(0, sy * 10.5, 50), (t) => 9 - 3 * bump(t, 0.5, 0.3) + 1.5 * smooth((t - 0.7) / 0.3), { n: 30, seg: 48, fn: (t, a, r) => ellipseR(a, r, Math.min(r, 4.4)) - r }), "satin", `carpal_strut${sy}`);
  }
  for (const f of fingers) {
    const y = LANE[f];
    part(l6, axleY([[0, y - 1.1], [5.7, y - 1.1, 0.3], [5.7, y - 0.6, 0.2], [5, y - 0.25, 0.2], [5, y + 0.25, 0.2], [5.7, y + 0.6, 0.2], [5.7, y + 1.1, 0.3], [0, y + 1.1]], { seg: 32, steps: 2 }), "titanium", `wrist_pulley_${f}`);
    hose(l6, [[6.8, y, 24], [5, y * 0.8, 32], [1.6, y * 0.25, 48], [0, 0, 58]], 0.55, "steel", `cable6_${f}`, 20, 5);
  }
  part(l6, cylY(2, -33, 33, 16), "steel", "wrist_axle");
  {
    const hole = new THREE.Path();
    hole.absellipse(1, 0, 10, 9, 0, Math.PI * 2, false);
    part(l6, slab(roundedShape(rect(-25, -17.5, 25, 17.5), 6), 30, 34.5, 0.7, [hole]), "titanium", "wrist_bridge");
  }
  part(l6, lathe([[0, 44], [16, 44, 1], [24, 48, 1], [24, 61.4, 0.8], [0, 61.4]], { seg: 64 }), "titanium", "roll7_lower");
  band(l6, 54, 55.4, 24.3, "dark", "roll7_seal", { seg: 64 });

  /* ---------------- link7: roll ring, mount flange into the hand ---------------- */
  part(l7, lathe([[0, 0.4], [24, 0.4, 0.8], [24, 6, 0.8], [21, 8, 1], [0, 8]], { seg: 64 }), "titanium", "roll7_upper");
  boltCircle(K, l7, 8, 19, V(0, 0, 7.6), V(0, 0, 1), 1.1, "roll7_bolt");
  part(l7, lathe([[0, 7.5], [19, 7.5, 1], [15, 14, 2], [0, 14]], { seg: 64 }), "titanium", "wrist_neck");
  part(l7, slab(roundedShape(rect(-13, -31, 13, 31), 7), 13, 19, 1), "carbon", "mount_flange");
  for (const x of [-8, 8]) for (const y of [-25, 25]) bolt(K, l7, V(x, y, 19), V(0, 0, 1), 1.2, 0.9, "mount_bolt");
  part(l7, rod(V(-9, 0, 12), V(-17, 0, 12), 1.3, 10), "titanium", "clamp7_arm");
  part(l7, torusZ(2.4, 0.6, 16).translate(-17 * MM, 0, 12 * MM), "titanium", "clamp7");

  /* ---------------- hoses and cables that cross joints ---------------- */
  const cable = (owner, a, b, o) => ST.cables.push(flexCable(K, base, a, b, o));
  for (const sy of [-1, 1]) {
    // shoulder: air (−Y) and signal (+Y) from the yoke to link2
    const a1 = anchor(K, l1, -20, sy * 47, 92), b1 = anchor(K, l2, -22, sy * 30, 58);
    part(l1, rod(V(-14, sy * 42, 92), V(-20, sy * 46.4, 92), 1.4, 10), "titanium", "clip1");
    part(l2, rod(V(-14, sy * 20, 56), V(-22, sy * 28.4, 57), 1.4, 10), "titanium", "clip2");
    cable(base, a1, b1, { tA: V(0, 0, 1), tB: V(0, 0, -1), radius: sy < 0 ? 2.1 : 1.6, sag: 0.006, name: `shoulder_hose${sy}` });
    // elbow: air (−Y) and motor power (+Y) from the humerus to the forearm
    const a3 = anchor(K, l3, -20, sy * 27, 199), b4 = anchor(K, l4, -22, sy * 30, 97);
    cable(base, a3, b4, { tA: V(0, 0, 1), tB: V(0, 0, -1), radius: sy < 0 ? 2 : 1.5, sag: 0.008, name: `elbow_hose${sy}` });
  }
  {
    const a5 = anchor(K, l5, -18, 0, 119), b7 = anchor(K, l7, -17, 0, 9);
    cable(base, a5, b7, { tA: V(0, 0, 1), tB: V(0, 0, -1), radius: 1.3, sag: 0.004, name: "hand_cable" });
    // continues into the hand under the back skin to the sensor board
    hose(l7, [[-17, 0, 9], [-16, 0, 16], [-12.5, 3, 27], [-10.4, 8, 42], [-9.4, 14, 62], [-9, 17, 78]], 1.0, "rubber", "hand_cable_in", 40, 6);
  }
  // the air lines from the shoulder hose into link2/link3 via the hollow roll joint
  hose(l2, [[-22, -30, 58], [-20, -26, 63], [-10, -12, 68], [-6, -6, 70]], 2, "rubber", "air2", 16, 8);
  hose(l3, [[-6, -6, 8.8], [-8, -12, 16], [-6, -16, 30], [-2, -16.5, 38]], 1.8, "rubber", "air3", 16, 8);
}

/* ------------------------------------------------------------------ the hand */
export function palm(K, palm) {
  const { MM, FINGERS, THUMB, part, roundedShape, rect } = K;
  const B = kit(K), slab = B.slab;
  const { hose, rod, torusY } = B;
  // carpal pebbles
  const peb = [[-23, 8, 0, 8, 6, 7], [-8, 7, 1, 7.5, 6.5, 7.5], [7, 7, 0, 7.5, 6, 7], [21, 8, 0, 7, 6, 6.5], [-25, 20, -1, 7, 6.5, 6.5], [-10, 20, 0, 7.5, 6.5, 7], [6, 20, 0, 7, 6.5, 7], [20, 19, 0, 6.5, 6, 6]];
  peb.forEach(([x, y, z, rx, ry, rz], i) => {
    const g = new THREE.SphereGeometry(MM, 24, 16).scale(rx, ry, rz);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k), f = 1 + 0.06 * Math.sin(vx * 900 + i) * Math.cos(vy * 700 - i * 2) + 0.04 * Math.sin(vz * 1100); p.setXYZ(k, vx * f, vy * f, vz * f); }
    smoothNormals(g);
    part(palm, g.rotateZ(0.2 * Math.sin(i * 1.7)).translate(x * MM, y * MM, z * MM), "satin", `carpal${i}`);
  });
  // wrist plate the carpals sit in (hand y 0 = the mount face)
  part(palm, slab(roundedShape(rect(-27, -10, 27, 10), 6), -1.6, 1.4, 0.7).rotateX(-Math.PI / 2), "titanium", "carpal_plate");
  // retinaculum straps over the flexor tendons, and the dorsal bar the extensors start from
  for (const y of [9, 15]) hose(palm, [[-22, y, -3], [-14, y, -10.5], [0, y, -12], [14, y, -10.5], [22, y, -3]], 1.2, "titanium", "retinaculum", 24, 8);
  hose(palm, [[-37, 25, 6.5], [-20, 25, 9.4], [0, 25, 10], [20, 25, 9.4], [34, 23, 6.5]], 1.8, "titanium", "dorsal_bar", 32, 10);
  for (const [n, f] of Object.entries(FINGERS)) {
    const x = f.at[0] * 0.62;
    part(palm, torusY(1.6, 0.5, 16).rotateX(Math.PI / 2).translate(x * MM, 25 * MM, (10.6 - Math.abs(x) * 0.02) * MM), "titanium", `dorsal_eye_${n}`);
  }
  // the flexor trunk from the wrist roll joint to the carpal tunnel
  for (const [f, lane] of Object.entries(LANE)) {
    const x = -lane * 0.45;
    hose(palm, [[x * 0.4, -26, 0], [x * 0.6, -16, -3], [x, -4, -7], [x * 1.4, 6, -8]], 0.55, "steel", `trunk_${f}`, 20, 5);
  }
  // thumb flexor to the thumb root
  hose(palm, [[-3.78, 6, -8], [-6, 16, -9], [-24, 24, -8.5], [-31, 27, -7]], 0.55, "steel", "flexor_thumb_palm", 24, 5);
  // thenar bracket to the thumb root
  part(palm, rod(V(-22, 18, -2), V(-33, 26, -4), 3.2, 16), "titanium", "thenar_strut");
  // translucent skin: part of the palm (index/middle side) and part of the back of the hand
  part(palm, roundedSlab(-21, 58, -12.2, 22, 31, 0.7, 11, 0.6, (x) => -2.2 * (1 - Math.min(1, ((x + 21) / 22) ** 2))), "smoke", "palm_skin");
  part(palm, roundedSlab(-17, 55, 12.6, 24, 29, 0.7, 11, 0.6, (x) => 2.4 * (1 - Math.min(1, ((x + 17) / 24) ** 2))), "smoke", "back_skin");
  for (const [x, y, z] of [[-38, 30, -12], [-6, 30, -12.5], [-38, 86, -12], [-6, 86, -12.5]]) bolt(K, palm, V(x, y, z), V(0, 0, -1), 1, 0.6, "palm_skin_screw");
  for (const [x, y, z] of [[-36, 29, 12.6], [2, 29, 12.8], [-36, 81, 12.6], [2, 81, 12.8]]) bolt(K, palm, V(x, y, z), V(0, 0, 1), 1, 0.6, "back_skin_screw");
  // sensor board on the back of the hand, seen through the skin
  part(palm, slab(roundedShape(rect(-26, 44, -8, 62), 1.6), 7.2, 8.6, 0.3), "dark", "hand_board");
  part(palm, new THREE.BoxGeometry(6 * MM, 6 * MM, 1 * MM).translate(-17 * MM, 53 * MM, 9.1 * MM), "gloss", "hand_chip");
  led(K, palm, [-11, 47, 9], 0.9, "hand_led", "beat");
  // metacarpal for the thumb lives in thumbRoot; the others in knuckle()
}

// Knuckle: the metacarpal head, a grooved condyle the finger rolls on, with the metacarpal shaft running
// back to the carpals and the tendons arriving on both sides.
export function knuckle(K, root, f, name) {
  const { MM, part } = K;
  const B = kit(K);
  const r = f.d / 2, rk = KR * r, hk = KH * r;
  part(root, B.axleX([[0, -hk], [rk * 0.72, -hk, 0.8], [rk, -hk * 0.45, 1.5], [rk, -1.9, 0.3], [rk - 1.5, -1.3, 0.3], [rk - 1.5, 1.3, 0.3], [rk, 1.9, 0.3], [rk, hk * 0.45, 1.5], [rk * 0.72, hk, 0.8], [0, hk]], { seg: 32, steps: 2 }), "satin", `${name}_head`);
  part(root, B.torusX(rk - 1.5 + 0.55, 0.5, 32), "steel", `${name}_groove`);
  for (const s of [-1, 1]) part(root, B.cylX(1.6, s > 0 ? hk : -hk - 0.8, s > 0 ? hk + 0.8 : -hk, 16), "steel", `${name}_pin`);
  // frame conversion palm -> this root (the root is on the palm, or on the arch for ring/little)
  root.updateMatrix();
  const inv = root.matrix.clone().invert(), toRoot = (x, y, z) => V(x * MM, y * MM, z * MM).applyMatrix4(inv).multiplyScalar(1 / MM);
  const W = toRoot(f.at[0] * 0.62, 25, 0.5);
  part(root, B.boneBetween(W, V(0, -rk * 0.4, 0), (t) => 3.7 + 2 * (1 - smooth(t / 0.3)) + 1.2 * smooth((t - 0.7) / 0.3), {
    n: 22, seg: 24, fn: (t, a, r2) => ellipseR(a, r2, r2 * 0.86) - r2 + 0.5 * bump(t, 0.5, 0.3) * Math.max(0, -Math.sin(a)) ** 6,
  }), "satin", `${name}_metacarpal`);
  // flexor from the carpal tunnel to the palm side of the condyle, through a loop on the metacarpal
  const lane = LANE[name], P = toRoot(-lane * 0.45 * 1.4, 6, -8), zf = -(rk - 0.95);
  B.hose(root, [P, P.clone().lerp(V(0, -20, zf - 2.5), 0.5).add(V(0, 0, -1.2)), V(0, -20, zf - 2.2), V(0, -8, zf - 0.5), V(0, 0, zf)], 0.55, "steel", `${name}_flexor_palm`, 32, 5);
  part(root, B.torusY(1.3, 0.38, 14).translate(0, -20 * MM, (zf - 2.2) * MM), "titanium", `${name}_mc_loop`);
  part(root, new THREE.BoxGeometry(1 * MM, 1.2 * MM, 2.2 * MM).translate(0, -20 * MM, (zf - 0.4) * MM), "titanium", `${name}_mc_loop_post`);
  // extensor (elastic) from the dorsal bar to the back of the condyle
  const E = toRoot(f.at[0] * 0.62, 25, 10.6);
  B.hose(root, [E, E.clone().lerp(V(0, -10, rk + 0.2), 0.6).add(V(0, 0, 0.8)), V(0, -8, rk - 0.4), V(0, 0, rk - 0.95)], 0.38, "rubber", `${name}_extensor_palm`, 28, 5);
  return hk;
}

// Thumb root: a saddle joint (a satin ball in a titanium ring) on the thenar strut.
export function thumbRoot(K, root) {
  const { MM, THUMB, part } = K;
  const B = kit(K);
  const r = THUMB.d / 2;
  const g = new THREE.SphereGeometry(r * 0.8 * MM, 40, 28).scale(1, 0.9, 0.95);
  part(root, g, "satin", "thumb_saddle");
  part(root, B.torusZ(r * 0.8, 0.9, 40).rotateX(0.5), "titanium", "thumb_saddle_ring");
  for (const s of [-1, 1]) part(root, B.cylX(1.8, s > 0 ? r * 0.78 : -r * 0.78 - 1, s > 0 ? r * 0.78 + 1 : -r * 0.78, 16), "steel", "thumb_saddle_pin");
  return r * 0.8;
}

// A phalanx: a bone whose base and far condyle are centred on its hinges (so bending opens no gap),
// narrow in the shaft and flattened on the grip side; collateral ligament straps and steel pins at its
// base hinge; a steel flexor tendon on the grip side and an elastic extensor on the back, each through
// little guide loops; on the last bone, a translucent skin over the fingertip and a tactile sensor LED.
export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, part, turn, alongY } = K;
  const B = kit(K);
  const r = d / 2, hingeR = i === 0 ? KR * r : CR[i - 1] * r, rb = hingeR * 0.9;
  const rs = SR[i] * r, rt = TIP * r, Lc = tip ? length - rt : length;
  const rc = tip ? 0.44 * r : CR[i] * r, hc = tip ? 0 : CH[i] * r;
  // the bone (built along z, then turned to run along y with lathe +y -> hand -z, the grip side)
  const rf = (z) => {
    const t = z / Lc;
    return rb + (rs - rb) * smooth(t / 0.36) + (tip ? (0.44 * r - rs) * smooth((t - 0.66) / 0.34) : (0.84 * rc - rs) * smooth((t - 0.6) / 0.4));
  };
  let bone = turn(radiusProfile(0, Lc, rf, 22, ["round", tip ? "round" : "flat"], 6), { seg: 30, steps: 0 });
  bone = sculpt(bone, (z, a, rr) => {
    const t = z / Lc, mid = Math.sin(Math.PI * clamp(t, 0, 1));
    return -0.16 * r * Math.max(0, Math.sin(a)) ** 2 * mid - 0.05 * r * Math.cos(a) ** 2 * mid + 0.05 * r * Math.max(0, -Math.sin(a)) ** 10 * mid;
  });
  part(g, alongY(bone), "satin", `${name}_bone`);
  // far condyle, grooved, with the tendon cable wound in its groove
  if (!tip) {
    part(g, B.axleX([[0, -hc], [rc * 0.7, -hc, 0.7], [rc, -hc * 0.45, 1.2], [rc, -1.7, 0.3], [rc - 1.3, -1.2, 0.3], [rc - 1.3, 1.2, 0.3], [rc, 1.7, 0.3], [rc, hc * 0.45, 1.2], [rc * 0.7, hc, 0.7], [0, hc]], { seg: 24, steps: 2 }).translate(0, Lc * MM, 0), "satin", `${name}_condyle`);
    part(g, B.torusX(rc - 1.3 + 0.5, 0.45, 28).translate(0, Lc * MM, 0), "steel", `${name}_groove`);
  }
  // pins and collateral ligaments at the base hinge
  const L = 0.27 * Lc, beta = Math.max(0, Math.atan2(prevR - (rs + 0.5), L));
  for (const s of [-1, 1]) {
    part(g, B.cylX(1.3, s > 0 ? prevR + 0.1 : -prevR - 0.8, s > 0 ? prevR + 0.8 : -prevR - 0.1, 14), "steel", `${name}_pin`);
    const x0 = s > 0 ? prevR - 0.1 : -prevR - 0.45, x1 = s > 0 ? prevR + 0.45 : -prevR + 0.1, xm = (x0 + x1) / 2;
    part(g, B.strap(1.05, 0, 0.65, L, x0, x1).translate(-xm * MM, 0, 0).rotateZ(s * beta).translate(xm * MM, 0, 0), "dark", `${name}_ligament`);
  }
  // flexor on the grip side, extensor on the back, with guide loops
  const zf0 = -(hingeR - 0.95), zf1 = tip ? -(rs + 1.3) : -(rc - 0.95), yf1 = tip ? 0.56 * Lc : Lc;
  part(g, B.rod(V(0, 0, zf0), V(0, yf1, zf1), 0.5, 8), "steel", `${name}_flexor`);
  const ze0 = hingeR - 0.95, ze1 = tip ? rs + 1.1 : rc - 0.95, ye1 = tip ? 0.5 * Lc : Lc;
  part(g, B.rod(V(0, 0, ze0), V(0, ye1, ze1), 0.36, 6), "rubber", `${name}_extensor`);
  const loop = (y, z, inward, nm) => {
    part(g, B.torusY(1.15, 0.33, 14).translate(0, y * MM, z * MM), "titanium", nm);
    part(g, new THREE.BoxGeometry(0.9 * MM, 1 * MM, Math.abs(inward) * MM).translate(0, y * MM, (z + inward / 2) * MM), "titanium", `${nm}_post`);
  };
  const zAt = (y, z0, z1, y1) => z0 + (z1 - z0) * (y / y1);
  for (const t of tip ? [0.3] : [0.3, 0.7]) { const y = t * Lc, z = zAt(y, zf0, zf1, yf1); loop(y, z, (-rf(y) * 0.84 - z) + 0.4, `${name}_floop`); }
  { const y = (tip ? 0.25 : 0.5) * Lc, z = zAt(y, ze0, ze1, ye1); loop(y, z, (rf(y) * 0.95 - z) - 0.4, `${name}_eloop`); }
  if (tip) {
    // tendon anchors
    part(g, new THREE.BoxGeometry(2.2 * MM, 2.4 * MM, 1.6 * MM).translate(0, yf1 * MM, zf1 * MM), "titanium", `${name}_flexor_anchor`);
    part(g, new THREE.BoxGeometry(2 * MM, 2.2 * MM, 1.4 * MM).translate(0, ye1 * MM, ze1 * MM), "titanium", `${name}_extensor_anchor`);
    // translucent fingertip skin: its very end at y = length
    const prof = [[rt * 0.78, Lc - 0.6 * Lc], [rt, Lc - 0.5 * Lc]];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * (Math.PI / 2); prof.push([rt * Math.cos(a), Lc + rt * Math.sin(a)]); }
    prof[prof.length - 1][0] = 0;
    part(g, alongY(turn(prof, { seg: 30, steps: 0 })).scale(1, 1, 0.9), "smoke", `${name}_skin`);
    // tactile sensor under the skin
    part(g, new THREE.BoxGeometry(rt * 0.9 * MM, rt * 1.1 * MM, 0.6 * MM).translate(0, (Lc - 0.12 * Lc) * MM, -(0.44 * r + 0.05) * MM), "dark", `${name}_sensor`);
    led(K, g, [0, Lc - 0.12 * Lc, -(0.44 * r + 0.45)], 0.5, `${name}_led`, "tip", { finger: name.split("_")[0] });
    const o = new THREE.Object3D();
    o.position.y = Lc * MM;
    o.userData.r = rt;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => CH[i] * (d / 2);

/* ------------------------------------------------------------------ animation */
export function update(t, dt, S) {
  let act = 0;
  for (const m of ST.muscles) { const r0 = m.ratio; m.update(); act += Math.abs(m.ratio - r0); }
  for (const td of ST.tendons) td.update();
  for (const c of ST.cables) c.update();
  ST.activity += (Math.min(1, act * 30) - ST.activity) * (1 - Math.exp(-dt * 3));
  const h = S.handNow, D = Math.PI / 180;
  for (const sp of ST.spools) sp.group.rotation.y = sp.gain * D * ((h[`${sp.f}_1`] || 0) + (h[`${sp.f}_2`] || 0) + (h[`${sp.f}_3`] || 0));
  if (ST.fan) ST.fan.rotation.x += dt * (14 + 70 * ST.activity);
  if (ST.needle) ST.needle.rotation.z = -(-0.15 + 0.35 * Math.sin(t * 0.9) * 0.2 + 0.9 * ST.activity) - 0.6 * Math.sin(t * 7) * 0.02;
  for (const L of ST.leds) {
    let b;
    if (L.kind === "valve") b = clamp((1 - L.muscle.ratio) * 4, 0, 1) * 0.9 + 0.1 + 0.05 * Math.sin(t * 9 + L.phase);
    else if (L.kind === "tip") b = clamp((((h[`${L.finger}_1`] || 0) + (h[`${L.finger}_2`] || 0) + (h[`${L.finger}_3`] || 0)) / 160), 0, 1) * 0.8 + 0.2 + 0.08 * Math.sin(t * 5 + L.phase);
    else if (L.kind === "status") b = 0.55 + 0.45 * Math.sin(t * 1.6);
    else { const p = (t * 1.1 + L.phase) % 3; b = 0.15 + 0.85 * Math.max(Math.exp(-(((p - 0.2) / 0.08) ** 2)), 0.7 * Math.exp(-(((p - 0.55) / 0.08) ** 2))); }
    const m = L.mesh;
    if (m.material !== L.mat) { L.mat = m.material.clone(); L.base = L.mat.emissiveIntensity ?? 1; m.material = L.mat; }
    L.mat.emissiveIntensity = L.base * (0.12 + 1.1 * b);
    m.scale.setScalar(0.75 + 0.35 * b);
  }
}
