// "Hydraulic": a heavy-duty hydraulic test-rig prototype.
// A skeletal graphite frame (twin truss beams with lightening cut-outs, forged titanium lugs and crank
// levers on big pivot pins with retaining clips and grease nipples) driven by tie-rod hydraulic
// cylinders at every pitch joint: twin cylinders at the shoulder, one each at elbow and wrist, each with
// a load-holding valve block and a looped steel line, all re-aimed every frame so the chrome rods slide
// in and out with the joints. The roll joints and the base slew are driven by small hydraulic motors
// whose pinions turn against slewing-ring gears. The turret is an excavator-style "house": pump unit on
// a reservoir tank, a valve block with solenoid coils and a pressure gauge, an accumulator bottle and a
// ruggedised control box with blinking lamps. Rubber hoses with crimped fittings flex across the joints;
// steel hard lines run along the static frames. Satin guard plates (perforated, ribbed) cover parts of it.
// Hand: plate-steel phalanges with exposed pivot bolts and lock-nuts, a tiny hydraulic actuator on the
// back of every joint (they extend as the finger curls), a palm with a manifold block and rubber pads.
import * as THREE from "three";
import { bolt, boltCircle, anchor, flexCable } from "./parts.js";
import { V, hullShape, circleHole, triHole, xzPlate, yzPlate, xyPlate, cylAlong, hexNut, pivotPin, pipe, hoseEnd, gearShape, hydraulic } from "./proto_hydraulic_parts.js";

export const label = "Hydraulic";
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1), NX = V(-1, 0, 0), NY = V(0, -1, 0), NZ = V(0, 0, -1);
const CURL = V(-1, 0, 0);
const ST = { cyls: [], cables: [], pinions: [], lamps: [], needle: null, last: null, load: 0, prevQ: null, needleA: 0 };

