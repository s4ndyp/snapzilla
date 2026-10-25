using System.Net.Http.Headers;
using System.Text.Json;

namespace Snapzilla.Client;

sealed class UploadService(AppConfig config)
{
    readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(2) };

    public Task<ConnectionTestResult> TestConnectionAsync(CancellationToken ct = default) =>
        ServerConnection.TestAndDiscoverAsync(_http, config.ServerUrl, ct);

    public async Task UploadAsync(
        byte[] png,
        string captureMode,
        string? title = null,
        IReadOnlyList<string>? tags = null,
        string? albumId = null,
        CancellationToken ct = default)
    {
        var baseUrl = ServerConnection.Normalize(config.ServerUrl);
        var url = $"{baseUrl}/api/collections/screenshots/records";
        ClientLog.Info($"Upload start: POST {url} ({png.Length} bytes, mode={captureMode})");

        using var content = new MultipartFormDataContent();
        var image = new ByteArrayContent(png);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(image, "image", $"snap_{DateTime.UtcNow:yyyyMMdd_HHmmss}.png");
        content.Add(new StringContent(title ?? ""), "title");
        content.Add(new StringContent(DateTime.UtcNow.ToString("o")), "captured_at");
        content.Add(new StringContent(captureMode), "capture_mode");
        content.Add(new StringContent(config.ClientId), "client_id");
        content.Add(new StringContent(config.ClientName), "client_name");
        content.Add(new StringContent(Environment.MachineName), "hostname");
        content.Add(new StringContent(JsonSerializer.Serialize(tags ?? [])), "tags");
        content.Add(new StringContent(albumId ?? ""), "album");
        content.Add(new StringContent("false"), "starred");
        content.Add(new StringContent("false"), "analyzed");

        using var res = await _http.PostAsync(url, content, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            ClientLog.Error(
                $"Upload HTTP {(int)res.StatusCode} {res.ReasonPhrase}{Environment.NewLine}Response: {body}");
            throw new InvalidOperationException(
                $"Upload mislukt ({(int)res.StatusCode}).{Environment.NewLine}{TrimBody(body)}");
        }

        ClientLog.Info($"Upload OK ({(int)res.StatusCode})");
    }

    static string TrimBody(string body) =>
        body.Length <= 400 ? body : body[..400] + "…";
}
