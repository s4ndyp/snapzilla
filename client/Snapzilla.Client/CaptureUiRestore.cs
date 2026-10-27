namespace Snapzilla.Client;

/// <summary>
/// Hides visible Snapzilla windows during screen capture so they do not appear in the shot.
/// </summary>
sealed class CaptureUiRestore : IDisposable
{
    readonly List<(Form Form, bool WasVisible)> _state = new();

    public CaptureUiRestore()
    {
        foreach (Form form in Application.OpenForms)
        {
            if (form.IsDisposed || form is RegionCaptureForm)
                continue;
            if (!form.Visible)
                continue;
            _state.Add((form, true));
            form.Hide();
        }

        Application.DoEvents();
    }

    public void Dispose()
    {
        foreach (var (form, wasVisible) in _state)
        {
            if (!wasVisible || form.IsDisposed)
                continue;
            form.Show();
            if (form is MainWindowForm)
            {
                form.WindowState = FormWindowState.Normal;
                form.Activate();
            }
        }

        _state.Clear();
    }
}
