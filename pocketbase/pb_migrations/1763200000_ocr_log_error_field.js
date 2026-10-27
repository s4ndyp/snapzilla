/// <reference path="../pb_data/types.d.ts" />
/** PocketBase list API breaks when the collection has a field named "error". */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ocr_logs");
    } catch {
      return;
    }

    let changed = false;
    if (!collection.fields.getByName?.("error_message")) {
      try {
        collection.fields.add(
          new Field({
            name: "error_message",
            type: "text",
            required: false,
            max: 2000,
          }),
        );
        changed = true;
      } catch {
        /* may exist without getByName */
      }
    }

    if (changed) {
      app.save(collection);
    }

    try {
      const records = app.findRecordsByFilter("ocr_logs", "id != ''");
      for (const record of records) {
        const legacy = record.get("error");
        if (legacy && !record.get("error_message")) {
          record.set("error_message", legacy);
          app.save(record);
        }
      }
    } catch {
      /* ignore */
    }

    try {
      collection = app.findCollectionByNameOrId("ocr_logs");
      collection.fields.removeByName("error");
      app.save(collection);
    } catch {
      /* ignore */
    }
  },
  (app) => {
    /* forward-only */
  },
);
