// "Industrial": a real collaborative robot arm and a real robotic hand.
// Arm: every joint is a chunky actuator drum (painted housing, machined end caps on bolt circles, a
// status light ring), joined by carbon-fibre tubes with machined aluminium flanges; it ends in a
// standard tool flange. Hand: a machined aluminium chassis under black anodised covers held by screws;
// each finger bone is a pair of aluminium side plates around a black core, the bones meeting in
// clevis joints on steel pins, with a white cover on the back and rubber pads on the grip side.
import * as THREE from "three";
import { bolt, boltCircle, stadiumPlate } from "./parts.js";

export const label = "Industrial";
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export function arm(K) {
  const { MM, MOUNT_FACE, rig, base, part, turn, tubeProfile, alongY, roundedShape, rect, slab } = K;
  const ring = (owner, z, r, name) => part(owner, turn(tubeProfile(z - 0.7, z + 0.7, r + 0.3, r + 0.3, 0.2, 0.2)), "ring", `${name}_ring`);
  // A pitch actuator: a drum across the arm. The outer link owns the middle band (it turns with it);
  // the inner link owns the two end sections, each closed by a machined cap on a bolt circle, and on
  // the +Y side a deeper motor cover. Light rings sit in the seams.
  function actuator(inner, outer, r, half, band, name) {
    const at = outer.position.z, place = (g) => alongY(g).translate(0, 0, at);
    part(outer, alongY(turn(tubeProfile(-band, band, r, r, 2, 2))), "shell", `${name}_band`);
    for (const s of [1, -1]) {
      const flip = s < 0, side = flip ? "L" : "R";
      part(inner, place(turn(tubeProfile(band + 1.4, half, r, r, 2, 6), { flip })), "shell", `${name}_end${side}`);
      part(inner, place(turn(tubeProfile(band - 0.2, band + 1.4, r - 1.2, r - 1.2, 0.2, 0.2), { flip })), "ring", `${name}_ring${side}`);
      const capR = r * 0.82, capZ = s > 0 ? half + r * 0.34 : half;
      if (s > 0) {   // motor cover
        part(inner, place(turn(tubeProfile(half - 2, half + r * 0.3, r * 0.86, r * 0.84, 2, 8))), "shell", `${name}_motor`);
      }
      part(inner, place(turn([[0, capZ - 2], [capR, capZ - 2, 0.5], [capR, capZ + 1.2, 1], [0, capZ + 1.2]], { flip })), "trim", `${name}_cap${side}`);
      boltCircle(K, inner, 8, capR * 0.8, V(0, s * (capZ + 1.2), at / MM), V(0, s, 0), Math.max(1.4, r * 0.045), `${name}_capbolt${side}`, Math.PI / 8);
    }
  }
  // A roll actuator: a short drum straddling the joint, stator below on the inner link, rotor above.
  function roller(inner, outer, r, h, name) {
    const at = outer.position.z / MM;
    part(inner, turn(tubeProfile(at - h, at - 0.7, r, r, 3, 0.6)), "shell", `${name}_stator`);
    ring(outer, 0, r - 1.2, name);
    part(outer, turn(tubeProfile(0.7, h, r, r, 0.6, 3)), "shell", `${name}_rotor`);
  }
  // A machined flange where a tube meets a housing, with its screws.
  function flange(owner, z0, z1, r, name, up = true) {
    part(owner, turn(tubeProfile(z0, z1, r, r, 0.8, 0.8)), "trim", `${name}_flange`);
    boltCircle(K, owner, 6, r * 0.82, V(0, 0, up ? z1 : z0), up ? Z : Z.clone().negate(), Math.max(1.2, r * 0.05), `${name}_flangebolt`);
  }
  const tube = (owner, z0, z1, r, name) => part(owner, turn(tubeProfile(z0, z1, r, r, 0.6, 0.6), { seg: 64 }), "carbon", `${name}_tube`);

  // Base: an aluminium mounting plate bolted down, the painted base housing, two M12 connectors at the back.
  part(base, turn([[0, 0], [96, 0, 1], [96, 9, 1.5], [0, 9]]), "trim", "mount_plate");
  boltCircle(K, base, 8, 84, V(0, 0, 9), Z, 3.2, "mount_bolt", Math.PI / 8);
  part(base, turn(tubeProfile(9, 45.2, 64, 60, 3, 8)), "shell", "base_housing");
  ring(base, 45.8, 57, "j1");
  for (const y of [-13, 13]) {
    const at = (g) => g.rotateZ(Math.PI / 2).translate(-60 * MM, y * MM, 27 * MM);
    part(base, at(new THREE.CylinderGeometry(6.4 * MM, 6.4 * MM, 14 * MM, 24).translate(0, -7 * MM, 0)), "joint", `connector${y}`);
    part(base, at(new THREE.CylinderGeometry(7.6 * MM, 7.6 * MM, 6 * MM, 18).translate(0, -10 * MM, 0)), "steel", `connector_nut${y}`);
  }
  // link1: rotor flange, column, the shoulder actuator.
  part(rig.link1, turn(tubeProfile(0.7, 10, 60, 58, 0.6, 2)), "shell", "j1_rotor");
  boltCircle(K, rig.link1, 8, 50, V(0, 0, 10), Z, 2, "j1_bolt");
  part(rig.link1, turn(tubeProfile(10, 118, 50, 50, 1, 1)), "shell", "column");
  actuator(rig.link1, rig.link2, 54, 66, 32, "j2");
  // link2 / link3: upper arm. Collar out of the shoulder, the upper-arm roll actuator, carbon tube, flange.
  part(rig.link2, turn(tubeProfile(44, 62, 42, 42, 1, 1)), "shell", "j2_neck");
  roller(rig.link2, rig.link3, 44, 10, "j3");
  flange(rig.link3, 10, 18, 41, "upper_low");
  tube(rig.link3, 18, 172, 34, "upper");
  flange(rig.link3, 172, 182, 39, "upper_high", false);
  part(rig.link3, turn(tubeProfile(182, 196, 40, 40, 1, 1)), "shell", "j4_neck");
  actuator(rig.link3, rig.link4, 44, 56, 26, "j4");
  // link4 / link5: forearm. Carbon tube, the forearm roll actuator, carbon tube, wrist actuator.
  part(rig.link4, turn(tubeProfile(34, 46, 34, 34, 1, 1)), "shell", "j4_out");
  flange(rig.link4, 46, 52, 32, "fore_low");
  tube(rig.link4, 52, 106, 27, "fore_low");
  roller(rig.link4, rig.link5, 34, 24, "j5");
  flange(rig.link5, 24, 30, 30, "fore_high");
  tube(rig.link5, 30, 92, 25, "fore_high");
  flange(rig.link5, 92, 98, 29, "fore_top", false);
  part(rig.link5, turn(tubeProfile(98, 108, 30, 30, 1, 1)), "shell", "j6_neck");
  actuator(rig.link5, rig.link6, 32, 42, 18, "j6");
  // link6 / link7: wrist roll and a standard tool flange (four screws and a dowel pin).
  part(rig.link6, turn(tubeProfile(28, 44, 26, 26, 1, 1)), "shell", "j6_out");
  roller(rig.link6, rig.link7, 30, 14, "j7");
  part(rig.link7, turn(tubeProfile(14, 22, 25, 25, 0.6, 1.2)), "trim", "tool_flange");
  boltCircle(K, rig.link7, 4, 20, V(0, 0, 22), Z, 1.6, "tool_bolt", Math.PI / 4);
  part(rig.link7, new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, 2 * MM, 12).rotateX(Math.PI / 2).translate(0, 20 * MM, 23 * MM), "steel", "dowel");
  part(rig.link7, turn(tubeProfile(22, MOUNT_FACE - 796, 21, 21, 0.6, 0.6)), "joint", "adapter");
  // a small wrist camera on the palm side
  part(rig.link7, slab(roundedShape(rect(25, -12, 37, 12), 4), 2, 20, 2), "joint", "camera_body");
  part(rig.link7, turn([[0, 19], [5, 19, 0.3], [5, 21.6, 1.2], [0, 21.6]]).translate(31 * MM, -4 * MM, 0), "glass", "camera_lens");
  part(rig.link7, turn([[0, 19], [2.8, 19, 0.3], [2.8, 21, 0.8], [0, 21]]).translate(31 * MM, 6 * MM, 0), "glass", "depth_lens");
}

