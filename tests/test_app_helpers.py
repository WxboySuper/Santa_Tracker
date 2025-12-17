"""Unit tests for small helpers in src.app."""

import pytest

from src.app import _parse_numeric_fields


def test_parse_numeric_fields_missing_raises_value_error():
    """If any required numeric field is missing, raise ValueError."""
    # Missing 'latitude'
    loc = {"longitude": 0.0, "utc_offset": 0.0}
    with pytest.raises(ValueError, match="Missing required field"):
        _parse_numeric_fields(loc)


def test_parse_numeric_fields_none_value_raises_value_error():
    """If any required numeric field is None, raise ValueError."""
    loc = {"latitude": None, "longitude": 0.0, "utc_offset": 0.0}
    with pytest.raises(ValueError, match="Missing required field"):
        _parse_numeric_fields(loc)


def test_parse_numeric_fields_valid_strings_and_numbers():
    """Valid numeric strings or numbers are converted to floats and returned."""
    loc = {"latitude": "10.5", "longitude": 20, "utc_offset": "-5"}
    lat, lon, tz = _parse_numeric_fields(loc)
    assert isinstance(lat, float) and lat == 10.5
    assert isinstance(lon, float) and lon == 20.0
    assert isinstance(tz, float) and tz == -5.0


def test_make_location_from_parsed_constructs_location():
    """_make_location_from_parsed should build a Location with given fields."""
    from src.app import _make_location_from_parsed
    # `src.app` imports `Location` from `utils.locations` (no `src.` prefix),
    # so import the same symbol to ensure isinstance checks succeed.
    from utils.locations import Location

    name = "Test City"
    loc_data = {
        "arrival_time": "2024-12-01T00:00:00Z",
        "departure_time": "2024-12-01T01:00:00Z",
        "country": "Nowhere",
        "population": 42,
        "priority": 2,
    }

    lat = 12.34
    lon = 56.78
    tz = 1.5
    notes = "a note"

    loc = _make_location_from_parsed(name, loc_data, lat, lon, tz, notes)
    assert isinstance(loc, Location)
    # legacy fields should be set as provided
    assert loc.latitude == lat
    assert loc.longitude == lon
    assert loc.utc_offset == tz
    assert loc.name == name
    assert loc.arrival_time == loc_data["arrival_time"]
    assert loc.departure_time == loc_data["departure_time"]
    assert loc.country == loc_data["country"]
    assert loc.population == loc_data["population"]
    assert loc.priority == loc_data["priority"]


def test_make_location_from_parsed_is_stop_default_and_override():
    """Verify `is_stop` default True and respects explicit False."""
    from src.app import _make_location_from_parsed

    # default: not present -> True
    loc_default = _make_location_from_parsed("A", {}, 0, 0, 0, None)
    assert getattr(loc_default, "is_stop", None) is True

    # explicit False respected
    loc_false = _make_location_from_parsed("B", {"is_stop": False}, 0, 0, 0, None)
    assert getattr(loc_false, "is_stop", None) is False


def test_parse_location_from_data_create_location_value_error():
    """If `create_location_from_payload` raises ValueError, return error tuple."""
    from src.app import _parse_location_from_data
    from unittest.mock import patch

    loc = {
        "name": "X",
        "latitude": 10,
        "longitude": 20,
        "utc_offset": 0,
    }

    with patch("src.app.create_location_from_payload", side_effect=ValueError("boom")):
        result, err = _parse_location_from_data(loc, 7)
        assert result is None
        assert err == "Location at index 7: Invalid data"


def test_parse_location_from_data_create_location_type_error():
    """If `create_location_from_payload` raises TypeError, return error tuple."""
    from src.app import _parse_location_from_data
    from unittest.mock import patch

    loc = {
        "name": "Y",
        "latitude": 10,
        "longitude": 20,
        "utc_offset": 0,
    }

    with patch("src.app.create_location_from_payload", side_effect=TypeError("boom")):
        result, err = _parse_location_from_data(loc, 8)
        assert result is None
        assert err == "Location at index 8: Invalid data"


def test_parse_location_from_data_invalid_numeric_string():
    """Non-numeric string values should cause Invalid data (ValueError)"""
    from src.app import _parse_location_from_data

    loc = {
        "name": "Z",
        "latitude": "not-a-number",
        "longitude": "also-not",
        "utc_offset": "tz",
    }

    result, err = _parse_location_from_data(loc, 3)
    assert result is None
    assert err == "Location at index 3: Invalid data"