/* ---------- Arm ---------- */
export function arm(K) {
  const { MM, rig, base, part, turn, alongY, roundedShape, rect } = K;
  const L = (pts, seg = 40) => turn(pts, { seg, steps: 4 });
  const disc = (z0, z1, r, f = 0.6) => [[0, z0], [r, z0, f], [r, z1, f], [0, z1]];
  // a lathe turned about the y axis, centred at (x, z)
  const drumY = (owner, x, z, r, y0, y1, role, name, f = 1.5, seg = 40) => part(owner, alongY(L(disc(y0, y1, r, f), seg)).translate(x * MM, 0, z * MM), role, name);
  // a lathe about a vertical axis through (x, y)
  const post = (owner, x, y, pts, role, name, seg = 28) => part(owner, L(pts, seg).translate(x * MM, y * MM, 0), role, name);
  const box = (owner, x0, y0, z0, x1, y1, z1, role, name, rad = 2, bevel = 0.8) => part(owner, xyPlate(roundedShape(rect(x0, y0, x1, y1), rad), z0, z1, bevel, 4), role, name);
  // Warren-truss cut-outs in a strip |x| < hx between z0 and z1, n triangles
  const warren = (hx, z0, z1, n, web = 4) => {
    const h = (z1 - z0) / (n + 1), holes = [];
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? -1 : 1;
      holes.push(triHole(roundedShape, [s * hx, z0 + k * h], [-s * hx, z0 + (k + 1) * h], [s * hx, z0 + (k + 2) * h], web, 2.5));
    }
    return holes;
  };
  const withHoles = (shape, holes) => (shape.holes.push(...holes), shape);
  // a crank lever on a pin end (x-z plane, between y0 and y1), from the joint axis to the rod pin B
  const crank = (owner, bx, bz, rA, rB, y0, y1, name) => part(owner, xzPlate(hullShape([[0, 0, rA], [bx, bz, rB]], 24), y0, y1, 1, 8), "titanium", name);
  // a retainer cap on an outer face (normal = sign * y) at (x, z)
  const retainer = (owner, x, z, y, s, r, name) => {
    drumY(owner, x, z, r, s > 0 ? y : y - 2.2, s > 0 ? y + 2.2 : y, "steel", name, 0.6, 28);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; bolt(K, owner, V(x + Math.cos(a) * r * 0.62, y + s * 2.2, z + Math.sin(a) * r * 0.62), V(0, s, 0), 1.6, 1.1, `${name}_bolt${k}`); }
    part(owner, cylAlong(1.5, 2.2, V(0, s, 0), V(x, y + s * 2.2, z), 6), "titanium", `${name}_nipple`);
    part(owner, new THREE.SphereGeometry(1.25 * MM, 10, 8).translate(x * MM, (y + s * 4.6) * MM, z * MM), "titanium", `${name}_nippleball`);
  };
  // a clevis bracket: two ears around a pin at (x, z) in planes y = yc +- (w/2 .. w/2 + t), grown
  // from a base block below it
  const clevis = (owner, x, z, yc, w, t, r, baseCircles, name) => {
    for (const s of [1, -1]) {
      const y0 = yc + s * (w / 2 + 0.4), y1 = yc + s * (w / 2 + 0.4 + t);
      part(owner, xzPlate(hullShape([[x, z, r], ...baseCircles], 20), Math.min(y0, y1), Math.max(y0, y1), 0.8, 8), "titanium", `${name}_ear${s}`);
    }
    pivotPin(K, owner, x, z, r * 0.42, yc - w / 2 - t - 0.4, yc + w / 2 + t + 0.4, { name: `${name}_pin`, nipple: true, clip: true });
  };
  // A slewing drive: ring gear on the child (teeth between child-frame z0 and z1), pinion live on the
  // parent at angle ang, a hydraulic motor below the pinion from parent-frame z mz0 to mz1.
  const slew = (parent, child, nR, rp, nP, ang, z0, z1, mz0, mz1, mr, qi, sign, name, bore, dzOver = null) => {
    const m = (2 * rp) / nR, rpp = (m * nP) / 2, cd = rp + rpp, px = Math.cos(ang) * cd, py = Math.sin(ang) * cd;
    const dz = dzOver ?? child.position.z / MM;   // ring frame -> parent frame
    part(child, xyPlate(gearShape(nR, rp - 1.25 * m, rp + m, bore), z0, z1, 0.3, 2), "steel", `${name}_ring`);
    const pz0 = z0 + dz, pz1 = z1 + dz;
    const pin = K.livePart(parent, xyPlate(gearShape(nP, rpp - 1.25 * m, rpp + m, 0), -(pz1 - pz0) / 2, (pz1 - pz0) / 2, 0.3, 2), "steel", `${name}_pinion`, [px, py, (pz0 + pz1) / 2]);
    ST.pinions.push({ mesh: pin, qi, ratio: sign * (nR / nP) });
    part(parent, L(disc(Math.min(pz0, mz1) - 0.5, Math.max(pz1, mz1) + 0.5, rpp * 0.35)).translate(px * MM, py * MM, 0), "joint", `${name}_shaft`);
    const lo = Math.min(mz0, mz1), hi = Math.max(mz0, mz1);
    post(parent, px, py, [[0, lo], [mr, lo, 2], [mr, hi - 4, 0.5], [mr + 3, hi - 4, 0.5], [mr + 3, hi, 0.6], [0, hi]], "metal", `${name}_motor`);
    post(parent, px, py, [[0, lo + 4], [mr + 0.6, lo + 4, 0.3], [mr + 0.6, lo + 7, 0.3], [0, lo + 7]], "joint", `${name}_band`);
    const up = mz1 > mz0 ? 1 : -1, face = mz1;
    boltCircle(K, parent, 4, mr + 1.4, V(px, py, face), V(0, 0, up), 1.1, `${name}_motorbolt`, Math.PI / 4);
    // two ports with short hard lines
    for (const s of [1, -1]) {
      const a = ang + s * 0.9, at = V(px + Math.cos(a) * mr, py + Math.sin(a) * mr, (lo + hi) / 2 - s * 3);
      part(parent, cylAlong(2.4, 3, V(Math.cos(a), Math.sin(a), 0), at, 6), "steel", `${name}_port${s}`);
    }
    return { px, py };
  };
  const cyl = (o) => { const c = hydraulic(K, o); ST.cyls.push(c); return c; };
  const hose = (A, B, tA, tB, o = {}) => { const c = flexCable(K, base, A, B, { tA, tB, radius: 3.6, sag: 0.01, segments: 32, radial: 10, stiffness: 0.42, name: "hose", ...o }); ST.cables.push(c); return c; };

  /* ----- Base: a bolted steel bench plate, pedestal with gussets, fixed slewing-ring gear ----- */
  const slots = [[-100, -106, -56, -96], [56, -106, 100, -96], [-100, 96, -56, 106], [56, 96, 100, 106]].map(([a, b, c, d]) => roundedShape(rect(a, b, c, d), 5));
  part(base, xyPlate(withHoles(roundedShape(rect(-128, -118, 128, 118), 20), slots), 0, 12, 1.5, 8), "joint", "bench_plate");
  part(base, L(disc(12, 15, 92, 0.6), 64), "metal", "bench_pad");
  part(base, L([[0, 15], [84, 15, 2], [84, 19, 1.5], [70, 23, 3], [66, 32, 2], [62, 34], [0, 34]], 64), "joint", "pedestal");
  for (let k = 0; k < 12; k++) {
    const g = xzPlate(new THREE.Shape([new THREE.Vector2(64, 18), new THREE.Vector2(86, 18), new THREE.Vector2(86, 20), new THREE.Vector2(67, 32), new THREE.Vector2(64, 32)]), -2, 2, 0.5, 2);
    part(base, g.rotateZ((k / 12) * Math.PI * 2 + 0.26), "joint", `gusset${k}`);
  }
  boltCircle(K, base, 24, 76, V(0, 0, 19), Z, 2.2, "pedestal_bolt", 0.13);
  for (const [x, y] of [[-112, -70], [112, -70], [-112, 70], [112, 70], [-30, -104], [30, -104], [-30, 104], [30, 104]]) hexNut(K, base, V(x, y, 12), Z, 5.2, 5, `anchor${x}_${y}`);
  // electrical inlet with its supply cable trailing off the plate
  box(base, -122, -110, 12, -94, -84, 34, "joint", "inlet_box", 3);
  for (const [x, y] of [[-119, -107], [-97, -107], [-119, -87], [-97, -87]]) bolt(K, base, V(x, y, 34), Z, 1.3, 0.9, `inlet_screw${x}${y}`);
  part(base, cylAlong(5, 5, NX, V(-122, -97, 23), 6), "steel", "inlet_gland");
  part(base, cylAlong(4.6, 4, NX, V(-127, -97, 23), 14), "rubber", "inlet_boot");
  pipe(K, base, [[-130, -97, 23], [-142, -97, 23], [-150, -97, 4], [-190, -100, 3]], 3.6, { bend: 10, role: "rubber", name: "supply_cable", radial: 10 });

  /* ----- House (link1): deck, uprights, pump unit, valve block, accumulator, control box ----- */
  const h = rig.link1;   // z: deck at 0, shoulder axis at 118
  const SH = 118;
  slew(h, base, 60, 85.2, 11, deg(100), 34, 46, 10, 48, 14, 0, 1, "j1", 52, -46);
  part(h, xyPlate(hullShape([[0, 0, 86], [-104, 50, 16], [-104, -50, 16], [66, 62, 18], [66, -62, 18], [-17.5, 99.4, 22]], 24), 0, 10, 1.4, 8), "joint", "deck");
  boltCircle(K, h, 18, 78, V(0, 0, 10), Z, 2, "deck_bolt", 0.1);
  // the pinion's ear on the deck, cut through for the shaft
  // uprights: twin forged plates with lightening holes, bearing bosses for the shoulder pin
  const upHoles = () => [circleHole(-26, 30, 7.5), circleHole(26, 30, 7.5), triHole(roundedShape, [-26, 46], [26, 46], [0, 94], 3, 4)];
  for (const s of [1, -1]) {
    part(h, xzPlate(withHoles(hullShape([[-46, 14, 8], [46, 14, 8], [0, SH, 46]], 32), upHoles()), s > 0 ? 32 : -42, s > 0 ? 42 : -32, 1.2, 10), "joint", `upright${s}`);
    drumY(h, 0, SH, 22, s > 0 ? 42 : -46.5, s > 0 ? 46.5 : -42, "titanium", `j2_boss${s}`, 1);
    boltCircle(K, h, 6, 17.5, V(0, s * 46.5, SH), V(0, s, 0), 1.7, `j2_bossbolt${s}`);
    // angle brackets tying the uprights to the deck
    for (const x of [-38, 38]) {
      part(h, xzPlate(new THREE.Shape([new THREE.Vector2(x - 9, 10), new THREE.Vector2(x + 9, 10), new THREE.Vector2(x + 9, 13), new THREE.Vector2(x - 6, 26), new THREE.Vector2(x - 9, 26)]), s > 0 ? 42 : -48, s > 0 ? 48 : -42, 0.5, 2), "titanium", `bracket${s}${x}`);
      bolt(K, h, V(x - 4, s * 48, 18), V(0, s, 0), 2, 1.4, `bracketbolt${s}${x}`);
      bolt(K, h, V(x + 3, s * 45, 13), Z, 2, 1.4, `bracketbolt_d${s}${x}`);
    }
  }
  for (const [x, z] of [[-40, 74], [40, 74]]) {   // tie tubes between the uprights
    part(h, alongY(L(disc(-32, 32, 5.5), 20)).translate(x * MM, 0, z * MM), "steel", `tie${x}`);
    for (const s of [1, -1]) hexNut(K, h, V(x, s * 42, z), V(0, s, 0), 5, 3.5, `tienut${x}${s}`);
  }
  // shoulder cylinder lugs on the deck (front)
  for (const s of [1, -1]) {
    box(h, 50, s > 0 ? 46 : -76, 8, 82, s > 0 ? 76 : -46, 15, "joint", `lugbase${s}`, 3);
    for (const [x, y] of [[54, 50], [78, 50], [54, 72], [78, 72]]) bolt(K, h, V(x, s * y, 15), Z, 1.8, 1.2, `lugbolt${s}${x}${y}`);
    clevis(h, 66, 24, s * 60, 10, 5, 13, [[56, 15, 5], [76, 15, 5]], `j2lug${s}`);
  }
  // valve block with four solenoid valves and a pressure gauge
  box(h, 44, -27, 10, 82, 27, 44, "metal", "valve_block", 3, 1.2);
  for (const [x, y] of [[48, -23], [78, -23], [48, 23], [78, 23]]) bolt(K, h, V(x, y, 44), Z, 1.6, 1.2, `vb_bolt${x}${y}`);
  for (const y of [-18, -6, 6, 18]) {
    box(h, 54, y - 5, 44, 68, y + 5, 48, "metal", `valve_body${y}`, 1);
    box(h, 55, y - 4.6, 48, 67, y + 4.6, 63, "gloss", `solenoid${y}`, 2.5);
    post(h, 61, y, disc(63, 66, 2.2), "steel", `override${y}`, 12);
    box(h, 50, y - 3.4, 52, 55, y + 3.4, 60, "joint", `connector${y}`, 1);
    // its wire, down behind the block and off to the control box in a loom
    pipe(K, h, [[50, y, 56], [46, y, 56], [41, y * 0.4 - 18, 40], [41, -22, 16], [-26, -24, 16], [-26, -24, 31], [-26, -50, 31]], 0.9, { bend: 6, role: "rubber", name: `wire${y}`, radial: 5 });
  }
  part(h, cylAlong(3.4, 22, NY, V(-26, -28, 31), 12), "rubber", "loom_grommet");
  // gauge on the front face: stem, case, bezel, dial, tick marks, live needle, smoked cover
  const gx = 82, gz = 28;
  part(h, cylAlong(3, 5, X, V(gx, 0, gz), 6), "steel", "gauge_stem");
  const along = (pts, seg = 40) => L(pts, seg).rotateY(Math.PI / 2).translate((gx + 5) * MM, 0, gz * MM);
  part(h, along([[0, 0], [14, 0, 1], [14, 6, 0.5], [0, 6]]), "joint", "gauge_case");
  part(h, along([[13, 5.2], [15.4, 5.2, 0.4], [15.4, 7.4, 1], [12.2, 7.4, 0.3], [12.2, 6.4]]), "steel", "gauge_bezel");
  part(h, along(disc(5.6, 6.3, 12.4, 0.2), 48), "satin", "gauge_dial");
  for (let k = 0; k <= 10; k++) {
    const a = deg(-135 + 27 * k), big = k % 5 === 0;
    const g = new THREE.BoxGeometry(0.4 * MM, 0.8 * MM, (big ? 3.2 : 1.8) * MM).translate(0, 0, (10.4 - (big ? 1.6 : 0.9)) * MM).rotateX(-a);
    part(h, g.translate((gx + 11.45) * MM, 0, gz * MM), "joint", `gauge_tick${k}`);
  }
  ST.needle = K.livePart(h, new THREE.BoxGeometry(0.5 * MM, 0.9 * MM, 11.5 * MM).translate(0, 0, 3.6 * MM), "joint", "gauge_needle", [gx + 12, 0, gz]);
  part(h, along(disc(6.4, 7.6, 1.4, 0.4), 16), "steel", "gauge_hub");
  part(h, along([[0, 7.2], [12.3, 7.2, 0.3], [12.3, 7.6, 0.3], [0, 8.4]], 48), "smoke", "gauge_glass");
  // ports on the block's sides for the shoulder hoses, and on its back for the hard lines
  const vbPorts = {};
  for (const s of [1, -1]) vbPorts[s] = hoseEnd(K, h, V(63, s * 27, 30), V(0, s, 0), 3, `vb_hosefit${s}`);
  // reservoir tank (deck level) under the pump unit
  box(h, -116, -54, 10, -60, 54, 22, "joint", "tank", 4, 1.2);
  post(h, -70, -38, [[0, 22], [6, 22, 0.4], [6, 27, 1.5], [0, 27]], "steel", "filler_cap", 20);
  for (const [x, y] of [[-112, -50], [-64, -50], [-112, 50], [-64, 50], [-88, -50], [-88, 50]]) bolt(K, h, V(x, y, 22), Z, 1.6, 1.1, `tank_bolt${x}${y}`);
  // electric motor (along y) with cooling ribs, fan cowl, terminal box; coupling bell; gear pump
  const MX = -88, MZ = 47;
  const motorAt = (pts, seg = 48) => alongY(L(pts, seg)).translate(MX * MM, 0, MZ * MM);
  part(h, motorAt(disc(-44, 22, 20, 2)), "joint", "motor_body");
  const ribs = [[0, -40]];
  for (let z = -40; z <= 16; z += 4) ribs.push([20, z], [23.5, z + 1], [23.5, z + 2.6], [20, z + 3.6]);
  ribs.push([0, 19.6]);
  part(h, motorAt(ribs.map(([r, z]) => [r, z])), "joint", "motor_ribs");
  part(h, motorAt([[0, -56], [15, -56, 3], [22, -50, 2], [22, -43, 1], [0, -43]]), "metal", "fan_cowl");
  for (let k = 0; k < 4; k++) part(h, motorAt([[4 + k * 4, -56.6], [6 + k * 4, -56.6], [6 + k * 4, -55.4], [4 + k * 4, -55.4], [4 + k * 4, -56.6]], 32).translate(0, -1.2 * MM, 0), "joint", `cowl_grille${k}`);
  for (const y of [-34, 8]) { box(h, MX - 18, y - 5, 22, MX + 18, y + 5, 30, "joint", `motor_foot${y}`, 1.5); for (const x of [MX - 14, MX + 14]) bolt(K, h, V(x, y, 30), Z, 1.6, 1.2, `foot_bolt${x}${y}`); }
  box(h, MX - 9, -18, MZ + 19, MX + 9, 2, MZ + 30, "joint", "terminal_box", 2);
  part(h, cylAlong(3.6, 4, NX, V(MX - 9, -8, MZ + 24.5), 6), "steel", "terminal_gland");
  part(h, motorAt([[0, 22], [17, 22, 1], [15, 30, 1], [0, 30]]), "metal", "coupling_bell");
  boltCircle(K, h, 6, 14, V(MX, 22, MZ), NY, 1.4, "bell_bolt");
  box(h, MX - 12, 30, MZ - 13, MX + 12, 46, MZ + 13, "metal", "pump", 2.5, 1);
  for (const [x, z] of [[-9, -10], [9, -10], [-9, 10], [9, 10]]) bolt(K, h, V(MX + x, 46, MZ + z), Y, 1.6, 1.2, `pump_bolt${x}${z}`);
  // satin guard hood over the top of the motor (half-open, prototype), with three hoops
  part(h, alongY(turn([[25.5, -50], [27, -50], [27, 24], [25.5, 24]], { seg: 32, phiStart: deg(-30), phiLength: deg(150), steps: 2 })).translate(MX * MM, 0, MZ * MM), "satin", "motor_hood");
  for (const y of [-44, -13, 18]) part(h, alongY(turn([[27, y], [29, y, 0.5], [29, y + 3, 0.5], [27, y + 3]], { seg: 32, phiStart: deg(-30), phiLength: deg(150), steps: 2 })).translate(MX * MM, 0, MZ * MM), "satin", `hood_hoop${y}`);
  // pump outlet -> valve block (pressure), valve block -> tank (return), accumulator branch
  pipe(K, h, [[MX + 12, 40, MZ], [-62, 40, MZ], [-62, 18, 30], [-62, 18, 18], [44, 18, 18]], 2.6, { bend: 7, name: "p_line" });
  pipe(K, h, [[44, -18, 18], [-54, -18, 18], [-54, -18, 15], [-60, -18, 15]], 2.6, { bend: 5, name: "t_line" });
  pipe(K, h, [[MX, 46, MZ - 8], [MX, 52, MZ - 8], [MX, 52, 26], [MX, 48, 22]], 2.6, { bend: 5, name: "suction" });
  for (const [x, y, z, d] of [[44, 18, 18, X], [44, -18, 18, X], [-60, -18, 15, NX]]) part(h, cylAlong(4, 3.4, d, V(x, y, z).addScaledVector(d, -3.4), 6), "steel", `line_nut${x}${y}`);
  // accumulator bottle on a strap bracket off the +y upright
  post(h, -32, 60, [[0, 12], [13, 12, 3], [13, 72, 13], [5, 84, 1], [5, 87], [0, 87]], "metal", "accumulator", 36);
  post(h, -32, 60, [[0, 86], [5, 86, 0.6], [5, 92, 1.2], [0, 92]], "steel", "acc_valve", 6);
  post(h, -32, 60, disc(10, 13, 15, 0.5), "steel", "acc_foot", 32);
  for (const z of [28, 58]) {
    post(h, -32, 60, [[13, z], [14.6, z, 0.3], [14.6, z + 5, 0.3], [13, z + 5]], "steel", `acc_strap${z}`, 32);
    box(h, -38, 42, z - 1, -26, 47.5, z + 6, "titanium", `acc_bracket${z}`, 1);
  }
  pipe(K, h, [[-32, 47, 22], [-24, 40, 22], [-24, 30, 30], [-24, 18, 30], [-24, 18, 20]], 2, { bend: 5, name: "acc_line" });
  // control box: rugged enclosure, lid with screws, glands, two beacon lamps on top and a pilot lamp
  box(h, -58, -76, 10, -12, -50, 58, "joint", "control_box", 3, 1.2);
  box(h, -55, -79, 13, -15, -76, 55, "joint", "control_lid", 2.5, 0.8);
  for (const [x, z] of [[-52, 16], [-18, 16], [-52, 52], [-18, 52]]) bolt(K, h, V(x, -79, z), NY, 1.6, 1.2, `lid_screw${x}${z}`);
  for (const z of [22, 34]) { part(h, cylAlong(4.6, 4, NX, V(-58, -63, z), 6), "steel", `gland${z}`); part(h, cylAlong(3.6, 3.5, NX, V(-62, -63, z), 12, 2.6), "rubber", `gland_boot${z}`); }
  pipe(K, h, [[-65, -63, 34], [-74, -63, 34], [-80, -40, 60], [MX - 4, -12, MZ + 25]], 1.8, { bend: 8, role: "rubber", name: "motor_cable" });
  const lamp = (at, dir, role, period, duty, phase, name, r = 4.2) => {
    part(h, cylAlong(r + 1.4, 2.4, dir, at, 20), "steel", `${name}_bezel`);
    const lens = new THREE.SphereGeometry(r * MM, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    part(h, orient2(lens.clone(), dir, at.clone().addScaledVector(dir, 2.4)), "smoke", `${name}_lens`);
    const glow = K.live(part(h, orient2(new THREE.SphereGeometry((r - 0.5) * MM, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), dir, at.clone().addScaledVector(dir, 2.4)), role, `${name}_glow`));
    ST.lamps.push({ mesh: glow, period, duty, phase });
  };
  lamp(V(-46, -63, 58), Z, "glow", 1.1, 0.5, 0, "lamp_a");
  lamp(V(-26, -63, 58), Z, "ring", 0.7, 0.18, 0.3, "lamp_b");
  lamp(V(-35, -79, 44), NY, "glow", 2.4, 0.85, 0.9, "lamp_pilot", 3);
  // rear bulkhead for the upper-arm hoses: a cross plate between the uprights and a fitting block
  part(h, xyPlate(roundedShape(rect(-51, -32, -45, 32), 1), 50, 104, 0.6, 2).translate(0, 0, 0), "joint", "rear_cross_plate");
  box(h, -64, -16, 104, -46, 16, 114, "metal", "rear_block", 2);
  const rearFit = {};
  for (const s of [1, -1]) {
    pipe(K, h, [[44, s * 9, 26], [-40, s * 9, 26], [-40, s * 9, 98], [-55, s * 9, 98], [-55, s * 9, 104]], 2.2, { bend: 6, name: `riser${s}` });
    rearFit[s] = hoseEnd(K, h, V(-55, s * 8, 114), Z, 3, `rear_fit${s}`);
  }

  /* ----- Shoulder (link2): hub drum, pin and crank levers, neck, J3 slew drive ----- */
  const s2 = rig.link2;
  drumY(s2, 0, 0, 40, -30, 30, "joint", "j2_hub", 3, 56);
  for (const s of [1, -1]) {
    drumY(s2, 0, 0, 33, s > 0 ? 28 : -31.5, s > 0 ? 31.5 : -28, "titanium", `j2_flange${s}`, 1, 48);
    boltCircle(K, s2, 8, 27, V(0, s * 31.5, 0), V(0, s, 0), 1.8, `j2_flangebolt${s}`, Math.PI / 8);
  }
  pivotPin(K, s2, 0, 0, 12, -47, 47, { name: "j2_pin", head: false, clip: false });
  for (const s of [1, -1]) {
    crank(s2, 28, 0, 17, 11, s > 0 ? 47 : -53, s > 0 ? 53 : -47, `j2_crank${s}`);
    retainer(s2, 0, 0, s * 53, s, 11, `j2_ret${s}`);
    pivotPin(K, s2, 28, 0, 5.5, 53, 67.5, { name: `j2_rodpin${s}`, nipple: false, clip: false, axis: s > 0 ? "y" : "-y" });
  }
  part(s2, L([[0, 28], [34, 28, 2], [32, 54, 2], [0, 54]], 48), "joint", "j2_neck");
  part(s2, L([[0, 52], [43, 52, 1], [43, 66, 1], [40, 69, 0.5], [0, 69]], 64), "metal", "j3_stator");
  boltCircle(K, s2, 12, 38, V(0, 0, 66.5), Z, 1.6, "j3_statorbolt");
  slew(s2, rig.link3, 36, 41, 10, Math.PI, 2, 12, 34, 70, 10, 2, -1, "j3", 20);
  part(s2, xzPlate(roundedShape(rect(-58, 34, -32, 46), 3), -5, 5, 0.6, 3), "titanium", "j3_motor_arm");
  // shoulder cylinders: twin, outboard of the uprights
  const shoulder = {};
  for (const s of [1, -1]) shoulder[s] = cyl({ parent: h, child: s2, A: V(66, s * 60, 24), B: V(28, s * 60, 0), axis: Y, range: [-Math.PI, Math.PI], pin: Y, out: s, rb: 14, rr: 7, re: 11, w: 10, name: `j2cyl${s}` });

  /* ----- Upper arm (link3): ring gear, twin truss beams, perforated front guard, elbow lug ----- */
  const u = rig.link3, EL = 230;
  part(u, L([[0, 12], [37, 12, 1], [37, 22, 2], [0, 22]], 56), "joint", "u_flange");
  boltCircle(K, u, 10, 31, V(0, 0, 22), Z, 1.8, "u_flangebolt");
  for (const s of [1, -1]) {
    const beam = withHoles(hullShape([[-28, 20, 7], [28, 20, 7], [-27, 196, 8], [27, 196, 8], [0, EL, 36]], 32), warren(20, 36, 204, 4, 3.5));
    part(u, xzPlate(beam, s > 0 ? 24 : -32, s > 0 ? 32 : -24, 1.2, 10), "joint", `beam${s}`);
    drumY(u, 0, EL, 21, s > 0 ? 32 : -36, s > 0 ? 36 : -32, "titanium", `j4_boss${s}`, 1);
    boltCircle(K, u, 6, 16.5, V(0, s * 36, EL), V(0, s, 0), 1.6, `j4_bossbolt${s}`);
    for (const z of [24, 70, 120, 168]) for (const x of [-30, 30]) bolt(K, u, V(x, s * 32, z), V(0, s, 0), 2.2, 1.5, `beam_bolt${s}${x}${z}`);
  }
  for (const [x, z] of [[-30, 24], [30, 24], [30, 120], [-30, 168], [30, 196]]) part(u, alongY(L(disc(-24, 24, 4.5), 18)).translate(x * MM, 0, z * MM), "steel", `u_spacer${x}${z}`);
  // perforated satin guard over the front, on stand-offs, with folded edges
  const perf = [];
  for (let zi = 0; zi < 10; zi++) for (let yi = 0; yi < (zi % 2 ? 4 : 5); yi++) perf.push(circleHole(54 + zi * 11.5, (zi % 2 ? -15 : -20) + yi * 10, 2.6, 12));
  part(u, yzPlate(withHoles(roundedShape(rect(40, -30, 166, 30), 6), perf), 36, 38, 0.4, 6), "satin", "u_guard");
  for (const s of [1, -1]) part(u, xzPlate(roundedShape(rect(30, 42, 37, 164), 1), s > 0 ? 28.5 : -30, s > 0 ? 30 : -28.5, 0.3, 2), "satin", `u_guard_flange${s}`);
  for (const z of [46, 160]) for (const y of [-25, 25]) { part(u, cylAlong(2.4, 4, X, V(32, y, z), 6), "steel", `u_standoff${y}${z}`); bolt(K, u, V(38, y, z), X, 1.8, 1.2, `u_guardbolt${y}${z}`); }
  // elbow cylinder lug bolted on the +y beam
  box(u, -54, 32, 80, -26, 62, 96, "joint", "j4_lugbase", 3);
  for (const [x, z] of [[-50, 84], [-30, 84], [-50, 92], [-30, 92]]) bolt(K, u, V(x, 62, z), Y, 1.5, 1.1, `j4_lugbolt${x}${z}`);
  clevis(u, -40, 110, 50, 10, 5, 12, [[-48, 94, 4], [-32, 94, 4]], "j4lug");
  // hard lines up the back: two risers, a branch out to the elbow cylinder, a block at the top
  box(u, -38, -15, 22, -24, 15, 34, "metal", "u_block_lo", 2);
  box(u, -38, -15, 196, -24, 15, 206, "metal", "u_block_hi", 2);
  const uLo = {};
  for (const s of [1, -1]) {
    uLo[s] = hoseEnd(K, u, V(-38, s * 8, 28), NX, 3, `u_fit_lo${s}`);
    pipe(K, u, [[-31, s * 8, 34], [-31, s * 8, 196]], 2.2, { name: `u_riser${s}` });
  }
  part(u, cylAlong(3.2, 6, Z, V(-31, 8, 142), 6), "steel", "u_tee");
  pipe(K, u, [[-31, 8, 145], [-31, 12, 145], [-22, 22, 148], [-20, 33, 148]], 2, { bend: 5, name: "u_branch" });
  const uBranch = hoseEnd(K, u, V(-20, 33, 148), Y, 3, "u_fit_branch");
  const uHi = hoseEnd(K, u, V(-38, 0, 201), NX, 3.2, "u_fit_hi");
  // flex hoses: valve block -> shoulder cylinders, house -> upper arm
  for (const s of [1, -1]) {
    const c = shoulder[s], p = c.barrel.userData.port;
    hose(anchor(K, h, vbPorts[s].x, vbPorts[s].y, vbPorts[s].z), anchor(K, c.barrel, p.x, p.y, p.z), V(0, s, 0), V(0, s, 0), { stiffness: 0.5 });
    hose(anchor(K, h, rearFit[s].x, rearFit[s].y, rearFit[s].z), anchor(K, u, uLo[s].x, uLo[s].y, uLo[s].z), Z, NX, { stiffness: 0.5, radius: 3.4 });
  }

  /* ----- Elbow (link4): hub, pin, crank, plates, mini valve stack, J5 slew drive ----- */
  const e = rig.link4;
  drumY(e, 0, 0, 32, -22, 22, "joint", "j4_hub", 3, 48);
  for (const s of [1, -1]) {
    drumY(e, 0, 0, 26, s > 0 ? 20 : -23.5, s > 0 ? 23.5 : -20, "titanium", `j4_flange${s}`, 1, 40);
    boltCircle(K, e, 6, 21, V(0, s * 23.5, 0), V(0, s, 0), 1.5, `j4_flangebolt${s}`);
  }
  pivotPin(K, e, 0, 0, 10, -37, 37, { name: "j4_pin", head: false, clip: false });
  retainer(e, 0, 0, -37, -1, 10, "j4_ret_m");
  crank(e, -26, 0, 14, 10, 37, 43, "j4_crank");
  retainer(e, 0, 0, 43, 1, 9, "j4_ret_p");
  pivotPin(K, e, -26, 0, 5, 43, 57, { name: "j4_rodpin", nipple: false, clip: false });
  for (const s of [1, -1]) part(e, xzPlate(withHoles(hullShape([[0, 4, 26], [-24, 106, 6], [24, 106, 6]], 28), [circleHole(0, 56, 10), circleHole(0, 86, 6.5)]), s > 0 ? 16 : -22, s > 0 ? 22 : -16, 1, 8), "joint", `e_plate${s}`);
  part(e, L([[0, 104], [33, 104, 2], [34, 112, 1], [34, 134, 1], [0, 134]], 56), "metal", "j5_stator");
  boltCircle(K, e, 10, 29, V(0, 0, 134), Z, 1.5, "j5_statorbolt");
  slew(e, rig.link5, 32, 32.7, 12, -Math.PI / 2, 2, 10, 98, 136, 8.5, 4, -1, "j5", 16);
  // mini valve stack on the front of the forearm
  box(e, 20, -14, 44, 34, 14, 84, "metal", "e_valves", 2.5, 1);
  for (const z of [54, 74]) { box(e, 34, -10, z - 6, 44, 10, z + 6, "gloss", `e_coil${z}`, 3); box(e, 38, 10, z - 3, 43, 15, z + 3, "joint", `e_coilplug${z}`, 1); }
  for (const [y, z] of [[-10, 48], [10, 48], [-10, 80], [10, 80]]) bolt(K, e, V(34, y, z), X, 1.4, 1, `e_valvebolt${y}${z}`);
  pipe(K, e, [[27, 14, 50], [27, 22, 50], [8, 22, 30], [-14, 22, 18]], 1.8, { bend: 6, name: "e_line" });

  /* ----- Forearm (link5): plates, ribbed guard, wrist lug, hard lines ----- */
  const f = rig.link5, WR = 134;
  part(f, L([[0, 10], [31, 10, 1], [31, 18, 2], [0, 18]], 48), "joint", "f_flange");
  for (const s of [1, -1]) {
    part(f, xzPlate(withHoles(hullShape([[-23, 18, 6], [23, 18, 6], [0, WR, 28]], 28), warren(13, 30, 118, 3, 3)), s > 0 ? 18 : -24, s > 0 ? 24 : -18, 1, 8), "joint", `f_plate${s}`);
    drumY(f, 0, WR, 16, s > 0 ? 24 : -27, s > 0 ? 27 : -24, "titanium", `j6_boss${s}`, 0.8);
    boltCircle(K, f, 5, 12.5, V(0, s * 27, WR), V(0, s, 0), 1.3, `j6_bossbolt${s}`);
  }
  for (const [x, z] of [[-22, 26], [22, 26], [20, 100]]) part(f, alongY(L(disc(-18, 18, 3.8), 16)).translate(x * MM, 0, z * MM), "steel", `f_spacer${x}${z}`);
  // ribbed satin guard on the +y side
  part(f, xzPlate(roundedShape(rect(-22, 30, 22, 108), 5), 25, 27.5, 0.5, 6), "satin", "f_guard");
  for (const z of [44, 69, 94]) part(f, xzPlate(roundedShape(rect(-19, z - 1.6, 19, z + 1.6), 1.2), 27.5, 31, 0.4, 3), "satin", `f_guard_rib${z}`);
  for (const [x, z] of [[-17, 34], [17, 34], [-17, 104], [17, 104]]) bolt(K, f, V(x, 27.5, z), Y, 1.5, 1, `f_guardbolt${x}${z}`);
  // wrist cylinder lug on the -y plate
  box(f, -46, -50, 16, -22, -24, 28, "joint", "j6_lugbase", 2.5);
  for (const [x, z] of [[-42, 22], [-26, 22]]) bolt(K, f, V(x, -50, z), NY, 1.3, 1, `j6_lugbolt${x}${z}`);
  clevis(f, -34, 40, -40, 8, 4, 9.5, [[-41, 26, 3], [-27, 26, 3]], "j6lug");
  box(f, -32, -9, 24, -20, 9, 36, "metal", "f_block_lo", 2);
  box(f, -32, -9, 104, -20, 9, 114, "metal", "f_block_hi", 2);
  const fLo = hoseEnd(K, f, V(-32, 0, 30), NX, 3.2, "f_fit_lo");
  pipe(K, f, [[-26, 0, 36], [-26, 0, 104]], 2.2, { name: "f_riser" });
  part(f, cylAlong(3, 6, Z, V(-26, 0, 67), 6), "steel", "f_tee");
  pipe(K, f, [[-26, 0, 70], [-26, -10, 70], [-14, -22, 72], [-12, -25, 72]], 1.8, { bend: 5, name: "f_branch" });
  const fBranch = hoseEnd(K, f, V(-12, -25, 72), NY, 2.8, "f_fit_branch");
  const fHi = hoseEnd(K, f, V(-32, 0, 109), NX, 3, "f_fit_hi");

  /* ----- Wrist (link6): hub, pin, crank, J7 slew drive ----- */
  const w6 = rig.link6;
  drumY(w6, 0, 0, 24, -16, 16, "joint", "j6_hub", 2.5, 40);
  pivotPin(K, w6, 0, 0, 8, -29, 27, { name: "j6_pin", head: false, clip: false });
  retainer(w6, 0, 0, 27, 1, 8, "j6_ret_p");
  crank(w6, -20, 0, 11, 8, -34.5, -29, "j6_crank");
  retainer(w6, 0, 0, -34.5, -1, 7, "j6_ret_m");
  pivotPin(K, w6, -20, 0, 4, 34.5, 47, { name: "j6_rodpin", nipple: false, clip: false, axis: "-y" });
  part(w6, L([[0, 18], [22, 18, 2], [22, 48, 1], [0, 48]], 48), "joint", "j6_neck");
  part(w6, L([[0, 46], [30, 46, 1], [30, 62, 1], [0, 62]], 56), "metal", "j7_stator");
  boltCircle(K, w6, 8, 26, V(0, 0, 62), Z, 1.3, "j7_statorbolt");
  slew(w6, rig.link7, 28, 27.7, 11, Math.PI / 2, 1, 9, 34, 62, 6.8, 6, -1, "j7", 12);
  // link7: tool flange and quick-change plate with two hydraulic couplers
  const t7 = rig.link7;
  part(t7, L([[0, 9], [31, 9, 1], [31, 18, 1], [0, 18]], 56), "joint", "tool_flange");
  boltCircle(K, t7, 6, 26, V(0, 0, 18), Z, 1.6, "tool_bolt");
  part(t7, L([[0, 18], [33, 18, 0.8], [33, 28, 0.8], [0, 28]], 56), "metal", "qc_plate");
  for (const s of [1, -1]) { part(t7, cylAlong(3.4, 6, V(0, s, 0), V(-12, s * 33, 23), 6), "steel", `qc_coupler${s}`); part(t7, cylAlong(2.4, 4, V(0, s, 0), V(-12, s * 39, 23), 12), "steel", `qc_nipple${s}`); }

  /* ----- Cylinders at the elbow and wrist ----- */
  const elbow = cyl({ parent: u, child: e, A: V(-40, 50, 110), B: V(-26, 50, 0), axis: Y, range: [-Math.PI, Math.PI], pin: Y, out: 1, rb: 12, rr: 6, re: 10, w: 10, name: "j4cyl" });
  const wrist = cyl({ parent: f, child: w6, A: V(-34, -40, 40), B: V(-20, -40, 0), axis: Y, range: [-Math.PI, Math.PI], pin: Y, out: -1, rb: 9.5, rr: 5, re: 8, w: 8, name: "j6cyl" });
  {
    const p = elbow.barrel.userData.port;
    hose(anchor(K, u, uBranch.x, uBranch.y, uBranch.z), anchor(K, elbow.barrel, p.x, p.y, p.z), Y, Y, { radius: 3, stiffness: 0.45 });
    hose(anchor(K, u, uHi.x, uHi.y, uHi.z), anchor(K, f, fLo.x, fLo.y, fLo.z), NX, NX, { radius: 3.2, stiffness: 0.55 });
    const q = wrist.barrel.userData.port;
    hose(anchor(K, f, fBranch.x, fBranch.y, fBranch.z), anchor(K, wrist.barrel, q.x, q.y, q.z), NY, NY, { radius: 2.6, stiffness: 0.45 });
    ST.toPalm = { a: anchor(K, f, fHi.x, fHi.y, fHi.z) };   // the hand hose is attached in palm()
  }
}
function orient2(geo, dir, at) {
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  return geo.translate(at.x * 0.001, at.y * 0.001, at.z * 0.001);
}
const deg = (d) => (d * Math.PI) / 180;

