namespace Snapzilla.Client;

sealed class SettingsForm : Form
{
    readonly AppConfig _config;
    readonly TextBox _urlBox;
    readonly TextBox _nameBox;
    readonly CheckBox _startupBox;

    public SettingsForm(AppConfig config)
    {
        _config = config;
        Text = "Snapzilla instellingen";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 220);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 5,
            Padding = new Padding(12),
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        layout.Controls.Add(new Label { Text = "Server URL", AutoSize = true }, 0, 0);
        _urlBox = new TextBox { Text = config.ServerUrl, Dock = DockStyle.Fill };
        layout.Controls.Add(_urlBox, 1, 0);

        layout.Controls.Add(new Label { Text = "Clientnaam", AutoSize = true }, 0, 1);
        _nameBox = new TextBox { Text = config.ClientName, Dock = DockStyle.Fill };
        layout.Controls.Add(_nameBox, 1, 1);

        layout.Controls.Add(new Label { Text = "Client ID", AutoSize = true }, 0, 2);
        layout.Controls.Add(
            new TextBox { Text = config.ClientId, ReadOnly = true, Dock = DockStyle.Fill },
            1,
            2);

        _startupBox = new CheckBox
        {
            Text = "Start met Windows",
            Checked = config.StartWithWindows,
            AutoSize = true,
        };
        layout.SetColumnSpan(_startupBox, 2);
        layout.Controls.Add(_startupBox, 0, 3);

        var saveBtn = new Button { Text = "Opslaan", DialogResult = DialogResult.OK };
        saveBtn.Click += (_, _) => Save();
        layout.Controls.Add(saveBtn, 1, 4);

        Controls.Add(layout);
    }

    void Save()
    {
        _config.ServerUrl = _urlBox.Text.Trim();
        _config.ClientName = _nameBox.Text.Trim();
        _config.StartWithWindows = _startupBox.Checked;
        _config.Save();
        StartupHelper.SetRunAtStartup(_config.StartWithWindows);
    }
}
