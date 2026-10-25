namespace Snapzilla.Client;

static class SimpleInputDialog
{
    public static string? Show(IWin32Window owner, string prompt, string defaultValue = "")
    {
        using var form = new Form
        {
            Text = "Snapzilla",
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(360, 120),
            MinimizeBox = false,
            MaximizeBox = false,
        };
        DarkTheme.Apply(form);

        var label = new Label
        {
            Text = prompt,
            AutoSize = true,
            Location = new Point(12, 12),
        };
        var box = new TextBox
        {
            Text = defaultValue,
            Location = new Point(12, 36),
            Width = 330,
        };
        DarkTheme.StyleInput(box);

        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Location = new Point(186, 72), Width = 75 };
        var cancel = new Button { Text = "Annuleren", DialogResult = DialogResult.Cancel, Location = new Point(267, 72), Width = 75 };
        DarkTheme.StylePrimary(ok);
        DarkTheme.StyleSecondary(cancel);

        form.Controls.AddRange([label, box, ok, cancel]);
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        return form.ShowDialog(owner) == DialogResult.OK ? box.Text : null;
    }
}
