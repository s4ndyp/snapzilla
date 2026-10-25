using System.Drawing;

namespace Snapzilla.Client;

sealed class CapturePreviewForm : Form
{
    readonly byte[] _png;
    readonly string _captureMode;
    readonly UploadService _upload;
    readonly PictureBox _picture;
    readonly Label _status;
    readonly Button _uploadBtn;
    readonly Button _saveBtn;

    public CapturePreviewForm(byte[] png, string captureMode, UploadService upload)
    {
        _png = png;
        _captureMode = captureMode;
        _upload = upload;

        Text = "Snapzilla — preview";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(640, 480);
        Size = new Size(960, 640);
        KeyPreview = true;

        _picture = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(24, 28, 36),
        };
        using (var ms = new MemoryStream(png))
        {
            _picture.Image = Image.FromStream(ms);
        }

        _status = new Label
        {
            Dock = DockStyle.Top,
            Height = 28,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(8, 0, 8, 0),
            Text = $"Modus: {captureMode} · {png.Length / 1024} KB",
        };

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(8),
            WrapContents = false,
        };

        var closeBtn = new Button { Text = "Sluiten", AutoSize = true };
        closeBtn.Click += (_, _) => Close();

        _saveBtn = new Button { Text = "Lokaal opslaan", AutoSize = true };
        _saveBtn.Click += (_, _) => SaveLocally();

        _uploadBtn = new Button { Text = "Upload naar server", AutoSize = true };
        _uploadBtn.Click += async (_, _) => await UploadAsync();

        buttons.Controls.Add(closeBtn);
        buttons.Controls.Add(_saveBtn);
        buttons.Controls.Add(_uploadBtn);

        Controls.Add(_picture);
        Controls.Add(buttons);
        Controls.Add(_status);

        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape)
                Close();
        };

        ClientLog.Info($"Preview geopend ({captureMode}, {_png.Length} bytes)");
    }

    async Task UploadAsync()
    {
        SetBusy(true);
        _status.Text = "Uploaden…";
        try
        {
            await _upload.UploadAsync(_png, _captureMode);
            _status.Text = "Upload geslaagd.";
            ClientLog.Info($"Upload geslaagd ({_captureMode})");
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            _status.Text = "Upload mislukt — zie logboek in instellingen.";
            ClientLog.Error("Upload mislukt vanuit preview", ex);
            MessageBox.Show(
                this,
                $"{ex.Message}{Environment.NewLine}{Environment.NewLine}Details staan in het logboek (Instellingen → Logboek openen).",
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
            File.WriteAllBytes(dlg.FileName, _png);
            _status.Text = $"Opgeslagen: {dlg.FileName}";
            ClientLog.Info($"Lokaal opgeslagen: {dlg.FileName}");
            MessageBox.Show(
                this,
                dlg.FileName,
                "Opgeslagen",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
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

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _picture.Image?.Dispose();
        base.OnFormClosed(e);
    }
}
