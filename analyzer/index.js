import sharp from "sharp";
import { createHash } from "crypto";

const PB = (process.env.POCKETBASE_URL || "http://pocketbase:8090").replace(
  /\/$/,
  "",
);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || "").trim();
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

/** @type {{ ts: number, enabled: boolean, model: string }} */
let settingsCache = {
  ts: 0,
  enabled: true,
  model: OPENROUTER_MODEL_DEFAULT,
};

async function pbFetch(path, options = {}) {
  const res = await fetch(`${PB}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res;
}

function fileUrl(record, filename) {
  return `${PB}/api/files/screenshots/${record.id}/${filename}`;
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

/** Downscale for vision API (cost + latency). */
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
    settingsCache = { enabled, model, ts: Date.now() };
    return settingsCache;
  } catch (err) {
    console.warn("[ocr] settings unreadable, defaults:", err.message);
    settingsCache = {
      enabled: true,
      model: OPENROUTER_MODEL_DEFAULT,
      ts: Date.now(),
    };
    return settingsCache;
  }
}

async function fetchOcrEnabledFromServer() {
  return (await fetchSnapzillaSettings()).enabled;
}

async function fetchOcrModelFromServer() {
  return (await fetchSnapzillaSettings()).model;
}

const OCR_PROMPT = `Extract all readable text from this screenshot image.
Return only the extracted text, preserving line breaks and reading order.
Include UI labels, window titles, buttons, and body text.
Do not add markdown, quotes, or commentary.
If there is no readable text, reply with exactly: [empty]`;

async function runOpenRouterOcr(buffer, modelId) {
  if (!OPENROUTER_API_KEY) {
    return { text: "", status: "no_key" };
  }

  const model = modelId || (await fetchOcrModelFromServer());

  const jpeg = await prepareVisionImage(buffer);
  const b64 = jpeg.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 400)}`);
    }
    const json = await res.json();
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
  } finally {
    clearTimeout(timer);
  }
}

async function runOcrForRecord(record, buffer) {
  const enabled = await fetchOcrEnabledFromServer();
  if (!enabled) return { text: "", status: "skipped" };
  if (!OPENROUTER_API_KEY) return { text: "", status: "no_key" };

  try {
    const model = await fetchOcrModelFromServer();
    return await runOpenRouterOcr(buffer, model);
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

async function analyzeRecord(record) {
  const imageName = record.image;
  if (!imageName) return;

  const res = await pbFetch(fileUrl(record, imageName));
  const buffer = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(buffer).metadata();
  const phash = await computePhash(buffer);
  const colors = await extractColors(buffer);

  const ocrWillRun =
    OPENROUTER_API_KEY && (await fetchOcrEnabledFromServer());

  const body = new FormData();
  body.append("width", String(meta.width || 0));
  body.append("height", String(meta.height || 0));
  body.append("file_size", String(buffer.length));
  body.append("phash", phash);
  body.append("colors", JSON.stringify(colors));
  body.append("analyzed", "true");
  if (ocrWillRun) {
    body.append("ocr_status", "pending");
  } else if (!OPENROUTER_API_KEY) {
    body.append("ocr_status", "no_key");
  } else {
    body.append("ocr_status", "skipped");
  }
  if (!record.captured_at) {
    body.append("captured_at", new Date().toISOString());
  }

  await patchRecord(record.id, body);

  let ocrText = "";
  let ocrStatus = ocrWillRun ? "pending" : !OPENROUTER_API_KEY ? "no_key" : "skipped";

  if (ocrWillRun) {
    const ocrResult = await runOcrForRecord(record, buffer);
    ocrText = ocrResult.text;
    ocrStatus = ocrResult.status;
    const ocrBody = new FormData();
    appendOcrFields(ocrBody, ocrText, ocrStatus);
    await patchRecord(record.id, ocrBody);
  }

  const ocrHint = ocrText
    ? ` ocr=${ocrText.length} chars (${ocrStatus})`
    : ocrStatus
      ? ` ocr=${ocrStatus}`
      : "";
  console.log(
    `[analyze] ${record.id} ${meta.width}x${meta.height} phash=${phash}${ocrHint}`,
  );
}

/** Re-run OCR on shots that were analyzed without text (OCR was off or failed). */
async function ocrBackfillRecord(record) {
  const imageName = record.image;
  if (!imageName) return;

  const pendingBody = new FormData();
  pendingBody.append("ocr_status", "pending");
  await patchRecord(record.id, pendingBody);

  const res = await pbFetch(fileUrl(record, imageName));
  const buffer = Buffer.from(await res.arrayBuffer());
  const { text: ocrText, status: ocrStatus } = await runOcrForRecord(
    record,
    buffer,
  );

  const body = new FormData();
  appendOcrFields(body, ocrText, ocrStatus);
  await patchRecord(record.id, body);

  const ocrHint = ocrText
    ? ` ocr=${ocrText.length} chars (${ocrStatus})`
    : ` ocr=${ocrStatus}`;
  console.log(`[ocr-backfill] ${record.id}${ocrHint}`);
}

async function pollOnce() {
  const pendingFilter = encodeURIComponent("analyzed != true");
  const res = await pbFetch(
    `/api/collections/screenshots/records?perPage=5&filter=${pendingFilter}&sort=-created`,
  );
  const json = await res.json();
  for (const item of json.items || []) {
    try {
      await analyzeRecord(item);
    } catch (err) {
      console.error(`[analyze] failed ${item.id}:`, err.message);
    }
  }

  if (!OPENROUTER_API_KEY || !(await fetchOcrEnabledFromServer())) return;

  const backfillFilter = encodeURIComponent(
    'analyzed = true && ocr_text = "" && (ocr_status = "" || ocr_status = "skipped" || ocr_status = "failed" || ocr_status = "no_key")',
  );
  const back = await pbFetch(
    `/api/collections/screenshots/records?perPage=2&filter=${backfillFilter}&sort=-created`,
  );
  const backJson = await back.json();
  for (const item of backJson.items || []) {
    try {
      await ocrBackfillRecord(item);
    } catch (err) {
      console.error(`[ocr-backfill] failed ${item.id}:`, err.message);
    }
  }
}

async function main() {
  console.log(`Snapzilla analyzer → ${PB} (poll ${POLL_MS}ms)`);
  if (OPENROUTER_API_KEY) {
    const { model } = await fetchSnapzillaSettings();
    console.log(
      `[ocr] OpenRouter default=${OPENROUTER_MODEL_DEFAULT} active=${model}`,
    );
  } else {
    console.log(
      "[ocr] disabled — set OPENROUTER_API_KEY in .env (screenshots worden wel geanalyseerd zonder tekst)",
    );
  }
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[poll]", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
