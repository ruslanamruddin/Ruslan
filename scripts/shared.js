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
  const resizeHandle = document.getElementById("sidebar-resize");
  const detailDivider = document.getElementById("sidebar-detail-divider");
  if (!overlay || !panel || !iframe) return;

  const base = document.querySelector("base")?.getAttribute("href") || "/";

  // Drag-to-resize
  if (resizeHandle) {
    let startX, startWidth;
    const onMouseMove = (e) => {
      const newWidth = startWidth + (startX - e.clientX);
      const clamped = Math.max(320, Math.min(newWidth, window.innerWidth * 0.95));
      panel.style.width = clamped + "px";
    };
    const onMouseUp = () => {
      panel.classList.remove("is-resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      iframe.style.pointerEvents = "";
    };
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      panel.classList.add("is-resizing");
      iframe.style.pointerEvents = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  // Drag-to-resize vertical (detail/iframe split)
  if (detailDivider && detail) {
    let startY, startHeight;
    const onVMove = (e) => {
      const delta = e.clientY - startY;
      const panelTop = panel.getBoundingClientRect().top;
      const headerH = detail.offsetTop - panelTop;
      const available = panel.offsetHeight - headerH - detailDivider.offsetHeight;
      const newH = Math.max(60, Math.min(startHeight + delta, available - 80));
      detail.style.height = newH + "px";
      panel.style.gridTemplateRows = `auto ${newH}px auto 1fr`;
    };
    const onVUp = () => {
      panel.classList.remove("is-resizing");
      document.removeEventListener("mousemove", onVMove);
      document.removeEventListener("mouseup", onVUp);
      iframe.style.pointerEvents = "";
    };
    detailDivider.addEventListener("mousedown", (e) => {
      if (!panel.classList.contains("has-detail")) return;
      e.preventDefault();
      startY = e.clientY;
      startHeight = detail.offsetHeight;
      panel.classList.add("is-resizing");
      iframe.style.pointerEvents = "none";
      document.addEventListener("mousemove", onVMove);
      document.addEventListener("mouseup", onVUp);
    });
  }

  const projects = {
    "histoscope": {
      title: "Histoscope",
      liveUrl: "https://histoscope.app",
      detail: `
        <figure class="sidebar-demo-figure">
          <img class="sidebar-demo-img" src="${base}images/histoscope-demo.png" alt="Histoscope platform demo" title="Click image" />
        </figure>
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
      title: "Deep Learning Pipeline for Placental Histology Segmentation",
      detail: `
        <figure class="sidebar-demo-figure">
          <img class="sidebar-demo-img" src="${base}images/poster-day.png" alt="Poster conference presentation" title="Click image" />
          <figcaption>Presented research at poster conference.</figcaption>
        </figure>
        <h3>Abstract</h3>
        <p>Systematically optimized deep learning pipeline for three-class segmentation (fetal blood space, maternal blood space, background tissue) in CD31-stained rat placenta. Benchmarked 12 encoders, 5 decoders, 12 loss functions, and 7 augmentation strategies. Achieved Dice ~0.80 with automated measurements showing no significant difference from expert annotations (r &gt; 0.9, all p &gt; 0.09). Performance plateaus at 15 labeled images.</p>
        <h3>Methods</h3>
        <p>Sequential optimization of encoder, decoder, loss function, augmentation, and data efficiency. Encoders ranged from histology foundation models (Virchow2, H-Optimus-0) to standard ConvNeXt and EfficientNetV2. All models trained in PyTorch with differential learning rates and end-to-end fine-tuning.</p>
        <h3>Results</h3>
        <p>ConvNeXt encoders matched foundation models at 5-10x lower inference cost. U-Net top decoder; decoder impact minimal vs. encoder. Lovász loss best precision-recall balance. No augmentation strategy significantly improved over baseline. 3 placentas (15 images) reached 96% of full-dataset performance. Six downstream morphometric metrics validated against expert with no systematic bias.</p>
        <h3>Limitations</h3>
        <p>Not yet validated across labs, scanners, or staining protocols. Currently specific to CD31-stained rodent placenta.</p>
        <h3>Next steps</h3>
        <p>Expand to additional IHC markers. Cross-lab generalizability testing. Open-source release. Train on H&E alone to remove IHC requirement.</p>
        <div class="sidebar-meta">
          <span class="meta-pill">Research</span>
          <span class="status-badge is-compact">Results ready (writing)</span>
          <span class="chip">computer-vision</span>
          <span class="chip">segmentation</span>
          <span class="chip">U-Net</span>
          <span class="chip">PyTorch</span>
        </div>
      `
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
      if (proj.liveUrl) {
        if (detailDivider) detailDivider.hidden = false;
        iframe.hidden = false;
        iframe.src = proj.liveUrl;
      } else {
        if (detailDivider) detailDivider.hidden = true;
        iframe.hidden = true;
        iframe.src = "about:blank";
      }
    } else {
      if (detail) detail.hidden = true;
      if (detailDivider) detailDivider.hidden = true;
      iframe.hidden = false;
      panel.classList.remove("has-detail");
      iframe.src = `${base}projects/${slug}/`;
    }

    const shell = document.querySelector(".site-shell");
    overlay.hidden = false;
    panel.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      panel.classList.add("is-open");
      if (shell) shell.classList.add("is-pushed");
    });
  };

  const closeSidebar = () => {
    const shell = document.querySelector(".site-shell");
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    if (shell) shell.classList.remove("is-pushed");
    panel.addEventListener("transitionend", () => {
      overlay.hidden = true;
      panel.hidden = true;
      panel.classList.remove("has-detail");
      if (detail) { detail.hidden = true; detail.style.height = ""; }
      if (detailDivider) detailDivider.hidden = true;
      iframe.hidden = false;
      panel.style.gridTemplateRows = "";
      iframe.src = "about:blank";
      panel.style.width = "";
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

// Lightbox
(() => {
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightbox-img");
  const lbClose = document.getElementById("lightbox-close");
  const lbBackdrop = document.getElementById("lightbox-backdrop");
  if (!lightbox || !lbImg) return;

  const openLightbox = (src, alt) => {
    lbImg.src = src;
    lbImg.alt = alt || "";
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add("is-open"));
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    setTimeout(() => { lightbox.hidden = true; lbImg.src = ""; }, 200);
  };

  document.addEventListener("click", (e) => {
    const img = e.target.closest(".sidebar-demo-img");
    if (img) openLightbox(img.src, img.alt);
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbBackdrop) lbBackdrop.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
  });
})();
