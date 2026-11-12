// Look development for the arm: physically based materials with procedural surface textures, three
// lighting setups, and a post-processing stack (ambient occlusion, soft shadows, bloom, depth of field,
// film finish). studio.js calls createLook(name, ctx) once; it returns { render, resize, update }.
//   studio   - product photography: seamless grey sweep, big softboxes, soft shadow, ambient occlusion
//   noir     - dark and cinematic: black stage, rim strips, glowing rings, shallow focus, grain
//   daylight - natural light: warm low sun, sky fill, crisp but soft shadows on a warm floor
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// Photographed rooms (CC0, Poly Haven) for what the surfaces reflect: real reflections are most of what
// makes paint and metal look real. The procedural room is used until the photo has loaded.
const HDRI = { daylight: "models/env/photo_studio_loft_hall_1k.hdr", studio: "models/env/studio_small_09_1k.hdr" };

/* ---------- Procedural, tileable surface textures ---------- */
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
// Tileable fractal value noise, 0..1, size x size.
function fbm(size, cells, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  const rand = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o, grid = new Float32Array(n * n).map(() => rand());
    const g = (x, y) => grid[((y % n + n) % n) * n + ((x % n + n) % n)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
        const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function toTexture(size, pixel, srgb = false) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d"), img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const [r, g, b] = pixel(i); img.data.set([r, g, b, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
// A normal map from a height field (strength = slope scale).
function normalTexture(size, h, strength) {
  return toTexture(size, (i) => {
    const x = i % size, y = (i / size) | 0;
    const at = (xx, yy) => h[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength, dy = (at(x, y - 1) - at(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [((dx / l) * 0.5 + 0.5) * 255, ((dy / l) * 0.5 + 0.5) * 255, ((1 / l) * 0.5 + 0.5) * 255];
  });
}
// Roughness in the green channel, around `base` by +-`spread`.
function roughTexture(size, h, base, spread) {
  return toTexture(size, (i) => { const v = THREE.MathUtils.clamp(base + (h[i] - 0.5) * 2 * spread, 0, 1) * 255; return [v, v, v]; });
}
function makeSurfaces() {
  const S = 1024;
  const peel = fbm(S, 24, 3, 7, 0.55);                 // orange peel of a sprayed, clear-coated shell
  const grain = fbm(S, 96, 2, 11, 0.6);                // bead-blast / anodise grain
  const mottle = fbm(S, 6, 4, 23, 0.55);               // large, gentle variation in sheen
  const rub = fbm(S, 140, 2, 31, 0.7);                 // rubber micro-texture
  const mix = new Float32Array(S * S).map((_, i) => grain[i] * 0.7 + mottle[i] * 0.3);
  return {
    peelNormal: normalTexture(S, peel, 5),
    peelRough: roughTexture(S, mottle, 0.52, 0.07),    // powder-coat / satin paint, not a glossy toy
    satinRough: roughTexture(S, mottle, 0.58, 0.06),
    grainNormal: normalTexture(S, grain, 9),
    grainRough: roughTexture(S, mix, 0.44, 0.06),
    rubberNormal: normalTexture(S, rub, 14),
    rubberRough: roughTexture(S, rub, 0.82, 0.08),
    carbonNormal: carbonWeave(S),
  };
}
// Twill carbon-fibre weave as a normal map: alternating tows running across and along.
function carbonWeave(S) {
  const tows = 32, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * tows, v = (y / S) * tows, cu = Math.floor(u), cv = Math.floor(v);
    const across = ((cu + cv) >> 1) % 2 === 0;   // 2x2 twill
    const f = across ? u - cu : v - cv;
    h[y * S + x] = Math.sin(f * Math.PI) * 0.8 + (across ? 0.1 : 0);
  }
  return normalTexture(S, h, 3);
}
const rep = (t, x, y = x) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

/* ---------- Physically based material set ---------- */
function makeMaterials(T, look) {
  const named = (m, name) => ((m.name = name), m);
  return {
    // sprayed ceramic-white shell under a clear coat
    paint: named(new THREE.MeshPhysicalMaterial({
      color: 0xe9e8e4, roughness: 1, roughnessMap: rep(T.peelRough, 2, 6), metalness: 0,
      normalMap: rep(T.peelNormal, 8, 22), normalScale: new THREE.Vector2(0.025, 0.025),
      specularIntensity: 0.45,
    }), "paint"),
    // bead-blasted aluminium: fine isotropic grain, a little satin
    metal: named(new THREE.MeshPhysicalMaterial({
      color: 0xc8c9cc, metalness: 1, roughness: 1, roughnessMap: rep(T.grainRough, 10, 24),
      normalMap: rep(T.grainNormal, 10, 24), normalScale: new THREE.Vector2(0.04, 0.04),
    }), "metal"),
    // hard-anodised graphite at the joints
    dark: named(new THREE.MeshPhysicalMaterial({
      color: 0x141518, metalness: 0.25, roughness: 1, roughnessMap: rep(T.grainRough, 10, 24),
      normalMap: rep(T.grainNormal, 10, 24), normalScale: new THREE.Vector2(0.03, 0.03),
    }), "dark"),
    // soft rubber: very rough, with a faint velvet sheen at grazing angles
    rubber: named(new THREE.MeshPhysicalMaterial({
      color: 0x1f1f21, metalness: 0, roughness: 1, roughnessMap: rep(T.rubberRough, 4, 8),
      normalMap: rep(T.rubberNormal, 8, 16), normalScale: new THREE.Vector2(0.12, 0.12),
      sheen: 0.45, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x4a4a50),
    }), "rubber"),
    steel: named(new THREE.MeshPhysicalMaterial({ color: 0xcfd1d5, metalness: 1, roughness: 0.32, normalMap: rep(T.grainNormal, 2, 2), normalScale: new THREE.Vector2(0.02, 0.02) }), "steel"),
    carbon: named(new THREE.MeshPhysicalMaterial({
      color: 0x16171a, metalness: 0.3, roughness: 0.32, normalMap: rep(T.carbonNormal, 6, 14), normalScale: new THREE.Vector2(0.5, 0.5),
      clearcoat: 0.45, clearcoatRoughness: 0.18,
    }), "carbon"),
    glow: named(new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x38d6ff, emissiveIntensity: look === "noir" ? 5 : 3, roughness: 0.4 }), "glow"),
    smoke: named(new THREE.MeshPhysicalMaterial({ color: 0x23262c, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.08, depthWrite: false }), "smoke"),
    gloss: named(new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, metalness: 0, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2, normalMap: rep(T.peelNormal, 8, 22), normalScale: new THREE.Vector2(0.015, 0.015) }), "gloss"),
    // satin white shell: the soft-sheen finish humanoid robots wear, with a whisper of orange peel
    satin: named(new THREE.MeshPhysicalMaterial({
      color: 0xedece8, metalness: 0, roughness: 1, roughnessMap: rep(T.satinRough, 2, 6),
      normalMap: rep(T.peelNormal, 10, 26), normalScale: new THREE.Vector2(0.02, 0.02),
    }), "satin"),
    // warm titanium accents, finely brushed
    titanium: named(new THREE.MeshPhysicalMaterial({
      color: 0xbab4ab, metalness: 1, roughness: 1, roughnessMap: rep(T.grainRough, 10, 24),
      normalMap: rep(T.grainNormal, 10, 24), normalScale: new THREE.Vector2(0.03, 0.03), anisotropy: 0.4,
    }), "titanium"),
    // the lit ring: bright enough to bloom
    light: named(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: look === "noir" ? 0xdfeaff : 0xffffff, emissiveIntensity: look === "noir" ? 6 : 3, roughness: 0.4 }), "light"),
    // camera glass with an anti-reflection coating that shifts colour with angle
    glass: named(new THREE.MeshPhysicalMaterial({
      color: 0x040506, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02,
      iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 650],
    }), "glass"),
  };
}