/* ---------- Hand ---------- */
const W = [0.95, 0.78, 0.62];   // half-width of each bone, x finger radius (each fits inside the one before)
const D = [0.95, 0.85, 0.74];   // depth radius at each bone's base, x finger radius

export function palm(K, palm) {
  const { MM, PALM, FINGERS, THUMB, part, turn, roundedShape, slab } = K;
  const trap = (inset, y0 = 0, y1 = PALM.length) => {
    const hw = (y) => 34 + (12 / PALM.length) * y - inset;
    return [[-hw(y0 + inset), y0 + inset], [hw(y0 + inset), y0 + inset], [hw(y1 - inset), y1 - inset], [-hw(y1 - inset), y1 - inset]];
  };
  // wrist adapter
  part(palm, turn(tubeOf(0, 10, 22)).rotateX(-Math.PI / 2), "trim", "wrist_adapter");
  // machined chassis, covers, screws
  part(palm, slab(roundedShape(trap(2, 6, 96), 10), -11, 11, 1.2), "trim", "chassis");
  part(palm, slab(roundedShape(trap(5, 10, 92), 8), 10.6, 14, 1), "joint", "back_cover");
  part(palm, slab(roundedShape(trap(5, 10, 88), 8), -14, -10.6, 1), "joint", "front_cover");
  part(palm, slab(roundedShape(trap(12, 24, 82), 9), -16, -13.4, 1), "pad", "palm_pad");
  for (const [x, y] of [[-26, 16], [26, 16], [-34, 84], [34, 84], [0, 50]]) {
    bolt(K, palm, V(x, y, 14), Z, 1.5, 1, `back_screw${x}_${y}`);
    if (y !== 50) bolt(K, palm, V(x, y, -14), Z.clone().negate(), 1.5, 1, `front_screw${x}_${y}`);
  }
  // thumb actuator housing on the front of the palm
  const t = THUMB.at;
  part(palm, new THREE.CylinderGeometry(13 * MM, 14 * MM, 10 * MM, 32).rotateX(Math.PI / 2).translate((t[0] + 6) * MM, (t[1] + 6) * MM, -14 * MM), "joint", "thumb_housing");
  boltCircle(K, palm, 4, 9.5, V(t[0] + 6, t[1] + 6, -19), Z.clone().negate(), 1.1, "thumb_housing_bolt", Math.PI / 4);
  function tubeOf(z0, z1, r) { return [[0, z0], [r, z0, 0.6], [r, z1, 0.6], [0, z1]]; }
}

