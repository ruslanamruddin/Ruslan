// "Maker": an exposed hobbyist prototype, the kind built on a garage bench. Links of 2020 aluminium
// extrusion with black end caps, held together by matte white 3D-printed brackets and joint housings
// (layer lines showing) and socket screws. Bare NEMA stepper motors drive the pitch joints through GT2
// belts over printed pulleys, with spring idlers on the belts; the roll joints are driven by spur gears.
// Wire bundles with zip ties and spiral wrap run along the frame, and flexible cables jump each joint.
// The base is an extrusion frame with an open electronics bay: a controller board with driver modules,
// heatsinks, capacitors and blinking status LEDs, and a cooling fan that spins. The hand is an
// InMoov-style printed hand: clevis-hinged phalanges on screws, tendon lines down the palm side, and
// three micro servos in an open palm whose horns turn as the fingers curl.
import * as THREE from "three";
import { bolt, boltCircle, anchor, flexCable } from "./parts.js";
import {
  V, X, Y, Z, PR, PR2, box, cylZ, cylY, cylX, circle, frame, xzSlab, yzSlab, poly, nut,
  ridged, layered, stack, extrusion, gearShape, pulleyParts, spinner, beltShape, idlerAt, stepper, bundle,
} from "./proto_maker_parts.js";

export const label = "Maker";
const MM = 0.001;
const NY = V(0, -1, 0);
let K = null;
// moving bits, filled in while building and driven by update()
const spins = [];     // { g, axis, fn(S) -> angle }
const leds = [];      // { m, fn(t) -> on }
const horns = [];     // { g, fn(handNow) -> angle }
const tendons = [];   // { m, horn, tip: Vector3 (horn frame, m), end: Vector3 (palm frame, m) }
const cables = [];
let fan = null, fanAngle = 0;

/* ======================================================================= ARM */
// The kit's slab with fewer bevel and curve segments: this design has hundreds of small printed parts.
function lean(k) {
  if (k.__lean) return k;
  const slab = (shape, z0, z1, bevel, holes = []) => {
    shape.holes.push(...holes);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, z1 - z0 - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 10 });
    return g.translate(0, 0, z0 + bevel).scale(MM, MM, MM);
  };
  return { ...k, slab, __lean: true };
}
export function arm(k) {
  K = lean(k);
  spins.length = leds.length = horns.length = tendons.length = cables.length = 0;
  buildBase(K.base);
  buildShoulder();
  buildUpperArm();
  buildForearm();
  buildWrist();
  buildCables();
}

// A printed pulley fixed to a link (turns with it), lying along Y at y.
function linkPulley(owner, y, r, w, name, hub = -1, holes = 5, z = 0, x = 0) {
  for (const [g, role, n] of pulleyParts(K, r, w, { printed: true, hub, holes })) K.part(owner, g.translate(x * MM, y * MM, z * MM), role, `${name}_${n}`);
}

/* ---------- base: extrusion frame, printed deck, yaw drive, electronics bay ---------- */
function buildBase(base) {
  const put = (g, r, n) => K.part(base, g, r, n);
  const { slab, roundedShape, rect, turn, tubeProfile } = K;
  for (const [x, y] of [[-96, -96], [96, -96], [96, 96], [-96, 96]]) put(cylZ(9, 0, 4.2, 28, x, y), "rubber", `foot${x}_${y}`);
  extrusion(K, base, V(-106, -96, 14), V(106, -96, 14), "frame_front");
  extrusion(K, base, V(-106, 96, 14), V(106, 96, 14), "frame_back");
  extrusion(K, base, V(-96, -86, 14), V(-96, 86, 14), "frame_left", { caps: false });
  extrusion(K, base, V(96, -86, 14), V(96, 86, 14), "frame_right", { caps: false });
  // printed corner gussets on the outside faces
  for (const [x, y] of [[-96, -96], [96, -96], [96, 96], [-96, 96]]) {
    const sx = Math.sign(x), sy = Math.sign(y);
    // printed L bracket on the outer face of the side rail, screwed into both rails
    put(yzSlab(K, roundedShape(rect(y - sy * 26 - (sy > 0 ? 0 : 0), 5, y - sy * 4, 23), 2), x + sx * 10, x + sx * 13, 0.5), PR, `corner_bracket${x}_${y}`);
    for (const t of [10, 20]) bolt(K, base, V(x + sx * 13.4, y - sy * t, 14), V(sx, 0, 0), 2.2, 1.5, `corner_bolt${x}_${y}_${t}`);
  }
  // printed deck plate, screwed into the extrusion slots
  put(slab(roundedShape(rect(-106, -106, 106, 106), 12), 24, 29, 0.8, [circle(0, 0, 44), circle(-60, 60, 12), circle(-30, 80, 7), circle(80, -20, 7)]), PR, "deck");
  for (const t of [-72, -24, 24, 72]) {
    bolt(K, base, V(t, 96, 29.7), Z, 3, 2, `deck_bolt_b${t}`);
    bolt(K, base, V(-96, t, 29.7), Z, 3, 2, `deck_bolt_l${t}`);
    bolt(K, base, V(96, t, 29.7), Z, 3, 2, `deck_bolt_r${t}`);
    if (Math.abs(t) > 50) bolt(K, base, V(t, -98, 29.7), Z, 3, 2, `deck_bolt_f${t}`);
  }
  // turntable bearing housing, printed with layer lines; the slewing bearing gap on top
  put(stack(29, 47, 55, { r1: 52, pitch: 1.7, seg: 88 }), PR, "turret");
  put(turn(tubeProfile(44.5, 47.6, 49.5, 49.5, 0.3, 0.3), { seg: 64 }), "dark", "bearing_ring");
  boltCircle(K, base, 10, 45.5, V(0, 0, 47), Z, 1.6, "turret_bolt", 0.3);
  // yaw drive: a NEMA17 standing in a printed cradle, GT2 belt round the big printed pulley on link1
  const ym = V(64, 56, 58);
  stepper(K, base, frame(ym, X, Z), { name: "yaw_motor" });
  for (const s of [-1, 1]) put(slab(roundedShape(rect(ym.x + s * 21.5 - (s > 0 ? 0 : 4), ym.y - 22, ym.x + s * 21.5 + (s > 0 ? 4 : 0), ym.y + 22), 1.5), 29, 50, 0.6), PR, `yaw_cradle${s}`);
  put(slab(roundedShape(rect(ym.x - 26, ym.y - 24, ym.x + 26, ym.y + 24), 4), 29, 32, 0.6, [roundedShape(rect(ym.x - 21.3, ym.y - 21.3, ym.x + 21.3, ym.y + 21.3), 5)]), PR, "yaw_cradle_base");
  for (const s of [-1, 1]) for (const t of [-14, 14]) bolt(K, base, V(ym.x + s * 23.5, ym.y + t, 50.3), Z, 2, 1.4, `yaw_cradle_bolt${s}${t}`);
  const yp = spinner(K, base, V(ym.x, ym.y, 63), "z", pulleyParts(K, 8, 7, { hub: -1, shaftFrom: -5 }), "yaw_motor_pulley");
  spins.push({ g: yp, axis: Z, fn: (S) => S.q[0] * (50 / 8) });
  put(slab(beltShape([0, 0], 50, [ym.x, ym.y], 8), 60.5, 65.5, 0), "rubber", "yaw_belt");
  bundle(K, base, [[ym.x + 34, ym.y - 40, 31], [ym.x + 34, ym.y - 10, 31], [ym.x + 30, ym.y + 2, 26]], { n: 4, ties: [0.4], name: "yaw_wires" });
  // limit switch for homing the yaw axis
  put(slab(roundedShape(rect(-70, -22, -56, -6), 1.5), 29, 36, 0.4), PR, "endstop_block");
  put(box(12.8, 5.8, 6.5, -63, -14, 39.3), "gloss", "endstop_switch");
  put(box(14, 0.5, 2.6, -60, -17.2, 40), "steel", "endstop_lever");
  put(cylZ(1.3, 36, 43, 10, -54, -17.6), "dark", "endstop_roller");
  // electronics bay, power entry and the cooling fan
  bay(base);
}

