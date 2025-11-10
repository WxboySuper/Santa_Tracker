"""Tests for the Location data model and location utilities."""

import json
import os
import tempfile
import unittest

from src.utils.locations import (
    Location,
    get_santa_locations,
    load_santa_route_from_json,
    update_santa_location,
)


class TestLocation(unittest.TestCase):
    """Test cases for the Location class."""

    def test_location_creation(self):
        """Test creating a valid Location object."""
        location = Location(
            name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0
        )
        self.assertEqual(location.name, "New York")
        self.assertEqual(location.latitude, 40.7128)
        self.assertEqual(location.longitude, -74.0060)
        self.assertEqual(location.utc_offset, -5.0)

    def test_location_with_new_fields(self):
        """Test creating a Location object with new optional fields."""
        location = Location(
            name="Tokyo",
            latitude=35.6762,
            longitude=139.6503,
            utc_offset=9.0,
            arrival_time="2024-12-24T12:00:00Z",
            departure_time="2024-12-24T12:25:00Z",
            stop_duration=25,
            is_stop=True,
            priority=1,
            fun_facts="Famous for its mix of traditional and modern!",
        )
        self.assertEqual(location.arrival_time, "2024-12-24T12:00:00Z")
        self.assertEqual(location.departure_time, "2024-12-24T12:25:00Z")
        self.assertEqual(location.stop_duration, 25)
        self.assertTrue(location.is_stop)
        self.assertEqual(location.priority, 1)
        self.assertEqual(
            location.fun_facts, "Famous for its mix of traditional and modern!"
        )

    def test_location_coordinates_property(self):
        """Test the coordinates property returns tuple."""
        location = Location(
            name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0
        )
        self.assertEqual(location.coordinates, (35.6762, 139.6503))

    def test_invalid_latitude(self):
        """Test that invalid latitude raises ValueError."""
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=91.0, longitude=0.0, utc_offset=0.0)
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=-91.0, longitude=0.0, utc_offset=0.0)

    def test_invalid_longitude(self):
        """Test that invalid longitude raises ValueError."""
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=0.0, longitude=181.0, utc_offset=0.0)
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=0.0, longitude=-181.0, utc_offset=0.0)

    def test_invalid_utc_offset(self):
        """Test that invalid UTC offset raises ValueError."""
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=0.0, longitude=0.0, utc_offset=15.0)
        with self.assertRaises(ValueError):
            Location(name="Invalid", latitude=0.0, longitude=0.0, utc_offset=-13.0)

    def test_invalid_priority(self):
        """Test that invalid priority raises ValueError."""
        with self.assertRaises(ValueError):
            Location(
                name="Invalid",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                priority=0,
            )
        with self.assertRaises(ValueError):
            Location(
                name="Invalid",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                priority=4,
            )

    def test_valid_priority_values(self):
        """Test that priority values 1, 2, and 3 are valid."""
        for priority in [1, 2, 3]:
            location = Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                priority=priority,
            )
            self.assertEqual(location.priority, priority)

    def test_boundary_values(self):
        """Test boundary values for coordinates and UTC offset."""
        # Valid boundary values
        location1 = Location(
            name="North Pole", latitude=90.0, longitude=0.0, utc_offset=0.0
        )
        self.assertEqual(location1.latitude, 90.0)

        location2 = Location(
            name="South Pole", latitude=-90.0, longitude=0.0, utc_offset=0.0
        )
        self.assertEqual(location2.latitude, -90.0)

        location3 = Location(
            name="East", latitude=0.0, longitude=180.0, utc_offset=12.0
        )
        self.assertEqual(location3.longitude, 180.0)

        location4 = Location(
            name="West", latitude=0.0, longitude=-180.0, utc_offset=-12.0
        )
        self.assertEqual(location4.longitude, -180.0)


