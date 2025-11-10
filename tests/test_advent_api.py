"""Tests for the Advent Calendar Flask API endpoints."""

import json
import unittest

from src.app import app


class TestAdventAPIEndpoints(unittest.TestCase):
    """Test cases for Advent Calendar API endpoints."""

    def setUp(self):
        """Set up test client."""
        self.app = app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_advent_manifest_endpoint(self):
        """Test GET /api/advent/manifest returns manifest."""
        response = self.client.get("/api/advent/manifest")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.data)
        self.assertIn("total_days", data)
        self.assertIn("days", data)
        self.assertIsInstance(data["days"], list)
        self.assertGreater(data["total_days"], 0)

    def test_advent_manifest_has_unlock_status(self):
        """Test manifest includes unlock status for each day."""
        response = self.client.get("/api/advent/manifest")
        data = json.loads(response.data)

        for day in data["days"]:
            self.assertIn("day", day)
            self.assertIn("title", day)
            self.assertIn("unlock_time", day)
            self.assertIn("content_type", day)
            self.assertIn("is_unlocked", day)
            # Payload should not be in manifest
            self.assertNotIn("payload", day)

    def test_advent_day_endpoint_valid_day(self):
        """Test GET /api/advent/day/<id> returns day content."""
        # Day 1 should exist
        response = self.client.get("/api/advent/day/1")
        self.assertIn(response.status_code, [200, 403])  # Either unlocked or locked

        data = json.loads(response.data)
        if response.status_code == 200:
            # If unlocked, should have all fields including payload
            self.assertIn("day", data)
            self.assertIn("title", data)
            self.assertIn("unlock_time", data)
            self.assertIn("content_type", data)
            self.assertIn("is_unlocked", data)
            self.assertIn("payload", data)
        else:
            # If locked, should have error
            self.assertIn("error", data)
            self.assertEqual(data["error"], "Day is locked")

    def test_advent_day_endpoint_invalid_day_low(self):
        """Test GET /api/advent/day/0 returns 404."""
        response = self.client.get("/api/advent/day/0")
        self.assertEqual(response.status_code, 404)

        data = json.loads(response.data)
        self.assertIn("error", data)
        self.assertEqual(data["error"], "Day not found")

    def test_advent_day_endpoint_invalid_day_high(self):
        """Test GET /api/advent/day/25 returns 404."""
        response = self.client.get("/api/advent/day/25")
        self.assertEqual(response.status_code, 404)

        data = json.loads(response.data)
        self.assertIn("error", data)
        self.assertEqual(data["error"], "Day not found")

    def test_advent_day_endpoint_locked_day_no_payload(self):
        """Test locked day returns error and doesn't include payload."""
        # Use a future day that should be locked
        response = self.client.get("/api/advent/day/24")

        # If it's locked (403), check the response
        if response.status_code == 403:
            data = json.loads(response.data)
            self.assertIn("error", data)
            self.assertEqual(data["error"], "Day is locked")
            self.assertIn("day", data)
            self.assertIn("title", data)
            self.assertIn("unlock_time", data)
            # Should NOT include payload when locked
            self.assertNotIn("payload", data)

    def test_advent_manifest_content_type(self):
        """Test manifest returns JSON content type."""
        response = self.client.get("/api/advent/manifest")
        self.assertEqual(response.content_type, "application/json")

    def test_advent_day_content_type(self):
        """Test day endpoint returns JSON content type."""
        response = self.client.get("/api/advent/day/1")
        self.assertEqual(response.content_type, "application/json")


if __name__ == "__main__":
    unittest.main()
