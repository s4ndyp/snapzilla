/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("snapzilla_settings");
    collection.fields.add(
      new Field({
        name: "openrouter_api_key",
        type: "text",
        required: false,
        max: 240,
      }),
    );
    collection.fields.add(
      new Field({
        name: "openrouter_api_key_tail",
        type: "text",
        required: false,
        max: 8,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("snapzilla_settings");
    try {
      collection.fields.removeByName("openrouter_api_key");
      collection.fields.removeByName("openrouter_api_key_tail");
      app.save(collection);
    } catch {
      /* ignore */
    }
  },
);
