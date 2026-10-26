const API = "/api";
const COLLECTION = "screenshots";
const SETTINGS_COLLECTION = "snapzilla_settings";
const PER_PAGE = 48;

const state = {
  items: [],
  page: 1,
  totalPages: 1,
  albums: [],
  view: "all",
  tag: null,
  albumId: null,
  search: "",
  dayFilter: null,
  monthFilter: null,
  calendarMonth: "",
  activityByDay: [],
  sort: "-captured_at",
  selected: new Set(),
  lightboxIndex: -1,
  phashGroups: new Map(),
  lightboxEditing: false,
  editTool: "pen",
  editStamp: "check",
  editColor: "#6b9fff",
  editDrawing: false,
  editStart: null,
  editSnapshot: null,
  editUndoStack: [],
  editChainAnchor: null,
};

const MAX_EDIT_UNDO = 8;

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

/** @returns {boolean} */
function isRecordAnalyzed(item) {
  return item.analyzed === true || item.analyzed === "true";
}

/** @returns {{ status: string, label: string, detail: string }} */
function describeOcr(item) {
  const st = String(item.ocr_status || "").toLowerCase();
  if (!isRecordAnalyzed(item)) {
    return {
      status: "pending",
      label: "Bezig…",
      detail:
        "Screenshot wordt geanalyseerd. Draait snapzilla-analyzer niet? docker compose ps / logs analyzer.",
    };
  }
  if (st === "pending") {
    return {
      status: "pending",
      label: "OCR…",
      detail: "Tekst wordt via OpenRouter uit de afbeelding gehaald.",
    };
  }
  if (st === "no_key") {
    return {
      status: "no_key",
      label: "Geen API-key",
      detail:
        "Open **Model …** in de header en sla je OpenRouter API-key op (of zet OPENROUTER_API_KEY in .env).",
    };
  }
  if (st === "skipped") {
    return {
      status: "skipped",
      label: "Overgeslagen",
      detail: "OCR stond uit toen deze screenshot verwerkt werd.",
    };
  }
  if (st === "failed") {
    return {
      status: "failed",
      label: "Mislukt",
      detail:
        "OpenRouter-OCR mislukt. Controleer OPENROUTER_API_KEY, saldo en docker compose logs analyzer.",
    };
  }
  if (item.ocr_text) {
    return { status: "done", label: "Gelukt", detail: item.ocr_text };
  }
  if (st === "empty") {
    return {
      status: "empty",
      label: "Geen tekst",
      detail: "Geen leesbare tekst in deze afbeelding gevonden.",
    };
  }
  return {
    status: "unknown",
    label: "—",
    detail: "Geen OCR-tekst (oudere screenshot of nog niet opnieuw verwerkt).",
  };
}

function itemWantsAnalysisPoll(item) {
  if (!isRecordAnalyzed(item)) return true;
  const st = String(item.ocr_status || "").toLowerCase();
  if (st === "pending") return true;
  if (item.ocr_text) return false;
  if (st === "done" || st === "empty") return false;
  if (snapzillaSettings && snapzillaSettings.ocr_enabled === false) return false;
  return st === "skipped" || st === "failed" || st === "no_key" || st === "";
}

let analysisPollTimer = null;

function scheduleAnalysisPoll() {
  if (analysisPollTimer) return;
  if (!state.items.some(itemWantsAnalysisPoll)) return;
  analysisPollTimer = setInterval(() => {
    if (!state.items.some(itemWantsAnalysisPoll)) {
      clearInterval(analysisPollTimer);
      analysisPollTimer = null;
      return;
    }
    void reload(false, { preserveSelection: true, fromAnalysisPoll: true });
  }, 4000);
  setTimeout(() => {
    if (analysisPollTimer) {
      clearInterval(analysisPollTimer);
      analysisPollTimer = null;
    }
  }, 120_000);
}

function renderOcrBadgeHtml(item) {
  const ocr = describeOcr(item);
  if (ocr.status === "unknown") return "";
  return `<span class="shot-ocr-badge shot-ocr-${ocr.status}" title="${escapeHtml(ocr.detail.slice(0, 200))}">${escapeHtml(ocr.label)}</span>`;
}

function renderLightboxOcrHtml(item) {
  const ocr = describeOcr(item);
  const preview =
    ocr.status === "done"
      ? escapeHtml(ocr.detail.slice(0, 2000))
      : escapeHtml(ocr.detail);
  const more =
    ocr.status === "done" && ocr.detail.length > 2000
      ? `<p class="ocr-trunc-hint">… ${ocr.detail.length - 2000} tekens extra — gebruik zoeken om alles te vinden.</p>`
      : "";
  return `<span class="ocr-status-pill ocr-pill-${ocr.status}">${escapeHtml(ocr.label)}</span><div class="ocr-detail">${preview}</div>${more}`;
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

function shotTitleText(item) {
  return (item?.title || "").trim();
}

function isAutoCaptureTitle(title) {
  return /^Capture\s+\d/i.test((title || "").trim());
}

function galleryTitleLabel(item) {
  const t = shotTitleText(item);
  if (!t || isAutoCaptureTitle(t)) return "";
  return t;
}

async function saveShotTitle(item, rawTitle) {
  const title = rawTitle.trim();
  await patchRecord(item.id, { title });
  item.title = title;
}

function beginInlineTitleEdit(item, anchorEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "shot-title-input input";
  input.maxLength = 500;
  input.value = galleryTitleLabel(item) || shotTitleText(item);
  input.placeholder = "Titel…";
  anchorEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (revert) => {
    if (done) return;
    done = true;
    if (revert) {
      renderGallery();
      return;
    }
    try {
      await saveShotTitle(item, input.value);
      renderGallery();
    } catch (err) {
      showToast(err.message, true);
      renderGallery();
    }
  };

  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(false);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(true);
    }
  });
  input.addEventListener("blur", () => finish(false));
}

function appendGalleryTitleControl(top, item) {
  const label = galleryTitleLabel(item);
  const el = document.createElement("button");
  el.type = "button";
  el.className = label ? "shot-title" : "shot-title shot-title-add";
  el.textContent = label || "+ Titel";
  el.title = label ? "Titel bewerken" : "Titel toevoegen";
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    beginInlineTitleEdit(item, el);
  });
  top.appendChild(el);
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

