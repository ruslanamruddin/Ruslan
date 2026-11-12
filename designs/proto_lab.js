// "Lab": a research-lab prototype arm, the kind that lives on an optical table in a university robotics
// lab. Precision-machined aluminium side plates (raw bead-blasted and black anodised) with milled
// pockets and socket screws in neat patterns; exposed custom joint modules: frameless motors with
// copper windings showing between stand-offs, strain-wave gearboxes (circular spline, elliptical
// flexspline and wave generator, visibly turning), optical encoder discs that spin with each joint,
// brakes and slip rings; motor-driver boards with tiny components and blinking status LEDs; flat flex
// ribbons and braided looms bending across the joints; carbon and white printed covers only half
// fitted. The hand is a research hand: machined finger links coupled by side linkage rods, worm
// gearmotors visible through the open back, tactile flex pads on the fingertips.
import * as THREE from "three";
import { V, rng, rrect, circle, makeKit, ribbon } from "./proto_lab_parts.js";
import { anchor, flexCable } from "./parts.js";

export const label = "Lab";
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const RATIO = 9;   // encoder / wave generator turns per joint turn (shown, not real: real is ~100)
let k = null, KK = null;
const spinners = [], blinkers = [], rods = [], cables = [];

function spinner(owner, at, axis, f) {
  const o = k.axisFrame(owner, at, axis), g = new THREE.Group();
  o.add(g);
  spinners.push({ g, f });
  return g;
}
// A status LED on a surface whose outward normal is the frame's +z: a smoked body and a lit die that blinks.
function led(F, x, y, z, role = "glow", rate = 1, duty = 0.3, phase = 0, name = "led") {
  k.B(F, "smoke", `${name}_body`, [1.8, 1.1, 0.7], [x, y, z + 0.35]);
  const m = KK.livePart(F, k.boxG(1.3, 0.7, 0.45), role, name, [x, y, z + 0.55]);
  blinkers.push({ m, rate, duty, phase });
  return m;
}

/* ---------- Electronics ---------- */
// A motor-driver board: local frame +z = board normal, mounted on corner stand-offs `standoff` tall.
function pcb(owner, at, u, n, w, h, seed, { leds = 2, standoff = 4, connectors = 2, big = true, name = "pcb" } = {}) {
  const F = k.basisFrame(owner, at, u, n), R = rng(seed), z0 = 1.6;
  k.add(F, k.T(k.rboxG(w, h, 1.6, 1.4, 0.2), [0, 0, 0.8]), "gloss", `${name}_board`);
  const cx = w / 2 - 2.4, cy = h / 2 - 2.4, used = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    if (standoff > 0) k.standoff(F, [sx * cx, sy * cy, -standoff], [sx * cx, sy * cy, 0], 1.5, "titanium", `${name}_standoff`);
    k.C(F, "titanium", `${name}_pad`, 1.7, 0.1, [sx * cx, sy * cy, z0 + 0.05], "z", 12);
    k.screw(F, [sx * cx, sy * cy, z0 + 0.1], Z, 1.0, `${name}_screw`);
    used.push([sx * cx - 2.3, sy * cy - 2.3, sx * cx + 2.3, sy * cy + 2.3]);
  }
  const free = (r) => r[0] > -w / 2 + 0.6 && r[2] < w / 2 - 0.6 && r[1] > -h / 2 + 0.6 && r[3] < h / 2 - 0.6 && !used.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  const spot = (pw, ph, want) => {
    for (let i = 0; i < 80; i++) {
      const x = want && i === 0 ? want[0] : (R() - 0.5) * (w - pw - 1), y = want && i === 0 ? want[1] : (R() - 0.5) * (h - ph - 1);
      const r = [x - pw / 2 - 0.45, y - ph / 2 - 0.45, x + pw / 2 + 0.45, y + ph / 2 + 0.45];
      if (free(r)) { used.push(r); return [x, y]; }
    }
    return null;
  };
  let p;
  for (let i = 0; i < connectors; i++) {
    const cw = 7 + Math.round(R() * 3) * 1.5;
    if ((p = spot(cw, 4.6, [(i - (connectors - 1) / 2) * (cw + 3), h / 2 - 3.4]))) {
      k.B(F, "plate", `${name}_jst`, [cw, 4.6, 4.4], [p[0], p[1], z0 + 2.2]);
      k.B(F, "gloss", `${name}_jst_mouth`, [cw - 1.6, 0.4, 3], [p[0], p[1] + 2.15, z0 + 2.4]);
    }
  }
  if (big && (p = spot(8.4, 8.4, [-w * 0.12, -1]))) {
    k.B(F, "steel", `${name}_mcu_leads`, [8.6, 7.2, 0.25], [p[0], p[1], z0 + 0.13]);
    k.B(F, "steel", `${name}_mcu_leads2`, [7.2, 8.6, 0.25], [p[0], p[1], z0 + 0.13]);
    k.B(F, "joint", `${name}_mcu`, [7.4, 7.4, 1.1], [p[0], p[1], z0 + 0.55]);
  }
  for (let i = 0; i < 3; i++) if ((p = spot(5, 6.4))) {
    k.B(F, "joint", `${name}_fet`, [4.8, 4.8, 1.2], [p[0], p[1] - 0.6, z0 + 0.6]);
    k.B(F, "metal", `${name}_fet_tab`, [4.2, 1.4, 0.4], [p[0], p[1] + 2.4, z0 + 0.2]);
  }
  const nc = 2 + Math.floor(R() * 2);
  for (let i = 0; i < nc; i++) if ((p = spot(4.8, 4.8))) {
    k.C(F, "joint", `${name}_cap_base`, 2.35, 1, [p[0], p[1], z0 + 0.5], "z", 14);
    k.C(F, "metal", `${name}_cap`, 2.2, 4.8, [p[0], p[1], z0 + 3.2], "z", 14);
  }
  if ((p = spot(5.6, 5.6))) k.add(F, k.T(k.rboxG(5.4, 5.4, 3, 1.2, 0.3), [p[0], p[1], z0 + 1.5]), "joint", `${name}_inductor`);
  if ((p = spot(3.6, 1.8))) k.add(F, k.T(k.rboxG(3.4, 1.6, 0.9, 0.7, 0.15), [p[0], p[1], z0 + 0.45]), "steel", `${name}_crystal`);
  if ((p = spot(10.4, 2.6))) {
    k.B(F, "joint", `${name}_header`, [10.2, 2.5, 2.4], [p[0], p[1], z0 + 1.2]);
    for (let j = 0; j < 4; j++) k.B(F, "titanium", `${name}_pin`, [0.6, 0.6, 5.6], [p[0] - 3.8 + j * 2.54, p[1], z0 + 2.8]);
  }
  for (let i = 0; i < 16; i++) if ((p = spot(1.6, 0.8))) k.B(F, R() < 0.55 ? "joint" : "titanium", `${name}_smd`, [1.6, 0.8, 0.5], [p[0], p[1], z0 + 0.25], [0, 0, R() < 0.4 ? Math.PI / 2 : 0]);
  for (let i = 0; i < 3; i++) if ((p = spot(1.6, 1.6))) k.C(F, "titanium", `${name}_tp`, 0.7, 0.8, [p[0], p[1], z0 + 0.4], "z", 8);
  for (let i = 0; i < leds; i++) {
    if ((p = spot(2.2, 1.4, [w / 2 - 4 - i * 3.4, -h / 2 + 2.4])) || (p = spot(2.2, 1.4))) {
      led(F, p[0], p[1], z0, i % 3 === 1 ? "ring" : "glow", 0.6 + R() * 1.6, i % 3 === 1 ? 0.85 : 0.18 + R() * 0.3, R(), `${name}_led`);
    }
  }
  F.userData.spot = spot;
  return F;
}
// A finned heatsink on a board frame at (x, y), fins along y.
function heatsink(F, x, y, w, h, finH, n, z0 = 1.6, name = "heatsink") {
  k.B(F, "metal", `${name}_base`, [w, h, 1.6], [x, y, z0 + 0.8]);
  for (let i = 0; i < n; i++) k.B(F, "metal", `${name}_fin`, [0.8, h, finH], [x - w / 2 + 0.4 + (i * (w - 0.8)) / (n - 1), y, z0 + 1.6 + finH / 2]);
}
// A small axial fan: square frame, guard, spinning blades. +z of `axis` is the outflow face.
function fan(owner, at, axis, s, speed, name = "fan") {
  const F = k.axisFrame(owner, at, axis);
  k.plate(F, "joint", `${name}_frame`, rrect(-s / 2, -s / 2, s / 2, s / 2, 2.6), { plane: "xy", c0: 0, t: 6, holes: [circle(0, 0, s * 0.46, 40)], bevel: 0.5 });
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.screw(F, [sx * (s / 2 - 2.6), sy * (s / 2 - 2.6), 6], Z, 1.0, `${name}_screw`);
  for (const rr of [0.2, 0.33, 0.45]) k.add(F, k.ringG(s * rr, s * rr + 0.55, 6, 6.55, 40, 0.2), "steel", `${name}_guard`);
  for (const a of [Math.PI / 4, -Math.PI / 4]) k.B(F, "steel", `${name}_guard_spoke`, [s * 0.9, 0.6, 0.5], [0, 0, 6.3], [0, 0, a]);
  k.add(F, k.discG(s * 0.13, 6, 6.8, 20, 0.2), "steel", `${name}_guard_hub`);
  const g = spinner(F, [0, 0, 3], "z", (t) => t * speed);
  k.add(g, k.discG(s * 0.17, -2.2, 2.2, 20, 0.5), "gloss", `${name}_hub`);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, rr = s * 0.31;
    k.B(g, "joint", `${name}_blade`, [s * 0.2, s * 0.27, 0.6], [Math.cos(a) * rr, Math.sin(a) * rr, 0], [0, 0.55, a - Math.PI / 2]);
  }
}

