/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("snapzilla_settings");
    try {
      collection.fields.add(
        new Field({
          name: "ocr_stats_archive",
          type: "json",
          required: false,
        }),
      );
      app.save(collection);
    } catch {
      /* already exists */
    }
  },
  (app) => {
    /* forward-only */
  },
);
