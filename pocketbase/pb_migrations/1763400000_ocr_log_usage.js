/// <reference path="../pb_data/types.d.ts" />
const NUMBER_FIELDS = ["prompt_tokens", "completion_tokens", "total_tokens", "cost"];

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ocr_logs");
    } catch {
      return;
    }
    let changed = false;
    for (const name of NUMBER_FIELDS) {
      if (collection.fields.getByName(name)) continue;
      collection.fields.add(
        new Field({ name, type: "number", required: false, min: 0 }),
      );
      changed = true;
    }
    if (changed) app.save(collection);

    let records = [];
    try {
      records = app.findRecordsByFilter("ocr_logs", "response_json != ''");
    } catch {
      return;
    }
    for (const record of records) {
      try {
        const usage = JSON.parse(record.get("response_json") || "{}").usage;
        if (!usage || record.get("total_tokens")) continue;
        record.set("prompt_tokens", Number(usage.prompt_tokens) || 0);
        record.set("completion_tokens", Number(usage.completion_tokens) || 0);
        record.set("total_tokens", Number(usage.total_tokens) || 0);
        record.set("cost", Number(usage.cost) || 0);
        app.save(record);
      } catch {
        /* skip unparsable rows */
      }
    }
  },
  (app) => {
    /* forward-only */
  },
);
