// "Classic" design: the original block-out shapes (tapered tubes, axle joints, pill fingers).
// A design builds the visible parts onto the shared rig; joints, finger skeleton and poses stay common.
import * as THREE from "three";

export const label = "Classic";

export function arm(K) {
  const { MM, RING, SEAM_DRAW, MOUNT_FACE, rig, base, part, turn, tubeProfile, alongY, radiusAt, splitShell, seamCore, roundedShape, rect, slab } = K;
  // A pitch joint is a real actuator laid across the arm. The inner link holds the side caps: on the +Y
  // side the cap steps out into a deeper drum, the motor housing; on the -Y side a flush cap with a dished
  // face, the brake and encoder side. Each face carries an inlaid disc in the trim finish. The outer link
  // holds the graphite hub, slightly recessed, and a lit ring sits in each seam.
  function pitchJoint(inner, outer, d, width, name) {
    const r = d / 2, mid = width * 0.5, at = outer.position.z;
    const place = (g) => alongY(g).translate(0, 0, at);
    part(outer, alongY(turn(tubeProfile(-mid / 2, mid / 2, r - 2.5, r - 2.5, 1.5, 1.5))), "joint", `${name}_hub`);
    const a = mid / 2 + RING, b = width / 2;
    const dished = (u0, u1, R, flip, label) => {
      const face = R * 0.72;
      part(inner, place(turn([[0, u0], [R, u0, 1.5], [R, u1, 4], [face + SEAM_DRAW, u1, 1], [face + SEAM_DRAW, u1 - 1.6, 0.4], [0, u1 - 1.6]], { flip })), "shell", `${name}_${label}`);
      part(inner, place(turn([[0, u1 - 2.4], [face, u1 - 2.4, 0.4], [face, u1 - 0.5, 0.8], [0, u1 - 0.5]], { flip })), "trim", `${name}_${label}_disc`);
    };
    // brake side (-Y): flush, dished
    dished(a, b, r, true, "capL");
    part(inner, place(turn(tubeProfile(mid / 2, mid / 2 + RING, r - 3, r - 3, 0.2, 0.2), { flip: true })), "ring", `${name}_ringL`);
    // motor side (+Y): cap, seam, then a deeper drum
    const drum = d * 0.17, rm = r * 0.86;
    part(inner, place(turn([[0, a], [r, a, 1.5], [r, b, 1.5], [0, b]])), "shell", `${name}_capR`);
    part(inner, place(turn(tubeProfile(b - 2, b + 2, rm - 1.6, rm - 1.6, 0.4, 0.4), { seg: 48 })), "joint", `${name}_drumseam`);
    dished(b + SEAM_DRAW, b + drum, rm, false, "motor");
    part(inner, place(turn(tubeProfile(mid / 2, mid / 2 + RING, r - 3, r - 3, 0.2, 0.2))), "ring", `${name}_ringR`);
  }
  // A roll joint: a soft rubber cover band with the lit ring running round its middle.
  function rollJoint(owner, z, r, name) {
    part(owner, turn(tubeProfile(z - 3.2, z + 3.2, r - 0.8, r - 0.8, 1, 1)), "rubber", `${name}_band`);
    part(owner, turn(tubeProfile(z - RING / 2, z + RING / 2, r - 0.4, r - 0.4, 0.2, 0.2)), "ring", `${name}_ring`);
  }
  const tuck = (d) => d * 0.4;   // how far a tube runs into an axle of diameter d

  // Base: rubber foot, plinth with a soft chamfer, an inlaid top disc, and at the back a connector with
  // its cable running off across the floor, the way a real arm is powered.
  part(base, turn([[0, 0], [80, 0, 1.5], [80, 4.4, 1.5], [0, 4.4]]), "rubber", "foot");
  part(base, turn([[0, 5], [85, 5, 3], [85, 28, 8], [76, 44.6, 4], [0, 44.6]]), "shell", "plinth");
  part(base, turn([[0, 43.4], [66, 43.4, 0.4], [66, 45.2, 0.8], [0, 45.2]]), "trim", "plinth_disc");
  {
    // shapes are drawn in (z, y) and extruded out along -X
    const outward = (g, x) => g.rotateY(-Math.PI / 2).translate(x * MM, 0, 0);
    part(base, outward(slab(roundedShape(rect(9, -19, 28, 19), 5), 0, 3.2, 1), -84.2), "trim", "connector_bezel");
    part(base, outward(slab(roundedShape(rect(12, -16, 25, 16), 4), 0, 9, 1.6), -84), "joint", "connector");
    part(base, outward(slab(roundedShape(rect(13.5, -6, 23.5, 6), 3), 0, 4, 1), -92), "rubber", "cable_boot");
    // the cable drops into a grommet in the bench just behind the base
    const path = new THREE.CatmullRomCurve3([[-95, 0, 18.5], [-110, 1, 17.5], [-128, 6, 13], [-148, 14, 6.6], [-176, 26, 5.6], [-204, 38, 3], [-214, 43, -8]].map(([x, y, z]) => new THREE.Vector3(x * MM, y * MM, z * MM)));
    part(base, new THREE.TubeGeometry(path, 60, 5.4 * MM, 12), "rubber", "cable");
    part(base, turn([[0, 0], [15, 0, 0.6], [15, 1.4, 0.8], [8.5, 1.4, 0.5], [8.5, 0.2], [0, 0.2]]).translate(-212 * MM, 42 * MM, 0), "joint", "grommet");
  }
  // link1: shoulder column, flared foot collar, then the shoulder actuator.
  rollJoint(rig.link1, 3.4, 56, "j1");
  part(rig.link1, turn([[0, 6.6], [58, 6.6, 1.5], [56, 14, 0], [54.5, 22, 1.5], [0, 22]]), "trim", "column_collar");
  seamCore(rig.link1, 22.5, 52.5, "column");
  part(rig.link1, turn(tubeProfile(23, 164 - 46 - tuck(104), 52.5, 52, 1.5, 12)), "shell", "column");
  pitchJoint(rig.link1, rig.link2, 104, 112, "j2");
  // link2 / link3: upper arm, 300 long, 92 -> 68, the main visual line. A collar at the shoulder, the new
  // upper-arm roll joint, then the long shell with parting lines down each side and a slight swell.
  const ua = (z2) => radiusAt(z2, 0, 300, 46, 34);   // radius by distance from the shoulder axis
  part(rig.link2, turn(tubeProfile(tuck(104), 66.4, ua(tuck(104)) + 0.4, ua(66.4), 12, 1.5)), "trim", "upper_collar_low");
  rollJoint(rig.link3, 0, ua(70), "j3");
  const U = 70;   // link3 starts 70 mm up the upper arm
  splitShell(rig.link3, "upper_arm", 3.6, 252 - U, ua(73.6), ua(252), { bulge: 1.6 });
  seamCore(rig.link3, 252.5 - U, ua(252), "upper_high");
  part(rig.link3, turn(tubeProfile(253 - U, 300 - tuck(78) - U, ua(253), ua(300 - tuck(78)), 1.5, 12)), "trim", "upper_collar_high");
  pitchJoint(rig.link3, rig.link4, 78, 86, "j4");   // elbow, the cleanest joint
  // link4 / link5: forearm 270 long, 66 -> 50, split by the roll joint at 600.
  const fr = (z) => radiusAt(z, 464, 734, 33, 25);   // absolute z
  part(rig.link4, turn(tubeProfile(tuck(78), 54, fr(464 + tuck(78)), fr(518), 12, 1.5)), "trim", "forearm_collar_low");
  seamCore(rig.link4, 54.5, fr(518.5), "forearm_low");
  splitShell(rig.link4, "forearm_lower", 55, 600 - 464 - 3.6, fr(519), fr(596.4), { bulge: 0.6 });
  rollJoint(rig.link5, 0, fr(600), "j5");
  splitShell(rig.link5, "forearm_upper", 3.6, 92, fr(603.6), fr(692), { bulge: 0.6 });
  seamCore(rig.link5, 92.5, fr(692.5), "forearm_high");
  part(rig.link5, turn(tubeProfile(93, 734 - 600 - tuck(56), fr(693), fr(734 - tuck(56)), 1.5, 12)), "trim", "forearm_collar_high");
  pitchJoint(rig.link5, rig.link6, 56, 62, "j6");
  // link6: compact wrist with the freedrive buttons a person presses to guide the arm by hand, and a
  // small status light between them.
  part(rig.link6, turn(tubeProfile(tuck(56), 54.4, 27, 26.6, 12, 1.5)), "shell", "wrist");
  {
    const onBack = (g) => g.rotateY(-Math.PI / 2);   // extrude out of the -X face
    part(rig.link6, onBack(slab(roundedShape(rect(27, -9, 51, 9), 6), 24, 27.6, 1)), "trim", "button_bezel");
    for (const [z0, z1, label] of [[29, 37, "a"], [41, 49, "b"]]) part(rig.link6, onBack(slab(roundedShape(rect(z0, -6, z1, 6), 3.5), 26.4, 29, 1)), "rubber", `button_${label}`);
    part(rig.link6, new THREE.SphereGeometry(1.3 * MM, 16, 10).translate(-27.4 * MM, 0, 39 * MM), "ring", "status_light");
  }
  // link7: wrist roll, mount flange, a rubber bellows over the wrist interface, and a wrist camera on the
  // palm side looking down the fingers (a colour lens and a smaller depth lens).
  rollJoint(rig.link7, 0, 26, "j7");
  part(rig.link7, turn([[0, 3.6], [24.6, 3.6, 1.5], [24, 12, 0], [24, 13.6, 1.5], [0, 13.6]]), "trim", "mount_flange");
  {
    const pts = [[0, 14.2], [23, 14.2, 0.6]];
    for (let i = 0; i < 4; i++) { const z = 15.4 + i * 2.6; pts.push([25.4, z, 1.1], [23, z + 1.3, 0.9]); }
    pts.push([23, 25.6, 0.6], [0, 25.6]);
    part(rig.link7, turn(pts), "rubber", "bellows");
  }
  part(rig.link7, turn([[0, 25.4], [21, 25.4, 0.4], [21, MOUNT_FACE - 796, 0.6], [0, MOUNT_FACE - 796]]), "joint", "interface");
  {
    part(rig.link7, slab(roundedShape(rect(26, -14, 40, 14), 5), 4, 30, 3), "shell", "camera_body");
    part(rig.link7, turn([[0, 29], [7.4, 29, 0.4], [7.4, 31.2, 0.8], [0, 31.2]]).translate(33 * MM, -5 * MM, 0), "trim", "camera_bezel");
    part(rig.link7, turn([[0, 29.5], [5.6, 29.5, 0.3], [5.6, 31.6, 1.6], [0, 31.6]]).translate(33 * MM, -5 * MM, 0), "glass", "camera_lens");
    part(rig.link7, turn([[0, 29.5], [3.4, 29.5, 0.3], [3.4, 31.2, 1], [0, 31.2]]).translate(33 * MM, 7 * MM, 0), "glass", "depth_lens");
  }
}

