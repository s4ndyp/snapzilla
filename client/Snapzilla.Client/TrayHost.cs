using System.Drawing;

namespace Snapzilla.Client;

sealed class TrayHost : ApplicationContext
{
    readonly NotifyIcon _tray;
    readonly AppConfig _config;
    UploadService _upload;
    readonly HotkeyHost _hotkeys;

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
        menu.Items.Add("Volledig scherm (Ctrl+Shift+F11)", null, (_, _) => CaptureAndPreview("fullscreen", ScreenCapture.CapturePrimaryScreen()));
        menu.Items.Add("Actief venster (Ctrl+Shift+F12)", null, (_, _) => CaptureAndPreview("window", ScreenCapture.CaptureActiveWindow()));
        menu.Items.Add("Regio (Ctrl+Shift+S)", null, (_, _) => CaptureRegion());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Instellingen…", null, (_, _) => ShowSettings());
        menu.Items.Add("Logboek openen", null, (_, _) => ClientLog.OpenInEditor());
        menu.Items.Add("Afsluiten", null, (_, _) => ExitThread());
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => ShowSettings();

        _hotkeys = new HotkeyHost();
        _hotkeys.Register(
            Keys.F11,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            () => CaptureAndPreview("fullscreen", ScreenCapture.CapturePrimaryScreen()));
        _hotkeys.Register(
            Keys.F12,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            () => CaptureAndPreview("window", ScreenCapture.CaptureActiveWindow()));
        _hotkeys.Register(
            Keys.S,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            CaptureRegion);
    }

    void ShowSettings()
    {
        using var form = new SettingsForm(_config, _upload);
        if (form.ShowDialog() == DialogResult.OK)
            _upload = new UploadService(_config);
    }

    void CaptureRegion()
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
            using var preview = new CapturePreviewForm(png, mode, _upload);
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
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
