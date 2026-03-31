(() => {
  const archive = document.querySelector("[data-project-archive]");
  if (!(archive instanceof HTMLElement)) return;

  const dataElement = document.getElementById("projects-data");
  if (!(dataElement instanceof HTMLScriptElement)) return;

  const projects = JSON.parse(dataElement.textContent || "[]");
  if (!Array.isArray(projects) || projects.length === 0) return;

  const projectMap = new Map(projects.map((p) => [p.slug, p]));
  const linkLabels = { github: "GitHub", demo: "Demo", poster: "Poster", slides: "Slides", dataset: "Dataset" };

  const list = document.getElementById("project-list");
  const empty = document.getElementById("project-empty");
  const rows = Array.from(document.querySelectorAll("[data-project-row]"));

  if (!(list instanceof HTMLElement) || !(empty instanceof HTMLElement) || rows.length === 0) return;

  const rowItems = rows.map((row) => {
    const item = row.closest("li");
    if (!(item instanceof HTMLElement) || !(row instanceof HTMLButtonElement)) return null;
    return { row, item };
  }).filter(Boolean);

  if (rowItems.length === 0) return;

  const searchInput = document.getElementById("project-search");
  const sortSelect = document.getElementById("project-sort");
  const filterChips = Array.from(document.querySelectorAll("[data-filter-chip]"));

  const previewCard = document.getElementById("preview-card");
  const previewTitle = document.getElementById("preview-title");
  const previewSummary = document.getElementById("preview-summary");
  const previewType = document.getElementById("preview-type");
  const previewStatus = document.getElementById("preview-status");
  const previewMeta = document.getElementById("preview-meta");
  const previewVenue = document.getElementById("preview-venue");
  const previewImageWrap = document.getElementById("preview-image-wrap");
  const previewImage = document.getElementById("preview-image");
  const previewAbstract = document.getElementById("preview-abstract");
  const abstractToggle = document.getElementById("preview-abstract-toggle");
  const previewLinks = document.getElementById("preview-links");
  const previewLatest = document.getElementById("preview-latest");
  const readFull = document.getElementById("preview-read-full");
  const mobileToggle = document.getElementById("preview-mobile-toggle");
  const previewColumn = document.querySelector(".project-preview-column");

  if (
    !(searchInput instanceof HTMLInputElement) ||
    !(sortSelect instanceof HTMLSelectElement) ||
    !(previewCard instanceof HTMLElement) ||
    !(previewTitle instanceof HTMLElement) ||
    !(previewSummary instanceof HTMLElement) ||
    !(previewType instanceof HTMLElement) ||
    !(previewStatus instanceof HTMLElement) ||
    !(previewMeta instanceof HTMLElement) ||
    !(previewVenue instanceof HTMLElement) ||
    !(previewImageWrap instanceof HTMLElement) ||
    !(previewImage instanceof HTMLImageElement) ||
    !(previewAbstract instanceof HTMLElement) ||
    !(abstractToggle instanceof HTMLButtonElement) ||
    !(previewLinks instanceof HTMLElement) ||
    !(previewLatest instanceof HTMLElement) ||
    !(readFull instanceof HTMLAnchorElement)
  ) return;

  const formatDate = (v) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v));

  let abstractExpanded = false;

  const setAbstractState = (expanded) => {
    abstractExpanded = expanded;
    previewAbstract.classList.toggle("is-collapsed", !expanded);
    abstractToggle.textContent = expanded ? "Collapse" : "Expand";
    abstractToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const state = { search: "", type: "all", status: "all", tag: "all", sort: "recently-updated", selected: "" };

  const setActiveChip = (group, value) => {
    filterChips.forEach((chip) => {
      if (chip.getAttribute("data-filter-group") !== group) return;
      chip.classList.toggle("is-active", chip.getAttribute("data-filter-value") === value);
    });
  };

  const syncControls = () => {
    searchInput.value = state.search;
    sortSelect.value = state.sort;
    setActiveChip("type", state.type);
    setActiveChip("status", state.status);
    setActiveChip("tag", state.tag);
  };

  const setPreviewLinks = (links) => {
    previewLinks.innerHTML = "";
    const entries = Object.entries(links || {}).filter(([, v]) => Boolean(v));
    if (entries.length === 0) {
      const text = document.createElement("p");
      text.className = "muted";
      text.textContent = "No external links yet.";
      previewLinks.append(text);
      return;
    }
    entries.forEach(([key, value]) => {
      const a = document.createElement("a");
      a.className = "link-pill";
      a.href = String(value);
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = linkLabels[key] || key;
      previewLinks.append(a);
    });
  };

  const setLatest = (updates) => {
    previewLatest.innerHTML = "";
    if (!Array.isArray(updates) || updates.length === 0) {
      const t = document.createElement("p");
      t.className = "muted";
      t.textContent = "No timeline updates yet.";
      previewLatest.append(t);
      return;
    }
    const latest = updates[0];
    const t = document.createElement("p");
    const s = document.createElement("strong");
    s.textContent = "Latest:";
    t.append(s, ` ${formatDate(latest.date)} — ${latest.note}`);
    previewLatest.append(t);
  };

  const syncUrl = () => {
    if (!state.selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("project", state.selected);
    window.history.replaceState({}, "", url);
  };

  const renderPreview = (project) => {
    previewCard.classList.remove("is-swapping");
    requestAnimationFrame(() => {
      previewCard.classList.add("is-swapping");
      setTimeout(() => previewCard.classList.remove("is-swapping"), 180);
    });
    previewTitle.textContent = project.title;
    previewSummary.textContent = project.summary;
    previewType.textContent = project.type;
    previewStatus.textContent = project.status;
    previewStatus.className = "status-badge";
    previewMeta.textContent = `Updated ${formatDate(project.lastUpdated)}`;
    if (project.venueTarget) { previewVenue.hidden = false; previewVenue.textContent = `Venue: ${project.venueTarget}`; }
    else { previewVenue.hidden = true; previewVenue.textContent = ""; }
    if (project.featuredImage) { previewImageWrap.hidden = false; previewImage.src = project.featuredImage; }
    else { previewImageWrap.hidden = true; previewImage.src = ""; }
    previewAbstract.textContent = project.abstract;
    setAbstractState(false);
    setPreviewLinks(project.links);
    setLatest(project.updates);
    const base = document.querySelector("base")?.getAttribute("href") || "/";
    readFull.href = `${base}projects/${project.slug}/`;
  };

  const renderSelection = () => {
    rowItems.forEach(({ row }) => {
      const sel = row.getAttribute("data-project-slug") === state.selected;
      row.classList.toggle("is-selected", sel);
      row.setAttribute("aria-selected", sel ? "true" : "false");
    });
    const project = projectMap.get(state.selected);
    if (project) { renderPreview(project); syncUrl(); }
  };

  const compareRows = (a, b) => {
    const attr = state.sort === "oldest" || state.sort === "newest" ? "data-project-date" : "data-project-updated";
    const aT = new Date(a.row.getAttribute(attr) || "").getTime();
    const bT = new Date(b.row.getAttribute(attr) || "").getTime();
    return state.sort === "oldest" ? aT - bT : bT - aT;
  };

  const applyFilters = () => {
    const query = state.search.trim().toLowerCase();
    rowItems.forEach(({ row, item }) => {
      const title = row.getAttribute("data-project-title") || "";
      const summary = row.getAttribute("data-project-summary") || "";
      const abstract = row.getAttribute("data-project-abstract") || "";
      const tags = (row.getAttribute("data-project-tags") || "").split("|").filter(Boolean);
      const type = row.getAttribute("data-project-type") || "";
      const status = row.getAttribute("data-project-status") || "";
      const searchable = `${title} ${summary} ${abstract} ${tags.join(" ")}`.toLowerCase();
      const match = (!query || searchable.includes(query)) &&
        (state.type === "all" || state.type === type) &&
        (state.status === "all" || state.status === status) &&
        (state.tag === "all" || tags.includes(state.tag));
      item.hidden = !match;
    });
    const visible = rowItems.filter(({ item }) => !item.hidden);
    visible.sort(compareRows).forEach(({ item }) => list.append(item));
    empty.hidden = visible.length > 0;
    const visibleRows = visible.map(({ row }) => row);
    if (!visibleRows.some((r) => r.getAttribute("data-project-slug") === state.selected)) {
      state.selected = visibleRows[0]?.getAttribute("data-project-slug") || "";
    }
    renderSelection();
  };

  rowItems.forEach(({ row }) => {
    row.addEventListener("click", () => {
      state.selected = row.getAttribute("data-project-slug") || "";
      renderSelection();
    });
  });

  searchInput.addEventListener("input", () => { state.search = searchInput.value; applyFilters(); });
  sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; applyFilters(); });

  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const group = chip.getAttribute("data-filter-group");
      const value = chip.getAttribute("data-filter-value") || "all";
      if (!group) return;
      if (group === "type") state.type = value;
      if (group === "status") state.status = value;
      if (group === "tag") state.tag = value;
      setActiveChip(group, value);
      applyFilters();
    });
  });

  abstractToggle.addEventListener("click", () => setAbstractState(!abstractExpanded));

  if (mobileToggle instanceof HTMLButtonElement && previewColumn instanceof HTMLElement) {
    mobileToggle.addEventListener("click", () => {
      const collapsed = previewColumn.classList.toggle("is-collapsed");
      mobileToggle.textContent = collapsed ? "Show preview" : "Hide preview";
      mobileToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  const slugFromUrl = new URL(window.location.href).searchParams.get("project");
  if (slugFromUrl && projectMap.has(slugFromUrl)) state.selected = slugFromUrl;
  else state.selected = rowItems[0]?.row.getAttribute("data-project-slug") || "";

  syncControls();
  applyFilters();
})();