export function palm(K, palm) {
  const { MM, deg, SEAM_DRAW, FINGERS, THUMB, PALM, part, roundedShape, rect, slab } = K;
  // Palm outline tapers from the wrist (68 wide) to the knuckle line (92 wide).
  const trapezoid = (inset, y0 = 0, y1 = PALM.length) => {
    const hw = (y) => 34 + (12 / PALM.length) * y - inset;
    return [[-hw(y0 + inset), y0 + inset], [hw(y0 + inset), y0 + inset], [hw(y1 - inset), y1 - inset], [-hw(y1 - inset), y1 - inset]];
  };
  const t = PALM.thick / 2;
  // graphite core, then back and front shells parted round the edge at mid-thickness
  part(palm, slab(roundedShape(trapezoid(4.6), 13), -t + 3, t - 3, 1), "joint", "palm_core");
  const ring = roundedShape(trapezoid(9), 9);   // the single shallow inset on the back
  part(palm, slab(roundedShape(trapezoid(3.6), 13), SEAM_DRAW / 2, t, 3.2, [ring]), "finger", "palm_back");
  part(palm, slab(roundedShape(trapezoid(13.4), 8), SEAM_DRAW / 2, t - 1, 0.8), "plate", "palm_inset");
  part(palm, slab(roundedShape(trapezoid(3.6), 13), -t, -SEAM_DRAW / 2, 3.2), "finger", "palm_front");
  // palm pads, split the way a hand's are: the heel on the little-finger side, and one under each knuckle
  part(palm, slab(roundedShape([[4, 8], [30, 8], [36, 62], [8, 62]], 10), -t - 1.4, -t + 1, 1), "pad", "pad_heel");
  for (const [name, f] of Object.entries(FINGERS)) part(palm, slab(roundedShape(rect(f.at[0] - f.d * 0.42, 70, f.at[0] + f.d * 0.42, 86), 5), -t - 1.4, -t + 1, 0.9), "pad", `pad_${name}`);
  // thumb mound: a soft housing carrying the thumb actuator, with a rubber pad on its face
  const mound = (s, z) => new THREE.SphereGeometry(MM, 40, 24).scale(...s).rotateZ(deg(THUMB.out)).translate((THUMB.at[0] + 8) * MM, (THUMB.at[1] + 10) * MM, z * MM);
  part(palm, mound([15, 27, 11.5], -6), "finger", "thumb_mound");
  part(palm, mound([10, 19, 3.2], -16.4), "pad", "pad_thumb");
}

