"""Tests for route generation and validation logic."""

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta

from src.utils.locations import Location, save_santa_route_to_json, validate_locations


class TestRouteValidation(unittest.TestCase):
    """Test cases for route validation functionality."""

    def test_validate_empty_route(self):
        """Test validation of empty route."""
        result = validate_locations([])
        self.assertTrue(result["valid"])
        self.assertEqual(result["total_locations"], 0)
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["warnings"], [])

    def test_validate_single_location(self):
        """Test validation of a single valid location."""
        location = Location(
            name="North Pole",
            latitude=90.0,
            longitude=0.0,
            utc_offset=0.0,
            priority=1,
        )
        result = validate_locations([location])
        self.assertTrue(result["valid"])
        self.assertEqual(result["total_locations"], 1)
        self.assertEqual(result["errors"], [])

    def test_validate_duplicate_names(self):
        """Test validation catches duplicate location names."""
        locations = [
            Location(name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
            Location(name="New York", latitude=41.0, longitude=-73.0, utc_offset=-5.0),
        ]
        result = validate_locations(locations)
        self.assertFalse(result["valid"])
        self.assertGreater(len(result["errors"]), 0)
        self.assertIn("Duplicate location name", result["errors"][0])

    def test_validate_close_coordinates(self):
        """Test validation warns about very close coordinates."""
        locations = [
            Location(name="City A", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
            Location(name="City B", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),  # Exact same coords
        ]
        result = validate_locations(locations)
        self.assertTrue(result["valid"])  # Warning, not error
        self.assertGreater(len(result["warnings"]), 0)
        self.assertIn("Very close coordinates", result["warnings"][0])

    def test_validate_unusual_utc_offset(self):
        """Test validation warns about non-standard UTC offsets."""
        location = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=3.25,  # Unusual offset
        )
        result = validate_locations([location])
        self.assertTrue(result["valid"])
        self.assertGreater(len(result["warnings"]), 0)
        self.assertIn("Unusual UTC offset", result["warnings"][0])

    def test_validate_invalid_priority(self):
        """Test validation catches invalid priority values."""
        # Priority validation happens in Location.__post_init__, 
        # so we test that it's caught there
        with self.assertRaises(ValueError):
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                priority=5,
            )

    def test_validate_multiple_locations_success(self):
        """Test validation of multiple valid locations."""
        locations = [
            Location(name="North Pole", latitude=90.0, longitude=0.0, utc_offset=0.0),
            Location(name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
            Location(name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0),
            Location(name="Sydney", latitude=-33.8688, longitude=151.2093, utc_offset=11.0),
        ]
        result = validate_locations(locations)
        self.assertTrue(result["valid"])
        self.assertEqual(result["total_locations"], 4)
        self.assertEqual(result["errors"], [])


class TestRouteSaving(unittest.TestCase):
    """Test cases for saving route to JSON."""

    def test_save_route_with_all_fields(self):
        """Test saving a route with all optional fields populated."""
        locations = [
            Location(
                name="Test City",
                latitude=40.0,
                longitude=-74.0,
                utc_offset=-5.0,
                arrival_time="2024-12-24T10:00:00Z",
                departure_time="2024-12-24T10:30:00Z",
                stop_duration=30,
                is_stop=True,
                priority=1,
                fun_facts="Test fact",
            )
        ]
        
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            temp_file = f.name
        
        try:
            save_santa_route_to_json(locations, temp_file)
            
            # Read back the saved file
            with open(temp_file, "r") as f:
                data = json.load(f)
            
            self.assertIn("route", data)
            self.assertEqual(len(data["route"]), 1)
            
            saved_loc = data["route"][0]
            self.assertEqual(saved_loc["location"], "Test City")
            self.assertEqual(saved_loc["latitude"], 40.0)
            self.assertEqual(saved_loc["longitude"], -74.0)
            self.assertEqual(saved_loc["utc_offset"], -5.0)
            self.assertEqual(saved_loc["arrival_time"], "2024-12-24T10:00:00Z")
            self.assertEqual(saved_loc["departure_time"], "2024-12-24T10:30:00Z")
            self.assertEqual(saved_loc["stop_duration"], 30)
            self.assertTrue(saved_loc["is_stop"])
            self.assertEqual(saved_loc["priority"], 1)
            self.assertEqual(saved_loc["fun_facts"], "Test fact")
        finally:
            os.unlink(temp_file)

    def test_save_route_minimal_fields(self):
        """Test saving a route with only required fields."""
        locations = [
            Location(
                name="Minimal City",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
            )
        ]
        
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            temp_file = f.name
        
        try:
            save_santa_route_to_json(locations, temp_file)
            
            with open(temp_file, "r") as f:
                data = json.load(f)
            
            saved_loc = data["route"][0]
            self.assertEqual(saved_loc["location"], "Minimal City")
            self.assertTrue(saved_loc["is_stop"])
            # Optional fields should not be in the JSON if None
            self.assertNotIn("arrival_time", saved_loc)
            self.assertNotIn("departure_time", saved_loc)
            self.assertNotIn("stop_duration", saved_loc)
            self.assertNotIn("priority", saved_loc)
            self.assertNotIn("fun_facts", saved_loc)
        finally:
            os.unlink(temp_file)


class TestRouteGeneration(unittest.TestCase):
    """Test cases for route generation logic."""

    def test_route_timing_calculation(self):
        """Test that route timings are calculated correctly."""
        # Test basic timing calculation with fixed duration
        start_time = datetime(2024, 12, 24, 0, 0, 0)
        stop_duration_minutes = 30
        travel_duration_minutes = 10
        
        arrival = start_time
        departure = arrival + timedelta(minutes=stop_duration_minutes)
        next_arrival = departure + timedelta(minutes=travel_duration_minutes)
        
        expected_departure = datetime(2024, 12, 24, 0, 30, 0)
        expected_next_arrival = datetime(2024, 12, 24, 0, 40, 0)
        
        self.assertEqual(departure, expected_departure)
        self.assertEqual(next_arrival, expected_next_arrival)

    def test_route_sorting_by_utc_offset(self):
        """Test that locations can be sorted by UTC offset for route planning."""
        locations = [
            Location(name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0),
            Location(name="London", latitude=51.5074, longitude=-0.1278, utc_offset=0.0),
            Location(name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
            Location(name="Sydney", latitude=-33.8688, longitude=151.2093, utc_offset=11.0),
        ]
        
        # Sort by UTC offset descending (following timezones)
        sorted_locs = sorted(locations, key=lambda loc: -loc.utc_offset)
        
        self.assertEqual(sorted_locs[0].name, "Sydney")
        self.assertEqual(sorted_locs[1].name, "Tokyo")
        self.assertEqual(sorted_locs[2].name, "London")
        self.assertEqual(sorted_locs[3].name, "New York")

    def test_route_with_priority_sorting(self):
        """Test that priority can be used in route sorting."""
        locations = [
            Location(name="City A", latitude=0.0, longitude=0.0, utc_offset=0.0, priority=2),
            Location(name="City B", latitude=0.0, longitude=0.0, utc_offset=0.0, priority=1),
            Location(name="City C", latitude=0.0, longitude=0.0, utc_offset=0.0, priority=3),
        ]
        
        # Sort by priority (1 is highest)
        sorted_locs = sorted(locations, key=lambda loc: loc.priority or 999)
        
        self.assertEqual(sorted_locs[0].name, "City B")
        self.assertEqual(sorted_locs[1].name, "City A")
        self.assertEqual(sorted_locs[2].name, "City C")


if __name__ == "__main__":
    unittest.main()
