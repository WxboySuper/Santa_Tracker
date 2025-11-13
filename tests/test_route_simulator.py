"""Tests for the route simulator module."""

import unittest
from datetime import datetime, timezone

from src.utils.locations import Location
from src.utils.route_simulator import (
    calculate_progress_between_locations,
    get_route_summary,
    interpolate_position,
    simulate_route_at_time,
)


class TestCalculateProgress(unittest.TestCase):
    """Test cases for calculate_progress_between_locations function."""

    def test_progress_at_start(self):
        """Test progress is 0.0 at start time."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 11, 0, 0)
        current = datetime(2024, 12, 24, 10, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        self.assertEqual(progress, 0.0)

    def test_progress_at_end(self):
        """Test progress is 1.0 at end time."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 11, 0, 0)
        current = datetime(2024, 12, 24, 11, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        self.assertEqual(progress, 1.0)

    def test_progress_at_midpoint(self):
        """Test progress is 0.5 at midpoint."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 12, 0, 0)
        current = datetime(2024, 12, 24, 11, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        self.assertAlmostEqual(progress, 0.5, places=2)

    def test_progress_before_start(self):
        """Test progress is 0.0 before start time."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 11, 0, 0)
        current = datetime(2024, 12, 24, 9, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        self.assertEqual(progress, 0.0)

    def test_progress_after_end(self):
        """Test progress is 1.0 after end time."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 11, 0, 0)
        current = datetime(2024, 12, 24, 12, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        self.assertEqual(progress, 1.0)

    def test_progress_with_zero_duration(self):
        """Test progress with zero duration returns 0.0."""
        start = datetime(2024, 12, 24, 10, 0, 0)
        end = datetime(2024, 12, 24, 10, 0, 0)
        current = datetime(2024, 12, 24, 10, 0, 0)

        progress = calculate_progress_between_locations(start, end, current)
        # When start equals end and current equals start, return 0.0
        self.assertEqual(progress, 0.0)


class TestInterpolatePosition(unittest.TestCase):
    """Test cases for interpolate_position function."""

    def test_interpolate_at_start(self):
        """Test interpolation at start (progress=0.0)."""
        loc1 = Location(name="Start", latitude=0.0, longitude=0.0, utc_offset=0.0)
        loc2 = Location(name="End", latitude=10.0, longitude=20.0, utc_offset=0.0)

        lat, lng = interpolate_position(loc1, loc2, 0.0)
        self.assertEqual(lat, 0.0)
        self.assertEqual(lng, 0.0)

    def test_interpolate_at_end(self):
        """Test interpolation at end (progress=1.0)."""
        loc1 = Location(name="Start", latitude=0.0, longitude=0.0, utc_offset=0.0)
        loc2 = Location(name="End", latitude=10.0, longitude=20.0, utc_offset=0.0)

        lat, lng = interpolate_position(loc1, loc2, 1.0)
        self.assertEqual(lat, 10.0)
        self.assertEqual(lng, 20.0)

    def test_interpolate_at_midpoint(self):
        """Test interpolation at midpoint (progress=0.5)."""
        loc1 = Location(name="Start", latitude=0.0, longitude=0.0, utc_offset=0.0)
        loc2 = Location(name="End", latitude=10.0, longitude=20.0, utc_offset=0.0)

        lat, lng = interpolate_position(loc1, loc2, 0.5)
        self.assertEqual(lat, 5.0)
        self.assertEqual(lng, 10.0)

    def test_interpolate_with_negative_coordinates(self):
        """Test interpolation with negative coordinates."""
        loc1 = Location(
            name="Start", latitude=-10.0, longitude=-20.0, utc_offset=0.0
        )
        loc2 = Location(
            name="End", latitude=10.0, longitude=20.0, utc_offset=0.0
        )

        lat, lng = interpolate_position(loc1, loc2, 0.5)
        self.assertEqual(lat, 0.0)
        self.assertEqual(lng, 0.0)


class TestGetRouteSummary(unittest.TestCase):
    """Test cases for get_route_summary function."""

    def test_summary_with_empty_route(self):
        """Test summary with no locations."""
        summary = get_route_summary([])

        self.assertEqual(summary["total_locations"], 0)
        self.assertEqual(summary["locations_with_times"], 0)
        self.assertIsNone(summary["start_time"])
        self.assertIsNone(summary["end_time"])
        self.assertFalse(summary["valid"])

    def test_summary_with_locations_no_times(self):
        """Test summary with locations but no times."""
        locations = [
<<<<<<< Updated upstream
            Location(name="NYC", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
=======
            Location(
                name="NYC", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0
            ),
>>>>>>> Stashed changes
            Location(
                name="London", latitude=51.5074, longitude=-0.1278, utc_offset=0.0
            ),
        ]

        summary = get_route_summary(locations)

        self.assertEqual(summary["total_locations"], 2)
        self.assertEqual(summary["locations_with_times"], 0)
        self.assertIsNone(summary["start_time"])
        self.assertIsNone(summary["end_time"])
        self.assertFalse(summary["valid"])

    def test_summary_with_valid_locations(self):
        """Test summary with valid locations and times."""
        locations = [
            Location(
                name="NYC",
                latitude=40.7128,
                longitude=-74.0060,
                utc_offset=-5.0,
                arrival_time="2024-12-24T10:00:00Z",
                departure_time="2024-12-24T10:15:00Z",
            ),
            Location(
                name="London",
                latitude=51.5074,
                longitude=-0.1278,
                utc_offset=0.0,
                arrival_time="2024-12-24T11:00:00Z",
                departure_time="2024-12-24T11:20:00Z",
            ),
        ]

        summary = get_route_summary(locations)

        self.assertEqual(summary["total_locations"], 2)
        self.assertEqual(summary["locations_with_times"], 2)
        self.assertIsNotNone(summary["start_time"])
        self.assertIsNotNone(summary["end_time"])
        self.assertTrue(summary["valid"])


class TestSimulateRouteAtTime(unittest.TestCase):
    """Test cases for simulate_route_at_time function."""

    def setUp(self):
        """Set up test locations with times."""
        self.locations = [
            Location(
                name="North Pole",
                latitude=90.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="2024-12-24T00:00:00Z",
                departure_time="2024-12-24T09:00:00Z",
                priority=1,
            ),
            Location(
                name="NYC",
                latitude=40.7128,
                longitude=-74.0060,
                utc_offset=-5.0,
                arrival_time="2024-12-24T10:00:00Z",
                departure_time="2024-12-24T10:15:00Z",
                priority=1,
            ),
            Location(
                name="London",
                latitude=51.5074,
                longitude=-0.1278,
                utc_offset=0.0,
                arrival_time="2024-12-24T11:00:00Z",
                departure_time="2024-12-24T11:20:00Z",
                priority=2,
            ),
        ]

    def test_simulate_before_route_starts(self):
        """Test simulation before route starts."""
        sim_time = datetime(2024, 12, 23, 23, 0, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertEqual(result["status"], "not_started")
        self.assertIn("next_location", result)
        self.assertEqual(result["next_location"]["name"], "North Pole")
        self.assertEqual(result["locations_visited"], 0)
        self.assertEqual(result["progress"], 0.0)

    def test_simulate_at_first_location(self):
        """Test simulation at first location."""
        sim_time = datetime(2024, 12, 24, 5, 0, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertEqual(result["status"], "at_location")
        self.assertEqual(result["current_location"]["name"], "North Pole")
        self.assertIn("next_location", result)
        self.assertEqual(result["locations_visited"], 1)

    def test_simulate_traveling_between_locations(self):
        """Test simulation while traveling between locations."""
        sim_time = datetime(2024, 12, 24, 9, 30, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertEqual(result["status"], "traveling")
        self.assertIn("current_position", result)
        self.assertIn("latitude", result["current_position"])
        self.assertIn("longitude", result["current_position"])
        self.assertIn("previous_location", result)
        self.assertIn("next_location", result)
        self.assertEqual(result["previous_location"]["name"], "North Pole")
        self.assertEqual(result["next_location"]["name"], "NYC")

    def test_simulate_at_middle_location(self):
        """Test simulation at a middle location."""
        sim_time = datetime(2024, 12, 24, 10, 5, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertEqual(result["status"], "at_location")
        self.assertEqual(result["current_location"]["name"], "NYC")
        self.assertIn("previous_location", result)
        self.assertIn("next_location", result)

    def test_simulate_after_route_ends(self):
        """Test simulation after route ends."""
        sim_time = datetime(2024, 12, 24, 12, 0, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["current_location"]["name"], "London")
        self.assertEqual(result["locations_visited"], 3)
        self.assertEqual(result["progress"], 1.0)

    def test_simulate_with_empty_route(self):
        """Test simulation with empty route."""
        sim_time = datetime(2024, 12, 24, 12, 0, 0)
        result = simulate_route_at_time([], sim_time)

        self.assertEqual(result["status"], "no_route")
        self.assertIn("message", result)

    def test_simulate_with_no_times(self):
        """Test simulation with locations but no times."""
        locations_no_times = [
            Location(name="NYC", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0),
        ]

        sim_time = datetime(2024, 12, 24, 12, 0, 0)
        result = simulate_route_at_time(locations_no_times, sim_time)

        self.assertEqual(result["status"], "no_times")
        self.assertIn("message", result)

    def test_simulation_includes_timestamp(self):
        """Test that simulation result includes the simulation timestamp."""
        sim_time = datetime(2024, 12, 24, 10, 5, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(self.locations, sim_time)

        self.assertIn("simulation_time", result)
        self.assertIsNotNone(result["simulation_time"])


class TestRouteSimulatorEdgeCases(unittest.TestCase):
    """Test edge cases for route simulation."""

    def test_simulate_with_invalid_time_formats(self):
        """Test simulation handles invalid time formats gracefully."""
        locations = [
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="invalid",
                departure_time="also-invalid",
            ),
        ]

        sim_time = datetime(2024, 12, 24, 12, 0, 0)
        result = simulate_route_at_time(locations, sim_time)

        # Should skip invalid locations and report no valid times
        self.assertEqual(result["status"], "no_times")

    def test_simulate_with_single_location(self):
        """Test simulation with only one location."""
        locations = [
            Location(
                name="Only Stop",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="2024-12-24T10:00:00Z",
                departure_time="2024-12-24T11:00:00Z",
            ),
        ]

        # At the location
        sim_time = datetime(2024, 12, 24, 10, 30, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(locations, sim_time)

        self.assertEqual(result["status"], "at_location")
        self.assertEqual(result["current_location"]["name"], "Only Stop")
        # Should have no next location since it's the only one
        self.assertIsNone(result.get("next_location"))

    def test_progress_calculation_accuracy(self):
        """Test that progress calculation is accurate."""
        locations = [
            Location(
                name="Start",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="2024-12-24T10:00:00Z",
                departure_time="2024-12-24T10:10:00Z",
            ),
            Location(
                name="Mid",
                latitude=5.0,
                longitude=5.0,
                utc_offset=0.0,
                arrival_time="2024-12-24T10:20:00Z",
                departure_time="2024-12-24T10:30:00Z",
            ),
            Location(
                name="End",
                latitude=10.0,
                longitude=10.0,
                utc_offset=0.0,
                arrival_time="2024-12-24T10:40:00Z",
                departure_time="2024-12-24T10:50:00Z",
            ),
        ]

        # At first location - should be 1/3
        sim_time = datetime(2024, 12, 24, 10, 5, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(locations, sim_time)
        self.assertAlmostEqual(result["progress"], 1 / 3, places=2)

        # At second location - should be 2/3
        sim_time = datetime(2024, 12, 24, 10, 25, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(locations, sim_time)
        self.assertAlmostEqual(result["progress"], 2 / 3, places=2)

        # At third location - should be 3/3 = 1.0
        sim_time = datetime(2024, 12, 24, 10, 45, 0, tzinfo=timezone.utc)
        result = simulate_route_at_time(locations, sim_time)
        self.assertEqual(result["progress"], 1.0)


if __name__ == "__main__":
    unittest.main()
