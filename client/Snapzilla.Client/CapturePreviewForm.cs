namespace Snapzilla.Client;

sealed class CapturePreviewForm : Form
{
    static readonly (Color Color, string Title)[] EditorColors =
    [
        (Color.FromArgb(255, 107, 159, 255), "Blauw"),
        (Color.FromArgb(255, 236, 72, 153), "Roze"),
        (Color.FromArgb(255, 239, 68, 68), "Rood"),
        (Color.FromArgb(255, 34, 197, 94), "Groen"),
        (Color.FromArgb(255, 251, 191, 36), "Geel"),
        (Color.FromArgb(255, 255, 255, 255), "Wit"),
    ];

    readonly string _captureMode;
    readonly UploadService _upload;
    readonly ServerCatalogService _catalog;
    readonly ImageEditorControl _editor;
    readonly Label _status;
    readonly TextBox _tagsBox;
    readonly TextBox _albumBox;
    readonly Button _uploadBtn;
    readonly Button _saveBtn;
    readonly AutocompleteOverlay _suggestions;
    readonly Dictionary<EditTool, Button> _toolButtons = new();
    readonly List<Button> _colorChips = new();

    public CapturePreviewForm(byte[] png, string captureMode, UploadService upload, AppConfig config)
    {
        _captureMode = captureMode;
        _upload = upload;
        _catalog = new ServerCatalogService(config);
        _editor = new ImageEditorControl { Dock = DockStyle.Fill };
        _editor.LoadPng(png);
        _suggestions = new AutocompleteOverlay(this);

        Text = "Snapzilla — bewerken & opslaan";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(800, 560);
        Size = new Size(1100, 720);
        KeyPreview = true;
        DarkTheme.Apply(this);

        var tools = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(8, 6, 8, 6),
            BackColor = DarkTheme.BgElevated,
        };

        AddToolButton(tools, "Pen", EditTool.Pen);
        AddToolButton(tools, "Marker", EditTool.Highlight);
        AddToolButton(tools, "Rechthoek", EditTool.Rectangle);
        AddToolButton(tools, "Pijl", EditTool.Arrow);
        AddToolButton(tools, "Tekst", EditTool.Text);
        AddToolButton(tools, "Bijsnijden", EditTool.Crop);

        var undoBtn = new Button { Text = "Ongedaan", AutoSize = true, Margin = new Padding(12, 0, 0, 0) };
        DarkTheme.StyleSecondary(undoBtn);
        undoBtn.Click += (_, _) => _editor.Undo();
        tools.Controls.Add(undoBtn);

        tools.Controls.Add(new Panel { Width = 12, Height = 1 });

        foreach (var (color, title) in EditorColors)
        {
            var chip = new Button
            {
                Text = "",
                BackColor = color,
                Margin = new Padding(0, 4, 0, 0),
            };
            DarkTheme.StyleColorChip(chip, color == EditorColors[0].Color);
            chip.Click += (_, _) => SelectColor(chip, color);
            chip.Tag = color;
            _colorChips.Add(chip);
            tools.Controls.Add(chip);
            chip.AccessibleName = title;
        }