/* ---------- Actuator building blocks (built in a frame whose +z is the joint axis) ---------- */
// Optical encoder: a dark glass disc with fine radial slits that spins, and a fixed read head.
function encoder(F, z, r, f, name, headA = 0.6) {
  const g = spinner(F, [0, 0, z], "z", f);
  k.add(g, k.discG(r, 0, 0.6, 56, 0.1), "glass", `${name}_enc_disc`);
  const n = Math.max(40, Math.round(r * 2.6));
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; k.B(g, "metal", `${name}_enc_slit`, [0.42, r * 0.13, 0.06], [Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84, 0.63], [0, 0, a - Math.PI / 2]); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.B(g, "metal", `${name}_enc_track`, [1.4, r * 0.08, 0.06], [Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, 0.63], [0, 0, a - Math.PI / 2]); }
  k.B(g, "steel", `${name}_enc_index`, [2.2, r * 0.1, 0.08], [0, r * 0.54, 0.64]);
  k.add(g, k.discG(r * 0.27, 0.6, 2.2, 24, 0.3), "metal", `${name}_enc_hub`);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.screw(g, [Math.cos(a) * r * 0.17, Math.sin(a) * r * 0.17, 2.2], Z, Math.max(0.6, r * 0.045), `${name}_enc_hubscrew`); }
  // read head straddling the rim
  const hr = r * 0.86, c = Math.cos(headA), s = Math.sin(headA), rot = [0, 0, headA];
  k.B(F, "joint", `${name}_enc_head_top`, [r * 0.24, 5, 1.6], [c * hr, s * hr, z + 1.6], rot);
  k.B(F, "joint", `${name}_enc_head_bot`, [r * 0.24, 5, 1.4], [c * hr, s * hr, z - 0.9], rot);
  k.B(F, "joint", `${name}_enc_head_spine`, [2.2, 5, 4.4], [c * (r + 1.6), s * (r + 1.6), z + 0.4], rot);
  k.B(F, "gloss", `${name}_enc_head_pcb`, [r * 0.3, 6, 0.4], [c * hr, s * hr, z + 2.6], rot);
}
// Frameless motor: a laminated stator stack with copper end windings above and below.
function stator(F, z0, z1, rIn, rOut, n, name) {
  const e = Math.min(2.6, (z1 - z0) * 0.22);
  k.add(F, k.groovedG(rOut, z0 + e, z1 - e, 0.7, 0.2, 40), "joint", `${name}_stator`);
  const rm = (rIn + rOut) / 2 - 0.5, wd = ((2 * Math.PI * rm) / n) * 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const zc of [z0 + e / 2, z1 - e / 2]) {
      const g = new THREE.CapsuleGeometry(wd * KK.MM, (rOut - rIn) * 0.55 * KK.MM, 2, 6).scale(1, 1, (e * 0.5) / wd);
      g.rotateZ(a - Math.PI / 2).translate(Math.cos(a) * rm * KK.MM, Math.sin(a) * rm * KK.MM, zc * KK.MM);
      k.add(F, g, "titanium", `${name}_winding`);
    }
  }
}
// Slip ring: a stack of contact rings that turns with the joint, and a fixed brush block.
function slipRing(owner, z, r, f, name) {
  const g = spinner(owner, [0, 0, z], "z", f);
  k.add(g, k.discG(r * 0.62, 0, 9.4, 28, 0.3), "joint", `${name}_slip_core`);
  for (let i = 0; i < 5; i++) {
    k.add(g, k.ringG(r * 0.6, r, 0.9 + i * 1.7, 1.75 + i * 1.7, 32, 0.1), "titanium", `${name}_slip_ring`);
    k.add(g, k.ringG(r * 0.6, r * 0.9, 1.75 + i * 1.7, 2.6 + i * 1.7, 28, 0.1), "joint", `${name}_slip_sep`);
  }
  k.add(g, k.discG(r + 0.4, 9.4, 10.6, 32, 0.3), "metal", `${name}_slip_cap`);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.screw(g, [Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 10.6], Z, 0.8, `${name}_slip_screw`); }
  k.B(g, "steel", `${name}_slip_tab`, [4, 2, 0.6], [r + 1.5, 0, 10.2]);
  k.B(owner, "joint", `${name}_brush_block`, [5, 8, 9], [r + 4.6, 0, z + 5]);
  for (let i = 0; i < 5; i++) k.B(owner, "steel", `${name}_brush`, [2.6, 0.4, 0.4], [r + 1.1, (i % 2 ? 1.2 : -1.2), z + 1.3 + i * 1.7]);
  k.wire(owner, "rubber", `${name}_brush_wire`, [[r + 7, 1.5, z + 6], [r + 9, 2, z + 3], [r + 9.5, 3, z - 1]], 0.55);
  k.wire(owner, "titanium", `${name}_brush_wire2`, [[r + 7, -1.5, z + 4], [r + 9, -2, z + 2], [r + 9.5, -3, z - 1]], 0.45);
}

