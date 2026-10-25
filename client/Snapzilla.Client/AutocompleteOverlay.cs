namespace Snapzilla.Client;

sealed class AutocompleteOverlay
{
    readonly Form _owner;
    readonly ListBox _list;
    Control? _anchor;
    Action<string>? _onPick;

    public AutocompleteOverlay(Form owner)
    {
        _owner = owner;
        _list = new ListBox
        {
            Visible = false,
            IntegralHeight = false,
            BorderStyle = BorderStyle.FixedSingle,
            Font = owner.Font,
        };
        _list.BackColor = DarkTheme.BgElevated;
        _list.ForeColor = DarkTheme.Text;
        _list.Click += (_, _) => PickFocused();
        _list.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter)
            {
                PickFocused();
                e.Handled = true;
            }
            else if (e.KeyCode == Keys.Escape)
            {
                Hide();
                e.Handled = true;
            }
        };

        owner.Controls.Add(_list);
        _list.BringToFront();
    }

    public void ShowBelow(Control anchor, IReadOnlyList<string> items, Action<string> onPick)
    {
        if (items.Count == 0)
        {
            Hide();
            return;
        }

        _anchor = anchor;
        _onPick = onPick;
        _list.Items.Clear();
        foreach (var item in items)
            _list.Items.Add(item);

        const int rowHeight = 20;
        var height = Math.Clamp(items.Count * rowHeight + 4, rowHeight + 4, 180);
        var screen = anchor.PointToScreen(new Point(0, anchor.Height));
        var client = _owner.PointToClient(screen);
        _list.SetBounds(client.X, client.Y, anchor.Width, height);
        _list.Visible = true;
        _list.BringToFront();
        if (_list.Items.Count > 0)
            _list.SelectedIndex = 0;
    }

    public void Hide()
    {
        _list.Visible = false;
        _anchor = null;
        _onPick = null;
    }

    public bool Visible => _list.Visible;

    public bool ContainsFocus => _list.Focused;

    public void PickFocused()
    {
        if (_list.SelectedItem is not string value || _onPick is null)
            return;

        _onPick(value);
        Hide();
    }

    public bool HandlePreviewKey(Keys key)
    {
        if (!_list.Visible)
            return false;

        if (key == Keys.Down)
        {
            _list.SelectedIndex = Math.Min(_list.Items.Count - 1, _list.SelectedIndex + 1);
            return true;
        }

        if (key == Keys.Up)
        {
            _list.SelectedIndex = Math.Max(0, _list.SelectedIndex - 1);
            return true;
        }

        if (key == Keys.Enter)
        {
            PickFocused();
            return true;
        }

        if (key == Keys.Escape)
        {
            Hide();
            return true;
        }

        return false;
    }
}
