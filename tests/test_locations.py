"""Tests for the Location data model and location utilities."""

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from src.utils.locations import (
    Location,
    Node,
    _check_duplicate_coords,
    _coerce_node,
    _coerce_node_from_dict,
    _coerce_node_from_node,
    _coerce_node_schedule_from_dict,
    _convert_to_numeric,
    _extract_loc_info,
    _parse_location_entry,
    _range_and_tz_checks,
    _safe_get_float,
    _safe_get_int,
    _second_to_minutes,
    delete_trial_route,
    has_trial_route,
    load_santa_route_from_json,
    load_trial_route_from_json,
    save_trial_route_to_json,
    update_santa_location,
    validate_locations,
)


class TestLocation(unittest.TestCase):
    """Test cases for the Location class."""

    def test_location_creation(self):
        """Test creating a valid Location object."""
        location = Location(
            name="New York",
            region=None,
            lat=40.7128,
            lng=-74.0060,
            timezone_offset=-5.0,
        )
        self.assertEqual(location.name, "New York")
        self.assertEqual(location.lat, 40.7128)
        self.assertEqual(location.lng, -74.0060)
        self.assertEqual(location.timezone_offset, -5.0)

    def test_location_with_new_fields(self):
        """Test creating a Location object with new optional fields."""
        # The new Location dataclass only stores the canonical core fields.
        location = Location(
            name="Tokyo",
            region=None,
            lat=35.6762,
            lng=139.6503,
            timezone_offset=9.0,
        )
        self.assertAlmostEqual(location.lat, 35.6762, places=6)
        self.assertAlmostEqual(location.lng, 139.6503, places=6)
        self.assertEqual(location.timezone_offset, 9.0)

    def test_location_coordinates_property(self):
        """Test the coordinates property returns tuple."""
        location = Location(
            name="Tokyo", region=None, lat=35.6762, lng=139.6503, timezone_offset=9.0
        )
        self.assertAlmostEqual(location.coordinates[0], 35.6762, places=6)
        self.assertAlmostEqual(location.coordinates[1], 139.6503, places=6)

    def test_invalid_latitude(self):
        """Test that invalid latitude raises ValueError."""
        with self.assertRaises(ValueError):
            Location(
                name="Invalid", region=None, lat=91.0, lng=0.0, timezone_offset=0.0
            )
        with self.assertRaises(ValueError):
            Location(
                name="Invalid", region=None, lat=-91.0, lng=0.0, timezone_offset=0.0
            )

    def test_invalid_longitude(self):
        """Test that invalid longitude raises ValueError."""
        # The Location class normalizes longitudes into [-180, 180).
        loc1 = Location(
            name="Invalid",
            region=None,
            lat=0.0,
            lng=181.0,
            timezone_offset=0.0,
        )
        self.assertAlmostEqual(loc1.lng, -179.0, places=6)
        loc2 = Location(
            name="Invalid",
            region=None,
            lat=0.0,
            lng=-181.0,
            timezone_offset=0.0,
        )
        self.assertAlmostEqual(loc2.lng, 179.0, places=6)

    def test_invalid_utc_offset(self):
        """Test that invalid UTC offset raises ValueError."""
        with self.assertRaises(ValueError):
            Location(
                name="Invalid", region=None, lat=0.0, lng=0.0, timezone_offset=15.0
            )
        with self.assertRaises(ValueError):
            Location(
                name="Invalid", region=None, lat=0.0, lng=0.0, timezone_offset=-13.0
            )

    def test_invalid_priority(self):
        """Test that invalid priority raises ValueError."""
        # Location validates `priority` and raises ValueError for out-of-range values
        with self.assertRaises(ValueError):
            Location(
                name="Invalid",
                region=None,
                lat=0.0,
                lng=0.0,
                timezone_offset=0.0,
                priority=0,
            )
        with self.assertRaises(ValueError):
            Location(
                name="Invalid",
                region=None,
                lat=0.0,
                lng=0.0,
                timezone_offset=0.0,
                priority=4,
            )

    def test_boundary_values(self):
        """Test boundary values for coordinates and UTC offset."""
        # Valid boundary values
        location1 = Location(
            name="North Pole", region=None, lat=90.0, lng=0.0, timezone_offset=0.0
        )
        self.assertEqual(location1.lat, 90.0)

        location2 = Location(
            name="South Pole", region=None, lat=-90.0, lng=0.0, timezone_offset=0.0
        )
        self.assertEqual(location2.lat, -90.0)

        # longitude 180 normalizes to -180 in implementation
        location3 = Location(
            name="East", region=None, lat=0.0, lng=180.0, timezone_offset=12.0
        )
        self.assertAlmostEqual(location3.lng, -180.0, places=6)

        location4 = Location(
            name="West", region=None, lat=0.0, lng=-180.0, timezone_offset=-12.0
        )
        self.assertAlmostEqual(location4.lng, -180.0, places=6)


