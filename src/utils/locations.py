import json
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Location:
    """
    Canonical data model for cities/locations.

    Attributes:
        name: City/location name
        latitude: Latitude coordinate in decimal degrees
        longitude: Longitude coordinate in decimal degrees
        utc_offset: UTC offset in hours (e.g., -5.0 for EST, 9.0 for JST)
        arrival_time: Arrival time in ISO 8601 format (optional)
        departure_time: Departure time in ISO 8601 format (optional)
        stop_duration: Duration of stop in minutes (optional, calculated if
            not provided)
        is_stop: Boolean flag indicating if this is an actual stop
            (default: True)
        priority: Location priority from 1-3, where 1 is highest (optional)
        fun_facts: Fun facts about the location (optional)
    """

    name: str
    latitude: float
    longitude: float
    utc_offset: float
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    stop_duration: Optional[int] = None
    is_stop: bool = True
    priority: Optional[int] = None
    fun_facts: Optional[str] = None

    def __post_init__(self):
        """Validate location data."""
        if not -90 <= self.latitude <= 90:
            raise ValueError(f"Invalid latitude: {self.latitude}")
        if not -180 <= self.longitude <= 180:
            raise ValueError(f"Invalid longitude: {self.longitude}")
        if not -12 <= self.utc_offset <= 14:
            raise ValueError(f"Invalid UTC offset: {self.utc_offset}")
        if self.priority is not None and not 1 <= self.priority <= 3:
            raise ValueError(f"Invalid priority: {self.priority}. Must be 1, 2, or 3.")

    @property
    def coordinates(self):
        """Return coordinates as a tuple for backward compatibility."""
        return (self.latitude, self.longitude)


def get_santa_locations():
    """
    Retrieves the current locations of Santa.

    Returns:
        List of Location objects representing Santa's route.
    """
    return [
        Location(
            name="North Pole",
            latitude=90.0,
            longitude=135.0,
            utc_offset=0.0,
            arrival_time="2024-12-24T00:00:00Z",
            departure_time="2024-12-24T09:45:00Z",
            stop_duration=585,
            is_stop=True,
            priority=1,
            fun_facts="Santa's workshop and home!",
        ),
        Location(
            name="New York",
            latitude=40.7128,
            longitude=-74.0060,
            utc_offset=-5.0,
            arrival_time="2024-12-24T10:00:00Z",
            departure_time="2024-12-24T10:15:00Z",
            stop_duration=15,
            is_stop=True,
            priority=1,
            fun_facts=(
                "The city that never sleeps - perfect for Santa's "
                "midnight deliveries!"
            ),
        ),
        Location(
            name="London",
            latitude=51.5074,
            longitude=-0.1278,
            utc_offset=0.0,
            arrival_time="2024-12-24T11:00:00Z",
            departure_time="2024-12-24T11:20:00Z",
            stop_duration=20,
            is_stop=True,
            priority=2,
            fun_facts="Home of Big Ben and the Royal Family!",
        ),
        Location(
            name="Tokyo",
            latitude=35.6762,
            longitude=139.6503,
            utc_offset=9.0,
            arrival_time="2024-12-24T12:00:00Z",
            departure_time="2024-12-24T12:25:00Z",
            stop_duration=25,
            is_stop=True,
            priority=2,
            fun_facts=(
                "Famous for its mix of traditional temples and modern "
                "skyscrapers!"
            ),
        ),
    ]


def load_santa_route_from_json(json_file_path=None):
    """
    Load Santa's route from a JSON file.

    Args:
        json_file_path: Path to the JSON file. If None, uses the default route file.

    Returns:
        List of Location objects representing Santa's complete route.
    """
    if json_file_path is None:
        # Use default path relative to this file
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(base_dir, "static", "data", "santa_route.json")

    with open(json_file_path, "r") as f:
        data = json.load(f)

    locations = []
    for location_data in data.get("route", []):
        try:
            location = Location(
                name=location_data["location"],
                latitude=location_data["latitude"],
                longitude=location_data["longitude"],
                utc_offset=location_data["utc_offset"],
                arrival_time=location_data.get("arrival_time"),
                departure_time=location_data.get("departure_time"),
                stop_duration=location_data.get("stop_duration"),
                is_stop=location_data.get("is_stop", True),
                priority=location_data.get("priority"),
                fun_facts=location_data.get("fun_facts"),
            )
        except KeyError as e:
            raise ValueError(
                f"Missing required field in location data: {e} (data: {location_data})"
            )
        locations.append(location)

    return locations


def update_santa_location(location):
    """
    Updates Santa's current location.

    Args:
        location: Location object or dict with location information
    """
    # Handle both Location objects and dictionaries for backward compatibility
    if isinstance(location, Location):
        location_name = location.name
    elif isinstance(location, dict):
        location_name = location.get("name", "Unknown")
    else:
        location_name = str(location)

    print(f"Santa's current location updated to: {location_name}")
