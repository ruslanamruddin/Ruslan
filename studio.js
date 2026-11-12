// Block-out of the original arm and abstract hand, built straight from the brief in HANDOFF.md.
// Plain tapered cylinders and pills, so proportions can be judged in motion before any CAD finish.
// A finished model drops in later: put it at models/arm-abstract.glb (or pass ?model=path.glb)
// with parts named base, link1..link7, palm, palm_arch, index_1 and so on, and it replaces these shapes.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";
import { createLook } from "./look.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const params = new URLSearchParams(location.search);
// A page can embed the arm by setting window.ARM_CONFIG before loading this script:
//   overlay: true    transparent canvas laid over the page (pointer-events: none on it)
//   shift: [x, y]    move the arm across the screen, as fractions of the window (+x right, +y down)
//   zoom: n          camera distance multiplier (smaller = bigger arm)
//   idle: "wander" | "park"   what it does with nobody pointing; park = go to `park` (screen -1..1)
// The page then drives it with window.arm.pointAt(clientX, clientY, { pitch, pose }) and arm.release().
// pointAt(x, y, { pose: "point", wag: true, waveAt }) wags one finger side to side; arm.pause(true) stops it.
//   follow: false    ignore the bare cursor (only pinned targets move it);  sleeps: false  never sleep at night
//   look: "studio" | "noir" | "daylight"   photoreal materials, lighting and post-processing (look.js); also ?look=
const CFG = { overlay: false, shift: [0, 0], zoom: 1, idle: "wander", park: [1.4, -1.3], follow: true, sleeps: true, ...(window.ARM_CONFIG || {}) };
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const deg = THREE.MathUtils.degToRad;
const MM = 0.001;
const BG = 0xf5f5f7;

/* ---------- The brief, in millimetres, z-up, arm straight up ---------- */
// Seven joints, laid out like a real 7-axis arm: yaw, pitch, roll, pitch, roll, pitch, roll. The brief's
// six pivots are unchanged; the upper-arm roll at 234 is new (it gives the elbow a free swivel, so the
// hand can reach a point from many arm postures). Ranges are wider than the brief so the arm can reach
// low, high and to the sides; the elbow bends both ways.
const JOINTS = [
  { name: "link1", pivot: 46, axis: "z", range: [-170, 170] },   // base yaw
  { name: "link2", pivot: 164, axis: "y", range: [-120, 120] },  // shoulder pitch
  { name: "link3", pivot: 234, axis: "z", range: [-175, 175] },  // upper-arm roll (added)
  { name: "link4", pivot: 464, axis: "y", range: [-150, 150] },  // elbow pitch
  { name: "link5", pivot: 600, axis: "z", range: [-175, 175] },  // forearm roll
  { name: "link6", pivot: 734, axis: "y", range: [-120, 120] },  // wrist pitch
  { name: "link7", pivot: 796, axis: "z", range: [-180, 180] },  // wrist roll
];
const MOUNT_FACE = 824;
// Which design to build (?design= or ARM_CONFIG.design); every design shares the joints and finger skeleton.
// Only the chosen design's file is loaded, so one broken or heavy design never affects the others.
const DESIGN_FILES = { classic: "classic", industrial: "industrial", humanoid: "humanoid", future: "future", maker: "proto_maker", lab: "proto_lab", hydraulic: "proto_hydraulic", biomech: "proto_biomech" };
// Default: the four prototypes take turns, a different one on every visit (?design= or ARM_CONFIG.design pins one).
const ROTATION = ["maker", "lab", "hydraulic", "biomech"];
function nextInRotation() {
  let last = null;
  try { last = localStorage.getItem("arm-design"); } catch {}
  const i = ROTATION.indexOf(last);
  const pick = i < 0 ? ROTATION[Math.floor(Math.random() * ROTATION.length)] : ROTATION[(i + 1) % ROTATION.length];
  try { localStorage.setItem("arm-design", pick); } catch {}
  return pick;
}
const wantedDesign = params.get("design") || window.ARM_CONFIG?.design || nextInRotation();
let design;
try { design = await import(`./designs/${DESIGN_FILES[wantedDesign] ?? "humanoid"}.js`); }
catch (e) { console.error(`design "${wantedDesign}" failed to load; using Humanoid`, e); design = await import("./designs/humanoid.js"); }
const RING = 1.2;   // lit ring width
const FINGERS = {
  index: { seg: [50, 30, 24], d: 17, at: [-31, 96], splay: -6 },
  middle: { seg: [54, 34, 25], d: 18, at: [-10, 100], splay: 0 },
  ring: { seg: [50, 32, 25], d: 17, at: [11, 97], splay: 5 },
  little: { seg: [40, 24, 22], d: 15, at: [31, 88], splay: 12 },
};
// Thumb and index sit on the -x side of the palm, as in the brief's table.
const THUMB = { seg: [52, 38, 30], d: 20, at: [-36, 28], out: 35, roll: 45 };
const PALM = { length: 100, width: 92, thick: 28 };
// knuckle / middle / tip curl per finger, thumb [swing, oppose, curl, curl], arch = palm cupping.
// The thumb for pinch, point and fist is solved below.
const POSES = {
  relaxed: { index: [16, 24, 14], middle: [22, 30, 18], ring: [28, 34, 20], little: [34, 38, 22], thumb: [8, 12, 10, 8], arch: 8 },
  open: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], little: [0, 0, 0], thumb: [0, 0, 0, 0], arch: 0 },
  point: { index: [4, 4, 2], middle: [72, 95, 60], ring: [76, 95, 60], little: [80, 95, 60], thumb: [40, 45, 30, 25], arch: 16 },
  pinch: { index: [42, 48, 26], middle: [85, 100, 70], ring: [85, 100, 70], little: [85, 100, 70], thumb: [30, 30, 20, 20], arch: 16 },   // other three fingers closed
  wave: { index: [0, 4, 2], middle: [0, 4, 2], ring: [0, 4, 2], little: [0, 4, 2], thumb: [-12, 0, 0, 0], spread: [-12, -3, 6, 12], arch: 0 },
  fist: { index: [85, 100, 70], middle: [85, 100, 70], ring: [85, 100, 70], little: [85, 100, 70], thumb: [42, 50, 40, 30], arch: 22 },
};

/* ---------- Renderer, studio light (same recipe as the Franka test) ---------- */
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: CFG.overlay, preserveDrawingBuffer: params.has("shot") });
// Pixel density: capped at 1.5 (Retina at 2-3x costs 2-4x the pixels for little visible gain on a moving
// 3D scene), then adjusted from measured frame times in frame().
const DPR_CAP = Math.min(devicePixelRatio, 1.5);
let pixelRatio = DPR_CAP;
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = CFG.overlay ? null : new THREE.Color(BG);
const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 30);

function studio() {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.1, 0.11), side: THREE.BackSide })));
  const panel = (w, h, power, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power * 0.985), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0.5, 0);
    room.add(m);
  };
  panel(7, 5, 3.4, [0.5, 4.8, 1.4]);   // overhead key
  panel(1.4, 8, 5.5, [4.6, 1, 5]);     // long strip: the highlight down each link
  panel(0.8, 7, 3.2, [-6, 1, 2.5]);    // thin edge from the other side
  panel(6, 4, 2.4, [-3, 2, -6]);       // rim from behind
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.62, 0.63) }));
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = -0.4;              // a pale floor, like the page below the arm
  room.add(sweep);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.018).texture;
  pmrem.dispose();
  return env;
}
scene.environment = studio();
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(0.9, 3.2, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 1.3, bottom: -0.5, near: 0.5, far: 7 });
key.shadow.radius = 9;
key.shadow.normalBias = 0.012;
key.shadow.bias = -0.0004;
scene.add(key);