def test_parse_location_from_data_invalid_numeric_type():
    """Unsupported types (like list) should cause Invalid data (TypeError)"""
    from src.app import _parse_location_from_data

    loc = {
        "name": "W",
        "latitude": [1, 2, 3],
        "longitude": [4, 5, 6],
        "utc_offset": None if False else 0,
    }

    result, err = _parse_location_from_data(loc, 4)
    assert result is None
    assert err == "Location at index 4: Invalid data"


def test_parse_location_from_data_invalid_latitude_range():
    """Latitude outside [-90, 90] should return specific invalid-latitude error."""
    from src.app import _parse_location_from_data

    loc = {
        "name": "OutOfBoundsLat",
        "latitude": 100.0,
        "longitude": 0.0,
        "utc_offset": 0,
    }

    result, err = _parse_location_from_data(loc, 0)
    assert result is None
    assert err == "Location at index 0: Invalid latitude"


def test_parse_location_from_data_invalid_longitude_range():
    """Longitude outside [-180, 180] should return specific invalid-longitude error."""
    from src.app import _parse_location_from_data

    loc = {
        "name": "OutOfBoundsLon",
        "latitude": 0.0,
        "longitude": 200.0,
        "utc_offset": 0,
    }

    result, err = _parse_location_from_data(loc, 1)
    assert result is None
    assert err == "Location at index 1: Invalid longitude"


def test_parse_location_from_data_invalid_utc_offset_range():
    """utc_offset outside [-12, 14] should return specific invalid-utc_offset error."""
    from src.app import _parse_location_from_data

    loc = {
        "name": "OutOfBoundsTZ",
        "latitude": 0.0,
        "longitude": 0.0,
        "utc_offset": 20.0,
    }

    result, err = _parse_location_from_data(loc, 2)
    assert result is None
    assert err == "Location at index 2: Invalid utc_offset"


def test_simulate_route_propagates_build_error():
    """
    If _build_simulated_from_locations returns an error, simulate_route returns it.
    """
    from src.app import app, simulate_route
    from unittest.mock import patch
    from flask import jsonify

    # Use a request context so `request` is available to the view.
    with app.test_request_context("/api/admin/route/simulate", method="POST", json={}):
        # Ensure there is at a location so simulate_route proceeds to call the builder
        with patch("src.app.load_santa_route_from_json", return_value=[object()]):
            error_response = (jsonify({"error": "Invalid location_ids"}), 400)
            with patch(
                "src.app._build_simulated_from_locations",
                return_value=(None, None, error_response),
            ):
                # Call the original function bypassing the auth decorator
                result = simulate_route.__wrapped__()
                assert result == error_response


def test_simulate_route_propagates_build_error_via_client():
    """Calling the endpoint via test client returns the error from the builder."""
    import os
    from src.app import app as appmod
    from unittest.mock import patch

    os.environ["ADMIN_PASSWORD"] = "testpass"

    with patch("src.app.load_santa_route_from_json", return_value=[object()]):
        with patch(
            "src.app._build_simulated_from_locations",
            return_value=(None, None, ({"error": "Invalid location_ids"}, 400)),
        ):
            client = appmod.test_client()
            resp = client.post(
                "/api/admin/route/simulate",
                json={},
                headers={"Authorization": "Bearer testpass"},
            )
            assert resp.status_code == 400
            assert resp.get_json() == {"error": "Invalid location_ids"}


def test_normalize_loc_item_none_returns_namespace():
    """
    Passing None to _normalize_loc_item returns a SimpleNamespace with None fields.
    """
    from src.app import _normalize_loc_item
    from types import SimpleNamespace

    ns = _normalize_loc_item(None)
    assert isinstance(ns, SimpleNamespace)
    assert ns.name is None
    assert ns.latitude is None
    assert ns.longitude is None
    assert ns.utc_offset is None
    assert ns.arrival_time is None
    assert ns.departure_time is None
    assert ns.country is None
    assert ns.population is None
    assert ns.priority is None
    assert ns.notes is None
    assert ns.stop_duration is None
    assert ns.is_stop is None
    assert ns.type is None


