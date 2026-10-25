namespace Snapzilla.Client;

sealed class CapturePreviewForm : Form
{
    readonly string _captureMode;
    readonly UploadService _upload;
    readonly ImageEditorControl _editor;
    readonly Label _status;
    readonly TextBox _tagsBox;
    readonly Button _uploadBtn;
    readonly Button _saveBtn;

    public CapturePreviewForm(byte[] png, string captureMode, UploadService upload)
    {
        _captureMode = captureMode;
        _upload = upload;
        _editor = new ImageEditorControl { Dock = DockStyle.Fill };
        _editor.LoadPng(png);

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

        tools.Controls.Add(ToolBtn("Pen", () => _editor.CurrentTool = EditTool.Pen));
        tools.Controls.Add(ToolBtn("Marker", () => _editor.CurrentTool = EditTool.Highlight));
        tools.Controls.Add(ToolBtn("Rechthoek", () => _editor.CurrentTool = EditTool.Rectangle));
        tools.Controls.Add(ToolBtn("Pijl", () => _editor.CurrentTool = EditTool.Arrow));
        tools.Controls.Add(ToolBtn("Tekst", () => _editor.CurrentTool = EditTool.Text));
        tools.Controls.Add(ToolBtn("Bijsnijden", () => _editor.CurrentTool = EditTool.Crop));
        tools.Controls.Add(ToolBtn("Ongedaan", () => _editor.Undo()));

        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 96, Padding = new Padding(8) };

        var tagsLabel = new Label { Text = "Tags (komma-gescheiden)", AutoSize = true, Location = new Point(8, 8) };
        DarkTheme.StyleLabel(tagsLabel);
        _tagsBox = new TextBox { Location = new Point(8, 28), Width = 420 };
        DarkTheme.StyleInput(_tagsBox);

        _status = new Label
        {
            Location = new Point(8, 56),
            AutoSize = true,
            Text = $"Modus: {captureMode}",
        };
        DarkTheme.StyleLabel(_status);

        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Right,
            Width = 360,
            Padding = new Padding(0, 20, 0, 0),
        };

        var closeBtn = new Button { Text = "Sluiten", AutoSize = true };
        DarkTheme.StyleSecondary(closeBtn);
        closeBtn.Click += (_, _) => Close();

        _saveBtn = new Button { Text = "Lokaal opslaan", AutoSize = true, Margin = new Padding(8, 0, 0, 0) };
        DarkTheme.StyleSecondary(_saveBtn);
        _saveBtn.Click += (_, _) => SaveLocally();

        _uploadBtn = new Button { Text = "Upload naar server", AutoSize = true, Margin = new Padding(8, 0, 0, 0) };
        DarkTheme.StylePrimary(_uploadBtn);
        _uploadBtn.Click += async (_, _) => await UploadAsync();

        buttons.Controls.AddRange([closeBtn, _saveBtn, _uploadBtn]);

        bottom.Controls.AddRange([tagsLabel, _tagsBox, _status, buttons]);

        Controls.Add(_editor);
        Controls.Add(bottom);
        Controls.Add(tools);

        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape)
                Close();
        };

        DarkTheme.Apply(this);
        DarkTheme.StylePrimary(_uploadBtn);

        ClientLog.Info($"Preview/editor geopend ({captureMode}, {png.Length} bytes)");
    }

    static Button ToolBtn(string text, Action onClick)
    {
        var b = new Button { Text = text, AutoSize = true, Margin = new Padding(0, 0, 6, 0) };
        DarkTheme.StyleSecondary(b);
        b.Click += (_, _) => onClick();
        return b;
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
            await _upload.UploadAsync(png, _captureMode, tags: ParseTags());
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
