"""Tests for the Tracker class."""

import unittest

from src.utils.tracker import Tracker


class TestTracker(unittest.TestCase):
    """Test cases for the Tracker class."""

    def setUp(self):
        """Set up a fresh Tracker instance for each test."""
        self.tracker = Tracker()

    def test_tracker_initialization(self):
        """Test that Tracker initializes with correct default values."""
        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")

    def test_update_location(self):
        """Test updating Santa's location."""
        self.tracker.update_location("North Pole")
        self.assertIn("North Pole", self.tracker.locations)
        self.assertEqual(self.tracker.status, "Santa is currently at North Pole")

    def test_update_location_multiple_times(self):
        """Test updating location multiple times appends to list."""
        self.tracker.update_location("North Pole")
        self.tracker.update_location("New York")
        self.tracker.update_location("London")
        
        self.assertEqual(len(self.tracker.locations), 3)
        self.assertEqual(self.tracker.locations, ["North Pole", "New York", "London"])
        self.assertEqual(self.tracker.status, "Santa is currently at London")

    def test_get_status(self):
        """Test getting the current status."""
        initial_status = self.tracker.get_status()
        self.assertEqual(initial_status, "Waiting for Santa's arrival")
        
        self.tracker.update_location("Tokyo")
        updated_status = self.tracker.get_status()
        self.assertEqual(updated_status, "Santa is currently at Tokyo")

    def test_get_locations(self):
        """Test getting the list of visited locations."""
        self.tracker.update_location("Paris")
        self.tracker.update_location("Berlin")
        
        locations = self.tracker.get_locations()
        self.assertEqual(locations, ["Paris", "Berlin"])

    def test_clear_locations(self):
        """Test clearing all locations and resetting status."""
        self.tracker.update_location("Sydney")
        self.tracker.update_location("Beijing")
        
        self.assertEqual(len(self.tracker.locations), 2)
        
        self.tracker.clear_locations()
        
        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")

    def test_clear_locations_when_empty(self):
        """Test clearing locations when already empty."""
        self.tracker.clear_locations()
        
        self.assertEqual(self.tracker.locations, [])
        self.assertEqual(self.tracker.status, "Waiting for Santa's arrival")


if __name__ == "__main__":
    unittest.main()