/* ---------- Hand ---------- */
const WF = [0.98, 0.9, 0.8], DF = [0.95, 0.86, 0.76];
function dims(d, i) {
  const r = d / 2, w = r * WF[i], a = r * DF[i], b = a * 0.93, t = Math.max(1.8, 0.25 * r);
  const forkR = i === 0 ? r * DF[0] + 1.2 : r * DF[i - 1] * 0.93;
  const wt = i === 0 ? r * 0.55 : r * WF[i - 1] - t - 0.35;
  return { r, w, a, b, t, forkR, wt, tr: forkR - 0.5, c0: forkR + 1.0 };
}
const SZ = [{ rb: 3.3, rr: 1.5, re: 2.6, w: 4 }, { rb: 2.5, rr: 1.15, re: 2.1, w: 3.4 }, { rb: 2.1, rr: 1.0, re: 1.8, w: 3 }];
const RANGE = { finger: [[0, 90], [0, 105], [0, 75]], thumb: [null, [0, 60], [0, 80]] };

export function palm(K, palm) {
  const { MM, FINGERS, THUMB, part, turn, alongY, roundedShape, rect } = K;
  const hw = (y) => 34 + 0.12 * y;
  const trap = (inset, y0, y1) => [[-hw(y0) + inset, y0], [hw(y0) - inset, y0], [hw(y1) - inset, y1], [-hw(y1) + inset, y1]];
  part(palm, alongY(turn([[0, 0], [30, 0, 0.6], [30, 9, 1], [0, 9]], { seg: 48 })), "joint", "wrist_adapter");
  boltCircle(K, palm, 6, 25, V(0, 9, 0), Y, 1.6, "wrist_bolt", 0.3);
  part(palm, xyPlate(roundedShape(trap(1, 8, 98), 8), -11, 11, 1.2, 8), "joint", "palm_core");
  // side cheeks of plate steel along the slanted edges, with bolts
  const ang = Math.atan(0.12);
  for (const s of [1, -1]) {
    const g = yzPlate(roundedShape(rect(-12.5, 10, 12.5, 94), 4), s > 0 ? 0 : -3.2, s > 0 ? 3.2 : 0, 0.6, 6).rotateZ(-s * ang).translate(s * 33.4 * MM, 0, 0);
    part(palm, g, "metal", `cheek${s}`);
    for (const y of [22, 52, 82]) for (const z of [-7, 7]) bolt(K, palm, V(s * (hw(y) + 2.2), y, z), V(s, 0, 0), 1.4, 1, `cheek_bolt${s}${y}${z}`);
  }
  part(palm, xyPlate(roundedShape(trap(5, 12, 94), 6), 11, 13.5, 0.6, 6), "joint", "back_plate");
  for (const [x, y] of [[-30, 16], [30, 16], [-36, 90], [36, 90]]) bolt(K, palm, V(x, y, 13.5), Z, 1.3, 0.9, `back_screw${x}${y}`);
  // manifold block on the back: feeds the four knuckle actuators
  part(palm, xyPlate(roundedShape(rect(-28, 16, 28, 44), 3), 13.5, 24, 1, 4), "metal", "manifold");
  for (const [x, y] of [[-24, 20], [24, 20], [-24, 40], [24, 40]]) bolt(K, palm, V(x, y, 24), Z, 1.3, 0.9, `manifold_bolt${x}${y}`);
  for (const x of [-12, 12]) { part(palm, xyPlate(roundedShape(rect(x - 6, 22, x + 6, 36), 2.5), 24, 32, 0.8, 4), "gloss", `hand_coil${x}`); part(palm, xyPlate(roundedShape(rect(x - 3, 36, x + 3, 40), 1), 26, 30, 0.4, 2), "joint", `hand_coilplug${x}`); }
  for (const [name, fd] of Object.entries(FINGERS)) {
    const x = fd.at[0], ay = fd.at[1] - 30;
    part(palm, cylAlong(2.6, 2.4, Y, V(x * 0.7, 44, 19), 6), "steel", `manifold_port_${name}`);
    pipe(K, palm, [[x * 0.7, 46, 19], [x * 0.7, 50, 19], [x, ay - 10, 19.5], [x, ay - 4.5, 19.5]], 1.1, { bend: 4, name: `feed_${name}`, radial: 6 });
  }
  const inlet = hoseEnd(K, palm, V(0, 16, 19), V(0, -1, 0), 2.8, "hand_inlet");
  // grip side: rubber pads in three pieces, thumb drive housing
  part(palm, xyPlate(roundedShape(rect(-26, 14, 30, 50), 7), -15, -10.5, 1, 6), "pad", "pad_heel");
  part(palm, xyPlate(roundedShape(rect(-40, 56, -2, 88), 6), -15, -10.5, 1, 6), "pad", "pad_a");
  part(palm, xyPlate(roundedShape(rect(2, 56, 40, 86), 6), -15, -10.5, 1, 6), "pad", "pad_b");
  const t = THUMB.at;
  part(palm, new THREE.CylinderGeometry(13 * MM, 14 * MM, 9 * MM, 32).rotateX(Math.PI / 2).translate((t[0] + 6) * MM, (t[1] + 6) * MM, -13.5 * MM), "joint", "thumb_housing");
  boltCircle(K, palm, 5, 10, V(t[0] + 6, t[1] + 6, -18), NZ, 1.1, "thumb_housing_bolt");
  // the supply hose from the forearm to the hand manifold
  if (ST.toPalm) {
    const c = flexCable(K, K.base, ST.toPalm.a, anchor(K, palm, inlet.x, inlet.y, inlet.z), { tA: NX, tB: NY, radius: 2.8, sag: 0.008, segments: 36, radial: 10, stiffness: 0.5, name: "hand_hose" });
    ST.cables.push(c);
  }
}

