namespace Snapzilla.Client;

sealed class StampIconButton : Button
{
    public StampKind Kind { get; }

    public StampIconButton(StampKind kind, string accessibleName)
    {
        Kind = kind;
        AccessibleName = accessibleName;
        Text = "";
        Size = new Size(34, 34);
        MinimumSize = Size;
        MaximumSize = Size;
        Margin = new Padding(0, 0, 4, 0);
        TabStop = false;
        DarkTheme.StyleSecondary(this);
        ForeColor = DarkTheme.Text;
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        var g = pevent.Graphics;
        g.Clear(BackColor);
        if (FlatAppearance.BorderSize > 0)
        {
            using var border = new Pen(FlatAppearance.BorderColor, FlatAppearance.BorderSize);
            var r = ClientRectangle;
            r.Width -= 1;
            r.Height -= 1;
            g.DrawRectangle(border, r);
        }

        var pad = 6;
        var inner = new Rectangle(pad, pad, Width - pad * 2, Height - pad * 2);
        StampDrawing.Draw(g, inner, Kind, ForeColor);
    }
}