function bay(base) {
  const put = (g, r, n) => K.part(base, g, r, n);
  const { slab, roundedShape, rect } = K;
  // printed tray: floor, back wall, end wall, low front lip (so the board is in view)
  put(slab(roundedShape(rect(-47, -80, 47, -56), 3), 29, 32, 0.5), PR, "bay_floor");
  put(xzSlab(K, roundedShape(rect(-47, 29, 47, 72), 3), -59, -56, 0.6, [circle(-20, 64, 3), circle(20, 64, 3)]), PR, "bay_back");
  put(yzSlab(K, roundedShape(rect(-80, 29, -56, 70), 3), -47, -44, 0.6, [circle(-68, 40, 4.8)]), PR, "bay_end");
  put(xzSlab(K, roundedShape(rect(-47, 29, 47, 37), 2), -80, -77, 0.5), PR, "bay_lip");
  for (const x of [-38, 0, 38]) bolt(K, base, V(x, -80, 33), NY, 1.6, 1.1, `bay_lip_screw${x}`);
  // power entry: a barrel jack in the end wall, its cable running off across the bench
  put(cylX(5.4, -52, -44, 20, -68, 40), "gloss", "jack");
  put(cylX(6.6, -48.5, -47, 6, -68, 40), "steel", "jack_nut");
  const pc = new THREE.CatmullRomCurve3([[-52, -68, 40], [-66, -70, 37], [-88, -72, 33], [-108, -71, 27], [-121, -68, 12], [-138, -62, 3.4], [-180, -50, 3.2], [-240, -34, 3.2]].map(([x, y, z]) => V(x * MM, y * MM, z * MM)));
  put(new THREE.TubeGeometry(pc, 48, 3 * MM, 10), "rubber", "power_cable");
  put(cylX(4, -64, -52, 14, -68, 40), "rubber", "power_boot");

  // the controller board, mounted upright on stand-offs, components facing out (-y)
  const M = frame(V(0, -64, 52), X, Z);   // u = x, v = z, w out of the board toward -y
  const pcb = (g, role, n) => K.part(base, g.applyMatrix4(M), role, `pcb_${n}`);
  const lb = (w, h, d, u, v, w0, role, n) => pcb(box(w, h, d, u, v, w0 + d / 2), role, n);
  const lc = (r, u, v, w0, w1, role, n, seg = 16) => pcb(cylZ(r, w0, w1, seg, u, v), role, n);
  pcb(K.slab(roundedShape(rect(-41, -16, 41, 16), 1.5), -1.6, 0, 0, [circle(-38, -13, 1.6), circle(38, -13, 1.6), circle(-38, 13, 1.6), circle(38, 13, 1.6)]), "gloss", "board");
  for (const [u, v] of [[-38, -13], [38, -13], [-38, 13], [38, 13]]) {
    lc(2.6, u, v, -5, -1.6, "metal", `standoff${u}${v}`, 6);
    boltM2(base, M, V(u, v, 0), 2, `pcb_screw${u}${v}`);
  }
  // microcontroller with its pins, crystal, a field of small parts
  lb(11, 11, 1.3, -21, 3, 0, "dark", "mcu");
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    const t = -4.4 + i * 1.26;
    lb(0.5, 1.6, 0.4, -21 + s * 6.1, 3 + t, 0, "steel", `mcu_pin_l${i}${s}`);
    lb(1.6, 0.5, 0.4, -21 + t, 3 + s * 6.1, 0, "steel", `mcu_pin_t${i}${s}`);
  }
  lb(5, 2.2, 1.6, -21, -6, 0, "metal", "crystal");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const u = -36 + rnd() * 26, v = -12 + rnd() * 24;
    if (Math.abs(u + 21) < 8 && Math.abs(v - 3) < 8) continue;
    lb(rnd() > 0.5 ? 1.8 : 1, rnd() > 0.5 ? 1 : 1.8, 0.6, u, v, 0, rnd() > 0.3 ? "dark" : "metal", `smd${i}`);
  }
  // three stepper driver modules on headers, each with a finned heatsink and a trimpot
  for (const [j, u] of [-2, 13, 28].entries()) {
    for (const s of [-1, 1]) {
      lb(2.5, 20, 2.6, u + s * 5.5, -1, 0, "gloss", `drv${j}_header${s}`);
      for (let i = 0; i < 8; i++) lb(0.64, 0.64, 9, u + s * 5.5, -9.9 + i * 2.54, 0, "steel", `drv${j}_pin${s}${i}`);
    }
    lb(14, 20, 1.2, u, -1, 8.6, "carbon", `drv${j}_board`);
    lb(5, 5, 0.9, u, -1, 9.8, "dark", `drv${j}_chip`);
    lb(9, 9, 1.4, u, 1.5, 10.7, "metal", `drv${j}_sink`);
    for (let f = 0; f < 5; f++) lb(9, 0.9, 5, u, 1.5 - 3.6 + f * 1.8, 12.1, "metal", `drv${j}_fin${f}`);
    lc(1.5, u - 4, -8.5, 9.8, 11.2, "steel", `drv${j}_pot`);
  }
  // capacitors: one big electrolytic, two small; screw terminals along the bottom edge; pin header on top
  lc(4.6, -33, -5, 0, 10, "metal", "cap_big", 24);
  lc(4.7, -33, -5, 10, 10.6, "dark", "cap_big_top", 24);
  for (const [u, v] of [[-8, -12], [40.5, 8]]) { lc(2.6, u, v, 0, 6, "metal", `cap${u}`, 16); lc(2.7, u, v, 6, 6.4, "dark", `cap${u}_top`, 16); }
  for (const u of [-28, -18, 4, 19, 34]) {
    lb(8, 7, 8, u, -12.5, 0, "paint", `terminal${u}`);
    for (const s of [-1, 1]) lc(1.4, u + s * 2, -12.5, 8, 8.5, "steel", `terminal${u}_screw${s}`, 10);
  }
  lb(30, 2.5, 2.5, 4, 13.2, 0, "gloss", "header_top");
  for (let i = 0; i < 12; i++) lb(0.64, 0.64, 7, 4 - 14 + i * 2.54, 13.2, 0, "steel", `header_pin${i}`);
  lb(8, 7.5, 3.6, -41, 7, 0, "steel", "usb");
  // status LEDs: a dim lens always, the lit bulb blinking over it
  const ledAt = (u, v, w) => V(u, v, w).multiplyScalar(MM).applyMatrix4(M).divideScalar(MM);
  const patterns = [
    (t) => (t % 1.3) < 0.1 || ((t % 1.3) > 0.22 && (t % 1.3) < 0.32),   // heartbeat
    (t) => Math.floor(t * 9) % 4 !== 0 && Math.sin(t * 2.1) > -0.4,      // activity
    (t) => Math.floor(t * 1.4) % 2 === 0,                               // slow toggle
  ];
  [[-37, 9.5, "glow"], [-33.5, 9.5, "ring"], [-30, 9.5, "glow"]].forEach(([u, v, role], i) => {
    lc(1.6, u, v, 0, 1.4, "dark", `led${i}_base`, 12);
    pcb(new THREE.SphereGeometry(1.45 * MM, 14, 10).scale(1, 1, 1.25).translate(u * MM, v * MM, 2.2 * MM), "smoke", `led${i}_lens`);
    const p = ledAt(u, v, 2.3);
    const m = K.livePart(base, new THREE.SphereGeometry(1.65 * MM, 14, 10).scale(1, 1.25, 1), role, `led${i}`, [p.x, p.y, p.z]);
    leds.push({ m, fn: patterns[i] });
  });

  // fan shroud and the 40 mm cooling fan facing out of it
  const fc = V(68, -85, 52);
  put(xzSlab(K, roundedShape(rect(47, 29, 89, 75), 5), -80, -56, 1, [circle(fc.x, fc.z, 18.5)]), PR, "fan_shroud");
  put(xzSlab(K, roundedShape(rect(48, 32, 88, 72), 3), -90, -80.4, 0.6, [circle(fc.x, fc.z, 19.2)]), "dark", "fan_frame");
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bolt(K, base, V(fc.x + a * 16, -90, fc.z + b * 16), NY, 2, 1.4, `fan_screw${a}${b}`);
  put(cylY(8.5, -84, -80.6, 32, fc.x, fc.z), "dark", "fan_stator");
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    put(box(13, 1.6, 2.2, 0, 0, 0).translate(14 * MM, 0, 0).rotateY(a).translate(fc.x * MM, -81.4 * MM, fc.z * MM), "dark", `fan_strut${i}`);
  }
  const blades = [[cylY(7.4, -4, 2, 32), "gloss", "hub"], [cylY(3, -4.4, -4, 20), "paint", "hub_sticker"]];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    blades.push([box(11.5, 0.8, 7.5).rotateX(0.62).rotateZ(0.05).translate(12.6 * MM, -1 * MM, 0).rotateY(a), "gloss", `blade${i}`]);
  }
  fan = spinner(K, base, fc, "y", blades, "fan_rotor");
  for (const R of [6, 11.5, 17]) put(new THREE.TorusGeometry(R * MM, 0.45 * MM, 5, 40).rotateX(Math.PI / 2).translate(fc.x * MM, -91.2 * MM, fc.z * MM), "steel", `fan_guard${R}`);
  for (let i = 0; i < 4; i++) put(box(17, 0.9, 0.9).translate(9.5 * MM, 0, 0).rotateY((i / 4) * Math.PI * 2 + Math.PI / 4).translate(fc.x * MM, -91.2 * MM, fc.z * MM), "steel", `fan_spoke${i}`);
  bundle(K, base, [[56, -80, 74], [52, -76, 78], [36, -66, 70], [26, -66, 66]], { n: 2, rw: 0.6, name: "fan_wires", roles: ["rubber", "paint"] });
  // a status LED on the shroud
  put(cylY(2.2, -81, -80, 14, 82, 70), "dark", "shroud_led_bezel");
  const sl = K.livePart(base, new THREE.SphereGeometry(1.7 * MM, 14, 10), "ring", "shroud_led", [82, -81.2, 70]);
  leds.push({ m: sl, fn: (t) => Math.floor(t * 3.3) % 3 !== 2 });
  // motor wires leave the board for the arm
  bundle(K, base, [[-10, -66, 68], [-14, -62, 74], [-24, -58, 78], [-32, -56, 78]], { n: 4, ties: [0.6], name: "pcb_to_arm" });
}
function boltM2(owner, M, at, r, name) {
  const p = at.clone().multiplyScalar(MM).applyMatrix4(M).divideScalar(MM);
  bolt(K, owner, p, Z.clone().transformDirection(M), r, r * 0.7, name);
}