// The knuckle fork: two steel plates standing out of the palm around the first bone's tongue.
export function knuckle(K, root, f, name) {
  const D = dims(f.d, 0), tk = 3;
  const x0 = D.wt + 0.3, x1 = x0 + tk;
  for (const s of [1, -1]) {
    K.part(root, yzPlate(hullShape([[0, 0, D.forkR], [0, -14, D.forkR], [-2, -18, D.forkR * 0.8]], 24), s > 0 ? x0 : -x1, s > 0 ? x1 : -x0, 0.6, 8), "metal", `${name}_fork${s}`);
  }
  return x1;
}

export function thumbRoot(K, root) {
  const { MM, THUMB, part, turn } = K;
  part(root, turn([[0, -8], [13, -8, 1.5], [13, 8, 1.5], [0, 8]], { seg: 40 }), "joint", "thumb_drum");
  part(root, turn([[0, 8], [10, 8, 0.6], [10, 10.5, 1], [0, 10.5]], { seg: 32 }), "titanium", "thumb_cap");
  boltCircle(K, root, 5, 7.5, V(0, 0, 10.5), Z, 1, "thumb_capbolt");
  const D = dims(THUMB.d, 0);
  return D.wt + 3.3;
}

function boneShape(a, b, y0, L) {
  const s = new THREE.Shape();
  s.moveTo(-a + 1.5, y0); s.lineTo(a - 1.5, y0); s.lineTo(a, y0 + 1.5); s.lineTo(b, L);
  s.absarc(0, L, b, 0, Math.PI, false);
  s.lineTo(-a, y0 + 1.5);
  s.closePath();
  return s;
}

