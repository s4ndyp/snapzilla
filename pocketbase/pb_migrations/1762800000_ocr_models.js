/// <reference path="../pb_data/types.d.ts" />
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_MODELS = [
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "google/gemini-2.5-flash-preview", name: "Gemini 2.5 Flash (preview)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
  { id: "qwen/qwen-2.5-vl-72b-instruct", name: "Qwen 2.5 VL 72B" },
];

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("snapzilla_settings");
    collection.fields.add(
      new Field({
        name: "ocr_model",
        type: "text",
        required: false,
        max: 160,
      }),
    );
    collection.fields.add(
      new Field({
        name: "ocr_models",
        type: "json",
        required: false,
      }),
    );
    app.save(collection);

    try {
      const records = app.findRecordsByFilter(
        "snapzilla_settings",
        "id != ''",
      );
      for (const record of records) {
        if (!record.get("ocr_model")) {
          record.set("ocr_model", DEFAULT_MODEL);
        }
        const existing = record.get("ocr_models");
        if (!existing || (Array.isArray(existing) && existing.length === 0)) {
          record.set("ocr_models", DEFAULT_MODELS);
        }
        app.save(record);
      }
    } catch {
      /* no records yet */
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("snapzilla_settings");
    try {
      collection.fields.removeByName("ocr_model");
      collection.fields.removeByName("ocr_models");
      app.save(collection);
    } catch {
      /* ignore */
    }
  },
);