function buildFilter(opts = {}) {
  const parts = [];
  if (state.view === "starred") parts.push("starred = true");
  if (state.tag) {
    parts.push(`tags ~ "${state.tag.replace(/"/g, '\\"')}"`);
  }
  if (state.albumId) {
    parts.push(`album = "${state.albumId}"`);
  }
  if (!opts.skipDateFilter) {
    if (state.dayFilter) {
      const d = state.dayFilter;
      const start = `${d} 00:00:00.000Z`;
      const end = `${d} 23:59:59.999Z`;
      parts.push(`captured_at >= '${start}' && captured_at <= '${end}'`);
    } else if (state.monthFilter) {
      const range = monthRangeUtc(state.monthFilter);
      if (range) {
        parts.push(`captured_at >= '${range.start}' && captured_at <= '${range.end}'`);
      }
    }
  }
  if (state.search.trim()) {
    const q = state.search.trim().replace(/"/g, '\\"');
    parts.push(
      `(title ~ "${q}" || ocr_text ~ "${q}" || client_name ~ "${q}" || hostname ~ "${q}" || notes ~ "${q}")`,
    );
  }
  return parts.length ? parts.join(" && ") : "";
}

function dayKeyOf(item) {
  return (item.captured_at || item.created || "").slice(0, 10);
}

function formatDayShort(isoDay) {
  if (!isoDay) return "—";
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function formatDayLong(isoDay) {
  if (!isoDay) return "—";
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatMonthLong(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRangeUtc(ym) {
  const [yS, mS] = ym.split("-");
  const y = Number(yS);
  const m = Number(mS);
  if (!y || !m) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01 00:00:00.000Z`,
    end: `${y}-${mm}-${String(last).padStart(2, "0")} 23:59:59.999Z`,
  };
}

function shiftCalendarMonth(ym, delta) {
  const [yS, mS] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(yS, mS - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function activityCountMap() {
  const map = new Map();
  for (const [day, count] of state.activityByDay) map.set(day, count);
  return map;
}

async function loadActivityByDay() {
  try {
    const filter = buildFilter({ skipDateFilter: true });
    const byDay = new Map();
    for (let page = 1; page <= 4; page++) {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "200",
        sort: "-captured_at",
        fields: "captured_at,created",
      });
      if (filter) params.set("filter", filter);

      const res = await fetch(`${API}/collections/${COLLECTION}/records?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      for (const item of data.items) {
        const d = dayKeyOf(item);
        if (!d) continue;
        byDay.set(d, (byDay.get(d) || 0) + 1);
      }
      if (data.items.length < 200) break;
    }
    state.activityByDay = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    state.activityByDay = [];
  }
}

function updateDateFilterUi() {
  const btn = $("clearDateFilter");
  const monthBtn = $("calMonthBtn");
  if (monthBtn) {
    monthBtn.textContent = formatMonthLong(state.calendarMonth);
    monthBtn.classList.toggle("calendar-month-active", state.monthFilter === state.calendarMonth);
    monthBtn.setAttribute("aria-pressed", state.monthFilter === state.calendarMonth ? "true" : "false");
  }
  if (!btn) return;
  if (state.dayFilter) {
    btn.hidden = false;
    btn.textContent = `${formatDayLong(state.dayFilter)} — wissen ×`;
  } else if (state.monthFilter) {
    btn.hidden = false;
    btn.textContent = `${formatMonthLong(state.monthFilter)} — wissen ×`;
  } else {
    btn.hidden = true;
  }
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

const DEFAULT_OCR_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_OCR_MODELS = [
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "google/gemini-2.5-flash-preview", name: "Gemini 2.5 Flash (preview)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
  { id: "qwen/qwen-2.5-vl-72b-instruct", name: "Qwen 2.5 VL 72B" },
];

/** @type {{ id: string, ocr_enabled?: boolean, ocr_model?: string, ocr_models?: unknown } | null} */
let snapzillaSettings = null;
let snapzillaSettingsMissing = false;
/** @type {{ id: string, name: string }[] | null} */
let openRouterCatalogCache = null;
/** @type {{ text: string, type: string }} */
let ocrModalFeedback = { text: "", type: "info" };

const OCR_TEST_TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function setOcrFeedback(text, type = "info") {
  ocrModalFeedback = { text: text || "", type };
  const el = $("ocrFeedback");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.className = text ? `ocr-feedback ocr-feedback-${type}` : "ocr-feedback";
}

function applyOcrFeedbackToDom() {
  setOcrFeedback(ocrModalFeedback.text, ocrModalFeedback.type);
}

function parseOpenRouterErrorBody(raw, status) {
  try {
    const j = JSON.parse(raw);
    const msg = j.error?.message || j.error || j.message;
    if (msg) return String(msg);
  } catch {
    /* ignore */
  }
  return raw?.slice(0, 200) || `HTTP ${status}`;
}

function formatOpenRouterKeyCheck(json) {
  const data = json.data || json;
  const parts = [];
  if (data.label) parts.push(String(data.label));
  if (data.limit != null) parts.push(`limiet ${data.limit}`);
  if (data.usage != null) parts.push(`gebruik ${data.usage}`);
  if (data.is_free_tier != null) {
    parts.push(data.is_free_tier ? "gratis tier" : "betaald");
  }
  return parts.length ? parts.join(" · ") : "Key geaccepteerd door OpenRouter";
}

async function testOpenRouterKey(apiKey) {
  const res = await fetch("/openrouter/auth/key", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Snapzilla",
    },
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(parseOpenRouterErrorBody(raw, res.status));
  }
  return raw ? JSON.parse(raw) : {};
}

async function resolveOpenRouterKeyForTest() {
  const input = $("ocrApiKeyInput")?.value?.trim();
  if (input) return input;
  if (!snapzillaSettings?.id) throw new Error("Instellingen niet geladen");
  if (!openRouterKeyConfigured()) {
    throw new Error("Plak eerst een API-key in het veld");
  }
  const res = await fetch(
    `${API}/collections/${SETTINGS_COLLECTION}/records/${snapzillaSettings.id}`,
  );
  if (!res.ok) throw new Error(await res.text());
  const raw = await res.json();
  const key = String(raw.openrouter_api_key || "").trim();
  if (!key) throw new Error("Geen opgeslagen key — plak een key en sla op");
  return key;
}

async function testOpenRouterVisionModel(apiKey, modelId) {
  const res = await fetch("/openrouter/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Snapzilla",
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0,
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Lees de afbeelding. Antwoord alleen met het woord OK (geen andere tekst).',
            },
            { type: "image_url", image_url: { url: OCR_TEST_TINY_PNG } },
          ],
        },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(parseOpenRouterErrorBody(raw, res.status));
  }
  const json = raw ? JSON.parse(raw) : {};
  const reply = json.choices?.[0]?.message?.content?.trim() || "";
  return reply || "(leeg antwoord — model reageerde wel)";
}

async function runOpenRouterKeyTest() {
  setOcrFeedback("API-key testen bij OpenRouter…", "info");
  const apiKey = await resolveOpenRouterKeyForTest();
  const json = await testOpenRouterKey(apiKey);
  setOcrFeedback(`Key OK — ${formatOpenRouterKeyCheck(json)}`, "success");
  showToast("OpenRouter API-key is geldig");
}

async function runOcrPipelineTest() {
  setOcrFeedback("Key en vision-model testen…", "info");
  const apiKey = await resolveOpenRouterKeyForTest();
  const keyJson = await testOpenRouterKey(apiKey);
  const model = activeOcrModelId();
  const reply = await testOpenRouterVisionModel(apiKey, model);
  setOcrFeedback(
    `OCR-test gelukt — ${formatOpenRouterKeyCheck(keyJson)} · model ${shortModelLabel(model)} antwoordde: “${reply.slice(0, 80)}”`,
    "success",
  );
  showToast("OCR-test geslaagd — analyzer zou moeten werken");
}

function normalizeOcrModels(raw) {
  if (!Array.isArray(raw)) return DEFAULT_OCR_MODELS.map((m) => ({ ...m }));
  const out = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ id: item.trim(), name: item.trim() });
    } else if (item && typeof item.id === "string" && item.id.trim()) {
      out.push({
        id: item.id.trim(),
        name: String(item.name || item.id).trim().slice(0, 120),
      });
    }
  }
  return out.length ? out : DEFAULT_OCR_MODELS.map((m) => ({ ...m }));
}