/* ---------- link1 / link2: turntable, shoulder cheeks, shoulder belt drive, roll gear ---------- */
function buildShoulder() {
  const { rig, slab, roundedShape, rect, turn, tubeProfile, alongY } = K;
  const L1 = rig.link1, L2 = rig.link2;
  const p1 = (g, r, n) => K.part(L1, g, r, n), p2 = (g, r, n) => K.part(L2, g, r, n);
  // turntable and the big yaw pulley
  p1(stack(1.5, 12, 56, { r1: 55, pitch: 1.7, seg: 88 }), PR, "turntable");
  p1(turn(tubeProfile(12, 14, 44, 44, 0.3, 0.3), { seg: 48 }), "dark", "turntable_spacer");
  for (const [g, role, n] of pulleyParts(K, 50, 6, { printed: true, hub: -1, holes: 6, bore: 30 })) p1(g.rotateX(Math.PI / 2).translate(0, 0, 17 * MM), role, `yaw_pulley_${n}`);
  // platform plate
  p1(slab(roundedShape(rect(-54, -58, 54, 58), 10), 20.5, 28.5, 1, [circle(30, 0, 9), circle(-30, 30, 6), circle(-30, -30, 6)]), PR, "platform");
  for (const [x, y] of [[44, 48], [44, -48], [-44, 48], [-44, -48], [44, 0]]) bolt(K, L1, V(x, y, 29.3), Z, 2.4, 1.6, `platform_bolt${x}_${y}`);
  // shoulder cheeks (printed plates with lightening holes), flange bearings on the axle
  const cheek = () => {
    const s = new THREE.Shape();
    s.moveTo(-48, 28); s.lineTo(48, 28); s.lineTo(48, 70); s.lineTo(36, 118);
    s.absarc(0, 118, 36, 0, Math.PI, false); s.lineTo(-48, 70); s.closePath();
    return s;
  };
  const holes = () => [circle(0, 48, 12), circle(30, 46, 6), circle(-30, 46, 6), circle(0, 118, 10), circle(-28, 88, 5), circle(28, 88, 5)];
  p1(xzSlab(K, cheek(), -54, -44, 1, holes()), PR, "cheekL");
  p1(xzSlab(K, cheek(), 44, 54, 1, holes()), PR, "cheekR");
  for (const s of [-1, 1]) {
    p1(alongY(turn([[5, 0], [15, 0, 0.4], [15, 2, 0.5], [12, 2], [12, 5, 0.5], [5, 5]], { seg: 40 })).scale(1, s, 1).translate(0, s * 54.2 * MM, 118 * MM), "dark", `shoulder_bearing${s}`);
    for (const [x, z] of [[-30, 36], [30, 36], [-40, 60], [40, 60]]) bolt(K, L1, V(x, s * 54.6, z), V(0, s, 0), 2.2, 1.5, `cheek_bolt${s}${x}${z}`);
  }
  // back spine and cross beam tying the cheeks together
  extrusion(K, L1, V(-40, 0, 29), V(-40, 0, 95), "spine");
  p1(slab(roundedShape(rect(-50, -44, -28, 44), 3), 95, 104, 0.8), PR, "cross_beam");
  for (const y of [-34, 34]) bolt(K, L1, V(-39, y, 104.5), Z, 2.4, 1.6, `beam_bolt${y}`);
  bundle(K, L1, [[-51, -6, 32], [-51, -6, 60], [-51, -4, 90], [-46, 8, 104]], { n: 4, ties: [0.25, 0.6], name: "spine_wires" });
  // shoulder stepper: face against the -y cheek, belt up to the shoulder pulley on link2
  const sm = V(0, -44, 48);
  stepper(K, L1, frame(sm, X, NY), { name: "shoulder_motor", frontScrews: false });
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bolt(K, L1, V(a * 15.5, -54.4, 48 + b * 15.5), NY, 2.6, 1.8, `shoulder_motor_bolt${a}${b}`);
  const sp = spinner(K, L1, V(0, -60, 48), "y", pulleyParts(K, 8, 8, { hub: 1, shaftFrom: 16 }), "shoulder_motor_pulley");
  spins.push({ g: sp, axis: Y, fn: (S) => S.q[1] * (34 / 8) });
  p1(xzSlab(K, beltShape([0, 48], 8, [0, 118], 34), -63, -57), "rubber", "shoulder_belt");
  idler(L1, [0, 48], 8, [0, 118], 34, -60, -54.2, 1, "shoulder_idler", (S) => S.q[1] * 34);

  // link2: printed hub on the shoulder axle, the big belt pulley, neck, upper-arm roll drive
  p2(alongY(stack(-42, 42, 36, { pitch: 1.8, seg: 72 })), PR, "shoulder_hub");
  for (const s of [-1, 1]) p2(alongY(turn(tubeProfile(-1, 1.6, 28, 28, 0.4, 0.4), { seg: 56 })).translate(0, s * 42 * MM, 0), "dark", `shoulder_hub_cap${s}`);
  p2(cylY(5, -68, 60, 20), "steel", "shoulder_axle");
  nut(K, L2, V(0, 57.2, 0), Y, 5.5, "shoulder_axle_R");
  linkPulley(L2, -60, 34, 8, "shoulder_pulley", -1, 5);
  layered(K, L2, (i) => roundedShape(rect(-26 + i, -24 + i, 28 - i, 24 - i), 6), 18, 56, 1.8, PR, "shoulder_neck");
  p2(stack(56, 63, 30, { pitch: 1.6, seg: 64 }), PR, "j3_flange");
  // roll drive: a NEMA14 hanging behind the neck, pinion meshing a ring gear on link3
  const rm = V(-46, 0, 60);
  stepper(K, L2, frame(rm, Y, Z), { s: 35, L: 34, name: "j3_motor", frontScrews: false });
  p2(slab(roundedShape(rect(-65, -19, -24, 19), 4), 60, 63, 0.6, [circle(-46, 0, 9.5)]), PR, "j3_motor_plate");
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bolt(K, L2, V(-46 + a * 13, b * 13, 63.4), Z, 2.2, 1.5, `j3_motor_bolt${a}${b}`);
  for (const s of [-1, 1]) p2(xzSlab(K, poly([[-25, 60], [-25, 34], [-56, 60]]), s > 0 ? 18 : -21, s > 0 ? 21 : -18, 0.5), PR, `j3_gusset${s}`);
  const pin = spinner(K, L2, V(-46, 0, 66.5), "z", pulleyParts(K, 9, 6, { gear: true, hub: -1, shaftFrom: -6.5, hubLen: 3 }), "j3_pinion");
  spins.push({ g: pin, axis: Z, fn: (S) => -S.q[2] * (37 / 9) });
  bundle(K, L2, [[-46, 27, 50], [-36, 27, 53], [-27, 26, 55]], { n: 4, ties: [0.5], name: "j3_wires" });
}

