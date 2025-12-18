import pytest

from src.utils.locations import _location_validate_and_normalize_coords


class DummyLoc:
    def __init__(self, lat, lng, timezone_offset=None, name="TestLoc"):
        self.lat = lat
        self.lng = lng
        self.timezone_offset = timezone_offset
        self.name = name


def test_timezone_offset_required_raises_value_error():
    loc = DummyLoc(10.0, 20.0, timezone_offset=None, name="NoTZ")
    with pytest.raises(ValueError) as exc:
        _location_validate_and_normalize_coords(loc)
    assert "timezone_offset is required for Location" in str(exc.value)
