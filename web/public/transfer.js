// transfer.js — complete export/import van Snapzilla naar één portable zip.
// Inhoud zip:
//   manifest.json      format-info + aantallen
//   data/<coll>.json   record-arrays (alleen velden die in het schema bestaan)
//   files/<id>/<naam>  originele bestanden van screenshots
// Import is idempotent: records met een bestaande id worden overgeslagen,
// en album-relaties blijven kloppen omdat originele ids worden behouden.
// JSZip wordt als parameter meegegeven (window.JSZip in de browser, require in tests).

export const EXPORT_COLLECTIONS = [
  "albums",
  "screenshots",
  "snapzilla_settings",
  "ocr_logs",
  "ocr_stats_archive",
];

// Collecties met één file-veld: {collectie: veldnaam}
const FILE_FIELD = { screenshots: "image" };

export const FORMAT = { app: "snapzilla", format: 1 };

async function jget(url, init) {
  const res = await fetch(url, init);
  return res;
}

/** Systeemvelden die niet mee mogen als create-payload. */
const SYSTEM_KEYS = new Set(["collectionId", "collectionName", "expand"]);

function pick(record, skip = new Set()) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (SYSTEM_KEYS.has(k) || skip.has(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** Alle records van een collectie, gepagineerd. */
export async function listAllRecords(api, coll) {
  const items = [];
  let page = 1;
  for (;;) {
    const res = await jget(`${api}/collections/${coll}/records?perPage=500&page=${page}&sort=id`);
    if (!res.ok) throw new Error(`Listen van ${coll} mislukt (HTTP ${res.status})`);
    const data = await res.json();
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page++;
  }
  return items;
}

/**
 * Volledige export. Callbaar in browser én node (fetch + JSZip als param).
 * @returns {Promise<{zip: JSZip, manifest: object}>}
 */
export async function exportAll({ api, JSZip, onProgress = () => {} }) {
  const zip = new JSZip();
  const manifest = { ...FORMAT, exportedAt: new Date().toISOString(), counts: {}, collections: {} };
  const shotsWithFile = [];

  for (const coll of EXPORT_COLLECTIONS) {
    let all;
    try {
      all = await listAllRecords(api, coll);
    } catch {
      continue; // collectie bestaat niet (meer) op deze host — laat 'm weg
    }
    all = all.map((r) => pick(r));
    manifest.counts[coll] = all.length;
    manifest.collections[coll] = FILE_FIELD[coll] ? { fileField: FILE_FIELD[coll] } : {};
    zip.file(`data/${coll}.json`, JSON.stringify(all, null, 2));
    if (coll === "screenshots") shotsWithFile.push(...all);
  }

  const need = shotsWithFile.filter((r) => r.image);
  let done = 0;
  const folder = zip.folder("files");
  for (const r of need) {
    onProgress(done, need.length, r.image);
    const res = await jget(`${api}/files/screenshots/${r.id}/${encodeURIComponent(r.image)}`);
    if (!res.ok) throw new Error(`Bestand ophalen mislukt voor shot ${r.id} (${r.image}, HTTP ${res.status})`);
    folder.file(`${r.id}/${r.image}`, await res.arrayBuffer());
    done++;
  }
  onProgress(done, need.length, "klaar");

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return { zip, manifest };
}

/**
 * Import uit een export-zip. Bestaat een record-id al, dan wordt overgeslagen.
 * @param zipData  ArrayBuffer/Blob/Buffer-compatible input voor JSZip.loadAsync
 * @returns {Promise<{created:number, skipped:number, failed:Array}>}
 */
export async function importAll({ api, JSZip, zipData, onProgress = () => {} }) {
  const zip = await JSZip.loadAsync(zipData);
  const manFile = zip.file("manifest.json");
  if (!manFile) throw new Error("Geen manifest.json — dit is geen Snapzilla-export.");
  const manifest = JSON.parse(await manFile.async("string"));
  if (manifest.app !== "snapzilla") throw new Error(`Onbekend export-formaat: ${manifest.app}`);
  if ((manifest.format || 1) > FORMAT.format) throw new Error("Te nieuw exportformaat — werk Snapzilla bij.");

  const summary = { created: 0, skipped: 0, failed: [] };
  const wanted = EXPORT_COLLECTIONS.filter((c) => zip.file(`data/${c}.json`));
  const totals = [];
  for (const c of wanted) totals.push(JSON.parse(await zip.file(`data/${c}.json`).async("string")));
  const total = totals.reduce((s, a) => s + a.length, 0);
  let done = 0;

  for (let i = 0; i < wanted.length; i++) {
    const coll = wanted[i];
    for (const rec of totals[i]) {
      const label = `${coll}/${rec.id || "?"}`;
      onProgress(done, total, label);
      done++;
      try {
        const exists = await jget(`${api}/collections/${coll}/records/${rec.id}`);
        if (exists.ok) {
          summary.skipped++;
          continue;
        }
        if (exists.status !== 404) throw new Error(`Statuscheck mislukt (HTTP ${exists.status})`);

        const payload = pick(rec, FILE_FIELD[coll] ? new Set([FILE_FIELD[coll]]) : new Set());
        let res;
        if (FILE_FIELD[coll] && rec.image) {
          const zf = zip.file(`files/${rec.id}/${rec.image}`);
          if (!zf) throw new Error(`Bestand ontbreekt in zip: ${rec.image}`);
          const fd = new FormData();
          for (const [k, v] of Object.entries(payload)) {
            if (v === null || v === undefined) continue;
            fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
          }
          const blob = await zf.async("arraybuffer");
          fd.append(FILE_FIELD[coll], new File([blob], rec.image.split("/").pop() || "image.bin"));
          res = await jget(`${api}/collections/${coll}/records`, { method: "POST", body: fd });
        } else {
          res = await jget(`${api}/collections/${coll}/records`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`Aanmaken mislukt (HTTP ${res.status}): ${err.message || "onbekend"}`);
        }
        summary.created++;
      } catch (e) {
        summary.failed.push({ collectie: coll, id: rec.id, fout: String(e.message || e) });
      }
    }
  }
  onProgress(total, total, "klaar");
  return summary;
}
