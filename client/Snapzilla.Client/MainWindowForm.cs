namespace Snapzilla.Client;

sealed class MainWindowForm : Form
{
    const int Pad = 16;
    const int ContentWidth = 288;

    public MainWindowForm(TrayHost host, AppConfig config)
    {
        Text = "Snapzilla";
        Icon = SnapzillaIcons.App;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(Pad * 2 + ContentWidth, 300);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        DarkTheme.Apply(this);

        var title = new Label
        {
            Text = "Screenshot hub",
            Font = new Font(Font.FontFamily, 14, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(Pad, Pad),
            ForeColor = DarkTheme.Text,
        };

        var sub = new Label
        {
            Text = $"Server: {config.ServerUrl}",
            AutoSize = true,
            Location = new Point(Pad, Pad + 28),
            MaximumSize = new Size(ContentWidth, 0),
        };
        DarkTheme.StyleLabel(sub);

        var panel = new FlowLayoutPanel
        {
            Location = new Point(Pad, 80),
            Size = new Size(ContentWidth, 168),
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
        };

        panel.Controls.Add(
            MakeCaptureBtn(
                "Volledig scherm  (Ctrl+Shift+F11)",
                Color.FromArgb(107, 159, 255),
                Color.FromArgb(10, 14, 24),
                () => host.CaptureFullscreen()));
        panel.Controls.Add(
            MakeCaptureBtn(
                "Actief venster  (Ctrl+Shift+F12)",
                Color.FromArgb(34, 197, 94),
                Color.FromArgb(5, 30, 20),
                () => host.CaptureActiveWindow()));
        panel.Controls.Add(
            MakeCaptureBtn(
                "Regio selecteren  (Ctrl+Shift+S)",
                Color.FromArgb(251, 191, 36),
                Color.FromArgb(40, 28, 6),
                () => host.CaptureRegionInteractive()));
        panel.Controls.Add(MakeBtn("Instellingen", () => host.ShowSettingsDialog()));

        var hint = new Label
        {
            Text = "Sluit dit venster — Snapzilla blijft in het systeemvak actief.",
            Location = new Point(Pad, 256),
            Size = new Size(ContentWidth, 36),
        };
        DarkTheme.StyleLabel(hint);

        Controls.AddRange([title, sub, panel, hint]);
    }

    Button MakeCaptureBtn(string text, Color back, Color fore, Action action)
    {
        var btn = new Button
        {
            Text = text,
            Width = ContentWidth,
            Height = 36,
            Margin = new Padding(0, 0, 0, 8),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(10, 0, 0, 0),
        };
        DarkTheme.StyleCaptureButton(btn, back, fore);
        btn.Click += (_, _) => action();
        return btn;
    }

    Button MakeBtn(string text, Action action)
    {
        var btn = new Button
        {
            Text = text,
            Width = ContentWidth,
            Height = 36,
            Margin = new Padding(0, 0, 0, 8),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(10, 0, 0, 0),
        };
        DarkTheme.StyleSecondary(btn);
        btn.Click += (_, _) => action();
        return btn;
    }
}