/* ---------- The five named materials from the brief ---------- */
const named = (m, name) => ((m.name = name), m);
const MATERIALS = {
  metal: named(new THREE.MeshStandardMaterial({ color: 0xc7c8cc, metalness: 1, roughness: 0.42 }), "metal"),
  paint: named(new THREE.MeshPhysicalMaterial({ color: 0xe9e8e4, metalness: 0, roughness: 0.36, clearcoat: 0.3, clearcoatRoughness: 0.25 }), "paint"),
  dark: named(new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.1, roughness: 0.5 }), "dark"),
  rubber: named(new THREE.MeshStandardMaterial({ color: 0x222224, metalness: 0, roughness: 0.75 }), "rubber"),
  light: named(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.4 }), "light"),
};
MATERIALS.glass = named(new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }), "glass");
// extra materials used by the alternative designs
MATERIALS.steel = named(new THREE.MeshStandardMaterial({ color: 0xd6d8db, metalness: 1, roughness: 0.22 }), "steel");
MATERIALS.carbon = named(new THREE.MeshPhysicalMaterial({ color: 0x18191b, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }), "carbon");
MATERIALS.glow = named(new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x38d6ff, emissiveIntensity: 2.6, roughness: 0.4 }), "glow");
MATERIALS.smoke = named(new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.42, clearcoat: 1, depthWrite: false }), "smoke");
MATERIALS.satin = named(new THREE.MeshPhysicalMaterial({ color: 0xedece8, metalness: 0, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.2, sheenRoughness: 0.7 }), "satin");
MATERIALS.titanium = named(new THREE.MeshStandardMaterial({ color: 0xb9b3aa, metalness: 1, roughness: 0.3 }), "titanium");
MATERIALS.gloss = named(new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }), "gloss");
let finish = params.get("finish") === "metal" ? "metal" : "paint";   // the arm's shell
// Shell takes the chosen finish; trim (collars, cap faces, flange) takes the other, so the arm reads
// two-tone. The hand is aluminium with ceramic back plates, graphite joints and rubber pads.
const roleMaterial = (role) => ({
  shell: MATERIALS[finish], trim: MATERIALS[finish === "paint" ? "metal" : "paint"], finger: MATERIALS.metal, plate: MATERIALS.paint,
  pin: MATERIALS.metal, joint: MATERIALS.dark, ball: MATERIALS.dark, ring: MATERIALS.light, rubber: MATERIALS.rubber, pad: MATERIALS.rubber,
  glass: MATERIALS.glass, steel: MATERIALS.steel, carbon: MATERIALS.carbon, glow: MATERIALS.glow, smoke: MATERIALS.smoke, gloss: MATERIALS.gloss,
  satin: MATERIALS.satin, titanium: MATERIALS.titanium,
  paint: MATERIALS.paint, metal: MATERIALS.metal, dark: MATERIALS.dark,
}[role] ?? MATERIALS.paint);