/* ---------- Pitch joint: an actuator across the arm (axis y) ---------- */
// The outer link owns the output band in the middle; the inner link owns the two ends: the motor end
// (+y: exposed stator, brake, encoder) and the gear end (-y: the strain-wave gear's face).
function pitchJoint(inner, outer, j, { R, Lm, band }, name) {
  const at = outer.position.z / KK.MM, f = (t, S) => S.q[j] * RATIO;
  const Fo = k.axisFrame(outer, [0, 0, 0], "y");
  for (const s of [1, -1]) {
    k.add(Fo, k.ringG(R * 0.5, R + 1.5, s > 0 ? 0.6 : -band, s > 0 ? band : -0.6, 64, 0.8), "metal", `${name}_band`);
    k.screwCircle(Fo, 14, R - 0.2, V(0, 0, s * band), V(0, 0, s), 1.0, `${name}_band_screw`, s > 0 ? 0 : Math.PI / 14);
  }
  k.add(Fo, k.ringG(R * 0.5, R + 0.8, -0.6, 0.6, 64, 0.1), "joint", `${name}_band_groove`);
  // motor end
  const P = k.axisFrame(inner, [0, 0, at], "y");
  k.add(P, k.ringG(R * 0.5, R - 2, band + 0.3, band + 2.4, 56, 0.2), "joint", `${name}_seamP`);
  k.add(P, k.ringG(R * 0.5, R, band + 2.4, band + 3.8, 64, 0.5), "metal", `${name}_housing`);
  k.add(P, k.gearG(R - 2, R - 0.3, R + 0.4, Math.round(R * 2.6), band + 3.8, band + 8), "metal", `${name}_spline_ribs`);
  const o0 = band + 8, o1 = Lm - 7;
  k.add(P, k.ringG(R * 0.4, R - 0.5, o0, o0 + 1.2, 56, 0.3), "joint", `${name}_frame_ring`);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; k.rod(P, "steel", `${name}_post`, [Math.cos(a) * (R - 2), Math.sin(a) * (R - 2), o0], [Math.cos(a) * (R - 2), Math.sin(a) * (R - 2), o1], 1.5, 8); }
  stator(P, o0 + 1.2, o1, R * 0.42, R - 4.2, 18, name);
  k.add(P, k.ringG(R * 0.4, R, o1, Lm - 3, 64, 0.5), "joint", `${name}_brake`);
  k.add(P, k.ringG(R - 1, R + 0.3, Lm - 5.4, Lm - 4.6, 64, 0.1), "titanium", `${name}_brake_face`);
  k.add(P, k.discG(R - 0.6, Lm - 3, Lm, 64, 0.6), "metal", `${name}_rear_cap`);
  k.screwCircle(P, 6, R * 0.565, V(0, 0, Lm), Z, Math.max(0.8, R * 0.028), `${name}_cap_screw`, 0.3);
  encoder(P, Lm + 0.3, R * 0.47, f, name);
  k.B(P, "joint", `${name}_brake_conn`, [4, 6, 3.6], [R + 1.6, 0, o1 + 2]);
  // gear end
  const N = k.axisFrame(inner, [0, 0, at], "-y");
  k.add(N, k.ringG(R * 0.5, R - 2, band + 0.3, band + 2.4, 56, 0.2), "joint", `${name}_seamN`);
  k.add(N, k.ringG(R * 0.5, R, band + 2.4, Lm - 4.5, 64, 0.8), "metal", `${name}_gear_housing`);
  const gm = (band + Lm) / 2;
  k.add(N, k.ringG(R - 1, R + 0.25, gm - 0.5, gm + 0.5, 64, 0.1), "joint", `${name}_gear_groove`);
  k.screwCircle(N, 10, R - 3.4, V(0, 0, Lm - 4.5), Z, 1.0, `${name}_spline_screw`);
  const rs = R * 0.52, nt = Math.round(R * 1.9);
  k.add(N, k.gearG(R - 0.6, rs, rs - 1.1, nt, Lm - 4.5, Lm, true), "metal", `${name}_circular_spline`);
  const g = spinner(N, [0, 0, 0], "z", f);
  k.add(g, k.gearG(R * 0.4, rs - 1.6, rs - 0.5, nt - 2, Lm - 4, Lm + 0.3).scale(1.045, 0.955, 1), "steel", `${name}_flexspline`);
  k.add(g, k.discG(R * 0.4, Lm - 3.6, Lm + 0.7, 48, 0.3).scale(1.05, 0.95, 1), "joint", `${name}_wave_gen`);
  k.add(g, k.ringG(R * 0.33, R * 0.37, Lm + 0.7, Lm + 0.95, 40, 0.05).scale(1.05, 0.95, 1), "titanium", `${name}_wg_bearing`);
  k.add(g, k.discG(R * 0.14, Lm + 0.7, Lm + 2.6, 24, 0.4), "steel", `${name}_wg_hub`);
  k.B(g, "gloss", `${name}_wg_coupling`, [R * 0.5, 2.4, 0.9], [0, 0, Lm + 1.1]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; k.screw(g, [Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25, Lm + 0.7], Z, Math.max(0.7, R * 0.025), `${name}_wg_screw`); }
}
// The inner link's fork: two machined side plates with lugs centred on the pivot, a bearing bore, pockets.
function forkPlates(owner, at, { R, Lm, t }, z0, hx, pockets, name, role = "metal") {
  const outline = [[0, at, R + 5], [-hx + 6, z0 + 6, 6], [hx - 6, z0 + 6, 6]];
  const bore = circle(0, at, R * 0.62, 48);
  for (const s of [1, -1]) {
    const c0 = s > 0 ? Lm + 0.3 : -(Lm + 0.3 + t), yo = s > 0 ? Lm + 0.3 + t : -(Lm + 0.3 + t);
    k.plate(owner, role, `${name}_fork${s > 0 ? "R" : "L"}`, outline, { plane: "xz", c0, t, holes: [bore], pockets, depth: 2, face: s, bevel: 0.7, floorRole: "metal" });
    k.add(owner, k.T(k.orient(k.ringG(R * 0.62, R * 0.62 + 4, 0, 1.2, 48, 0.3), s > 0 ? "y" : "-y"), [0, yo, at]), "joint", `${name}_retainer`);
    k.screwCircle(owner, 8, R * 0.62 + 2, V(0, yo + s * 1.2, at), V(0, s, 0), 0.9, `${name}_retainer_screw`, Math.PI / 8);
    // screws along the plate edge, into the base block
    for (const x of [-hx + 6, 0, hx - 6]) k.screw(owner, [x, yo, z0 + 5], V(0, s, 0), 1.6, `${name}_fork_screw`);
  }
}
// Spacer rods between the fork plates, with a screw at each end.
function spacers(owner, pts, y, r, name) {
  for (const [x, z] of pts) {
    k.rod(owner, "steel", `${name}_spacer`, [x, -y, z], [x, y, z], r, 14);
    for (const s of [1, -1]) k.screw(owner, [x, s * (y + 0.01), z], V(0, s, 0), r * 0.6, `${name}_spacer_screw`);
  }
}
// The outer link's yoke: a narrow neck on the band, then a wide anodised platform clear of the housings.
function yoke(owner, { R, band }, zTop, wx, wy, name) {
  const n0 = R * 0.55, n1 = R + 3;
  k.add(owner, k.T(k.rboxG(2 * wx * 0.8, 2 * (band - 0.5), n1 - n0, 3, 0.5), [0, 0, (n0 + n1) / 2]), "metal", `${name}_neck`);
  k.add(owner, k.T(k.rboxG(2 * wx, 2 * wy, zTop - n1, 5, 0.8), [0, 0, (n1 + zTop) / 2]), "joint", `${name}_platform`);
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.screw(owner, [sx * (wx - 4), sy * (wy - 4), zTop], Z, 1.4, `${name}_platform_screw`);
  for (const s of [1, -1]) for (const x of [-wx * 0.4, wx * 0.4]) k.screw(owner, [x, s * wy, (n1 + zTop) / 2], V(0, s, 0), 1.1, `${name}_platform_side_screw`);
}
// The lower (fixed) half of a roll joint: flange, posts, slip ring, top ring.
function rollLower(owner, z0, z1, R, j, name) {
  k.add(owner, k.ringG(R * 0.3, R + 4, z0, z0 + 3, 64, 0.6), "metal", `${name}_flange`);
  k.screwCircle(owner, 10, R + 2, V(0, 0, z0 + 3), Z, 1.2, `${name}_flange_screw`);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; k.standoff(owner, [Math.cos(a) * (R - 4), Math.sin(a) * (R - 4), z0 + 3], [Math.cos(a) * (R - 4), Math.sin(a) * (R - 4), z1 - 4.6], 1.8, "steel", `${name}_post`); }
  slipRing(owner, z0 + 3, R * 0.36, (t, S) => S.q[j], name);
  k.add(owner, k.ringG(R * 0.3, R, z1 - 4.6, z1 - 0.6, 64, 0.6), "metal", `${name}_top_ring`);
  k.add(owner, k.ringG(R * 0.3, R - 1, z1 - 0.6, z1, 56, 0.1), "joint", `${name}_seam`);
}
// The upper (turning) half: output flange, open stator, spinning encoder, cap.
function rollUpper(owner, R, h, j, name) {
  k.add(owner, k.ringG(R * 0.3, R, 0.4, 5.5, 64, 0.6), "metal", `${name}_output`);
  k.screwCircle(owner, 12, R - 3, V(0, 0, 5.5), Z, 1.1, `${name}_output_screw`);
  const s1 = h - 9;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.rod(owner, "steel", `${name}_post`, [Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 5.5], [Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), h - 4], 1.5, 8); }
  stator(owner, 6.2, s1, R * 0.42, R - 6.5, 16, name);
  encoder(owner, s1 + 1.2, R - 6.8, (t, S) => -S.q[j] * RATIO, name, 2.6);
  k.add(owner, k.ringG(R * 0.3, R, h - 4, h, 64, 0.6), "joint", `${name}_cap`);
}