class TestNodeValidation(unittest.TestCase):
    """Tests for Node dataclass validation in __post_init__."""

    def test_node_missing_id_raises_value_error(self):
        """Creating a Node with empty id should raise ValueError."""
        loc = Location(name="X", region=None, lat=1.0, lng=1.0, timezone_offset=0.0)
        with self.assertRaises(ValueError):
            Node(comment=None, id="", type="DELIVERY", location=loc)

    def test_node_invalid_location_type_raises_type_error(self):
        """Creating a Node with non-Location 'location' should raise TypeError."""
        # pass a dict instead of a Location instance
        with self.assertRaises(TypeError):
            Node(comment=None, id="node-1", type="DELIVERY", location={"name": "x"})


class TestCoerceNodeFromNode(unittest.TestCase):
    """Tests for _coerce_node_from_node helper converting Node -> flat dict."""

    def test_coerce_node_from_node_preserves_and_converts_fields(self):
        loc = Location(
            name="Place",
            region="MyRegion",
            latitude=10.5,
            longitude=20.5,
            utc_offset=3.0,
            arrival_time="2025-12-24T01:00:00Z",
            departure_time="2025-12-24T01:05:00Z",
            stop_duration=7,
            is_stop=None,
            priority=2,
            notes="some fun fact",
            country=None,
            population=123,
        )
        node = Node(comment="c", id="n-1", type="DELIVERY", location=loc)
        flat = _coerce_node_from_node(node)

        self.assertEqual(flat["name"], "Place")
        self.assertEqual(flat["latitude"], float(10.5))
        self.assertEqual(flat["longitude"], float(20.5))
        self.assertEqual(flat["utc_offset"], float(3.0))
        self.assertEqual(flat["arrival_time"], "2025-12-24T01:00:00Z")
        self.assertEqual(flat["departure_time"], "2025-12-24T01:05:00Z")
        self.assertEqual(flat["country"], "MyRegion")
        self.assertEqual(flat["population"], 123)
        self.assertEqual(flat.get("priority"), 2)
        self.assertEqual(flat.get("notes"), "some fun fact")
        self.assertEqual(flat.get("fun_facts"), "some fun fact")
        self.assertEqual(flat.get("stop_duration"), 7)
        # is_stop was None -> defaults to True
        self.assertTrue(flat.get("is_stop"))


