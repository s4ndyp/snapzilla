using System.Runtime.InteropServices;

namespace Snapzilla.Client;

sealed class HotkeyHost : NativeWindow, IDisposable
{
    const int WM_HOTKEY = 0x0312;
    int _id;
    readonly Dictionary<int, Action> _actions = new();

    public const uint ModAlt = 0x0001;
    public const uint ModCtrl = 0x0002;
    public const uint ModShift = 0x0004;

    public HotkeyHost()
    {
        CreateHandle(new CreateParams());
    }

    public void Register(Keys key, uint modifiers, Action action)
    {
        _id++;
        if (!RegisterHotKey(Handle, _id, modifiers, (uint)key))
            throw new InvalidOperationException($"Hotkey {key} kon niet geregistreerd worden");
        _actions[_id] = action;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && _actions.TryGetValue(m.WParam.ToInt32(), out var act))
            act();
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        foreach (var id in _actions.Keys)
            UnregisterHotKey(Handle, id);
        DestroyHandle();
    }

    [DllImport("user32.dll")]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