/* ---------- Shape helpers ---------- */
// Seams are 0.6 mm on the real object; drawn at 1 mm so they still read as a line at screen size.
const SEAM_DRAW = 1.0;
const V2 = (x, y) => new THREE.Vector2(x, y);
// Round every corner of an open 2D polyline. Each point is [x, y, fillet radius].
function filleted(pts, steps = 6) {
  const out = [];
  pts.forEach(([x, y, f = 0], i) => {
    if (i === 0 || i === pts.length - 1 || !f) { out.push(V2(x, y)); return; }
    const B = V2(x, y), u = V2(pts[i - 1][0], pts[i - 1][1]).sub(B), w = V2(pts[i + 1][0], pts[i + 1][1]).sub(B);
    const la = u.length(), lc = w.length();
    u.normalize(); w.normalize();
    const theta = Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1));
    if (theta < 1e-3 || Math.PI - theta < 1e-3) { out.push(B); return; }
    // A corner next to the axis may use the whole edge (so a pill end can be a full hemisphere).
    const d = Math.min(f / Math.tan(theta / 2), la * (i === 1 ? 1 : 0.5), lc * (i === pts.length - 2 ? 1 : 0.5)), rr = d * Math.tan(theta / 2);
    const c = B.clone().addScaledVector(u.clone().add(w).normalize(), rr / Math.sin(theta / 2));
    const p1 = B.clone().addScaledVector(u, d), p2 = B.clone().addScaledVector(w, d);
    const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    let da = Math.atan2(p2.y - c.y, p2.x - c.x) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= steps; k++) { const a = a1 + (da * k) / steps; out.push(V2(c.x + rr * Math.cos(a), c.y + rr * Math.sin(a))); }
  });
  return out;
}
// Lathe a profile of [radius, z, fillet] points (mm) around +Z.
function turn(pts, { seg = 56, phiStart = 0, phiLength = Math.PI * 2, flip = false, steps = 6 } = {}) {
  const g = new THREE.LatheGeometry(filleted(pts, steps).map((p) => p.multiplyScalar(MM)), seg, phiStart, phiLength).rotateX(Math.PI / 2);
  return flip ? g.rotateX(Math.PI) : g;   // flip: same part pointing down -z (keeps faces the right way out)
}
// A tube from z0 to z1, radius r0 -> r1, a gentle swell (bulge, mm) in the middle, filleted ends.
function tubeProfile(z0, z1, r0, r1, f0 = 1.5, f1 = 1.5, bulge = 0) {
  const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 18)), pts = [[0, z0]];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([r0 + (r1 - r0) * t + bulge * 4 * t * (1 - t), z0 + (z1 - z0) * t, i === 0 ? f0 : i === n ? f1 : 0]); }
  pts.push([0, z1]);
  return pts;
}
const alongY = (g) => g.rotateX(-Math.PI / 2);   // turn a z lathe into a y axle
const blockout = [];
function part(parent, geometry, role, name) {
  const m = new THREE.Mesh(geometry, roleMaterial(role));
  m.name = name;
  m.userData.role = role;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  blockout.push(m);
  return m;
}
const radiusAt = (z, z0, z1, r0, r1) => r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
// A shell split down both sides by parting lines, over a graphite core that shows through the seams.
function splitShell(owner, name, z0, z1, r0, r1, { f0 = 1.5, f1 = 1.5, bulge = 0, role = "shell" } = {}) {
  const gap = SEAM_DRAW / ((r0 + r1) / 2);
  const prof = tubeProfile(z0, z1, r0, r1, f0, f1, bulge);
  part(owner, turn(prof, { phiStart: gap / 2, phiLength: Math.PI - gap }), role, `${name}_L`);
  part(owner, turn(prof, { phiStart: Math.PI + gap / 2, phiLength: Math.PI - gap }), role, `${name}_R`);
  part(owner, turn(tubeProfile(z0 + 2, z1 - 2, r0 - 1.6, r1 - 1.6, 0.4, 0.4, bulge), { seg: 48 }), "joint", `${name}_core`);
}
// A dark core bridging a seam between two coaxial pieces, so the seam reads as a line, not a gap.
const seamCore = (owner, z, r, name) => part(owner, turn(tubeProfile(z - 3, z + 3, r - 1.6, r - 1.6, 0.4, 0.4), { seg: 48 }), "joint", `${name}_seamcore`);
// Closed polygon with rounded corners, as a Shape (mm).
function roundedShape(pts, rad) {
  const s = new THREE.Shape(), n = pts.length, P = pts.map(([x, y]) => V2(x, y));
  const cut = (i, j) => P[i].clone().lerp(P[j], Math.min(0.45, rad / P[i].distanceTo(P[j])));
  P.forEach((p, i) => {
    const a = cut(i, (i + n - 1) % n), b = cut(i, (i + 1) % n);
    i === 0 ? s.moveTo(a.x, a.y) : s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  s.closePath();
  return s;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// Extrude a shape (mm) from z0 to z1 with a rounded bevel.
const slab = (shape, z0, z1, bevel, holes = []) => {
  shape.holes.push(...holes);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, z1 - z0 - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 8, curveSegments: 24 });
  return g.translate(0, 0, z0 + bevel).scale(MM, MM, MM);
};

/* ---------- Kinematic rig: one group per moving part, origin on its joint ---------- */
const robot = new THREE.Group();
robot.rotation.x = -Math.PI / 2;   // the brief is z-up, three.js is y-up
scene.add(robot);
const base = new THREE.Group();
base.name = "base";
robot.add(base);
const rig = { base };
const links = [];
let parent = base, prevPivot = 0;
for (const j of JOINTS) {
  const g = new THREE.Group();
  g.name = j.name;
  g.position.z = (j.pivot - prevPivot) * MM;
  g.userData.axis = new THREE.Vector3(...{ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[j.axis]);
  g.userData.range = j.range.map(deg);
  parent.add(g);
  links.push(g);
  rig[j.name] = g;
  parent = g;
  prevPivot = j.pivot;
}
const N = links.length;

/* ---------- The visible design: shapes built onto the rig (designs/*.js) ---------- */
// Everything a design needs: dimensions, the rig, and the shape helpers above.
// live(mesh): keep a part separate so a design's update() can move it every frame (fans, belts, pistons).
// livePart(parent, geometry centred on its own origin, role, name, [x, y, z] mm): a live part placed there.
const live = (m) => ((m.userData.live = true), m);
function livePart(parent, geometry, role, name, at = [0, 0, 0]) { const m = live(part(parent, geometry, role, name)); m.position.set(at[0] * MM, at[1] * MM, at[2] * MM); return m; }
const K = { MM, deg, V2, SEAM_DRAW, RING, JOINTS, MOUNT_FACE, FINGERS, THUMB, PALM, rig, base, robot, part, live, livePart, turn, tubeProfile, alongY, radiusAt, splitShell, seamCore, roundedShape, rect, slab, filleted, roleMaterial };
design.arm(K);

/* ---------- Hand skeleton (shared); its shapes come from the design ---------- */
// Hand frame: x across the palm, y from the wrist to the fingertips, z out of the back of the hand.
// On the arm the palm faces +X, so with the arm reaching forward the palm faces down.
const palm = new THREE.Group();
palm.name = "palm";
palm.position.z = (MOUNT_FACE - 796) * MM;
palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
rig.link7.add(palm);
rig.palm = palm;
const handJoints = {};   // name -> { group, axis, range }
function handJoint(parentGroup, name, axis, range, y = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.y = y * MM;
  parentGroup.add(g);
  handJoints[name] = { group: g, axis, range: range.map(deg) };
  rig[name] = g;
  return g;
}
design.palm(K, palm);
// Palm arch: the ring and little fingers sit on a plate that folds a little toward the palm, so the
// hand can cup the way a real one does.
const arch = handJoint(palm, "palm_arch", new THREE.Vector3(0, 1, 0), [0, 25]);
arch.position.x = 0;
const CURL = new THREE.Vector3(-1, 0, 0), SIDE = new THREE.Vector3(0, 0, -1), SWING = new THREE.Vector3(0, 0, -1);
const fingerTips = {};
for (const [name, f] of Object.entries(FINGERS)) {
  const root = new THREE.Group();
  root.position.set(f.at[0] * MM, f.at[1] * MM, 0);
  root.rotation.z = -deg(f.splay);
  ((name === "ring" || name === "little") ? arch : palm).add(root);
  const kr = design.knuckle(K, root, f, name);
  const g0 = handJoint(root, `${name}_0`, SIDE, [-15, 15]);
  const g1 = handJoint(g0, `${name}_1`, CURL, [0, 90]);
  design.segment(K, g1, f.seg[0], f.d, 0, `${name}_1`, false, kr);
  const g2 = handJoint(g1, `${name}_2`, CURL, [0, 105], f.seg[0]);
  design.segment(K, g2, f.seg[1], f.d, 1, `${name}_2`, false, design.endRadius(0, f.d));
  const g3 = handJoint(g2, `${name}_3`, CURL, [0, 75], f.seg[1]);
  fingerTips[name] = design.segment(K, g3, f.seg[2], f.d, 2, `${name}_3`, true, design.endRadius(1, f.d));
}
{
  const root = new THREE.Group();
  root.position.set(THUMB.at[0] * MM, THUMB.at[1] * MM, -4 * MM);
  root.rotation.z = deg(THUMB.out);   // angled out of the palm
  palm.add(root);
  const tr = design.thumbRoot(K, root);
  const t0 = handJoint(root, "thumb_0", SWING, [-30, 60]);
  const rolled = new THREE.Group();
  rolled.rotation.y = -deg(THUMB.roll);   // rolled so it curls across the palm
  t0.add(rolled);
  const t1 = handJoint(rolled, "thumb_1", CURL, [-30, 60]);
  design.segment(K, t1, THUMB.seg[0], THUMB.d, 0, "thumb_1", false, tr);
  const t2 = handJoint(t1, "thumb_2", CURL, [0, 60], THUMB.seg[0]);
  design.segment(K, t2, THUMB.seg[1], THUMB.d, 1, "thumb_2", false, design.endRadius(0, THUMB.d));
  const t3 = handJoint(t2, "thumb_3", CURL, [0, 80], THUMB.seg[1]);
  fingerTips.thumb = design.segment(K, t3, THUMB.seg[2], THUMB.d, 2, "thumb_3", true, design.endRadius(1, THUMB.d));
}
// Merge the parts on each moving piece by material: the same look with a fraction of the draw calls
// (a design can have hundreds of small parts, every screw included). ?merge=0 keeps them separate.
(function mergeParts() {
  if (params.get("merge") === "0") return;
  const groups = new Map();
  for (const m of blockout) {
    if (m.userData.live) continue;   // animated parts stay separate
    const key = m.parent;
    if (!groups.has(key)) groups.set(key, new Map());
    const roles = groups.get(key);
    if (!roles.has(m.userData.role)) roles.set(m.userData.role, []);
    roles.get(m.userData.role).push(m);
  }
  const kept = [];
  for (const [owner, roles] of groups) for (const [role, meshes] of roles) {
    if (meshes.length < 2) { kept.push(...meshes); continue; }
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) { kept.push(...meshes); continue; }
    for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, roleMaterial(role));
    mesh.name = `${owner.name || meshes[0].name.split("_")[0]}_${role}`;   // unnamed finger roots take the finger's name
    mesh.userData.role = role;
    mesh.castShadow = mesh.receiveShadow = true;
    owner.add(mesh);
    kept.push(mesh);
  }
  const lives = blockout.filter((m) => m.userData.live);
  blockout.length = 0;
  blockout.push(...kept, ...lives);
})();
// The very end of the index fingertip: this is the point that goes exactly under the cursor.
const indexEnd = new THREE.Object3D();
indexEnd.position.y = fingerTips.index.userData.r * MM;
fingerTips.index.add(indexEnd);
// Where that fingertip sits, and which way it points, in the palm's frame for a given hand pose. The arm
// steers by this, so the fingers can move (a grip on click) without dragging the arm around.
const aimCache = new Map();
function aimFor(angles) {
  if (!aimCache.has(angles)) {
    const saved = { ...handNow };
    applyHand(angles);
    palm.updateMatrixWorld(true);
    const inv = palm.matrixWorld.clone().invert();
    const pos = indexEnd.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(rig.index_3.matrixWorld).transformDirection(inv);
    applyHand(saved);
    palm.updateMatrixWorld(true);
    aimCache.set(angles, { pos, dir });
  }
  return aimCache.get(angles);
}
// For a wave, the arm steers by the middle of the palm, pointing up the hand.
const WAVE_AIM = { pos: new THREE.Vector3(0, 50 * MM, 0), dir: new THREE.Vector3(0, 1, 0) };
// For a pinch, the arm steers by the point where thumb and index meet in the pinch pose, so an open hand
// hovers there and closing it lands the pinch exactly on the target.
let pinchAim = null;
function aimForPinch() {
  if (!pinchAim) {
    const saved = { ...handNow };
    applyHand(poseAngles(POSES.pinch));
    palm.updateMatrixWorld(true);
    const inv = palm.matrixWorld.clone().invert();
    const pos = wp(fingerTips.index).add(wp(fingerTips.thumb)).multiplyScalar(0.5).applyMatrix4(inv);
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(rig.index_2.matrixWorld).transformDirection(inv);
    applyHand(saved);
    palm.updateMatrixWorld(true);
    pinchAim = { pos, dir };
  }
  return pinchAim;
}

