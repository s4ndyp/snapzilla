/// <reference path="../pb_data/types.d.ts" />
/** Repair servers where 176300 failed after creating ocr_logs with field "ok". */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ocr_logs");
    } catch {
      return;
    }
    if (collection.fields.getByName("success")) {
      return;
    }
    if (!collection.fields.getByName("ok")) {
      return;
    }
    collection.fields.add(
      new Field({
        name: "success",
        type: "bool",
        required: false,
      }),
    );
    app.save(collection);
    try {
      const records = app.findRecordsByFilter("ocr_logs", "id != ''");
      for (const record of records) {
        const v = record.get("ok");
        if (v === true || v === false) {
          record.set("success", v);
          app.save(record);
        }
      }
    } catch {
      /* ignore */
    }
    try {
      collection.fields.removeByName("ok");
      app.save(collection);
    } catch {
      /* ignore */
    }
  },
  (app) => {
    /* forward-only repair */
  },
);
