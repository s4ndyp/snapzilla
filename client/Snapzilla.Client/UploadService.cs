using System.Net.Http.Headers;

namespace Snapzilla.Client;

sealed class UploadService(AppConfig config)
{
    readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(2) };

    public async Task UploadAsync(
        byte[] png,
        string captureMode,
        string? title = null,
        CancellationToken ct = default)
    {
        var baseUrl = config.ServerUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/collections/screenshots/records";

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
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"Upload failed ({(int)res.StatusCode}): {body}");
        }
    }
}
