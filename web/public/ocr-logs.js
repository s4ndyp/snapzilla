const API = "/api";
const LOG_COLLECTION = "ocr_logs";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nl-NL");
  } catch {
    return iso;
  }
}

function prettyJson(raw) {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function renderLogItem(item) {
  const ok =
    item.success === true ||
    item.success === "true" ||
    item.ok === true ||
    item.ok === "true";
  const card = document.createElement("article");
  card.className = `ocr-log-card${ok ? "" : " ocr-log-card-error"}`;
  const head = document.createElement("header");
  head.className = "ocr-log-card-head";
  head.innerHTML = `
    <span class="ocr-log-badge ${ok ? "ok" : "err"}">${ok ? "OK" : "FOUT"}</span>
    <span class="ocr-log-phase">${escapeHtml(item.phase || "—")}</span>
    <span class="ocr-log-model">${escapeHtml(item.model || "")}</span>
    <time>${escapeHtml(formatWhen(item.created))}</time>
  `;
  const meta = document.createElement("p");
  meta.className = "hint ocr-log-meta";
  const parts = [];
  if (item.screenshot_id) parts.push(`screenshot ${item.screenshot_id}`);
  if (item.duration_ms != null) parts.push(`${item.duration_ms} ms`);
  meta.textContent = parts.join(" · ") || "—";

  card.append(head, meta);

  if (item.error) {
    const err = document.createElement("pre");
    err.className = "ocr-log-pre ocr-log-error-text";
    err.textContent = item.error;
    card.appendChild(err);
  }

  if (item.request_json) {
    const det = document.createElement("details");
    det.className = "ocr-log-details";
    det.innerHTML = `<summary>Request</summary>`;
    const pre = document.createElement("pre");
    pre.className = "ocr-log-pre";
    pre.textContent = prettyJson(item.request_json);
    det.appendChild(pre);
    card.appendChild(det);
  }

  if (item.response_json) {
    const det = document.createElement("details");
    det.className = "ocr-log-details";
    det.innerHTML = `<summary>Response</summary>`;
    const pre = document.createElement("pre");
    pre.className = "ocr-log-pre";
    pre.textContent = prettyJson(item.response_json);
    det.appendChild(pre);
    card.appendChild(det);
  }

  return card;
}

async function loadLogs() {
  const params = new URLSearchParams({
    page: "1",
    perPage: "80",
    sort: "-created",
  });
  const res = await fetch(`${API}/collections/${LOG_COLLECTION}/records?${params}`);
  if (res.status === 404) {
    $("logsEmpty").hidden = false;
    $("logsEmpty").textContent =
      "Collectie ocr_logs ontbreekt — op de server: bash scripts/pb-migrate.sh";
    $("logsList").innerHTML = "";
    return;
  }
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  const items = json.items || [];
  $("logsEmpty").hidden = items.length > 0;
  const list = $("logsList");
  list.innerHTML = "";
  for (const item of items) {
    list.appendChild(renderLogItem(item));
  }
}

let timer = null;

function setupAutoRefresh() {
  clearInterval(timer);
  if ($("autoRefresh")?.checked) {
    timer = setInterval(() => {
      void loadLogs().catch((err) => console.error(err));
    }, 5000);
  }
}

$("refreshLogsBtn")?.addEventListener("click", () => {
  void loadLogs().catch((err) => alert(err.message));
});
$("autoRefresh")?.addEventListener("change", setupAutoRefresh);

void loadLogs().catch((err) => {
  $("logsEmpty").hidden = false;
  $("logsEmpty").textContent = `Laden mislukt: ${err.message}`;
});
setupAutoRefresh();
