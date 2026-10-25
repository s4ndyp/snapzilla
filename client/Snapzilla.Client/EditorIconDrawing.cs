using System.Drawing.Drawing2D;

namespace Snapzilla.Client;

static class EditorIconDrawing
{
    public static void DrawTool(Graphics g, Rectangle bounds, EditTool tool, Color color)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var pad = 5;
        var inner = new Rectangle(bounds.X + pad, bounds.Y + pad, bounds.Width - pad * 2, bounds.Height - pad * 2);
        using var pen = new Pen(color, 2f)
        {
            LineJoin = LineJoin.Round,
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
        };

        var x = inner.X;
        var y = inner.Y;
        var w = inner.Width;
        var h = inner.Height;

        switch (tool)
        {
            case EditTool.Pen:
                g.DrawLines(pen,
                [
                    new PointF(x + w * 0.12f, y + h * 0.88f),
                    new PointF(x + w * 0.35f, y + h * 0.55f),
                    new PointF(x + w * 0.55f, y + h * 0.65f),
                    new PointF(x + w * 0.88f, y + h * 0.18f),
                ]);
                break;
            case EditTool.Highlight:
                g.FillPolygon(new SolidBrush(Color.FromArgb(90, color)), new PointF[]
                {
                    new(x + w * 0.15f, y + h * 0.85f),
                    new(x + w * 0.35f, y + h * 0.25f),
                    new(x + w * 0.55f, y + h * 0.45f),
                    new(x + w * 0.45f, y + h * 0.85f),
                });
                g.DrawLine(pen, x + w * 0.1f, y + h * 0.92f, x + w * 0.9f, y + h * 0.92f);
                break;
            case EditTool.Rectangle:
                g.DrawRectangle(pen, x + w * 0.15f, y + h * 0.22f, w * 0.7f, h * 0.56f);
                break;
            case EditTool.Circle:
                g.DrawEllipse(pen, x + w * 0.15f, y + h * 0.15f, w * 0.7f, h * 0.7f);
                break;
            case EditTool.Arrow:
                g.DrawLine(pen, x + w * 0.15f, y + h * 0.85f, x + w * 0.85f, y + h * 0.15f);
                g.DrawLine(pen, x + w * 0.85f, y + h * 0.15f, x + w * 0.55f, y + h * 0.15f);
                g.DrawLine(pen, x + w * 0.85f, y + h * 0.15f, x + w * 0.85f, y + h * 0.45f);
                break;
            case EditTool.Chain:
                g.DrawLines(pen,
                [
                    new PointF(x + w * 0.1f, y + h * 0.78f),
                    new PointF(x + w * 0.32f, y + h * 0.55f),
                    new PointF(x + w * 0.48f, y + h * 0.72f),
                    new PointF(x + w * 0.68f, y + h * 0.28f),
                    new PointF(x + w * 0.9f, y + h * 0.52f),
                ]);
                break;
            case EditTool.Text:
                using (var font = new Font("Segoe UI", Math.Max(8f, h * 0.42f), FontStyle.Bold))
                using (var brush = new SolidBrush(color))
                    g.DrawString("T", font, brush, x + w * 0.28f, y + h * 0.18f);
                break;
            case EditTool.Crop:
                using (var dash = new Pen(color, 2f) { DashStyle = DashStyle.Dash })
                    g.DrawRectangle(dash, x + w * 0.18f, y + h * 0.18f, w * 0.64f, h * 0.64f);
                break;
            default:
                break;
        }
    }

    public static void DrawUndo(Graphics g, Rectangle bounds, Color color)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var pad = 5;
        var inner = new Rectangle(bounds.X + pad, bounds.Y + pad, bounds.Width - pad * 2, bounds.Height - pad * 2);
        using var pen = new Pen(color, 2f) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round };
        var x = inner.X;
        var y = inner.Y;
        var w = inner.Width;
        var h = inner.Height;
        g.DrawArc(pen, x + w * 0.08f, y + h * 0.18f, w * 0.55f, h * 0.55f, 135, 235);
        g.DrawLines(pen,
        [
            new PointF(x + w * 0.12f, y + h * 0.32f),
            new PointF(x + w * 0.12f, y + h * 0.18f),
            new PointF(x + w * 0.28f, y + h * 0.18f),
        ]);
    }
}
