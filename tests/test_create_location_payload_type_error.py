import pytest
from src.utils.locations import create_location_from_payload


@pytest.mark.parametrize("bad_payload", [None, [], 123, "string"])
def test_create_location_from_payload_raises_typeerror_for_non_dict(bad_payload):
    with pytest.raises(TypeError) as exc:
        create_location_from_payload(bad_payload)
    assert str(exc.value) == "payload must be a dict"
