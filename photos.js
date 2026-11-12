/* Photos: shuffled on every visit, stacked into columns, each keeping its own shape. */
(() => {
  const frame = document.getElementById("frame");
  const roll = document.getElementById("roll");
  const zoom = document.getElementById("zoom");
  const zoomImg = zoom.querySelector("img");
  const ZOOM_MS = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
  let photos = [];
  let columnCount = 0;
  let zoomed = null;
  let settle = null;

  function shuffled(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function makeTile(photo) {
    // Entries without a src are grey placeholders until the real photos arrive.
    const tile = document.createElement(photo.src ? "button" : "div");
    tile.style.aspectRatio = `${photo.w} / ${photo.h}`;
    if (!photo.src) {
      tile.className = "ph";
      return tile;
    }
    tile.type = "button";
    tile.className = "cell";
    tile.setAttribute("aria-label", "Expand photo");
    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = photo.alt ?? "";
    img.loading = "lazy";
    tile.dataset.ratio = photo.w / photo.h;
    tile.append(img);
    return tile;
  }

  function wantedColumns() {
    return Math.max(2, Math.min(6, Math.round(frame.clientWidth / 200)));
  }

  function layout(force) {
    const count = wantedColumns();
    if (!photos.length || (!force && count === columnCount)) return;
    columnCount = count;
    const columns = Array.from({ length: count }, () => {
      const el = document.createElement("div");
      el.className = "col";
      return { el, height: 0 };
    });
    photos.forEach((photo) => {
      const shortest = columns.reduce((a, b) => (b.height < a.height ? b : a));
      shortest.el.append(makeTile(photo));
      shortest.height += photo.h / photo.w;
    });
    roll.replaceChildren(...columns.map((c) => c.el));
  }

  function pinToCell(cell) {
    const outer = frame.getBoundingClientRect();
    const inner = cell.getBoundingClientRect();
    zoom.style.setProperty("--x", `${inner.left - outer.left}px`);
    zoom.style.setProperty("--y", `${inner.top - outer.top}px`);
    zoom.style.setProperty("--w", `${inner.width}px`);
    zoom.style.setProperty("--h", `${inner.height}px`);
  }

  // As large as fits in the frame, with the whole photo showing.
  function aimAtFrame(cell) {
    const room = { w: frame.clientWidth, h: frame.clientHeight };
    const ratio = Number(cell.dataset.ratio);
    const w = Math.min(room.w, room.h * ratio);
    const h = w / ratio;
    zoom.style.setProperty("--to-x", `${(room.w - w) / 2}px`);
    zoom.style.setProperty("--to-y", `${(room.h - h) / 2}px`);
    zoom.style.setProperty("--to-w", `${w}px`);
    zoom.style.setProperty("--to-h", `${h}px`);
  }

  function finishClosing() {
    if (!settle) return;
    clearTimeout(settle.timer);
    settle.cell.classList.remove("origin");
    zoom.classList.remove("live");
    settle = null;
  }

  function openPhoto(cell) {
    finishClosing();
    const img = cell.querySelector("img");
    zoomImg.src = img.currentSrc || img.src;
    zoomImg.alt = img.alt;
    pinToCell(cell);
    aimAtFrame(cell);
    zoom.classList.add("live");
    cell.classList.add("origin");
    zoom.getBoundingClientRect(); // lock in the starting size before it grows
    zoom.classList.add("on");
    frame.classList.add("open");
    zoomed = cell;
    zoom.focus({ preventScroll: true });
  }

  function closePhoto() {
    const cell = zoomed;
    zoomed = null;
    pinToCell(cell);
    zoom.classList.remove("on");
    frame.classList.remove("open");
    cell.focus({ preventScroll: true });
    settle = { cell, timer: setTimeout(finishClosing, ZOOM_MS) };
  }

  roll.addEventListener("click", (e) => {
    if (zoomed) return closePhoto(); // clicking beside an open photo closes it
    const cell = e.target.closest(".cell");
    if (cell) openPhoto(cell);
  });
  zoom.addEventListener("click", closePhoto);
  frame.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && zoomed) closePhoto();
  });
  addEventListener("resize", () => {
    layout();
    if (zoomed) aimAtFrame(zoomed);
  });
  addEventListener("lab:change", () => {
    if (zoomed) closePhoto();
    requestAnimationFrame(() => layout());
  });

  fetch("data/photos.json")
    .then((res) => res.json())
    .then((list) => {
      photos = shuffled(list);
      layout(true);
    });
})();
