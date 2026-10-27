/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("screenshots");
    try {
      collection.fields.add(
        new Field({
          name: "skip_ocr",
          type: "bool",
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
