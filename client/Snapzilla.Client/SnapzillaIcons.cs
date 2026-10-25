namespace Snapzilla.Client;

static class SnapzillaIcons
{
    static Icon? _app;

    public static Icon App
    {
        get
        {
            if (_app != null)
                return _app;
            using var stream =
                typeof(SnapzillaIcons).Assembly.GetManifestResourceStream("snapzilla.ico")
                ?? throw new InvalidOperationException("Embedded snapzilla.ico ontbreekt.");
            _app = new Icon(stream);
            return _app;
        }
    }
}
