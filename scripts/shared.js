// Theme toggle
(() => {
  const storageKey = "research-archive-theme";
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");
  if (!(toggle instanceof HTMLButtonElement)) return;
  const syncLabel = (theme) => {
    toggle.textContent = theme === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  };
  const setTheme = (theme) => {
    root.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
    syncLabel(theme);
  };
  syncLabel(root.dataset.theme === "dark" ? "dark" : "light");
  toggle.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });
})();

// Sidebar panel
(() => {
  const overlay = document.getElementById("sidebar-overlay");
  const panel = document.getElementById("sidebar-panel");
  const title = document.getElementById("sidebar-title");
  const iframe = document.getElementById("sidebar-iframe");
  const closeBtn = document.getElementById("sidebar-close");
  const detail = document.getElementById("sidebar-detail");
  const detailInner = document.getElementById("sidebar-detail-inner");
  if (!overlay || !panel || !iframe) return;

  const base = document.querySelector("base")?.getAttribute("href") || "/";

  const projects = {
    "histoscope": {
      title: "Histoscope",
      liveUrl: "https://histoscope.app",
      detail: `
        <h3>What it is</h3>
        <p>A research-focused platform for deploying, reviewing, and iteratively improving machine learning histology segmentation models in real lab workflows.</p>
        <h3>Purpose</h3>
        <p>Bridges experimental labs and ML research by enabling versioned inference runs, human-in-the-loop review of segmentation outputs, and reproducible mask export for downstream quantitative analysis.</p>
        <div class="sidebar-meta">
          <span class="meta-pill">Tool</span>
          <span class="status-badge is-compact">Ongoing</span>
          <span class="chip">ML-tooling</span>
          <span class="chip">human-in-the-loop</span>
          <span class="chip">histology</span>
        </div>
      `
    },
    "placental-histology-segmentation": {
      title: "Deep Learning Pipeline for Placental Histology Segmentation"
    },
    "prenatal-thc-cbd-placenta": {
      title: "Prenatal THC + CBD Effects on Rat Placental Development"
    }
  };

  const openSidebar = (slug) => {
    const proj = projects[slug] || { title: slug };
    if (title) title.textContent = proj.title;

    if (proj.detail && detail && detailInner) {
      detailInner.innerHTML = proj.detail;
      detail.hidden = false;
      panel.classList.add("has-detail");
      iframe.src = proj.liveUrl;
    } else {
      if (detail) detail.hidden = true;
      panel.classList.remove("has-detail");
      iframe.src = `${base}projects/${slug}/`;
    }

    overlay.hidden = false;
    panel.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      panel.classList.add("is-open");
    });
  };

  const closeSidebar = () => {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.addEventListener("transitionend", () => {
      overlay.hidden = true;
      panel.hidden = true;
      panel.classList.remove("has-detail");
      if (detail) detail.hidden = true;
      iframe.src = "about:blank";
    }, { once: true });
  };

  // Project row clicks
  document.querySelectorAll("[data-project-slug]").forEach(btn => {
    btn.addEventListener("click", () => {
      const slug = btn.getAttribute("data-project-slug");
      if (slug) openSidebar(slug);
    });
  });

  // Close actions
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      closeSidebar();
    }
  });

  // Expose for command palette
  window.__openSidebar = openSidebar;
})();

// Command palette
(() => {
  const projects = [
    { title: "Histoscope", slug: "histoscope", type: "Tool", status: "Ongoing" },
    { title: "Deep Learning Pipeline for Placental Histology Segmentation", slug: "placental-histology-segmentation", type: "Research", status: "Results ready (writing)" },
    { title: "Prenatal THC + CBD Effects on Rat Placental Development", slug: "prenatal-thc-cbd-placenta", type: "Research", status: "Ongoing" }
  ];
  const palette = document.getElementById("command-palette");
  const input = document.getElementById("command-search");
  const results = document.getElementById("command-results");
  const openers = document.querySelectorAll("[data-command-open]");
  const closers = document.querySelectorAll("[data-command-close]");
  if (!palette || !input || !results) return;

  const open = () => {
    palette.hidden = false;
    requestAnimationFrame(() => {
      palette.classList.add("is-open");
      input.value = "";
      input.focus();
      render("");
    });
  };
  const close = () => {
    palette.classList.remove("is-open");
    setTimeout(() => { palette.hidden = true; }, 140);
  };

  const render = (query) => {
    const q = query.toLowerCase();
    const filtered = projects.filter(p => p.title.toLowerCase().includes(q) || p.type.toLowerCase().includes(q));
    results.innerHTML = "";
    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.className = "command-empty";
      li.textContent = "No matches.";
      results.append(li);
      return;
    }
    filtered.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "command-item";
      btn.innerHTML = `<span>${p.title}</span><span class="status-badge is-compact">${p.status}</span>`;
      btn.addEventListener("click", () => {
        close();
        if (typeof window.__openSidebar === "function") {
          window.__openSidebar(p.slug);
        } else {
          const b = document.querySelector("base")?.getAttribute("href") || "/";
          window.location.href = `${b}projects/${p.slug}/`;
        }
      });
      const li = document.createElement("li");
      li.append(btn);
      results.append(li);
    });
  };

  openers.forEach(b => b.addEventListener("click", open));
  closers.forEach(b => b.addEventListener("click", close));
  input.addEventListener("input", () => render(input.value));
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); palette.hidden ? open() : close(); }
    if (e.key === "Escape" && !palette.hidden) close();
  });
})();
