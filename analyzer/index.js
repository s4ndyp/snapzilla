import sharp from "sharp";
import { createHash } from "crypto";

const PB = (process.env.POCKETBASE_URL || "http://pocketbase:8090").replace(
  /\/$/,
  "",
);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;

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

async function analyzeRecord(record) {
  const imageName = record.image;
  if (!imageName) return;

  const res = await pbFetch(fileUrl(record, imageName));
  const buffer = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(buffer).metadata();
  const phash = await computePhash(buffer);
  const colors = await extractColors(buffer);

  const body = new FormData();
  body.append("width", String(meta.width || 0));
  body.append("height", String(meta.height || 0));
  body.append("file_size", String(buffer.length));
  body.append("phash", phash);
  body.append("colors", JSON.stringify(colors));
  body.append("analyzed", "true");
  if (!record.captured_at) {
    body.append("captured_at", new Date().toISOString());
  }

  await pbFetch(`/api/collections/screenshots/records/${record.id}`, {
    method: "PATCH",
    body,
  });

  console.log(
    `[analyze] ${record.id} ${meta.width}x${meta.height} phash=${phash}`,
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