/* ---------- Hand poses ---------- */
const handNames = Object.keys(handJoints);
const poseAngles = (p) => {
  const out = { palm_arch: p.arch ?? 0 };
  for (const f of Object.keys(FINGERS)) {
    out[`${f}_0`] = p.spread ? p.spread[Object.keys(FINGERS).indexOf(f)] : 0;
    p[f].forEach((v, i) => (out[`${f}_${i + 1}`] = v));
  }
  p.thumb.forEach((v, i) => (out[`thumb_${i}`] = v));
  return out;
};
const handNow = poseAngles(POSES.relaxed);
const clampJoint = (n, v) => THREE.MathUtils.clamp(v, THREE.MathUtils.radToDeg(handJoints[n].range[0]), THREE.MathUtils.radToDeg(handJoints[n].range[1]));
function applyHand(angles) {
  for (const n of handNames) handJoints[n].group.quaternion.setFromAxisAngle(handJoints[n].axis, deg(clampJoint(n, angles[n] ?? 0)));
}
// The thumb's four angles are solved for each pose that needs it, rather than guessed:
// pinch - its tip meets the index tip; point - it rests across the curled middle finger, right beside
// the pointing index (which is what makes a point read as a point); fist - it lies over index and middle.
const wp = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new THREE.Vector3(x * MM, y * MM, z * MM));
const onBack = (f, at) => wp(rig[`${f}_2`], 0, FINGERS[f].seg[1] * at, FINGERS[f].d * 0.46 + THUMB.d * 0.42);
const THUMB_GOALS = {
  pinch: () => Math.abs(wp(fingerTips.thumb).distanceTo(wp(fingerTips.index)) - (fingerTips.thumb.userData.r + fingerTips.index.userData.r) * MM),
  point: () => wp(fingerTips.thumb).distanceTo(onBack("middle", 0.5)),
  fist: () => wp(fingerTips.thumb).distanceTo(onBack("index", 0.55).add(onBack("middle", 0.55)).multiplyScalar(0.5)),
};
function solveThumb(key) {
  const angles = poseAngles(POSES[key]);
  const cost = () => { applyHand(angles); palm.updateMatrixWorld(true); return THUMB_GOALS[key](); };
  let best = cost();
  for (let step = 16; step >= 0.25; step /= 2) {
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const n of ["thumb_0", "thumb_1", "thumb_2", "thumb_3"]) {
        for (const s of [step, -step]) {
          const old = angles[n];
          angles[n] = clampJoint(n, old + s);
          const c = cost();
          if (c < best - 1e-7) { best = c; moved = true; } else angles[n] = old;
        }
      }
      if (!moved) break;
    }
  }
  POSES[key].thumb = [0, 1, 2, 3].map((i) => +angles[`thumb_${i}`].toFixed(1));
  return +(best / MM).toFixed(2);   // leftover miss, mm
}
robot.updateMatrixWorld(true);
const thumbMiss = Object.fromEntries(Object.keys(THUMB_GOALS).map((k) => [k, solveThumb(k)]));
const pinchGap = thumbMiss.pinch;
// Primed for a pinch: the other three fingers closed (as in the pinch), thumb and index held most of the way
// into the pinch with a small gap between the tips, so a click only has to close it. The blend is found
// by measuring the gap rather than guessing angles.
const PRIMED_GAP = 14;   // mm between the thumb and index tips
function primedPose(f) {
  const pi = POSES.pinch;
  return { index: pi.index.map((x) => x * f), middle: [...pi.middle], ring: [...pi.ring], little: [...pi.little], thumb: pi.thumb.map((x) => x * f), arch: pi.arch };
}
{
  const gapAt = (f) => { applyHand(poseAngles(primedPose(f))); palm.updateMatrixWorld(true); return wp(fingerTips.thumb).distanceTo(wp(fingerTips.index)) / MM - fingerTips.thumb.userData.r - fingerTips.index.userData.r; };
  let lo = 0.4, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (gapAt(mid) > PRIMED_GAP) lo = mid; else hi = mid; }
  POSES.primed = primedPose((lo + hi) / 2);
  applyHand(handNow);
}
// "auto": point while following the cursor, relax when nobody is moving, grip on press.
let poseName = POSES[params.get("pose")] ? params.get("pose") : "auto";
const poseGoal = (n) => poseAngles(POSES[n === "auto" ? "relaxed" : n]);
let handGoal = poseGoal(poseName);
// The point the arm steers by (palm frame); it eases between poses so a pose change never jolts the arm.
const aim = (() => { const a0 = aimFor(poseAngles(POSES.relaxed)); return { pos: a0.pos.clone(), dir: a0.dir.clone() }; })();
let gripping = false;

