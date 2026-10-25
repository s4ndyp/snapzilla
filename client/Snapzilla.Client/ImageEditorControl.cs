using System.Drawing.Drawing2D;

namespace Snapzilla.Client;

enum EditTool
{
    Pen,
    Highlight,
    Rectangle,
    Arrow,
    Text,
    Crop,
}

sealed class ImageEditorControl : UserControl
{
    Bitmap? _bitmap;
    readonly Stack<Bitmap> _undo = new();
    EditTool _tool = EditTool.Pen;
    readonly Color _color = Color.FromArgb(255, 107, 159, 255);
    bool _dragging;
    Point _startImg;
    Point _endImg;

    public EditTool CurrentTool
    {
        get => _tool;
        set => _tool = value;
    }

    public ImageEditorControl()
    {
        DoubleBuffered = true;
        BackColor = DarkTheme.BgHover;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    public void LoadPng(byte[] png)
    {
        _bitmap?.Dispose();
        foreach (var b in _undo)
            b.Dispose();
        _undo.Clear();

        using var ms = new MemoryStream(png);
        _bitmap = new Bitmap(ms);
        Invalidate();
    }

    public byte[] ExportPng()
    {
        if (_bitmap is null)
            return [];
        using var ms = new MemoryStream();
        _bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return ms.ToArray();
    }

    public void Undo()
    {
        if (_undo.Count == 0 || _bitmap is null)
            return;
        _bitmap.Dispose();
        _bitmap = _undo.Pop();
        Invalidate();
    }

    void PushUndo()
    {
        if (_bitmap is null)
            return;
        _undo.Push((Bitmap)_bitmap.Clone());
        while (_undo.Count > 20)
        {
            var old = _undo.Last();
            _undo.Pop();
            old.Dispose();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.Clear(BackColor);
        if (_bitmap is null)
            return;

        var rect = GetImageRect();
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        e.Graphics.DrawImage(_bitmap, rect);

        if (_dragging && _tool == EditTool.Crop)
        {
            var c1 = ImageToClient(_startImg);
            var c2 = ImageToClient(_endImg);
            var crop = NormalizeRect(c1, c2);
            using var pen = new Pen(Color.Lime, 2) { DashStyle = DashStyle.Dash };
            e.Graphics.DrawRectangle(pen, crop);
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (_bitmap is null || e.Button != MouseButtons.Left)
            return;

        Focus();
        var imgPt = ClientToImage(e.Location);

        if (_tool == EditTool.Text)
        {
            var text = SimpleInputDialog.Show(FindForm()!, "Tekst op screenshot:");
            if (!string.IsNullOrWhiteSpace(text))
            {
                PushUndo();
                DrawText(imgPt, text);
                Invalidate();
            }

            return;
        }

        _dragging = true;
        _startImg = _endImg = imgPt;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (!_dragging || _bitmap is null)
            return;

        _endImg = ClientToImage(e.Location);
        if (_tool is EditTool.Pen or EditTool.Highlight)
        {
            PushUndo();
            DrawStroke(_startImg, _endImg, _tool);
            _startImg = _endImg;
            Invalidate();
        }
        else
        {
            Invalidate();
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!_dragging || _bitmap is null)
            return;

        _dragging = false;
        _endImg = ClientToImage(e.Location);

        if (_tool == EditTool.Crop)
        {
            ApplyCrop();
            return;
        }

        if (_startImg == _endImg)
            return;

        PushUndo();
        switch (_tool)
        {
            case EditTool.Rectangle:
                DrawRectangleShape(_startImg, _endImg);
                break;
            case EditTool.Arrow:
                DrawArrow(_startImg, _endImg);
                break;
        }

        Invalidate();
    }

    void ApplyCrop()
    {
        if (_bitmap is null)
            return;
        var src = NormalizeRect(_startImg, _endImg);
        src.Intersect(new Rectangle(0, 0, _bitmap.Width, _bitmap.Height));
        if (src.Width < 8 || src.Height < 8)
            return;

        PushUndo();
        var cropped = _bitmap.Clone(src, _bitmap.PixelFormat);
        _bitmap.Dispose();
        _bitmap = cropped;
        Invalidate();
    }

    void DrawStroke(Point a, Point b, EditTool tool)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        if (tool == EditTool.Highlight)
        {
            using var pen = new Pen(Color.FromArgb(120, 255, 235, 59), 14);
            g.DrawLine(pen, a, b);
        }
        else
        {
            using var pen = new Pen(_color, 3);
            g.DrawLine(pen, a, b);
        }
    }

    void DrawRectangleShape(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_color, 3);
        g.DrawRectangle(pen, NormalizeRect(a, b));
    }

    void DrawArrow(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_color, 3);
        g.DrawLine(pen, a, b);

        const float head = 12f;
        var angle = Math.Atan2(b.Y - a.Y, b.X - a.X);
        var p1 = new PointF(
            (float)(b.X - head * Math.Cos(angle - Math.PI / 6)),
            (float)(b.Y - head * Math.Sin(angle - Math.PI / 6)));
        var p2 = new PointF(
            (float)(b.X - head * Math.Cos(angle + Math.PI / 6)),
            (float)(b.Y - head * Math.Sin(angle + Math.PI / 6)));
        g.DrawLine(pen, b, p1);
        g.DrawLine(pen, b, p2);
    }

    void DrawText(Point at, string text)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        using var brush = new SolidBrush(_color);
        using var font = new Font("Segoe UI", 16, FontStyle.Bold);
        g.DrawString(text, font, brush, at);
    }

    static Rectangle NormalizeRect(Point a, Point b) =>
        new(
            Math.Min(a.X, b.X),
            Math.Min(a.Y, b.Y),
            Math.Max(1, Math.Abs(a.X - b.X)),
            Math.Max(1, Math.Abs(a.Y - b.Y)));

    Rectangle GetImageRect()
    {
        if (_bitmap is null)
            return Rectangle.Empty;

        const int pad = 8;
        var maxW = Width - pad * 2;
        var maxH = Height - pad * 2;
        var ratio = Math.Min(maxW / (float)_bitmap.Width, maxH / (float)_bitmap.Height);
        var w = (int)(_bitmap.Width * ratio);
        var h = (int)(_bitmap.Height * ratio);
        return new Rectangle((Width - w) / 2, (Height - h) / 2, w, h);
    }

    Point ClientToImage(Point client)
    {
        var rect = GetImageRect();
        if (_bitmap is null || rect.Width == 0 || rect.Height == 0)
            return Point.Empty;

        var x = (int)((client.X - rect.X) * (_bitmap.Width / (float)rect.Width));
        var y = (int)((client.Y - rect.Y) * (_bitmap.Height / (float)rect.Height));
        return new Point(
            Math.Clamp(x, 0, _bitmap.Width - 1),
            Math.Clamp(y, 0, _bitmap.Height - 1));
    }

    Point ImageToClient(Point image)
    {
        var rect = GetImageRect();
        if (_bitmap is null)
            return Point.Empty;
        var x = rect.X + (int)(image.X * (rect.Width / (float)_bitmap.Width));
        var y = rect.Y + (int)(image.Y * (rect.Height / (float)_bitmap.Height));
        return new Point(x, y);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _bitmap?.Dispose();
            foreach (var b in _undo)
                b.Dispose();
            _undo.Clear();
        }

        base.Dispose(disposing);
    }
}
