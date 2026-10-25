using System.Drawing;

namespace Snapzilla.Client;

sealed class TrayHost : ApplicationContext
{
    readonly NotifyIcon _tray;
    readonly AppConfig _config;
    readonly UploadService _upload;
    readonly HotkeyHost _hotkeys;

    public TrayHost()
    {
        _config = AppConfig.Load();
        _upload = new UploadService(_config);
        StartupHelper.SetRunAtStartup(_config.StartWithWindows);

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Snapzilla",
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Volledig scherm (Ctrl+Shift+F11)", null, (_, _) => _ = CaptureAndUpload("fullscreen", ScreenCapture.CapturePrimaryScreen));
        menu.Items.Add("Actief venster (Ctrl+Shift+F12)", null, (_, _) => _ = CaptureAndUpload("window", ScreenCapture.CaptureActiveWindow()));
        menu.Items.Add("Regio (Ctrl+Shift+S)", null, (_, _) => CaptureRegion());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Instellingen…", null, (_, _) => ShowSettings());
        menu.Items.Add("Afsluiten", null, (_, _) => ExitThread());
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => ShowSettings();

        _hotkeys = new HotkeyHost();
        _hotkeys.Register(
            Keys.F11,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            () => _ = CaptureAndUpload("fullscreen", ScreenCapture.CapturePrimaryScreen));
        _hotkeys.Register(
            Keys.F12,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            () => _ = CaptureAndUpload("window", ScreenCapture.CaptureActiveWindow()));
        _hotkeys.Register(
            Keys.S,
            HotkeyHost.ModCtrl | HotkeyHost.ModShift,
            CaptureRegion);
    }

    void ShowSettings()
    {
        using var form = new SettingsForm(_config);
        form.ShowDialog();
    }

    void CaptureRegion()
    {
        using var overlay = new RegionCaptureForm();
        if (overlay.ShowDialog() != DialogResult.OK || overlay.SelectedRegion is not { } rect)
            return;
        var png = ScreenCapture.CaptureScreen(rect);
        _ = CaptureAndUpload("region", png);
    }

    async Task CaptureAndUpload(string mode, byte[] png)
    {
        try
        {
            _tray.ShowBalloonTip(2000, "Snapzilla", "Uploaden…", ToolTipIcon.Info);
            await _upload.UploadAsync(png, mode);
            _tray.ShowBalloonTip(2000, "Snapzilla", "Screenshot opgeslagen", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            _tray.ShowBalloonTip(4000, "Snapzilla", ex.Message, ToolTipIcon.Error);
        }
    }

    protected override void ExitThreadCore()
    {
        _hotkeys.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
