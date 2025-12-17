from src.utils.locations import _parsed_nodes_to_locations


def test_missing_timezone_offset_defaults_to_zero():
    parsed_nodes = [
        {
            "id": "node_0",
            "location": {"name": "A", "lat": 10, "lng": 20, "timezone_offset": None},
            "stop_experience": {},
            "schedule": {},
            "notes": None,
            "priority": None,
        }
    ]

    locations = _parsed_nodes_to_locations(parsed_nodes)
    assert len(locations) == 1
    loc = locations[0]
    assert getattr(loc, "utc_offset", None) == 0.0 or getattr(loc, "timezone_offset", None) == 0.0