/* ---------- Arm control ---------- */
// Every frame a solver drives the index fingertip onto the target, running damped least squares to
// convergence from where it left off. Position is the hard task; the finger's direction is a soft
// preference, and spare motion drifts toward a relaxed posture. The visible arm then follows the
// solution with a short ease, so it moves like a machine with mass but always arrives exactly.
const REST = [-0.4, -0.2, 0, 1.5, 0, 0.55, 0];
// The preferred posture turns the base to face the target, so the arm never folds round behind itself.
const restFor = (tgt) => { const r = [...REST]; r[0] = THREE.MathUtils.clamp(Math.atan2(-tgt.z, tgt.x), deg(-165), deg(165)); return r; };
let restNow = [...REST];
const ASLEEP = [-0.35, -0.35, 0, 2.2, 0, 1.1, 0];   // head bowed, hand hanging clear of the base
const q = [...(calm ? REST : ASLEEP)];
const qs = [...q];   // the solver's answer; q chases it
function pose(arr = q) {
  links.forEach((l, i) => l.quaternion.setFromAxisAngle(l.userData.axis, arr[i]));
  applyHand(handNow);
  robot.updateMatrixWorld(true);
}
const a = new THREE.Vector3(), p = new THREE.Vector3(), r = new THREE.Vector3(), v = new THREE.Vector3();
const tipPos = new THREE.Vector3(), tipDir = new THREE.Vector3();
// Optional: which way the palm should face (world). Used to wave at the viewer. Palm front is -z in the hand frame.
let palmGoal = null;
const PALM_FRONT = new THREE.Vector3(0, 0, -1), palmNow = new THREE.Vector3(), palmErr = new THREE.Vector3();
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    [M[c], M[best]] = [M[best], M[c]];
    for (let i = c + 1; i < n; i++) { const f = M[i][c] / M[c][c]; for (let k = c; k <= n; k++) M[i][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { x[i] = M[i][n]; for (let k = i + 1; k < n; k++) x[i] -= M[i][k] * x[k]; x[i] /= M[i][i]; }
  return x;
}
// Damped pseudo-inverse of an m x N matrix given as rows; returns N x m.
function dampedPinv(A, lambda2) {
  const m = A.length;
  const AAt = A.map((ri, i) => A.map((rj, j) => (i === j ? lambda2 : 0) + ri.reduce((s, x, k) => s + x * rj[k], 0)));
  const inv = A.map((_, j) => solve(AAt, A.map((__, i) => (i === j ? 1 : 0))));   // columns of the inverse
  return Array.from({ length: N }, (_, k) => A.map((__, j) => A.reduce((s, row, i) => s + row[k] * inv[j][i], 0)));
}
const mulMV = (M, x) => M.map((row) => row.reduce((s, v, i) => s + v * x[i], 0));
const tipError = { mm: 0, px: 0 };
// One solver step, in strict priority: (1) the fingertip onto the target, exactly; (2) with the motion
// left over, the finger pointing the way we want; (3) with what is left after that, a natural posture.
function ikIterate(target, dir, lower = true) {
  pose(qs);
  tipPos.copy(aim.pos).applyMatrix4(palm.matrixWorld);
  tipDir.copy(aim.dir).transformDirection(palm.matrixWorld);
  const Jp = [[], [], []], Jo = [[], [], []];
  links.forEach((l, k) => {
    l.getWorldPosition(p);
    a.copy(l.userData.axis).transformDirection(l.matrixWorld);
    v.copy(a).cross(r.copy(tipPos).sub(p));
    Jp[0][k] = v.x; Jp[1][k] = v.y; Jp[2][k] = v.z;
    Jo[0][k] = a.x; Jo[1][k] = a.y; Jo[2][k] = a.z;
  });
  r.copy(target).sub(tipPos);
  const miss = r.length();
  if (miss > 0.08) r.multiplyScalar(0.08 / miss);   // big jumps are taken in steps
  v.copy(tipDir).cross(dir);
  if (palmGoal) v.add(palmErr.copy(palmNow.copy(PALM_FRONT).transformDirection(palm.matrixWorld)).cross(palmGoal));
  // (1) position
  const Pp = dampedPinv(Jp, 4e-4);
  const dq1 = mulMV(Pp, [r.x, r.y, r.z]);
  const P = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => (i === j ? 1 : 0) - Pp[i].reduce((s, x, m) => s + x * Jp[m][j], 0)));
  // (2) direction, only through motion that leaves the fingertip where it is
  const JoP = Jo.map((row) => Array.from({ length: N }, (_, j) => row.reduce((s, x, k) => s + x * P[k][j], 0)));
  const resid = [v.x, v.y, v.z].map((e, i) => e - Jo[i].reduce((s, x, k) => s + x * dq1[k], 0));
  const Po = dampedPinv(JoP, 0.01);
  // Near full stretch the damped solver lets the lower tasks leak into position, so direction (and
  // posture, below) fade out while the fingertip is more than a few millimetres off: reaching wins.
  const dirWeight = lower ? 1 / (1 + (miss / 0.002) ** 2) : 0;
  const dq2 = mulMV(Po, resid).map((x) => x * dirWeight);
  // (3) posture: toward a natural pose, and away from any joint within 25 degrees of its limit
  const want = restNow.map((t, k) => {
    const [lo, hi] = links[k].userData.range, margin = deg(25);
    const push = Math.max(0, lo + margin - qs[k]) - Math.max(0, qs[k] - (hi - margin));
    return (t - qs[k]) * 0.12 + push * 0.5;
  });
  const P2 = P.map((row, i) => row.map((x, j) => x - Po[i].reduce((s, y, m) => s + y * JoP[m][j], 0)));
  const dq3 = mulMV(P2, want).map((x) => x * dirWeight);   // posture leaks the same way; it fades too
  for (let k = 0; k < N; k++) {
    qs[k] += THREE.MathUtils.clamp(dq1[k] + dq2[k] + dq3[k], -0.2, 0.2);
    const [lo, hi] = links[k].userData.range;
    qs[k] = THREE.MathUtils.clamp(qs[k], lo, hi);
  }
  return miss;
}
function solveTo(target, dir, iterations) {
  restNow = restFor(target);
  // Waving: prefer the wrist rolled a quarter turn, which points the wrist-pitch axis roughly at the viewer,
  // so waveWrist() can swing the hand side to side without big turns of the two roll joints.
  if (palmGoal) restNow[6] = qs[6] >= 0 ? Math.PI / 2 : -Math.PI / 2;
  let miss = 0;
  for (let i = 0; i < iterations; i++) { miss = ikIterate(target, dir); if (miss < 0.0002) break; }
  // Polish with position alone, so whatever the lower tasks did, the fingertip ends exactly on target.
  for (let i = 0; i < 4; i++) miss = ikIterate(target, dir, false);
  // Stuck in an awkward posture? Try again from the relaxed one and keep whichever lands closer.
  if (miss > 0.003) {
    const kept = [...qs];
    qs.splice(0, N, ...restNow);
    let fresh = 0;
    for (let i = 0; i < 60; i++) { fresh = ikIterate(target, dir); if (fresh < 0.0002) break; }
    if (fresh < miss - 0.005) miss = fresh; else qs.splice(0, N, ...kept);   // only switch posture for a clear win (no flip-flopping)
  }
  return miss;
}
// The visible arm chases the solver's answer like a real machine: every joint has a top speed and a
// limit on how hard it can speed up or slow down, so a sudden change of target becomes a smooth swing,
// never a jerk or a shake. `scale` slows everything (sleeping, waking).
const MAX_SPEED = [1.3, 1.3, 1.8, 1.7, 2.2, 2.4, 2.8];   // rad/s, base to wrist
const BASE_ACCEL = 7;                                   // rad/s^2
const qv = new Array(N).fill(0);
function follow(dt, ease, scale = 1, wristBoost = 1) {
  for (let i = 0; i < N; i++) {
    const boost = i >= 4 ? wristBoost : 1;   // the forearm-roll and wrist joints can go faster for a wave
    const top = MAX_SPEED[i] * scale * boost, MAX_ACCEL = BASE_ACCEL * boost;
    const wantV = THREE.MathUtils.clamp((qs[i] - q[i]) * ease, -top, top);
    // brake in time: never faster than what can still stop at the target
    const stopV = Math.sqrt(2 * MAX_ACCEL * Math.abs(qs[i] - q[i])) * Math.sign(qs[i] - q[i]);
    const v = Math.abs(stopV) < Math.abs(wantV) ? stopV : wantV;
    qv[i] += THREE.MathUtils.clamp(v - qv[i], -MAX_ACCEL * dt, MAX_ACCEL * dt);
    q[i] += qv[i] * dt;
  }
  pose(q);
}

