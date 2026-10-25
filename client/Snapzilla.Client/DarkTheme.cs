namespace Snapzilla.Client;

static class DarkTheme
{
    public static Color Bg { get; } = Color.FromArgb(12, 14, 18);
    public static Color BgElevated { get; } = Color.FromArgb(20, 24, 32);
    public static Color BgHover { get; } = Color.FromArgb(26, 31, 42);
    public static Color Text { get; } = Color.FromArgb(232, 236, 244);
    public static Color TextMuted { get; } = Color.FromArgb(139, 149, 168);
    public static Color Accent { get; } = Color.FromArgb(107, 159, 255);
    public static Color Border { get; } = Color.FromArgb(42, 49, 64);

    public static void Apply(Form form)
    {
        form.BackColor = Bg;
        form.ForeColor = Text;
        ApplyChildren(form.Controls);
    }

    public static void StylePrimary(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = Accent;
        btn.ForeColor = Bg;
        btn.Cursor = Cursors.Hand;
    }

    public static void StyleSecondary(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderColor = Border;
        btn.FlatAppearance.BorderSize = 1;
        btn.BackColor = BgElevated;
        btn.ForeColor = Text;
        btn.Cursor = Cursors.Hand;
    }

    public static void StyleInput(TextBox box)
    {
        box.BackColor = BgElevated;
        box.ForeColor = Text;
        box.BorderStyle = BorderStyle.FixedSingle;
    }

    public static void StyleLabel(Label label)
    {
        label.ForeColor = TextMuted;
        label.BackColor = Color.Transparent;
    }

    static void ApplyChildren(Control.ControlCollection controls)
    {
        foreach (Control c in controls)
        {
            if (c is Button b)
                StyleSecondary(b);
            else if (c is TextBox tb)
                StyleInput(tb);
            else if (c is Label lb)
                StyleLabel(lb);
            else if (c is Panel or FlowLayoutPanel or TableLayoutPanel)
            {
                c.BackColor = Bg;
                c.ForeColor = Text;
            }

            if (c.HasChildren)
                ApplyChildren(c.Controls);
        }
    }
}