// Clevis at a finger root: two aluminium plates either side of the first bone, standing out of the palm.
export function knuckle(K, root, f, name) {
  const { part } = K;
  const r = f.d / 2, w = r * W[0], t = 1.4, a = r * D[0] + 1.2;
  for (const s of [1, -1]) part(root, stadiumPlate(K, a + 2, a, 12, s > 0 ? w + 0.2 : -w - 0.2 - t, s > 0 ? w + 0.2 + t : -w - 0.2).translate(0, -12 * K.MM, 0), "trim", `${name}_clevis${s > 0 ? "R" : "L"}`);
  return w + 0.2 + t;
}

export function thumbRoot(K, root) {
  const { MM, THUMB, part } = K;
  const r = THUMB.d / 2;
  part(root, new THREE.CylinderGeometry(r * 1.05 * MM, r * 1.05 * MM, r * 2.1 * MM, 32), "joint", "thumb_root");
  return r * W[0] + 1.6;
}

export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, part } = K;
  const r = d / 2, w = r * W[i], a = r * D[i], b = a * 0.92, t = 1.2;
  const L = tip ? length - b : length;
  // side plates and the black core between them
  part(g, stadiumPlate(K, a, b, L, w - t, w), "trim", `${name}_plateR`);
  part(g, stadiumPlate(K, a, b, L, -w, -w + t), "trim", `${name}_plateL`);
  part(g, stadiumPlate(K, a - 0.8, b - 0.8, L, -w + t, w - t, 0.4), "joint", `${name}_core`);
  // white cover over the back, rubber pad on the grip side
  const y0 = L * 0.18, y1 = L * (tip ? 0.7 : 0.82);
  part(g, stadiumPlate(K, 1.6, 1.6, y1 - y0, -w + t + 0.2, w - t - 0.2, 0.5).translate(0, y0 * MM, (a - 0.6) * MM), "shell", `${name}_cover`);
  part(g, stadiumPlate(K, 1.8, 1.8, y1 - y0, -w + t + 0.4, w - t - 0.4, 0.6).translate(0, y0 * MM, -(a - 0.4) * MM), "pad", `${name}_pad`);
  // the hinge pin through the clevis before it, with screw heads on both faces
  part(g, new THREE.CylinderGeometry(a * 0.32 * MM, a * 0.32 * MM, (2 * prevR + 0.6) * MM, 20).rotateZ(Math.PI / 2), "steel", `${name}_pin`);
  for (const s of [1, -1]) bolt(K, g, V(s * (prevR + 0.3), 0, 0), V(s, 0, 0), a * 0.42, 0.8, `${name}_pinhead${s > 0 ? "R" : "L"}`);
  if (tip) {
    // fingertip: a rounded aluminium cap over a soft tactile pad
    part(g, new THREE.SphereGeometry(MM, 28, 18).scale(w, b, b).translate(0, L * MM, 0), "trim", `${name}_cap`);
    part(g, new THREE.SphereGeometry(MM, 24, 16).scale(w * 0.85, b * 1.25, b * 0.62).translate(0, (L - b * 0.4) * MM, -b * 0.42 * MM), "pad", `${name}_tippad`);
    const o = new THREE.Object3D();
    o.position.y = L * MM;
    o.userData.r = b;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => (d / 2) * W[i];
