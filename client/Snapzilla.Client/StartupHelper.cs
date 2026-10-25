using Microsoft.Win32;

namespace Snapzilla.Client;

static class StartupHelper
{
    const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string ValueName = "Snapzilla";

    public static void SetRunAtStartup(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath, true);
            if (key == null) return;

            if (enable)
            {
                var exe = Application.ExecutablePath;
                key.SetValue(ValueName, $"\"{exe}\"");
            }
            else
            {
                key.DeleteValue(ValueName, false);
            }
        }
        catch
        {
            /* ignore registry errors */
        }
    }
}
