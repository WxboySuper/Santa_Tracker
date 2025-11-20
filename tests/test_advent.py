"""Tests for the Advent Calendar Core Engine."""

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from src.utils.advent import (
    AdventDay,
    get_day_content,
    get_manifest,
    load_advent_calendar,
)


class TestAdventDay(unittest.TestCase):
    """Test cases for the AdventDay class."""

    def test_advent_day_creation(self):
        """Test creating a valid AdventDay object."""
        day = AdventDay(
            day=1,
            title="Test Day",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={"text": "Test content"},
        )
        self.assertEqual(day.day, 1)
        self.assertEqual(day.title, "Test Day")
        self.assertEqual(day.content_type, "fact")
        self.assertEqual(day.payload["text"], "Test content")

    def test_invalid_day_number(self):
        """Test that invalid day numbers raise ValueError."""
        with self.assertRaises(ValueError):
            AdventDay(
                day=0,
                title="Invalid",
                unlock_time="2024-12-01T00:00:00Z",
                content_type="fact",
                payload={},
            )
        with self.assertRaises(ValueError):
            AdventDay(
                day=25,
                title="Invalid",
                unlock_time="2024-12-01T00:00:00Z",
                content_type="fact",
                payload={},
            )

    def test_invalid_content_type(self):
        """Test that invalid content types raise ValueError."""
        with self.assertRaises(ValueError):
            AdventDay(
                day=1,
                title="Test",
                unlock_time="2024-12-01T00:00:00Z",
                content_type="invalid_type",
                payload={},
            )

    def test_invalid_unlock_time_format(self):
        """Test that invalid unlock time format raises ValueError."""
        with self.assertRaises(ValueError):
            AdventDay(
                day=1,
                title="Test",
                unlock_time="not-a-date",
                content_type="fact",
                payload={},
            )

    def test_is_unlocked_past_unlock_time(self):
        """Test that a day is unlocked when current time is past unlock time."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={},
        )
        # Test with a time after unlock
        test_time = datetime(2024, 12, 2, 0, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(day.is_unlocked(test_time))

    def test_is_unlocked_before_unlock_time(self):
        """Test that a day is locked when current time is before unlock time."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={},
        )
        # Test with a time before unlock
        test_time = datetime(2024, 11, 30, 0, 0, 0, tzinfo=timezone.utc)
        self.assertFalse(day.is_unlocked(test_time))

    def test_is_unlocked_exact_unlock_time(self):
        """Test that a day is unlocked at exactly the unlock time."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={},
        )
        # Test with exact unlock time
        test_time = datetime(2024, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(day.is_unlocked(test_time))

    def test_is_unlocked_override_true(self):
        """Test that admin override forces unlock."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-25T00:00:00Z",  # Future date
            content_type="fact",
            payload={},
            is_unlocked_override=True,
        )
        # Should be unlocked despite future unlock time
        test_time = datetime(2024, 11, 30, 0, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(day.is_unlocked(test_time))

    def test_is_unlocked_override_false(self):
        """Test that admin override forces lock."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-11-01T00:00:00Z",  # Past date
            content_type="fact",
            payload={},
            is_unlocked_override=False,
        )
        # Should be locked despite past unlock time
        test_time = datetime(2024, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
        self.assertFalse(day.is_unlocked(test_time))

    def test_to_dict_unlocked_with_payload(self):
        """Test to_dict returns payload when unlocked."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={"text": "Secret content"},
        )
        test_time = datetime(2024, 12, 2, 0, 0, 0, tzinfo=timezone.utc)
        result = day.to_dict(include_payload=True, current_time=test_time)

        self.assertIn("payload", result)
        self.assertEqual(result["payload"]["text"], "Secret content")

    def test_to_dict_locked_without_payload(self):
        """Test to_dict excludes payload when locked."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-25T00:00:00Z",
            content_type="fact",
            payload={"text": "Secret content"},
        )
        test_time = datetime(2024, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = day.to_dict(include_payload=True, current_time=test_time)

        self.assertNotIn("payload", result)

    def test_to_dict_include_payload_false(self):
        """Test to_dict excludes payload when include_payload is False."""
        day = AdventDay(
            day=1,
            title="Test",
            unlock_time="2024-12-01T00:00:00Z",
            content_type="fact",
            payload={"text": "Secret content"},
        )
        test_time = datetime(2024, 12, 2, 0, 0, 0, tzinfo=timezone.utc)
        result = day.to_dict(include_payload=False, current_time=test_time)

        self.assertNotIn("payload", result)


class TestLoadAdventCalendar(unittest.TestCase):
    """Test cases for load_advent_calendar function."""

    def test_load_from_default_json(self):
        """Test loading Advent calendar from the default JSON file."""
        days = load_advent_calendar()
        self.assertIsInstance(days, list)
        self.assertGreater(len(days), 0)
        for day in days:
            self.assertIsInstance(day, AdventDay)

    def test_load_from_custom_json(self):
        """Test loading Advent calendar from a custom JSON file."""
        test_data = {
            "days": [
                {
                    "day": 1,
                    "title": "Test Day 1",
                    "unlock_time": "2024-12-01T00:00:00Z",
                    "content_type": "fact",
                    "payload": {"text": "Test content 1"},
                },
                {
                    "day": 2,
                    "title": "Test Day 2",
                    "unlock_time": "2024-12-02T00:00:00Z",
                    "content_type": "game",
                    "payload": {"url": "/games/test"},
                },
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            days = load_advent_calendar(temp_file)
            self.assertEqual(len(days), 2)
            self.assertEqual(days[0].day, 1)
            self.assertEqual(days[0].title, "Test Day 1")
            self.assertEqual(days[1].day, 2)
            self.assertEqual(days[1].content_type, "game")
        finally:
            os.unlink(temp_file)

    def test_loaded_days_have_required_fields(self):
        """Test that all loaded days have required fields."""
        days = load_advent_calendar()
        for day in days:
            self.assertIsNotNone(day.day)
            self.assertIsNotNone(day.title)
            self.assertIsNotNone(day.unlock_time)
            self.assertIsNotNone(day.content_type)
            self.assertIsNotNone(day.payload)

    def test_load_missing_field_raises_error(self):
        """Test that missing required field raises ValueError."""
        test_data = {
            "days": [
                {
                    "day": 1,
                    "title": "Test",
                    # Missing unlock_time
                    "content_type": "fact",
                    "payload": {},
                }
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_data, f)
            temp_file = f.name

        try:
            with self.assertRaises(ValueError):
                load_advent_calendar(temp_file)
        finally:
            os.unlink(temp_file)


class TestGetManifest(unittest.TestCase):
    """Test cases for get_manifest function."""

    def test_get_manifest_returns_dict(self):
        """Test that get_manifest returns a dictionary."""
        manifest = get_manifest()
        self.assertIsInstance(manifest, dict)

    def test_get_manifest_has_required_fields(self):
        """Test that manifest has required fields."""
        manifest = get_manifest()
        self.assertIn("total_days", manifest)
        self.assertIn("days", manifest)
        self.assertIsInstance(manifest["days"], list)

    def test_get_manifest_days_no_payload_for_locked(self):
        """Test that locked days don't include payload in manifest."""
        # Use a past time so all days are locked
        test_time = datetime(2024, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
        manifest = get_manifest(current_time=test_time)

        for day_data in manifest["days"]:
            if not day_data.get("is_unlocked", False):
                self.assertNotIn("payload", day_data)

    def test_get_manifest_correct_unlock_status(self):
        """Test that manifest correctly shows unlock status."""
        # Use a time that unlocks first few days
        test_time = datetime(2024, 12, 3, 0, 0, 0, tzinfo=timezone.utc)
        manifest = get_manifest(current_time=test_time)

        # Days 1-3 should be unlocked, rest locked
        days = {d["day"]: d for d in manifest["days"]}
        self.assertTrue(days[1].get("is_unlocked", False))
        self.assertTrue(days[2].get("is_unlocked", False))
        self.assertTrue(days[3].get("is_unlocked", False))
        # Days after should be locked (if they exist)
        if 4 in days:
            self.assertFalse(days[4].get("is_unlocked", False))


class TestGetDayContent(unittest.TestCase):
    """Test cases for get_day_content function."""

    def test_get_day_content_valid_day(self):
        """Test getting content for a valid day."""
        # Use a future time so all days are unlocked
        test_time = datetime(2024, 12, 25, 0, 0, 0, tzinfo=timezone.utc)
        content = get_day_content(1, current_time=test_time)

        self.assertIsNotNone(content)
        # Ensure content is a mapping before subscripting to satisfy type checkers
        self.assertIsInstance(content, dict)
        # Ignore type checkers because content is checked for None above
        self.assertEqual(content["day"], 1)  # type: ignore
        self.assertIn("title", content)  # type: ignore
        self.assertIn("is_unlocked", content)  # type: ignore

    def test_get_day_content_invalid_day_low(self):
        """Test that day 0 returns None."""
        content = get_day_content(0)
        self.assertIsNone(content)

    def test_get_day_content_invalid_day_high(self):
        """Test that day 25 returns None."""
        content = get_day_content(25)
        self.assertIsNone(content)

    def test_get_day_content_unlocked_includes_payload(self):
        """Test that unlocked day includes payload."""
        # Use a future time so all days are unlocked
        test_time = datetime(2024, 12, 25, 0, 0, 0, tzinfo=timezone.utc)
        content = get_day_content(1, current_time=test_time)

        # Ensure content is present before accessing its attributes
        self.assertIsNotNone(content)
        # Ignore type checkers because content is checked for None above
        self.assertTrue(content.get("is_unlocked", False))  # type: ignore
        # Ignore type checkers because content is checked for None above
        self.assertIn("payload", content)  # type: ignore

    def test_get_day_content_locked_no_payload(self):
        """Test that locked day doesn't include payload."""
        # Use a past time so all days are locked
        test_time = datetime(2024, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
        content = get_day_content(1, current_time=test_time)

        # Ignore type checkers because content is checked for None above
        self.assertFalse(content.get("is_unlocked", False))  # type: ignore
        # Ignore type checkers because content is checked for None above
        self.assertNotIn("payload", content)  # type: ignore


if __name__ == "__main__":
    unittest.main()