/* ---------- Soft contact shadow on the floor ---------- */
const SHADOW = { size: 2.4, res: 512, far: 0.8, blur: 1.5, darkness: 2.6, opacity: 0.55 };
const shadowGroup = new THREE.Group();
shadowGroup.position.y = 0.0005;
shadowGroup.visible = !CFG.overlay;   // over a page there is no visible floor
scene.add(shadowGroup);
const rt = new THREE.WebGLRenderTarget(SHADOW.res, SHADOW.res);
const rtBlur = new THREE.WebGLRenderTarget(SHADOW.res, SHADOW.res);
rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;
const plane = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW.size, SHADOW.size).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rt.texture, opacity: SHADOW.opacity, transparent: true, depthWrite: false, toneMapped: false }));
plane.scale.y = -1;
plane.renderOrder = 1;
shadowGroup.add(plane);
const blurPlane = new THREE.Mesh(plane.geometry);
blurPlane.visible = false;
shadowGroup.add(blurPlane);
const shadowCam = new THREE.OrthographicCamera(-SHADOW.size / 2, SHADOW.size / 2, SHADOW.size / 2, -SHADOW.size / 2, 0, SHADOW.far);
shadowCam.rotation.x = Math.PI / 2;
shadowGroup.add(shadowCam);
const depthMat = new THREE.MeshDepthMaterial();
depthMat.userData.darkness = { value: SHADOW.darkness };
depthMat.onBeforeCompile = (s) => {
  s.uniforms.darkness = depthMat.userData.darkness;
  s.fragmentShader = "uniform float darkness;\n" + s.fragmentShader.replace("gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );", "gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.4 ) * darkness );");
};
depthMat.depthTest = depthMat.depthWrite = false;
const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
hBlur.depthTest = vBlur.depthTest = false;
function blur(amount) {
  blurPlane.visible = true;
  blurPlane.material = hBlur;
  hBlur.uniforms.tDiffuse.value = rt.texture;
  hBlur.uniforms.h.value = amount / 256;
  renderer.setRenderTarget(rtBlur);
  renderer.render(blurPlane, shadowCam);
  blurPlane.material = vBlur;
  vBlur.uniforms.tDiffuse.value = rtBlur.texture;
  vBlur.uniforms.v.value = amount / 256;
  renderer.setRenderTarget(rt);
  renderer.render(blurPlane, shadowCam);
  blurPlane.visible = false;
}
function contactShadow() {
  const bg = scene.background;
  scene.background = null;
  plane.visible = false;
  scene.overrideMaterial = depthMat;
  const clearA = renderer.getClearAlpha();
  renderer.setClearAlpha(0);
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, shadowCam);
  scene.overrideMaterial = null;
  blur(SHADOW.blur);
  blur(SHADOW.blur * 0.4);
  renderer.setRenderTarget(null);
  renderer.setClearAlpha(clearA);
  renderer.shadowMap.autoUpdate = true;
  scene.background = bg;
  plane.visible = true;
}

/* ---------- Where the fingertip goes, and when it sleeps ---------- */
// Every point on the line from the camera through the cursor sits exactly under the cursor on screen,
// so the target is a point on that line the arm can reach: in front of the shoulder at a comfortable
// distance when the line passes close enough, otherwise the nearest point on it (the arm stretches out).
// The target is also kept above the floor and clear of the base.
const SHOULDER = new THREE.Vector3(0, 0.164, 0);   // scene coordinates: where the shoulder axis crosses the base axis
const REACH_COMFY = 0.6;
const FLOOR = 0.035;
const ndc = new THREE.Vector2(0.25, 0.1);
let tracking = false;   // true while the pointer is over the page; the arm stays on it even when it is still
const ray = new THREE.Raycaster();
const target = new THREE.Vector3(), aimDir = new THREE.Vector3(1, 0, 0);
const baseOnScreen = new THREE.Vector3();
let waveSide = 1;
const waveUp = new THREE.Vector3(), waveRight = new THREE.Vector3(), waveDir = new THREE.Vector3();   // which side of the waved-at thing the hand sits on (+1 = right)
const insideBase = (pt) => Math.hypot(pt.x, pt.z) < 0.14 && pt.y < 0.3;
// Rest: it sleeps at night in San Diego and wakes when someone moves.
const sdHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date()));
let asleep = params.get("night") === "1" || (CFG.sleeps && params.get("night") !== "0" && (sdHour() >= 23 || sdHour() < 7));
function wake() { if (asleep) { asleep = false; qs.splice(0, N, ...q); } }
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  tracking = CFG.follow;
  wake();
});
document.addEventListener("mouseleave", () => { tracking = false; });   // pointer left the page: wander
(CFG.overlay ? window : canvas).addEventListener("pointerdown", () => { gripping = true; wake(); });
addEventListener("pointerup", () => { gripping = false; });
// A page can pin the target to a point (client px), e.g. the thing being hovered, with its own reach angle.
let pinned = null;
const toNdc = (x, y) => ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
function chooseTarget(t) {
  const waving = poseName === "wave" || pinned?.pose === "wave" || Boolean(pinned?.wag);   // wag: a pointing hand, rocked like a wave ("no no")
  if (poseName === "wave" && !pinned && !CFG.overlay) {   // a hello: hand up, swaying side to side
    target.set(0.26, 0.86, 0.16 + Math.sin(t * 6) * 0.09);
    aimDir.set(0, 1, 0);
    return;
  }
  if (pinned && waving) {
    // Wave from the margin on the arm's own side of the thing, a little above it, so the hand never
    // covers the words or the cursor; and well inside the window.
    const baseX = (baseOnScreen.set(0, 0.3, 0).project(camera).x + 1) / 2 * innerWidth;
    waveSide = Math.sign(baseX - pinned.x) || 1;
    // The page can say exactly where to wave from (waveAt: [x, y] client px), e.g. just outside its text column.
    const [wx, wy] = pinned.waveAt ?? [pinned.x + waveSide * 190, pinned.y - 60];
    toNdc(THREE.MathUtils.clamp(wx, 120, innerWidth - 120), THREE.MathUtils.clamp(wy, innerHeight * 0.22, innerHeight * 0.6));
  }
  else if (pinned) toNdc(pinned.x, pinned.y);
  else if (!tracking) {
    if (CFG.idle === "park") ndc.set(...CFG.park);   // nobody here: tuck away off screen
    else ndc.set(Math.sin(t * 0.42) * 0.5, Math.sin(t * 0.67 + 1) * 0.35 + 0.05);   // nobody here: wander
  }
  ray.setFromCamera(ndc, camera);
  const O = ray.ray.origin, D = ray.ray.direction;
  const tc = a.copy(SHOULDER).sub(O).dot(D);
  const dmin = p.copy(O).addScaledVector(D, tc).distanceTo(SHOULDER);
  let tt = dmin < REACH_COMFY ? tc - Math.sqrt(REACH_COMFY ** 2 - dmin ** 2) : tc;
  if (D.y < 0) tt = Math.min(tt, (FLOOR - O.y) / D.y);   // above the floor
  for (let i = 0; i < 80 && insideBase(p.copy(O).addScaledVector(D, tt)); i++) tt -= 0.01;   // clear of the base
  target.copy(O).addScaledVector(D, tt);
  // Which way the finger points follows how high the target is: straight down when reaching low,
  // level at mid height, tipped up when reaching high. Sideways it points away from the base.
  const out = p.set(target.x, 0, target.z);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  out.normalize();
  const s = THREE.MathUtils.clamp((target.y - 0.42) / 0.3, -1, 1);
  const pitch = pinned?.pitch !== undefined ? deg(pinned.pitch) : s < 0 ? s * deg(85) : s * deg(55);
  aimDir.copy(out).multiplyScalar(Math.cos(pitch)).add(v.set(0, Math.sin(pitch), 0)).normalize();
  palmGoal = null;
  if (waving) {
    // A wave: hand upright with the palm turned to the viewer. The side-to-side rocking is one wrist
    // joint, added in frame() so the joint speed limits don't flatten it.
    aimDir.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const toViewer = v.copy(camera.position).sub(target).normalize();
    palmGoal = toViewer.addScaledVector(aimDir, -toViewer.dot(aimDir)).normalize().clone();
  }
}

