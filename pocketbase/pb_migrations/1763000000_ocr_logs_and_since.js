/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("snapzilla_settings");
    try {
      settings.fields.add(
        new Field({
          name: "ocr_enabled_since",
          type: "date",
          required: false,
        }),
      );
      app.save(settings);
    } catch {
      /* field may already exist */
    }

    let createLogs = true;
    try {
      app.findCollectionByNameOrId("ocr_logs");
      createLogs = false;
    } catch {
      /* create below */
    }

    if (createLogs) {
    const logs = new Collection({
      name: "ocr_logs",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "screenshot_id",
          type: "text",
          required: false,
          max: 40,
        },
        {
          name: "phase",
          type: "text",
          required: false,
          max: 40,
        },
        {
          name: "model",
          type: "text",
          required: false,
          max: 160,
        },
        {
          name: "success",
          type: "bool",
          required: false,
        },
        {
          name: "request_json",
          type: "text",
          required: false,
          max: 12000,
        },
        {
          name: "response_json",
          type: "text",
          required: false,
          max: 50000,
        },
        {
          name: "error_message",
          type: "text",
          required: false,
          max: 2000,
        },
        {
          name: "duration_ms",
          type: "number",
          required: false,
          min: 0,
        },
      ],
    });
    app.save(logs);
    }

    try {
      const records = app.findRecordsByFilter("snapzilla_settings", "id != ''");
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      for (const record of records) {
        if (!record.get("ocr_enabled_since")) {
          record.set("ocr_enabled_since", now);
          app.save(record);
        }
      }
    } catch {
      /* ignore */
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("ocr_logs"));
    } catch {
      /* ignore */
    }
    const settings = app.findCollectionByNameOrId("snapzilla_settings");
    try {
      settings.fields.removeByName("ocr_enabled_since");
      app.save(settings);
    } catch {
      /* ignore */
    }
  },
);
