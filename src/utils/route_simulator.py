"""Route simulator for testing Santa's route."""

from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .locations import Location


def calculate_progress_between_locations(
    start_time: datetime, end_time: datetime, current_time: datetime
) -> float:
    """
    Calculate progress percentage between two times.

    Args:
        start_time: Start time
        end_time: End time
        current_time: Current time to check

    Returns:
        Float between 0.0 and 1.0 representing progress
    """
    if current_time <= start_time:
        return 0.0
    if current_time >= end_time:
        return 1.0

    total_duration = (end_time - start_time).total_seconds()

    if total_duration <= 0:
        # Start and end are the same, consider at start
        return 0.0

    elapsed = (current_time - start_time).total_seconds()
    return elapsed / total_duration


def interpolate_position(
    loc1: Location, loc2: Location, progress: float
) -> Tuple[float, float]:
    """
    Interpolate position between two locations.

    Args:
        loc1: Starting location
        loc2: Ending location
        progress: Progress between 0.0 and 1.0

    Returns:
        Tuple of (latitude, longitude)
    """
    lat = loc1.latitude + (loc2.latitude - loc1.latitude) * progress
    lng = loc1.longitude + (loc2.longitude - loc1.longitude) * progress
    return (lat, lng)


def simulate_route_at_time(
    locations: List[Location], simulation_time: datetime
) -> Dict:
    """
    Simulate Santa's position at a specific time.

    Args:
        locations: List of Location objects representing the route
        simulation_time: The time to simulate

    Returns:
        Dictionary containing simulation results with keys:
        - status: Current status ("not_started", "traveling", "at_location", "completed")
        - current_location: Current location info (if at a location)
        - current_position: Current lat/lng (if traveling)
        - next_location: Next destination info
        - previous_location: Previous location info
        - locations_visited: Number of locations visited
        - total_locations: Total number of locations
        - progress: Overall route progress (0.0 to 1.0)
        - simulation_time: The simulated time (ISO format)
    """
    if not locations:
        return {
            "status": "no_route",
            "message": "No route locations available",
            "simulation_time": simulation_time.isoformat(),
        }

    # Parse times for all locations
    locations_with_times = []
    for loc in locations:
        if loc.arrival_time and loc.departure_time:
            try:
                arrival = datetime.fromisoformat(
                    loc.arrival_time.replace("Z", "+00:00")
                )
                departure = datetime.fromisoformat(
                    loc.departure_time.replace("Z", "+00:00")
                )
                locations_with_times.append((loc, arrival, departure))
            except (ValueError, AttributeError):
                # Skip locations with invalid times
                continue

    if not locations_with_times:
        return {
            "status": "no_times",
            "message": "No locations with valid arrival/departure times",
            "simulation_time": simulation_time.isoformat(),
        }

    # Check if before the route starts
    first_arrival = locations_with_times[0][1]
    if simulation_time < first_arrival:
        return {
            "status": "not_started",
            "message": "Santa hasn't started his journey yet",
            "next_location": {
                "name": locations_with_times[0][0].name,
                "latitude": locations_with_times[0][0].latitude,
                "longitude": locations_with_times[0][0].longitude,
                "arrival_time": locations_with_times[0][0].arrival_time,
            },
            "locations_visited": 0,
            "total_locations": len(locations_with_times),
            "progress": 0.0,
            "simulation_time": simulation_time.isoformat(),
        }

    # Check if after the route ends
    last_departure = locations_with_times[-1][2]
    if simulation_time >= last_departure:
        return {
            "status": "completed",
            "message": "Santa has completed his journey!",
            "current_location": {
                "name": locations_with_times[-1][0].name,
                "latitude": locations_with_times[-1][0].latitude,
                "longitude": locations_with_times[-1][0].longitude,
                "arrival_time": locations_with_times[-1][0].arrival_time,
                "departure_time": locations_with_times[-1][0].departure_time,
            },
            "locations_visited": len(locations_with_times),
            "total_locations": len(locations_with_times),
            "progress": 1.0,
            "simulation_time": simulation_time.isoformat(),
        }

    # Find where Santa is in the route
    for i, (loc, arrival, departure) in enumerate(locations_with_times):
        # Check if at this location
        if arrival <= simulation_time < departure:
            prev_loc = None
            if i > 0:
                prev_loc = {
                    "name": locations_with_times[i - 1][0].name,
                    "latitude": locations_with_times[i - 1][0].latitude,
                    "longitude": locations_with_times[i - 1][0].longitude,
                    "arrival_time": locations_with_times[i - 1][0].arrival_time,
                    "departure_time": locations_with_times[i - 1][0].departure_time,
                }

            next_loc = None
            if i < len(locations_with_times) - 1:
                next_loc = {
                    "name": locations_with_times[i + 1][0].name,
                    "latitude": locations_with_times[i + 1][0].latitude,
                    "longitude": locations_with_times[i + 1][0].longitude,
                    "arrival_time": locations_with_times[i + 1][0].arrival_time,
                }

            return {
                "status": "at_location",
                "message": f"Santa is at {loc.name}",
                "current_location": {
                    "name": loc.name,
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "arrival_time": loc.arrival_time,
                    "departure_time": loc.departure_time,
                    "utc_offset": loc.utc_offset,
                    "priority": loc.priority,
                    "fun_facts": loc.fun_facts,
                },
                "previous_location": prev_loc,
                "next_location": next_loc,
                "locations_visited": i + 1,
                "total_locations": len(locations_with_times),
                "progress": (i + 1) / len(locations_with_times),
                "simulation_time": simulation_time.isoformat(),
            }

        # Check if traveling to next location
        if i < len(locations_with_times) - 1:
            next_arrival = locations_with_times[i + 1][1]
            if departure <= simulation_time < next_arrival:
                # Calculate interpolated position
                travel_progress = calculate_progress_between_locations(
                    departure, next_arrival, simulation_time
                )
                lat, lng = interpolate_position(
                    loc, locations_with_times[i + 1][0], travel_progress
                )

                return {
                    "status": "traveling",
                    "message": f"Santa is traveling from {loc.name} to "
                    f"{locations_with_times[i + 1][0].name}",
                    "current_position": {
                        "latitude": lat,
                        "longitude": lng,
                    },
                    "previous_location": {
                        "name": loc.name,
                        "latitude": loc.latitude,
                        "longitude": loc.longitude,
                        "departure_time": loc.departure_time,
                    },
                    "next_location": {
                        "name": locations_with_times[i + 1][0].name,
                        "latitude": locations_with_times[i + 1][0].latitude,
                        "longitude": locations_with_times[i + 1][0].longitude,
                        "arrival_time": locations_with_times[i + 1][0].arrival_time,
                    },
                    "travel_progress": travel_progress,
                    "locations_visited": i + 1,
                    "total_locations": len(locations_with_times),
                    "progress": (i + 1 + travel_progress) / len(locations_with_times),
                    "simulation_time": simulation_time.isoformat(),
                }

    # Should not reach here, but return a safe default
    return {
        "status": "unknown",
        "message": "Unable to determine Santa's position",
        "simulation_time": simulation_time.isoformat(),
    }


def get_route_summary(locations: List[Location]) -> Dict:
    """
    Get a summary of the route for simulation purposes.

    Args:
        locations: List of Location objects

    Returns:
        Dictionary with route summary information
    """
    if not locations:
        return {
            "total_locations": 0,
            "locations_with_times": 0,
            "start_time": None,
            "end_time": None,
            "valid": False,
        }

    locations_with_times = []
    for loc in locations:
        if loc.arrival_time and loc.departure_time:
            try:
                arrival = datetime.fromisoformat(
                    loc.arrival_time.replace("Z", "+00:00")
                )
                departure = datetime.fromisoformat(
                    loc.departure_time.replace("Z", "+00:00")
                )
                locations_with_times.append((loc, arrival, departure))
            except (ValueError, AttributeError):
                continue

    valid = len(locations_with_times) > 0
    start_time = None
    end_time = None

    if locations_with_times:
        start_time = locations_with_times[0][1].isoformat()
        end_time = locations_with_times[-1][2].isoformat()

    return {
        "total_locations": len(locations),
        "locations_with_times": len(locations_with_times),
        "start_time": start_time,
        "end_time": end_time,
        "valid": valid,
    }
