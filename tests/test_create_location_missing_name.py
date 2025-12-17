import pytest
from src.utils.locations import create_location_from_payload


@pytest.mark.parametrize("payload", [
    {},
    {"name": ""},
    {"name": None},
    {"location": ""},
    {"location": None},
])
def test_create_location_from_payload_missing_name_raises_value_error(payload):
    with pytest.raises(ValueError) as exc:
        create_location_from_payload(payload)
    assert str(exc.value) == "Missing required field: name"