// Knuckle socket at a finger root; returns its radius (the first segment's hinge disc spans it).
export function knuckle(K, root, f, name) {
  const { MM, part } = K;
  const kr = f.d / 2 + 1.5;
  part(root, new THREE.SphereGeometry(kr * MM, 32, 20), "ball", `${name}_knuckle`);   // knuckle socket
  part(root, new THREE.SphereGeometry((kr + 1.4) * MM, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), "finger", `${name}_knuckle_cap`);   // cover over the back
  return kr;
}

export function thumbRoot(K, root) {
  const { MM, THUMB, part } = K;
  const tr = THUMB.d / 2 + 1.5;
  part(root, new THREE.SphereGeometry(tr * MM, 32, 20), "ball", "thumb_root");
  return tr;
}

// One finger segment: a tapered aluminium pill whose rounded ends are centred on its two hinges, so the
// next one nests inside it like a knuckle and no gap opens at any bend. A ceramic plate covers its back,
// a rubber pad runs along the palm side, and a pin in a graphite disc shows on each side of the hinge.
const SEG_R = [[1, 0.94], [0.86, 0.84], [0.78, 0.74]];   // radius at each end, x finger radius
export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, V2, part } = K;
  const r = d / 2, r0 = r * SEG_R[i][0], r1 = r * SEG_R[i][1];
  const Lc = tip ? length - r1 : length;   // the fingertip's dome ends exactly at the finger length
  const prof = [];
  for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + (Math.PI / 2) * (k / 10); prof.push(V2(r0 * Math.cos(a), r0 * Math.sin(a))); }
  for (let k = 0; k <= 10; k++) { const a = (Math.PI / 2) * (k / 10); prof.push(V2(r1 * Math.cos(a), Lc + r1 * Math.sin(a))); }
  prof[0].x = prof[prof.length - 1].x = 0;
  part(g, new THREE.LatheGeometry(prof.map((p) => p.multiplyScalar(MM)), 32), "finger", `${name}_pill`);
  const w = 2 * prevR + 0.8;
  part(g, new THREE.CylinderGeometry(r * 0.36 * MM, r * 0.36 * MM, w * MM, 24).rotateZ(Math.PI / 2), "ball", `${name}_disc`);
  part(g, new THREE.CylinderGeometry(r * 0.15 * MM, r * 0.15 * MM, (w + 0.8) * MM, 16).rotateZ(Math.PI / 2), "pin", `${name}_pin`);
  // back plate: a ceramic cover over the back of the segment, slightly proud, edges softened
  const rAt = (y) => r0 + ((r1 - r0) * y) / Lc;
  const y0 = Lc * (tip ? 0.12 : 0.2), y1 = Lc * (tip ? 0.7 : 0.8);
  const plate = [V2(rAt(y0) + 0.1, y0), V2(rAt(y0) + 0.7, y0 + 0.6), V2(rAt(y0) + 0.95, y0 + 1.6), V2(rAt(y1) + 0.95, y1 - 1.6), V2(rAt(y1) + 0.7, y1 - 0.6), V2(rAt(y1) + 0.1, y1)];
  part(g, new THREE.LatheGeometry(plate.map((p) => p.multiplyScalar(MM)), 20, -0.95, 1.9), "plate", `${name}_plate`);
  // palm-side pad; the fingertip's is a larger tactile dome
  const rm = (r0 + r1) / 2, padR = rm * (tip ? 0.72 : 0.6), padLen = Lc * (tip ? 0.8 : 0.6);
  const pad = new THREE.CapsuleGeometry(padR * MM, Math.max(0.1, padLen - 2 * padR) * MM, 8, 20).scale(1, 1, tip ? 0.46 : 0.38);
  part(g, pad.translate(0, Lc * (tip ? 0.58 : 0.5) * MM, -(rm + 0.8 - padR * (tip ? 0.46 : 0.38)) * MM), "pad", `${name}_pad`);
  if (tip) { const t = new THREE.Object3D(); t.position.y = Lc * MM; g.add(t); t.userData.r = r1; return t; }
}
// Radius at the far end of segment i (the next segment's hinge disc spans it).
export const endRadius = (i, d) => (d / 2) * SEG_R[i][1];