// A spring idler on a belt: printed swing arm bolted to a plate face, a flanged bearing that turns.
function idler(owner, c1, r1, c2, r2, yBelt, yFace, side, name, travel) {
  const ri = 5, [x, z] = idlerAt(c1, r1, c2, r2, ri, (n) => side * n[0], 0.55);
  const s = Math.sign(yBelt - yFace);
  const ax = [x - side * 12, z - 10];   // swing-arm pivot
  const arm = new THREE.Shape();
  arm.moveTo(ax[0], ax[1]);
  const pts = [[ax[0], ax[1]], [x, z]];
  const dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1], l = Math.hypot(dx, dz), nx = -dz / l * 4, nz = dx / l * 4;
  const shape = poly([[ax[0] + nx, ax[1] + nz], [x + nx, z + nz], [x - nx, z - nz], [ax[0] - nx, ax[1] - nz]]);
  const y0 = yFace, y1 = yFace + s * 2.6;
  K.part(owner, xzSlab(K, shape, Math.min(y0, y1), Math.max(y0, y1), 0.4), PR2, `${name}_arm`);
  K.part(owner, cylY(4.2, Math.min(y0, y1) - 0.3, Math.max(y0, y1) + 0.3, 20, ax[0], ax[1]), PR2, `${name}_armpivot`);
  K.part(owner, cylY(4.2, Math.min(y0, y1) - 0.3, Math.max(y0, y1) + 0.3, 20, x, z), PR2, `${name}_armboss`);
  bolt(K, owner, V(ax[0], yFace + s * 2.6, ax[1]), V(0, s, 0), 2.4, 1.6, `${name}_pivotbolt`);
  // the tension spring from the arm to a screw on the plate
  const sp = [], a0 = V(x - side * 3, yFace + s * 1.3, z + 5), a1 = V(x - side * 3 + side * 2, yFace + s * 1.3, z + 24);
  for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 2 * 9; const c = a0.clone().lerp(a1, t); sp.push(V(c.x + Math.cos(a) * 1.6, c.y + Math.sin(a) * 1.6, c.z).multiplyScalar(MM)); }
  K.part(owner, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 160, 0.35 * MM, 4), "steel", `${name}_spring`);
  bolt(K, owner, V(a1.x, yFace, a1.z + 1.5), V(0, s, 0), 1.8, 1.4, `${name}_springpost`);
  // axle bolt and the bearing on it
  K.part(owner, cylY(2.5, Math.min(yFace, yBelt + s * 5), Math.max(yFace, yBelt + s * 5), 14, x, z), "steel", `${name}_axle`);
  nut(K, owner, V(x, yBelt + s * 4.2, z), V(0, s, 0), 3.4, `${name}_axle`);
  const parts = [[cylY(ri - 0.2, -3.2, 3.2, 28), "metal", "race"], [cylY(2.8, -3.6, 3.6, 16), "steel", "inner"]];
  for (const e of [-1, 1]) parts.push([cylY(ri + 1.4, e * 3.2 - 0.4, e * 3.2 + 0.4, 28), "metal", `flange${e}`]);
  parts.push([box(1.2, 7.4, 0.8, ri - 1.2, 0, 0), "dark", "mark"]);   // a mark so the turning reads
  const g = spinner(K, owner, V(x, yBelt, z), "y", parts, name);
  spins.push({ g, axis: Y, fn: (S) => -travel(S) / ri });
}

