// "Future": cooler than real robotics. Faceted pearl armour over a carbon spine; cyan light running in
// the seams behind smoked translucent panels; "magnetic" joints where the parts float apart around a
// glowing core; a slender hand with light at every knuckle and a hex core in the back of the palm.
import * as THREE from "three";

export const label = "Future";
const FACETS = 8;   // armour cross-section: an octagon

export function arm(K) {
  const { MM, MOUNT_FACE, rig, base, part, turn, tubeProfile, alongY, radiusAt } = K;
  const facet = (pts, extra = {}) => turn(pts, { seg: FACETS, phiStart: Math.PI / FACETS, ...extra });
  // A link body: carbon spine, two armour halves (front and back) leaving windows down each side, and
  // in each window a cyan light strip behind smoked glass.
  function body(owner, z0, z1, r0, r1, name) {
    const prof = tubeProfile(z0, z1, r0, r1, 3, 3);
    part(owner, turn(tubeProfile(z0 + 2, z1 - 2, r0 * 0.72, r1 * 0.72, 1, 1), { seg: FACETS, phiStart: Math.PI / FACETS }), "carbon", `${name}_spine`);
    const win = Math.PI / 4.6;   // window angle on each side
    for (const [start, side] of [[Math.PI / 2 + win / 2, "front"], [-Math.PI / 2 + win / 2, "back"]]) {
      part(owner, turn(prof, { seg: 6, phiStart: start, phiLength: Math.PI - win }), "paint", `${name}_armour_${side}`);
    }
    for (const [mid, side] of [[Math.PI / 2, "L"], [-Math.PI / 2, "R"]]) {
      const r = (z) => radiusAt(z, z0, z1, r0, r1);
      part(owner, turn(tubeProfile(z0 + 8, z1 - 8, r(z0) * 0.9, r(z1) * 0.9, 2, 2), { seg: 3, phiStart: mid - win / 2 + 0.04, phiLength: win - 0.08 }), "smoke", `${name}_window${side}`);
      part(owner, turn(tubeProfile(z0 + 10, z1 - 10, r(z0) * 0.78, r(z1) * 0.78, 1, 1), { seg: 2, phiStart: mid - 0.06, phiLength: 0.12 }), "glow", `${name}_light${side}`);
    }
  }
  // A floating pitch joint: the outer link carries a glowing core; the inner link carries two faceted
  // discs that hover beside it with a clear gap.
  function joint(inner, outer, r, half, core, name) {
    const at = outer.position.z, place = (g) => alongY(g).translate(0, 0, at);
    part(outer, alongY(turn(tubeProfile(-core, core, r * 0.7, r * 0.7, 2, 2), { seg: 32 })), "glow", `${name}_core`);
    part(outer, alongY(facet(tubeProfile(-core + 1, core - 1, r * 0.9, r * 0.9, 3, 3))), "carbon", `${name}_hub`);
    for (const flip of [false, true]) {
      const side = flip ? "L" : "R";
      part(inner, place(facet(tubeProfile(core + 3, half, r, r * 0.96, 2, 6), { flip })), "paint", `${name}_disc${side}`);
      part(inner, place(turn(tubeProfile(half - 0.4, half + 1.2, r * 0.45, r * 0.45, 0.4, 0.6), { seg: 32, flip })), "glow", `${name}_eye${side}`);
    }
  }
  // A floating roll joint: a glowing core showing through a gap between two armour rims.
  function roll(owner, z, r, name) {
    part(owner, turn(tubeProfile(z - 3, z + 3, r * 0.82, r * 0.82, 1, 1), { seg: 32 }), "glow", `${name}_core`);
  }

  // Base: a hexagonal pedestal with a light line round it.
  part(base, turn([[0, 0], [92, 0, 2], [92, 6, 2], [80, 40, 4], [0, 40]], { seg: 6 }), "carbon", "pedestal");
  part(base, turn([[0, 30], [87, 30, 0.4], [86, 32, 0.4], [0, 32]], { seg: 6 }), "glow", "pedestal_line");
  part(base, turn([[0, 38], [66, 38, 1], [66, 44.5, 2], [0, 44.5]], { seg: 6 }), "paint", "pedestal_top");
  roll(rig.link1, 0, 60, "j1");
  // link1: shoulder tower
  body(rig.link1, 4, 112, 54, 50, "tower");
  joint(rig.link1, rig.link2, 50, 70, 26, "j2");
  // link2/link3: upper arm
  part(rig.link2, facet(tubeProfile(34, 66, 44, 42, 4, 3)), "paint", "upper_root");
  roll(rig.link3, 0, 44, "j3");
  body(rig.link3, 4, 196, 42, 34, "upper");
  joint(rig.link3, rig.link4, 38, 54, 20, "j4");
  // link4/link5: forearm
  body(rig.link4, 26, 132, 32, 29, "fore_low");
  roll(rig.link5, 0, 30, "j5");
  body(rig.link5, 4, 110, 29, 25, "fore_high");
  joint(rig.link5, rig.link6, 28, 40, 14, "j6");
  // link6/link7: wrist
  part(rig.link6, facet(tubeProfile(20, 58, 25, 24, 4, 3)), "paint", "wrist");
  roll(rig.link7, 0, 24, "j7");
  part(rig.link7, facet(tubeProfile(4, MOUNT_FACE - 796, 23, 22, 3, 2)), "carbon", "wrist_cuff");
}

