/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("screenshots");
    collection.fields.add(
      new Field({
        name: "ocr_status",
        type: "text",
        required: false,
        max: 20,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("screenshots");
    try {
      collection.fields.removeByName("ocr_status");
      app.save(collection);
    } catch {
      /* ignore */
    }
  },
);
