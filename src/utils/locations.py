import json
import os
from dataclasses import dataclass


@dataclass
class Location:
    """
    Canonical data model for cities/locations.

    Attributes:
        name: City/location name
        latitude: Latitude coordinate in decimal degrees
        longitude: Longitude coordinate in decimal degrees
        utc_offset: UTC offset in hours (e.g., -5.0 for EST, 9.0 for JST)
    """

    name: str
    latitude: float
    longitude: float
    utc_offset: float

    def __post_init__(self):
        """Validate location data."""
        if not -90 <= self.latitude <= 90:
            raise ValueError(f"Invalid latitude: {self.latitude}")
        if not -180 <= self.longitude <= 180:
            raise ValueError(f"Invalid longitude: {self.longitude}")
        if not -12 <= self.utc_offset <= 14:
            raise ValueError(f"Invalid UTC offset: {self.utc_offset}")

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
        Location(name="North Pole", latitude=90.0, longitude=135.0, utc_offset=0.0),
        Location(
            name="New York", latitude=40.7128, longitude=-74.0060, utc_offset=-5.0
        ),
        Location(name="London", latitude=51.5074, longitude=-0.1278, utc_offset=0.0),
        Location(name="Tokyo", latitude=35.6762, longitude=139.6503, utc_offset=9.0),
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