/* ---------- link3: upper arm of two extrusions, elbow belt drive ---------- */
function buildUpperArm() {
  const { rig, slab, roundedShape, rect, turn, alongY } = K;
  const L3 = rig.link3, p = (g, r, n) => K.part(L3, g, r, n);
  // ring gear for the roll joint, end plates, the two extrusions
  const rg = gearShape(37, 48, 1.8);
  rg.holes.push(circle(0, 0, 20));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; rg.holes.push(circle(Math.cos(a) * 29, Math.sin(a) * 29, 4.2)); }
  p(slab(rg, -6.5, -0.5, 0), "metal", "j3_ringgear");
  boltCircle(K, L3, 6, 24, V(0, 0, -6.5), Z.clone().negate(), 1.7, "j3_ringgear_bolt", Math.PI / 6);
  const plate = () => roundedShape(rect(-46, -20, 46, 20), 8);
  p(slab(plate(), -0.5, 10, 1, [circle(0, 0, 9), circle(-16, 0, 5), circle(16, 0, 5)]), PR, "upper_plate_low");
  p(slab(plate(), 196, 204, 1, [circle(0, 0, 6)]), PR, "upper_plate_high");
  for (const x of [-34, 34]) {
    extrusion(K, L3, V(x, 0, 10), V(x, 0, 196), `upper_rail${x > 0 ? "F" : "B"}`, { caps: false });
    for (const z of [10.6, 195.4]) bolt(K, L3, V(x, 0, z === 10.6 ? -0.8 : 204.6), z === 10.6 ? Z.clone().negate() : Z, 3, 2, `upper_rail_bolt${x}${z}`);
    for (const z of [3, 200]) for (const y of [-14, 14]) bolt(K, L3, V(x + Math.sign(x) * 12.5, y, z), V(Math.sign(x), 0, 0), 2, 1.4, `upper_plate_side${x}${z}${y}`);
  }
  // elbow cheeks
  const cheek = () => { const s = new THREE.Shape(); s.moveTo(-30, 200); s.lineTo(30, 200); s.lineTo(30, 212); s.lineTo(28, 230); s.absarc(0, 230, 28, 0, Math.PI, false); s.lineTo(-30, 212); s.closePath(); return s; };
  p(xzSlab(K, cheek(), -20, -12, 0.8, [circle(0, 230, 8), circle(-17, 211, 3.5), circle(17, 211, 3.5)]), PR, "elbow_cheekL");
  p(xzSlab(K, cheek(), 12, 20, 0.8, [circle(0, 230, 8), circle(-17, 211, 3.5), circle(17, 211, 3.5)]), PR, "elbow_cheekR");
  for (const s of [-1, 1]) p(alongY(turn([[4, 0], [12, 0, 0.4], [12, 1.6, 0.4], [10, 1.6], [10, 4, 0.4], [4, 4]], { seg: 36 })).scale(1, s, 1).translate(0, s * 20.1 * MM, 230 * MM), "dark", `elbow_bearing${s}`);
  // elbow stepper behind a printed mount plate on the -y face of the rails
  const em = V(0, -10, 110);
  stepper(K, L3, frame(em, V(0, 0, -1), NY), { name: "elbow_motor", frontScrews: false });
  p(xzSlab(K, roundedShape(rect(-45, 84, 45, 136), 6), -14, -10, 0.8, [circle(0, 110, 11.6), circle(-22, 96, 3), circle(22, 124, 3)]), PR, "elbow_motor_plate");
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    bolt(K, L3, V(a * 15.5, -14.4, 110 + b * 15.5), NY, 2.6, 1.8, `elbow_motor_bolt${a}${b}`);
    bolt(K, L3, V(a * 34, -14.4, 110 + b * 20), NY, 2.4, 1.6, `elbow_plate_bolt${a}${b}`);
  }
  const ep = spinner(K, L3, V(0, -26, 110), "y", pulleyParts(K, 8, 8, { hub: 1, shaftFrom: 16 }), "elbow_motor_pulley");
  spins.push({ g: ep, axis: Y, fn: (S) => S.q[3] * (26 / 8) });
  p(xzSlab(K, beltShape([0, 110], 8, [0, 230], 26), -29, -23), "rubber", "elbow_belt");
  p(xzSlab(K, roundedShape(rect(20, 152, 44, 186), 3), -14, -10, 0.6), PR, "elbow_idler_plate");
  idler(L3, [0, 110], 8, [0, 230], 26, -26, -14, 1, "elbow_idler", (S) => S.q[3] * 26);
  // a printed half cover on the front rail, with vent slots
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push(roundedShape(rect(-8, 36 + i * 9, 8, 40 + i * 9), 2));
  p(yzSlab(K, roundedShape(rect(-16, 22, 16, 100), 5), 44, 47.5, 0.8, slots), PR, "upper_cover");
  for (const [y, z] of [[-11, 27], [11, 27], [-11, 95], [11, 95]]) bolt(K, L3, V(48, y, z), X, 2, 1.4, `upper_cover_screw${y}${z}`);
  // wiring down the back rail: zip ties and a stretch of spiral wrap; the motor tail joins it
  bundle(K, L3, [[-47, 6, 16], [-47, 6, 60], [-47, 6, 130], [-47, 7, 190], [-44, 8, 202]], { n: 5, ties: [0.08, 0.6, 0.84], wrap: [0.22, 0.48], name: "upper_wires", roles: ["rubber", "paint", "gloss", "titanium", "paint"] });
  bundle(K, L3, [[0, 6, 78], [-14, 7, 74], [-32, 7, 71], [-47, 6, 68]], { n: 4, ties: [0.45], name: "elbow_motor_wires" });
}

