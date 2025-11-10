"""
Advent Calendar Core Engine and Unlock Logic.

This module provides the backend logic for storing, unlocking, and serving
daily Advent content for December 1-24. It includes server-authoritative
unlock logic and admin override support.
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional


@dataclass
class AdventDay:
    """
    Data model for a single day of Advent content.

    Attributes:
        day: Day number (1-24)
        title: Title of the content for this day
        unlock_time: UTC datetime when this day unlocks (ISO format string)
        content_type: Type of content (e.g., 'fact', 'game', 'story', 'video')
        payload: Content payload (can be text, URL, or structured data as dict)
        is_unlocked_override: Optional admin override to force unlock/lock
    """

    day: int
    title: str
    unlock_time: str
    content_type: str
    payload: dict
    is_unlocked_override: Optional[bool] = None

    def __post_init__(self):
        """Validate advent day data."""
        if not 1 <= self.day <= 24:
            raise ValueError(f"Day must be between 1 and 24, got {self.day}")

        valid_content_types = ["fact", "game", "story", "video", "activity", "quiz"]
        if self.content_type not in valid_content_types:
            raise ValueError(
                f"Content type must be one of {valid_content_types}, "
                f"got {self.content_type}"
            )

        # Validate unlock_time is valid ISO format
        try:
            datetime.fromisoformat(self.unlock_time.replace("Z", "+00:00"))
        except (ValueError, AttributeError) as e:
            raise ValueError(f"Invalid unlock_time format: {e}")

    def is_unlocked(self, current_time: Optional[datetime] = None) -> bool:
        """
        Determine if this day is unlocked based on current time.

        Args:
            current_time: Current UTC datetime. If None, uses datetime.now(timezone.utc)

        Returns:
            True if the day is unlocked, False otherwise
        """
        # Check for admin override first
        if self.is_unlocked_override is not None:
            return self.is_unlocked_override

        # Default to current UTC time
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        # Parse unlock time
        unlock_dt = datetime.fromisoformat(self.unlock_time.replace("Z", "+00:00"))

        # Unlock if current time is past unlock time
        return current_time >= unlock_dt

    def to_dict(
        self, include_payload: bool = True, current_time: Optional[datetime] = None
    ) -> dict:
        """
        Convert AdventDay to dictionary representation.

        Args:
            include_payload: Whether to include the full payload (False for locked days)
            current_time: Current UTC datetime for unlock checking. If None, uses now.

        Returns:
            Dictionary representation of the advent day
        """
        unlocked = self.is_unlocked(current_time)

        result = {
            "day": self.day,
            "title": self.title,
            "unlock_time": self.unlock_time,
            "content_type": self.content_type,
            "is_unlocked": unlocked,
        }

        if include_payload and unlocked:
            result["payload"] = self.payload

        return result


def load_advent_calendar(json_file_path: Optional[str] = None) -> List[AdventDay]:
    """
    Load Advent calendar data from a JSON file.

    Args:
        json_file_path: Path to the JSON file. If None, uses the default calendar file.

    Returns:
        List of AdventDay objects representing the complete Advent calendar
    """
    if json_file_path is None:
        # Use default path relative to this file
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(
            base_dir, "static", "data", "advent_calendar.json"
        )

    with open(json_file_path, "r") as f:
        data = json.load(f)

    days = []
    for day_data in data.get("days", []):
        try:
            day = AdventDay(
                day=day_data["day"],
                title=day_data["title"],
                unlock_time=day_data["unlock_time"],
                content_type=day_data["content_type"],
                payload=day_data["payload"],
                is_unlocked_override=day_data.get("is_unlocked_override"),
            )
        except KeyError as e:
            raise ValueError(
                f"Missing required field in advent day data: {e} (data: {day_data})"
            )
        days.append(day)

    return days


def get_manifest(
    json_file_path: Optional[str] = None, current_time: Optional[datetime] = None
) -> dict:
    """
    Get the Advent calendar manifest with unlock status for all days.

    Args:
        json_file_path: Path to the JSON file. If None, uses the default calendar file.
        current_time: Current UTC datetime for unlock checking. If None, uses now.

    Returns:
        Dictionary with manifest data including all days and their unlock status
    """
    days = load_advent_calendar(json_file_path)

    # Get unlock status for each day (without payload for locked days)
    days_data = [
        day.to_dict(include_payload=False, current_time=current_time) for day in days
    ]

    return {
        "total_days": len(days),
        "days": days_data,
    }


def get_day_content(
    day_number: int,
    json_file_path: Optional[str] = None,
    current_time: Optional[datetime] = None,
) -> Optional[dict]:
    """
    Get content for a specific day if it's unlocked.

    Args:
        day_number: Day number (1-24)
        json_file_path: Path to the JSON file. If None, uses the default calendar file.
        current_time: Current UTC datetime for unlock checking. If None, uses now.

    Returns:
        Dictionary with day content if unlocked, None if day doesn't exist
    """
    if not 1 <= day_number <= 24:
        return None

    days = load_advent_calendar(json_file_path)

    # Find the requested day
    for day in days:
        if day.day == day_number:
            return day.to_dict(include_payload=True, current_time=current_time)

    return None
