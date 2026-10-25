using System.Drawing;

namespace Snapzilla.Client;

sealed class RegionCaptureForm : Form
{
    Point _start;
    Point _end;
    bool _dragging;

    public Rectangle? SelectedRegion { get; private set; }

    public RegionCaptureForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        ShowInTaskbar = false;
        DoubleBuffered = true;
        Cursor = Cursors.Cross;
        BackColor = Color.Black;
        Opacity = 0.35;
        KeyPreview = true;
        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape)
            {
                SelectedRegion = null;
                Close();
            }
        };
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        _dragging = true;
        _start = e.Location;
        _end = e.Location;
        base.OnMouseDown(e);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_dragging)
        {
            _end = e.Location;
            Invalidate();
        }
        base.OnMouseMove(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (_dragging)
        {
            _dragging = false;
            _end = e.Location;
            var rect = Normalize(_start, _end);
            if (rect.Width > 4 && rect.Height > 4)
            {
                SelectedRegion = rect;
                Opacity = 0;
                DialogResult = DialogResult.OK;
                Close();
            }
        }
        base.OnMouseUp(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (!_dragging && _start == _end) return;
        var rect = Normalize(_start, _end);
        using var pen = new Pen(Color.Lime, 2);
        e.Graphics.DrawRectangle(pen, rect);
    }

    static Rectangle Normalize(Point a, Point b)
    {
        var x = Math.Min(a.X, b.X);
        var y = Math.Min(a.Y, b.Y);
        var w = Math.Abs(a.X - b.X);
        var h = Math.Abs(a.Y - b.Y);
        return new Rectangle(x, y, w, h);
    }
}
