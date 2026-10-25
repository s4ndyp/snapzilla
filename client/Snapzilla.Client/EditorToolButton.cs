namespace Snapzilla.Client;

sealed class EditorToolButton : Button
{
    public EditTool Tool { get; }

    public EditorToolButton(EditTool tool, string accessibleName)
    {
        Tool = tool;
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

        EditorIconDrawing.DrawTool(g, ClientRectangle, Tool, ForeColor);
    }
}

sealed class EditorUndoButton : Button
{
    public EditorUndoButton()
    {
        AccessibleName = "Ongedaan";
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

        EditorIconDrawing.DrawUndo(g, ClientRectangle, ForeColor);
    }
}