// Photoreal look (materials, lighting, ambient occlusion, bloom...), if one is asked for.
// Default: Noir; ?look= (empty) for none.
const look = createLook(params.get("look") ?? CFG.look ?? "noir", { renderer, scene, camera, MATERIALS, key, robot, focusTarget: palm, overlay: CFG.overlay });
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Frame by width as well as height: the screen should be about as wide as the arm can reach, so the
  // fingertip can get under the cursor almost anywhere.
  const t = Math.tan(deg(camera.fov / 2));
  const distance = (Number(params.get("cam")) || CFG.zoom) * Math.max(0.48 / t, 0.85 / (t * camera.aspect));
  camera.position.set(0.6 * distance, 0.22 * distance, 0.78 * distance);
  camera.lookAt(0.05, 0.4, 0);
  camera.updateProjectionMatrix();
  // Slide the picture so the arm sits where the layout wants it (the perspective stays the same).
  if (CFG.shift[0] || CFG.shift[1]) camera.setViewOffset(w, h, -CFG.shift[0] * w, -CFG.shift[1] * h, w, h);
  look?.resize(w, h);
}
addEventListener("resize", fit);
fit();

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
let started = 0, frames = 0, held = null, waveEnv = 0;   // held: a joint pose to sit in, for review shots
// Shadows are only redrawn when something moved; a still arm costs one plain render per frame.
const lastQ = new Array(N).fill(1e9);
let lastHand = 0, still = 0;
function changed() {
  let d = 0;
  for (let i = 0; i < N; i++) { d = Math.max(d, Math.abs(q[i] - lastQ[i])); lastQ[i] = q[i]; }
  let h = 0;
  for (const n of handNames) h += handNow[n];
  d = Math.max(d, Math.abs(h - lastHand) * 0.01);
  lastHand = h;
  return d > 1e-5;
}
function render(moved = true) {
  if ((moved || frames < 3) && !CFG.overlay) contactShadow();   // over a page the floor is off screen; the page shadow (look.js) stands in
  if (look) look.render(clock.elapsedTime, moved || frames < 3); else renderer.render(scene, camera);
}
// Adaptive resolution: if frames run slow, drop the pixel density a step; if there is lots of headroom, raise it.
let frameEma = 1 / 60, slowFor = 0, fastFor = 0, lastNow = performance.now();
function adapt() {
  const now = performance.now(), raw = (now - lastNow) / 1000;
  lastNow = now;
  frameEma += (Math.min(raw, 0.2) - frameEma) * 0.05;
  slowFor = frameEma > 1 / 42 ? slowFor + raw : 0;
  fastFor = frameEma < 1 / 75 ? fastFor + raw : 0;
  const step = slowFor > 1 && pixelRatio > 0.75 ? -0.25 : fastFor > 4 && pixelRatio < DPR_CAP ? 0.25 : 0;
  if (step) { pixelRatio = Math.max(0.75, Math.min(DPR_CAP, pixelRatio + step)); renderer.setPixelRatio(pixelRatio); fit(); slowFor = fastFor = 0; }
}
const sp = new THREE.Vector3(), st = new THREE.Vector3();
function measure() {
  tipPos.copy(aim.pos).applyMatrix4(palm.matrixWorld);
  tipError.mm = tipPos.distanceTo(target) / MM;
  sp.copy(tipPos).project(camera);
  st.copy(target).project(camera);
  tipError.px = Math.hypot((sp.x - st.x) * innerWidth / 2, (sp.y - st.y) * innerHeight / 2);
}
// What a design's update(t, dt, S) can read: joint angles, hand pose, the rig, the camera.
const designState = { q, handNow, rig, camera, K };
let paused = false;   // arm.pause(true): the page took the arm away; skip all work until it comes back
function frame() {
  if (paused) { clock.getDelta(); requestAnimationFrame(frame); return; }
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.elapsedTime;
  // Hand: ease every finger joint toward the chosen pose (a fist while the mouse is held).
  const steer = pinned?.pose ? POSE_ANGLES[pinned.pose] : poseName === "auto" ? ((tracking || pinned) && !asleep ? POINT : RELAXED) : handGoal;
  const goal = gripping ? (pinned?.grip ? POSE_ANGLES[pinned.grip] : FIST) : steer;
  const k = 1 - Math.exp(-dt * (gripping ? 14 : 8));
  for (const n of handNames) handNow[n] += ((goal[n] ?? 0) - handNow[n]) * k;
  // The arm steers by where the fingertip sits in the chosen pose, not while gripping, so a click only
  // closes the fingers and the arm stays where it is.
  const waving = poseName === "wave" || pinned?.pose === "wave" || Boolean(pinned?.wag);   // wag: a pointing hand, rocked like a wave ("no no")
  const want = waving ? WAVE_AIM : pinned?.grip === "pinch" ? aimForPinch() : aimFor(steer);
  aim.pos.lerp(want.pos, 1 - Math.exp(-dt * 8));
  aim.dir.lerp(want.dir, 1 - Math.exp(-dt * 8)).normalize();
  if (held) { qs.splice(0, N, ...held); follow(dt, 10); }
  else if (asleep) {
    const breath = Math.sin(t * 1.1) * 0.025;
    qs.splice(0, N, ...ASLEEP.map((x, i) => x + (i === 3 ? breath : i === 5 ? -breath : 0)));
    follow(dt, 2.5, 0.3);
  } else {
    chooseTarget(t);
    if (t > 0.5) {
      started += dt;
      const ramp = THREE.MathUtils.smoothstep(started, 0, 1.4);   // wake up gently, then move briskly
      solveTo(target, aimDir, 12);
      follow(dt, 9, 0.3 + 0.7 * ramp);
      measure();
    } else pose(q);
  }
  // Wave: turn the hand side to side across the screen, about the wrist.
  waveEnv += ((waving && !asleep && !held ? 1 : 0) - waveEnv) * (1 - Math.exp(-dt * 5));
  const [rockAmp, rockHz] = pinned?.wag ? [0.3, 13] : [0.45, 8];   // a finger wag is smaller and quicker than a wave
  const rock = waveEnv > 0.01 ? waveEnv * rockAmp * Math.sin(t * rockHz) : 0;
  const waveOff = rock ? waveWrist(rock) : null;
  design.update?.(t, dt, designState);
  render(changed() || rock !== 0);
  if (waveOff) for (let k = 0; k < 3; k++) q[4 + k] -= waveOff[k];
  adapt();
  frames++;
  requestAnimationFrame(frame);
}
// The wave's rock: rotate the hand by `angle` about the line from the wrist centre (the wrist-pitch pivot)
// to the viewer, so it swings side to side in the picture, whatever the arm's posture. The three wrist joints
// (forearm roll, wrist pitch, wrist roll) meet at that centre, so they can turn the hand there without moving
// the wrist; a few damped least-squares steps find how much each turns. Returns the offsets added to q[4..6].
const wvAxis = new THREE.Vector3(), wvC = new THREE.Vector3(), wvWant = new THREE.Quaternion(), wvNow = new THREE.Quaternion(), wvErr = new THREE.Quaternion();
const wvA = new THREE.Matrix3(), wvE = new THREE.Vector3(), wvJ = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function waveWrist(angle) {
  const before = [q[4], q[5], q[6]];
  links[5].getWorldPosition(wvC);
  wvAxis.copy(camera.position).sub(wvC).normalize();
  wvWant.setFromAxisAngle(wvAxis, angle).multiply(links[6].getWorldQuaternion(wvNow));
  for (let it = 0; it < 4; it++) {
    wvErr.copy(wvWant).multiply(links[6].getWorldQuaternion(wvNow).invert());
    if (wvErr.w < 0) wvErr.set(-wvErr.x, -wvErr.y, -wvErr.z, -wvErr.w);
    const ang = 2 * Math.acos(Math.min(1, wvErr.w));
    if (ang < 1e-4) break;
    wvE.set(wvErr.x, wvErr.y, wvErr.z).normalize().multiplyScalar(ang);
    for (let k = 0; k < 3; k++) wvJ[k].copy(links[4 + k].userData.axis).transformDirection(links[4 + k].matrixWorld);
    // y = (J Jt + l^2 I)^-1 e, then dq_k = J_k . y
    const e = wvA.elements;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      e[c * 3 + r] = wvJ.reduce((sum, J) => sum + J.getComponent(r) * J.getComponent(c), 0) + (r === c ? 0.02 : 0);
    }
    wvE.applyMatrix3(wvA.invert());
    for (let k = 0; k < 3; k++) {
      const [lo, hi] = links[4 + k].userData.range;
      q[4 + k] = THREE.MathUtils.clamp(q[4 + k] + THREE.MathUtils.clamp(wvJ[k].dot(wvE), -0.5, 0.5), lo, hi);
    }
    pose(q);
  }
  return [q[4] - before[0], q[5] - before[1], q[6] - before[2]];
}
const POSE_ANGLES = Object.fromEntries(Object.keys(POSES).map((k) => [k, poseAngles(POSES[k])]));
const { fist: FIST, point: POINT, relaxed: RELAXED } = POSE_ANGLES;

