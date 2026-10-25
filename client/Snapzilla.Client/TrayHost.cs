using System.Drawing;

namespace Snapzilla.Client;

sealed class TrayHost : ApplicationContext
{
    readonly NotifyIcon _tray;
    readonly AppConfig _config;
    UploadService _upload;
    readonly HotkeyHost _hotkeys;
    MainWindowForm? _mainWindow;

    public TrayHost()
    {
        _config = AppConfig.Load();
        _upload = new UploadService(_config);
        StartupHelper.SetRunAtStartup(_config.StartWithWindows);
        ClientLog.Info($"Snapzilla gestart — server {_config.ServerUrl}");

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Snapzilla",
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Snapzilla openen", null, (_, _) => ShowMainWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Volledig scherm (Ctrl+Shift+F11)", null, (_, _) => CaptureFullscreen());
        menu.Items.Add("Actief venster (Ctrl+Shift+F12)", null, (_, _) => CaptureActiveWindow());
        menu.Items.Add("Regio (Ctrl+Shift+S)", null, (_, _) => CaptureRegionInteractive());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Instellingen…", null, (_, _) => ShowSettingsDialog());
        menu.Items.Add("Logboek openen", null, (_, _) => ClientLog.OpenInEditor());
        menu.Items.Add("Afsluiten", null, (_, _) => ExitThread());
        _tray.ContextMenuStrip = menu;
        _tray.Click += (_, _) => ShowMainWindow();

        _hotkeys = new HotkeyHost();
        _hotkeys.Register(
            Keys.F11,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            CaptureFullscreen);
        _hotkeys.Register(
            Keys.F12,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            CaptureActiveWindow);
        _hotkeys.Register(
            Keys.S,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            CaptureRegionInteractive);
    }

    public void ShowMainWindow()
    {
        if (_mainWindow is null || _mainWindow.IsDisposed)
        {
            _mainWindow = new MainWindowForm(this, _config);
            _mainWindow.FormClosed += (_, _) => _mainWindow = null;
        }

        _mainWindow.Show();
        _mainWindow.WindowState = FormWindowState.Normal;
        _mainWindow.Activate();
    }

    public void ShowSettingsDialog()
    {
        using var form = new SettingsForm(_config, _upload);
        if (form.ShowDialog() == DialogResult.OK)
            _upload = new UploadService(_config);
    }

    public void CaptureFullscreen() =>
        CaptureAndPreview("fullscreen", ScreenCapture.CapturePrimaryScreen());

    public void CaptureActiveWindow() =>
        CaptureAndPreview("window", ScreenCapture.CaptureActiveWindow());

    public void CaptureRegionInteractive()
    {
        using var overlay = new RegionCaptureForm();
        if (overlay.ShowDialog() != DialogResult.OK || overlay.SelectedRegion is not { } rect)
            return;
        var png = ScreenCapture.CaptureScreen(rect);
        CaptureAndPreview("region", png);
    }

    void CaptureAndPreview(string mode, byte[] png)
    {
        try
        {
            using var preview = new CapturePreviewForm(png, mode, _upload, _config);
            preview.ShowDialog();
        }
        catch (Exception ex)
        {
            ClientLog.Error("Preview kon niet openen", ex);
            _tray.ShowBalloonTip(4000, "Snapzilla", ex.Message, ToolTipIcon.Error);
        }
    }

    protected override void ExitThreadCore()
    {
        ClientLog.Info("Snapzilla afgesloten");
        _hotkeys.Dispose();
        _mainWindow?.Close();
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
