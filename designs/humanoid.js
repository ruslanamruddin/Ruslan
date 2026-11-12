// "Humanoid": the arm and hand of a modern humanoid robot, at hero detail.
// Satin-white sculpted shells (displaced into anatomical forms: bicep and tricep swell, a forearm that
// flares below the elbow, a palm that domes and rises at the knuckles), split into panels whose seams
// show the gloss-black body underneath; finely ribbed motor rotors at the turning joints; titanium
// accent rings; gloss ball joints between domed cheeks with inset medallions; a flexible wrist boot;
// and an anatomical hand: fingers that narrow between the joints and flatten on the grip side, separate
// back shells, knuckle covers, titanium pivot caps, nail shells and soft tactile pads.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const label = "Humanoid";
const HI = { seg: 96, steps: 12 };
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

// Smooth normals, and stitch the duplicated vertices along lathe seams so no seam line shows.
function smoothNormals(geo) {
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
// Push a lathe's surface out along its radius. axis "z": fn(z, a, r) with a = angle from +X;
// axis "y": fn(y, a, r) with a = angle from +Z (the back of a finger). Units mm.
function sculpt(geo, fn, axis = "z") {
  const MM = 0.001, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / MM, y = p.getY(i) / MM, z = p.getZ(i) / MM;
    const [u, w, along] = axis === "z" ? [x, y, z] : [z, x, y];
    const r = Math.hypot(u, w);
    if (r < 1e-6) continue;
    const a = Math.atan2(w, u), nr = Math.max(0.01, r + fn(along, a, r)), k = nr / r;
    if (axis === "z") p.setXYZ(i, x * k * MM, y * k * MM, z * MM);
    else p.setXYZ(i, x * k * MM, y * MM, z * k * MM);
  }
  p.needsUpdate = true;
  return smoothNormals(geo);
}
// Deform an extruded solid with fn(x, y, z) -> [dx, dy, dz] (mm), with smooth normals and planar UVs.
function deform(geo, fn) {
  const MM = 0.001;
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  const g = mergeVertices(geo, 1e-7);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / MM, y = p.getY(i) / MM, z = p.getZ(i) / MM, [dx, dy, dz] = fn(x, y, z);
    p.setXYZ(i, (x + dx) * MM, (y + dy) * MM, (z + dz) * MM);
    uv[i * 2] = x / 60; uv[i * 2 + 1] = y / 60;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function arm(K) {
  const { MM, SEAM_DRAW, MOUNT_FACE, rig, base, part, turn, tubeProfile, alongY } = K;
  const lathe = (pts, o = {}) => turn(pts, { ...HI, ...o });
  const oval = (g, k = 0.86) => g.scale(1, k, 1);   // narrower across the pitch axis
  // A sculpted limb: front and back panels with seams down both sides over a gloss-black core.
  function limb(owner, name, z0, z1, r0, r1, { swell = 3, shape = () => 0, f0 = 10, f1 = 10, k = 0.86 } = {}) {
    const prof = tubeProfile(z0, z1, r0, r1, f0, f1, swell), gap = (SEAM_DRAW * 0.9) / ((r0 + r1) / 2);
    for (const [start, side] of [[gap / 2, "front"], [Math.PI + gap / 2, "back"]]) {
      part(owner, oval(sculpt(lathe(prof, { phiStart: start, phiLength: Math.PI - gap }), shape), k), "satin", `${name}_${side}`);
    }
    part(owner, oval(lathe(tubeProfile(z0 + 3, z1 - 3, r0 - 1.8, r1 - 1.8, 1, 1, swell), { seg: 64, steps: 6 }), k), "gloss", `${name}_core`);
  }
  // A turning joint: a gloss rotor with fine ribs, a titanium hairline either side.
  function rotor(owner, z, r, name) {
    part(owner, sculpt(lathe(tubeProfile(z - 4.6, z + 4.6, r, r, 1.6, 1.6), { seg: 192, steps: 6 }), (zz, a) => 0.32 * Math.cos(a * 48) * smooth((4.2 - Math.abs(zz - z)) / 1.2)), "gloss", `${name}_rotor`);
    for (const s of [-1, 1]) part(owner, lathe(tubeProfile(z + s * 5.4 - 0.45, z + s * 5.4 + 0.45, r + 0.9, r + 0.9, 0.3, 0.3), { seg: 128, steps: 4 }), "titanium", `${name}_trim${s > 0 ? "U" : "D"}`);
  }
  // A pitch joint: a gloss ball turning between two satin domed cheeks, each with a titanium rim and an
  // inset black medallion ringed in titanium.
  function joint(inner, outer, r, half, name) {
    const at = outer.position.z, place = (g) => alongY(g).translate(0, 0, at);
    part(outer, new THREE.SphereGeometry(r * 0.93 * MM, 80, 56), "gloss", `${name}_ball`);
    const a0 = r * 0.34;
    for (const flip of [false, true]) {
      const side = flip ? "L" : "R";
      const dome = [[0, a0], [r, a0, 2], [r * 0.985, half - r * 0.28, r * 0.62], [r * 0.52, half, r * 0.4], [0, half]];
      part(inner, place(lathe(dome, { flip })), "satin", `${name}_cheek${side}`);
      part(inner, place(lathe(tubeProfile(a0 - 1.1, a0 + 0.1, r - 0.5, r - 0.5, 0.3, 0.3), { flip, steps: 4 })), "titanium", `${name}_rim${side}`);
      part(inner, place(lathe([[0, half - 1.6], [r * 0.28, half - 1.6, 0.4], [r * 0.28, half + 0.25, 0.7], [0, half + 0.25]], { flip })), "gloss", `${name}_medallion${side}`);
      part(inner, place(lathe([[0, half - 0.6], [r * 0.33, half - 0.6, 0.2], [r * 0.33, half + 0.35, 0.3], [r * 0.29, half + 0.35, 0.2], [r * 0.29, half - 0.2], [0, half - 0.2]], { flip, steps: 4 })), "titanium", `${name}_medring${side}`);
    }
  }

  // Base: a smooth trumpet stand, a rubber foot, a titanium hairline and a soft status light.
  part(base, lathe([[0, 0], [90, 0, 3], [90, 6, 3], [62, 26, 30], [56, 44.5, 6], [0, 44.5]], { seg: 160 }), "satin", "stand");
  part(base, lathe([[0, -0.5], [86, -0.5, 1], [86, 1.5, 1], [0, 1.5]], { seg: 128, steps: 4 }), "rubber", "stand_foot");
  part(base, lathe(tubeProfile(14.5, 15.5, 85.6, 85.6, 0.3, 0.3), { seg: 160, steps: 4 }), "titanium", "stand_trim");
  part(base, lathe(tubeProfile(9, 10.4, 88.4, 88.4, 0.4, 0.4), { seg: 160, steps: 4, phiStart: Math.PI / 2 - 0.25, phiLength: 0.5 }), "ring", "status_light");
  rotor(rig.link1, 3.6, 54, "j1");
  // link1: shoulder tower
  limb(rig.link1, "tower", 10, 116, 54, 46, { swell: 3, shape: (z, a) => 1.2 * bump(z, 70, 30) * Math.cos(a) ** 2 });
  joint(rig.link1, rig.link2, 52, 62, "j2");
  // link2/link3: upper arm with a bicep in front and a tricep behind
  limb(rig.link2, "upper_root", 40, 64, 44, 43, { swell: 0, f1: 2 });
  rotor(rig.link3, 0, 41, "j3");
  limb(rig.link3, "upper", 6, 200, 43, 34, {
    swell: 3,
    shape: (z, a) => 3.4 * bump(z, 82, 42) * Math.max(0, Math.cos(a)) ** 2 + 2.6 * bump(z, 112, 48) * Math.max(0, -Math.cos(a)) ** 2,
  });
  joint(rig.link3, rig.link4, 40, 48, "j4");
  // link4/link5: forearm, flaring just below the elbow and flattening toward the wrist
  limb(rig.link4, "fore_low", 30, 132, 33, 31, { swell: 2, shape: (z, a) => 3.2 * bump(z, 52, 30) * (0.65 + 0.35 * Math.cos(a - 0.5)) });
  rotor(rig.link5, 0, 29, "j5");
  limb(rig.link5, "fore_high", 6, 108, 31, 24, { swell: 1.5, shape: (z, a) => -1.6 * Math.sin(a) ** 2 * smooth(z / 100) });
  // a soft status light let into the top of the forearm
  part(rig.link5, oval(lathe(tubeProfile(52, 74, 30.6, 29.4, 0.8, 0.8), { seg: 48, steps: 4, phiStart: Math.PI / 2 - 0.06, phiLength: 0.12 })), "ring", "fore_light");
  joint(rig.link5, rig.link6, 27, 34, "j6");
  limb(rig.link6, "wrist", 22, 56, 24, 23, { swell: 0 });
  rotor(rig.link7, 0, 22, "j7");
  // link7: a flexible boot over the wrist, a titanium ring, the cuff the hand fits into
  const boot = [[0, 4.6], [21.4, 4.6, 0.6]];
  for (let i = 0; i < 4; i++) { const z = 6 + i * 3.2; boot.push([23.6, z, 1.2], [21.4, z + 1.6, 1]); }
  boot.push([21.4, 19.4, 0.6], [0, 19.4]);
  part(rig.link7, lathe(boot, { steps: 8 }), "rubber", "wrist_boot");
  part(rig.link7, lathe(tubeProfile(19.6, 21.2, 22.6, 22.6, 0.4, 0.4), { steps: 4 }), "titanium", "wrist_ring");
  part(rig.link7, oval(lathe(tubeProfile(21.4, MOUNT_FACE - 796, 22, 21.4, 1.2, 0.6), { seg: 96 }), 0.92), "gloss", "wrist_cuff");
}

/* ---------- Hand ---------- */
export function palm(K, palm) {
  const { MM, PALM, FINGERS, THUMB, part } = K;
  const hw = (y, inset) => 33 + (12 / PALM.length) * y - inset;   // palm half-width: 66 at the wrist, 90 at the knuckles
  // A finely subdivided rounded solid over the palm's tapering outline: plan corners of radius rp, edges
  // of radius re, surface displaced by fn(x, y, z) -> dz. Every part of its surface can be sculpted.
  function slab(inset, y0, y1, z0, z1, rp, re, fn = () => 0, segs = [72, 72, 10]) {
    const ax = hw(y1, inset), ay = (y1 - y0) / 2, az = (z1 - z0) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let g = new THREE.BoxGeometry(2, 2, 2, ...segs);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g, 1e-6);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * ax, y = p.getY(i) * ay, z = p.getZ(i) * az;
      const ix = THREE.MathUtils.clamp(x, -(ax - rp), ax - rp), iy = THREE.MathUtils.clamp(y, -(ay - rp), ay - rp), iz = THREE.MathUtils.clamp(z, -(az - re), az - re);
      let dx = (x - ix) / rp, dy = (y - iy) / rp, dz = (z - iz) / re;
      const l = Math.hypot(dx, dy, dz) || 1;
      x = ix + (dx / l) * rp; y = iy + (dy / l) * rp; z = iz + (dz / l) * re;
      y += cy; z += cz;
      x *= hw(y, inset) / ax;   // taper toward the wrist
      z += fn(x, y, z);
      p.setXYZ(i, x * MM, y * MM, z * MM);
      uv[i * 2] = x / 60; uv[i * 2 + 1] = y / 60;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  // the back of the hand domes across its width and rises over each knuckle; a fine seam is engraved
  // across it where the two halves of the shell meet
  const knuckleRise = (x, y) => Object.values(FINGERS).reduce((s, f) => s + 1.5 * bump(x, f.at[0], 7) * bump(y, f.at[1] - 9, 6.5), 0);
  const back = (x, y, z) => z > 10 ? smooth((z - 10) / 3.6) * (2.4 * (1 - (x / 47) ** 2) + knuckleRise(x, y) - 0.6 * bump(y, 50, 0.6)) : 0;
  part(palm, slab(2, 1, 99, -11, 11, 15, 5), "gloss", "palm_inner");
  part(palm, slab(3.2, 4, 96, 8.5, 13.8, 13, 2.4, back), "satin", "palm_back");
  // soft black grip skin, with pads shaped like a hand's
  part(palm, slab(5, 6, 94, -14.6, -7.6, 13, 3), "rubber", "palm_skin");
  const pad = (rx, ry, rz, x, y, rot = 0) => new THREE.SphereGeometry(MM, 64, 40).scale(rx, ry, rz).rotateZ(rot).translate(x * MM, y * MM, -14.3 * MM);
  part(palm, pad(15, 24, 3.2, 21, 36, 0.12), "pad", "pad_hypothenar");
  for (const [n, f] of Object.entries(FINGERS)) part(palm, pad(f.d * 0.5, 8, 2.8, f.at[0], f.at[1] - 16), "pad", `pad_${n}`);
  part(palm, pad(12, 9, 2.4, 0, 60), "pad", "pad_centre");
  // thenar: a satin mound carrying the thumb, with a soft pad on its face
  const t = THUMB.at;
  part(palm, new THREE.SphereGeometry(MM, 96, 64).scale(16, 26, 13).rotateZ(0.6).translate((t[0] + 7) * MM, (t[1] + 10) * MM, -4 * MM), "satin", "thenar");
  part(palm, new THREE.SphereGeometry(MM, 64, 40).scale(11, 19, 3.4).rotateZ(0.6).translate((t[0] + 9) * MM, (t[1] + 12) * MM, -15.4 * MM), "pad", "pad_thenar");
}

// Knuckle: a gloss ball under a satin cover, with titanium pivot caps either side.
export function knuckle(K, root, f, name) {
  const { MM, part } = K;
  const r = f.d / 2;
  part(root, new THREE.SphereGeometry(r * 1.05 * MM, 64, 40), "gloss", `${name}_knuckle`);
  part(root, new THREE.SphereGeometry(r * 1.2 * MM, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.82), "satin", `${name}_knuckle_cover`);
  for (const s of [1, -1]) part(root, new THREE.CylinderGeometry(r * 0.32 * MM, r * 0.32 * MM, 0.9 * MM, 40).rotateZ(Math.PI / 2).translate(s * r * 1.08 * MM, 0, 0), "titanium", `${name}_pivot${s > 0 ? "R" : "L"}`);
  return r * 1.05;
}

export function thumbRoot(K, root) {
  const { MM, THUMB, part } = K;
  const r = THUMB.d / 2;
  part(root, new THREE.SphereGeometry(r * 1.05 * MM, 64, 40), "gloss", "thumb_root");
  return r * 1.05;
}

// A finger bone. Inner phalanx in gloss black: a pill whose rounded ends are centred on its hinges (so a
// bending finger never opens a gap), sculpted to narrow between the joints and flatten on the grip side.
// Over its back a separate satin shell; at its far end a satin knuckle cover; titanium pivot caps at its
// base hinge; a soft pad on the grip side; on the last bone a nail shell and a rounder tactile pad.
const SR = [[1, 0.93], [0.86, 0.82], [0.76, 0.7]];
export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, part } = K;
  const r = d / 2, r0 = r * SR[i][0], r1 = r * SR[i][1];
  const Lc = tip ? length - r1 : length;
  const finger = (y, a) => -0.07 * r * Math.sin(Math.PI * Math.min(1, Math.max(0, y / Lc))) - (Math.cos(a) < 0 ? 0.13 * r * Math.cos(a) ** 2 : 0);
  const pill = (a, b, y0, y1, n = 12) => {
    const pts = [];
    for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + (Math.PI / 2) * (k / n); pts.push(new THREE.Vector2(a * Math.cos(t), y0 + a * Math.sin(t))); }
    for (let k = 1; k <= 12; k++) { const t = k / 13; pts.push(new THREE.Vector2(a + (b - a) * t, y0 + (y1 - y0) * t)); }
    for (let k = 0; k <= n; k++) { const t = (Math.PI / 2) * (k / n); pts.push(new THREE.Vector2(b * Math.cos(t), y1 + b * Math.sin(t))); }
    pts[0].x = pts[pts.length - 1].x = 0;
    return pts.map((p) => p.multiplyScalar(MM));
  };
  part(g, sculpt(new THREE.LatheGeometry(pill(r0, r1, 0, Lc), 48), finger, "y").scale(1, 1, 0.9), "gloss", `${name}_inner`);
  // the back shell: covers the back between the knuckles, a millimetre proud; on the tip it runs over
  // the end as a nail
  const y0 = Lc * (tip ? 0.1 : 0.17), y1 = tip ? Lc + r1 * 0.8 : Lc * 0.83, prof = [];
  for (let k = 0; k <= 28; k++) {
    const t = k / 28, y = y0 + (y1 - y0) * t;
    const base = r0 + (r1 - r0) * Math.min(1, y / Lc) + 1;
    const over = tip ? Math.sqrt(Math.max(0.0025, 1 - Math.max(0, (y - Lc) / (r1 * 0.98)) ** 2)) : 1;
    const ends = Math.min(1, smooth(t * 6) + 0.82, smooth((1 - t) * 6) + 0.82);   // soften the shell's ends
    prof.push(new THREE.Vector2(base * over * ends, y).multiplyScalar(MM));
  }
  part(g, sculpt(new THREE.LatheGeometry(prof, 32, -1.2, 2.4), finger, "y").scale(1, 1, 0.92), "satin", `${name}_shell`);
  // knuckle cover over the hinge at the far end
  if (!tip) part(g, new THREE.SphereGeometry(r1 * 1.14 * MM, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.78).translate(0, Lc * MM, 0), "satin", `${name}_cover`);
  // titanium pivot caps at the base hinge
  for (const s of [1, -1]) part(g, new THREE.CylinderGeometry(r0 * 0.3 * MM, r0 * 0.3 * MM, 0.8 * MM, 32).rotateZ(Math.PI / 2).translate(s * (prevR + 0.25) * MM, 0, 0), "titanium", `${name}_pivot${s > 0 ? "R" : "L"}`);
  // grip pad
  const rm = (r0 + r1) / 2, padR = rm * (tip ? 0.8 : 0.62), padLen = Lc * (tip ? 0.86 : 0.6);
  part(g, new THREE.CapsuleGeometry(padR * MM, Math.max(0.1, padLen - 2 * padR) * MM, 16, 40).scale(1, 1, 0.42).translate(0, Lc * (tip ? 0.62 : 0.5) * MM, -(rm * 0.8 + 0.4 - padR * 0.42) * MM), "pad", `${name}_pad`);
  if (tip) {
    const o = new THREE.Object3D();
    o.position.y = Lc * MM;
    o.userData.r = r1;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => (d / 2) * SR[i][1];