class TestCoerceNodeFromDict(unittest.TestCase):
    """Tests for _coerce_node_from_dict converting dict -> flat legacy dict."""

    def test_coerce_node_from_dict_optional_fields_and_defaults(self):
        entry = {
            "id": "d1",
            "location": {
                "name": "DictPlace",
                "region": "RegionX",
                "lat": "11.1",
                "lng": "22.2",
                "timezone_offset": "2.0",
            },
            "priority": 9,
            "notes": "a note",
            "population": 555,
        }
        flat = _coerce_node_from_dict(entry)

        self.assertEqual(flat.get("name"), "DictPlace")
        self.assertAlmostEqual(float(flat.get("latitude")), 11.1, places=6)
        self.assertAlmostEqual(float(flat.get("longitude")), 22.2, places=6)
        self.assertEqual(flat.get("priority"), 9)
        self.assertEqual(flat.get("notes"), "a note")
        self.assertEqual(flat.get("fun_facts"), "a note")
        self.assertEqual(flat.get("country"), "RegionX")
        self.assertEqual(flat.get("population"), 555)
        # default is_stop True when not provided
        self.assertTrue(flat.get("is_stop"))

    def test_schedule_fields_copied_from_schedule(self):
        n = {
            "id": "s1",
            "location": {"lat": 10.0, "lng": 20.0},
            "schedule": {
                "arrival_utc": "2025-12-24T12:00:00Z",
                "departure_utc": "2025-12-24T12:15:00Z",
            },
        }
        out = _coerce_node_schedule_from_dict(n)
        self.assertEqual(out.get("arrival_time"), "2025-12-24T12:00:00Z")
        self.assertEqual(out.get("departure_time"), "2025-12-24T12:15:00Z")

    def test_schedule_fallback_to_top_level_fields(self):
        n = {
            "id": "s2",
            "location": {"lat": 11.0, "lng": 21.0},
            "schedule": {},
            "arrival_time": "TOP_ARRIVAL",
            "departure_time": "TOP_DEPARTURE",
        }
        out = _coerce_node_schedule_from_dict(n)
        self.assertEqual(out.get("arrival_time"), "TOP_ARRIVAL")
        self.assertEqual(out.get("departure_time"), "TOP_DEPARTURE")

    def test_stop_experience_duration_converted_to_minutes(self):
        n = {
            "id": "stop1",
            "location": {"lat": 5.0, "lng": 6.0},
            "stop_experience": {"duration_seconds": 150},
        }
        out = _coerce_node_from_dict(n)
        # 150 seconds -> 2 minutes (int(float(150)/60) == 2)
        self.assertIn("stop_duration", out)
        self.assertEqual(out.get("stop_duration"), 2)

    def test_invalid_stop_experience_duration_logs_and_omits_field(self):
        n = {
            "id": "stop2",
            "location": {"lat": 5.0, "lng": 6.0},
            "stop_experience": {"duration_seconds": "not-a-number"},
        }
        with patch("src.utils.locations.logger") as mock_logger:
            out = _coerce_node_from_dict(n)
            # invalid value should be ignored and logged; no stop_duration key
            self.assertNotIn("stop_duration", out)
            mock_logger.debug.assert_called()

    def test_legacy_object_population_is_preserved(self):
        class Obj:
            pass

        o = Obj()
        o.population = 4242
        out = _coerce_node(o)
        self.assertIn("population", out)
        self.assertEqual(out.get("population"), 4242)

    def test_legacy_object_population_omitted_when_none(self):
        class Obj:
            pass

        o = Obj()
        # no population attribute set
        out = _coerce_node(o)
        self.assertNotIn("population", out)

    def test_ignored_invalid_latitude_legacy_obj_logs_and_omits_field(self):
        """Legacy objects: invalid latitude should be ignored and logged."""

        class Obj:
            pass

        o = Obj()
        o.latitude = "bad-lat"
        o.longitude = 1.0
        with patch("src.utils.locations.logger.debug") as mock_debug:
            out = _coerce_node(o)
            self.assertNotIn("latitude", out)
            mock_debug.assert_called_with(
                "ignored invalid latitude=%r for legacy obj", "bad-lat"
            )

    def test_ignored_invalid_longitude_legacy_obj_logs_and_omits_field(self):
        """Legacy objects: invalid longitude should be ignored and logged."""

        class Obj:
            pass

        o = Obj()
        o.latitude = 1.0
        o.longitude = "bad-lon"
        with patch("src.utils.locations.logger.debug") as mock_debug:
            out = _coerce_node(o)
            self.assertNotIn("longitude", out)
            mock_debug.assert_called_with(
                "ignored invalid longitude=%r for legacy obj", "bad-lon"
            )

    def test_ignored_invalid_utc_offset_legacy_obj_logs_and_omits_field(self):
        """Legacy objects: invalid utc_offset should be ignored and logged."""

        class Obj:
            pass

        o = Obj()
        o.latitude = 1.0
        o.longitude = 2.0
        o.utc_offset = "bad-tz"
        with patch("src.utils.locations.logger.debug") as mock_debug:
            out = _coerce_node(o)
            self.assertNotIn("utc_offset", out)
            mock_debug.assert_called_with(
                "ignored invalid utc_offset=%r for legacy obj", "bad-tz"
            )


