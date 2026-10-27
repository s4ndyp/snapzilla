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
    public static Color FilterPinkBg { get; } = Color.FromArgb(72, 236, 72, 153);
    public static Color FilterPinkBorder { get; } = Color.FromArgb(140, 244, 114, 182);
    public static Color FilterPinkText { get; } = Color.FromArgb(255, 214, 236);

    public static void Apply(Form form)
    {
        form.Icon = SnapzillaIcons.App;
        form.BackColor = Bg;
        form.ForeColor = Text;
        DarkTitleBarHelper.Enable(form);
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
        btn.Font = new Font(btn.Font, FontStyle.Regular);
    }

    /** Distinct capture actions in the screenshot hub. */
    public static void StyleCaptureButton(Button btn, Color back, Color fore)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 0;
        btn.BackColor = back;
        btn.ForeColor = fore;
        btn.Cursor = Cursors.Hand;
        btn.Font = new Font(btn.Font, FontStyle.Bold);
    }

    public static void StyleToolActive(Button btn)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderColor = FilterPinkBorder;
        btn.FlatAppearance.BorderSize = 1;
        btn.BackColor = FilterPinkBg;
        btn.ForeColor = FilterPinkText;
        btn.Cursor = Cursors.Hand;
        btn.Font = new Font(btn.Font, FontStyle.Bold);
    }

    public static void StyleColorChip(Button btn, bool active)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.FlatAppearance.BorderSize = 2;
        btn.FlatAppearance.BorderColor = active ? FilterPinkBorder : Border;
        btn.Width = 22;
        btn.Height = 22;
        btn.Margin = new Padding(0, 0, 4, 0);
        btn.Cursor = Cursors.Hand;
        btn.TabStop = false;
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