function installedOcrModels() {
  return normalizeOcrModels(snapzillaSettings?.ocr_models);
}

function activeOcrModelId() {
  const id = snapzillaSettings?.ocr_model?.trim();
  if (id) return id;
  const list = installedOcrModels();
  return list[0]?.id || DEFAULT_OCR_MODEL;
}

function shortModelLabel(modelId) {
  const hit = installedOcrModels().find((m) => m.id === modelId);
  return hit?.name || modelId.split("/").pop() || modelId;
}

/** Strip full API key from client memory after load/save. */
function sanitizeSettingsRecord(record) {
  if (!record) return null;
  const copy = { ...record };
  const hadKey = Boolean(String(copy.openrouter_api_key || "").trim());
  if ("openrouter_api_key" in copy) delete copy.openrouter_api_key;
  copy._openrouterKeyConfigured =
    hadKey || Boolean(String(copy.openrouter_api_key_tail || "").trim());
  return copy;
}

function openRouterKeyConfigured() {
  return Boolean(
    snapzillaSettings?._openrouterKeyConfigured ||
      snapzillaSettings?.openrouter_api_key_tail,
  );
}

function formatOpenRouterKeyStatus() {
  const tail = snapzillaSettings?.openrouter_api_key_tail;
  if (openRouterKeyConfigured() && tail) {
    return `Key ingesteld (…${tail}) — analyzer gebruikt deze key.`;
  }
  if (openRouterKeyConfigured()) {
    return "Key ingesteld — analyzer gebruikt deze key.";
  }
  return "Nog geen key in Snapzilla — optioneel ook via .env (OPENROUTER_API_KEY).";
}

async function loadSnapzillaSettings() {
  snapzillaSettingsMissing = false;
  try {
    const res = await fetch(
      `${API}/collections/${SETTINGS_COLLECTION}/records?perPage=1`,
    );
    if (res.status === 404) {
      snapzillaSettingsMissing = true;
      return null;
    }
    if (!res.ok) return null;
    const json = await res.json();
    if (json.items?.length) {
      snapzillaSettings = sanitizeSettingsRecord(json.items[0]);
      return snapzillaSettings;
    }
    const createRes = await fetch(
      `${API}/collections/${SETTINGS_COLLECTION}/records`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocr_enabled: true,
          ocr_model: DEFAULT_OCR_MODEL,
          ocr_models: DEFAULT_OCR_MODELS,
        }),
      },
    );
    if (!createRes.ok) return null;
    snapzillaSettings = sanitizeSettingsRecord(await createRes.json());
    return snapzillaSettings;
  } catch {
    return null;
  }
}