        SelectTool(EditTool.Pen);

        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 128, Padding = new Padding(8) };

        var tagsLabel = new Label { Text = "Tags (komma-gescheiden)", AutoSize = true, Location = new Point(8, 8) };
        DarkTheme.StyleLabel(tagsLabel);
        _tagsBox = new TextBox { Location = new Point(8, 28), Width = 420 };
        DarkTheme.StyleInput(_tagsBox);
        WireAutocomplete(_tagsBox, isTags: true);

        var albumLabel = new Label { Text = "Album", AutoSize = true, Location = new Point(8, 58) };
        DarkTheme.StyleLabel(albumLabel);
        _albumBox = new TextBox { Location = new Point(8, 78), Width = 420, PlaceholderText = "Optioneel — typ om te zoeken" };
        DarkTheme.StyleInput(_albumBox);
        WireAutocomplete(_albumBox, isTags: false);

        _status = new Label
        {
            Location = new Point(440, 82),
            AutoSize = true,
            Text = $"Modus: {captureMode}",
        };
        DarkTheme.StyleLabel(_status);

        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Right,
            Width = 360,
            Padding = new Padding(0, 44, 0, 0),
        };

        var closeBtn = new Button { Text = "Sluiten", AutoSize = true };
        DarkTheme.StyleSecondary(closeBtn);
        closeBtn.Click += (_, _) => Close();

        _saveBtn = new Button { Text = "Lokaal opslaan", AutoSize = true, Margin = new Padding(8, 0, 0, 0) };
        DarkTheme.StyleSecondary(_saveBtn);
        _saveBtn.Click += (_, _) => SaveLocally();

        _uploadBtn = new Button { Text = "Upload naar server", AutoSize = true, Margin = new Padding(8, 0, 0, 0) };
        DarkTheme.StyleSecondary(_uploadBtn);
        _uploadBtn.Click += async (_, _) => await UploadAsync();

        buttons.Controls.AddRange([closeBtn, _saveBtn, _uploadBtn]);

        bottom.Controls.AddRange([tagsLabel, _tagsBox, albumLabel, _albumBox, _status, buttons]);

        Controls.Add(_editor);
        Controls.Add(bottom);
        Controls.Add(tools);

        KeyDown += (_, e) =>
        {
            if (_suggestions.HandlePreviewKey(e.KeyCode))
                return;
            if (e.KeyCode == Keys.Escape)
                Close();
        };

        Shown += async (_, _) => await LoadCatalogAsync();
        Deactivate += (_, _) => _suggestions.Hide();

        ClientLog.Info($"Preview/editor geopend ({captureMode}, {png.Length} bytes)");
    }

    void AddToolButton(FlowLayoutPanel tools, string text, EditTool tool)
    {
        var b = new Button { Text = text, AutoSize = true, Margin = new Padding(0, 0, 6, 0) };
        DarkTheme.StyleSecondary(b);
        b.Click += (_, _) => SelectTool(tool);
        _toolButtons[tool] = b;
        tools.Controls.Add(b);
    }

    void SelectTool(EditTool tool)
    {
        _editor.CurrentTool = tool;
        foreach (var (t, btn) in _toolButtons)
        {
            if (t == tool)
                DarkTheme.StyleToolActive(btn);
            else
                DarkTheme.StyleSecondary(btn);
        }
    }

    void SelectColor(Button chip, Color color)
    {
        _editor.StrokeColor = color;
        foreach (var c in _colorChips)
            DarkTheme.StyleColorChip(c, ReferenceEquals(c, chip));
    }

    void WireAutocomplete(TextBox box, bool isTags)
    {
        box.TextChanged += (_, _) => UpdateSuggestions(box, isTags);
        box.KeyDown += (_, e) =>
        {
            if (_suggestions.HandlePreviewKey(e.KeyCode))
                e.SuppressKeyPress = true;
        };
        box.LostFocus += (_, _) =>
        {
            BeginInvoke(() =>
            {
                if (!_suggestions.ContainsFocus)
                    _suggestions.Hide();
            });
        };
    }

    void UpdateSuggestions(TextBox box, bool isTags)
    {
        var query = isTags ? CurrentTagSegment(box.Text) : box.Text.Trim();
        if (query.Length < 2)
        {
            _suggestions.Hide();
            return;
        }

        IEnumerable<string> source = isTags ? _catalog.Tags : _catalog.Albums.Select(a => a.Name);
        var matches = source
            .Where(s => s.Contains(query, StringComparison.OrdinalIgnoreCase))
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

        _suggestions.ShowBelow(
            box,
            matches,
            pick =>
            {
                if (isTags)
                    ApplyTagPick(box, pick);
                else
                    box.Text = pick;
            });
    }

    static string CurrentTagSegment(string text)
    {
        var lastComma = text.LastIndexOf(',');
        var segment = lastComma >= 0 ? text[(lastComma + 1)..] : text;
        return segment.TrimStart();
    }

    static void ApplyTagPick(TextBox box, string pick)
    {
        var text = box.Text;
        var lastComma = text.LastIndexOf(',');
        var prefix = lastComma >= 0 ? text[..(lastComma + 1)] + " " : "";
        box.Text = prefix + pick + ", ";
        box.SelectionStart = box.Text.Length;
    }

    async Task LoadCatalogAsync()
    {
        _status.Text = "Tags & albums laden…";
        try
        {
            await _catalog.RefreshAsync();
            _status.Text = $"Modus: {_captureMode}";
        }
        catch (Exception ex)
        {
            ClientLog.Error("Catalogus laden mislukt", ex);
            _status.Text = $"Modus: {_captureMode} (catalogus offline)";
        }
    }

    string[] ParseTags() =>
        _tagsBox.Text
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    async Task UploadAsync()
    {
        SetBusy(true);
        _status.Text = "Uploaden…";
        try
        {
            var png = _editor.ExportPng();
            var albumId = _catalog.ResolveAlbumId(_albumBox.Text);
            await _upload.UploadAsync(
                png,
                _captureMode,
                tags: ParseTags(),
                albumId: albumId);
            _status.Text = "Upload geslaagd.";
            ClientLog.Info($"Upload geslaagd ({_captureMode})");
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            _status.Text = "Upload mislukt — zie logboek.";
            ClientLog.Error("Upload mislukt vanuit preview", ex);
            MessageBox.Show(
                this,
                $"{ex.Message}{Environment.NewLine}{Environment.NewLine}Details staan in het logboek.",
                "Upload mislukt",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        finally
        {
            SetBusy(false);
        }
    }

    void SaveLocally()
    {
        var defaultName = $"Snapzilla_{DateTime.Now:yyyy-MM-dd_HHmmss}.png";
        using var dlg = new SaveFileDialog
        {
            Filter = "PNG (*.png)|*.png",
            FileName = defaultName,
            Title = "Screenshot lokaal opslaan",
            AddExtension = true,
            DefaultExt = "png",
        };

        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            File.WriteAllBytes(dlg.FileName, _editor.ExportPng());
            _status.Text = $"Opgeslagen: {dlg.FileName}";
            ClientLog.Info($"Lokaal opgeslagen: {dlg.FileName}");
        }
        catch (Exception ex)
        {
            ClientLog.Error("Lokaal opslaan mislukt", ex);
            MessageBox.Show(this, ex.Message, "Opslaan mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void SetBusy(bool busy)
    {
        _uploadBtn.Enabled = !busy;
        _saveBtn.Enabled = !busy;
        UseWaitCursor = busy;
    }
}
