import logging

from src.utils.locations import _location_validate_and_normalize_coords


def test_location_warns_when_float_fails_on_second_call(monkeypatch, caplog):
    class Loc:
        def __init__(self):
            self.name = "Wonk"
            self.lat = 10.0
            self.lng = 20.0
            # string that float() can parse on first call
            self.timezone_offset = "5"

    loc = Loc()
    real_float = float
    state = {"count": 0}

    def fake_float(x):
        state["count"] += 1
        # fail on the fourth float() invocation (lat, lng, tz initial, then tz re-check)
        if state["count"] == 4:
            raise TypeError("forced failure on fourth float")
        return real_float(x)

    monkeypatch.setattr("builtins.float", fake_float)
    caplog.set_level(logging.WARNING)

    # Should complete range checks (first float), then hit the inner try/except
    _location_validate_and_normalize_coords(loc)

    assert any(
        "Unusual UTC offset for location 'Wonk'" in rec.getMessage()
        for rec in caplog.records
    )