export function arm(K) {
  KK = K;
  k = makeKit(K);
  const { MM, rig, base } = K;
  const { B, C, add, T, plate, screw, screwCircle, ringG, discG, gearG, loom, wire } = k;

  /* ----- Base: optical breadboard, machined base plate, J1 module, controller, E-stop ----- */
  plate(base, "metal", "breadboard", rrect(-175, -115, 115, 115, 5), { plane: "xy", c0: 2, t: 10, bevel: 0.8 });
  plate(base, "joint", "breadboard_core", rrect(-174, -114, 114, 114, 5), { plane: "xy", c0: 0, t: 2.2, bevel: 0.3 });
  for (let x = -162.5; x < 112; x += 25) for (let y = -100; y <= 100; y += 25) {
    if (Math.abs(x) < 78 && Math.abs(y) < 78) continue;
    if (x < -95 && Math.abs(y) < 50) continue;
    add(base, T(discG(2.6, 11.9, 12.06, 14, 0), [x, y, 0]), "gloss", "breadboard_hole");
  }
  plate(base, "joint", "base_plate", rrect(-70, -70, 70, 70, 14), { plane: "xy", c0: 12, t: 10, bevel: 1.2, pockets: [rrect(-62, -40, -50, 40, 4), rrect(50, -40, 62, 40, 4)], depth: 2 });
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) screw(base, [sx * 58, sy * 58, 22], Z, 3, "base_screw");
  for (const s of [1, -1]) {   // strap clamps onto the breadboard
    B(base, "metal", "clamp_bar", [14, 36, 7], [0, s * 82, 25.5]);
    B(base, "joint", "clamp_step", [14, 9, 11], [0, s * 95.5, 17.5]);
    add(base, T(ringG(3.4, 6.2, 0, 1.2, 24, 0.2), [0, s * 82, 29]), "steel", "clamp_washer");
    screw(base, [0, s * 82, 30.2], Z, 3.2, "clamp_screw");
  }
  // J1: open-frame motor on the base plate
  add(base, ringG(18, 60, 22, 26, 72, 0.8), "metal", "j1_flange");
  screwCircle(base, 12, 57.5, V(0, 0, 26), Z, 1.6, "j1_flange_screw");
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.standoff(base, [Math.cos(a) * 52, Math.sin(a) * 52, 26], [Math.cos(a) * 52, Math.sin(a) * 52, 40], 2, "steel", "j1_post"); }
  stator(base, 26.4, 40, 26, 48, 24, "j1");
  add(base, ringG(18, 58, 40, 45.4, 72, 0.8), "metal", "j1_top_ring");
  add(base, ringG(18, 56.5, 45.4, 46, 64, 0.1), "joint", "j1_seam");
  {   // ring-encoder read head on a bracket
    const a = -0.5, c = Math.cos(a), s = Math.sin(a);
    B(base, "metal", "j1_head_bracket", [3, 10, 21], [c * 63.5, s * 63.5, 36], [0, 0, a]);
    B(base, "joint", "j1_read_head", [5, 10, 7], [c * 61.6, s * 61.6, 49.5], [0, 0, a]);
    const F = k.basisFrame(base, [c * 61.6, s * 61.6, 53], X, Z);
    led(F, 0, 0, 0, "glow", 2.2, 0.25, 0.1, "j1_head_led");
  }
  // controller box behind the arm: anodised case, finned lid, fan, connectors, LEDs
  add(base, T(k.rboxG(56, 88, 44, 4, 1), [-136, 0, 34]), "joint", "controller");
  for (let i = 0; i < 14; i++) B(base, "metal", "controller_fin", [52, 1.2, 8], [-136, -39 + i * 6, 60]);
  fan(base, [-136, 44, 34], "y", 30, 9, "controller_fan");
  {
    const F = k.basisFrame(base, [-164, 0, 34], V(0, -1, 0), V(-1, 0, 0));
    for (const x of [-30, -20, -10]) { k.C(F, "joint", "ctrl_m8", 3.4, 6, [x, -6, 3], "z", 16); k.C(F, "steel", "ctrl_m8_nut", 4.2, 2.4, [x, -6, 1.2], "z", 6); }
    k.B(F, "titanium", "ctrl_dsub", [18, 8, 1.6], [12, -6, 0.8]);
    k.B(F, "gloss", "ctrl_dsub_mouth", [14, 5, 2.4], [12, -6, 1.6]);
    for (const x of [7, 17]) k.screw(F, [x - 9 + (x > 10 ? 4 : -4), -6, 0], Z, 0.9, "ctrl_dsub_screw");
    k.B(F, "steel", "ctrl_rj45", [9, 8, 7], [32, -6, 3.5]);
    k.B(F, "gloss", "ctrl_rj45_mouth", [6, 5, 0.6], [32, -6, 7.1]);
    led(F, 26, 10, 0, "glow", 1.1, 0.5, 0.0, "ctrl_led");
    led(F, 30, 10, 0, "ring", 3.1, 0.2, 0.4, "ctrl_led");
    led(F, 34, 10, 0, "glow", 0.4, 0.9, 0.7, "ctrl_led");
    for (const [x, y] of [[-40, 18], [40, 18], [-40, -18], [40, -18]]) k.screw(F, [x, y, 0], Z, 1.4, "ctrl_screw");
  }
  // emergency stop on a printed housing
  add(base, T(k.rboxG(30, 30, 22, 5, 1.2), [86, -86, 23]), "plate", "estop_housing");
  add(base, ringG(4, 10, 34, 37, 28, 0.4), "metal", "estop_collar").position.set(86 * MM, -86 * MM, 0);
  add(base, new THREE.SphereGeometry(13 * MM, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1).rotateX(Math.PI / 2).translate(86 * MM, -86 * MM, 38 * MM), "gloss", "estop_cap");
  add(base, T(discG(13, 36.8, 38.2, 32, 0.6), [86, -86, 0]), "gloss", "estop_rim");
  loom(base, "rubber", "estop_cable", [[72, -86, 18], [60, -70, 14], [52, -60, 16], [46, -52, 18]], 2.4);
  // cables from the controller into the base plate
  loom(base, "carbon", "base_loom", [[-108, 18, 24], [-92, 28, 15], [-78, 26, 17], [-71, 22, 17]], 3.6);
  wire(base, "rubber", "base_wire", [[-108, -16, 20], [-92, -26, 15], [-78, -24, 16], [-71, -22, 16]], 1.6, 8);
  for (const y of [22, -22]) { C(base, "joint", "base_conn", 4.4, 7, [-73.5, y, 17], "x", 16); C(base, "steel", "base_conn_nut", 5.2, 2.4, [-71, y, 17], "x", 6); }

  /* ----- link1: turntable, J2 fork ----- */
  const L1 = rig.link1, J2 = { R: 40, Lm: 46, band: 16, t: 6 };
  add(L1, ringG(18, 58, 0.4, 8, 72, 0.8), "metal", "j1_output");
  add(L1, gearG(56, 58.2, 58.8, 180, 1.8, 6.2), "steel", "j1_encoder_tape");
  screwCircle(L1, 12, 53, V(0, 0, 8), Z, 1.6, "j1_output_screw", 0.13);
  plate(L1, "joint", "turntable", rrect(-50, -54, 50, 54, 10), { plane: "xy", c0: 8, t: 8, bevel: 0.8 });
  forkPlates(L1, 118, J2, 16, 50, [
    [[-38, 30, 4], [-10, 30, 4], [-38, 84, 4]], [[38, 30, 4], [10, 30, 4], [38, 84, 4]], [[0, 42, 3], [-23, 86, 4], [23, 86, 4]],
  ], "j2", "joint");
  spacers(L1, [[34, 30], [-34, 30], [36, 56], [-36, 56]], J2.Lm + 0.3, 3.2, "j2");
  pitchJoint(L1, rig.link2, 1, J2, "j2");
  pcb(L1, [0, -(J2.Lm + 6.3 + 5), 52], V(-1, 0, 0), V(0, -1, 0), 46, 34, 11, { leds: 3, standoff: 5, name: "j2_driver" });
  pcb(L1, [0, J2.Lm + 6.3 + 5, 50], X, Y, 32, 24, 12, { leds: 2, standoff: 5, connectors: 1, big: false, name: "j2_brake_board" });
  B(L1, "joint", "j2_cable_clamp", [8, 28, 8], [-40.5, 0, 60]);
  for (const y of [-11, 11]) screw(L1, [-44.5, y, 60], V(-1, 0, 0), 1.1, "j2_cable_clamp_screw");
  // flat ribbon from the driver board to the clamp
  B(L1, "gloss", "j2_ribbon_static", [0.5, 22, 46], [-44.8, 0, 36]);
  loom(L1, "carbon", "j1_loom", [[-30, 22, 16], [-42, 24, 26], [-44, 24, 46], [-44, 24, 62]], 3);

  /* ----- link2: yoke and the lower half of J3 ----- */
  const L2 = rig.link2;
  yoke(L2, J2, 54, 36, 38, "j2");
  rollLower(L2, 54, 70, 36, 2, "j3");
  B(L2, "joint", "j2_cable_bracket", [4, 52, 16], [-38, 0, 37]);
  for (const y of [-18, 0, 18]) screw(L2, [-40, y, 33], V(-1, 0, 0), 1.0, "j2_cable_bracket_screw");

  /* ----- link3: upper arm ----- */
  const L3 = rig.link3, J4 = { R: 34, Lm: 40, band: 14, t: 6 };
  rollUpper(L3, 36, 32, 2, "j3");
  plate(L3, "joint", "upper_base", rrect(-36, -46.3, 36, 46.3, 6), { plane: "xy", c0: 32, t: 12, bevel: 0.8 });
  forkPlates(L3, 230, J4, 32, 36, [
    { c: rrect(-25, 50, 25, 126, 5), h: [circle(0, 66, 9, 32), circle(0, 88, 9, 32), circle(0, 110, 9, 32)] },
    { c: rrect(-24, 138, 24, 190, 5), h: [rrect(-14, 146, 14, 182, 6)] },
  ], "j4");
  spacers(L3, [[28, 62], [-28, 62], [28, 124], [-28, 124], [28, 176], [-28, 176]], J4.Lm + 0.3, 3, "j4");
  pitchJoint(L3, rig.link4, 3, J4, "j4");
  // half-fitted covers: carbon on the front, white printed on the lower back
  plate(L3, "carbon", "upper_cover", rrect(-46.3, 122, 46.3, 190, 7), { plane: "yz", c0: 36.2, t: 2.2, bevel: 0.5, holes: [circle(-24, 156, 6, 28), circle(24, 156, 6, 28)] });
  for (const [y, z] of [[43, 127], [-43, 127], [43, 185], [-43, 156]]) screw(L3, [38.4, y, z], X, 1.2, "upper_cover_screw");   // one screw still missing
  // front, below the cover: a breakout board on a crossbar and a front loom (the open test section)
  plate(L3, "joint", "upper_front_bracket", rrect(-40.3, 60, 40.3, 112, 3), { plane: "yz", c0: 12, t: 2.5, bevel: 0.4, holes: [circle(-28, 86, 5, 24), circle(28, 86, 5, 24)] });
  pcb(L3, [18.5, 4, 86], V(0, 1, 0), X, 46, 36, 23, { leds: 3, standoff: 4, connectors: 3, name: "j3_driver" });
  loom(L3, "rubber", "upper_front_loom", [[10, -32, 40], [20, -33, 70], [24, -32, 112], [28, -30, 140]], 2.4);
  for (const z of [64, 100]) { add(L3, T(ringG(2.8, 3.8, -2.2, 2.2, 16, 0.3), [20.6, -33, z]), "metal", "front_pclip"); B(L3, "metal", "front_pclip_tab", [3, 6.4, 4.4], [20.6, -37, z]); }
  plate(L3, "plate", "upper_back_cover", rrect(-46.3, 46, 46.3, 112, 6), { plane: "yz", c0: -38.6, t: 2.4, bevel: 0.8, holes: [circle(-22, 96, 7, 28)] });
  for (const z of [52, 106]) for (const s of [1, -1]) screw(L3, [-38.6, s * 43, z], V(-1, 0, 0), 1.2, "upper_back_screw");
  // J4 driver board on a crossbar, seen through the open back
  plate(L3, "joint", "upper_board_bracket", rrect(-40.3, 128, 40.3, 172, 3), { plane: "yz", c0: -10, t: 2.5, bevel: 0.4 });
  pcb(L3, [-14.5, 0, 150], V(0, 1, 0), V(-1, 0, 0), 58, 40, 21, { leds: 3, standoff: 4, connectors: 3, name: "j4_driver" });
  // braided loom up the arm in P-clips
  loom(L3, "carbon", "upper_loom", [[-16, -28, 36], [-24, -30, 70], [-26, -30, 130], [-27, -28, 166], [-36, -22, 176]], 3.4);
  for (const z of [80, 150]) {
    add(L3, T(ringG(3.6, 4.6, -2.5, 2.5, 16, 0.3), [-25.4, -30, z]), "metal", "upper_pclip");
    B(L3, "metal", "upper_pclip_tab", [3, 9.6, 5], [-25.4, -35.5, z]);
  }
  B(L3, "joint", "j4_cable_clamp", [8, 30, 8], [-33, 0, 172]);
  for (const y of [-11, 11]) screw(L3, [-37, y, 172], V(-1, 0, 0), 1.1, "j4_cable_clamp_screw");

  /* ----- link4: forearm (open): twin carbon tubes, driver with heatsink and fan ----- */
  const L4 = rig.link4;
  yoke(L4, J4, 46, 26, 30, "j4");
  B(L4, "joint", "j4_cable_bracket", [4, 44, 14], [-29, 0, 32]);
  for (const y of [-14, 14]) screw(L4, [-31, y, 29], V(-1, 0, 0), 1.0, "j4_cable_bracket_screw");
  for (const y of [-16, 16]) {
    C(L4, "carbon", "fore_tube", 8, 66, [0, y, 79], "z", 36);
    for (const z of [46, 100]) {
      add(L4, T(ringG(7.9, 11, z, z + 6, 28, 0.5), [0, y, 0]), "metal", "fore_tube_collar");
      B(L4, "gloss", "fore_tube_collar_slit", [3, 0.8, 6.2], [-10, y, z + 3]);
      screw(L4, [-11, y + 2.4, z + 3], V(0, 1, 0), 0.9, "fore_collar_screw");
    }
    add(L4, T(ringG(7.9, 10.5, 60, 66, 28, 0.5), [0, y, 0]), "metal", "fore_mid_clamp");
    add(L4, T(ringG(7.9, 10.5, 90, 96, 28, 0.5), [0, y, 0]), "metal", "fore_mid_clamp");
  }
  plate(L4, "metal", "fore_top_block", rrect(-26, -30, 26, 30, 6), { plane: "xy", c0: 106, t: 10, bevel: 0.8 });
  for (const z of [63, 93]) B(L4, "metal", "fore_bridge", [12, 44, 5], [8, 0, z]);
  plate(L4, "joint", "fore_bracket", rrect(-24, 56, 24, 100, 4), { plane: "yz", c0: 12, t: 2.5, bevel: 0.4 });
  {
    const F = pcb(L4, [18.5, 0, 78], V(0, 1, 0), X, 44, 40, 31, { leds: 3, standoff: 4, connectors: 2, big: false, name: "j5_driver" });
    heatsink(F, 0, 3, 24, 22, 7, 9);
    fan(F, [0, 3, 10.6], "z", 24, 14, "fore_fan");
  }
  loom(L4, "carbon", "fore_loom", [[-28, 0, 38], [-16, 0, 48], [-13, 0, 80], [-13, 0, 104], [-10, 0, 116]], 3.2);
  for (const z of [62, 92]) {
    add(L4, T(ringG(3.4, 4.4, -2.4, 2.4, 16, 0.3), [-13, 0, z]), "metal", "fore_pclip");
    B(L4, "metal", "fore_pclip_tab", [7, 26, 3], [-11, 0, z + 4]);
  }
  rollLower(L4, 116, 136, 30, 4, "j5");

  /* ----- link5: forearm upper / wrist fork ----- */
  const L5 = rig.link5, J6 = { R: 27, Lm: 31, band: 11, t: 5 };
  rollUpper(L5, 30, 28, 4, "j5");
  plate(L5, "joint", "wrist_base", rrect(-30, -36.3, 30, 36.3, 6), { plane: "xy", c0: 28, t: 10, bevel: 0.8 });
  forkPlates(L5, 134, J6, 28, 30, [rrect(-21, 44, 21, 94, 4)], "j6", "joint");
  spacers(L5, [[22, 50], [-22, 50], [-22, 92], [22, 92]], J6.Lm + 0.3, 2.6, "j6");
  pitchJoint(L5, rig.link6, 5, J6, "j6");
  plate(L5, "plate", "wrist_cover", rrect(-36.3, 42, 36.3, 84, 5), { plane: "yz", c0: 30.2, t: 2.4, bevel: 0.8, holes: [circle(14, 63, 5, 24)] });
  for (const z of [47, 79]) for (const s of [1, -1]) screw(L5, [32.6, s * 33, z], X, 1.1, "wrist_cover_screw");
  plate(L5, "joint", "wrist_board_bracket", rrect(-31.3, 56, 31.3, 88, 3), { plane: "yz", c0: -6, t: 2.4, bevel: 0.4 });
  pcb(L5, [-10.2, 0, 72], V(0, 1, 0), V(-1, 0, 0), 40, 28, 41, { leds: 2, standoff: 4, connectors: 2, name: "j6_driver" });
  B(L5, "joint", "j6_cable_clamp", [7, 24, 7], [-26, 0, 88]);

  /* ----- link6: wrist yoke, J7 lower ----- */
  const L6 = rig.link6;
  yoke(L6, J6, 36, 20, 26, "j6");
  B(L6, "joint", "j6_cable_bracket", [4, 34, 12], [-23, 0, 25]);
  {   // J7 lower: flange, posts, stator, encoder
    add(L6, ringG(6, 28, 36, 38.5, 64, 0.5), "metal", "j7_flange");
    screwCircle(L6, 8, 26, V(0, 0, 38.5), Z, 1.1, "j7_flange_screw");
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; k.standoff(L6, [Math.cos(a) * 22.5, Math.sin(a) * 22.5, 38.5], [Math.cos(a) * 22.5, Math.sin(a) * 22.5, 55], 1.6, "steel", "j7_post"); }
    stator(L6, 39, 50, 9, 19, 12, "j7");
    encoder(L6, 51.4, 19.5, (t, S) => S.q[6] * RATIO, "j7", 1.2);
    add(L6, gearG(20, 24.6, 25.2, 64, 55, 59), "metal", "j7_spline_ribs");
    add(L6, ringG(6, 25, 59, 61.4, 56, 0.5), "metal", "j7_top_ring");
    add(L6, ringG(6, 24, 61.4, 62, 48, 0.1), "joint", "j7_seam");
  }

  /* ----- link7: output flange, force-torque sensor, hand adapter ----- */
  const L7 = rig.link7;
  add(L7, ringG(6, 25, 0.4, 6, 64, 0.6), "metal", "j7_output");
  screwCircle(L7, 8, 22.5, V(0, 0, 6), Z, 1.0, "j7_output_screw");
  add(L7, discG(23, 6, 21, 64, 0.6), "metal", "ft_sensor");
  add(L7, discG(23.25, 13.1, 13.9, 64, 0.05), "joint", "ft_groove");
  screwCircle(L7, 6, 19.5, V(0, 0, 21), Z, 1.0, "ft_screw", 0.5);
  C(L7, "joint", "ft_connector", 3.2, 6, [-25.5, 0, 13.5], "x", 16);
  C(L7, "steel", "ft_connector_nut", 3.9, 2.4, [-27.6, 0, 13.5], "x", 6);
  wire(L7, "rubber", "ft_cable", [[-28.5, 0, 13.5], [-32, 0, 11], [-33.5, 0, 4], [-33.5, 0, -6]], 1.7, 8);
  add(L7, discG(24, 21, 27.6, 64, 0.6), "joint", "hand_adapter");
  for (const a of [0.3, 0.3 + Math.PI]) C(L7, "steel", "hand_dowel", 1.2, 1.2, [Math.cos(a) * 20, Math.sin(a) * 20, 27.8], "z", 10);

  /* ----- moving cables across the pitch joints ----- */
  const rb = (aOwner, aPos, bOwner, bPos, width, name) => {
    const A = anchor(K, aOwner, ...aPos), Bn = anchor(K, bOwner, ...bPos);
    cables.push(ribbon(K, base, A, Bn, { tA: V(0, 0, 1), tB: V(0, 0, -1), wA: Y, wB: Y, width, thick: 0.5, stiffness: 0.42, role: "gloss", name }));
  };
  rb(L1, [-45.2, 0, 64], L2, [-40.4, 0, 30], 22, "j2_ribbon");
  rb(L3, [-37.2, 0, 176], L4, [-31.4, 0, 26], 20, "j4_ribbon");
  rb(L5, [-29.7, 0, 91.5], L6, [-25.4, 0, 20], 16, "j6_ribbon");
  const fc = (aOwner, aPos, bOwner, bPos, r, name, role = "rubber") => {
    const A = anchor(K, aOwner, ...aPos), Bn = anchor(K, bOwner, ...bPos);
    cables.push(flexCable(K, base, A, Bn, { tA: V(0, 0, 1), tB: V(0, 0, -1), radius: r, sag: 0.008, role, name, segments: 26, radial: 8, stiffness: 0.42 }));
  };
  fc(L1, [-44, 24, 64], L2, [-42, 22, 30], 3, "j2_loom", "carbon");
  fc(L3, [-36, -22, 178], L4, [-31.5, -16, 26], 3.2, "j4_loom", "carbon");
  fc(L5, [-27, 12, 90], L6, [-25.5, 11, 20], 2.2, "j6_loom");
}

