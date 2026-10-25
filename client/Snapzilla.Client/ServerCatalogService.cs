using System.Text.Json;

namespace Snapzilla.Client;

sealed record AlbumEntry(string Id, string Name);

sealed class ServerCatalogService(AppConfig config)
{
    readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(30) };

    public IReadOnlyList<AlbumEntry> Albums { get; private set; } = [];
    public IReadOnlyList<string> Tags { get; private set; } = [];

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        var baseUrl = ServerConnection.Normalize(config.ServerUrl);
        var albums = await FetchAlbumsAsync(baseUrl, ct);
        var tags = await FetchTagsAsync(baseUrl, ct);
        Albums = albums;
        Tags = tags;
        ClientLog.Info($"Catalogus: {albums.Count} albums, {tags.Count} tags");
    }

    async Task<IReadOnlyList<AlbumEntry>> FetchAlbumsAsync(string baseUrl, CancellationToken ct)
    {
        var url =
            $"{baseUrl}/api/collections/albums/records?perPage=500&sort=name&fields=id,name";
        using var res = await _http.GetAsync(url, ct);
        if (!res.IsSuccessStatusCode)
            return [];

        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("items", out var items))
            return [];

        var list = new List<AlbumEntry>();
        foreach (var item in items.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString();
            var name = item.GetProperty("name").GetString();
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name))
                continue;
            list.Add(new AlbumEntry(id, name.Trim()));
        }

        return list;
    }

    async Task<IReadOnlyList<string>> FetchTagsAsync(string baseUrl, CancellationToken ct)
    {
        var tagSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var page = 1; page <= 4; page++)
        {
            var url =
                $"{baseUrl}/api/collections/screenshots/records?perPage=200&page={page}&fields=tags&sort=-created";
            using var res = await _http.GetAsync(url, ct);
            if (!res.IsSuccessStatusCode)
                break;

            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("items", out var items))
                break;

            var count = 0;
            foreach (var item in items.EnumerateArray())
            {
                count++;
                if (!item.TryGetProperty("tags", out var tagsEl))
                    continue;
                foreach (var tag in ParseTagsElement(tagsEl))
                    tagSet.Add(tag);
            }

            if (count < 200)
                break;
        }

        return tagSet.OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList();
    }

    static IEnumerable<string> ParseTagsElement(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Array)
            return ParseTagsFromArray(el);

        if (el.ValueKind != JsonValueKind.String)
            return [];

        var raw = el.GetString();
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            using var inner = JsonDocument.Parse(raw);
            return inner.RootElement.ValueKind == JsonValueKind.Array
                ? ParseTagsFromArray(inner.RootElement)
                : [];
        }
        catch
        {
            return [];
        }
    }

    static List<string> ParseTagsFromArray(JsonElement array)
    {
        var list = new List<string>();
        foreach (var x in array.EnumerateArray())
        {
            var s = x.GetString()?.Trim();
            if (!string.IsNullOrEmpty(s))
                list.Add(s);
        }

        return list;
    }

    public string? ResolveAlbumId(string? nameOrEmpty)
    {
        var name = (nameOrEmpty ?? "").Trim();
        if (name.Length == 0)
            return null;

        foreach (var a in Albums)
        {
            if (a.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
                return a.Id;
        }

        return null;
    }
}
