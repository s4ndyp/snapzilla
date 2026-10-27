import sharp from "sharp";
import { createHash } from "crypto";

const PB = (process.env.POCKETBASE_URL || "http://pocketbase:8090").replace(
  /\/$/,
  "",
);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const OPENROUTER_API_KEY_ENV = (process.env.OPENROUTER_API_KEY || "").trim();
const OPENROUTER_MODEL_DEFAULT =
  process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
const OPENROUTER_BASE =
  (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(
    /\/$/,
    "",
  );
const OPENROUTER_TIMEOUT_MS =
  Number(process.env.OPENROUTER_TIMEOUT_MS) || 120_000;
const VISION_MAX_WIDTH = Number(process.env.VISION_MAX_WIDTH) || 1600;
const OCR_TEXT_MAX = 50_000;
const SETTINGS_CACHE_MS = 3000;

/** @type {{ ts: number, enabled: boolean, model: string, apiKey: string, ocrEnabledSince: string | null }} */
let settingsCache = {
  ts: 0,
  enabled: true,
  model: OPENROUTER_MODEL_DEFAULT,
  apiKey: OPENROUTER_API_KEY_ENV,
  ocrEnabledSince: null,
};

async function pbFetch(path, options = {}) {
  const res = await fetch(`${PB}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res;
}

function filePath(record, filename) {
  return `/api/files/screenshots/${record.id}/${encodeURIComponent(filename)}`;
}

async function writeOcrLog(entry) {
  const body = new FormData();
  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined || v === null) continue;
    let key = k;
    if (k === "ok") key = "success";
    if (k === "error") key = "error_message";
    body.append(key, typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  }
  try {
    await pbFetch("/api/collections/ocr_logs/records", { method: "POST", body });
  } catch (err) {
    console.warn("[ocr-log] write failed:", err.message);
  }
}

function recordCreatedAt(record) {
  const raw = record.captured_at || record.created;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOcrEligible(record, settings) {
  if (!settings.enabled) return false;
  if (!(settings.apiKey || "").trim()) return false;
  const since = settings.ocrEnabledSince;
  if (!since) return true;
  const created = recordCreatedAt(record);
  if (!created) return true;
  return created.getTime() >= new Date(since).getTime();
}

/** Simple average-hash style fingerprint (8x8) for duplicate hints. */
async function computePhash(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length;

  let bits = "";
  for (let i = 0; i < data.length; i++) {
    bits += data[i] >= avg ? "1" : "0";
  }
  return createHash("sha256").update(bits).digest("hex").slice(0, 16);
}

async function extractColors(buffer) {
  const { dominant } = await sharp(buffer).stats();
  const top = dominant
    ? [{ r: dominant.r, g: dominant.g, b: dominant.b, weight: 1 }]
    : [];
  return top;
}

async function prepareVisionImage(buffer) {
  let pipeline = sharp(buffer).rotate();
  const meta = await pipeline.metadata();
  if (meta.width && meta.width > VISION_MAX_WIDTH) {
    pipeline = pipeline.resize(VISION_MAX_WIDTH, null, {
      withoutEnlargement: true,
    });
  }
  return pipeline.jpeg({ quality: 85 }).toBuffer();
}

async function fetchSnapzillaSettings() {
  if (Date.now() - settingsCache.ts < SETTINGS_CACHE_MS) {
    return settingsCache;
  }
  try {
    const res = await pbFetch(
      "/api/collections/snapzilla_settings/records?perPage=1",
    );
    const json = await res.json();
    const item = json.items?.[0];
    const enabled = item ? item.ocr_enabled !== false : true;
    const model =
      (typeof item?.ocr_model === "string" && item.ocr_model.trim()) ||
      OPENROUTER_MODEL_DEFAULT;
    const fromDb =
      typeof item?.openrouter_api_key === "string"
        ? item.openrouter_api_key.trim()
        : "";
    const apiKey = fromDb || OPENROUTER_API_KEY_ENV;
    const ocrEnabledSince = item?.ocr_enabled_since
      ? String(item.ocr_enabled_since)
      : null;
    settingsCache = {
      enabled,
      model,
      apiKey,
      ocrEnabledSince,
      ts: Date.now(),
    };
    return settingsCache;
  } catch (err) {
    console.warn("[ocr] settings unreadable, defaults:", err.message);
    settingsCache = {
      enabled: true,
      model: OPENROUTER_MODEL_DEFAULT,
      apiKey: OPENROUTER_API_KEY_ENV,
      ocrEnabledSince: null,
      ts: Date.now(),
    };
    return settingsCache;
  }
}

async function resolveOpenRouterApiKey() {
  return (await fetchSnapzillaSettings()).apiKey;
}

async function fetchOcrModelFromServer() {
  return (await fetchSnapzillaSettings()).model;
}

const OCR_PROMPT = `Extract all readable text from this screenshot image.
Return only the extracted text, preserving line breaks and reading order.
Include UI labels, window titles, buttons, and body text.
Do not add markdown, quotes, or commentary.
If there is no readable text, reply with exactly: [empty]`;

async function runOpenRouterOcr(buffer, modelId, screenshotId = "") {
  const apiKey = await resolveOpenRouterApiKey();
  if (!apiKey) {
    return { text: "", status: "no_key" };
  }

  const model = modelId || (await fetchOcrModelFromServer());
  const jpeg = await prepareVisionImage(buffer);
  const b64 = jpeg.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  const requestPayload = {
    model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: "[jpeg base64 omitted]" } },
        ],
      },
    ],
    _meta: { image_bytes: jpeg.length, screenshot_id: screenshotId },
  };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/s4ndyp/snapzilla",
        "X-Title": "Snapzilla Analyzer",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    const rawText = await res.text();
    const duration_ms = Date.now() - started;

    if (!res.ok) {
      await writeOcrLog({
        screenshot_id: screenshotId,
        phase: "openrouter",
        model,
        ok: false,
        request_json: JSON.stringify(requestPayload),
        response_json: rawText.slice(0, 8000),
        error: `${res.status} ${rawText.slice(0, 500)}`,
        duration_ms,
      });
      throw new Error(`${res.status}: ${rawText.slice(0, 400)}`);
    }

    const json = JSON.parse(rawText);
    const safeResponse = {
      id: json.id,
      model: json.model,
      usage: json.usage,
      content: json.choices?.[0]?.message?.content?.slice?.(0, 5000),
    };
    await writeOcrLog({
      screenshot_id: screenshotId,
      phase: "openrouter",
      model,
      ok: true,
      request_json: JSON.stringify(requestPayload),
      response_json: JSON.stringify(safeResponse),
      duration_ms,
    });

    const raw =
      typeof json.choices?.[0]?.message?.content === "string"
        ? json.choices[0].message.content.trim()
        : "";
    if (!raw || raw === "[empty]") {
      return { text: "", status: "empty" };
    }
    return {
      text: raw.slice(0, OCR_TEXT_MAX),
      status: "done",
    };
  } catch (err) {
    if (!(err.message || "").includes(":")) {
      await writeOcrLog({
        screenshot_id: screenshotId,
        phase: "openrouter",
        model,
        ok: false,
        request_json: JSON.stringify(requestPayload),
        error: err.message,
        duration_ms: Date.now() - started,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runOcrForRecord(record, buffer, settings) {
  if (!settings.enabled) return { text: "", status: "skipped" };
  if (!(settings.apiKey || "").trim()) return { text: "", status: "no_key" };
  if (!isOcrEligible(record, settings)) {
    return { text: "", status: "not_eligible" };
  }

  try {
    const model = await fetchOcrModelFromServer();
    return await runOpenRouterOcr(buffer, model, record.id);
  } catch (err) {
    console.error(`[ocr] failed ${record.id}:`, err.message);
    return { text: "", status: "failed" };
  }
}

function appendOcrFields(body, ocrText, ocrStatus) {
  if (ocrStatus) body.append("ocr_status", ocrStatus);
  if (ocrText) body.append("ocr_text", ocrText);
}

async function patchRecord(recordId, body) {
  await pbFetch(`/api/collections/screenshots/records/${recordId}`, {
    method: "PATCH",
    body,
  });
}

async function markAnalyzeFailed(recordId, message) {
  const body = new FormData();
  body.append("analyzed", "true");
  body.append("ocr_status", "failed");
  try {
    await patchRecord(recordId, body);
  } catch (err) {
    console.error(`[analyze] could not mark failed ${recordId}:`, err.message);
  }
  await writeOcrLog({
    screenshot_id: recordId,
    phase: "analyze",
    ok: false,
    error: message,
  });
}

async function analyzeRecord(record) {
  const imageName = record.image;
  if (!imageName) return;

  const settings = await fetchSnapzillaSettings();

  try {
    const res = await pbFetch(filePath(record, imageName));
    const buffer = Buffer.from(await res.arrayBuffer());

    const meta = await sharp(buffer).metadata();
    const phash = await computePhash(buffer);
    const colors = await extractColors(buffer);

    const ocrWillRun = isOcrEligible(record, settings);
    let initialOcrStatus = "skipped";
    if (ocrWillRun) initialOcrStatus = "pending";
    else if (!(settings.apiKey || "").trim()) initialOcrStatus = "no_key";
    else if (!settings.enabled) initialOcrStatus = "skipped";
    else initialOcrStatus = "not_eligible";

    const body = new FormData();
    body.append("width", String(meta.width || 0));
    body.append("height", String(meta.height || 0));
    body.append("file_size", String(buffer.length));
    body.append("phash", phash);
    body.append("colors", JSON.stringify(colors));
    body.append("analyzed", "true");
    body.append("ocr_status", initialOcrStatus);
    if (!record.captured_at) {
      body.append("captured_at", new Date().toISOString());
    }

    await patchRecord(record.id, body);

    let ocrText = "";
    let ocrStatus = initialOcrStatus;

    if (ocrWillRun) {
      const ocrResult = await runOcrForRecord(record, buffer, settings);
      ocrText = ocrResult.text;
      ocrStatus = ocrResult.status;
      const ocrBody = new FormData();
      appendOcrFields(ocrBody, ocrText, ocrStatus);
      await patchRecord(record.id, ocrBody);
    }

    await writeOcrLog({
      screenshot_id: record.id,
      phase: "analyze",
      model: settings.model,
      ok: true,
      request_json: JSON.stringify({
        eligible: ocrWillRun,
        ocr_enabled_since: settings.ocrEnabledSince,
        created: record.created,
      }),
      response_json: JSON.stringify({
        ocr_status: ocrStatus,
        ocr_chars: ocrText.length,
        width: meta.width,
        height: meta.height,
      }),
    });

    const ocrHint = ocrText
      ? ` ocr=${ocrText.length} chars (${ocrStatus})`
      : ocrStatus
        ? ` ocr=${ocrStatus}`
        : "";
    console.log(
      `[analyze] ${record.id} ${meta.width}x${meta.height} phash=${phash}${ocrHint}`,
    );
  } catch (err) {
    console.error(`[analyze] failed ${record.id}:`, err.message);
    await markAnalyzeFailed(record.id, err.message);
  }
}

async function pollOnce() {
  const pendingFilter = encodeURIComponent("analyzed != true");
  const res = await pbFetch(
    `/api/collections/screenshots/records?perPage=5&filter=${pendingFilter}&sort=-captured_at`,
  );
  const json = await res.json();
  for (const item of json.items || []) {
    await analyzeRecord(item);
  }
}

const POLL_ERROR_LOG_MS = 60_000;
let lastPollErrorLog = { message: "", ts: 0 };

async function logPollError(message) {
  const now = Date.now();
  if (
    message === lastPollErrorLog.message &&
    now - lastPollErrorLog.ts < POLL_ERROR_LOG_MS
  ) {
    return;
  }
  lastPollErrorLog = { message, ts: now };
  await writeOcrLog({ phase: "poll", ok: false, error: message });
}

async function main() {
  console.log(`Snapzilla analyzer → ${PB} (poll ${POLL_MS}ms)`);
  const { model, apiKey, ocrEnabledSince } = await fetchSnapzillaSettings();
  await writeOcrLog({
    phase: "analyzer-start",
    model,
    ok: true,
    response_json: JSON.stringify({
      key: apiKey ? "set" : "missing",
      ocr_enabled_since: ocrEnabledSince,
      poll_ms: POLL_MS,
    }),
  });
  if (apiKey) {
    const source = apiKey === OPENROUTER_API_KEY_ENV ? "env" : "database";
    console.log(
      `[ocr] OpenRouter active=${model} key=${source} since=${ocrEnabledSince || "(any)"}`,
    );
  } else {
    console.log(
      "[ocr] disabled — geen API-key (GUI onder Model … of OPENROUTER_API_KEY in .env)",
    );
  }
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[poll]", err.message);
      await logPollError(err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