/* ---------- Hand ---------- */
const W = [0.95, 0.76, 0.58];   // half-width of each finger bone, x finger radius (each nests in the one before)
const D = [0.92, 0.84, 0.76];   // depth radius at each bone's base hinge, x finger radius
const hwAt = (y) => 34 + 0.12 * y;
const trap = (inset, y0, y1, r) => [[-hwAt(y0) + inset + r, y0 + r, r], [hwAt(y0) - inset - r, y0 + r, r], [hwAt(y1) - inset - r, y1 - r, r], [-hwAt(y1) + inset + r, y1 - r, r]];

export function palm(K, palm) {
  const { MM } = K;
  const { add, T, plate, screw, orient, ringG, B, C } = k;
  // wrist flange
  add(palm, T(orient(k.discG(25, 0, 5, 56, 0.6), "y")), "joint", "wrist_flange");
  add(palm, T(orient(ringG(12, 26, 5, 9, 56, 0.6), "y")), "metal", "wrist_ring");
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.26; screw(palm, [Math.cos(a) * 20.5, 9, Math.sin(a) * 9.5], Y, 1.0, "wrist_screw"); }
  // grip-side chassis plate with a rubber palm pad
  plate(palm, "metal", "palm_grip", trap(1.5, 6, 86, 6), { plane: "xy", c0: -12.5, t: 3, bevel: 0.6 });
  plate(palm, "pad", "palm_pad", [[-22, 36, 7], [22, 36, 7], [-26, 74, 8], [26, 74, 8]], { plane: "xy", c0: -14.6, t: 2.4, bevel: 0.9 });
  plate(palm, "pad", "palm_pad_heel", [[-6, 18, 6], [20, 18, 6], [24, 28, 6]], { plane: "xy", c0: -14.4, t: 2.2, bevel: 0.8 });
  for (const [x, y] of [[-28, 14], [28, 14], [-36, 82], [36, 82], [0, 24]]) screw(palm, [x, y, -12.5], V(0, 0, -1), 1.2, "palm_grip_screw");
  // side walls (the index side stops short to clear the thumb)
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.rotation.z = -s * Math.atan(0.12);
    palm.add(g);
    const xo = 34 * Math.cos(Math.atan(0.12)), y0 = s > 0 ? 10 : 46, y1 = 84;
    plate(g, "metal", `palm_wall${s > 0 ? "R" : "L"}`, rrect(y0, -9.5, y1, 9.5, 3), { plane: "yz", c0: s > 0 ? xo - 3 : -xo, t: 3, bevel: 0.5, pockets: [rrect(y0 + 7, -5.5, y1 - 7, 5.5, 2.5)], depth: 1.1, face: s });
    for (const y of [y0 + 3.5, y1 - 3.5]) for (const z of [-6.5, 6.5]) screw(g, [s * xo, y, z], V(s, 0, 0), 1.0, "palm_wall_screw");
  }
  // back: a half-fitted carbon cover over the wrist end, a bridge at the knuckles, open between
  plate(palm, "carbon", "palm_back_cover", trap(2, 6, 46, 5), { plane: "xy", c0: 9.5, t: 2.2, bevel: 0.5 });
  for (const [x, y] of [[-30, 11], [30, 11], [-32, 41], [32, 41]]) screw(palm, [x, y, 11.7], Z, 1.0, "palm_back_screw");
  plate(palm, "metal", "palm_bridge", trap(1.5, 74, 82, 2), { plane: "xy", c0: 9.5, t: 3, bevel: 0.5 });
  for (const x of [-36, -12, 12, 36]) screw(palm, [x, 78, 12.5], Z, 1.0, "palm_bridge_screw");
  pcb(palm, [3, 27, 11.7], X, Z, 34, 20, 52, { leds: 2, standoff: 0, connectors: 2, big: true, name: "hand_board" });
  // thin flex cables from the board to the motors
  for (const x of [-20, -6, 8, 22]) B(palm, "gloss", "hand_flex", [5, 12, 0.3], [x, 49, 9.2], [0.35, 0, 0]);
  // thumb gear motor on the palm side, under the thumb
  C(palm, "steel", "thumb_motor", 4.5, 16, [-22, 26, -4.5], "y", 18);
  C(palm, "metal", "thumb_gearhead", 4.3, 7, [-22, 37.5, -4.5], "y", 18);
  C(palm, "joint", "thumb_motor_cap", 4.6, 3.5, [-22, 16.3, -4.5], "y", 18);
  void MM;
}