/* ---------- A finished model drops in here ---------- */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const clean = (s) => s.replace(/[.:_]\d{3}$/, "").replace(/\s+/g, "_").toLowerCase();
async function swapIn(url) {
  const gltf = await loader.loadAsync(url);
  const saved = [...q], savedHand = { ...handNow };
  q.fill(0);
  for (const n of handNames) handNow[n] = 0;
  pose();   // the rig at rest matches the brief's rest pose: arm up, hand flat, every joint at zero
  const toSpec = new THREE.Matrix4().makeRotationX(Math.PI / 2);   // glTF is y-up, the brief is z-up
  const robotInv = robot.matrixWorld.clone().invert();
  const restOf = (g) => robotInv.clone().multiply(g.matrixWorld);
  const byName = new Map(Object.entries(rig).map(([n, g]) => [clean(n), g]));
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) throw new Error("no meshes in " + url);
  for (const m of blockout) m.removeFromParent();
  let matched = 0;
  for (const m of meshes) {
    let owner = null;
    for (let o = m; o && !owner; o = o.parent) owner = byName.get(clean(o.name || "")) ?? null;
    if (owner) matched++;
    owner ??= base;
    const local = restOf(owner).invert().multiply(toSpec.clone().multiply(m.matrixWorld));
    owner.add(m);
    local.decompose(m.position, m.quaternion, m.scale);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    m.material = mats.length > 1 ? mats.map((x) => MATERIALS[clean(x.name)] ?? x) : (MATERIALS[clean(mats[0].name)] ?? mats[0]);
    m.castShadow = m.receiveShadow = true;
  }
  q.splice(0, N, ...saved);
  Object.assign(handNow, savedHand);
  pose();
  return { meshes: meshes.length, matched };
}
// Export the block-out at rest, so it can be opened in Blender or Fusion as a proportion reference.
async function exportGLB() {
  const saved = [...q], savedHand = { ...handNow };
  q.fill(0);
  for (const n of handNames) handNow[n] = 0;
  pose();
  // The exporter yields to the animation loop before it reads transforms, so export a frozen copy.
  const still = robot.clone(true);
  q.splice(0, N, ...saved);
  Object.assign(handNow, savedHand);
  pose();
  const data = await new GLTFExporter().parseAsync(still, { binary: true });
  return new Blob([data], { type: "model/gltf-binary" });
}

/* ---------- Controls ---------- */
const controls = document.getElementById("controls") ?? document.createElement("nav");   // embedded pages have none
function refreshControls() {
  controls.querySelectorAll("[data-pose]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pose === poseName)));
  controls.querySelectorAll("[data-finish]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finish === finish)));
}
controls.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.pose) { poseName = b.dataset.pose; handGoal = poseGoal(poseName); asleep = false; }
  if (b.dataset.finish) { finish = b.dataset.finish; for (const m of blockout) m.material = roleMaterial(m.userData.role); }
  if (b.dataset.action === "sleep") asleep = true;
  if (b.dataset.action === "export") {
    const url = URL.createObjectURL(await exportGLB());
    Object.assign(document.createElement("a"), { href: url, download: "arm-blockout.glb" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  refreshControls();
});
refreshControls();

/* ---------- Start ---------- */
const triangles = () => { let n = 0; robot.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(n); };
async function start() {
  const wanted = params.get("model") ?? "models/arm-abstract.glb";
  let model = "block-out";
  try {
    const head = await fetch(wanted, { method: "HEAD" });
    if (head.ok) { const info = await swapIn(wanted); model = `${wanted} (${info.matched}/${info.meshes} parts matched)`; }
  } catch (e) { if (params.has("model")) console.error("model failed to load", e); }
  const label = document.getElementById("model");
  if (label) label.textContent = model === "block-out" ? "Block-out from the brief" : model;
  pose();
  canvas.classList.add("ready");
  if (calm) { chooseTarget(0); solveTo(target, aimDir, 400); q.splice(0, N, ...qs); pose(); design.update?.(0, 0, designState); render(); } else frame();
  window.__arm = {
    q, qs, qv, links, rig, camera, fit, perf: () => ({ pixelRatio, frameMs: +(frameEma * 1000).toFixed(1) }), thumbMiss, POSES, handNow, tipError, pinchGap, triangles, exportGLB, swapIn, target,
    getFrames: () => frames,
    setPose: (n) => { poseName = n; handGoal = poseGoal(n); refreshControls(); },
    setAsleep: (s) => { asleep = s; },
    hold: (pose) => { held = pose; if (!pose) qs.splice(0, N, ...q); },
    view: (pos, at) => { camera.position.set(...pos); camera.lookAt(...at); },
    // put the "cursor" at a screen position (normalised -1..1), as a test hook
    aim: (x, y) => { ndc.set(x, y); tracking = true; wake(); },
    solve: (n) => solveTo(target, aimDir, n),
    // the page-facing controls
    pointAt: (x, y, opts = {}) => { pinned = { x, y, ...opts }; wake(); },
    release: () => { pinned = null; },
    pause: (p) => { paused = Boolean(p); },
    // where the pinch (between thumb and index tips) is on screen right now, in client px
    tip: () => { const pt = wp(fingerTips.index).add(wp(fingerTips.thumb)).multiplyScalar(0.5).project(camera); return [(pt.x + 1) / 2 * innerWidth, (1 - pt.y) / 2 * innerHeight]; },
    fingerAngle: () => THREE.MathUtils.radToDeg(aim.dir.clone().transformDirection(palm.matrixWorld).angleTo(aimDir)),   // degrees off the wanted direction
  };
}
const designKey = DESIGN_FILES[wantedDesign] ? wantedDesign : "humanoid";
document.querySelectorAll("a.design").forEach((a) => (a.dataset.design === designKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
start().then(() => { window.arm = window.__arm; window.arm.design = { key: designKey, label: design.label }; dispatchEvent(new Event("arm-ready")); });
