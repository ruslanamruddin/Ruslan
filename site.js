/* Shared by the site pages: the San Diego clock, rows that open in place, a few shuffled photos,
   the line naming this visit's arm, and loading the arm itself (only with a mouse and room for it). */
(() => {
  // Local time where Ruslan is, whatever the visitor's own time zone. Any [data-clock] element.
  const sanDiego = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  function tick() {
    document.querySelectorAll("[data-clock]").forEach((el) => (el.textContent = (el.dataset.clock || "") + sanDiego.format(new Date()).toLowerCase()));
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  }
  tick();

  // Rows that open in place: .project > .project-row + .project-detail, one open at a time per list.
  document.querySelectorAll(".things").forEach((list) => {
    let open = null;
    const set = (p, on) => {
      p.classList.toggle("open", on);
      p.querySelector(".project-row").setAttribute("aria-expanded", String(on));
      p.querySelector(".project-detail").inert = !on;
    };
    list.querySelectorAll(".project").forEach((p) => {
      p.querySelector(".project-row")?.addEventListener("click", () => {
        const next = p === open ? null : p;
        if (open) set(open, false);
        if (next) set(next, true);
        open = next;
        list.classList.toggle("has-open", Boolean(next));
        if (next) setTimeout(() => {
          const box = next.getBoundingClientRect();
          if (box.top < 16 || box.bottom > innerHeight) next.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 520);
      });
    });
    list.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { const row = open.querySelector(".project-row"); row.click(); row.focus(); } });
  });

  // A few photos, shuffled every visit; real ones first, grey placeholders fill in. Any [data-glimpse="n"].
  const mix = (list) => list.map((p) => [Math.random(), p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  window.sitePhotos = fetch("data/photos.json").then((r) => r.json()).then((all) => [...mix(all.filter((p) => p.src)), ...mix(all.filter((p) => !p.src))]);
  window.sitePhotos.then((all) => {
    document.querySelectorAll("[data-glimpse]").forEach((box) => {
      const picks = mix(all.slice(0, Number(box.dataset.glimpse) || 4));
      box.replaceChildren(...picks.map((p) => {
        const tile = document.createElement("span");
        tile.style.flex = `${p.w / p.h} 1 0`;
        tile.style.aspectRatio = `${p.w} / ${p.h}`;
        if (p.src) tile.append(Object.assign(document.createElement("img"), { src: p.src, alt: "" }));
        return tile;
      }));
    });
  });

  // When the site last changed. Any [data-updated]. Bump SITE_UPDATED whenever the site changes.
  const SITE_UPDATED = "2026-11-10";
  const updated = new Date(SITE_UPDATED + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  document.querySelectorAll("[data-updated]").forEach((el) => (el.textContent = `Last updated ${updated}`));

  // The arm needs a mouse and room beside the text: skip it on phones and touch screens.
  addEventListener("DOMContentLoaded", () => {
    const stage = document.getElementById("stage");
    if (!stage) return;
    if (location.protocol === "file:") {   // browsers block the arm's modules on file:// pages
      const tip = Object.assign(document.createElement("p"), { textContent: "The arm only loads through the preview server: open http://localhost:4873/" + location.pathname.split("/").pop() });
      tip.style.cssText = "position:fixed;z-index:30;left:50%;bottom:16px;translate:-50% 0;margin:0;padding:8px 14px;border-radius:10px;background:#1f1d1b;color:#d8b45a;font-size:13px";
      document.body.append(tip);
    }
    if (matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches) import("./studio.js");
    else { stage.remove(); document.documentElement.classList.add("no-arm"); }
  });
})();
