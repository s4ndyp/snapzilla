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
    readonly TextBox _titleBox;
    readonly TextBox _tagsBox;
    readonly TextBox _albumBox;
    readonly Button _uploadBtn;
    readonly Button _saveBtn;
    readonly Button _noOcrBtn;
    bool _skipOcr;
    readonly AutocompleteOverlay _suggestions;
    readonly Dictionary<EditTool, EditorToolButton> _toolButtons = new();
    readonly List<Button> _colorChips = new();
    readonly List<StampIconButton> _stampButtons = new();

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
        Icon = SnapzillaIcons.App;

        var tools = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            MaximumSize = new Size(1080, 88),
            Padding = new Padding(8, 6, 8, 6),
            BackColor = DarkTheme.BgElevated,
            WrapContents = true,
        };

        AddToolButton(tools, EditTool.Pen, "Pen");
        AddToolButton(tools, EditTool.Highlight, "Marker");
        AddToolButton(tools, EditTool.Rectangle, "Rechthoek");
        AddToolButton(tools, EditTool.Circle, "Cirkel");
        AddToolButton(tools, EditTool.Arrow, "Pijl");
        AddToolButton(tools, EditTool.Chain, "Lijnketting — nogmaals klikken of Esc stopt");
        AddToolButton(tools, EditTool.Text, "Tekst");
        AddToolButton(tools, EditTool.Crop, "Bijsnijden");

        tools.Controls.Add(MakeDivider());

        foreach (var (kind, label) in new (StampKind, string)[]
                 {
                     (StampKind.Cross, "Kruis"),
                     (StampKind.Check, "Vink"),
                     (StampKind.House, "Huis"),
                     (StampKind.Lamp, "Lamp"),
                     (StampKind.Computer, "Computer"),
                     (StampKind.Lightning, "Bliksem"),
                 })
        {
            var btn = new StampIconButton(kind, $"{label} — sleep diagonaal voor grootte");
            btn.Click += (_, _) => SelectStamp(kind);
            _stampButtons.Add(btn);
            tools.Controls.Add(btn);
        }

        tools.Controls.Add(MakeDivider());

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

        tools.Controls.Add(MakeDivider());

        var undoBtn = new EditorUndoButton();
        undoBtn.Click += (_, _) => _editor.Undo();
        tools.Controls.Add(undoBtn);

        var resetBtn = new Button
        {
            Text = "Herstel",
            AutoSize = true,
            Margin = new Padding(0, 0, 4, 0),
            TabStop = false,
        };
        DarkTheme.StyleSecondary(resetBtn);
        resetBtn.Click += (_, _) => _editor.ResetToOriginal();
        tools.Controls.Add(resetBtn);

        void SyncEditButtons()
        {
            var can = _editor.CanUndo;
            undoBtn.Enabled = can;
            resetBtn.Enabled = can;
        }

        _editor.EditsChanged += (_, _) => SyncEditButtons();
        SyncEditButtons();

        SelectTool(EditTool.Pen);

        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 96, Padding = new Padding(8) };

        _titleBox = new TextBox { PlaceholderText = "Optionele titel", Dock = DockStyle.Fill, Margin = new Padding(0, 0, 4, 0) };
        DarkTheme.StyleInput(_titleBox);

        _noOcrBtn = new Button
        {
            Text = "No OCR",
            AutoSize = true,
            Margin = new Padding(0, 0, 8, 0),
            TabStop = true,
        };
        DarkTheme.StyleSecondary(_noOcrBtn);
        _noOcrBtn.Click += (_, _) =>
        {
            _skipOcr = !_skipOcr;
            SyncNoOcrButton();
        };
        SyncNoOcrButton();
        _tagsBox = new TextBox { Dock = DockStyle.Fill, PlaceholderText = "werk, bug, ui", Margin = new Padding(0, 0, 8, 0) };
        DarkTheme.StyleInput(_tagsBox);
        WireAutocomplete(_tagsBox, isTags: true);
        _albumBox = new TextBox { Dock = DockStyle.Fill, PlaceholderText = "Album — typ om te zoeken", Margin = new Padding(0, 0, 8, 0) };
        DarkTheme.StyleInput(_albumBox);
        WireAutocomplete(_albumBox, isTags: false);

        _status = new Label { AutoSize = true, Text = $"Modus: {captureMode}", Anchor = AnchorStyles.Left | AnchorStyles.Top };
        DarkTheme.StyleLabel(_status);

        var closeBtn = new Button { Text = "Sluiten", AutoSize = true, Anchor = AnchorStyles.Right | AnchorStyles.Top };
        DarkTheme.StyleSecondary(closeBtn);
        closeBtn.Click += (_, _) => Close();

        _saveBtn = new Button { Text = "Lokaal opslaan", AutoSize = true, Margin = new Padding(8, 0, 0, 0), Anchor = AnchorStyles.Right | AnchorStyles.Top };
        DarkTheme.StyleSecondary(_saveBtn);
        _saveBtn.Click += (_, _) => SaveLocally();

        _uploadBtn = new Button { Text = "Upload naar server", AutoSize = true, Margin = new Padding(8, 0, 0, 0), Anchor = AnchorStyles.Right | AnchorStyles.Top };
        DarkTheme.StylePrimary(_uploadBtn);
        _uploadBtn.Click += async (_, _) => await UploadAsync();

        var metaRow = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 34,
            ColumnCount = 11,
            RowCount = 1,
            Padding = new Padding(0),
        };
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 22f));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 22f));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 18f));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 10f));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        metaRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        metaRow.Controls.Add(MakeMetaLabel("Titel"), 0, 0);
        metaRow.Controls.Add(_titleBox, 1, 0);
        metaRow.Controls.Add(_noOcrBtn, 2, 0);
        metaRow.Controls.Add(MakeMetaLabel("Tags"), 3, 0);
        metaRow.Controls.Add(_tagsBox, 4, 0);
        metaRow.Controls.Add(MakeMetaLabel("Album"), 5, 0);
        metaRow.Controls.Add(_albumBox, 6, 0);
        metaRow.Controls.Add(_status, 7, 0);
        metaRow.Controls.Add(_uploadBtn, 8, 0);
        metaRow.Controls.Add(_saveBtn, 9, 0);
        metaRow.Controls.Add(closeBtn, 10, 0);

        bottom.Controls.Add(metaRow);

        Controls.Add(_editor);
        Controls.Add(bottom);
        Controls.Add(tools);

        KeyDown += (_, e) =>
        {
            if (_suggestions.HandlePreviewKey(e.KeyCode))
                return;
            if (e.KeyCode == Keys.Escape && _editor.CurrentTool == EditTool.Chain && _editor.HasChainAnchor)
            {
                _editor.EndChain();
                e.Handled = true;
                return;
            }

            if (e.KeyCode == Keys.Escape)
                Close();
        };

        Shown += async (_, _) => await LoadCatalogAsync();
        Deactivate += (_, _) => _suggestions.Hide();

        ClientLog.Info($"Preview/editor geopend ({captureMode}, {png.Length} bytes)");
    }

    void SyncNoOcrButton()
    {
        if (_skipOcr)
        {
            DarkTheme.StyleToolActive(_noOcrBtn);
            _noOcrBtn.Text = "No OCR ✓";
        }
        else
        {
            DarkTheme.StyleSecondary(_noOcrBtn);
            _noOcrBtn.Text = "No OCR";
        }
    }

    static Label MakeMetaLabel(string text)
    {
        var label = new Label
        {
            Text = text,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Padding = new Padding(0, 6, 6, 0),
        };
        DarkTheme.StyleLabel(label);
        return label;
    }

    static Panel MakeDivider() =>
        new()
        {
            Width = 1,
            Height = 26,
            Margin = new Padding(6, 4, 6, 0),
            BackColor = DarkTheme.Border,
        };

    void AddToolButton(FlowLayoutPanel tools, EditTool tool, string accessibleName)
    {
        var b = new EditorToolButton(tool, accessibleName);
        b.Click += (_, _) =>
        {
            if (tool == EditTool.Chain && _editor.CurrentTool == EditTool.Chain && _editor.HasChainAnchor)
            {
                _editor.EndChain();
                return;
            }

            SelectTool(tool);
        };
        _toolButtons[tool] = b;
        tools.Controls.Add(b);
    }

    void SelectTool(EditTool tool)
    {
        if (tool != EditTool.Chain)
            _editor.EndChain();
        _editor.CurrentTool = tool;
        foreach (var (t, btn) in _toolButtons)
        {
            if (t == tool)
                DarkTheme.StyleToolActive(btn);
            else
                DarkTheme.StyleSecondary(btn);
            btn.ForeColor = t == tool ? DarkTheme.FilterPinkText : DarkTheme.Text;
            btn.Invalidate();
        }

        foreach (var btn in _stampButtons)
        {
            if (tool == EditTool.Stamp && _editor.CurrentStamp == btn.Kind)
            {
                DarkTheme.StyleToolActive(btn);
                btn.ForeColor = DarkTheme.FilterPinkText;
            }
            else
            {
                DarkTheme.StyleSecondary(btn);
                btn.ForeColor = DarkTheme.Text;
            }

            btn.Invalidate();
        }
    }

    void SelectStamp(StampKind kind)
    {
        _editor.CurrentStamp = kind;
        SelectTool(EditTool.Stamp);
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
            var title = _titleBox.Text.Trim();
            await _upload.UploadAsync(
                png,
                _captureMode,
                title: title.Length > 0 ? title : null,
                tags: ParseTags(),
                albumId: albumId,
                skipOcr: _skipOcr);
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
