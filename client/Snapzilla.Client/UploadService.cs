using System.Net.Http.Headers;

namespace Snapzilla.Client;

sealed class UploadService(AppConfig config)
{
    readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(2) };

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        var baseUrl = config.ServerUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/health";
        ClientLog.Info($"Verbinding testen: GET {url}");
        using var res = await _http.GetAsync(url, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            ClientLog.Error($"Health check mislukt ({(int)res.StatusCode}): {body}");
            return false;
        }

        var snippet = body.Trim();
        if (snippet.Length > 120)
            snippet = snippet[..120] + "…";
        ClientLog.Info($"Health check OK: {snippet}");
        return true;
    }

    public async Task UploadAsync(
        byte[] png,
        string captureMode,
        string? title = null,
        CancellationToken ct = default)
    {
        var baseUrl = config.ServerUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/collections/screenshots/records";
        ClientLog.Info($"Upload start: POST {url} ({png.Length} bytes, mode={captureMode})");

        using var content = new MultipartFormDataContent();
        var image = new ByteArrayContent(png);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(image, "image", $"snap_{DateTime.UtcNow:yyyyMMdd_HHmmss}.png");
        content.Add(new StringContent(title ?? $"Capture {DateTime.Now:g}"), "title");
        content.Add(new StringContent(DateTime.UtcNow.ToString("o")), "captured_at");
        content.Add(new StringContent(captureMode), "capture_mode");
        content.Add(new StringContent(config.ClientId), "client_id");
        content.Add(new StringContent(config.ClientName), "client_name");
        content.Add(new StringContent(Environment.MachineName), "hostname");
        content.Add(new StringContent("[]"), "tags");
        content.Add(new StringContent("false"), "starred");
        content.Add(new StringContent("false"), "analyzed");

        using var res = await _http.PostAsync(url, content, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            ClientLog.Error(
                $"Upload HTTP {(int)res.StatusCode} {res.ReasonPhrase}{Environment.NewLine}Response: {body}");
            throw new InvalidOperationException(
                $"Upload mislukt ({(int)res.StatusCode}). Controleer de server-URL (poort 80 = geen :3000).{Environment.NewLine}{TrimBody(body)}");
        }

        ClientLog.Info($"Upload OK ({(int)res.StatusCode})");
    }

    static string TrimBody(string body) =>
        body.Length <= 400 ? body : body[..400] + "…";
}
