using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Snapzilla.Client;

static class ScreenCapture
{
    public static byte[] CaptureScreen(Rectangle bounds)
    {
        using var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
        }
        return ToPng(bmp);
    }

    public static byte[] CapturePrimaryScreen() =>
        CaptureScreen(SystemInformation.VirtualScreen);

    public static byte[] CaptureActiveWindow()
    {
        var hWnd = GetForegroundWindow();
        if (hWnd == IntPtr.Zero)
            return CapturePrimaryScreen();

        if (!GetWindowRect(hWnd, out RECT rect))
            return CapturePrimaryScreen();

        var bounds = new Rectangle(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return CapturePrimaryScreen();

        return CaptureScreen(bounds);
    }

    static byte[] ToPng(Bitmap bmp)
    {
        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
