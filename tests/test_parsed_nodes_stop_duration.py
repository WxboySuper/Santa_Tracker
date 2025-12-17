from src.utils.locations import _parsed_nodes_to_locations


def test_non_numeric_stop_duration_sets_none():
    parsed_nodes = [
        {
            "id": "node_0",
            "location": {"name": "A", "lat": 10, "lng": 20, "timezone_offset": 0},
            "stop_experience": {"duration_seconds": "not-a-number"},
            "schedule": {},
            "notes": None,
            "priority": None,
        }
    ]

    locations = _parsed_nodes_to_locations(parsed_nodes)
    assert len(locations) == 1
    assert getattr(locations[0], "stop_duration") is None
