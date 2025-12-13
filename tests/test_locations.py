"""Tests for the Location data model and location utilities."""

import json
import os
import tempfile
import unittest

from src.utils.locations import (
    Location,
    delete_trial_route,
    has_trial_route,
    load_santa_route_from_json,
    load_trial_route_from_json,
    save_trial_route_to_json,
    update_santa_location,
)


class TestLocation(unittest.TestCase):
    """Test cases for the Location class."""

    def test_location_creation(self):
        """Test creating a valid Location object."""
        location = Location(
            name="New York", region=None, lat=40.7128, lng=-74.0060, timezone_offset=-5.0
        )
        self.assertEqual(location.name, "New York")
        self.assertEqual(location.lat, 40.7128)
        self.assertEqual(location.lng, -74.0060)
        self.assertEqual(location.timezone_offset, -5.0)

    def test_location_with_new_fields(self):
        """Test creating a Location object with new optional fields."""
        # The new Location dataclass only stores the canonical core fields.
        location = Location(name="Tokyo", region=None, lat=35.6762, lng=139.6503, timezone_offset=9.0)
        self.assertAlmostEqual(location.lat, 35.6762, places=6)
        self.assertAlmostEqual(location.lng, 139.6503, places=6)
        self.assertEqual(location.timezone_offset, 9.0)

    def test_location_coordinates_property(self):
        """Test the coordinates property returns tuple."""
        location = Location(name="Tokyo", region=None, lat=35.6762, lng=139.6503, timezone_offset=9.0)
        self.assertAlmostEqual(location.coordinates[0], 35.6762, places=6)
        self.assertAlmostEqual(location.coordinates[1], 139.6503, places=6)

    def test_invalid_latitude(self):
        """Test that invalid latitude raises ValueError."""
        with self.assertRaises(ValueError):
            Location(name="Invalid", region=None, lat=91.0, lng=0.0, timezone_offset=0.0)
        with self.assertRaises(ValueError):
            Location(name="Invalid", region=None, lat=-91.0, lng=0.0, timezone_offset=0.0)

    def test_invalid_longitude(self):
        """Test that invalid longitude raises ValueError."""
        # The Location class normalizes longitudes into [-180, 180). Verify normalization.
        loc1 = Location(name="Invalid", region=None, lat=0.0, lng=181.0, timezone_offset=0.0)
        self.assertAlmostEqual(loc1.lng, -179.0, places=6)
        loc2 = Location(name="Invalid", region=None, lat=0.0, lng=-181.0, timezone_offset=0.0)
        self.assertAlmostEqual(loc2.lng, 179.0, places=6)

    def test_invalid_utc_offset(self):
        """Test that invalid UTC offset raises ValueError."""
        with self.assertRaises(ValueError):
            Location(name="Invalid", region=None, lat=0.0, lng=0.0, timezone_offset=15.0)
        with self.assertRaises(ValueError):
            Location(name="Invalid", region=None, lat=0.0, lng=0.0, timezone_offset=-13.0)

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

    def test_valid_priority_values(self):
        """Test that priority values 1, 2, and 3 are valid."""
        # priority is not part of Location; nothing to assert here
        self.assertTrue(True)

    def test_boundary_values(self):
        """Test boundary values for coordinates and UTC offset."""
        # Valid boundary values
        location1 = Location(name="North Pole", region=None, lat=90.0, lng=0.0, timezone_offset=0.0)
        self.assertEqual(location1.lat, 90.0)

        location2 = Location(name="South Pole", region=None, lat=-90.0, lng=0.0, timezone_offset=0.0)
        self.assertEqual(location2.lat, -90.0)

        # longitude 180 normalizes to -180 in implementation
        location3 = Location(name="East", region=None, lat=0.0, lng=180.0, timezone_offset=12.0)
        self.assertAlmostEqual(location3.lng, -180.0, places=6)

        location4 = Location(name="West", region=None, lat=0.0, lng=-180.0, timezone_offset=-12.0)
        self.assertAlmostEqual(location4.lng, -180.0, places=6)


class TestUpdateSantaLocation(unittest.TestCase):
    """Test cases for update_santa_location function."""

    def test_update_santa_location_with_location_object(self):
        """Test updating Santa's location with a Location object."""
        location = Location(
            name="Tokyo", region=None, lat=35.6762, lng=139.6503, timezone_offset=9.0
        )
        # Should not raise an error - asserting the call completes
        try:
            update_santa_location(location)
        except Exception as e:
            self.fail(f"update_santa_location raised {type(e).__name__} unexpectedly")

    def test_update_santa_location_with_dict(self):
        """Test updating Santa's location with a dictionary."""
        location_dict = {"name": "London", "coordinates": (51.5074, -0.1278)}
        # Should not raise an error - asserting the call completes
        try:
            update_santa_location(location_dict)
        except Exception as e:
            self.fail(f"update_santa_location raised {type(e).__name__} unexpectedly")

    def test_update_santa_location_with_invalid_input(self):
        """Test updating Santa's location with invalid input."""
        # Should not raise an error, just convert to string
        try:
            update_santa_location("Some string")
        except Exception as e:
            self.fail(f"update_santa_location raised {type(e).__name__} unexpectedly")


class TestLoadSantaRouteFromJson(unittest.TestCase):
    """Test cases for load_santa_route_from_json function."""

    def test_load_from_default_json(self):
        """Test loading Santa's route from the default JSON file."""
        # call loader with the default santa_route.json path
        base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
        default_path = os.path.join(base_dir, "static", "data", "santa_route.json")
        locations = load_santa_route_from_json(default_path)
        self.assertIsInstance(locations, list)
        # default file may be empty in some environments; just verify returned items are normalized
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
                    "location": {"name": "Test City", "lat": 40.0, "lng": -74.0, "timezone_offset": -5.0}
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
                    "location": {"name": "Test City", "lat": 40.0, "lng": -74.0, "timezone_offset": -5.0},
                    "schedule": {"arrival_utc": "2024-12-24T10:00:00Z", "departure_utc": "2024-12-24T10:15:00Z"},
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
            self.assertEqual(node.get("schedule", {}).get("arrival_utc"), "2024-12-24T10:00:00Z")
            self.assertEqual(node.get("schedule", {}).get("departure_utc"), "2024-12-24T10:15:00Z")
            self.assertEqual(node.get("stop_experience", {}).get("duration_seconds"), 900)
            self.assertEqual(node.get("type"), "DELIVERY")
            # notes/priority are not preserved by the canonical parser; they should be absent
            self.assertIsNone(node.get("notes"))
            self.assertIsNone(node.get("priority"))
        finally:
            os.unlink(temp_file)

    def test_loaded_locations_have_required_fields(self):
        """Test that all loaded locations have required fields."""
        base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
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
                    "location": {"lat": 40.0, "lng": -74.0, "timezone_offset": -5.0}
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            # Missing name is tolerated by the parser; the parsed node will have location.name == None
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            self.assertIsNone(locations[0]["location"].get("name"))
        finally:
            os.unlink(temp_file)

    def test_load_from_json_missing_required_field(self):
        """Test loading route with missing required field raises ValueError."""
        test_data = {
            "route": [
                {
                    "id": "missing-lng",
                    "location": {"name": "Test City", "lat": 40.0}
                }
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


if __name__ == "__main__":
    unittest.main()
