const MOBILE_MQ = window.matchMedia("(max-width: 768px)");

const $ = (id) => document.getElementById(id);

function isMobileLayout() {
  return MOBILE_MQ.matches;
}

function setMobileTab(tab) {
  const tabs = ["gallery", "filters", "upload", "calendar", "more"];
  if (!tabs.includes(tab)) tab = "gallery";
  document.body.classList.remove(...tabs.map((t) => `mobile-tab-${t}`));
  document.body.classList.add(`mobile-tab-${tab}`);

  document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
    btn.classList.toggle("mobile-nav-active", btn.dataset.mobileTab === tab);
  });

  if (tab === "filters") {
    openMobileDrawer();
  } else {
    closeMobileDrawer(false);
  }

  const backdrop = $("mobileBackdrop");
  if (backdrop) {
    const showBackdrop = tab === "more" || document.body.classList.contains("mobile-drawer-open");
    backdrop.hidden = !showBackdrop;
    backdrop.setAttribute("aria-hidden", showBackdrop ? "false" : "true");
  }

  const moreSheet = $("mobileMoreSheet");
  if (moreSheet) {
    moreSheet.hidden = tab !== "more";
  }
}

function openMobileDrawer() {
  document.body.classList.add("mobile-drawer-open");
  $("mobileMenuBtn")?.setAttribute("aria-expanded", "true");
  const backdrop = $("mobileBackdrop");
  if (backdrop && isMobileLayout()) {
    backdrop.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
  }
}

function closeMobileDrawer(updateTab = true) {
  document.body.classList.remove("mobile-drawer-open");
  $("mobileMenuBtn")?.setAttribute("aria-expanded", "false");
  if (updateTab && document.body.classList.contains("mobile-tab-filters")) {
    setMobileTab("gallery");
    return;
  }
  if (isMobileLayout() && !document.body.classList.contains("mobile-tab-more")) {
    const backdrop = $("mobileBackdrop");
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
  }
}

function wireMobileMoreActions() {
  const container = $("mobileMoreActions");
  if (!container || container.dataset.wired === "1") return;

  const items = [
    { label: "OCR aan/uit", trigger: "ocrToggleBtn" },
    { label: "Model & API-key", trigger: "ocrModelBtn" },
    { label: "Ververs", trigger: "refreshBtn" },
  ];

  for (const { label, trigger } of items) {
    const src = $(trigger);
    if (!src || src.hidden) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      src.click();
      setMobileTab("gallery");
    });
    container.appendChild(btn);
  }

  const logLink = document.querySelector('.header-actions a[href="/ocr-logs.html"]');
  if (logLink) {
    const a = document.createElement("a");
    a.className = "btn btn-ghost";
    a.href = logLink.href;
    a.textContent = "OCR-log";
    container.appendChild(a);
  }

  const clientLink = $("clientSetupLink");
  if (clientLink) {
    const a = document.createElement("a");
    a.className = "btn btn-ghost";
    a.href = clientLink.href;
    a.textContent = "Windows-client";
    container.appendChild(a);
  }

  container.dataset.wired = "1";
}

function ensureLightboxMobileChrome() {
  const figure = document.querySelector(".lightbox-figure");
  if (!figure || figure.querySelector(".lightbox-mobile-nav")) return;

  const hint = document.createElement("p");
  hint.className = "lightbox-swipe-hint";
  hint.textContent = "Veeg links/rechts voor vorige/volgende foto";

  const nav = document.createElement("div");
  nav.className = "lightbox-mobile-nav";
  nav.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="lightboxMobilePrev">‹ Vorige</button>
    <button type="button" class="btn btn-ghost btn-sm" id="lightboxMobileNext">Volgende ›</button>
  `;

  figure.append(hint, nav);

  $("lightboxMobilePrev")?.addEventListener("click", () => $("lightboxPrev")?.click());
  $("lightboxMobileNext")?.addEventListener("click", () => $("lightboxNext")?.click());
}

function bindLightboxSwipe() {
  const zone = $("lightboxView");
  if (!zone || zone.dataset.swipeBound === "1") return;
  zone.dataset.swipeBound = "1";

  let startX = 0;
  let startY = 0;

  zone.addEventListener(
    "touchstart",
    (e) => {
      if (!isMobileLayout() || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );

  zone.addEventListener(
    "touchend",
    (e) => {
      if (!isMobileLayout() || !$("lightbox")?.open) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx > 0) $("lightboxPrev")?.click();
      else $("lightboxNext")?.click();
    },
    { passive: true },
  );
}

function bindMobileNav() {
  $("mobileMenuBtn")?.addEventListener("click", () => {
    if (document.body.classList.contains("mobile-drawer-open")) {
      closeMobileDrawer();
    } else {
      setMobileTab("filters");
    }
  });

  $("mobileBackdrop")?.addEventListener("click", () => {
    closeMobileDrawer();
    if (document.body.classList.contains("mobile-tab-more")) {
      setMobileTab("gallery");
    }
  });

  $("mobileMoreClose")?.addEventListener("click", () => setMobileTab("gallery"));

  document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMobileTab(btn.dataset.mobileTab || "gallery");
    });
  });

  MOBILE_MQ.addEventListener("change", () => {
    if (!isMobileLayout()) {
      document.body.classList.remove(
        "mobile-drawer-open",
        "mobile-tab-filters",
        "mobile-tab-upload",
        "mobile-tab-calendar",
        "mobile-tab-more",
      );
      document.body.classList.add("mobile-tab-gallery");
      const backdrop = $("mobileBackdrop");
      if (backdrop) backdrop.hidden = true;
      const more = $("mobileMoreSheet");
      if (more) more.hidden = true;
    } else {
      setMobileTab("gallery");
      wireMobileMoreActions();
    }
  });
}

export function initMobileUi() {
  document.body.classList.add("mobile-tab-gallery");
  bindMobileNav();
  bindLightboxSwipe();
  ensureLightboxMobileChrome();

  if (isMobileLayout()) {
    wireMobileMoreActions();
    setMobileTab("gallery");
  }
}