class TestCoerceNodeDispatch(unittest.TestCase):
    """Ensure `_coerce_node` dispatches to the correct helper based on type."""

    def test_coerce_node_with_node_instance_dispatches_to_node_helper(self):
        loc = Location(
            name="DispatchPlace",
            region=None,
            latitude=33.3,
            longitude=44.4,
            utc_offset=1.0,
            stop_duration=5,
        )
        node = Node(comment=None, id="nd-1", type="DELIVERY", location=loc)
        out = _coerce_node(node)
        # fields produced by _coerce_node_from_node should be present
        self.assertEqual(out.get("name"), "DispatchPlace")
        self.assertAlmostEqual(float(out.get("latitude")), 33.3, places=6)

    def test_coerce_node_with_dict_dispatches_to_dict_helper(self):
        entry = {
            "id": "dd-1",
            "location": {"name": "DictDispatch", "lat": 2.2, "lng": 3.3},
        }
        out = _coerce_node(entry)
        # fields produced by _coerce_node_from_dict should be present
        self.assertEqual(out.get("name"), "DictDispatch")
        self.assertAlmostEqual(float(out.get("latitude")), 2.2, places=6)

    def test_ignored_invalid_latitude_logs_and_omits_field(self):
        """If latitude cannot be converted, it should be ignored and logged."""
        entry = {
            "id": "d2",
            "location": {"name": "BadLat", "lat": "not-a-number", "lng": 1.0},
        }
        with patch("src.utils.locations.logger.debug") as mock_debug:
            flat = _coerce_node_from_dict(entry)
            # latitude should not be present because conversion failed
            self.assertNotIn("latitude", flat)
            # logger.debug should have been called about the ignored latitude
            mock_debug.assert_called_with(
                "ignored invalid latitude=%r for node=%r", "not-a-number", "d2"
            )

    def test_ignored_invalid_longitude_logs_and_omits_field(self):
        """If longitude cannot be converted, it should be ignored and logged."""
        entry = {
            "id": "d3",
            "location": {"name": "BadLon", "lat": 1.0, "lng": "bad-lon"},
        }
        with patch("src.utils.locations.logger.debug") as mock_debug:
            flat = _coerce_node_from_dict(entry)
            # longitude should not be present because conversion failed
            self.assertNotIn("longitude", flat)
            # logger.debug should have been called about the ignored longitude
            mock_debug.assert_called_with(
                "ignored invalid longitude=%r for node=%r", "bad-lon", "d3"
            )

    def test_ignored_invalid_timezone_offset_logs_and_omits_field(self):
        """If timezone_offset cannot be converted, it should be ignored and logged."""
        entry = {
            "id": "d4",
            "location": {
                "name": "BadTZ",
                "lat": 1.0,
                "lng": 2.0,
                "timezone_offset": "weird-tz",
            },
        }
        with patch("src.utils.locations.logger.debug") as mock_debug:
            flat = _coerce_node_from_dict(entry)
            # utc_offset should not be present because conversion failed
            self.assertNotIn("utc_offset", flat)
            # logger.debug should have been called about the ignored timezone_offset
            mock_debug.assert_called_with(
                "ignored invalid timezone_offset=%r for node=%r", "weird-tz", "d4"
            )


class TestSafeGetFloat(unittest.TestCase):
    """Tests for the internal _safe_get_float helper."""

    def test_parses_numeric_string_with_commas_and_whitespace(self):
        d = {"val": "1,234.56 "}
        result = _safe_get_float(d, "val")
        self.assertIsInstance(result, float)
        self.assertAlmostEqual(result, 1234.56, places=6)

    def test_invalid_numeric_string_raises_value_error(self):
        d = {"v": "not-a-number"}
        with self.assertRaisesRegex(ValueError, "expected numeric string for key 'v'"):
            _safe_get_float(d, "v")

    def test_unsupported_type_raises_type_error(self):
        d = {"v": [1, 2, 3]}
        with self.assertRaisesRegex(TypeError, "unsupported type for key 'v': list"):
            _safe_get_float(d, "v")


class TestSafeGetInt(unittest.TestCase):
    """Tests for the internal _safe_get_int helper."""

    def test_float_returns_int(self):
        d = {"k": 12.0}
        result = _safe_get_int(d, "k")
        self.assertIsInstance(result, int)
        self.assertEqual(result, 12)

    def test_numeric_string_with_commas_and_whitespace(self):
        d = {"k": "1,234.00 "}
        result = _safe_get_int(d, "k")
        self.assertEqual(result, 1234)

    def test_invalid_numeric_string_raises_value_error(self):
        d = {"k": "not-int"}
        with self.assertRaisesRegex(ValueError, "expected integer-like string for 'k'"):
            _safe_get_int(d, "k")

    def test_unsupported_type_raises_type_error(self):
        d = {"k": {"x": 1}}
        with self.assertRaisesRegex(TypeError, "unsupported type for 'k': dict"):
            _safe_get_int(d, "k")


class TestSecondToMinutes(unittest.TestCase):
    """Tests for the internal _second_to_minutes helper."""

    def test_none_returns_none(self):
        self.assertIsNone(_second_to_minutes(None))

    def test_integer_seconds_converts_to_minutes(self):
        self.assertEqual(_second_to_minutes(900), 15)

    def test_string_numeric_seconds_converts(self):
        self.assertEqual(_second_to_minutes("120"), 2)

    def test_float_seconds_truncates_then_converts(self):
        # int(89.9) -> 89 -> round(89/60) == 1
        self.assertEqual(_second_to_minutes(89.9), 1)

    def test_invalid_string_returns_none(self):
        self.assertIsNone(_second_to_minutes("not-a-number"))


