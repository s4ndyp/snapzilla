/// <reference path="../pb_data/types.d.ts" />
/** Collections created in migrations have no created/updated fields; sorting on them returns 400. */
const COLLECTIONS = ["screenshots", "albums", "snapzilla_settings", "ocr_logs"];

migrate(
  (app) => {
    for (const name of COLLECTIONS) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch {
        continue;
      }
      let changed = false;
      if (!collection.fields.getByName("created")) {
        collection.fields.add(
          new Field({
            name: "created",
            type: "autodate",
            onCreate: true,
            onUpdate: false,
          }),
        );
        changed = true;
      }
      if (!collection.fields.getByName("updated")) {
        collection.fields.add(
          new Field({
            name: "updated",
            type: "autodate",
            onCreate: true,
            onUpdate: true,
          }),
        );
        changed = true;
      }
      if (changed) app.save(collection);
    }
  },
  (app) => {
    /* forward-only */
  },
);
