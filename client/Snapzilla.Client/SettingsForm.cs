namespace Snapzilla.Client;

sealed class SettingsForm : Form
{
    readonly AppConfig _config;
    readonly UploadService? _upload;
    readonly TextBox _urlBox;
    readonly TextBox _nameBox;
    readonly CheckBox _startupBox;
    readonly Label _urlHint;

    public SettingsForm(AppConfig config, UploadService? upload = null)
    {
        _config = config;
        _upload = upload;
        Text = "Snapzilla instellingen";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(500, 340);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 7,
            Padding = new Padding(12),
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        layout.Controls.Add(new Label { Text = "Server URL", AutoSize = true }, 0, 0);
        _urlBox = new TextBox { Text = config.ServerUrl, Dock = DockStyle.Fill };
        layout.Controls.Add(_urlBox, 1, 0);

        _urlHint = new Label
        {
            Text =
                "IP of hostnaam van de Snapzilla-server op je netwerk. Poort 80: http://10.5.0.153 — " +
                "niet :3000 tenzij docker zo is ingesteld. Client en server op verschillende PCs: firewall open.",
            AutoSize = true,
            ForeColor = SystemColors.GrayText,
            MaximumSize = new Size(360, 0),
        };
        layout.SetColumnSpan(_urlHint, 2);
        layout.Controls.Add(_urlHint, 0, 1);

        layout.Controls.Add(new Label { Text = "Clientnaam", AutoSize = true }, 0, 2);
        _nameBox = new TextBox { Text = config.ClientName, Dock = DockStyle.Fill };
        layout.Controls.Add(_nameBox, 1, 2);

        layout.Controls.Add(new Label { Text = "Client ID", AutoSize = true }, 0, 3);
        layout.Controls.Add(
            new TextBox { Text = config.ClientId, ReadOnly = true, Dock = DockStyle.Fill },
            1,
            3);

        _startupBox = new CheckBox
        {
            Text = "Start met Windows",
            Checked = config.StartWithWindows,
            AutoSize = true,
        };
        layout.SetColumnSpan(_startupBox, 2);
        layout.Controls.Add(_startupBox, 0, 4);

        var btnRow = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.LeftToRight,
            AutoSize = true,
            WrapContents = true,
        };

        var logBtn = new Button { Text = "Logboek openen", AutoSize = true };
        logBtn.Click += (_, _) => ClientLog.OpenInEditor();

        var testBtn = new Button { Text = "Test / zoek server", AutoSize = true };
        testBtn.Click += async (_, _) => await TestConnectionAsync(testBtn);

        btnRow.Controls.Add(logBtn);
        btnRow.Controls.Add(testBtn);
        layout.SetColumnSpan(btnRow, 2);
        layout.Controls.Add(btnRow, 0, 5);

        var saveBtn = new Button { Text = "Opslaan", DialogResult = DialogResult.OK, AutoSize = true };
        saveBtn.Click += (_, _) => Save();
        layout.Controls.Add(saveBtn, 1, 6);

        Controls.Add(layout);
    }

    async Task TestConnectionAsync(Button testBtn)
    {
        SaveFieldsToConfig();
        testBtn.Enabled = false;
        try
        {
            var upload = _upload ?? new UploadService(_config);
            var result = await upload.TestConnectionAsync();
            if (result.Success)
            {
                if (result.WorkingBaseUrl is not null
                    && !result.WorkingBaseUrl.Equals(_config.ServerUrl, StringComparison.OrdinalIgnoreCase))
                {
                    var apply = MessageBox.Show(
                        this,
                        $"{result.Message}{Environment.NewLine}{Environment.NewLine}Server-URL bijwerken naar:{Environment.NewLine}{result.WorkingBaseUrl}?",
                        "Server gevonden",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question);
                    if (apply == DialogResult.Yes)
                    {
                        _urlBox.Text = result.WorkingBaseUrl;
                        _config.ServerUrl = result.WorkingBaseUrl;
                        _config.Save();
                    }
                }
                else
                {
                    MessageBox.Show(this, result.Message, "Verbinding OK", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            else
            {
                ClientLog.Error($"Verbindingstest mislukt: {result.Message}");
                MessageBox.Show(this, result.Message, "Verbinding mislukt", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            ClientLog.Error("Verbindingstest mislukt", ex);
            MessageBox.Show(this, ex.Message, "Verbinding mislukt", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            testBtn.Enabled = true;
        }
    }

    void Save()
    {
        SaveFieldsToConfig();
        _config.Save();
        StartupHelper.SetRunAtStartup(_config.StartWithWindows);
        ClientLog.Info($"Instellingen opgeslagen — server {_config.ServerUrl}");
    }

    void SaveFieldsToConfig()
    {
        try
        {
            _config.ServerUrl = ServerConnection.Normalize(_urlBox.Text.Trim());
            _urlBox.Text = _config.ServerUrl;
        }
        catch (FormatException ex)
        {
            MessageBox.Show(this, ex.Message, "Ongeldige URL", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        _config.ClientName = _nameBox.Text.Trim();
        _config.StartWithWindows = _startupBox.Checked;
    }
}
