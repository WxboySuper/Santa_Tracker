"""Tests for the Tracker class."""

import unittest

from src.utils.locations import Location
from src.utils.tracker import Tracker


class TestTracker(unittest.TestCase):
    """Test cases for the Tracker class."""

    def setUp(self):
        """Set up a fresh Tracker instance for each test."""
        self.tracker = Tracker()
        # Create Location objects for testing
        self.north_pole = Location(
            name="North Pole", latitude=90.0, longitude=0.0, utc_offset=0.0
        )
        self.new_york = Location(
            name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0
        )
        self.london = Location(
            name="London", latitude=51.5074, longitude=-0.1278, utc_offset=0.0
        )
        self.tokyo = Location(
            name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0
        )
        self.paris = Location(
            name="Paris", latitude=48.8566, longitude=2.3522, utc_offset=1.0
        )
        self.berlin = Location(
            name="Berlin", latitude=52.5200, longitude=13.4050, utc_offset=1.0
        )
        self.sydney = Location(
            name="Sydney", latitude=-33.8688, longitude=151.2093, utc_offset=10.0
        )
        self.beijing = Location(
            name="Beijing", latitude=39.9042, longitude=116.4074, utc_offset=8.0
        )

    def test_tracker_initialization(self):
        """Test that Tracker initializes with correct default values."""
        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")

    def test_update_location(self):
        """Test updating Santa's location."""
        self.tracker.update_location(self.north_pole)
        locations = self.tracker.locations
        self.assertEqual(len(locations), 1)
        self.assertEqual(locations[0].name, "North Pole")
        self.assertEqual(self.tracker.status, "Santa is currently at North Pole")

    def test_update_location_multiple_times(self):
        """Test updating location multiple times appends to list."""
        self.tracker.update_location(self.north_pole)
        self.tracker.update_location(self.new_york)
        self.tracker.update_location(self.london)

        locations = self.tracker.locations
        self.assertEqual(len(locations), 3)
        self.assertEqual(
            [loc.name for loc in locations], ["North Pole", "New York", "London"]
        )
        self.assertEqual(self.tracker.status, "Santa is currently at London")

    def test_get_status(self):
        """Test getting the current status."""
        initial_status = self.tracker.get_status()
        self.assertEqual(initial_status, "Waiting for Santa's arrival")

        self.tracker.update_location(self.tokyo)
        updated_status = self.tracker.get_status()
        self.assertEqual(updated_status, "Santa is currently at Tokyo")

    def test_get_locations(self):
        """Test getting the list of visited locations."""
        self.tracker.update_location(self.paris)
        self.tracker.update_location(self.berlin)

        locations = self.tracker.get_locations()
        self.assertEqual([loc.name for loc in locations], ["Paris", "Berlin"])

    def test_clear_locations(self):
        """Test clearing all locations and resetting status."""
        self.tracker.update_location(self.sydney)
        self.tracker.update_location(self.beijing)

        self.assertEqual(len(self.tracker.locations), 2)

        self.tracker.clear_locations()

        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")

    def test_clear_locations_when_empty(self):
        """Test clearing locations when already empty."""
        self.tracker.clear_locations()

        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")

    def test_update_location_rejects_non_location_object(self):
        """Test that update_location raises TypeError for non-Location objects."""
        with self.assertRaises(TypeError) as context:
            self.tracker.update_location("North Pole")
        self.assertIn("location must be a Location object", str(context.exception))

        with self.assertRaises(TypeError) as context:
            self.tracker.update_location({"name": "North Pole"})
        self.assertIn("location must be a Location object", str(context.exception))

    def test_get_locations_returns_copy(self):
        """Test that get_locations() returns a copy to prevent external mutation."""
        self.tracker.update_location(self.north_pole)

        locations = self.tracker.get_locations()
        locations.append(self.new_york)  # Modify the returned list

        # The internal list should not be affected
        self.assertEqual(len(self.tracker.get_locations()), 1)
        self.assertEqual(self.tracker.locations[0].name, "North Pole")

    def test_locations_property_returns_copy(self):
        """Test that locations property returns a copy to prevent external mutation."""
        self.tracker.update_location(self.north_pole)

        locations = self.tracker.locations
        locations.append(self.new_york)  # Modify the returned list

        # The internal list should not be affected
        self.assertEqual(len(self.tracker.locations), 1)
        self.assertEqual(self.tracker.locations[0].name, "North Pole")


if __name__ == "__main__":
    unittest.main()