async function patchSnapzillaSettings(payload) {
  if (!snapzillaSettings) {
    const loaded = await loadSnapzillaSettings();
    if (!loaded) throw new Error("Instellingen niet beschikbaar");
  }
  const res = await fetch(
    `${API}/collections/${SETTINGS_COLLECTION}/records/${snapzillaSettings.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  const updated = sanitizeSettingsRecord(await res.json());
  snapzillaSettings = updated;
  updateOcrToggleButton();
  renderOcrModelDialog();
  return updated;
}

async function saveOpenRouterApiKey(key) {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Voer een OpenRouter API-key in");
  setOcrFeedback("Key testen vóór opslaan…", "info");
  try {
    const check = await testOpenRouterKey(trimmed);
    setOcrFeedback(`Key gevalideerd — ${formatOpenRouterKeyCheck(check)}`, "info");
  } catch (err) {
    setOcrFeedback(`Key geweigerd door OpenRouter: ${err.message}`, "error");
    throw new Error(`Key test mislukt: ${err.message}`);
  }
  const tail = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
  await patchSnapzillaSettings({
    openrouter_api_key: trimmed,
    openrouter_api_key_tail: tail,
  });
  setOcrFeedback(
    `Key opgeslagen (…${tail}) en gevalideerd bij OpenRouter — klaar voor OCR.`,
    "success",
  );
  showToast("OpenRouter API-key opgeslagen");
}

async function clearOpenRouterApiKey() {
  if (!confirm("OpenRouter API-key uit Snapzilla wissen?")) return;
  await patchSnapzillaSettings({
    openrouter_api_key: "",
    openrouter_api_key_tail: "",
  });
  setOcrFeedback("API-key gewist uit Snapzilla.", "info");
  showToast("API-key gewist");
}

async function setActiveOcrModel(modelId) {
  const id = modelId.trim();
  if (!id) return;
  let models = installedOcrModels();
  if (!models.some((m) => m.id === id)) {
    models = [...models, { id, name: id }];
  }
  await patchSnapzillaSettings({ ocr_model: id, ocr_models: models });
  setOcrFeedback(`Actief model: ${shortModelLabel(id)} (${id})`, "success");
  showToast(`OCR-model: ${shortModelLabel(id)}`);
}

async function addInstalledOcrModel(id, name) {
  const modelId = id.trim();
  if (!modelId) throw new Error("Model-id is verplicht");
  const models = installedOcrModels();
  if (models.some((m) => m.id === modelId)) {
    await setActiveOcrModel(modelId);
    return;
  }
  models.push({
    id: modelId,
    name: (name || modelId).trim().slice(0, 120),
  });
  await patchSnapzillaSettings({
    ocr_models: models,
    ocr_model: modelId,
  });
  setOcrFeedback(`Model geïnstalleerd en actief: ${shortModelLabel(modelId)}`, "success");
  showToast(`Model geïnstalleerd: ${shortModelLabel(modelId)}`);
}

async function removeInstalledOcrModel(modelId) {
  const models = installedOcrModels().filter((m) => m.id !== modelId);
  if (!models.length) throw new Error("Minstens één model houden");
  let nextActive = activeOcrModelId();
  if (nextActive === modelId) nextActive = models[0].id;
  await patchSnapzillaSettings({ ocr_models: models, ocr_model: nextActive });
  showToast("Model verwijderd uit lijst");
}

function modelSupportsVision(entry) {
  const mods = entry?.architecture?.input_modalities;
  if (Array.isArray(mods)) {
    return mods.some((m) => String(m).toLowerCase().includes("image"));
  }
  const id = String(entry?.id || "").toLowerCase();
  return /gemini|gpt-4|claude|qwen|vl|vision|llava|pixtral|moondream/i.test(id);
}

async function fetchOpenRouterCatalog() {
  if (openRouterCatalogCache) return openRouterCatalogCache;
  const res = await fetch("/openrouter/models");
  if (!res.ok) throw new Error(`OpenRouter catalogus (${res.status})`);
  const json = await res.json();
  const items = (json.data || [])
    .filter(modelSupportsVision)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  openRouterCatalogCache = items;
  return items;
}

function renderOcrCatalogList(filter = "") {
  const listEl = $("ocrCatalogList");
  const hint = $("ocrCatalogHint");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!openRouterCatalogCache) {
    if (hint) hint.textContent = "Laad modellen en filter op afbeelding/vision.";
    return;
  }
  const q = filter.trim().toLowerCase();
  const items = openRouterCatalogCache.filter(
    (m) =>
      !q ||
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q),
  );
  if (hint) {
    hint.textContent = items.length
      ? `${items.length} vision-modellen (max 40 getoond)`
      : "Geen modellen voor deze zoekterm.";
  }
  for (const m of items.slice(0, 40)) {
    const li = document.createElement("li");
    li.className = "ocr-catalog-item";
    const installed = installedOcrModels().some((x) => x.id === m.id);
    const meta = document.createElement("div");
    meta.className = "ocr-catalog-meta";
    const strong = document.createElement("strong");
    strong.textContent = m.name;
    const code = document.createElement("code");
    code.className = "ocr-model-id";
    code.textContent = m.id;
    meta.append(strong, code);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost btn-sm";
    btn.textContent = installed ? "Activeren" : "Installeren";
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await addInstalledOcrModel(m.id, m.name);
        renderOcrCatalogList($("ocrCatalogSearch")?.value || "");
      } catch (err) {
        showToast(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
    li.append(meta, btn);
    listEl.appendChild(li);
  }
}

function renderOcrModelDialog() {
  const sel = $("ocrModelSelect");
  const list = $("ocrInstalledList");
  const modelBtn = $("ocrModelBtn");
  const keyStatus = $("ocrApiKeyStatus");
  const keyInput = $("ocrApiKeyInput");
  if (!snapzillaSettings || snapzillaSettingsMissing) {
    modelBtn?.setAttribute("hidden", "");
    return;
  }
  modelBtn?.removeAttribute("hidden");

  if (keyStatus) keyStatus.textContent = formatOpenRouterKeyStatus();
  if (keyInput && document.activeElement !== keyInput) {
    keyInput.value = "";
    keyInput.placeholder = openRouterKeyConfigured()
      ? "Nieuwe key plakken om te vervangen"
      : "Plak je OpenRouter key (sk-or-…)";
  }

  const models = installedOcrModels();
  const active = activeOcrModelId();
  modelBtn.textContent = shortModelLabel(active);

  if (sel) {
    sel.innerHTML = models
      .map(
        (m) =>
          `<option value="${escapeHtml(m.id)}"${m.id === active ? " selected" : ""}>${escapeHtml(m.name)}</option>`,
      )
      .join("");
  }

  if (list) {
    list.innerHTML = "";
    for (const m of models) {
      const li = document.createElement("li");
      li.className = "ocr-model-list-item";
      const isActive = m.id === active;
      li.innerHTML = `
        <div>
          <span class="ocr-model-list-name">${escapeHtml(m.name)}${isActive ? " · actief" : ""}</span>
          <code class="ocr-model-id">${escapeHtml(m.id)}</code>
        </div>
        <button type="button" class="btn btn-ghost btn-sm ocr-model-remove" title="Verwijderen">×</button>
      `;
      li.querySelector(".ocr-model-remove")?.addEventListener("click", async () => {
        if (models.length <= 1) {
          showToast("Minstens één model houden", true);
          return;
        }
        try {
          await removeInstalledOcrModel(m.id);
        } catch (err) {
          showToast(err.message, true);
        }
      });
      list.appendChild(li);
    }
  }
  applyOcrFeedbackToDom();
}

function openOcrModelModal() {
  if (!snapzillaSettings) return;
  renderOcrModelDialog();
  if (openRouterKeyConfigured()) {
    setOcrFeedback(
      "Tip: gebruik OCR-test om key + vision-model te controleren voordat je screenshots uploadt.",
      "info",
    );
  }
  $("ocrModelModal")?.showModal();
}

async function setOcrEnabled(enabled) {
  if (!snapzillaSettings) {
    const loaded = await loadSnapzillaSettings();
    if (!loaded) throw new Error("Instellingen niet beschikbaar");
  }
  await patchSnapzillaSettings({ ocr_enabled: enabled });
}

function updateOcrToggleButton() {
  const btn = $("ocrToggleBtn");
  if (!btn) return;
  if (!snapzillaSettings) {
    if (snapzillaSettingsMissing) {
      btn.hidden = false;
      btn.disabled = true;
      btn.classList.remove("ocr-toggle-on");
      btn.textContent = "OCR — migratie";
      btn.title =
        "Database-migratie ontbreekt. Op de server: bash scripts/pb-migrate.sh";
    } else {
      btn.hidden = true;
    }
    return;
  }
  btn.disabled = false;
  btn.hidden = false;
  const on = snapzillaSettings.ocr_enabled !== false;
  btn.textContent = on ? "OCR aan" : "OCR uit";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("ocr-toggle-on", on);
  const modelHint = shortModelLabel(activeOcrModelId());
  btn.title = on
    ? `OCR aan (${modelHint}) — klik om uit te zetten`
    : "OCR uit voor nieuwe screenshots — klik om aan te zetten";
  renderOcrModelDialog();
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

async function deleteAlbumRecord(id) {
  const res = await fetch(`${API}/collections/albums/records/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

async function forEachScreenshotInAlbum(albumId, fn) {
  let page = 1;
  for (;;) {
    const filter = `album = "${albumId.replace(/"/g, '\\"')}"`;
    const params = new URLSearchParams({
      page: String(page),
      perPage: "200",
      filter,
    });
    const res = await fetch(`${API}/collections/${COLLECTION}/records?${params}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    for (const item of json.items) {
      await fn(item);
    }
    if (page >= json.totalPages) break;
    page += 1;
  }
}

/** @type {{ id: string, name: string } | null} */
let pendingDeleteAlbum = null;

function openDeleteAlbumModal(album) {
  pendingDeleteAlbum = album;
  $("deleteAlbumHint").textContent = `Album “${album.name}” definitief verwijderen?`;
  $("deleteAlbumModal").showModal();
}

async function removeAlbum(albumId, deleteShots) {
  if (deleteShots) {
    await forEachScreenshotInAlbum(albumId, async (item) => {
      await deleteRecord(item.id);
    });
  } else {
    await forEachScreenshotInAlbum(albumId, async (item) => {
      await patchRecord(item.id, { album: "" });
      const local = state.items.find((x) => x.id === item.id);
      if (local) local.album = null;
    });
  }
  await deleteAlbumRecord(albumId);
  if (state.albumId === albumId) state.albumId = null;
  const alb = await listAlbums();
  state.albums = alb.items || [];
  populateBulkAlbumSelect();
  await reload();
  showToast(
    deleteShots ? "Album en screenshots verwijderd" : "Album verwijderd — screenshots blijven zonder album",
  );
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

function renderCalendar() {
  const grid = $("calendarGrid");
  if (!grid) return;
  grid.innerHTML = "";
  updateDateFilterUi();

  const ym = state.calendarMonth || currentYearMonth();
  const [yS, mS] = ym.split("-").map(Number);
  const firstDow = (new Date(Date.UTC(yS, mS - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(yS, mS, 0)).getUTCDate();
  const counts = activityCountMap();

  for (let i = 0; i < firstDow; i++) {
    const pad = document.createElement("span");
    pad.className = "cal-day cal-day-pad";
    pad.setAttribute("aria-hidden", "true");
    grid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${yS}-${String(mS).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = counts.get(iso) || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    btn.dataset.day = iso;
    if (state.dayFilter === iso) btn.classList.add("cal-day-active");
    else if (state.monthFilter === ym) btn.classList.add("cal-day-month");
    if (count > 0) btn.classList.add("cal-day-has-shots");
    btn.setAttribute("role", "gridcell");
    btn.setAttribute(
      "aria-label",
      `${formatDayLong(iso)}${count ? `, ${count} screenshot${count === 1 ? "" : "s"}` : ", geen shots"}`,
    );
    btn.innerHTML = `<span class="cal-day-num">${day}</span>${count ? `<span class="cal-day-dot" aria-hidden="true">${count}</span>` : ""}`;
    btn.addEventListener("click", () => {
      state.monthFilter = null;
      state.dayFilter = state.dayFilter === iso ? null : iso;
      reload();
    });
    grid.appendChild(btn);
  }
}

function ensureCalendarMonthVisible() {
  if (state.dayFilter) state.calendarMonth = state.dayFilter.slice(0, 7);
  else if (state.monthFilter) state.calendarMonth = state.monthFilter;
  else if (!state.calendarMonth) state.calendarMonth = currentYearMonth();
}

function albumNameOf(item) {
  const id = albumIdOf(item);
  if (!id) return "";
  return state.albums.find((a) => a.id === id)?.name || "Album";
}

function renderShotTagBadges(item) {
  if (state.tag) return "";
  const tags = parseTags(item.tags);
  if (!tags.length) return "";
  return tags
    .slice(0, 3)
    .map((t) => `<span class="shot-tag-badge">#${escapeHtml(t)}</span>`)
    .join("");
}

function renderShotAlbumBadge(item) {
  if (state.albumId) return "";
  const name = albumNameOf(item);
  if (!name) return "";
  return `<span class="shot-album-badge"><span class="shot-album-icon" aria-hidden="true">📁</span>${escapeHtml(name)}</span>`;
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
    const tagActive = state.tag === tag;
    btn.className = `filter-btn${tagActive ? " filter-btn-active" : ""}`;
    if (tagActive) btn.setAttribute("aria-current", "true");
    btn.textContent = `#${tag} (${count})`;
    btn.addEventListener("click", () => {
      state.tag = state.tag === tag ? null : tag;
      reload();
    });
    li.appendChild(btn);
    tagList.appendChild(li);
  }

  const albumList = $("albumList");
  albumList.innerHTML = "";
  const allBtn = document.createElement("li");
  const all = document.createElement("button");
  all.type = "button";
  const allAlbumsActive = !state.albumId;
  all.className = `filter-btn${allAlbumsActive ? " filter-btn-active" : ""}`;
  if (allAlbumsActive) all.setAttribute("aria-current", "true");
  all.textContent = "Alle albums";
  all.addEventListener("click", () => {
    state.albumId = null;
    reload();
  });
  allBtn.appendChild(all);
  albumList.appendChild(allBtn);
  for (const alb of state.albums) {
    const li = document.createElement("li");
    li.className = "album-list-item";
    const btn = document.createElement("button");
    btn.type = "button";
    const albumActive = state.albumId === alb.id;
    btn.className = `filter-btn${albumActive ? " filter-btn-active" : ""}`;
    if (albumActive) btn.setAttribute("aria-current", "true");
    btn.textContent = alb.name;
    btn.addEventListener("click", () => {
      state.albumId = state.albumId === alb.id ? null : alb.id;
      reload();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "album-delete-btn";
    del.setAttribute("aria-label", `Album ${alb.name} verwijderen`);
    del.title = "Album verwijderen";
    del.textContent = "×";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      openDeleteAlbumModal({ id: alb.id, name: alb.name });
    });
    li.appendChild(btn);
    li.appendChild(del);
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
  const emptyEl = $("galleryEmpty");
  emptyEl.hidden = display.length > 0;
  if (!display.length && state.dayFilter) {
    emptyEl.textContent = `Geen screenshots op ${formatDayLong(state.dayFilter)}. Klik op “filter wissen” in de kalender.`;
  } else if (!display.length && state.monthFilter) {
    emptyEl.textContent = `Geen screenshots in ${formatMonthLong(state.monthFilter)}. Wis het filter in de kalender.`;
  } else if (!display.length) {
    emptyEl.textContent =
      "Nog geen screenshots. Installeer de Windows-client of upload hier.";
  }

  for (const item of display) {
    const card = document.createElement("article");
    card.className = `shot-card${state.selected.has(item.id) ? " selected" : ""}`;
    card.dataset.id = item.id;

    const top = document.createElement("div");
    top.className = "shot-card-top";

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

    const topLeft = document.createElement("div");
    topLeft.className = "shot-card-top-left";
    topLeft.appendChild(check);
    appendGalleryTitleControl(topLeft, item);
    top.appendChild(topLeft);

    const tagBadgesHtml = renderShotTagBadges(item);
    if (tagBadgesHtml) {
      const tagWrap = document.createElement("div");
      tagWrap.className = "shot-tag-badges";
      tagWrap.innerHTML = tagBadgesHtml;
      top.appendChild(tagWrap);
    }

    const thumb = document.createElement("div");
    thumb.className = "shot-thumb";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = item.title || "Screenshot";
    img.src = thumbUrl(item);
    thumb.appendChild(img);

    if (isDuplicate(item.id)) {
      const dup = document.createElement("span");
      dup.className = "shot-dup";
      dup.textContent = "dup";
      thumb.appendChild(dup);
    }

    const ocrBadgeHtml = renderOcrBadgeHtml(item);
    if (ocrBadgeHtml) {
      const ocrEl = document.createElement("span");
      ocrEl.className = "shot-ocr-wrap";
      ocrEl.innerHTML = ocrBadgeHtml;
      thumb.appendChild(ocrEl);
    }

    const meta = document.createElement("div");
    meta.className = "shot-meta";
    const star = item.starred
      ? '<span class="shot-star" title="Favoriet" aria-label="Favoriet">★</span>'
      : "";
    meta.innerHTML = `
      <div class="shot-meta-left">${star}<span class="shot-date">${formatDate(item.captured_at || item.created)}</span></div>
      <div class="shot-meta-right">${renderShotAlbumBadge(item)}</div>
    `;

    card.appendChild(top);
    card.appendChild(thumb);
    card.appendChild(meta);

    card.addEventListener("click", (e) => {
      if (e.target === check) return;
      if (e.target.closest(".shot-title, .shot-title-input")) return;
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
  $("bulkUnstarBtn").disabled = dis;
  $("bulkTagBtn").disabled = dis;
  $("bulkDeleteBtn").disabled = dis;
  $("bulkAlbumBtn").disabled = dis;
  $("bulkAlbumSelect").disabled = dis;
  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  const box = $("selectAll");
  if (!box) return;
  const display = filteredForDuplicates(state.items);
  if (!display.length) {
    box.checked = false;
    box.indeterminate = false;
    return;
  }
  const n = display.filter((i) => state.selected.has(i.id)).length;
  box.checked = n === display.length;
  box.indeterminate = n > 0 && n < display.length;
}

function selectedItems() {
  return [...state.selected]
    .map((id) => state.items.find((x) => x.id === id))
    .filter(Boolean);
}

function tagStateForSelection(tag) {
  const items = selectedItems();
  if (!items.length) return "none";
  let n = 0;
  for (const item of items) {
    if (parseTags(item.tags).includes(tag)) n++;
  }
  if (n === 0) return "none";
  if (n === items.length) return "all";
  return "some";
}

function openBulkTagModal() {
  if (!state.selected.size) return;
  const list = $("bulkTagList");
  const empty = $("bulkTagEmpty");
  list.innerHTML = "";
  $("bulkTagHint").textContent = `${state.selected.size} screenshot${state.selected.size === 1 ? "" : "s"} geselecteerd`;
  $("bulkTagNew").value = "";

  const known = aggregateTags(state.items);
  const tagNames = new Set(known.map(([t]) => t));
  for (const item of selectedItems()) {
    for (const t of parseTags(item.tags)) tagNames.add(t);
  }
  const sorted = [...tagNames].sort((a, b) => a.localeCompare(b, "nl"));

  empty.hidden = sorted.length > 0;
  for (const tag of sorted) {
    const count = known.find(([t]) => t === tag)?.[1];
    const label = document.createElement("label");
    label.className = "bulk-tag-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.tag = tag;
    const st = tagStateForSelection(tag);
    cb.checked = st === "all";
    cb.indeterminate = st === "some";
    cb.addEventListener("change", () => {
      cb.indeterminate = false;
    });
    const text = document.createElement("span");
    text.textContent = tag;
    label.appendChild(cb);
    label.appendChild(text);
    if (count != null) {
      const meta = document.createElement("span");
      meta.className = "bulk-tag-count";
      meta.textContent = String(count);
      label.appendChild(meta);
    }
    list.appendChild(label);
  }

  $("bulkTagModal").showModal();
}

async function applyBulkTags() {
  const list = $("bulkTagList");
  const toggles = [...list.querySelectorAll("input[type=checkbox][data-tag]")];
  const newTag = $("bulkTagNew").value.trim();
  const tagsToAddAlways = newTag ? [newTag] : [];

  for (const id of state.selected) {
    const item = state.items.find((x) => x.id === id);
    if (!item) continue;
    let tags = parseTags(item.tags);

    for (const cb of toggles) {
      const tag = cb.dataset.tag;
      if (!tag) continue;
      if (cb.checked) {
        if (!tags.includes(tag)) tags.push(tag);
      } else if (!cb.indeterminate) {
        tags = tags.filter((t) => t !== tag);
      }
    }

    for (const tag of tagsToAddAlways) {
      if (!tags.includes(tag)) tags.push(tag);
    }

    await patchRecord(id, { tags });
    item.tags = tags;
  }

  $("bulkTagModal").close();
  showToast("Tags bijgewerkt");
  renderSidebarLists();
  renderGallery();
}

function stopLightboxEdit() {
  state.lightboxEditing = false;
  state.editDrawing = false;
  state.editUndoStack = [];
  state.editChainAnchor = null;
  $("lightboxCanvas").hidden = true;
  $("lightboxImg").hidden = false;
}

function pushEditUndo(ctx, canvas) {
  state.editUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (state.editUndoStack.length > MAX_EDIT_UNDO) state.editUndoStack.shift();
  updateEditUndoButton();
}

function undoLightboxEdit(ctx, canvas) {
  if (!state.editUndoStack.length) return;
  const prev = state.editUndoStack.pop();
  ctx.putImageData(prev, 0, 0);
  state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.editChainAnchor = null;
  updateEditUndoButton();
}

function updateEditUndoButton() {
  const btn = $("lbUndoEdit");
  if (btn) btn.disabled = !state.editUndoStack.length;
}

function normEditRect(from, to) {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.max(8, Math.abs(to.x - from.x));
  const h = Math.max(8, Math.abs(to.y - from.y));
  return { x, y, w, h };
}

function drawStampShape(ctx, rect, kind, color, preview = false) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.08);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (preview) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
  switch (kind) {
    case "cross":
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y + h * 0.2);
      ctx.lineTo(x + w * 0.8, y + h * 0.8);
      ctx.moveTo(x + w * 0.8, y + h * 0.2);
      ctx.lineTo(x + w * 0.2, y + h * 0.8);
      ctx.stroke();
      break;
    case "check":
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + h * 0.55);
      ctx.lineTo(x + w * 0.4, y + h * 0.82);
      ctx.lineTo(x + w * 0.88, y + h * 0.22);
      ctx.stroke();
      break;
    case "house":
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.12);
      ctx.lineTo(x + w * 0.88, y + h * 0.42);
      ctx.lineTo(x + w * 0.88, y + h * 0.88);
      ctx.lineTo(x + w * 0.12, y + h * 0.88);
      ctx.lineTo(x + w * 0.12, y + h * 0.42);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeRect(x + w * 0.38, y + h * 0.58, w * 0.24, h * 0.3);
      break;
    case "lamp":
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.36, w * 0.22, h * 0.21, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.57);
      ctx.lineTo(x + w * 0.5, y + h * 0.72);
      ctx.moveTo(x + w * 0.32, y + h * 0.78);
      ctx.lineTo(x + w * 0.68, y + h * 0.78);
      ctx.stroke();
      break;
    case "computer":
      ctx.strokeRect(x + w * 0.14, y + h * 0.18, w * 0.72, h * 0.52);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.7);
      ctx.lineTo(x + w * 0.5, y + h * 0.78);
      ctx.moveTo(x + w * 0.28, y + h * 0.86);
      ctx.lineTo(x + w * 0.72, y + h * 0.86);
      ctx.stroke();
      break;
    case "lightning":
      ctx.beginPath();
      ctx.moveTo(x + w * 0.55, y + h * 0.08);
      ctx.lineTo(x + w * 0.28, y + h * 0.52);
      ctx.lineTo(x + w * 0.48, y + h * 0.52);
      ctx.lineTo(x + w * 0.38, y + h * 0.92);
      ctx.lineTo(x + w * 0.72, y + h * 0.42);
      ctx.lineTo(x + w * 0.5, y + h * 0.42);
      ctx.closePath();
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

function endEditChain(ctx, canvas) {
  state.editChainAnchor = null;
  state.editDrawing = false;
  if (ctx && canvas && state.editSnapshot) {
    ctx.putImageData(state.editSnapshot, 0, 0);
  }
  showToast("Lijnketting beëindigd");
}

function drawChainPreview(ctx, from, to) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = state.editColor;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function setActiveEditTool(tool) {
  state.editTool = tool;
  if (tool !== "chain") state.editChainAnchor = null;
  document.querySelectorAll("[data-edtool]").forEach((btn) => {
    btn.classList.toggle("edit-tool-btn-active", btn.dataset.edtool === tool);
  });
  document.querySelectorAll(".stamp-btn").forEach((btn) => {
    const active = tool === "stamp" && btn.dataset.stamp === state.editStamp;
    btn.classList.toggle("stamp-btn-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
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
  state.editUndoStack = [];
  state.editChainAnchor = null;
  updateEditUndoButton();

  state.lightboxEditing = true;
  img.hidden = true;
  canvas.hidden = false;
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
      ctx.strokeStyle = state.editColor;
    }
    if (state.editTool === "rect") {
      const r = normEditRect(from, to);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      return;
    }
    if (state.editTool === "circle") {
      const r = normEditRect(from, to);
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (state.editTool === "stamp") {
      drawStampShape(ctx, normEditRect(from, to), state.editStamp, state.editColor, true);
      return;
    }
    if (state.editTool === "arrow" || state.editTool === "chain") {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      if (state.editTool === "arrow") {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = 14;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
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
    const pt = canvasPoint(canvas, e);
    if (state.editTool === "chain" && state.editChainAnchor) {
      state.editStart = { ...state.editChainAnchor };
    } else {
      state.editStart = pt;
    }
    if (state.editTool === "pen" || state.editTool === "highlight") {
      pushEditUndo(ctx, canvas);
    }
  };

  canvas.onmousemove = (e) => {
    if (!state.lightboxEditing) return;
    const pt = canvasPoint(canvas, e);
    if (state.editDrawing && state.editStart) {
      if (state.editTool === "pen" || state.editTool === "highlight") {
        drawShape(state.editStart, pt);
        state.editStart = pt;
        state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        drawShape(state.editStart, pt);
      }
      return;
    }
    if (state.editTool === "chain" && state.editChainAnchor && state.editSnapshot) {
      ctx.putImageData(state.editSnapshot, 0, 0);
      drawChainPreview(ctx, state.editChainAnchor, pt);
    }
  };

  canvas.onmouseup = (e) => {
    if (!state.lightboxEditing || !state.editDrawing) return;
    const pt = canvasPoint(canvas, e);
    if (state.editTool !== "pen" && state.editTool !== "highlight") {
      pushEditUndo(ctx, canvas);
      ctx.putImageData(state.editSnapshot, 0, 0);
      if (state.editTool === "stamp") {
        drawStampShape(ctx, normEditRect(state.editStart, pt), state.editStamp, state.editColor, false);
      } else {
        drawShape(state.editStart, pt);
      }
      state.editSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (state.editTool === "chain") {
        state.editChainAnchor = { x: pt.x, y: pt.y };
      }
    }
    state.editDrawing = false;
  };

  canvas.onkeydown = (e) => {
    if (!state.lightboxEditing) return;
    if (e.key === "Escape" && state.editTool === "chain" && state.editChainAnchor) {
      e.preventDefault();
      endEditChain(ctx, canvas);
    }
  };
  canvas.tabIndex = 0;

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

  $("lbResetEdit").onclick = async () => {
    try {
      await startLightboxEdit(item);
      setActiveEditTool(state.editTool);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  $("lbUndoEdit").onclick = () => undoLightboxEdit(ctx, canvas);

  document.querySelectorAll("[data-edtool]").forEach((btn) => {
    btn.onclick = () => {
      const tool = btn.dataset.edtool;
      if (tool === "chain" && state.editTool === "chain" && state.editChainAnchor) {
        endEditChain(ctx, canvas);
        return;
      }
      setActiveEditTool(tool);
    };
  });

  document.querySelectorAll(".stamp-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editStamp = btn.dataset.stamp || "check";
      setActiveEditTool("stamp");
    });
  });
}

function bindLightboxShotActions(item) {
  $("lbSaveTitle")?.addEventListener("click", async () => {
    const title = $("titleEditor").value.trim();
    try {
      await saveShotTitle(item, title);
      $("lightboxCaption").textContent = title || "Screenshot";
      showToast("Titel opgeslagen");
      renderGallery();
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

  $("lbStar")?.addEventListener("click", async () => {
    try {
      const next = !item.starred;
      await patchRecord(item.id, { starred: next });
      item.starred = next;
      const btn = $("lbStar");
      if (btn) {
        btn.textContent = next ? "★" : "☆";
        btn.classList.toggle("lightbox-star-active", next);
        btn.setAttribute("aria-pressed", next ? "true" : "false");
        btn.setAttribute("aria-label", next ? "Favoriet verwijderen" : "Als favoriet markeren");
      }
      renderGallery();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function renderLightboxShotActions(item) {
  const tagValue = parseTags(item.tags).join(", ");
  const albumSel = albumIdOf(item);
  const titleVal = galleryTitleLabel(item) || shotTitleText(item);
  const starActive = item.starred ? " lightbox-star-active" : "";
  $("lightboxShotActions").innerHTML = `
    <div class="lightbox-shot-row lightbox-shot-fields">
      <button type="button" class="lightbox-star-btn${starActive}" id="lbStar" aria-label="${item.starred ? "Favoriet verwijderen" : "Als favoriet markeren"}" aria-pressed="${item.starred ? "true" : "false"}">${item.starred ? "★" : "☆"}</button>
      <div class="lightbox-shot-field">
        <label for="titleEditor">Titel</label>
        <input class="input" id="titleEditor" value="${escapeHtml(titleVal)}" placeholder="Optionele titel" maxlength="500" />
        <button type="button" class="btn btn-ghost btn-sm" id="lbSaveTitle">Opslaan</button>
      </div>
      <div class="lightbox-shot-field">
        <label for="tagsEditor">Tags</label>
        <input class="input" id="tagsEditor" value="${escapeHtml(tagValue)}" placeholder="werk, bug, ui" />
        <button type="button" class="btn btn-ghost btn-sm" id="lbSaveTags">Opslaan</button>
      </div>
      <div class="lightbox-shot-field">
        <label for="albumEditor">Album</label>
        <select class="select" id="albumEditor">${renderAlbumSelectOptions(albumSel)}</select>
        <button type="button" class="btn btn-ghost btn-sm" id="lbSaveAlbum">Opslaan</button>
      </div>
    </div>
  `;
  bindLightboxShotActions(item);
}

function openLightbox(id) {
  const idx = state.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  state.lightboxIndex = idx;
  refreshLightbox();
  $("lightbox").showModal();
}

function refreshLightbox() {
  const item = state.items[state.lightboxIndex];
  if (!item) return;
  $("lightboxImg").src = `${fileUrl(item)}?t=${Date.now()}`;
  $("lightboxImg").hidden = false;
  $("lightboxCaption").textContent = galleryTitleLabel(item) || "Screenshot";

  const colors = Array.isArray(item.colors) ? item.colors : [];
  const colorHtml = colors
    .map(
      (c) =>
        `<span class="color-swatch" style="background:rgb(${c.r},${c.g},${c.b})"></span>`,
    )
    .join("");

  $("lightboxMeta").innerHTML = `
    <dl>
      <dt>Datum</dt><dd>${formatDate(item.captured_at || item.created)}</dd>
      <dt>Afmeting</dt><dd>${item.width || "?"} × ${item.height || "?"} · ${formatBytes(item.file_size)}</dd>
      <dt>Client</dt><dd>${escapeHtml(item.client_name || item.hostname || item.client_id || "—")}</dd>
      <dt>Modus</dt><dd>${escapeHtml(item.capture_mode || "—")}</dd>
      <dt>Kleuren</dt><dd>${colorHtml || "—"}</dd>
      <dt>pHash</dt><dd>${escapeHtml(item.phash || "—")}</dd>
      <dt>OCR</dt><dd class="ocr-meta-dd">${renderLightboxOcrHtml(item)}</dd>
      <dt>Notities</dt>
      <dd><textarea id="notesEditor">${escapeHtml(item.notes || "")}</textarea></dd>
    </dl>
    <div class="lightbox-meta-actions" style="margin-top:1rem">
      <a class="btn btn-ghost btn-sm" href="${fileUrl(item)}" download>Download</a>
      <button type="button" class="btn btn-danger btn-sm" id="lbDelete">Verwijder</button>
    </div>
  `;

  renderLightboxShotActions(item);
  bindLightboxCanvas(item);
  setActiveEditTool(state.editTool);
  void startLightboxEdit(item).catch((err) => showToast(err.message, true));

  $("notesEditor")?.addEventListener("blur", async (e) => {
    try {
      await patchRecord(item.id, { notes: e.target.value });
      item.notes = e.target.value;
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

async function reload(append = false, options = {}) {
  const preserveSelection = options.preserveSelection !== false;
  const lightboxOpen = Boolean($("lightbox")?.open);
  const lightboxId =
    lightboxOpen && state.lightboxIndex >= 0
      ? state.items[state.lightboxIndex]?.id
      : null;
  try {
    const data = await listRecords(append ? state.page + 1 : 1);
    if (append) {
      state.page++;
      state.items.push(...data.items);
    } else {
      const previousSelected = preserveSelection ? [...state.selected] : [];
      state.page = data.page;
      state.items = data.items;
      state.selected.clear();
      if (preserveSelection) {
        const visible = new Set(state.items.map((i) => i.id));
        for (const id of previousSelected) {
          if (visible.has(id)) state.selected.add(id);
        }
      }
      updateBulkUi();
    }
    state.totalPages = data.totalPages;
    if (lightboxId) {
      const idx = state.items.findIndex((x) => x.id === lightboxId);
      if (idx >= 0) state.lightboxIndex = idx;
    }
    computePhashGroups(state.items);
    await loadActivityByDay();
    ensureCalendarMonthVisible();
    renderStats();
    renderCalendar();
    renderSidebarLists();
    renderGallery();
    if (lightboxOpen && lightboxId && state.lightboxIndex >= 0) {
      const dd = document.querySelector(".ocr-meta-dd");
      if (dd) {
        dd.innerHTML = renderLightboxOcrHtml(state.items[state.lightboxIndex]);
      }
    }
    scheduleAnalysisPoll();
  } catch (err) {
    showToast(`Laden mislukt: ${err.message}`, true);
  }
}

async function init() {
  state.calendarMonth = currentYearMonth();
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

  await loadSnapzillaSettings();
  updateOcrToggleButton();
  renderOcrModelDialog();
  $("ocrModelBtn")?.addEventListener("click", () => openOcrModelModal());
  $("ocrModelCloseBtn")?.addEventListener("click", () => $("ocrModelModal")?.close());
  $("ocrApiKeyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveOpenRouterApiKey($("ocrApiKeyInput")?.value || "");
      $("ocrApiKeyInput").value = "";
    } catch (err) {
      showToast(err.message, true);
    }
  });
  $("ocrApiKeyClearBtn")?.addEventListener("click", () => {
    void clearOpenRouterApiKey().catch((err) => showToast(err.message, true));
  });
  $("ocrApiKeyTestBtn")?.addEventListener("click", () => {
    void runOpenRouterKeyTest().catch((err) => {
      setOcrFeedback(err.message, "error");
      showToast(err.message, true);
    });
  });
  $("ocrPipelineTestBtn")?.addEventListener("click", () => {
    void runOcrPipelineTest().catch((err) => {
      setOcrFeedback(`OCR-test mislukt: ${err.message}`, "error");
      showToast(err.message, true);
    });
  });
  $("ocrModelSelect")?.addEventListener("change", async (e) => {
    try {
      await setActiveOcrModel(e.target.value);
    } catch (err) {
      showToast(err.message, true);
    }
  });
  $("ocrAddModelForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await addInstalledOcrModel(
        $("ocrAddModelId")?.value || "",
        $("ocrAddModelName")?.value || "",
      );
      $("ocrAddModelId").value = "";
      $("ocrAddModelName").value = "";
    } catch (err) {
      showToast(err.message, true);
    }
  });
  $("ocrCatalogLoadBtn")?.addEventListener("click", async () => {
    const btn = $("ocrCatalogLoadBtn");
    const hint = $("ocrCatalogHint");
    try {
      btn.disabled = true;
      if (hint) hint.textContent = "Catalogus laden…";
      await fetchOpenRouterCatalog();
      renderOcrCatalogList($("ocrCatalogSearch")?.value || "");
    } catch (err) {
      showToast(err.message, true);
      if (hint) hint.textContent = "Laden mislukt — controleer internet op de server.";
    } finally {
      btn.disabled = false;
    }
  });
  $("ocrCatalogSearch")?.addEventListener(
    "input",
    debounce(() => {
      renderOcrCatalogList($("ocrCatalogSearch")?.value || "");
    }, 250),
  );
  if (snapzillaSettingsMissing) {
    showToast(
      "OCR-instellingen ontbreken — op de server: bash scripts/pb-migrate.sh",
      true,
    );
  }
  $("ocrToggleBtn")?.addEventListener("click", async () => {
    if (!snapzillaSettings) return;
    const next = snapzillaSettings.ocr_enabled === false;
    try {
      await setOcrEnabled(next);
      showToast(
        next
          ? "OCR aan — nieuwe shots en shots zonder tekst worden verwerkt"
          : "OCR uit voor nieuwe screenshots",
      );
      scheduleAnalysisPoll();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("clearDateFilter")?.addEventListener("click", () => {
    state.dayFilter = null;
    state.monthFilter = null;
    reload();
  });

  $("calPrev")?.addEventListener("click", () => {
    state.calendarMonth = shiftCalendarMonth(state.calendarMonth || currentYearMonth(), -1);
    renderCalendar();
  });

  $("calNext")?.addEventListener("click", () => {
    state.calendarMonth = shiftCalendarMonth(state.calendarMonth || currentYearMonth(), 1);
    renderCalendar();
  });

  $("calMonthBtn")?.addEventListener("click", () => {
    const ym = state.calendarMonth || currentYearMonth();
    state.dayFilter = null;
    state.monthFilter = state.monthFilter === ym ? null : ym;
    reload();
  });

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

  $("bulkUnstarBtn").addEventListener("click", async () => {
    for (const id of state.selected) {
      const item = state.items.find((x) => x.id === id);
      if (item) await patchRecord(id, { starred: false });
    }
    showToast("Favoriet verwijderd");
    await reload();
  });

  $("bulkTagBtn").addEventListener("click", () => openBulkTagModal());

  $("bulkTagCancel")?.addEventListener("click", () => $("bulkTagModal").close());

  $("bulkTagForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await applyBulkTags();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("bulkAlbumBtn").addEventListener("click", async () => {
    const album = $("bulkAlbumSelect").value;
    for (const id of state.selected) {
      await patchRecord(id, { album: album || "" });
    }
    showToast(album ? "Album bijgewerkt" : "Uit album gehaald");
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

  $("lightboxClose").addEventListener("click", () => {
    stopLightboxEdit();
    $("lightbox").close();
  });

  $("editColorPicker")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-color]");
    if (!chip) return;
    state.editColor = chip.dataset.color;
    document.querySelectorAll(".color-chip").forEach((c) => {
      c.classList.toggle("color-chip-active", c === chip);
    });
  });
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

  $("deleteAlbumCancelBtn").addEventListener("click", () => {
    pendingDeleteAlbum = null;
    $("deleteAlbumModal").close();
  });

  const runAlbumDelete = async (deleteShots) => {
    const target = pendingDeleteAlbum;
    if (!target) return;
    $("deleteAlbumModal").close();
    pendingDeleteAlbum = null;
    try {
      await removeAlbum(target.id, deleteShots);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  $("deleteAlbumOnlyBtn").addEventListener("click", () => runAlbumDelete(false));
  $("deleteAlbumAndShotsBtn").addEventListener("click", () => runAlbumDelete(true));

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