class TestGetSantaLocations(unittest.TestCase):
    """Test cases for get_santa_locations function."""

    def test_get_santa_locations_returns_list(self):
        """Test that get_santa_locations returns a list."""
        locations = get_santa_locations()
        self.assertIsInstance(locations, list)

    def test_get_santa_locations_returns_location_objects(self):
        """Test that get_santa_locations returns Location objects."""
        locations = get_santa_locations()
        self.assertGreater(len(locations), 0)
        for location in locations:
            self.assertIsInstance(location, Location)

    def test_get_santa_locations_includes_required_fields(self):
        """Test that all locations have required fields."""
        locations = get_santa_locations()
        for location in locations:
            self.assertIsNotNone(location.name)
            self.assertIsNotNone(location.latitude)
            self.assertIsNotNone(location.longitude)
            self.assertIsNotNone(location.utc_offset)

    def test_get_santa_locations_includes_new_fields(self):
        """Test that locations include new optional fields."""
        locations = get_santa_locations()
        # At least some locations should have the new fields populated
        has_arrival_time = any(loc.arrival_time is not None for loc in locations)
        has_fun_facts = any(loc.fun_facts is not None for loc in locations)
        has_priority = any(loc.priority is not None for loc in locations)

        self.assertTrue(
            has_arrival_time, "Expected some locations to have arrival_time"
        )
        self.assertTrue(has_fun_facts, "Expected some locations to have fun_facts")
        self.assertTrue(has_priority, "Expected some locations to have priority")


class TestUpdateSantaLocation(unittest.TestCase):
    """Test cases for update_santa_location function."""

    def test_update_santa_location_with_location_object(self):
        """Test updating Santa's location with a Location object."""
        location = Location(
            name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0
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
        locations = load_santa_route_from_json()
        self.assertIsInstance(locations, list)
        self.assertGreater(len(locations), 0)
        for location in locations:
            self.assertIsInstance(location, Location)

    def test_load_from_custom_json(self):
        """Test loading Santa's route from a custom JSON file."""
        # Create a temporary JSON file
        test_data = {
            "route": [
                {
                    "location": "Test City",
                    "latitude": 40.0,
                    "longitude": -74.0,
                    "utc_offset": -5.0,
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            self.assertEqual(locations[0].name, "Test City")
            self.assertEqual(locations[0].latitude, 40.0)
            self.assertEqual(locations[0].longitude, -74.0)
            self.assertEqual(locations[0].utc_offset, -5.0)
        finally:
            os.unlink(temp_file)

    def test_load_from_json_with_new_fields(self):
        """Test loading Santa's route with new optional fields from JSON."""
        test_data = {
            "route": [
                {
                    "location": "Test City",
                    "latitude": 40.0,
                    "longitude": -74.0,
                    "utc_offset": -5.0,
                    "arrival_time": "2024-12-24T10:00:00Z",
                    "departure_time": "2024-12-24T10:15:00Z",
                    "stop_duration": 15,
                    "is_stop": True,
                    "priority": 1,
                    "fun_facts": "Test fun fact!",
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            locations = load_santa_route_from_json(temp_file)
            self.assertEqual(len(locations), 1)
            loc = locations[0]
            self.assertEqual(loc.arrival_time, "2024-12-24T10:00:00Z")
            self.assertEqual(loc.departure_time, "2024-12-24T10:15:00Z")
            self.assertEqual(loc.stop_duration, 15)
            self.assertTrue(loc.is_stop)
            self.assertEqual(loc.priority, 1)
            self.assertEqual(loc.fun_facts, "Test fun fact!")
        finally:
            os.unlink(temp_file)

    def test_loaded_locations_have_required_fields(self):
        """Test that all loaded locations have required fields."""
        locations = load_santa_route_from_json()
        for location in locations:
            self.assertIsNotNone(location.name)
            self.assertIsInstance(location.latitude, float)
            self.assertIsInstance(location.longitude, float)
            self.assertIsInstance(location.utc_offset, float)


if __name__ == "__main__":
    unittest.main()