/* ---------- link4 / link5: forearm on a single rail, roll gear, wrist belt drive ---------- */
function buildForearm() {
  const { rig, slab, roundedShape, rect, turn, tubeProfile, alongY } = K;
  const L4 = rig.link4, L5 = rig.link5;
  const p4 = (g, r, n) => K.part(L4, g, r, n), p5 = (g, r, n) => K.part(L5, g, r, n);
  // elbow hub, pulley, axle, neck
  p4(alongY(stack(-11, 11, 24, { pitch: 1.6, seg: 64 })), PR, "elbow_hub");
  p4(cylY(4, -33, 24, 20), "steel", "elbow_axle");
  nut(K, L4, V(0, 21, 0), Y, 4.6, "elbow_axle_R");
  linkPulley(L4, -26, 26, 8, "elbow_pulley", -1, 5);
  layered(K, L4, (i) => roundedShape(rect(-16 + i, -11 + i, 16 - i, 11 - i), 4), 14, 32, 1.8, PR, "elbow_neck");
  extrusion(K, L4, V(0, 0, 30), V(0, 0, 118), "fore_rail_low", { caps: false });
  // forearm roll: NEMA14 beside the rail, pinion on a ring gear under link5
  const rm = V(-30, 0, 118);
  stepper(K, L4, frame(rm, Y, Z), { s: 35, L: 34, name: "j5_motor", frontScrews: false });
  p4(slab(roundedShape(rect(-49, -18, 12, 18), 4), 118, 121, 0.6, [circle(-30, 0, 7.5)]), PR, "j5_motor_plate");
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bolt(K, L4, V(-30 + a * 13, b * 13, 121.4), Z, 2.1, 1.4, `j5_motor_bolt${a}${b}`);
  p4(xzSlab(K, poly([[-12, 118], [-12, 92], [-40, 118]]), -1.5, 1.5, 0.4), PR, "j5_gusset");
  p4(stack(121, 128, 15, { pitch: 1.4, seg: 48 }), PR, "j5_bearing_housing");
  const pin = spinner(K, L4, V(-30, 0, 125), "z", pulleyParts(K, 7, 6, { gear: true, hub: -1, shaftFrom: -7, hubLen: 2 }), "j5_pinion");
  spins.push({ g: pin, axis: Z, fn: (S) => -S.q[4] * (23 / 7) });
  // printed half cover on the front, wires up the side
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(roundedShape(rect(-7, 50 + i * 10, 7, 54 + i * 10), 2));
  p4(yzSlab(K, roundedShape(rect(-13, 38, 13, 112), 5), 10, 13.5, 0.8, slots), PR, "fore_cover");
  for (const [y, z] of [[-9, 43], [9, 43], [-9, 107], [9, 107]]) bolt(K, L4, V(14, y, z), X, 1.8, 1.3, `fore_cover_screw${y}${z}`);
  bundle(K, L4, [[2, 13, 34], [2, 13, 70], [4, 13, 110], [8, 14, 118]], { n: 4, ties: [0.2, 0.7], name: "fore_wires" });
  bundle(K, L4, [[-30, 27, 108], [-20, 21, 100], [-6, 15, 90], [2, 13, 80]], { n: 4, ties: [0.5], name: "j5_motor_wires" });

  // link5: ring gear, printed coupler, rail, wrist cheeks
  const rg = gearShape(23, 30, 1.8);
  rg.holes.push(circle(0, 0, 15.5));
  p5(slab(rg, -14, -8, 0), "metal", "j5_ringgear");
  p5(stack(-8, 12, 18, { pitch: 1.6, seg: 56 }), PR, "fore_coupler");
  boltCircle(K, L5, 4, 12, V(0, 0, 12), Z, 1.6, "fore_coupler_bolt", Math.PI / 4);
  extrusion(K, L5, V(0, 0, 12), V(0, 0, 96), "fore_rail_high", { caps: false });
  p5(slab(roundedShape(rect(-22, -17, 22, 17), 5), 94, 102, 0.8), PR, "wrist_block");
  for (const s of [-1, 1]) bolt(K, L5, V(s * 22.6, 0, 98), V(s, 0, 0), 2, 1.4, `wrist_block_screw${s}`);
  const cheek = () => { const s = new THREE.Shape(); s.moveTo(-20, 98); s.lineTo(20, 98); s.lineTo(20, 134); s.absarc(0, 134, 20, 0, Math.PI, false); s.closePath(); return s; };
  p5(xzSlab(K, cheek(), -17, -11, 0.6, [circle(0, 134, 6), circle(0, 112, 4)]), PR, "wrist_cheekL");
  p5(xzSlab(K, cheek(), 11, 17, 0.6, [circle(0, 134, 6), circle(0, 112, 4)]), PR, "wrist_cheekR");
  for (const s of [-1, 1]) p5(alongY(turn([[3, 0], [9, 0, 0.3], [9, 1.4, 0.3], [3, 1.4]], { seg: 32 })).scale(1, s, 1).translate(0, s * 17.1 * MM, 134 * MM), "dark", `wrist_bearing${s}`);
  // wrist pitch: NEMA14 behind a mount plate, belt up to the wrist pulley
  const wm = V(-30, -10, 50);
  stepper(K, L5, frame(wm, X.clone().negate(), NY), { s: 35, L: 34, name: "wrist_motor", frontScrews: false });
  p5(xzSlab(K, roundedShape(rect(-49, 30, 11, 70), 5), -13.5, -10, 0.6, [circle(-30, 50, 7.5)]), PR, "wrist_motor_plate");
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bolt(K, L5, V(-30 + a * 13, -13.9, 50 + b * 13), NY, 2.1, 1.4, `wrist_motor_bolt${a}${b}`);
  for (const z of [38, 62]) bolt(K, L5, V(0, -13.9, z), NY, 2.4, 1.6, `wrist_plate_bolt${z}`);
  const wp = spinner(K, L5, V(-30, -21, 50), "y", pulleyParts(K, 6, 5, { hub: 1, shaftFrom: 11, hubLen: 3 }), "wrist_motor_pulley");
  spins.push({ g: wp, axis: Y, fn: (S) => S.q[5] * (18 / 6) });
  p5(xzSlab(K, beltShape([-30, 50], 6, [0, 134], 18), -23, -19), "rubber", "wrist_belt");
  bundle(K, L5, [[-57, 0, 50], [-52, 12, 68], [-30, 16, 80], [-6, 13, 86], [2, 13, 94]], { n: 4, ties: [0.5], name: "wrist_motor_wires" });
  bundle(K, L5, [[4, 12, 14], [4, 12, 50], [4, 12, 90]], { n: 3, ties: [0.3, 0.75], name: "fore_high_wires" });
}

/* ---------- link6 / link7: wrist housing with the roll motor showing, tool flange ---------- */
function buildWrist() {
  const { rig, turn, tubeProfile, alongY } = K;
  const L6 = rig.link6, L7 = rig.link7;
  const p6 = (g, r, n) => K.part(L6, g, r, n), p7 = (g, r, n) => K.part(L7, g, r, n);
  p6(alongY(stack(-10, 10, 18, { pitch: 1.5, seg: 56 })), PR, "wrist_hub");
  p6(cylY(3, -27, 19, 16), "steel", "wrist_axle");
  nut(K, L6, V(0, 17.5, 0), Y, 3.6, "wrist_axle_R");
  linkPulley(L6, -21, 18, 5, "wrist_pulley", -1, 4);
  // housing shell open on one side, the NEMA11 roll motor visible inside
  const wall = [[19.4, 14], [22, 14, 0.6]];
  for (let z = 15.6; z < 54; z += 1.6) wall.push([22, z], [21.78, z + 0.8]);
  wall.push([22, 56, 0.6], [19.4, 56], [19.4, 14]);
  p6(turn(wall, { seg: 64, phiStart: 0.95, phiLength: Math.PI * 2 - 1.9 }), PR, "wrist_shell");
  for (const a of [0.95, Math.PI * 2 - 0.95]) p6(box(2.6, 42, 0.8).rotateX(Math.PI / 2).translate(0, -20.7 * MM, 35 * MM).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)), PR, `wrist_shell_edge${a.toFixed(1)}`);
  stepper(K, L6, frame(V(0, 0, 52), Y.clone().negate(), Z), { s: 28, L: 32, name: "j7_motor", frontScrews: false, label: false });
  p6(turn([[9, 52], [22, 52, 0.6], [22, 57, 0.6], [9, 57]], { seg: 64 }), PR, "wrist_top");
  boltCircle(K, L6, 4, 16, V(0, 0, 57), Z, 1.5, "wrist_top_bolt", Math.PI / 4);
  p6(turn(tubeProfile(57, 61.5, 17, 17, 0.3, 0.3), { seg: 48 }), "dark", "j7_bearing");
  // link7: printed rotating flange, aluminium adapter plate, printed wrist block
  p7(stack(0, 12, 21, { pitch: 1.5, seg: 64 }), PR, "j7_flange");
  p7(turn(tubeProfile(12, 17, 23.5, 23.5, 0.5, 0.6), { seg: 64 }), "metal", "adapter");
  boltCircle(K, L7, 6, 19.5, V(0, 0, 17), Z, 1.6, "adapter_bolt", 0.2);
  p7(turn(tubeProfile(17, 28, 20, 20.5, 0.5, 1), { seg: 56 }), PR, "wrist_block");
}

