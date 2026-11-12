const activity = document.getElementById("activity");
const strip = document.getElementById("strip");
const tip = document.getElementById("tip");
const panel = document.getElementById("week");
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

const DAY = 864e5;
const JAN_1 = Date.UTC(new Date().getUTCFullYear(), 0, 1);
const FIRST_WEEK = JAN_1 - new Date(JAN_1).getUTCDay() * DAY; // the Sunday that opens this year's first week
const ROTATIONS = [
  0, 5, 0, -5, 0, 5, 0, 0, -5, 0, 0, 5, 0, 0, -5, 0, 0, 0, 5, 0, 0, -5, 0, 0, 0, 5,
  0, 0, -5, 0, 0, 5, 0, 0, -5, 0, 0, 5, 0, 0, 0, -5, 0, 0, 0, 0, 5, 0, 0, -5, 0, 0,
];
const EASE_MS = (n) => Math.round(((Math.max(4, n) - 1) * 0.022 + 0.15) * 1000);

const short = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const long = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n, word) => `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

function buildYear(rows, songs) {
  const byStart = new Map(rows.map((r) => [r.start, r]));
  const today = Date.now();
  const weeks = ROTATIONS.map((rotation, i) => {
    const start = FIRST_WEEK + i * 7 * DAY;
    const end = start + 6 * DAY;
    const row = byStart.get(iso(start)) ?? {};
    return {
      start,
      end,
      rotation,
      commits: row.commits ?? 0,
      repos: row.repos ?? 0,
      added: row.added ?? 0,
      deleted: row.deleted ?? 0,
      aiDiffs: row.aiDiffs ?? 0,
      model: row.model ?? null,
      songs: songs.filter((s) => s.date >= iso(start) && s.date <= iso(end)),
      status: today > end + DAY ? "past" : today >= start ? "current" : "future",
    };
  });
  const top = Math.log1p(Math.max(...weeks.map((w) => w.commits), 1));
  weeks.forEach((w) => {
    w.heat = w.commits ? (Math.log1p(w.commits) / top) * 100 : 0;
  });
  return weeks;
}

let weeks = [];
let active = null;

function renderStrip() {
  strip.replaceChildren(
    ...weeks.map((week, i) => {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.dataset.i = i;
      tick.className = `tick ${week.status}${week.heat ? "" : " none"}`;
      tick.style.setProperty("--rotate", week.status === "past" ? `${week.rotation}deg` : "0deg");
      tick.style.setProperty("--level", week.heat ? (0.2 + (week.heat / 100) * 0.8).toFixed(3) : 1);
      tick.setAttribute("aria-label", `${short.format(week.start)} to ${short.format(week.end)}: ${plural(week.commits, "commit")}`);
      tick.setAttribute("aria-expanded", "false");
      if (week.status === "future") tick.tabIndex = -1;
      tick.append(document.createElement("i"));
      return tick;
    })
  );
}

/* Hover card */
function showTip(tick) {
  const week = weeks[tick.dataset.i];
  tip.querySelector(".tip-when").textContent = `${short.format(week.start)} - ${short.format(week.end)}`;
  tip.querySelector(".tip-commits").textContent = plural(week.commits, "commit");
  tip.querySelector(".tip-songs").textContent = plural(week.songs.length, "song");

  const rootBox = activity.getBoundingClientRect();
  const tickBox = tick.getBoundingClientRect();
  const center = tickBox.left + tickBox.width / 2 - rootBox.left;
  const x = Math.min(Math.max(center - tip.offsetWidth / 2, -8), rootBox.width - tip.offsetWidth + 8);
  tip.style.setProperty("--x", `${Math.round(x)}px`);
  tip.classList.add("on");
}

function hideTip() {
  tip.classList.remove("on");
}

/* Click panel */
function item(text, n) {
  const li = document.createElement("li");
  li.className = "fade";
  li.style.setProperty("--n", n);
  li.textContent = text;
  return li;
}

function renderPanel(week) {
  const code = [];
  if (week.commits) {
    const across = week.repos ? ` across ${plural(week.repos, "repo")}` : "";
    code.push(plural(week.commits, "commit") + across);
    if (week.added) code.push(`${week.added.toLocaleString("en")} lines added`);
    if (week.deleted) code.push(`${week.deleted.toLocaleString("en")} lines deleted`);
  } else {
    code.push("No commits");
  }
  if (week.aiDiffs) code.push(plural(week.aiDiffs, "AI diff"));
  if (week.model) code.push(`Used ${week.model} most`);

  panel.querySelector(".week-range").textContent = `${long.format(week.start)} - ${long.format(week.end)}`;
  panel.querySelector(".week-code").replaceChildren(...code.map(item));

  const offset = code.length;
  const songRows = week.songs.length
    ? week.songs.map((song, n) => {
        const li = item("", n + offset);
        const a = document.createElement("a");
        a.href = song.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = `${song.title} by ${song.artist}`;
        li.append(a);
        return li;
      })
    : [item("None yet", offset)];
  panel.querySelector(".week-songs").replaceChildren(...songRows);
}

function setPanelHeight(height, ms) {
  panel.style.transitionDuration = calm ? "0ms" : `${ms}ms, 200ms`;
  panel.style.height = `${height}px`;
  panel.style.opacity = height ? 1 : 0;
}

function select(index) {
  const closing = index === null || index === active;
  const opening = active === null;
  [...strip.children].forEach((tick, i) => {
    const isOn = !closing && i === index;
    const canDim = weeks[i].status !== "future";
    tick.classList.toggle("active", isOn);
    tick.classList.toggle("dim", !closing && !isOn && canDim);
    tick.setAttribute("aria-expanded", String(isOn));
  });

  if (closing) {
    if (active === null) return;
    setPanelHeight(0, EASE_MS(weeks[active].songs.length));
    active = null;
    panel.inert = true;
    return;
  }

  active = index;
  renderPanel(weeks[index]);
  panel.inert = false;
  const height = panel.firstElementChild.offsetHeight;
  setPanelHeight(height, opening ? EASE_MS(weeks[index].songs.length) : 0);
}

function wireStrip() {
  strip.addEventListener("pointerover", (e) => {
    const tick = e.target.closest(".tick");
    if (tick) showTip(tick);
  });
  strip.addEventListener("pointerleave", hideTip);
  strip.addEventListener("focusin", (e) => {
    const tick = e.target.closest(".tick");
    if (tick) showTip(tick);
  });
  strip.addEventListener("focusout", hideTip);
  if (document.documentElement.dataset.strip !== "hover") {
    strip.addEventListener("click", (e) => {
      const tick = e.target.closest(".tick");
      if (tick) select(Number(tick.dataset.i));
    });
  }
  panel.querySelector(".week-close").addEventListener("click", () => select(null));
  activity.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active !== null) {
      e.preventDefault();
      select(null);
    }
  });
  addEventListener("resize", () => {
    if (active !== null) setPanelHeight(panel.firstElementChild.offsetHeight, 0);
  });
}

/* Lines around the cursor lean away and spring back. The line being pointed at stays still. */
function wireLean() {
  if (calm || !matchMedia("(hover: hover)").matches) return;
  const REACH = 72;
  const MAX_LEAN = 14;
  const STILL = 6; // lines are about 11px apart, so only the nearest one falls inside this
  let pointer = null;
  let queued = false;

  function paint() {
    queued = false;
    for (const line of strip.children) {
      const distance = line.offsetLeft + line.offsetWidth / 2 - pointer;
      const along = Math.min(1, Math.max(0, (Math.abs(distance) - STILL) / (REACH - STILL)));
      const lean = pointer === null ? 0 : Math.sign(distance) * MAX_LEAN * Math.sin(Math.PI * along);
      line.style.setProperty("--lean", `${lean.toFixed(2)}deg`);
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  strip.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer = e.clientX - activity.getBoundingClientRect().left;
    queue();
  });
  strip.addEventListener("pointerleave", () => {
    pointer = null;
    queue();
  });
}

async function load(path, fallback) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

Promise.all([load("data/activity.json", []), load("data/songs.json", [])]).then(([rows, songs]) => {
  weeks = buildYear(rows, songs);
  renderStrip();
  wireStrip();
  wireLean();
});