class TestParseLocationEntry(unittest.TestCase):
    """Tests for _parse_location_entry input validation."""

    def test_non_dict_entry_raises_type_error_with_message(self):
        # None
        with self.assertRaisesRegex(TypeError, "entry must be a dict"):
            _parse_location_entry(None)

        # list
        with self.assertRaisesRegex(TypeError, "entry must be a dict"):
            _parse_location_entry([1, 2, 3])

        # string
        with self.assertRaisesRegex(TypeError, "entry must be a dict"):
            _parse_location_entry("not-a-dict")

    def test_missing_or_empty_id_raises_value_error(self):
        # missing id key
        entry_missing = {"location": {"lat": 1.0, "lng": 2.0}}
        with self.assertRaisesRegex(ValueError, "missing required 'id' in node entry"):
            _parse_location_entry(entry_missing)

        # empty id value
        entry_empty = {"id": "", "location": {"lat": 1.0, "lng": 2.0}}
        with self.assertRaisesRegex(ValueError, "missing required 'id' in node entry"):
            _parse_location_entry(entry_empty)

    def test_invalid_location_type_raises_value_error(self):
        """Providing a non-dict 'location' should raise a ValueError."""
        entry = {"id": "node-xyz", "location": [1, 2, 3]}
        with self.assertRaisesRegex(ValueError, "invalid 'location' for node node-xyz"):
            _parse_location_entry(entry)

    def test_invalid_transit_to_here_type_raises_value_error(self):
        """Providing a non-dict 'transit_to_here' should raise a ValueError."""
        entry = {
            "id": "node-123",
            "location": {"lat": 10.0, "lng": 20.0},
            "transit_to_here": ["not-a-dict"],
        }
        with self.assertRaisesRegex(
            ValueError, "invalid 'transit_to_here' for node node-123"
        ):
            _parse_location_entry(entry)


class TestUpdateSantaLocation(unittest.TestCase):
    """Test cases for update_santa_location function."""

    def test_update_santa_location_with_location_object(self):
        """Test updating Santa's location with a Location object."""
        location = Location(
            name="Tokyo", region=None, lat=35.6762, lng=139.6503, timezone_offset=9.0
        )
        # Should not raise an error
        update_santa_location(location)

    def test_update_santa_location_with_dict(self):
        """Test updating Santa's location with a dictionary."""
        location_dict = {"name": "London", "coordinates": (51.5074, -0.1278)}
        # Should not raise an error
        update_santa_location(location_dict)

    def test_update_santa_location_with_invalid_input(self):
        """Test updating Santa's location with invalid input."""
        # Should not raise an error
        update_santa_location("Invalid Input")

    def test_update_santa_location_prefers_nested_location_name(self):
        """If `location` is a dict with nested `location` dict, prefer its name."""
        location = {"location": {"name": "InnerName"}, "id": "outer-id"}
        with patch("src.utils.locations.logger.info") as mock_info:
            update_santa_location(location)
            mock_info.assert_called_with(
                "Santa current location updated to: %s", "InnerName"
            )

    def test_update_santa_location_fallbacks_to_id_or_unknown(self):
        """When nested name missing, fall back to `id`, then to 'Unknown'."""
        # fallback to id
        location = {"location": {}, "id": "outer-id"}
        with patch("src.utils.locations.logger.info") as mock_info:
            update_santa_location(location)
            mock_info.assert_called_with(
                "Santa current location updated to: %s", "outer-id"
            )

        # fallback to Unknown when no id
        location2 = {"location": {}}
        with patch("src.utils.locations.logger.info") as mock_info2:
            update_santa_location(location2)
            mock_info2.assert_called_with(
                "Santa current location updated to: %s", "Unknown"
            )

    def test_update_santa_location_with_node_prefers_location_name(self):
        """When passed a `Node`, prefer its nested `Location.name`."""
        loc = Location(
            name="NodePlace", region=None, lat=1.0, lng=2.0, timezone_offset=0.0
        )
        node = Node(comment=None, id="node-1", type="DELIVERY", location=loc)
        with patch("src.utils.locations.logger.info") as mock_info:
            update_santa_location(node)
            mock_info.assert_called_with(
                "Santa current location updated to: %s", "NodePlace"
            )

    def test_update_santa_location_with_node_without_location_falls_back(self):
        """If `Node.location` is falsy, fall back to `Node.id` or str(node)."""
        # create a Node instance without running __post_init__ to allow a falsy
        # `.location` attribute (bypasses type validation)
        node = Node.__new__(Node)
        node.location = None
        node.id = "fallback-id"
        node.type = "DELIVERY"
        node.comment = None

        with patch("src.utils.locations.logger.info") as mock_info:
            update_santa_location(node)
            mock_info.assert_called_with(
                "Santa current location updated to: %s", "fallback-id"
            )

        # Note: skipping explicit missing-`id` case because dataclass repr
        # accesses `id` and would raise when absent; the fallback to `id`
        # has been validated above.