// Knuckle: a clevis standing out of the palm, the finger's worm gearmotor behind it.
export function knuckle(K, root, f, name) {
  const { add, plate, B, C, screw, wire, helixG } = k;
  const r = f.d / 2, w0 = r * W[0], a0 = r * D[0], t = 1.3, kr = w0 + 0.2 + t;
  for (const s of [1, -1]) plate(root, "metal", `${name}_clevis${s > 0 ? "R" : "L"}`, [[0, 0, a0 + 0.8], [-14, -a0 + 2, 2], [-14, a0 - 2, 2]], { plane: "yz", c0: s > 0 ? w0 + 0.2 : -kr, t, bevel: 0.3 });
  B(root, "joint", `${name}_clevis_spacer`, [2 * w0 + 0.4, 5, a0], [0, -11.5, -a0 / 2 + 0.5]);
  for (const s of [1, -1]) screw(root, [s * kr, -11.5, -2], V(s, 0, 0), 0.9, `${name}_clevis_screw`);
  // worm gearmotor (motor, gearhead, worm meshing with the wheel on the first bone)
  const mz = 5.6;
  const g = spinner(root, [0, -6, mz], "y", (tt, S) => THREE.MathUtils.degToRad(S.handNow[`${name}_1`] ?? 0) * 7);
  C(g, "steel", `${name}_worm_core`, 1.4, 13, [0, 0, 0], "z", 10);
  add(g, helixG(1.85, 11, 5, 0.55), "steel", `${name}_worm`);
  C(root, "metal", `${name}_gearhead`, 4.2, 9, [0, -17.5, mz], "y", 20);
  for (const y of [-15, -20]) C(root, "joint", `${name}_gearhead_band`, 4.35, 0.6, [0, y, mz], "y", 20);
  C(root, "steel", `${name}_motor`, 4.5, 17, [0, -30.5, mz], "y", 20);
  C(root, "joint", `${name}_motor_cap`, 4.6, 3.6, [0, -40.8, mz], "y", 20);
  for (const s of [1, -1]) {
    B(root, "titanium", `${name}_motor_lug`, [0.8, 1.6, 1.6], [s * 1.6, -43.2, mz]);
    wire(root, s > 0 ? "rubber" : "titanium", `${name}_motor_wire`, [[s * 1.6, -43.6, mz], [s * 2, -46.5, mz + 1], [s * 1.2, -50, mz + 2.5]], 0.42);
  }
  B(root, "joint", `${name}_motor_saddle`, [8, 4, 10.6], [0, -30, -4.2]);
  B(root, "joint", `${name}_gear_saddle`, [7, 3, 9.8], [0, -15, -4.6]);
  // pivot pin for the linkage rod on this side of the knuckle
  const xA = kr + 0.7, cA = a0 * 0.45;
  for (const s of [1, -1]) {
    C(root, "steel", `${name}_rodpin`, 0.75, xA + 0.45 - kr, [s * (kr + (xA + 0.45 - kr) / 2), -5, cA], "x", 10);
    C(root, "steel", `${name}_rodpin_head`, 1.15, 0.5, [s * (xA + 0.7), -5, cA], "x", 12);
  }
  return kr;
}

