using System.Text.Json;

namespace Snapzilla.Client;

sealed class AppConfig
{
    public string ServerUrl { get; set; } = "http://localhost";
    public string ClientName { get; set; } = Environment.MachineName;
    public string ClientId { get; set; } = "";
    public bool StartWithWindows { get; set; } = true;

    static string ConfigDir =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Snapzilla");

    static string ConfigPath => Path.Combine(ConfigDir, "config.json");

    public static AppConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                var cfg = JsonSerializer.Deserialize<AppConfig>(json) ?? new AppConfig();
                cfg.EnsureClientId();
                return cfg;
            }
        }
        catch
        {
            /* use defaults */
        }

        var fresh = new AppConfig();
        fresh.EnsureClientId();
        return fresh;
    }

    public void Save()
    {
        Directory.CreateDirectory(ConfigDir);
        EnsureClientId();
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(ConfigPath, json);
    }

    void EnsureClientId()
    {
        if (string.IsNullOrWhiteSpace(ClientId))
            ClientId = Guid.NewGuid().ToString("N");
    }
}