/* ---------- Environments (what the surfaces reflect) ---------- */
// A soft box: bright in the middle, falling off to the edges, the way a diffused light really looks.
function softboxTexture(warm = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 8, 64, 64, 90);
  grd.addColorStop(0, `rgb(255,${Math.round(250 * warm)},${Math.round(244 * warm)})`);
  grd.addColorStop(0.6, `rgb(235,${Math.round(232 * warm)},${Math.round(226 * warm)})`);
  grd.addColorStop(1, "rgb(40,40,42)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function envScene(look) {
  const room = new THREE.Scene();
  const box = (w, h, power, pos, warm = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: softboxTexture(warm), color: new THREE.Color(power, power, power), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0.5, 0);
    room.add(m);
  };
  const shell = (color) => room.add(new THREE.Mesh(new THREE.SphereGeometry(16, 48, 24), new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })));
  if (look === "studio") {
    shell(new THREE.Color(0.16, 0.16, 0.17));
    box(6, 4, 3.2, [0.5, 5, 1.6]);       // big overhead box
    box(1.6, 7, 4.5, [4.8, 1.2, 4.4]);   // tall strip: the long highlight down each link
    box(1, 6, 2.6, [-5.5, 1.5, 2.8]);    // thin edge from the other side
    box(5, 3, 1.8, [-3, 2.4, -6]);       // rim from behind
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.55, 0.56) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.3;
    room.add(floor);
  } else if (look === "noir") {
    shell(new THREE.Color(0.012, 0.012, 0.014));
    box(0.4, 8, 3.2, [4.2, 1.5, -3.5]);  // hard rim strip, back right
    box(0.4, 8, 2.2, [-4.2, 1.5, -3]);   // rim strip, back left
    box(3, 1.5, 0.6, [1, 5.5, 2]);       // dim top fill
  } else if (look === "daylight") {
    // a real interior to reflect (walls, ceiling lights, a floor), lit warmly through a window by the sun:
    // reflections with structure are what stop the shells looking like plastic
    const room = new RoomEnvironment();
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: softboxTexture(0.86), color: new THREE.Color(14, 14, 14), side: THREE.DoubleSide }));
    sun.position.set(-3, 6, 4); sun.lookAt(0, 0.5, 0); room.add(sun);
    return room;
  } else {   // old daylight sky (kept for reference, unused)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0.52, 0.68, 1.0) }, horizon: { value: new THREE.Color(1.0, 0.96, 0.9) }, ground: { value: new THREE.Color(0.55, 0.46, 0.38) } },
      vertexShader: "varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top, horizon, ground; varying vec3 vp; void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c * 1.4, 1.0); }",
    }));
    room.add(sky);
    box(1.2, 1.2, 40, [6, 4, 3], 0.86);  // the sun disc, warm
    box(8, 4, 1.4, [-6, 3, 2]);          // a bright window on the far side
  }
  return room;
}

