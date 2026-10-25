const API = "/api";
const COLLECTION = "screenshots";
const PER_PAGE = 48;

const state = {
  items: [],
  page: 1,
  totalPages: 1,
  albums: [],
  view: "all",
  tag: null,
  clientId: null,
  albumId: null,
  search: "",
  sort: "-captured_at",
  selected: new Set(),
  lightboxIndex: -1,
  phashGroups: new Map(),
  lightboxEditing: false,
  editTool: "pen",
  editDrawing: false,
  editStart: null,
  editSnapshot: null,
};

const $ = (id) => document.getElementById(id);

function thumbUrl(record, size = "320x240f") {
  const name = record.image;
  if (!name) return "";
  return `${API}/files/${COLLECTION}/${record.id}/${name}?thumb=${size}`;
}

function fileUrl(record) {
  const name = record.image;
  return `${API}/files/${COLLECTION}/${record.id}/${name}`;
}

function formatBytes(n) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function albumIdOf(item) {
  if (!item?.album) return "";
  return typeof item.album === "string" ? item.album : item.album.id || "";
}

function parseTags(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildFilter() {
  const parts = [];
  if (state.view === "starred") parts.push("starred = true");
  if (state.tag) {
    parts.push(`tags ~ "${state.tag.replace(/"/g, '\\"')}"`);
  }
  if (state.clientId) {
    parts.push(`client_id = "${state.clientId.replace(/"/g, '\\"')}"`);
  }
  if (state.albumId) {
    parts.push(`album = "${state.albumId}"`);
  }
  if (state.search.trim()) {
    const q = state.search.trim().replace(/"/g, '\\"');
    parts.push(
      `(title ~ "${q}" || ocr_text ~ "${q}" || client_name ~ "${q}" || hostname ~ "${q}" || notes ~ "${q}")`,
    );
  }
  return parts.length ? parts.join(" && ") : "";
}

async function listRecords(page = 1) {
  const filter = buildFilter();
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(PER_PAGE),
    sort: state.sort,
  });
  if (filter) params.set("filter", filter);

  const res = await fetch(
    `${API}/collections/${COLLECTION}/records?${params}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function listAlbums() {
  const res = await fetch(`${API}/collections/albums/records?perPage=100&sort=name`);
  if (!res.ok) return { items: [] };
  return res.json();
}

async function patchRecord(id, data) {
  const body = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    body.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(`${API}/collections/${COLLECTION}/records/${id}`, {
    method: "PATCH",
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchRecordImage(id, blob, extra = {}) {
  const body = new FormData();
  body.append("image", blob, "edited.png");
  body.append("analyzed", "false");
  for (const [k, v] of Object.entries(extra)) {
    body.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(`${API}/collections/${COLLECTION}/records/${id}`, {
    method: "PATCH",
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderAlbumSelectOptions(selectedId = "") {
  let html = `<option value="">— Geen album —</option>`;
  for (const a of state.albums) {
    const sel = a.id === selectedId ? " selected" : "";
    html += `<option value="${a.id}"${sel}>${escapeHtml(a.name)}</option>`;
  }
  return html;
}

function populateBulkAlbumSelect() {
  const sel = $("bulkAlbumSelect");
  if (!sel) return;
  sel.innerHTML = renderAlbumSelectOptions("");
}

async function deleteRecord(id) {
  const res = await fetch(`${API}/collections/${COLLECTION}/records/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

async function createRecord(formData) {
  const res = await fetch(`${API}/collections/${COLLECTION}/records`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createAlbum(name) {
  const res = await fetch(`${API}/collections/albums/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function computePhashGroups(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.phash) continue;
    if (!map.has(item.phash)) map.set(item.phash, []);
    map.get(item.phash).push(item.id);
  }
  state.phashGroups = map;
}

function isDuplicate(id) {
  const item = state.items.find((x) => x.id === id);
  if (!item?.phash) return false;
  const g = state.phashGroups.get(item.phash);
  return g && g.length > 1;
}

function filteredForDuplicates(items) {
  if (state.view !== "duplicates") return items;
  return items.filter((i) => isDuplicate(i.id));
}

function aggregateTags(items) {
  const counts = new Map();
  for (const item of items) {
    for (const t of parseTags(item.tags)) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function aggregateClients(items) {
  const map = new Map();
  for (const item of items) {
    const id = item.client_id || "onbekend";
    const label = item.client_name || item.hostname || id;
    if (!map.has(id)) map.set(id, { id, label, count: 0 });
    map.get(id).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function renderTimeline(items) {
  const el = $("timeline");
  const byDay = new Map();
  for (const item of items) {
    const d = (item.captured_at || item.created).slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  const max = Math.max(1, ...days.map(([, c]) => c));
  el.innerHTML = "";
  if (!days.length) {
    el.innerHTML = '<span class="hint">Geen activiteit</span>';
    return;
  }
  for (const [day, count] of days) {
    const bar = document.createElement("div");
    bar.className = "timeline-bar";
    bar.style.height = `${(count / max) * 100}%`;
    bar.title = `${day}: ${count}`;
    bar.addEventListener("click", () => {
      state.search = day;
      $("searchInput").value = day;
      reload();
    });
    el.appendChild(bar);
  }
}

function renderSidebarLists() {
  const tags = aggregateTags(state.items);
  const tagList = $("tagList");
  tagList.innerHTML = "";
  $("tagsEmpty").hidden = tags.length > 0;
  for (const [tag, count] of tags.slice(0, 40)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${state.tag === tag ? " filter-btn-active" : ""}`;
    btn.textContent = `#${tag} (${count})`;
    btn.addEventListener("click", () => {
      state.tag = state.tag === tag ? null : tag;
      reload();
    });
    li.appendChild(btn);
    tagList.appendChild(li);
  }

  const clientList = $("clientList");
  clientList.innerHTML = "";
  for (const c of aggregateClients(state.items)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${state.clientId === c.id ? " filter-btn-active" : ""}`;
    btn.textContent = `${c.label} (${c.count})`;
    btn.addEventListener("click", () => {
      state.clientId = state.clientId === c.id ? null : c.id;
      reload();
    });
    li.appendChild(btn);
    clientList.appendChild(li);
  }

  const albumList = $("albumList");
  albumList.innerHTML = "";
  const allBtn = document.createElement("li");
  const all = document.createElement("button");
  all.type = "button";
  all.className = `filter-btn${!state.albumId ? " filter-btn-active" : ""}`;
  all.textContent = "Alle albums";
  all.addEventListener("click", () => {
    state.albumId = null;
    reload();
  });
  allBtn.appendChild(all);
  albumList.appendChild(allBtn);
  for (const alb of state.albums) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${state.albumId === alb.id ? " filter-btn-active" : ""}`;
    btn.textContent = alb.name;
    btn.addEventListener("click", () => {
      state.albumId = state.albumId === alb.id ? null : alb.id;
      reload();
    });
    li.appendChild(btn);
    albumList.appendChild(li);
  }
}

function renderStats() {
  const total = state.items.length;
  const bytes = state.items.reduce((s, i) => s + (i.file_size || 0), 0);
  $("statCount").textContent = `${total} shots (pagina)`;
  $("statStorage").textContent = formatBytes(bytes);
  const pct = Math.min(100, (total / 500) * 100);
  $("statBar").style.width = `${pct}%`;
}

function renderGallery() {
  const gallery = $("gallery");
  const display = filteredForDuplicates(state.items);
  gallery.innerHTML = "";
  $("galleryEmpty").hidden = display.length > 0;

  for (const item of display) {
    const card = document.createElement("article");
    card.className = `shot-card${state.selected.has(item.id) ? " selected" : ""}`;
    card.dataset.id = item.id;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "shot-check";
    check.checked = state.selected.has(item.id);
    check.addEventListener("click", (e) => e.stopPropagation());
    check.addEventListener("change", () => {
      if (check.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      updateBulkUi();
      card.classList.toggle("selected", check.checked);
    });

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = item.title || "Screenshot";
    img.src = thumbUrl(item);

    const overlay = document.createElement("div");
    overlay.className = "shot-overlay";
    overlay.innerHTML = `<span>${formatDate(item.captured_at || item.created)}</span>`;
    if (item.starred) overlay.innerHTML += '<span class="shot-star">★</span>';

    card.appendChild(check);
    card.appendChild(img);
    card.appendChild(overlay);

    if (isDuplicate(item.id)) {
      const dup = document.createElement("span");
      dup.className = "shot-dup";
      dup.textContent = "dup";
      card.appendChild(dup);
    }

    card.addEventListener("click", (e) => {
      if (e.target === check) return;
      openLightbox(item.id);
    });

    gallery.appendChild(card);
  }

  $("loadMoreBtn").hidden = state.page >= state.totalPages;
}

function updateBulkUi() {
  const n = state.selected.size;
  $("selectedBadge").hidden = n === 0;
  $("selectedBadge").textContent = `${n} geselecteerd`;
  const dis = n === 0;
  $("bulkStarBtn").disabled = dis;
  $("bulkTagBtn").disabled = dis;
  $("bulkDeleteBtn").disabled = dis;
  $("bulkAlbumBtn").disabled = dis;
  $("bulkAlbumSelect").disabled = dis;
}

function stopLightboxEdit() {
  state.lightboxEditing = false;
  state.editDrawing = false;
  $("lightboxEditTools").hidden = true;
  $("lightboxCanvas").hidden = true;
  $("lightboxImg").hidden = false;
}

async function startLightboxEdit(item) {
  const img = $("lightboxImg");
  const canvas = $("lightboxCanvas");
  await new Promise((resolve, reject) => {
    if (img.complete) resolve();
    else {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Afbeelding laden mislukt"));
    }
  });

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

  state.lightboxEditing = true;
  img.hidden = true;
  canvas.hidden = false;
  $("lightboxEditTools").hidden = false;
}

function canvasPoint(canvas, evt) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  return {
    x: (evt.clientX - r.left) * scaleX,
    y: (evt.clientY - r.top) * scaleY,
  };
}

function bindLightboxCanvas(item) {
  const canvas = $("lightboxCanvas");
  const ctx = canvas.getContext("2d");

  const drawShape = (from, to) => {
    if (!state.editSnapshot) return;
    ctx.putImageData(state.editSnapshot, 0, 0);
    ctx.lineWidth = state.editTool === "highlight" ? 14 : 3;
    ctx.lineCap = "round";
    if (state.editTool === "highlight") {
      ctx.strokeStyle = "rgba(255, 235, 59, 0.55)";
    } else {
      ctx.strokeStyle = "#6b9fff";
    }
    if (state.editTool === "rect") {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
      return;
    }
    if (state.editTool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = 14;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  canvas.onmousedown = (e) => {
    if (!state.lightboxEditing) return;
    state.editDrawing = true;
    state.editStart = canvasPoint(canvas, e);
    if (state.editTool === "pen" || state.editTool === "highlight") {
      state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  };

  canvas.onmousemove = (e) => {
    if (!state.lightboxEditing || !state.editDrawing || !state.editStart) return;
    const pt = canvasPoint(canvas, e);
    if (state.editTool === "pen" || state.editTool === "highlight") {
      drawShape(state.editStart, pt);
      state.editStart = pt;
      state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      drawShape(state.editStart, pt);
    }
  };

  canvas.onmouseup = (e) => {
    if (!state.lightboxEditing || !state.editDrawing) return;
    const pt = canvasPoint(canvas, e);
    if (state.editTool !== "pen" && state.editTool !== "highlight") {
      drawShape(state.editStart, pt);
      state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    state.editDrawing = false;
  };

  $("lbSaveEdit").onclick = async () => {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    try {
      await patchRecordImage(item.id, blob);
      stopLightboxEdit();
      showToast("Bewerking opgeslagen");
      await reload();
      state.lightboxIndex = state.items.findIndex((x) => x.id === item.id);
      refreshLightbox();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  $("lbCancelEdit").onclick = () => stopLightboxEdit();

  document.querySelectorAll("[data-edtool]").forEach((btn) => {
    btn.onclick = () => {
      state.editTool = btn.dataset.edtool;
      document.querySelectorAll("[data-edtool]").forEach((b) => b.classList.remove("chip-active"));
      btn.classList.add("chip-active");
    };
  });
}

function openLightbox(id) {
  const idx = state.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  state.lightboxIndex = idx;
  stopLightboxEdit();
  refreshLightbox();
  $("lightbox").showModal();
}

function refreshLightbox() {
  const item = state.items[state.lightboxIndex];
  if (!item) return;
  $("lightboxImg").src = `${fileUrl(item)}?t=${Date.now()}`;
  $("lightboxImg").hidden = false;
  $("lightboxCaption").textContent = item.title || "Screenshot";

  const colors = Array.isArray(item.colors) ? item.colors : [];
  const colorHtml = colors
    .map(
      (c) =>
        `<span class="color-swatch" style="background:rgb(${c.r},${c.g},${c.b})"></span>`,
    )
    .join("");

  const tagValue = parseTags(item.tags).join(", ");
  const albumSel = albumIdOf(item);

  $("lightboxMeta").innerHTML = `
    <dl>
      <dt>Datum</dt><dd>${formatDate(item.captured_at || item.created)}</dd>
      <dt>Afmeting</dt><dd>${item.width || "?"} × ${item.height || "?"} · ${formatBytes(item.file_size)}</dd>
      <dt>Client</dt><dd>${escapeHtml(item.client_name || item.hostname || item.client_id || "—")}</dd>
      <dt>Modus</dt><dd>${escapeHtml(item.capture_mode || "—")}</dd>
      <dt>Tags</dt>
      <dd>
        <input class="input" id="tagsEditor" value="${escapeHtml(tagValue)}" placeholder="werk, bug, ui" />
        <div class="lightbox-meta-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="lbSaveTags">Tags opslaan</button>
        </div>
      </dd>
      <dt>Album</dt>
      <dd>
        <select class="select" id="albumEditor">${renderAlbumSelectOptions(albumSel)}</select>
        <div class="lightbox-meta-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="lbSaveAlbum">Album opslaan</button>
        </div>
      </dd>
      <dt>Kleuren</dt><dd>${colorHtml || "—"}</dd>
      <dt>pHash</dt><dd>${escapeHtml(item.phash || "—")}</dd>
      <dt>OCR</dt><dd>${escapeHtml(item.ocr_text ? item.ocr_text.slice(0, 500) : "—")}</dd>
      <dt>Notities</dt>
      <dd><textarea id="notesEditor">${escapeHtml(item.notes || "")}</textarea></dd>
    </dl>
    <div class="lightbox-meta-actions" style="margin-top:1rem">
      <button type="button" class="btn btn-ghost btn-sm" id="lbEdit">Bewerken</button>
      <button type="button" class="btn btn-ghost btn-sm" id="lbStar">${item.starred ? "Unstar" : "⭐ Star"}</button>
      <a class="btn btn-ghost btn-sm" href="${fileUrl(item)}" download>Download</a>
      <button type="button" class="btn btn-danger btn-sm" id="lbDelete">Verwijder</button>
    </div>
  `;

  bindLightboxCanvas(item);

  $("notesEditor")?.addEventListener("blur", async (e) => {
    try {
      await patchRecord(item.id, { notes: e.target.value });
      item.notes = e.target.value;
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("lbSaveTags")?.addEventListener("click", async () => {
    const tags = $("tagsEditor").value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await patchRecord(item.id, { tags });
      item.tags = tags;
      showToast("Tags opgeslagen");
      renderSidebarLists();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("lbSaveAlbum")?.addEventListener("click", async () => {
    const album = $("albumEditor").value;
    try {
      await patchRecord(item.id, { album: album || "" });
      item.album = album || null;
      showToast("Album bijgewerkt");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("lbEdit")?.addEventListener("click", async () => {
    try {
      await startLightboxEdit(item);
      document.querySelector('[data-edtool="pen"]')?.classList.add("chip-active");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("lbStar")?.addEventListener("click", async () => {
    try {
      const next = !item.starred;
      await patchRecord(item.id, { starred: next });
      item.starred = next;
      refreshLightbox();
      renderGallery();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("lbDelete")?.addEventListener("click", async () => {
    if (!confirm("Screenshot verwijderen?")) return;
    try {
      await deleteRecord(item.id);
      state.items.splice(state.lightboxIndex, 1);
      $("lightbox").close();
      await reload();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function showToast(msg, isError = false) {
  const t = $("uploadToast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.hidden = false;
  setTimeout(() => {
    t.hidden = true;
  }, 4000);
}

async function uploadFiles(files, mode = "upload") {
  for (const file of files) {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("title", file.name || `Upload ${new Date().toLocaleString("nl-NL")}`);
    fd.append("captured_at", new Date().toISOString());
    fd.append("capture_mode", mode);
    fd.append("tags", JSON.stringify([]));
    fd.append("starred", "false");
    fd.append("analyzed", "false");
    await createRecord(fd);
  }
  showToast(`${files.length} screenshot(s) geüpload`);
  await reload();
}

async function reload(append = false) {
  try {
    const data = await listRecords(append ? state.page + 1 : 1);
    if (append) {
      state.page++;
      state.items.push(...data.items);
    } else {
      state.page = data.page;
      state.items = data.items;
      state.selected.clear();
      updateBulkUi();
    }
    state.totalPages = data.totalPages;
    computePhashGroups(state.items);
    renderStats();
    renderTimeline(state.items);
    renderSidebarLists();
    renderGallery();
  } catch (err) {
    showToast(`Laden mislukt: ${err.message}`, true);
  }
}

async function init() {
  try {
    const alb = await listAlbums();
    state.albums = alb.items || [];
    populateBulkAlbumSelect();
  } catch {
    state.albums = [];
  }

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("chip-active"));
      btn.classList.add("chip-active");
      state.view = btn.dataset.view;
      reload();
    });
  });

  $("searchInput").addEventListener(
    "input",
    debounce(() => {
      state.search = $("searchInput").value;
      reload();
    }, 350),
  );

  $("sortSelect").addEventListener("change", () => {
    state.sort = $("sortSelect").value;
    reload();
  });

  $("refreshBtn").addEventListener("click", () => reload());

  $("loadMoreBtn").addEventListener("click", () => reload(true));

  $("selectAll").addEventListener("change", () => {
    if ($("selectAll").checked) {
      for (const i of filteredForDuplicates(state.items)) state.selected.add(i.id);
    } else state.selected.clear();
    updateBulkUi();
    renderGallery();
  });

  $("bulkDeleteBtn").addEventListener("click", async () => {
    if (!state.selected.size || !confirm(`${state.selected.size} verwijderen?`)) return;
    for (const id of [...state.selected]) {
      await deleteRecord(id);
    }
    showToast("Verwijderd");
    await reload();
  });

  $("bulkStarBtn").addEventListener("click", async () => {
    for (const id of state.selected) {
      const item = state.items.find((x) => x.id === id);
      if (item) await patchRecord(id, { starred: true });
    }
    showToast("Favoriet gezet");
    await reload();
  });

  $("bulkTagBtn").addEventListener("click", async () => {
    const tag = prompt("Tag toevoegen aan selectie:");
    if (!tag?.trim()) return;
    for (const id of state.selected) {
      const item = state.items.find((x) => x.id === id);
      if (!item) continue;
      const tags = parseTags(item.tags);
      if (!tags.includes(tag.trim())) tags.push(tag.trim());
      await patchRecord(id, { tags });
    }
    showToast("Tags bijgewerkt");
    await reload();
  });

  $("bulkAlbumBtn").addEventListener("click", async () => {
    const album = $("bulkAlbumSelect").value;
    for (const id of state.selected) {
      await patchRecord(id, { album: album || "" });
    }
    showToast(album ? "Naar album verplaatst" : "Uit album gehaald");
    await reload();
  });

  const dropzone = $("dropzone");
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) await uploadFiles(files);
  });

  $("fileInput").addEventListener("change", async () => {
    const files = [...$("fileInput").files];
    if (files.length) await uploadFiles(files);
    $("fileInput").value = "";
  });

  document.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      await uploadFiles(files, "paste");
    }
  });

  $("lightboxClose").addEventListener("click", () => $("lightbox").close());
  $("lightboxPrev").addEventListener("click", () => {
    if (state.lightboxIndex > 0) {
      state.lightboxIndex--;
      refreshLightbox();
    }
  });
  $("lightboxNext").addEventListener("click", () => {
    if (state.lightboxIndex < state.items.length - 1) {
      state.lightboxIndex++;
      refreshLightbox();
    }
  });

  $("newAlbumBtn").addEventListener("click", () => $("albumModal").showModal());
  $("albumCancelBtn").addEventListener("click", () => $("albumModal").close());
  $("albumForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("albumNameInput").value.trim();
    if (!name) return;
    try {
      await createAlbum(name);
      $("albumModal").close();
      $("albumNameInput").value = "";
      const alb = await listAlbums();
      state.albums = alb.items || [];
      populateBulkAlbumSelect();
      renderSidebarLists();
      showToast("Album aangemaakt");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!$("lightbox").open) return;
    if (e.key === "ArrowLeft") $("lightboxPrev").click();
    if (e.key === "ArrowRight") $("lightboxNext").click();
    if (e.key === "Escape") $("lightbox").close();
  });

  await reload();
  setInterval(() => reload(), 30000);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

init();
