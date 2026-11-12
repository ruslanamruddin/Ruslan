/* Quiet synthesised sounds for the site: no audio files, all made in the browser with Web Audio.
   Character: "Smooth cobot" from sound-lab.html (option 5) — a clean, quiet electric glide like a modern
   collaborative arm: a sine hum with a slight vibrato and a soft triangle overtone that rise with the hand's
   speed, and gentle sine blips instead of clicks. The numbers match that card in sound-sets.js.
   Browsers only allow sound after the visitor's first click, so nothing plays before that.
   window.siteSound: tick() for hovers, click() for presses, grip() for the gripper, dock() when a page lands,
   servo(speed) for the arm's motion (screen px per second of the hand), and toggle() / on for the mute button.
   The choice is remembered in this browser. */
(() => {
  const COBOT = {
    layers: [
      { wave: "sine", f: [320, 980], detune: [0, 4], vol: 0.02, curve: 1.8, vib: { rate: 5, depth: 6 } },
      { wave: "triangle", f: [640, 1960], detune: [0], vol: 0.006, curve: 2.2 },
    ],
    tick: [["blip", "sine", 2200, 2200, 0.02, 0.015]],
    click: [["blip", "sine", 880, 660, 0.05, 0.05]],
    grip: [["blip", "sine", 660, 990, 0.06, 0.04]],
    dock: [["thump", 180, 90, 0.14, 0.1], ["blip", "sine", 520, 520, 0.12, 0.025]],
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  let ctx = null, master = null, setters = [], level = 0;
  let on = true;
  try { on = localStorage.getItem("site-sound") !== "off"; } catch {}

  function start() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 1 : 0;
    master.connect(ctx.destination);
    // the motion hum: each layer's pitch and loudness follow the hand's speed; silent at rest
    for (const L of COBOT.layers) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      const oscs = L.detune.map((cents) => { const o = ctx.createOscillator(); o.type = L.wave; o.frequency.value = L.f[0]; o.detune.value = cents; o.connect(g); o.start(); return o; });
      if (L.vib) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = L.vib.rate; depth.gain.value = L.vib.depth;
        oscs.forEach((o) => depth.connect(o.detune)); lfo.connect(depth); lfo.start();
      }
      setters.push((s, t) => {
        oscs.forEach((o) => o.frequency.setTargetAtTime(lerp(L.f[0], L.f[1], s), t, 0.08));
        g.gain.setTargetAtTime(L.vol * Math.pow(s, L.curve), t, 0.06);
      });
    }
  }
  addEventListener("pointerdown", start, true);
  addEventListener("keydown", start, true);

  // one-shots: ["thump", from, to, dur, vol] a falling sine; ["blip", wave, from, to, dur, vol] a pitched tone
  function shot(list) {
    if (!ctx || !on) return;
    for (const p of list) {
      const wave = p[0] === "thump" ? "sine" : p[1];
      const [from, to, dur, vol] = p[0] === "thump" ? p.slice(1) : p.slice(2);
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  window.siteSound = {
    get on() { return on; },
    tick: () => shot(COBOT.tick),
    click: () => shot(COBOT.click),
    grip: () => shot(COBOT.grip),
    dock: () => shot(COBOT.dock),
    // called every frame with the hand's speed; smoothed the same way the sound lab does
    servo(speed) {
      if (!ctx) return;
      level += (Math.min(1, speed / 2200) - level) * 0.18;
      if (level < 0.005) level = 0;
      const t = ctx.currentTime;
      setters.forEach((fn) => fn(level, t));
    },
    toggle() {
      on = !on;
      try { localStorage.setItem("site-sound", on ? "on" : "off"); } catch {}
      if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
      return on;
    },
  };
})();