/* ---------- Finishing shader: vignette and fine film grain ---------- */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.3 }, grain: { value: 0.03 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vignette, grain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - vignette * smoothstep(0.25, 0.85, length(d) * 1.2);
      c.rgb *= v; c.rgb += (hash(vUv * 1000.0) - 0.5) * grain; gl_FragColor = c; }`,
};

/* ---------- The look ---------- */
export function createLook(look, ctx) {
  if (!["studio", "noir", "daylight"].includes(look)) return null;
  const { renderer, scene, camera, MATERIALS, key, robot, focusTarget } = ctx;
  const T = makeSurfaces();
  const mats = makeMaterials(T, look);
  // swap every material on the arm for its physically based twin, keeping names
  Object.assign(MATERIALS, mats);
  robot.traverse((m) => { if (m.isMesh && mats[m.material.name]) m.material = mats[m.material.name]; });

  // photographic response
  renderer.toneMapping = look === "noir" ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = { studio: 1.0, noir: 0.85, daylight: 1.0 }[look];
  renderer.shadowMap.type = THREE.VSMShadowMap;

  // environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene(look), 0.012).texture;
  scene.environmentIntensity = { studio: 1, noir: 0.7, daylight: 0.5 }[look];   // the room fills; the sun shapes
  if (HDRI[look]) {
    new RGBELoader().load(HDRI[look], (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); pmrem.dispose();
      scene.environment = env;
      scene.environmentIntensity = { studio: 0.9, daylight: 0.75 }[look];
      scene.environmentRotation.y = { studio: 0, daylight: -2.2 }[look];   // the room's bright windows up and to the left, like the sun
      ctx.onEnv?.();
    }, undefined, () => pmrem.dispose());
  } else pmrem.dispose();
  if (!ctx.overlay) scene.background = new THREE.Color({ studio: 0xeeeef0, noir: 0x0b0b0d, daylight: 0xf4f0ea }[look]);

  // key light and a soft shadow-catching floor
  if (look === "studio") { key.color.set(0xffffff); key.intensity = 1.6; key.position.set(1.1, 3.4, 2.2); }
  if (look === "noir") { key.color.set(0xffe6c8); key.intensity = 3.2; key.position.set(-1.6, 2.8, 1.2); }
  if (look === "daylight") { key.color.set(0xfff3e4); key.intensity = 3.4; key.position.set(-1.5, 2.6, 1.7); }   // high, front-left, matching the page shadow
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = look === "daylight" ? 5 : 14;
  key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0002;
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.6, bottom: -0.6, near: 0.3, far: 8 });
  key.shadow.camera.updateProjectionMatrix();
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: { studio: 0.22, noir: 0.5, daylight: 0.32 }[look] }));
  catcher.receiveShadow = true;
  catcher.position.y = 0.0002;
  scene.add(catcher);
  // Over a web page there is no floor to land on, so the arm casts a soft shadow onto the page itself (see
  // pageShadow below): its silhouette, drawn small, blurred and offset down and to the right, under the arm.
  if (look === "noir") {   // a cool rim from behind, to draw the silhouette out of the dark
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.6);
    rim.position.set(-1.2, 1.5, -2.5);
    scene.add(rim);
  }

  // Fast by default: everything above is cheap (materials, lighting, shadow map). The expensive screen
  // effects (ambient occlusion, bloom, depth of field) only run with ?quality=high. The vignette and grain
  // are a CSS layer, which costs nothing.
  const high = new URLSearchParams(location.search).get("quality") === "high";
  if (!ctx.overlay) {
    const veil = document.createElement("div");
    const v = { studio: 0.1, noir: 0.5, daylight: 0.08 }[look];
    veil.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${v}) 100%)`;
    document.body.append(veil);
  }
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // cheap soft edges; VSM's blur passes cost too much per frame
  // sharp self-shadows: the map only covers the arm's reach (it was spread over 4 m, which made blotches)
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.4, bottom: -1, near: 0.5, far: 7 });
  key.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.autoUpdate = false;              // redrawn only when the arm moves (see render)
  let composer = null, ao = null, bokeh = null, shadowDirty = true, skip = false;
  if (high) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.4, thickness: 1.2, scale: look === "noir" ? 1.3 : 1.1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    composer.addPass(ao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), { studio: 0.25, noir: 0.55, daylight: 0.15 }[look], 0.5, { studio: 1.4, noir: 2.2, daylight: 1.6 }[look]));
    if (look === "noir") { bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.0012, maxblur: 0.006 }); composer.addPass(bokeh); }
    composer.addPass(new OutputPass());
    const finish = new ShaderPass(FinishShader);
    finish.uniforms.vignette.value = 0;
    finish.uniforms.grain.value = { studio: 0.012, noir: 0.035, daylight: 0.01 }[look];
    composer.addPass(finish);
  }

  // The page shadow: the arm's silhouette rendered at a quarter of the screen's resolution (cheap), blurred
  // with a proper two-pass Gaussian (smooth, no ghost copies of the fingers), then drawn first and offset down
  // and to the right, away from the key light, so the arm sits on top of its own shadow. Only redrawn when the
  // arm moves; all the blurring happens on the small target, so it stays cheap.
  let pageShadow = null;
  if (ctx.overlay) {
    const small = () => new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false });
    const sil = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: true }), pass1 = small(), soft = small();
    const silScene = new THREE.Scene();
    silScene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const strength = { daylight: [0.2, 0.12], studio: [0.18, 0.1], noir: [0.5, 0.2] }[look];
    const flat = new THREE.Camera(), quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quadScene.add(quad);
    const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    // 13-tap Gaussian along one axis; taps 1.5 texels apart (linear filtering fills the gaps)
    const sigma = 4, weights = Array.from({ length: 7 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma) * 2.25));
    const wsum = weights[0] + 2 * weights.slice(1).reduce((x, y) => x + y, 0);
    const blurMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
      uniforms: { src: { value: null }, step: { value: new THREE.Vector2() }, W: { value: weights.map((w) => w / wsum) } },
      vertexShader,
      fragmentShader: `uniform sampler2D src; uniform vec2 step; uniform float W[7]; varying vec2 vUv;
        void main(){ float a = texture2D(src, vUv).a * W[0];
          for (int i = 1; i < 7; i++) { vec2 o = step * 1.5 * float(i); a += (texture2D(src, vUv + o).a + texture2D(src, vUv - o).a) * W[i]; }
          gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
    });
    const drawMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { sil: { value: sil.texture }, soft: { value: soft.texture }, px: { value: new THREE.Vector2(1, 1) }, wide: { value: strength[0] }, tight: { value: strength[1] } },
      vertexShader,
      fragmentShader: `uniform sampler2D sil, soft; uniform vec2 px; uniform float wide, tight; varying vec2 vUv;
        void main(){
          // offsets in screen px: a broad soft shadow further out, and a tighter, darker one close to the arm
          float w = texture2D(soft, vUv + vec2(-26.0, 36.0) * px).a;
          vec2 c = vUv + vec2(-7.0, 10.0) * px;
          float t = 0.25 * (texture2D(sil, c + vec2(3.0, 3.0) * px).a + texture2D(sil, c + vec2(-3.0, 3.0) * px).a
                          + texture2D(sil, c + vec2(3.0, -3.0) * px).a + texture2D(sil, c + vec2(-3.0, -3.0) * px).a);
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(w * wide + t * tight, 0.0, 1.0));
        }`,
    });
    const blur = (from, to, dx, dy) => {
      quad.material = blurMat; blurMat.uniforms.src.value = from.texture; blurMat.uniforms.step.value.set(dx / from.width, dy / from.height);
      renderer.setRenderTarget(to); renderer.render(quadScene, flat);
    };
    pageShadow = {
      resize(w, h) {
        const sw = Math.max(8, Math.round(w / 4)), sh = Math.max(8, Math.round(h / 4));
        sil.setSize(sw, sh); pass1.setSize(sw, sh); soft.setSize(sw, sh);
        drawMat.uniforms.px.value.set(1 / w, 1 / h);
      },
      update() {   // draw the silhouette (only the arm, not its floor) into the small target, then blur it
        const parent = robot.parent, clearA = renderer.getClearAlpha();
        silScene.add(robot);
        renderer.setClearAlpha(0);
        renderer.setRenderTarget(sil); renderer.clear(); renderer.render(silScene, camera);
        blur(sil, pass1, 1, 0); blur(pass1, soft, 0, 1);
        renderer.setRenderTarget(null);
        renderer.setClearAlpha(clearA);
        parent.add(robot);
      },
      draw() { quad.material = drawMat; renderer.clear(); renderer.render(quadScene, flat); },
    };
    const size = renderer.getSize(new THREE.Vector2());
    pageShadow.resize(size.x, size.y);
  }

  const tmp = new THREE.Vector3();
  return {
    name: look,
    high,
    resize(w, h) {
      renderer.shadowMap.needsUpdate = true;
      pageShadow?.resize(w, h); shadowDirty = true;
      if (!composer) return;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      ao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    },
    render(t, moved) {
      if (moved) renderer.shadowMap.needsUpdate = true;
      if (pageShadow && !composer) {
        if (shadowDirty || (moved && (skip = !skip))) { pageShadow.update(); shadowDirty = false; }   // blurred, so every other frame is enough
        const auto = renderer.autoClear;
        pageShadow.draw();
        renderer.autoClear = false; renderer.render(scene, camera); renderer.autoClear = auto;
        return;
      }
      if (!composer) { renderer.render(scene, camera); return; }
      if (bokeh && focusTarget) bokeh.uniforms.focus.value = camera.position.distanceTo(focusTarget.getWorldPosition(tmp));
      composer.render();
    },
  };
}
