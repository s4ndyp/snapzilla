using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace Snapzilla.Client;

enum EditTool
{
    Pen,
    Highlight,
    Rectangle,
    Circle,
    Arrow,
    Chain,
    Stamp,
    Text,
    Crop,
}

sealed class ImageEditorControl : UserControl
{
    const int MaxUndoSteps = 8;
    const int MaxEditPixels = 16_000_000;

    Bitmap? _bitmap;
    byte[]? _originalPng;
    readonly List<Bitmap> _undo = new();

    public event EventHandler? EditsChanged;

    public bool CanUndo => _undo.Count > 0;
    EditTool _tool = EditTool.Pen;
    StampKind _stampKind = StampKind.Check;
    Color _strokeColor = Color.FromArgb(255, 107, 159, 255);

    public Color StrokeColor
    {
        get => _strokeColor;
        set
        {
            _strokeColor = value;
            Invalidate();
        }
    }
    bool _dragging;
    Point _startImg;
    Point _endImg;
    Point? _chainAnchor;
    Point? _chainHoverClient;

    public EditTool CurrentTool
    {
        get => _tool;
        set => _tool = value;
    }

    public StampKind CurrentStamp
    {
        get => _stampKind;
        set => _stampKind = value;
    }

    public bool HasChainAnchor => _chainAnchor.HasValue;

    public void EndChain()
    {
        _chainAnchor = null;
        _chainHoverClient = null;
        Invalidate();
    }

    public ImageEditorControl()
    {
        DoubleBuffered = true;
        BackColor = DarkTheme.BgHover;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    public void LoadPng(byte[] png)
    {
        _originalPng = png;
        ClearUndo();
        _bitmap?.Dispose();

        using var ms = new MemoryStream(png);
        using var loaded = new Bitmap(ms);
        _bitmap = NormalizeForEditing(loaded);
        _chainAnchor = null;
        _chainHoverClient = null;
        Invalidate();
        NotifyEditsChanged();
    }

    public void ResetToOriginal()
    {
        if (_originalPng is null || _originalPng.Length == 0)
            return;
        LoadPng(_originalPng);
    }

    static Bitmap NormalizeForEditing(Bitmap source)
    {
        var pixels = (long)source.Width * source.Height;
        if (pixels > MaxEditPixels)
        {
            var scale = Math.Sqrt(MaxEditPixels / (double)pixels);
            var w = Math.Max(1, (int)(source.Width * scale));
            var h = Math.Max(1, (int)(source.Height * scale));
            var scaled = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(scaled))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(source, 0, 0, w, h);
            }

            return scaled;
        }