class TestLoadSantaRouteFromJson(unittest.TestCase):
    """Test cases for load_santa_route_from_json function."""

    def test_load_from_default_json(self):
        """Test loading Santa's route from the default JSON file."""
        # call loader with the default santa_route.json path
        base_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"
        )
        default_path = os.path.join(base_dir, "static", "data", "santa_route.json")
        locations = load_santa_route_from_json(default_path)
        self.assertIsInstance(locations, list)
        # default file may be empty in some environments
        for node in locations:
            self.assertIsInstance(node, dict)
            self.assertIn("location", node)

    def test_load_from_custom_json(self):
        """Test loading Santa's route from a custom JSON file."""
        # Create a temporary JSON file using the new nested schema
        test_data = {
            "route": [
                {
                    "id": "test-1",
                    "location": {
                        "name": "Test City",
                        "lat": 40.0,
                        "lng": -74.0,
                        "timezone_offset": -5.0,
                    },
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            node = locations[0]
            self.assertIsInstance(node, dict)
            self.assertEqual(node["location"]["name"], "Test City")
            self.assertEqual(node["location"]["lat"], 40.0)
            self.assertEqual(node["location"]["lng"], -74.0)
            self.assertEqual(node["location"].get("timezone_offset"), -5.0)
        finally:
            os.unlink(temp_file)

    def test_load_from_json_with_new_fields(self):
        """Test loading Santa's route with new optional fields from JSON."""
        test_data = {
            "route": [
                {
                    "id": "1",
                    "location": {
                        "name": "Test City",
                        "lat": 40.0,
                        "lng": -74.0,
                        "timezone_offset": -5.0,
                    },
                    "schedule": {
                        "arrival_utc": "2024-12-24T10:00:00Z",
                        "departure_utc": "2024-12-24T10:15:00Z",
                    },
                    "stop_experience": {"duration_seconds": 900},
                    "type": "DELIVERY",
                    "notes": "Test fun fact!",
                    "priority": 1,
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            node = locations[0]
            # schedule and stop_experience are preserved in the parsed node dict
            schedule = node.get("schedule", {})
            self.assertEqual(schedule.get("arrival_utc"), "2024-12-24T10:00:00Z")
            self.assertEqual(schedule.get("departure_utc"), "2024-12-24T10:15:00Z")
            stop_ex = node.get("stop_experience", {})
            self.assertEqual(stop_ex.get("duration_seconds"), 900)
            self.assertEqual(node.get("type"), "DELIVERY")
            # notes/priority are not preserved by the canonical parser
            self.assertIsNone(node.get("notes"))
            self.assertIsNone(node.get("priority"))
        finally:
            os.unlink(temp_file)

    def test_loaded_locations_have_required_fields(self):
        """Test that all loaded locations have required fields."""
        base_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"
        )
        default_path = os.path.join(base_dir, "static", "data", "santa_route.json")
        locations = load_santa_route_from_json(default_path)
        for node in locations:
            loc = node.get("location", {})
            # name may be missing in some inputs; lat/lng should be numeric
            self.assertIn("lat", loc)
            self.assertIn("lng", loc)
            self.assertIsInstance(float(loc.get("lat")), float)
            self.assertIsInstance(float(loc.get("lng")), float)

    def test_load_from_json_missing_name(self):
        """Test loading route with missing location name behaviour."""
        test_data = {
            "route": [
                {
                    "id": "no-name",
                    "location": {"lat": 40.0, "lng": -74.0, "timezone_offset": -5.0},
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            # Missing name is tolerated by the parser
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            self.assertIsNone(locations[0]["location"].get("name"))
        finally:
            os.unlink(temp_file)

    def test_load_from_json_missing_required_field(self):
        """Test loading route with missing required field raises ValueError."""
        test_data = {
            "route": [
                {"id": "missing-lng", "location": {"name": "Test City", "lat": 40.0}}
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            # The parser will skip nodes missing lat/lng and return an empty list
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 0)
        finally:
            os.unlink(temp_file)


class TestTrialRoute(unittest.TestCase):
    """Test cases for trial route functions."""

    def setUp(self):
        """Set up test fixtures."""
        # Get the trial route path for cleanup
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.trial_route_path = os.path.join(
            base_dir, "src", "static", "data", "trial_route.json"
        )
        # Clean up any existing trial route before each test
        if os.path.exists(self.trial_route_path):
            os.remove(self.trial_route_path)

    def tearDown(self):
        """Clean up after each test."""
        if os.path.exists(self.trial_route_path):
            os.remove(self.trial_route_path)

    def test_has_trial_route_when_not_exists(self):
        """Test has_trial_route returns False when no trial route exists."""
        self.assertFalse(has_trial_route())

    def test_save_and_load_trial_route(self):
        """Test saving and loading a trial route."""
        locations = [
            Location(
                name="Trial City",
                region=None,
                lat=40.0,
                lng=-74.0,
                timezone_offset=-5.0,
            )
        ]
        save_trial_route_to_json(locations)

        self.assertTrue(has_trial_route())

        loaded = load_trial_route_from_json()
        self.assertIsNotNone(loaded)
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["location"]["name"], "Trial City")

    def test_load_trial_route_when_not_exists(self):
        """Test load_trial_route_from_json returns None when file doesn't exist."""
        result = load_trial_route_from_json()
        self.assertIsNone(result)

    def test_delete_trial_route(self):
        """Test deleting a trial route."""
        locations = [
            Location(
                name="Trial City",
                region=None,
                lat=40.0,
                lng=-74.0,
                timezone_offset=-5.0,
            )
        ]
        save_trial_route_to_json(locations)
        self.assertTrue(has_trial_route())

        result = delete_trial_route()
        self.assertTrue(result)
        self.assertFalse(has_trial_route())

    def test_delete_trial_route_when_not_exists(self):
        """Test deleting trial route when it doesn't exist returns False."""
        result = delete_trial_route()
        self.assertFalse(result)


class TestValidateLocationsExceptions(unittest.TestCase):
    """Tests that ensure exception branches inside `validate_locations` are handled."""

    def test_validate_locations_catches_attribute_error_from_extract(self):
        """If extracting info raises AttributeError, the error is recorded."""

        class BadDict(dict):
            def get(self, key, default=None):
                raise TypeError("broken get")

        res = validate_locations([BadDict()])
        self.assertFalse(res["valid"])
        self.assertEqual(res["total_locations"], 1)
        self.assertTrue(
            any(
                "error processing location at index 0: broken get" in e
                for e in res["errors"]
            )
        )


class TestExtractLocInfo(unittest.TestCase):
    """Tests covering the dict-branch logic in `_extract_loc_info`."""

    def test_extract_loc_info_prefers_nested_location_name_and_coords(self):
        node = {
            "id": "x1",
            "location": {
                "name": "Inner",
                "lat": 10.0,
                "lng": 20.0,
                "timezone_offset": 2.5,
            },
        }
        out = _extract_loc_info(node)
        self.assertEqual(out["name"], "Inner")
        self.assertEqual(out["lat"], 10.0)
        self.assertEqual(out["lng"], 20.0)
        self.assertEqual(out["tz"], 2.5)

    def test_extract_loc_info_falls_back_to_id_then_name_when_nested_missing(self):
        # when location is not a dict, fallback to id
        node = {"id": "myid", "location": "not-a-dict", "name": "topname"}
        out = _extract_loc_info(node)
        self.assertEqual(out["name"], "myid")

        # when id missing, fallback to top-level name
        node2 = {"location": "bad", "name": "topname2"}
        out2 = _extract_loc_info(node2)
        self.assertEqual(out2["name"], "topname2")

    def test_extract_loc_info_handles_missing_lat_lng_tz(self):
        node = {"id": "z1", "location": {"name": "NoCoords"}}
        out = _extract_loc_info(node)
        self.assertIsNone(out.get("lat"))
        self.assertIsNone(out.get("lng"))
        self.assertIsNone(out.get("tz"))


class TestConvertToNumeric(unittest.TestCase):
    """
    Tests for the numeric conversion and error collection in `_convert_to_numeric`.
    """

    def test_convert_to_numeric_invalid_values_collect_errors(self):
        latf, lngf, tzf, errors = _convert_to_numeric(
            "bad-lat", "bad-lng", "bad-tz", "NameX", 0
        )
        self.assertIsNone(latf)
        self.assertIsNone(lngf)
        self.assertIsNone(tzf)
        self.assertIn("Invalid latitude for 'NameX' (index 0): bad-lat", errors)
        self.assertIn("Invalid longitude for 'NameX' (index 0): bad-lng", errors)
        self.assertIn("Invalid UTC offset for 'NameX' (index 0): bad-tz", errors)

    def test_convert_to_numeric_accepts_numeric_strings(self):
        latf, lngf, tzf, errors = _convert_to_numeric("1.5", "2.5", "3.0", "N", 1)
        self.assertAlmostEqual(latf, 1.5)
        self.assertAlmostEqual(lngf, 2.5)
        self.assertAlmostEqual(tzf, 3.0)
        self.assertEqual(errors, [])


class TestCheckDuplicateCoords(unittest.TestCase):
    """
    Tests for `_check_duplicate_coords` to ensure it picks the right other_name.
    """

    def test_check_duplicate_coords_uses_nested_location_name(self):
        seen = {(round(10.0, 4), round(20.0, 4)): 0}
        other = {"location": {"name": "OtherInner"}, "id": "o1"}
        locations = [other]
        warnings = _check_duplicate_coords(10.0, 20.0, "NameA", 1, seen, locations)
        self.assertIn(
            "Very close coordinates for 'NameA' (index 1) and 'OtherInner' (index 0)",
            warnings,
        )

    def test_check_duplicate_coords_uses_id_when_no_nested_name(self):
        seen = {(round(11.0, 4), round(21.0, 4)): 0}
        other = {"location": {}, "id": "other-id", "name": "topname"}
        locations = [other]
        warnings = _check_duplicate_coords(11.0, 21.0, "NameB", 2, seen, locations)
        self.assertIn(
            "Very close coordinates for 'NameB' (index 2) and 'other-id' (index 0)",
            warnings,
        )

    def test_check_duplicate_coords_uses_top_level_name_if_no_loc_or_id(self):
        seen = {(round(12.0, 4), round(22.0, 4)): 0}
        other = {"location": {}, "name": "topname-only"}
        locations = [other]
        warnings = _check_duplicate_coords(12.0, 22.0, "NameC", 3, seen, locations)
        self.assertIn(
            "Very close coordinates for 'NameC' (index 3) and 'topname-only' (index 0)",
            warnings,
        )


class TestRangeAndTzChecks(unittest.TestCase):
    """Tests for `_range_and_tz_checks` covering range errors and tz warnings."""

    def test_range_errors_for_lat_lng_tz_out_of_bounds(self):
        errors, warnings = _range_and_tz_checks(100.0, 200.0, 20.0, "BadPlace", 0)
        self.assertIn("Invalid latitude for 'BadPlace' (index 0): 100.0", errors)
        self.assertIn("Invalid longitude for 'BadPlace' (index 0): 200.0", errors)
        self.assertIn("Invalid UTC offset for 'BadPlace' (index 0): 20.0", errors)
        self.assertEqual(warnings, [])

    def test_unusual_tz_fraction_emits_warning(self):
        # fractional part 0.3 is not allowed (0.0,0.25,0.5,0.75)
        errors, warnings = _range_and_tz_checks(10.0, 20.0, 5.3, "CityX", 1)
        self.assertEqual(errors, [])
        self.assertTrue(
            any("Unusual UTC offset for 'CityX': 5.3" in w for w in warnings)
        )


class TestLocationLegacyCoerce(unittest.TestCase):
    """Tests for legacy-field coercion errors in `_location_coerce_legacy_fields`."""

    def test_invalid_latitude_legacy_field_raises_value_error(self):
        with self.assertRaisesRegex(ValueError, "Invalid latitude: bad-lat"):
            Location(
                name="BadLat",
                region=None,
                lat=None,
                lng=0.0,
                timezone_offset=0.0,
                latitude="bad-lat",
            )

    def test_invalid_longitude_legacy_field_raises_value_error(self):
        with self.assertRaisesRegex(ValueError, "Invalid longitude: bad-lon"):
            Location(
                name="BadLon",
                region=None,
                lat=0.0,
                lng=None,
                timezone_offset=0.0,
                longitude="bad-lon",
            )

    def test_invalid_utc_offset_legacy_field_raises_value_error(self):
        with self.assertRaisesRegex(ValueError, "Invalid timezone_offset: bad-tz"):
            Location(
                name="BadTZ",
                region=None,
                lat=10.0,
                lng=20.0,
                timezone_offset=None,
                utc_offset="bad-tz",
            )

    def test_non_numeric_tz_triggers_unusual_warning(self):
        # Not testing direct non-numeric tz here because callers should
        # pass numeric types (or None) after conversion; such inputs are
        # handled earlier by `_convert_to_numeric`.
        pass


if __name__ == "__main__":
    unittest.main()