export function segment(K, g, length, d, i, name, tip, prevR) {
  const { MM, part, roundedShape, rect } = K;
  const D = dims(d, i), isThumb = name.startsWith("thumb");
  const L = tip ? length - D.b : length;
  // thumb: a fork on the swing carrier around the first bone
  if (isThumb && i === 0) {
    const x0 = D.wt + 0.3, x1 = x0 + 3;
    for (const s of [1, -1]) part(g.parent, yzPlate(hullShape([[0, 0, D.forkR], [0, -10, D.forkR * 0.9]], 24), s > 0 ? x0 : -x1, s > 0 ? x1 : -x0, 0.6, 8), "metal", `thumb_fork${s}`);
  }
  // tongue (sits in the fork before it), side plates, core, pads
  part(g, yzPlate(hullShape([[0, 0, D.tr], [0, D.c0 + 3, D.tr * 0.85]], 24), -D.wt, D.wt, 0.4, 8), "joint", `${name}_tongue`);
  for (const s of [1, -1]) part(g, yzPlate(boneShape(D.a, D.b, D.c0, L), s > 0 ? D.w - D.t : -D.w, s > 0 ? D.w : -D.w + D.t, 0.5, 10), "metal", `${name}_plate${s}`);
  const coreEnd = tip ? L : L - (D.b + 0.3);
  part(g, yzPlate(roundedShape(rect(-(D.a - 0.9), D.c0 - 0.5, D.a - 0.9, coreEnd), 1.5), -(D.w - D.t), D.w - D.t, 0.4, 4), "joint", `${name}_core`);
  if (tip) {
    part(g, new THREE.SphereGeometry(MM, 20, 12).scale(D.w - D.t + 0.1, D.b - 0.2, D.b - 0.2).translate(0, L * MM, 0), "joint", `${name}_nose`);
    part(g, yzPlate(hullShape([[-D.a + 1.2, D.c0 + 2.5, 1.6], [-D.b * 0.45, L + D.b * 0.45, D.b * 0.62]], 20), -(D.w - 0.4), D.w - 0.4, 0.8, 8), "pad", `${name}_tippad`);
  } else {
    part(g, yzPlate(roundedShape(rect(-D.a - 1.7, D.c0 + 1, -D.a + 1.2, coreEnd - 1), 1.2), -(D.w - 0.5), D.w - 0.5, 0.6, 4), "pad", `${name}_pad`);
  }
  // pivot bolt through the hinge, lock-nut on the other side
  K.part(g, cylAlong(D.r * 0.2 + 0.5, 2 * prevR + 0.8, X, V(-prevR - 0.4, 0, 0), 14), "steel", `${name}_pin`);
  K.part(g, cylAlong(D.r * 0.34 + 0.6, 1.6, X, V(prevR + 0.4, 0, 0), 6), "steel", `${name}_pinhead`);
  hexNut(K, g, V(-prevR - 0.4, 0, 0), NX, D.r * 0.34 + 0.6, 2, `${name}_locknut`);
  part(g, new THREE.SphereGeometry((D.r * 0.24) * MM, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).translate((-prevR - 2.9) * MM, 0, 0), "rubber", `${name}_nyloc`);
  const ys = tip ? [D.c0 + (L - D.c0) * 0.5] : [D.c0 + (L - D.c0) * 0.3, D.c0 + (L - D.c0) * 0.72];
  for (const y of ys) for (const s of [1, -1]) bolt(K, g, V(s * D.w, y, 0), V(s, 0, 0), 0.95, 0.6, `${name}_platebolt${s}${y.toFixed(0)}`);
  // the actuator across this joint: barrel on the part before it, rod on a lever on this bone
  if (isThumb && i === 0) return tipOut(g, tip, L, D);
  const P = g.parent, sz = SZ[i];
  let A, zB, baseZ;
  if (i === 0) { A = V(0, -30, 18.6); zB = 18; baseZ = 13; }
  else {
    const pd = dims(d, i - 1), pL = g.position.y / MM, zA = pd.a + sz.rb + 0.5;
    A = V(0, Math.max(pd.c0 + (i === 2 ? 3 : 5), pL * 0.22), zA);
    zB = i === 2 ? zA * 0.66 : zA * 0.85;
    baseZ = pd.a - 1;
  }
  // barrel lug (two ears) on P, lever (two ears) on this bone
  const ex0 = sz.w / 2 + 0.3, ex1 = ex0 + 1.3;
  for (const s of [1, -1]) {
    part(P, yzPlate(hullShape([[A.z, A.y, sz.re + 0.5], [baseZ, A.y - 3, 1.5], [baseZ, A.y + 3, 1.5]], 14), s > 0 ? ex0 : -ex1, s > 0 ? ex1 : -ex0, 0.3, 4), "titanium", `${name}_lug${s}`);
    const rx0 = sz.w * 0.4 + 0.3, rx1 = rx0 + 1.2;
    part(g, yzPlate(hullShape([[zB, 0, sz.re * 0.85 + 0.5], [D.a * 0.3, 0, D.tr * 0.55]], 14), s > 0 ? rx0 : -rx1, s > 0 ? rx1 : -rx0, 0.3, 4), "titanium", `${name}_lever${s}`);
  }
  K.part(P, cylAlong(sz.re * 0.42, 2 * ex1 + 0.8, X, V(-ex1 - 0.4, A.y, A.z), 8), "steel", `${name}_lugpin`);
  K.part(g, cylAlong(sz.re * 0.4, sz.w * 0.8 + 3.6, X, V(-(sz.w * 0.4 + 1.8), 0, zB), 8), "steel", `${name}_leverpin`);
  const rg = RANGE[isThumb ? "thumb" : "finger"][i].map(deg);
  ST.cyls.push(hydraulic(K, { parent: P, child: g, A, B: V(0, 0, zB), axis: CURL, range: rg, pin: X, rb: sz.rb, rr: sz.rr, re: sz.re, w: sz.w, style: "mini", name: `${name}_act`, sweep: 40 }));
  return tipOut(g, tip, L, D);
}
function tipOut(g, tip, L, D) {
  if (!tip) return undefined;
  const o = new THREE.Object3D();
  o.position.y = L * 0.001;
  o.userData.r = D.b;
  g.add(o);
  return o;
}
export const endRadius = (i, d) => dims(d, i).w;

