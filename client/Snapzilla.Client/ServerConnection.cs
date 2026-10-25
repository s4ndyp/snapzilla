using System.Net.Http;
using System.Net.Sockets;

namespace Snapzilla.Client;

sealed record ConnectionTestResult(
    bool Success,
    string Message,
    string? WorkingBaseUrl,
    IReadOnlyList<string> AttemptedUrls);

static class ServerConnection
{
    static readonly int[] FallbackPorts = [80, 443, 3000, 8080];

    public static string Normalize(string raw)
    {
        var t = (raw ?? "").Trim();
        if (t.Length == 0)
            return "http://localhost";

        if (!t.Contains("://", StringComparison.Ordinal))
            t = "http://" + t;

        if (!Uri.TryCreate(t, UriKind.Absolute, out var uri))
            throw new FormatException("Ongeldige server-URL.");

        if (uri.Scheme is not ("http" or "https"))
            throw new FormatException("Alleen http:// of https:// URLs worden ondersteund.");

        var portPart = uri.IsDefaultPort ? "" : $":{uri.Port}";
        return $"{uri.Scheme}://{uri.IdnHost}{portPart}";
    }

    public static async Task<ConnectionTestResult> TestAndDiscoverAsync(
        HttpClient http,
        string serverUrl,
        CancellationToken ct = default)
    {
        string normalized;
        try
        {
            normalized = Normalize(serverUrl);
        }
        catch (Exception ex)
        {
            return new ConnectionTestResult(false, ex.Message, null, []);
        }

        var candidates = BuildCandidates(normalized);
        var errors = new List<string>();

        foreach (var baseUrl in candidates)
        {
            var healthUrl = $"{baseUrl}/api/health";
            try
            {
                ClientLog.Info($"Verbinding testen: GET {healthUrl}");
                using var res = await http.GetAsync(healthUrl, ct);
                var body = await res.Content.ReadAsStringAsync(ct);
                if (res.IsSuccessStatusCode)
                {
                    var snippet = body.Trim();
                    if (snippet.Length > 80)
                        snippet = snippet[..80] + "…";
                    ClientLog.Info($"Health check OK op {baseUrl}: {snippet}");

                    var msg =
                        baseUrl.Equals(normalized, StringComparison.OrdinalIgnoreCase)
                            ? $"Server bereikbaar op {baseUrl}."
                            : $"Server bereikbaar op {baseUrl} (ingevulde URL {normalized} werkte niet).";

                    return new ConnectionTestResult(true, msg, baseUrl, candidates);
                }

                errors.Add($"{baseUrl} → HTTP {(int)res.StatusCode}");
                ClientLog.Error($"Health check mislukt op {baseUrl} ({(int)res.StatusCode}): {body}");
            }
            catch (Exception ex) when (IsConnectionRefused(ex))
            {
                errors.Add($"{baseUrl} → verbinding geweigerd (verkeerde poort of firewall)");
                ClientLog.Info($"Geen listener op {baseUrl}");
            }
            catch (Exception ex)
            {
                errors.Add($"{baseUrl} → {ex.Message}");
                ClientLog.Error($"Probe mislukt op {baseUrl}", ex);
            }
        }

        var hint =
            $"Geen Snapzilla-server gevonden op {NormalizeHostPart(normalized)}.{Environment.NewLine}" +
            $"Geprobeerd: {string.Join(", ", candidates)}{Environment.NewLine}{Environment.NewLine}" +
            "Controleer op de server:" + Environment.NewLine +
            "• Luistert de web-UI op poort 80? Gebruik http://<ip> zonder :3000 in de client." + Environment.NewLine +
            "• Staat SNAPZILLA_PORT in docker-compose op de juiste poort?" + Environment.NewLine +
            "• Firewall/LXC: poort open voor je PC op het LAN." + Environment.NewLine +
            "• In de browser op je PC: http://<ip>/api/health";

        return new ConnectionTestResult(false, hint, null, candidates);
    }

    static bool IsConnectionRefused(Exception ex)
    {
        if (ex is SocketException se && se.SocketErrorCode == SocketError.ConnectionRefused)
            return true;
        if (ex.InnerException is SocketException inner && inner.SocketErrorCode == SocketError.ConnectionRefused)
            return true;
        return ex.Message.Contains("actively refused", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("geweigerd", StringComparison.OrdinalIgnoreCase);
    }

    static string NormalizeHostPart(string normalized)
    {
        var uri = new Uri(normalized);
        return uri.IsDefaultPort ? $"{uri.Scheme}://{uri.Host}" : normalized;
    }

    static List<string> BuildCandidates(string normalized)
    {
        var uri = new Uri(normalized);
        var ports = new List<int>();
        if (!uri.IsDefaultPort)
            ports.Add(uri.Port);

        foreach (var p in FallbackPorts)
        {
            if (!ports.Contains(p))
                ports.Add(p);
        }

        var list = new List<string>();
        foreach (var port in ports)
        {
            if (port == 443)
                list.Add($"https://{uri.Host}");
            else if (port == 80)
                list.Add($"http://{uri.Host}");
            else
                list.Add($"http://{uri.Host}:{port}");
        }

        return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }
}
