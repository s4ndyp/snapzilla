namespace Snapzilla.Client;

static class ClientLog
{
    static readonly object Gate = new();

    static string LogDir =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Snapzilla",
            "logs");

    public static string LogPath => Path.Combine(LogDir, "client.log");

    public static void Info(string message) => Write("INFO", message);

    public static void Error(string message, Exception? ex = null)
    {
        if (ex is null)
        {
            Write("ERROR", message);
            return;
        }

        Write("ERROR", $"{message}{Environment.NewLine}{ex}");
    }

    static void Write(string level, string message)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            var line =
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}{Environment.NewLine}";
            lock (Gate)
            {
                File.AppendAllText(LogPath, line);
            }
        }
        catch
        {
            /* logging must not crash the app */
        }
    }

    public static void OpenInEditor()
    {
        Directory.CreateDirectory(LogDir);
        if (!File.Exists(LogPath))
            File.WriteAllText(LogPath, $"{DateTime.Now:u} Log aangemaakt.{Environment.NewLine}");

        Process.Start(
            new ProcessStartInfo
            {
                FileName = LogPath,
                UseShellExecute = true,
            });
    }
}
