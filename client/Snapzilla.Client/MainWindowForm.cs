namespace Snapzilla.Client;

sealed class MainWindowForm : Form
{
    public MainWindowForm(TrayHost host, AppConfig config)
    {
        Text = "Snapzilla";
        Icon = SnapzillaIcons.App;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 360);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        DarkTheme.Apply(this);

        var title = new Label
        {
            Text = "Screenshot hub",
            Font = new Font(Font.FontFamily, 14, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(16, 16),
            ForeColor = DarkTheme.Text,
        };

        var sub = new Label
        {
            Text = $"Server: {config.ServerUrl}",
            AutoSize = true,
            Location = new Point(16, 44),
            MaximumSize = new Size(380, 0),
        };
        DarkTheme.StyleLabel(sub);

        var panel = new FlowLayoutPanel
        {
            Location = new Point(16, 88),
            Size = new Size(380, 200),
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
        };

        panel.Controls.Add(MakeBtn("Volledig scherm  (Ctrl+Shift+F11)", () => host.CaptureFullscreen()));
        panel.Controls.Add(MakeBtn("Actief venster  (Ctrl+Shift+F12)", () => host.CaptureActiveWindow()));
        panel.Controls.Add(MakeBtn("Regio selecteren  (Ctrl+Shift+S)", () => host.CaptureRegionInteractive()));
        panel.Controls.Add(MakeBtn("Instellingen", () => host.ShowSettingsDialog()));
        panel.Controls.Add(MakeBtn("Logboek openen", ClientLog.OpenInEditor));

        var hint = new Label
        {
            Text = "Sluit dit venster — Snapzilla blijft in het systeemvak actief.",
            Location = new Point(16, 300),
            Size = new Size(380, 40),
        };
        DarkTheme.StyleLabel(hint);

        Controls.AddRange([title, sub, panel, hint]);
    }

    Button MakeBtn(string text, Action action)
    {
        var btn = new Button
        {
            Text = text,
            Width = 360,
            Height = 36,
            Margin = new Padding(0, 0, 0, 8),
            TextAlign = ContentAlignment.MiddleLeft,
        };
        DarkTheme.StyleSecondary(btn);
        btn.Click += (_, _) => action();
        return btn;
    }
}