        var bmp = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
            g.DrawImage(source, 0, 0);
        return bmp;
    }

    public byte[] ExportPng()
    {
        if (_bitmap is null)
            return [];
        using var ms = new MemoryStream();
        _bitmap.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    public void Undo()
    {
        if (_undo.Count == 0 || _bitmap is null)
            return;
        _bitmap.Dispose();
        _bitmap = _undo[^1];
        _undo.RemoveAt(_undo.Count - 1);
        _chainAnchor = null;
        _chainHoverClient = null;
        Invalidate();
        NotifyEditsChanged();
    }

    void PushUndo()
    {
        if (_bitmap is null)
            return;
        _undo.Add((Bitmap)_bitmap.Clone());
        while (_undo.Count > MaxUndoSteps)
        {
            _undo[0].Dispose();
            _undo.RemoveAt(0);
        }

        NotifyEditsChanged();
    }

    void ClearUndo()
    {
        foreach (var b in _undo)
            b.Dispose();
        _undo.Clear();
        NotifyEditsChanged();
    }

    void NotifyEditsChanged() => EditsChanged?.Invoke(this, EventArgs.Empty);

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.Clear(BackColor);
        if (_bitmap is null)
            return;

        var rect = GetImageRect();
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        e.Graphics.DrawImage(_bitmap, rect);

        if (!_dragging && _tool == EditTool.Chain && _chainAnchor is Point anchorPt)
        {
            var c1 = ImageToClient(anchorPt);
            var c2 = _chainHoverClient ?? c1;
            using var dash = new Pen(_strokeColor, 2) { DashStyle = DashStyle.Dash };
            e.Graphics.DrawLine(dash, c1, c2);
        }

        if (_dragging && _tool is EditTool.Crop or EditTool.Rectangle or EditTool.Circle or EditTool.Arrow or EditTool.Chain or EditTool.Stamp)
        {
            var c1 = ImageToClient(_startImg);
            var c2 = ImageToClient(_endImg);
            var preview = NormalizeRect(c1, c2);
            if (_tool is EditTool.Arrow or EditTool.Chain)
            {
                using var pen = new Pen(_strokeColor, 2);
                e.Graphics.DrawLine(pen, c1, c2);
            }
            else if (_tool == EditTool.Circle)
            {
                using var pen = new Pen(_strokeColor, 2);
                e.Graphics.DrawEllipse(pen, preview);
            }
            else if (_tool == EditTool.Stamp)
            {
                StampDrawing.Draw(e.Graphics, preview, _stampKind, _strokeColor, previewFrame: true);
            }
            else
            {
                using var pen = new Pen(_tool == EditTool.Crop ? Color.Lime : _strokeColor, 2)
                {
                    DashStyle = _tool == EditTool.Crop ? DashStyle.Dash : DashStyle.Solid,
                };
                e.Graphics.DrawRectangle(pen, preview);
            }
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
        _startImg = _tool == EditTool.Chain && _chainAnchor is Point chainStart ? chainStart : imgPt;
        _endImg = imgPt;

        if (_tool is EditTool.Pen or EditTool.Highlight)
            PushUndo();
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (_bitmap is null)
            return;

        if (!_dragging)
        {
            if (_tool == EditTool.Chain && _chainAnchor.HasValue)
            {
                _chainHoverClient = e.Location;
                Invalidate();
            }

            return;
        }

        _endImg = ClientToImage(e.Location);
        if (_tool is EditTool.Pen or EditTool.Highlight)
        {
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

        if (_tool is EditTool.Pen or EditTool.Highlight)
            return;

        var box = NormalizeRect(_startImg, _endImg);
        if (box.Width < 4 && box.Height < 4)
            return;

        PushUndo();
        switch (_tool)
        {
            case EditTool.Rectangle:
                DrawRectangleShape(_startImg, _endImg);
                break;
            case EditTool.Circle:
                DrawCircleShape(_startImg, _endImg);
                break;
            case EditTool.Arrow:
                DrawArrow(_startImg, _endImg);
                break;
            case EditTool.Chain:
                DrawChainSegment(_startImg, _endImg);
                _chainAnchor = _endImg;
                _chainHoverClient = ImageToClient(_endImg);
                break;
            case EditTool.Stamp:
                DrawStampShape(_startImg, _endImg);
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
        if (_bitmap is null || a == b)
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
            using var pen = new Pen(_strokeColor, 3);
            g.DrawLine(pen, a, b);
        }
    }

    void DrawChainSegment(Point a, Point b)
    {
        if (_bitmap is null || a == b)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_strokeColor, 3);
        g.DrawLine(pen, a, b);
    }

    void DrawRectangleShape(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_strokeColor, 3);
        g.DrawRectangle(pen, NormalizeRect(a, b));
    }

    void DrawCircleShape(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_strokeColor, 3);
        g.DrawEllipse(pen, NormalizeRect(a, b));
    }

    void DrawStampShape(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        StampDrawing.Draw(g, NormalizeRect(a, b), _stampKind, _strokeColor);
    }

    void DrawArrow(Point a, Point b)
    {
        if (_bitmap is null)
            return;
        using var g = Graphics.FromImage(_bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_strokeColor, 3);
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
        using var brush = new SolidBrush(_strokeColor);
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
        var maxW = Math.Max(1, Width - pad * 2);
        var maxH = Math.Max(1, Height - pad * 2);
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
            ClearUndo();
        }

        base.Dispose(disposing);
    }
}
