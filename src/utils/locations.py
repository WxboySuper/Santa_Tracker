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
        arrival_time: Arrival time in ISO 8601 format (required for static timeline)
        departure_time: Departure time in ISO 8601 format (required for static timeline)
        country: Country name (optional)
        population: Population of the location (optional)
        priority: Location priority from 1-3, where 1 is highest (optional)
        notes: Fun facts or trivia about the location (optional)
        stop_duration: Duration of stop in minutes (deprecated, calculated from times)
        is_stop: Boolean flag indicating if this is an actual stop (default: True)
        fun_facts: Deprecated - use notes instead (optional, for backward compatibility)
    """

    name: str
    latitude: float
    longitude: float
    utc_offset: float
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    country: Optional[str] = None
    population: Optional[int] = None
    priority: Optional[int] = None
    notes: Optional[str] = None
    # Deprecated fields for backward compatibility
    stop_duration: Optional[int] = None
    is_stop: bool = True
    fun_facts: Optional[str] = None

    def __post_init__(self):
        """Validate location data and handle field migrations."""
        if not -90 <= self.latitude <= 90:
            raise ValueError(f"Invalid latitude: {self.latitude}")
        if not -180 <= self.longitude <= 180:
            raise ValueError(f"Invalid longitude: {self.longitude}")
        if not -12 <= self.utc_offset <= 14:
            raise ValueError(f"Invalid UTC offset: {self.utc_offset}")
        if self.priority is not None and not 1 <= self.priority <= 3:
            raise ValueError(f"Invalid priority: {self.priority}. Must be 1, 2, or 3.")

        # Bidirectional migration between fun_facts and notes for backward compatibility
        if self.notes is None and self.fun_facts is not None:
            self.notes = self.fun_facts
        if self.fun_facts is None and self.notes is not None:
            self.fun_facts = self.notes

    @property
    def coordinates(self):
        """Return coordinates as a tuple for backward compatibility."""
        return (self.latitude, self.longitude)


def load_santa_route_from_json(json_file_path=None):
    """
    Load Santa's route from a JSON file.
    Supports both old and new JSON schema formats for backward compatibility.

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
            # Support both 'name' (new) and 'location' (old) field names
            name = location_data.get("name") or location_data.get("location")
            if not name:
                raise ValueError("Missing location name field")

            # Support both 'notes' (new) and 'fun_facts' (old) field names
            notes = location_data.get("notes") if "notes" in location_data else location_data.get("fun_facts")

            location = Location(
                name=name,
                latitude=location_data["latitude"],
                longitude=location_data["longitude"],
                utc_offset=location_data["utc_offset"],
                arrival_time=location_data.get("arrival_time"),
                departure_time=location_data.get("departure_time"),
                country=location_data.get("country"),
                population=location_data.get("population"),
                priority=location_data.get("priority"),
                notes=notes,
                # Keep deprecated fields for backward compatibility
                stop_duration=location_data.get("stop_duration"),
                is_stop=location_data.get("is_stop", True),
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


def load_trial_route_from_json():
    """
    Load trial route from JSON file.
    Trial routes are temporary test routes that don't affect the main route.

    Returns:
        List of Location objects representing the trial route,
        or None if no trial route exists.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")

    if not os.path.exists(trial_route_path):
        return None

    return load_santa_route_from_json(trial_route_path)


def save_trial_route_to_json(locations):
    """
    Save trial route to JSON file.
    Trial routes are temporary test routes that don't affect the main route.

    Args:
        locations: List of Location objects to save as trial route
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")

    save_santa_route_to_json(locations, trial_route_path)


def delete_trial_route():
    """
    Delete the trial route file if it exists.

    Returns:
        bool: True if trial route was deleted, False if it didn't exist
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")

    if os.path.exists(trial_route_path):
        os.remove(trial_route_path)
        return True
    return False


def has_trial_route():
    """
    Check if a trial route exists.

    Returns:
        bool: True if trial route exists, False otherwise
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    return os.path.exists(trial_route_path)


def save_santa_route_to_json(locations, json_file_path=None):
    """
    Save Santa's route to a JSON file using the new schema format.

    Args:
        locations: List of Location objects to save
        json_file_path: Path to the JSON file. If None, uses the default route file.
    """
    if json_file_path is None:
        # Use default path relative to this file
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(base_dir, "static", "data", "santa_route.json")

    # Convert Location objects to dictionaries using new schema format
    route_data = []
    for loc in locations:
        location_dict = {
            "name": loc.name,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "utc_offset": loc.utc_offset,
        }

        # Add arrival_time and departure_time (required in new schema)
        if loc.arrival_time is not None:
            location_dict["arrival_time"] = loc.arrival_time
        if loc.departure_time is not None:
            location_dict["departure_time"] = loc.departure_time

        # Add optional new fields
        if loc.country is not None:
            location_dict["country"] = loc.country
        if loc.population is not None:
            location_dict["population"] = loc.population
        if loc.priority is not None:
            location_dict["priority"] = loc.priority

        # Use 'notes' field (new schema) - prefer notes over fun_facts
        notes = loc.notes if loc.notes is not None else loc.fun_facts
        if notes is not None:
            location_dict["notes"] = notes

        # Keep is_stop for backward compatibility
        location_dict["is_stop"] = loc.is_stop

        # Deprecated: keep stop_duration for tools that may still use it
        if loc.stop_duration is not None:
            location_dict["stop_duration"] = loc.stop_duration

        route_data.append(location_dict)

    # Write to file
    with open(json_file_path, "w") as f:
        json.dump({"route": route_data}, f, indent=2)


def validate_locations(locations):
    """
    Validate a list of locations for correctness.

    Args:
        locations: List of Location objects to validate

    Returns:
        Dictionary with validation results including errors and warnings
    """
    errors = []
    warnings = []

    # Check for duplicates
    seen_names = {}
    seen_coords = {}

    for idx, loc in enumerate(locations):
        # Check for duplicate names
        if loc.name in seen_names:
            errors.append(
                f"Duplicate location name '{loc.name}' at indices "
                f"{seen_names[loc.name]} and {idx}"
            )
        else:
            seen_names[loc.name] = idx

        # Check for duplicate coordinates (within a small tolerance)
        coord_key = (round(loc.latitude, 4), round(loc.longitude, 4))
        if coord_key in seen_coords:
            warnings.append(
                f"Very close coordinates for '{loc.name}' (index {idx}) and "
                f"'{locations[seen_coords[coord_key]].name}' "
                f"(index {seen_coords[coord_key]})"
            )
        else:
            seen_coords[coord_key] = idx

        # Validate coordinate ranges (already done in __post_init__ but check again)
        if not -90 <= loc.latitude <= 90:
            errors.append(
                f"Invalid latitude for '{loc.name}' (index {idx}): {loc.latitude}"
            )
        if not -180 <= loc.longitude <= 180:
            errors.append(
                f"Invalid longitude for '{loc.name}' (index {idx}): {loc.longitude}"
            )

        # Validate UTC offset
        if not -12 <= loc.utc_offset <= 14:
            errors.append(
                f"Invalid UTC offset for '{loc.name}' (index {idx}): "
                f"{loc.utc_offset} (must be between -12 and +14)"
            )

        # Warn about unusual UTC offsets (not multiples of 0.5)
        if abs(loc.utc_offset % 0.5) > 1e-6:
            warnings.append(
                f"Unusual UTC offset for '{loc.name}' (index {idx}): "
                f"{loc.utc_offset} (not a multiple of 0.5)"
            )

        # Validate priority if present
        if loc.priority is not None and not 1 <= loc.priority <= 3:
            errors.append(
                f"Invalid priority for '{loc.name}' (index {idx}): "
                f"{loc.priority} (must be 1, 2, or 3)"
            )

    return {
        "valid": len(errors) == 0,
        "total_locations": len(locations),
        "errors": errors,
        "warnings": warnings,
    }
