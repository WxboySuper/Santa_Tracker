from src.utils.locations import _range_and_tz_checks


class WeirdTZ:
    # Allow numeric comparisons so range checks don't raise, but float() will fail
    def __le__(self, other):
        return True

    def __ge__(self, other):
        return True

    def __repr__(self):
        return "<WeirdTZ>"


def test_unusual_tz_non_numeric_emits_warning():
    errors, warnings = _range_and_tz_checks(10.0, 20.0, WeirdTZ(), "LocName", 3)
    assert errors == []
    assert any("Unusual UTC offset for 'LocName' (index 3):" in w for w in warnings)
