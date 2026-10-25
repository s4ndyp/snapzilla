using System.Runtime.InteropServices;

namespace Snapzilla.Client;

static class DarkTitleBarHelper
{
    const int DwmwaUseImmersiveDarkModeOld = 19;
    const int DwmwaUseImmersiveDarkMode = 20;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    static extern int DwmSetWindowAttribute(nint hwnd, int attr, ref int attrValue, int attrSize);

    public static void Enable(Form form)
    {
        void Apply()
        {
            if (!form.IsHandleCreated)
                return;

            var useDark = 1;
            _ = DwmSetWindowAttribute(form.Handle, DwmwaUseImmersiveDarkMode, ref useDark, sizeof(int));
            _ = DwmSetWindowAttribute(form.Handle, DwmwaUseImmersiveDarkModeOld, ref useDark, sizeof(int));
        }

        form.HandleCreated += (_, _) => Apply();
        if (form.IsHandleCreated)
            Apply();
    }
}
