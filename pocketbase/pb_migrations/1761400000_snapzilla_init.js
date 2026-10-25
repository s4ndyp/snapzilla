/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const albums = new Collection({
      name: "albums",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
          max: 200,
        },
        {
          name: "description",
          type: "text",
          required: false,
          max: 2000,
        },
        {
          name: "color",
          type: "text",
          required: false,
          max: 20,
        },
      ],
    });
    app.save(albums);

    const screenshots = new Collection({
      name: "screenshots",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "image",
          type: "file",
          required: true,
          maxSelect: 1,
          maxSize: 52428800,
          mimeTypes: [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
            "image/gif",
            "image/bmp",
          ],
          thumbs: ["320x240f", "800x600f"],
        },
        {
          name: "title",
          type: "text",
          required: false,
          max: 500,
        },
        {
          name: "captured_at",
          type: "date",
          required: false,
        },
        {
          name: "client_id",
          type: "text",
          required: false,
          max: 120,
        },
        {
          name: "client_name",
          type: "text",
          required: false,
          max: 200,
        },
        {
          name: "hostname",
          type: "text",
          required: false,
          max: 200,
        },
        {
          name: "tags",
          type: "json",
          required: false,
        },
        {
          name: "width",
          type: "number",
          required: false,
          min: 0,
        },
        {
          name: "height",
          type: "number",
          required: false,
          min: 0,
        },
        {
          name: "file_size",
          type: "number",
          required: false,
          min: 0,
        },
        {
          name: "capture_mode",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["fullscreen", "region", "window", "paste", "upload"],
        },
        {
          name: "phash",
          type: "text",
          required: false,
          max: 64,
        },
        {
          name: "ocr_text",
          type: "text",
          required: false,
          max: 50000,
        },
        {
          name: "colors",
          type: "json",
          required: false,
        },
        {
          name: "starred",
          type: "bool",
          required: false,
        },
        {
          name: "notes",
          type: "text",
          required: false,
          max: 5000,
        },
        {
          name: "analyzed",
          type: "bool",
          required: false,
        },
        {
          name: "monitor_index",
          type: "number",
          required: false,
        },
        {
          name: "album",
          type: "relation",
          required: false,
          collectionId: albums.id,
          maxSelect: 1,
        },
      ],
      indexes: [
        "CREATE INDEX idx_screenshots_captured ON screenshots (captured_at)",
        "CREATE INDEX idx_screenshots_phash ON screenshots (phash)",
        "CREATE INDEX idx_screenshots_client ON screenshots (client_id)",
      ],
    });
    app.save(screenshots);

    const settings = app.settings();
    settings.meta.appName = "Snapzilla";
    app.save(settings);
  },
  (app) => {
    for (const name of ["screenshots", "albums"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch {
        /* ignore */
      }
    }
  },
);