/* ---------- cables that jump the joints ---------- */
function buildCables() {
  const { rig, base } = K;
  const mk = (a, b, o) => cables.push(flexCable(K, base, a, b, o));
  const d = (x, y, z) => V(x, y, z).normalize();
  mk(anchor(K, base, -32, -57, 78), anchor(K, rig.link1, -50, -10, 31), { tA: d(-0.2, 0.2, 1), tB: d(0, 0, -1), radius: 3, sag: 0.02, name: "cable_base" });
  mk(anchor(K, rig.link1, -46, 8, 105), anchor(K, rig.link3, -47, 6, 14), { tA: Z, tB: d(0, 0, -1), radius: 2.6, sag: 0.008, name: "cable_shoulder_a" });
  mk(anchor(K, rig.link1, -44, -12, 105), anchor(K, rig.link2, -34, -26, 40), { tA: Z, tB: d(0, -0.3, -1), radius: 1.8, role: "paint", sag: 0.006, name: "cable_shoulder_b" });
  mk(anchor(K, rig.link3, -44, 8, 203), anchor(K, rig.link4, 4, 14, 34), { tA: Z, tB: d(0, 0, -1), radius: 2.4, sag: 0.01, name: "cable_elbow" });
  mk(anchor(K, rig.link4, 8, 14, 119), anchor(K, rig.link5, 4, 13, 14), { tA: Z, tB: d(0, 0, -1), radius: 1.8, role: "paint", sag: 0.004, stiffness: 0.5, name: "cable_forearm" });
  mk(anchor(K, rig.link5, 3, 14, 96), anchor(K, rig.link6, 14, 16, 30), { tA: Z, tB: d(0, 0, -1), radius: 1.8, sag: 0.006, name: "cable_wrist" });
}

/* ======================================================================= HAND */
// Palm: layer-lined printed shell, open back over a bed of three micro servos, a half cover at the wrist.
export function palm(k, palm) {
  K = lean(k);
  const { PALM, FINGERS, THUMB, slab, roundedShape, rect, turn, alongY } = K;
  const hw = (y) => 34 + (12 / PALM.length) * y;
  const trap = (inset, y0, y1) => [[-(hw(y0) - inset), y0], [hw(y0) - inset, y0], [hw(y1) - inset, y1], [-(hw(y1) - inset), y1]];
  const put = (g, r, n) => K.part(palm, g, r, n);
  // wrist block (joins the link7 flange)
  put(alongY(stack(-1, 8, 20, { pitch: 1.5, seg: 56 })), PR, "wrist_socket");
  // grip-side shell and the side walls, built up in layers
  layered(K, palm, (i) => roundedShape(trap(2 + i, 3, 93), 9), -14, -5, 1.5, PR, "palm_front");
  layered(K, palm, (i) => roundedShape(trap(2 + i, 3, 93), 9), -5, 11, 1.6, PR, "palm_wall", (i) => [roundedShape(trap(5 - i, 6, 90), 6)]);
  // half cover over the wrist end of the back, with vents and screws
  const vents = [];
  for (let i = 0; i < 4; i++) vents.push(roundedShape(rect(-18, 18 + i * 7, 18, 21 + i * 7), 1.5));
  put(slab(roundedShape(trap(2.4, 3, 50), 8), 11, 14, 0.8, vents), PR, "palm_cover");
  for (const [x, y] of [[-30, 9], [30, 9], [-33, 45], [33, 45]]) bolt(K, palm, V(x, y, 14.6), Z, 1.6, 1.1, `palm_cover_screw${x}`);
  for (const s of [-1, 1]) for (const y of [24, 66]) bolt(K, palm, V(s * (hw(y) - 1.4), y, 2), V(s, 0, 0), 1.6, 1.1, `palm_side_screw${s}${y}`);
  // grip pads
  put(slab(roundedShape([[8, 14], [30, 14], [34, 52], [12, 52]], 8), -15.2, -13.6, 0.5), "pad", "pad_heel");
  for (const [n, f] of Object.entries(FINGERS)) put(slab(roundedShape(K.rect(f.at[0] - 6, f.at[1] - 26, f.at[0] + 6, f.at[1] - 14), 4), -15.2, -13.6, 0.5), "pad", `pad_${n}`);
  // servo bed: three micro servos lying in the palm, horns up through the open back
  const servos = [[-24, "index"], [-4, "middle"], [16, "ringlittle"]];
  for (const [x, n] of servos) {
    const yc = 66;
    put(box(10.5, 21, 16, x, yc, 3), "gloss", `servo_${n}_body`);
    put(box(10.5, 29, 1.6, x, yc, 7), "gloss", `servo_${n}_tabs`);
    for (const s of [-1, 1]) bolt(K, palm, V(x, yc + s * 12.5, 7.8), Z, 1.1, 0.8, `servo_${n}_screw${s}`);
    put(box(9.6, 13, 1.2, x, yc + 3, 11.5), "gloss", `servo_${n}_cap`);
    put(cylZ(3.1, 11, 12.8, 20, x, yc + 5), "gloss", `servo_${n}_boss`);
    put(cylZ(1.4, 12.8, 13.6, 12, x, yc + 5), "steel", `servo_${n}_spline`);
    bundle(K, palm, [[x, yc - 10.5, 1], [x * 0.7, yc - 22, 3], [x * 0.4, 30, 5], [x * 0.2, 12, 6]], { n: 3, rw: 0.55, name: `servo_${n}_wires`, roles: ["rubber", "paint", "titanium"] });
    // the horn turns with the finger
    const g = spinner(K, palm, V(x, yc + 5, 13.8), "z", [
      [K.slab(roundedShape(K.rect(-8.5, -1.9, 8.5, 1.9), 1.8), 0, 1.4, 0), "paint", "horn"],
      [cylZ(3, 0, 2.4, 20), "paint", "hornboss"],
      [cylZ(1.2, 2.4, 3, 10), "steel", "hornscrew"],
    ].map(([geo, r, nn]) => [geo.rotateX(-Math.PI / 2), r, nn]), `servo_${n}_horn`);
    const keys = n === "ringlittle" ? ["ring", "little"] : [n];
    horns.push({ g, fn: (h) => THREE.MathUtils.degToRad(keys.reduce((s, f) => s + (h[`${f}_1`] + h[`${f}_2`]) * 0.32, 0) / keys.length) });
    // tendons: from each horn arm to the finger's knuckle block (live, they follow the horn)
    const fingers = n === "ringlittle" ? [["ring", -1], ["little", 1]] : [[n, -1], [n, 1]];
    for (const [f, side] of fingers) {
      const F = FINGERS[f];
      const end = V(F.at[0] + (n === "ringlittle" ? 0 : side * 2.5), F.at[1] - 15, 7).multiplyScalar(MM);
      const m = K.livePart(palm, new THREE.CylinderGeometry(0.42 * MM, 0.42 * MM, 1, 6), "rubber", `tendon_${f}${side}`);
      tendons.push({ m, horn: g, tip: V(side * 7.5, 0, 0.7).multiplyScalar(MM), end });
    }
  }
  // the cable from the wrist into the palm (the palm only exists from here on)
  cables.push(flexCable(K, K.base, anchor(K, K.rig.link6, -14, 16, 44), anchor(K, palm, 18, 6, 9), { tA: Z, tB: V(0, -1, 0.2).normalize(), radius: 1.6, sag: 0.004, name: "cable_hand" }));
  // thumb mount: a printed arm out of the palm edge carrying the thumb turret
  const t = THUMB.at;
  put(slab(roundedShape([[-36, 12], [-24, 12], [-24, 44], [-38, 42]], 5), -13, 3, 1), PR, "thumb_mount");
  bolt(K, palm, V(-30, 18, 3.6), Z, 1.5, 1, "thumb_mount_screw0");
  bolt(K, palm, V(-30, 38, 3.6), Z, 1.5, 1, "thumb_mount_screw1");
}

