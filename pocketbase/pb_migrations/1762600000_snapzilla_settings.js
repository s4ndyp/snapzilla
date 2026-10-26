/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = new Collection({
      name: "snapzilla_settings",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "ocr_enabled",
          type: "bool",
          required: false,
        },
      ],
    });
    app.save(collection);

    const record = new Record(collection);
    record.set("ocr_enabled", true);
    app.save(record);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("snapzilla_settings"));
    } catch {
      /* ignore */
    }
  },
);
