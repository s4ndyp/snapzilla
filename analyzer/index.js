import sharp from "sharp";
import { createHash } from "crypto";

const PB = (process.env.POCKETBASE_URL || "http://pocketbase:8090").replace(
  /\/$/,
  "",
);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;
const OCR_URL = (process.env.OCR_SERVICE_URL || "").replace(/\/$/, "");
const OCR_ENGINE = process.env.OCR_ENGINE || "tesseract";
const OCR_LANG = process.env.OCR_LANG || "nld+eng";
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS) || 120_000;
const OCR_MAX_WIDTH = Number(process.env.OCR_MAX_WIDTH) || 2000;
const OCR_TEXT_MAX = 50_000;
const SETTINGS_CACHE_MS = 3000;

/** @type {{ value: boolean, ts: number }} */
let ocrEnabledCache = { value: true, ts: 0 };

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

/** Downscale and normalize for OCR API (10MB limit). */
async function prepareOcrImage(buffer) {
  let pipeline = sharp(buffer).rotate();
  const meta = await pipeline.metadata();
  if (meta.width && meta.width > OCR_MAX_WIDTH) {
    pipeline = pipeline.resize(OCR_MAX_WIDTH, null, {
      withoutEnlargement: true,
    });
  }
  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

async function fetchOcrEnabledFromServer() {
  if (Date.now() - ocrEnabledCache.ts < SETTINGS_CACHE_MS) {
    return ocrEnabledCache.value;
  }
  try {
    const res = await pbFetch(
      "/api/collections/snapzilla_settings/records?perPage=1",
    );
    const json = await res.json();
    const item = json.items?.[0];
    const enabled = item ? item.ocr_enabled !== false : true;
    ocrEnabledCache = { value: enabled, ts: Date.now() };
    return enabled;
  } catch (err) {
    console.warn("[ocr] settings unreadable, default on:", err.message);
    ocrEnabledCache = { value: true, ts: Date.now() };
    return true;
  }
}

async function runOcr(buffer) {
  if (!OCR_URL) return "";

  const ocrBuffer = await prepareOcrImage(buffer);
  const form = new FormData();
  form.append(
    "image",
    new Blob([ocrBuffer], { type: "image/png" }),
    "screenshot.png",
  );
  form.append("engine", OCR_ENGINE);
  if (OCR_LANG) form.append("lang", OCR_LANG);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch(`${OCR_URL}/`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const text = typeof json.text === "string" ? json.text.trim() : "";
    return text.slice(0, OCR_TEXT_MAX);
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeRecord(record) {
  const imageName = record.image;
  if (!imageName) return;

  const res = await pbFetch(fileUrl(record, imageName));
  const buffer = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(buffer).metadata();
  const phash = await computePhash(buffer);
  const colors = await extractColors(buffer);

  let ocrText = "";
  if (OCR_URL && (await fetchOcrEnabledFromServer())) {
    try {
      ocrText = await runOcr(buffer);
    } catch (err) {
      console.error(`[ocr] failed ${record.id}:`, err.message);
    }
  }

  const body = new FormData();
  body.append("width", String(meta.width || 0));
  body.append("height", String(meta.height || 0));
  body.append("file_size", String(buffer.length));
  body.append("phash", phash);
  body.append("colors", JSON.stringify(colors));
  body.append("analyzed", "true");
  if (ocrText) {
    body.append("ocr_text", ocrText);
  }
  if (!record.captured_at) {
    body.append("captured_at", new Date().toISOString());
  }

  await pbFetch(`/api/collections/screenshots/records/${record.id}`, {
    method: "PATCH",
    body,
  });

  const ocrHint = ocrText
    ? ` ocr=${ocrText.length} chars`
    : OCR_URL
      ? " ocr=—"
      : "";
  console.log(
    `[analyze] ${record.id} ${meta.width}x${meta.height} phash=${phash}${ocrHint}`,
  );
}

async function pollOnce() {
  const q = encodeURIComponent("analyzed != true");
  const res = await pbFetch(
    `/api/collections/screenshots/records?perPage=5&filter=${q}&sort=-created`,
  );
  const json = await res.json();
  for (const item of json.items || []) {
    try {
      await analyzeRecord(item);
    } catch (err) {
      console.error(`[analyze] failed ${item.id}:`, err.message);
    }
  }
}

async function main() {
  console.log(`Snapzilla analyzer → ${PB} (poll ${POLL_MS}ms)`);
  if (OCR_URL) {
    console.log(
      `[ocr] ${OCR_URL} engine=${OCR_ENGINE} lang=${OCR_LANG || "(default)"}`,
    );
  } else {
    console.log("[ocr] disabled (set OCR_SERVICE_URL to enable)");
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
