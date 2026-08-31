import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.locations import validate_locations  # noqa: E402


class LocationWithInvalidData:
    name = "Test location"

    @property
    def lat(self):
        raise ValueError("private parser details")


def test_validation_does_not_return_exception_text():
    result = validate_locations([LocationWithInvalidData()])

    assert result["errors"] == ["Invalid location data at index 0"]
    assert "private parser details" not in str(result)
