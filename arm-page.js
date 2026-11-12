/* Points the arm at whatever you hover. Load after the page content, before studio.js.
   Mark anything with data-arm. Options on the element:
     data-arm-anchor = left | right | center | top | bottom, or a corner like "bottom right" (where the fingertip goes; default left)
     data-arm-pitch  = degrees the finger points (+ up, - down); default follows the height
     data-arm-pose   = point | primed | pinch | wave | open | relaxed   (hand shape while hovering; primed = ready to pinch)
     data-arm-grip   = pinch   (what a click does; default a fist. With pinch, the open hand hovers so the
                       pinch lands on the anchor point)
   A page can set window.armIdle() to say what happens when nothing is hovered, and set window.armLocked = true
   while it drives the arm itself (hovering then leaves the arm alone). */
(() => {
  function anchorOf(el) {
    // one side (left | right | top | bottom | center) or a corner ("bottom right")
    const r = el.getBoundingClientRect(), a = (el.dataset.armAnchor || "left").split(/[\s-]+/);
    const x = a.includes("left") ? r.left + 2 : a.includes("right") ? r.right - 2 : (r.left + r.right) / 2;
    const y = a.includes("top") ? r.top + 2 : a.includes("bottom") ? r.bottom - 2 : (r.top + r.bottom) / 2;
    return [x, y];
  }
  function aimAt(el) {
    if (!window.arm || window.armLocked) return;
    const [x, y] = anchorOf(el);
    // A wave happens beside the text, not on it: just outside its column ([data-arm-column], else <main>), a little above.
    const column = (el.closest("[data-arm-column]") ?? el.closest("main"))?.getBoundingClientRect();
    const waveAt = el.dataset.armPose === "wave" && column ? [column.right + 170, y - 80] : undefined;
    window.arm.pointAt(x, y, { pitch: el.dataset.armPitch !== undefined ? Number(el.dataset.armPitch) : undefined, pose: el.dataset.armPose, grip: el.dataset.armGrip, waveAt });
  }
  let hovered = null;
  const idle = () => (window.armLocked ? null : window.armIdle ? window.armIdle() : window.arm?.release());
  function wire() {
    document.querySelectorAll("[data-arm]").forEach((el) => {
      if (el.dataset.armWired) return;
      el.dataset.armWired = "1";
      el.addEventListener("pointerenter", () => { hovered = el; aimAt(el); });
      el.addEventListener("pointerleave", () => { if (hovered === el) { hovered = null; idle(); } });
    });
  }
  addEventListener("arm-ready", () => { wire(); idle(); });
  addEventListener("scroll", () => (hovered ? aimAt(hovered) : idle()), { passive: true });
  addEventListener("resize", () => (hovered ? aimAt(hovered) : idle()));
  window.armAimAt = aimAt;
  window.armWire = wire;
})();