/* ---------- Moving details ---------- */
export function update(t, dt, S) {
  let key = 0;
  for (let i = 0; i < S.q.length; i++) key += S.q[i] * (i + 1) * 1000;
  let k = 1;
  for (const n in S.handNow) key += S.handNow[n] * (k++) * 0.37;
  if (key !== ST.last) {
    for (const c of ST.cyls) c.update();
    for (const c of ST.cables) c.update();
    ST.last = key;
  }
  for (const p of ST.pinions) p.mesh.rotation.z = S.q[p.qi] * p.ratio;
  for (const l of ST.lamps) l.mesh.visible = ((t + l.phase) % l.period) / l.period < l.duty;
  // pressure gauge: system pressure rises with how hard the arm is moving, plus pump ripple
  if (!ST.prevQ) ST.prevQ = [...S.q];
  let v = 0;
  for (let i = 0; i < S.q.length; i++) { v += Math.abs(S.q[i] - ST.prevQ[i]); ST.prevQ[i] = S.q[i]; }
  ST.load += (Math.min(1, v / Math.max(dt, 1e-3) / 2.5) - ST.load) * Math.min(1, dt * 3);
  const target = deg(-40) + ST.load * deg(110) + Math.sin(t * 31) * deg(1.6) + Math.sin(t * 7.3) * deg(2.4) + (Math.sin(t * 0.9) > 0.97 ? deg(8) : 0);
  ST.needleA += (target - ST.needleA) * Math.min(1, dt * 12);
  if (ST.needle) ST.needle.rotation.x = -ST.needleA;
}
