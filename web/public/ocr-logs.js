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

function logErrorText(item) {
  return item.error_message || item.error || "";
}

function renderLogItem(item) {
  const ok =
    item.success === true ||
    item.success === "true" ||
    item.ok === true ||
    item.ok === "true";
  const card = document.createElement("article");
  card.className = `ocr-log-card${ok ? "" : " ocr-log-card-error"}`;
  card.dataset.id = item.id || "";
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

  const errText = logErrorText(item);
  if (errText) {
    const err = document.createElement("pre");
    err.className = "ocr-log-pre ocr-log-error-text";
    err.textContent = errText;
    card.appendChild(err);
  }

  const reqDet = document.createElement("details");
  reqDet.className = "ocr-log-details";
  reqDet.innerHTML = `<summary>Request</summary>`;
  const reqPre = document.createElement("pre");
  reqPre.className = "ocr-log-pre";
  reqPre.textContent = item.request_json
    ? prettyJson(item.request_json)
    : "— (laden…) ";
  reqDet.appendChild(reqPre);
  reqDet.addEventListener("toggle", () => {
    if (reqDet.open && item.id && !item.request_json) {
      void loadLogDetail(item.id).then((full) => {
        if (full?.request_json) {
          reqPre.textContent = prettyJson(full.request_json);
          item.request_json = full.request_json;
        }
      });
    }
  });
  card.appendChild(reqDet);

  const resDet = document.createElement("details");
  resDet.className = "ocr-log-details";
  resDet.innerHTML = `<summary>Response</summary>`;
  const resPre = document.createElement("pre");
  resPre.className = "ocr-log-pre";
  resPre.textContent = item.response_json
    ? prettyJson(item.response_json)
    : "— (laden…) ";
  resDet.appendChild(resPre);
  resDet.addEventListener("toggle", () => {
    if (resDet.open && item.id && !item.response_json) {
      void loadLogDetail(item.id).then((full) => {
        if (full?.response_json) {
          resPre.textContent = prettyJson(full.response_json);
          item.response_json = full.response_json;
        }
      });
    }
  });
  card.appendChild(resDet);

  return card;
}

async function loadLogDetail(id) {
  const res = await fetch(`${API}/collections/${LOG_COLLECTION}/records/${id}`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchLogList() {
  const attempts = [
    {
      page: "1",
      perPage: "50",
      sort: "-created",
      fields:
        "id,created,phase,model,success,ok,screenshot_id,duration_ms,error_message,error",
    },
    { page: "1", perPage: "50", sort: "-updated" },
    { page: "1", perPage: "50" },
  ];

  let lastBody = "";
  for (const base of attempts) {
    const params = new URLSearchParams(base);
    const res = await fetch(
      `${API}/collections/${LOG_COLLECTION}/records?${params}`,
    );
    lastBody = await res.text();
    if (res.ok) {
      return JSON.parse(lastBody);
    }
    if (res.status === 404) {
      return { missing: true };
    }
  }

  const metaRes = await fetch(`${API}/collections/${LOG_COLLECTION}`);
  const metaText = metaRes.ok
    ? "collectie bestaat"
    : `collectie-meta HTTP ${metaRes.status}`;
  throw new Error(
    `${lastBody.slice(0, 280)} (${metaText}). Draai: bash scripts/pb-migrate.sh`,
  );
}

async function loadLogs() {
  const json = await fetchLogList();
  if (json.missing) {
    $("logsEmpty").hidden = false;
    $("logsEmpty").textContent =
      "Collectie ocr_logs ontbreekt — op de server: bash scripts/pb-migrate.sh";
    $("logsList").innerHTML = "";
    return;
  }
  const items = json.items || [];
  $("logsEmpty").hidden = items.length > 0;
  if (!items.length) {
    $("logsEmpty").textContent = "Geen logregels — nog geen OCR uitgevoerd.";
  }
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
  void loadLogs().catch((err) => {
    $("logsEmpty").hidden = false;
    $("logsEmpty").textContent = `Laden mislukt: ${err.message}`;
  });
});
$("autoRefresh")?.addEventListener("change", setupAutoRefresh);

void loadLogs().catch((err) => {
  $("logsEmpty").hidden = false;
  $("logsEmpty").textContent = `Laden mislukt: ${err.message}`;
});
setupAutoRefresh();
