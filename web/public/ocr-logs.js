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
  void loadStats();
}

const AI_PHASES = ["openrouter", "ui-test-ocr"];
const STATS_FIELDS =
  "id,created,phase,model,success,duration_ms,prompt_tokens,completion_tokens,total_tokens,cost";

async function fetchAiRequests() {
  const filter = AI_PHASES.map((p) => `phase = "${p}"`).join(" || ");
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({
      page: String(page),
      perPage: "500",
      sort: "-created",
      filter,
      fields: STATS_FIELDS,
    });
    const res = await fetch(`${API}/collections/${LOG_COLLECTION}/records?${params}`);
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    all.push(...(json.items || []));
    if (page >= (json.totalPages || 1)) break;
  }
  return all;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isSuccess(item) {
  return item.success === true || item.success === "true";
}

function formatTokens(n) {
  return Math.round(n).toLocaleString("nl-NL");
}

function formatCost(n) {
  if (!n) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function summarize(items) {
  return items.reduce(
    (acc, it) => {
      acc.count += 1;
      if (isSuccess(it)) acc.ok += 1;
      acc.prompt += num(it.prompt_tokens);
      acc.completion += num(it.completion_tokens);
      acc.tokens += num(it.total_tokens);
      acc.cost += num(it.cost);
      acc.duration += num(it.duration_ms);
      return acc;
    },
    { count: 0, ok: 0, prompt: 0, completion: 0, tokens: 0, cost: 0, duration: 0 },
  );
}

function statRow(label, value) {
  return `<div class="ocr-stat-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderStats(items) {
  const el = $("logStats");
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<h2>Statistieken</h2><p class="hint">Nog geen AI-aanvragen gelogd.</p>`;
    return;
  }

  const last = items[0];
  const total = summarize(items);
  const scans = summarize(items.filter((i) => i.phase === "openrouter" && isSuccess(i)));
  const today = new Date().toISOString().slice(0, 10);
  const todaySum = summarize(items.filter((i) => String(i.created || "").slice(0, 10) === today));
  const costKnown = items.some((i) => num(i.cost) > 0);

  const byModel = new Map();
  for (const it of items) {
    const key = it.model || "onbekend";
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key).push(it);
  }
  const modelRows = [...byModel.entries()]
    .map(([model, list]) => ({ model, s: summarize(list) }))
    .sort((a, b) => b.s.cost - a.s.cost || b.s.tokens - a.s.tokens)
    .map(
      ({ model, s }) =>
        `<li><span class="ocr-stat-model">${escapeHtml(model)}</span><span>${s.count}× · ${formatTokens(s.tokens)} tokens · ${formatCost(s.cost)}</span></li>`,
    )
    .join("");

  el.innerHTML = `
    <h2>Laatste aanvraag</h2>
    <dl class="ocr-stat-list">
      ${statRow("Tijd", formatWhen(last.created))}
      ${statRow("Model", last.model || "—")}
      ${statRow("Status", isSuccess(last) ? "OK" : "Fout")}
      ${statRow("Tokens", `${formatTokens(num(last.total_tokens))} (in ${formatTokens(num(last.prompt_tokens))} / uit ${formatTokens(num(last.completion_tokens))})`)}
      ${statRow("Kosten", formatCost(num(last.cost)))}
      ${statRow("Duur", last.duration_ms != null ? `${num(last.duration_ms)} ms` : "—")}
    </dl>

    <h2>Totaal</h2>
    <dl class="ocr-stat-list">
      ${statRow("Aanvragen", `${total.count} (${total.ok} OK, ${total.count - total.ok} fout)`)}
      ${statRow("Tokens", `${formatTokens(total.tokens)} (in ${formatTokens(total.prompt)} / uit ${formatTokens(total.completion)})`)}
      ${statRow("Kosten", formatCost(total.cost))}
    </dl>

    <h2>Extra</h2>
    <dl class="ocr-stat-list">
      ${statRow("Vandaag", `${todaySum.count} aanvragen · ${formatTokens(todaySum.tokens)} tokens · ${formatCost(todaySum.cost)}`)}
      ${statRow("Gescande screenshots", String(scans.count))}
      ${statRow("Gem. kosten per screenshot", scans.count ? formatCost(scans.cost / scans.count) : "—")}
      ${statRow("Gem. tokens per screenshot", scans.count ? formatTokens(scans.tokens / scans.count) : "—")}
      ${statRow("Gem. duur", total.count ? `${Math.round(total.duration / total.count)} ms` : "—")}
    </dl>

    <h2>Per model</h2>
    <ul class="ocr-stat-models">${modelRows}</ul>
    ${costKnown ? "" : `<p class="hint">Kosten worden pas gelogd voor aanvragen na deze update; oudere regels tonen $0.</p>`}
  `;
}

async function loadStats() {
  try {
    renderStats(await fetchAiRequests());
  } catch (err) {
    $("logStats").innerHTML = `<h2>Statistieken</h2><p class="hint">Laden mislukt: ${escapeHtml(err.message.slice(0, 200))}</p>`;
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