def test_normalize_loc_item_from_flat_dict_maps_fields():
    """Legacy flat dict should map directly to namespace fields."""
    from src.app import _normalize_loc_item

    d = {
        "name": "Flat",
        "latitude": 1.1,
        "longitude": 2.2,
        "utc_offset": 3.0,
        "arrival_time": "a",
        "departure_time": "b",
        "country": "C",
        "population": 10,
        "priority": 5,
        "notes": None,
        "fun_facts": "fun",
        "stop_duration": 7,
        "is_stop": False,
        "type": "anchor",
    }

    ns = _normalize_loc_item(d)
    assert ns.name == "Flat"
    assert ns.latitude == 1.1
    assert ns.longitude == 2.2
    assert ns.utc_offset == 3.0
    assert ns.arrival_time == "a"
    assert ns.departure_time == "b"
    assert ns.country == "C"
    assert ns.population == 10
    assert ns.priority == 5
    # notes should fall back to fun_facts when notes is falsy
    assert ns.notes == "fun"
    assert ns.stop_duration == 7
    assert ns.is_stop is False
    assert ns.type == "anchor"


def test_normalize_from_nested_dict_maps_fields():
    """Nested schema dict should be normalized correctly."""
    from src.app import _normalize_loc_item

    d = {
        "location": {
            "name": "Nested",
            "lat": 10.0,
            "lng": 20.0,
            "timezone_offset": -5.0,
            "type": "anchor",
            "region": "CountryX",
        },
        "schedule": {
            "arrival_utc": "2024-12-01T00:00:00Z",
            "departure_utc": "2024-12-01T01:00:00Z",
        },
        "stop_experience": {"duration_seconds": 300},
        "population": 1000,
        "priority": 1,
        "notes": "note",
        "is_stop": True,
    }

    ns = _normalize_loc_item(d)
    assert ns.name == "Nested"
    assert ns.latitude == 10.0
    assert ns.longitude == 20.0
    assert ns.utc_offset == -5.0
    assert ns.arrival_time == "2024-12-01T00:00:00Z"
    assert ns.departure_time == "2024-12-01T01:00:00Z"
    assert ns.country == "CountryX"
    assert ns.population == 1000
    assert ns.priority == 1
    assert ns.notes == "note"
    # duration_seconds 300 -> 5 minutes
    assert ns.stop_duration == 5
    assert ns.is_stop is True
    assert ns.type == "anchor"


def test_normalize_loc_item_from_object_maps_attributes():
    """Objects with attributes should be normalized via getattr fallbacks."""
    from src.app import _normalize_loc_item

    class Dummy:
        pass

    o = Dummy()
    o.name = "Obj"
    o.lat = 12.0
    o.lng = 34.0
    o.timezone_offset = 2.0
    o.arrival_time = "arr"
    o.departure_time = "dep"
    o.region = "Reg"
    o.population = 55
    o.priority = None
    o.notes = None
    o.fun_facts = "facts"
    o.stop_duration = 9
    o.is_stop = True
    o.node_type = "node"

    ns = _normalize_loc_item(o)
    assert ns.name == "Obj"
    assert ns.latitude == 12.0
    assert ns.longitude == 34.0
    assert ns.utc_offset == 2.0
    assert ns.arrival_time == "arr"
    assert ns.departure_time == "dep"
    assert ns.country == "Reg"
    assert ns.population == 55
    assert ns.priority is None
    # notes should fallback to fun_facts
    assert ns.notes == "facts"
    assert ns.stop_duration == 9
    assert ns.is_stop is True
    assert ns.type == "node"


def test_compute_stop_duration_invalid_duration_seconds_returns_legacy():
    """If duration_seconds is present but invalid, fallback to legacy stop_duration."""
    from src.app import _compute_stop_duration_from_stop_experience

    se = {"duration_seconds": "not-a-number"}
    d = {"stop_duration": 42}
    assert _compute_stop_duration_from_stop_experience(se, d) == 42


def test_compute_stop_duration_none_or_missing_returns_legacy():
    """When stop_experience missing or duration_seconds is None, return legacy value."""
    from src.app import _compute_stop_duration_from_stop_experience

    # missing duration_seconds
    se = {}
    d = {"stop_duration": 7}
    assert _compute_stop_duration_from_stop_experience(se, d) == 7

    # stop_experience is None
    se = None
    d = {"stop_duration": None}
    assert _compute_stop_duration_from_stop_experience(se, d) is None


def test_load_santa_route_from_json_with_source_calls_original_loader():
    """
    When `source` is provided, wrapper should return the original loader's raw result.
    """
    from src.app import load_santa_route_from_json
    from unittest.mock import patch

    sentinel = [{"raw": True}]
    with patch("src.app._orig_load_santa_route", return_value=sentinel) as mock_orig:
        res = load_santa_route_from_json(source="somefile.json")
        mock_orig.assert_called_once_with("somefile.json")
        assert res is sentinel
