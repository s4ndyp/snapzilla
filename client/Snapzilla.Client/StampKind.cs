using System.Drawing;
using System.Drawing.Drawing2D;

namespace Snapzilla.Client;

enum StampKind
{
    Cross,
    Check,
    House,
    Lamp,
    Computer,
    Lightning,
}

static class StampDrawing
{
    public static void Draw(Graphics g, Rectangle bounds, StampKind kind, Color color, bool previewFrame = false)
    {
        if (bounds.Width < 2 || bounds.Height < 2)
            return;

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var s = Math.Min(bounds.Width, bounds.Height);
        var lw = Math.Max(2f, s * 0.08f);
        using var pen = new Pen(color, lw)
        {
            LineJoin = LineJoin.Round,
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
        };

        if (previewFrame)
        {
            using var dash = new Pen(Color.FromArgb(160, color), 1.5f) { DashStyle = DashStyle.Dash };
            g.DrawRectangle(dash, bounds);
        }

        var x = bounds.X;
        var y = bounds.Y;
        var w = bounds.Width;
        var h = bounds.Height;

        switch (kind)
        {
            case StampKind.Cross:
                g.DrawLine(pen, x + w * 0.2f, y + h * 0.2f, x + w * 0.8f, y + h * 0.8f);
                g.DrawLine(pen, x + w * 0.8f, y + h * 0.2f, x + w * 0.2f, y + h * 0.8f);
                break;
            case StampKind.Check:
                g.DrawLines(pen,
                [
                    new PointF(x + w * 0.15f, y + h * 0.55f),
                    new PointF(x + w * 0.4f, y + h * 0.82f),
                    new PointF(x + w * 0.88f, y + h * 0.22f),
                ]);
                break;
            case StampKind.House:
                g.DrawPolygon(pen,
                [
                    new PointF(x + w * 0.5f, y + h * 0.12f),
                    new PointF(x + w * 0.88f, y + h * 0.42f),
                    new PointF(x + w * 0.88f, y + h * 0.88f),
                    new PointF(x + w * 0.12f, y + h * 0.88f),
                    new PointF(x + w * 0.12f, y + h * 0.42f),
                ]);
                g.DrawLine(pen, x + w * 0.38f, y + h * 0.88f, x + w * 0.38f, y + h * 0.58f);
                g.DrawLine(pen, x + w * 0.62f, y + h * 0.88f, x + w * 0.62f, y + h * 0.58f);
                g.DrawLine(pen, x + w * 0.38f, y + h * 0.58f, x + w * 0.62f, y + h * 0.58f);
                break;
            case StampKind.Lamp:
                g.DrawEllipse(pen, x + w * 0.28f, y + h * 0.15f, w * 0.44f, h * 0.42f);
                g.DrawLine(pen, x + w * 0.5f, y + h * 0.57f, x + w * 0.5f, y + h * 0.72f);
                g.DrawLine(pen, x + w * 0.32f, y + h * 0.78f, x + w * 0.68f, y + h * 0.78f);
                break;
            case StampKind.Computer:
                g.DrawRectangle(pen, x + w * 0.14f, y + h * 0.18f, w * 0.72f, h * 0.52f);
                g.DrawLine(pen, x + w * 0.5f, y + h * 0.7f, x + w * 0.5f, y + h * 0.78f);
                g.DrawLine(pen, x + w * 0.28f, y + h * 0.86f, x + w * 0.72f, y + h * 0.86f);
                break;
            case StampKind.Lightning:
                g.DrawPolygon(pen,
                [
                    new PointF(x + w * 0.55f, y + h * 0.08f),
                    new PointF(x + w * 0.28f, y + h * 0.52f),
                    new PointF(x + w * 0.48f, y + h * 0.52f),
                    new PointF(x + w * 0.38f, y + h * 0.92f),
                    new PointF(x + w * 0.72f, y + h * 0.42f),
                    new PointF(x + w * 0.5f, y + h * 0.42f),
                ]);
                break;
        }
    }
}
