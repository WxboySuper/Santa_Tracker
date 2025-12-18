import logging

from src.utils import locations


def test_location_construction_failure_logs_and_skips(monkeypatch, caplog):
    caplog.set_level(logging.WARNING)

    class BadLocation:
        def __init__(self, *args, **kwargs):
            raise ValueError("bad location")

    monkeypatch.setattr(locations, "Location", BadLocation)

    parsed_nodes = [
        {
            "id": "node_0",
            "location": {"name": "A", "lat": 10, "lng": 20, "timezone_offset": 0},
            "stop_experience": {},
            "schedule": {},
            "notes": None,
            "priority": None,
        }
    ]

    result = locations._parsed_nodes_to_locations(parsed_nodes)
    assert result == []
    assert any(
        "skipping node while constructing Location ValueError" in rec.getMessage()
        for rec in caplog.records
    )