// Finger proportions: body half-width and depth radius per bone, x finger radius.
const FW = [0.98, 0.88, 0.8], FA = [0.94, 0.86, 0.78], FB = 0.92;
const knuckleR = (d) => (d / 2) * 0.95;
const cheekIn = (W) => W * 0.5;

// Knuckle: a printed block in the palm with clevis cheeks embracing the first bone's tongue.
export function knuckle(k, root, f, name) {
  K = lean(k);
  const r = f.d / 2, W = r * FW[0], ci = cheekIn(W), Ak = knuckleR(f.d);
  K.part(root, K.slab(K.roundedShape(K.rect(-W, -15, W, -6), 2.5), -Ak, Ak, 0.8).translate(0, 0, 0), PR, `${name}_knuckle_block`);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? ci : -W, x1 = s > 0 ? W : -ci;
    K.part(root, stadium(Ak, Ak, 11, x0, x1).translate(0, -11 * MM, 0), PR, `${name}_clevis${s > 0 ? "R" : "L"}`);
  }
  // a tendon guide hole on top of the block
  K.part(root, cylZ(1.6, Ak - 0.6, Ak + 0.4, 14, 0, -12).scale(1, 1, 1), PR2, `${name}_guide`);
  return W;
}
// Thumb root: a printed swivel turret on the thumb mount.
export function thumbRoot(k, root) {
  K = lean(k);
  const { THUMB } = K;
  const r = THUMB.d / 2, W = r * FW[0];
  K.part(root, stack(-9, 7, 11.5, { pitch: 1.5, seg: 48 }), PR, "thumb_turret");
  K.part(root, cylZ(4, 7, 8.4, 20), PR2, "thumb_turret_cap");
  bolt(K, root, V(0, 0, 8.4), Z, 2, 1.2, "thumb_turret_bolt");
  return W;
}

// stadiumPlate but with low bevel segments (fingers have many of these)
function stadium(a, b, L, x0, x1, bevel = 0.5) {
  const s = new THREE.Shape();
  s.moveTo(a, 0); s.lineTo(b, L); s.absarc(0, L, b, 0, Math.PI, false); s.lineTo(-a, 0); s.absarc(0, 0, a, Math.PI, Math.PI * 2, false);
  const t = Math.abs(x1 - x0);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.05, t - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 14 });
  g.translate(0, 0, bevel).rotateY(-Math.PI / 2).translate(Math.max(x0, x1), 0, 0);
  return g.scale(MM, MM, MM);
}

// A finger body outline in the y-z plane (hinge at the origin), spanning x0..x1: its base edge is a
// concave arc of radius R round the hinge, so it rolls round the knuckle before it with a constant
// small clearance; its far end is round (radius b, centred at y = L).
function phalanx(a, b, R, L, x0, x1, bevel = 0.5) {
  a = Math.min(a, R - 0.4);
  const yc = Math.sqrt(R * R - a * a), s = new THREE.Shape();
  s.moveTo(a, yc); s.lineTo(b, L); s.absarc(0, L, b, 0, Math.PI, false); s.lineTo(-a, yc);
  s.absarc(0, 0, R, Math.atan2(yc, -a), Math.atan2(yc, a), true);
  const t = Math.abs(x1 - x0);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.05, t - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 14 });
  g.translate(0, 0, bevel).rotateY(-Math.PI / 2).translate(Math.max(x0, x1), 0, 0);
  return g.scale(MM, MM, MM);
}

// A printed phalanx: a dark tongue at its base hinge (sitting between the cheeks of the bone before),
// a white body whose far end splits into clevis cheeks for the next bone, a screw through each hinge,
// tendon lines down the palm side and the back, and on the last bone a rubber fingertip pad.
export function segment(k, g, length, d, i, name, tip, prevR) {
  K = lean(k);
  const r = d / 2, W = r * FW[i], A = r * FA[i], B = A * FB;
  const L = tip ? length - B : length;
  const Bp = i === 0 ? knuckleR(d) : r * FA[i - 1] * FB;          // radius of the cheeks round this base hinge
  const Wp = r * FW[Math.max(0, i - 1)];
  const wt = cheekIn(Wp) - 0.5, Rt = Bp - 0.6;                      // tongue half-width and radius
  const ci = cheekIn(W), R = Bp + 1;                                // body clears those cheeks by 1 mm
  const put = (geo, role, n) => K.part(g, geo, role, `${name}_${n}`);
  put(stadium(Rt, A * 0.6, R + 3, -wt, wt, 0.4), PR2, "tongue");
  if (tip) put(phalanx(A, B, R, L, -W, W, 0.8), PR, "body");
  else {
    for (const s of [-1, 1]) put(phalanx(A, B, R, L, s > 0 ? ci : -W, s > 0 ? W : -ci, 0.6), PR, `cheek${s > 0 ? "R" : "L"}`);
    const Rn = B - 0.6, Bm = A * 0.7, Lm = Math.max(R + 2, L - Rn - 1 - Bm);
    put(phalanx(A, Bm, R, Lm, -ci - 0.2, ci + 0.2, 0.5), PR, "web");
  }
  // hinge screw with a nut on the far side
  put(cylX(Rt * 0.3, -prevR - 0.6, prevR + 0.6, 12), "steel", "pin");
  bolt(K, g, V(prevR + 0.5, 0, 0), X, Math.max(1.4, Rt * 0.42), 1, `${name}_pinhead`);
  put(cylX(Math.max(1.4, Rt * 0.42), -prevR - 1.6, -prevR - 0.3, 6), "steel", "pinnut");
  // tendons (flexor on the palm side, extensor on the back) through small printed guides
  const zt = Math.max(A, B) + 0.45, yEnd = tip ? L : L - 0.5;
  for (const s of [-1, 1]) {
    put(cylY(0.38, R, yEnd, 5, 0, s * zt), "rubber", `tendon${s > 0 ? "B" : "F"}`);
    for (const yy of [R + 3, L - (tip ? 2 : B + 0.5)]) put(box(3.6, 2, 1.2, 0, yy, s * (zt - 0.2)), PR, `guide${s > 0 ? "B" : "F"}${yy.toFixed(0)}`);
  }
  if (tip) {
    put(new THREE.SphereGeometry(MM, 20, 12).scale(W * 0.82, B * 1.05, B * 0.5).translate(0, (L - B * 0.25) * MM, -B * 0.62 * MM), "pad", "tippad");
    const o = new THREE.Object3D();
    o.position.y = L * MM;
    o.userData.r = B;
    g.add(o);
    return o;
  }
}
export const endRadius = (i, d) => (d / 2) * FW[i];

/* ======================================================================= MOTION */
const qa = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
export function update(t, dt, S) {
  for (const s of spins) s.g.quaternion.setFromAxisAngle(s.axis, s.fn(S));
  if (fan) { fanAngle += dt * 26; fan.quaternion.setFromAxisAngle(Y, fanAngle); }
  for (const l of leds) l.m.visible = !!l.fn(t);
  for (const h of horns) h.g.quaternion.setFromAxisAngle(Z, h.fn(S.handNow));
  for (const td of tendons) {
    va.copy(td.tip).applyQuaternion(td.horn.quaternion).add(td.horn.position);
    vb.copy(td.end);
    const len = va.distanceTo(vb);
    td.m.position.copy(va).add(vb).multiplyScalar(0.5);
    td.m.quaternion.setFromUnitVectors(up, vb.sub(va).normalize());
    td.m.scale.set(1, len, 1);
  }
  for (const c of cables) c.update();
}