/* ---------- Hand ---------- */
export function palm(K, palm) {
  const { MM, PALM, THUMB, part, slab } = K;
  // an angular palm: a chamfered hexagon outline, pearl armour on the back, dark gloss in front
  const outline = (i) => [[-30 + i, 2 + i], [30 - i, 2 + i], [44 - i, 30], [44 - i, 92 - i], [-44 + i, 92 - i], [-44 + i, 30]];
  const poly = (pts, r = 2) => { const s = new THREE.Shape(); pts.forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
  part(palm, slab(poly(outline(2)), -10, 10, 1.2), "carbon", "palm_core");
  part(palm, slab(poly(outline(4)), 9.4, 14, 1.6), "paint", "palm_armour");
  part(palm, slab(poly(outline(5)), -14, -9.4, 1.4), "gloss", "palm_front");
  // the hex core in the back of the palm
  const hex = (r) => Array.from({ length: 6 }, (_, k) => [Math.cos((k / 6) * Math.PI * 2) * r, 50 + Math.sin((k / 6) * Math.PI * 2) * r]);
  part(palm, slab(poly(hex(15)), 13.4, 15.2, 0.5), "carbon", "core_frame");
  part(palm, slab(poly(hex(11)), 14.4, 15.6, 0.4), "glow", "core");
  // light line along the palm's edge, and a glowing pad grid in front
  part(palm, slab(poly(outline(1.2)), -0.4, 0.4, 0), "glow", "edge_line");
  for (const [x, y] of [[-20, 30], [0, 30], [20, 30], [-20, 56], [0, 56], [20, 56], [-20, 80], [0, 80], [20, 80]]) {
    part(palm, slab(poly([[x - 6, y - 6], [x + 6, y - 6], [x + 6, y + 6], [x - 6, y + 6]]), -15.2, -13.8, 0.5), "glow", `pad_${x}_${y}`);
  }
  // thumb mount
  const t = THUMB.at;
  part(palm, new THREE.CylinderGeometry(12 * MM, 13 * MM, 10 * MM, 6).rotateX(Math.PI / 2).translate((t[0] + 5) * MM, (t[1] + 6) * MM, -12 * MM), "paint", "thumb_mount");
}

// A glowing node at each knuckle in a carbon collar.
export function knuckle(K, root, f, name) {
  const { MM, part } = K;
  const r = f.d / 2;
  part(root, new THREE.SphereGeometry(r * 0.62 * MM, 24, 16), "glow", `${name}_node`);
  part(root, new THREE.CylinderGeometry(r * 0.95 * MM, r * 0.95 * MM, r * 1.3 * MM, 6).rotateZ(Math.PI / 2), "carbon", `${name}_collar`);
  return r * 0.7;
}

export function thumbRoot(K, root) {
  const { MM, THUMB, part } = K;
  const r = THUMB.d / 2;
  part(root, new THREE.SphereGeometry(r * 0.7 * MM, 24, 16), "glow", "thumb_node");
  return r * 0.7;
}

// Each bone: a slender faceted shell (hexagonal section, tapering, flattened a little), carbon on the
// grip side, a light node at its base hinge; the last bone ends in a sharp chamfered tip with a light line.
const R = [[0.92, 0.82], [0.8, 0.72], [0.7, 0.55]];
export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, part, turn } = K;
  const r = d / 2, r0 = r * R[i][0], r1 = r * R[i][1];
  const gap = r * 0.45, L = length;
  const end = tip ? L - r1 * 0.4 : L - gap;
  const shell = [[0, gap], [r0, gap + r0 * 0.5, 1.2], [r1, end - (tip ? r1 * 1.2 : r1 * 0.5), 1.2], [tip ? r1 * 0.25 : 0, end], ...(tip ? [[0, end]] : [])];
  part(g, turn(shell, { seg: 6, phiStart: Math.PI / 6 }).rotateX(-Math.PI / 2).scale(1, 1, 0.85), "paint", `${name}_shell`);
  part(g, turn([[0, gap + 2], [r0 * 0.96, gap + 3, 0.6], [r1 * 0.96, end - 3, 0.6], [0, end - 2]], { seg: 2, phiStart: Math.PI / 2 + 0.6, phiLength: Math.PI - 1.2 }).rotateX(-Math.PI / 2).scale(1, 1, 0.9), "carbon", `${name}_grip`);
  part(g, new THREE.SphereGeometry(r * 0.42 * MM, 20, 14), "glow", `${name}_node`);
  if (tip) {
    part(g, new THREE.TorusGeometry(r1 * 0.95 * MM, 0.5 * MM, 6, 6).rotateX(Math.PI / 2).translate(0, (end - r1 * 1.6) * MM, 0), "glow", `${name}_tipline`);
    const o = new THREE.Object3D();
    o.position.y = (L - r1) * MM;
    o.userData.r = r1;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => (d / 2) * 0.42;