// Thumb root: a turret on the palm side whose ring gear turns as the thumb swings.
export function thumbRoot(K, root) {
  const { add, C, screwCircle, gearG, discG } = k;
  const r = K.THUMB.d / 2, w0 = r * W[0], a0 = r * D[0];
  add(root, discG(12.5, -a0 - 5.5, -a0 - 1.2, 48, 0.6), "joint", "thumb_turret");
  const g = spinner(root, [0, 0, 0], "z", (t, S) => -THREE.MathUtils.degToRad(S.handNow.thumb_0 ?? 0));
  add(g, gearG(6, 11.4, 12.2, 36, -a0 - 1.2, -a0 + 0.8), "metal", "thumb_ring_gear");
  k.screwCircle(g, 6, 8.5, V(0, 0, -a0 + 0.8), Z, 0.8, "thumb_ring_screw");
  C(root, "steel", "thumb_pinion", 3, 4, [0, -15, -a0 - 0.2], "z", 12);
  void screwCircle;
  return w0 + 0.3;
}

export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM } = K;
  const { plate, C, screw, B, boxG } = k;
  const finger = name.split("_")[0], thumb = finger === "thumb";
  const r = d / 2, w = r * W[i], a = r * D[i], b = a * 0.92, t = 1.1;
  const L = tip ? length - b : length;
  // side plates with a lightening slot, a dark core between them
  const sr = Math.min(2, a * 0.28);
  const slot = L > 16 ? [[a * 0.9 + 1.2, 0, sr], [L - b * 0.9 - 1.2, 0, sr]] : null;
  for (const s of [1, -1]) plate(g, "metal", `${name}_plate${s > 0 ? "R" : "L"}`, [[0, 0, a], [L, 0, b]], { plane: "yz", c0: s > 0 ? w - t : -w, t, holes: slot ? [slot] : [], bevel: 0.25 });
  const c0 = i === 0 ? a + 1.6 : 0, cEnd = tip ? L : Math.max(c0 + 1, L - b);
  plate(g, "joint", `${name}_core`, [[c0, 0, i === 0 ? a - 1.6 : a - 0.8], [cEnd, 0, b - 0.8]], { plane: "yz", c0: -(w - t) + 0.05, t: 2 * (w - t) - 0.1, bevel: 0.3 });
  // hinge pin with screw heads
  C(g, "steel", `${name}_pin`, a * 0.3, 2 * prevR + 0.6, [0, 0, 0], "x", 14);
  for (const s of [1, -1]) screw(g, [s * (prevR + 0.3), 0, 0], V(s, 0, 0), a * 0.38, `${name}_pinhead`);
  // worm wheel on the first bone, meshing with the worm in the palm
  if (i === 0 && !thumb) k.add(g, k.orient(k.gearG(1.4, 2.7, 3.35, 14, -1.3, 1.3), "x"), "metal", `${name}_worm_wheel`);
  // rubber grip pads, white printed covers on two fingers only (half fitted)
  if (!tip) {
    plate(g, "pad", `${name}_pad`, [[-(w - t - 0.3) + 1.4, a + 1.2, 1.4], [(w - t - 0.3) - 1.4, a + 1.2, 1.4], [-(w - t - 0.3) + 1.4, L - b - 0.5, 1.4], [(w - t - 0.3) - 1.4, L - b - 0.5, 1.4]], { plane: "xy", c0: -(b + 0.2) - 0.4, t: 1.6, bevel: 0.5 });
    if (i === 0 && (finger === "index" || finger === "middle" || thumb)) plate(g, "plate", `${name}_cover`, rrect(-(w + 0.2), a + 1.5, w + 0.2, L - b - 0.5, 2), { plane: "xy", c0: a - 1.4, t: 2, bevel: 0.6 });
  }
  // linkage rods and their pivot pins (four-bar coupling of the joints)
  const r0 = r * W[0], kr = r0 + 1.5, xA = kr + 0.7, xB = r0 + 0.7, cA = r * D[0] * 0.45, cB = r * D[1] * 0.4;
  const pin = (x, y, z) => {
    for (const s of [1, -1]) {
      C(g, "steel", `${name}_rodpin`, 0.75, x + 0.45 - w + 0.1, [s * ((x + 0.45 + w - 0.1) / 2), y, z], "x", 10);
      C(g, "steel", `${name}_rodpin_head`, 1.1, 0.5, [s * (x + 0.7), y, z], "x", 12);
    }
  };
  const rodMesh = () => [1, -1].map((s) => ({ s, m: KK.livePart(g, boxG(0.9, 1, 1.8), "joint", `${name}_rod`) }));
  if (i === 0) {
    pin(xB, L - 3.5, -cB);
    if (!thumb) rods.push({ owner: `${finger}_1`, P: `${finger}_0`, Q: `${finger}_2`, pA: [xA, -5, cA], pB: [xA, 3.5, cA], meshes: rodMesh() });
  }
  if (i === 1) {
    if (!thumb) pin(xA, 3.5, cA);
    const L0 = g.position.y / MM;
    rods.push({ owner: `${finger}_2`, P: `${finger}_1`, Q: `${finger}_3`, pA: [xB, L0 - 3.5, -cB], pB: [xB, 3.5, -cB], meshes: rodMesh() });
  }
  if (tip) {
    pin(xB, 3.5, -cB);
    k.add(g, new THREE.SphereGeometry(MM, 24, 14).scale(w, b, b).translate(0, L * MM, 0), "metal", `${name}_cap`);
    // soft pad with a tactile flex circuit and gold taxels
    const py = L * 0.5 + b * 0.25, ry = L * 0.5 + b * 0.55, rx = w * 0.82, rz = b * 0.55, pz = -b * 0.48;
    k.add(g, new THREE.SphereGeometry(MM, 24, 14).scale(rx, ry, rz).translate(0, py * MM, pz * MM), "pad", `${name}_tippad`);
    k.add(g, new THREE.SphereGeometry(MM, 20, 10, Math.PI * 1.5 - 0.62, 1.24, 0.5, 2.2).scale(rx * 1.04, ry * 1.04, rz * 1.04).translate(0, py * MM, pz * MM), "gloss", `${name}_tactile_flex`);
    for (let u = 0; u < 4; u++) for (const v of [-0.22, 0.22]) {
      const th = 0.85 + u * 0.42, ph = Math.PI * 1.5 + v;
      const n = V(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
      const p = V(n.x * rx * 1.06, n.y * ry * 1.06 + py, n.z * rz * 1.06 + pz);
      const nn = V(n.x / rx, n.y / ry, n.z / rz).normalize();
      const geo = boxG(1.1, 1.1, 0.25).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, nn)).translate(p.x * MM, p.y * MM, p.z * MM);
      k.add(g, geo, "titanium", `${name}_taxel`);
    }
    B(g, "gloss", `${name}_flex_tail`, [w * 0.9, L * 0.7, 0.3], [0, L * 0.4, b * 0.98]);
    if (finger === "index") {
      const F = k.basisFrame(g, [0, L * 0.45, b * 0.98 + 0.15], X, Z);
      led(F, 0, 0, 0, "glow", 1.4, 0.5, 0.3, `${name}_tip_led`);
    }
    const o = new THREE.Object3D();
    o.position.y = L * MM;
    o.userData.r = b;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => (d / 2) * W[i];

/* ---------- Animation ---------- */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();
export function update(t, dt, S) {
  for (const s of spinners) s.g.rotation.z = s.f(t, S);
  for (const b of blinkers) b.m.visible = ((t * b.rate + b.phase) % 1) < b.duty;
  for (const rd of rods) {
    const o = S.rig[rd.owner], Q = S.rig[rd.Q];
    if (!o || !Q) continue;
    o.updateMatrix(); Q.updateMatrix();
    _inv.copy(o.matrix).invert();
    for (const { s, m } of rd.meshes) {
      _a.set(s * rd.pA[0] * KK.MM, rd.pA[1] * KK.MM, rd.pA[2] * KK.MM).applyMatrix4(_inv);   // P is o's parent
      _b.set(s * rd.pB[0] * KK.MM, rd.pB[1] * KK.MM, rd.pB[2] * KK.MM).applyMatrix4(Q.matrix);
      _d.subVectors(_b, _a);
      const len = _d.length();
      m.position.addVectors(_a, _b).multiplyScalar(0.5);
      m.quaternion.copy(_q.setFromUnitVectors(Y, _d.multiplyScalar(1 / len)));
      m.scale.set(1, len / KK.MM, 1);
    }
  }
  for (const c of cables) c.update();
}
