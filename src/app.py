import logging
import os
import secrets
import sys
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, render_template, request

# Add the src directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.advent import (  # noqa: E402
    AdventDay,
    get_day_content,
    get_manifest,
    load_advent_calendar,
    save_advent_calendar,
    validate_advent_calendar,
)
from utils.locations import (  # noqa: E402
    Location,
    delete_trial_route,
    has_trial_route,
    load_santa_route_from_json,
    load_trial_route_from_json,
    save_santa_route_to_json,
    save_trial_route_to_json,
    validate_locations,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key")

# Warn if using default SECRET_KEY (security risk in production)
if app.config["SECRET_KEY"] == "dev-secret-key":
    logger.warning(
        "Using default SECRET_KEY 'dev-secret-key'. "
        "This is insecure for production. "
        "Set SECRET_KEY environment variable to a secure random value."
    )

# Simple in-memory session store (in production, use Redis or database)
active_sessions = {}


def require_admin_auth(f):
    """Decorator to require admin authentication via session token."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401

        token = auth_header.split(" ")[1]

        # Check if token is valid session token
        if token in active_sessions:
            return f(*args, **kwargs)

        # Fallback: check if token matches admin password (for backward compatibility)
        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            return jsonify({"error": "Admin access not configured"}), 500

        if secrets.compare_digest(token, admin_password):
            return f(*args, **kwargs)

        return jsonify({"error": "Invalid credentials"}), 403

    return decorated_function


@app.route("/")
def home():
    """Landing page with festive design."""
    return render_template("home.html")


@app.route("/tracker")
def tracker():
    """Santa tracking page with live map."""
    return render_template("tracker.html")


@app.route("/advent")
def advent():
    """Advent calendar page with North Pole map."""
    return render_template("advent.html")


@app.route("/admin/route-simulator")
def route_simulator():
    """Admin-only visual route simulator for testing (auth checked in JavaScript)."""
    return render_template("route_simulator.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Admin login endpoint that returns a session token."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data or "password" not in data:
            return jsonify({"error": "Password required"}), 400

        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            return jsonify({"error": "Admin access not configured"}), 500

        if not secrets.compare_digest(data["password"], admin_password):
            return jsonify({"error": "Invalid password"}), 401

        # Generate a secure session token
        session_token = secrets.token_urlsafe(32)
        active_sessions[session_token] = {
            "created_at": datetime.now().isoformat(),
            "last_used": datetime.now().isoformat(),
        }

        return jsonify({"token": session_token}), 200
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/index")
def index():
    """Legacy route - redirect to tracker."""
    return render_template("tracker.html")


@app.route("/admin")
def admin():
    """Admin dashboard for location management."""
    return render_template("admin.html")


@app.route("/api/advent/manifest")
def advent_manifest():
    """
    Get the Advent calendar manifest with unlock status for all days.

    Returns:
        JSON response with all days and their unlock status
    """
    try:
        manifest = get_manifest()
        return jsonify(manifest), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/advent/day/<int:day_number>")
def advent_day(day_number):
    """
    Get content for a specific day if it's unlocked.

    Args:
        day_number: Day number (1-24)

    Returns:
        JSON response with day content if unlocked, or error if locked/not found
    """
    try:
        day_content = get_day_content(day_number)

        if day_content is None:
            return jsonify({"error": "Day not found"}), 404

        if not day_content.get("is_unlocked", False):
            return (
                jsonify(
                    {
                        "error": "Day is locked",
                        "day": day_content.get("day"),
                        "title": day_content.get("title"),
                        "unlock_time": day_content.get("unlock_time"),
                    }
                ),
                403,
            )

        return jsonify(day_content), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations", methods=["GET"])
@require_admin_auth
def get_locations():
    """Get all locations from the route."""
    try:
        locations = load_santa_route_from_json()
        return (
            jsonify(
                {
                    "locations": [
                        {
                            "id": idx,
                            "name": loc.name,
                            "latitude": loc.latitude,
                            "longitude": loc.longitude,
                            "utc_offset": loc.utc_offset,
                            "arrival_time": loc.arrival_time,
                            "departure_time": loc.departure_time,
                            "stop_duration": loc.stop_duration,
                            "is_stop": loc.is_stop,
                            "priority": loc.priority,
                            "fun_facts": loc.fun_facts,
                        }
                        for idx, loc in enumerate(locations)
                    ]
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations", methods=["POST"])
@require_admin_auth
def add_location():
    """Add a new location to the route."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Validate required fields
        required_fields = ["name", "latitude", "longitude", "utc_offset"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return (
                jsonify({"error": f"Missing required fields: {missing_fields}"}),
                400,
            )

        # Create location object (this validates the data)
        try:
            new_location = Location(
                name=data["name"],
                latitude=float(data["latitude"]),
                longitude=float(data["longitude"]),
                utc_offset=float(data["utc_offset"]),
                arrival_time=data.get("arrival_time"),
                departure_time=data.get("departure_time"),
                stop_duration=data.get("stop_duration"),
                is_stop=data.get("is_stop", True),
                priority=data.get("priority"),
                fun_facts=data.get("fun_facts"),
            )
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid data format or values"}), 400

        # Load existing locations and append
        locations = load_santa_route_from_json()
        locations.append(new_location)

        # Save back to JSON
        save_santa_route_to_json(locations)

        return (
            jsonify(
                {
                    "message": "Location added successfully",
                    "id": len(locations) - 1,
                    "location": {
                        "name": new_location.name,
                        "latitude": new_location.latitude,
                        "longitude": new_location.longitude,
                        "utc_offset": new_location.utc_offset,
                    },
                }
            ),
            201,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations/<int:location_id>", methods=["PUT"])
@require_admin_auth
def update_location(location_id):
    """Update an existing location."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        locations = load_santa_route_from_json()

        if location_id < 0 or location_id >= len(locations):
            return jsonify({"error": "Location not found"}), 404

        # Update location fields
        try:
            updated_location = Location(
                name=data.get("name", locations[location_id].name),
                latitude=float(data.get("latitude", locations[location_id].latitude)),
                longitude=float(
                    data.get("longitude", locations[location_id].longitude)
                ),
                utc_offset=float(
                    data.get("utc_offset", locations[location_id].utc_offset)
                ),
                arrival_time=data.get(
                    "arrival_time", locations[location_id].arrival_time
                ),
                departure_time=data.get(
                    "departure_time", locations[location_id].departure_time
                ),
                stop_duration=data.get(
                    "stop_duration", locations[location_id].stop_duration
                ),
                is_stop=data.get("is_stop", locations[location_id].is_stop),
                priority=data.get("priority", locations[location_id].priority),
                fun_facts=data.get("fun_facts", locations[location_id].fun_facts),
            )
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid data format or values"}), 400

        locations[location_id] = updated_location
        save_santa_route_to_json(locations)

        return jsonify({"message": "Location updated successfully"}), 200
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations/<int:location_id>", methods=["DELETE"])
@require_admin_auth
def delete_location(location_id):
    """Delete a location from the route."""
    try:
        locations = load_santa_route_from_json()

        if location_id < 0 or location_id >= len(locations):
            return jsonify({"error": "Location not found"}), 404

        deleted_location = locations.pop(location_id)
        save_santa_route_to_json(locations)

        return (
            jsonify(
                {
                    "message": "Location deleted successfully",
                    "deleted_location": deleted_location.name,
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations/validate", methods=["POST"])
@require_admin_auth
def validate_location_data():
    """Validate location data for correctness."""
    try:
        locations = load_santa_route_from_json()
        validation_results = validate_locations(locations)

        return jsonify(validation_results), 200
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


def _parse_location_from_data(loc_data, idx):
    """Parse a single location from import data.

    Returns:
        tuple: (Location object or None, error message or None)
    """
    # Support both "name" and "location" fields
    name = loc_data.get("name") or loc_data.get("location")
    if not name:
        return (
            None,
            f"Location at index {idx}: Missing required field 'name' or 'location'",
        )

    # Check for required fields
    missing_fields = [
        field
        for field in ["latitude", "longitude", "utc_offset"]
        if field not in loc_data or loc_data[field] is None
    ]
    if missing_fields:
        # Don't include user-provided name in error message to prevent XSS
        safe_fields = ", ".join(str(f) for f in missing_fields)
        return None, (
            f"Location at index {idx}: Missing required field(s): {safe_fields}"
        )

    try:
        location = Location(
            name=name,
            latitude=float(loc_data["latitude"]),
            longitude=float(loc_data["longitude"]),
            utc_offset=float(loc_data["utc_offset"]),
            arrival_time=loc_data.get("arrival_time"),
            departure_time=loc_data.get("departure_time"),
            stop_duration=loc_data.get("stop_duration"),
            is_stop=loc_data.get("is_stop", True),
            priority=loc_data.get("priority"),
            fun_facts=loc_data.get("fun_facts"),
        )
        return location, None
    except (ValueError, TypeError):
        return None, f"Location at index {idx}: Invalid data"


@app.route("/api/admin/locations/import", methods=["POST"])
@require_admin_auth
def import_locations():
    """Import locations in bulk from JSON data."""
    try:
        data = request.get_json(force=True, silent=True)

        # Validate request data
        if not data:
            return jsonify({"error": "No data provided"}), 400

        import_mode = data.get("mode", "append")
        locations_data = data.get("locations", [])

        if not isinstance(locations_data, list):
            return jsonify({"error": "Locations must be a list"}), 400

        if len(locations_data) == 0:
            return jsonify({"error": "No locations provided"}), 400

        # Parse and validate each location
        new_locations = []
        errors = []

        for idx, loc_data in enumerate(locations_data):
            location, error_msg = _parse_location_from_data(loc_data, idx)
            if error_msg:
                errors.append(error_msg)
            elif location:
                new_locations.append(location)

        if errors and len(new_locations) == 0:
            return (
                jsonify({"error": "No valid locations to import", "details": errors}),
                400,
            )

        # Load existing locations if appending
        if import_mode == "replace":
            final_locations = new_locations
        else:  # append
            existing_locations = load_santa_route_from_json()
            final_locations = existing_locations + new_locations

        # Save the locations
        save_santa_route_to_json(final_locations)

        return (
            jsonify(
                {
                    "message": (
                        f"Successfully imported {len(new_locations)} location(s)"
                    ),
                    "imported": len(new_locations),
                    "errors": errors if errors else None,
                    "mode": import_mode,
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception as e:
        logger.exception("Error importing locations: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/status", methods=["GET"])
@require_admin_auth
def get_route_status():
    """Get status information about the current route data."""
    try:
        locations = load_santa_route_from_json()

        # Calculate statistics
        total_locations = len(locations)
        locations_with_times = sum(
            1 for loc in locations if loc.arrival_time and loc.departure_time
        )
        priority_counts = {}
        for loc in locations:
            if loc.priority:
                priority_counts[loc.priority] = priority_counts.get(loc.priority, 0) + 1

        # Get file modification time for last update info
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        route_file = os.path.join(base_dir, "static", "data", "santa_route.json")
        last_modified = (
            time.ctime(os.path.getmtime(route_file))
            if os.path.exists(route_file)
            else "Unknown"
        )

        return (
            jsonify(
                {
                    "total_locations": total_locations,
                    "locations_with_timing": locations_with_times,
                    "priority_breakdown": priority_counts,
                    "last_modified": last_modified,
                    "route_complete": locations_with_times == total_locations
                    and total_locations > 0,
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/precompute", methods=["POST"])
@require_admin_auth
def precompute_route():
    """Trigger route precomputation to calculate optimal timings."""
    try:
        locations = load_santa_route_from_json()

        if len(locations) == 0:
            return jsonify({"error": "No locations to precompute"}), 400

        # Simple precomputation: assign times based on UTC offset order
        # This is a basic implementation - can be enhanced with actual routing logic

        # Sort locations by UTC offset (descending) to follow time zones
        sorted_locations = sorted(
            locations, key=lambda loc: (-loc.utc_offset, loc.priority or 2)
        )

        # Start at midnight UTC on Christmas Eve
        current_time = datetime(2024, 12, 24, 0, 0, 0)

        for loc in sorted_locations:
            # Set default stop duration if not present
            if loc.stop_duration is None:
                # North Pole gets longer prep time
                loc.stop_duration = 60 if loc.name == "North Pole" else 30

            loc.arrival_time = current_time.isoformat() + "Z"
            current_time += timedelta(minutes=loc.stop_duration)
            loc.departure_time = current_time.isoformat() + "Z"

            # Add travel time to next location (simplified)
            current_time += timedelta(minutes=10)

        # Save the updated route
        save_santa_route_to_json(sorted_locations)

        return (
            jsonify(
                {
                    "message": "Route precomputed successfully",
                    "total_locations": len(sorted_locations),
                    "completion_status": "complete",
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except Exception as e:
        logger.exception("Error precomputing route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


def _parse_simulation_start_time(start_time_str):
    """
    Parse start time from string or return default.

    Args:
        start_time_str: ISO 8601 formatted time string or None

    Returns:
        tuple: (datetime object, error_response or None)
    """
    if not start_time_str:
        return datetime(2024, 12, 24, 0, 0, 0), None

    try:
        # Parse and convert to naive datetime (remove timezone info)
        start_time = datetime.fromisoformat(
            start_time_str.replace("Z", "+00:00")
        ).replace(tzinfo=None)
        return start_time, None
    except (ValueError, AttributeError):
        return None, (jsonify({"error": "Invalid start_time format"}), 400)


def _filter_locations_by_ids(all_locations, location_ids):
    """
    Filter locations by provided IDs.

    Args:
        all_locations: List of all available locations
        location_ids: List of location indices or None

    Returns:
        tuple: (filtered locations list, error_response or None)
    """
    if location_ids is None:
        return all_locations, None

    if not isinstance(location_ids, list):
        return None, (jsonify({"error": "location_ids must be a list"}), 400)

    try:
        locations = [
            all_locations[idx] for idx in location_ids if 0 <= idx < len(all_locations)
        ]
        return locations, None
    except (IndexError, TypeError):
        return None, (jsonify({"error": "Invalid location_ids"}), 400)


def _get_stop_duration(location):
    """
    Get stop duration for a location.

    Args:
        location: Location object

    Returns:
        int: Stop duration in minutes
    """
    if location.stop_duration:
        return location.stop_duration

    # North Pole gets longer prep time
    if location.name == "North Pole":
        return 60

    # Priority-based stop duration
    # Priority 1-2: 5 minute stops
    # Priority 3: Touch and go (0 minutes)
    if location.priority == 3:
        return 0
    elif location.priority in [1, 2]:
        return 5

    # Default for locations without priority
    return 5


def _build_simulated_location(location, arrival_time, stop_duration):
    """
    Build a simulated location dict with timing information.

    Args:
        location: Location object
        arrival_time: datetime of arrival
        stop_duration: int stop duration in minutes

    Returns:
        dict: Simulated location data
    """
    departure_time = arrival_time + timedelta(minutes=stop_duration)

    return {
        "name": location.name,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "utc_offset": location.utc_offset,
        "arrival_time": arrival_time.isoformat() + "Z",
        "departure_time": departure_time.isoformat() + "Z",
        "stop_duration": stop_duration,
        "priority": location.priority,
        "is_stop": location.is_stop,
    }


def _simulate_route_timing(locations, start_time):
    """
    Simulate route timing for a list of locations.

    Args:
        locations: List of Location objects (already sorted)
        start_time: datetime to start simulation

    Returns:
        list: List of simulated location dicts with timing
    """
    simulated_route = []
    current_time = start_time

    for loc in locations:
        stop_duration = _get_stop_duration(loc)
        simulated_loc = _build_simulated_location(loc, current_time, stop_duration)
        simulated_route.append(simulated_loc)

        # Add travel time to next location
        departure_time = current_time + timedelta(minutes=stop_duration)
        current_time = departure_time + timedelta(minutes=10)

    return simulated_route


def _calculate_route_summary(simulated_route, start_time, current_time):
    """
    Calculate summary statistics for simulated route.

    Args:
        simulated_route: List of simulated location dicts
        start_time: datetime of route start
        current_time: datetime after last location

    Returns:
        dict: Summary statistics
    """
    total_duration = (current_time - start_time).total_seconds() / 60
    end_time = current_time - timedelta(minutes=10)  # Remove last travel time

    return {
        "total_locations": len(simulated_route),
        "start_time": start_time.isoformat() + "Z",
        "end_time": end_time.isoformat() + "Z",
        "total_duration_minutes": int(total_duration),
        "total_stop_time_minutes": sum(loc["stop_duration"] for loc in simulated_route),
    }


@app.route("/api/admin/route/simulate", methods=["POST"])
@require_admin_auth
def simulate_route():
    """
    Simulate a Santa route for testing without saving changes.
    Accepts optional start time and location IDs to simulate.
    """
    try:
        data = request.get_json(force=True, silent=True) or {}

        # Load current locations
        all_locations = load_santa_route_from_json()
        if not all_locations:
            return jsonify({"error": "No locations to simulate"}), 400

        # Parse start time
        start_time, error = _parse_simulation_start_time(data.get("start_time"))
        if error:
            return error

        # Filter locations by IDs if provided
        locations, error = _filter_locations_by_ids(
            all_locations, data.get("location_ids")
        )
        if error:
            return error

        # Sort locations by UTC offset (descending) to follow time zones
        sorted_locations = sorted(
            locations, key=lambda loc: (-loc.utc_offset, loc.priority or 2)
        )

        # Simulate the route timing
        simulated_route = _simulate_route_timing(sorted_locations, start_time)

        # Calculate end time for summary (current_time after all stops)
        final_stop_time = start_time + timedelta(
            minutes=sum(loc["stop_duration"] for loc in simulated_route)
            + (len(simulated_route) * 10)
        )

        # Build response
        summary = _calculate_route_summary(simulated_route, start_time, final_stop_time)

        return jsonify({"simulated_route": simulated_route, "summary": summary}), 200

    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except Exception as e:
        logger.exception("Error simulating route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial", methods=["GET"])
@require_admin_auth
def get_trial_route_status():
    """
    Check if trial route exists and return status.
    """
    try:
        exists = has_trial_route()
        if exists:
            trial_locations = load_trial_route_from_json()
            return (
                jsonify(
                    {
                        "exists": True,
                        "location_count": (
                            len(trial_locations) if trial_locations else 0
                        ),
                    }
                ),
                200,
            )
        else:
            return jsonify({"exists": False, "location_count": 0}), 200
    except Exception as e:
        logger.exception("Error getting trial route status: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial", methods=["POST"])
@require_admin_auth
def upload_trial_route():
    """
    Upload a trial route from JSON data.
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data or "route" not in data:
            return jsonify({"error": "Route data required"}), 400

        # Parse locations from JSON
        locations = []
        for loc_data in data["route"]:
            try:
                location = Location(
                    name=loc_data.get("location", loc_data.get("name")),
                    latitude=loc_data["latitude"],
                    longitude=loc_data["longitude"],
                    utc_offset=loc_data["utc_offset"],
                    arrival_time=loc_data.get("arrival_time"),
                    departure_time=loc_data.get("departure_time"),
                    stop_duration=loc_data.get("stop_duration"),
                    is_stop=loc_data.get("is_stop", True),
                    priority=loc_data.get("priority"),
                    fun_facts=loc_data.get("fun_facts"),
                )
                locations.append(location)
            except (KeyError, ValueError):
                logging.exception("Invalid location data in uploaded trial route.")
                return jsonify({"error": "Invalid location data."}), 400

        # Validate the trial route
        validation_result = validate_locations(locations)
        if validation_result["errors"]:
            return (
                jsonify(
                    {
                        "error": "Validation failed",
                        "errors": validation_result["errors"],
                        "warnings": validation_result["warnings"],
                    }
                ),
                400,
            )

        # Save trial route
        save_trial_route_to_json(locations)

        return (
            jsonify(
                {
                    "success": True,
                    "message": f"Trial route uploaded with {len(locations)} locations",
                    "location_count": len(locations),
                    "warnings": validation_result["warnings"],
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Route file not found"}), 404
    except Exception as e:
        logger.exception("Error uploading trial route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial", methods=["DELETE"])
@require_admin_auth
def delete_trial_route_endpoint():
    """
    Delete the trial route.
    """
    try:
        deleted = delete_trial_route()
        if deleted:
            return jsonify({"success": True, "message": "Trial route deleted"}), 200
        else:
            return (
                jsonify({"success": False, "message": "No trial route to delete"}),
                404,
            )
    except Exception as e:
        logger.exception("Error deleting trial route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial/apply", methods=["POST"])
@require_admin_auth
def apply_trial_route():
    """
    Apply the trial route as the main route.
    This copies the trial route to the main route file.
    """
    try:
        # Check if trial route exists
        if not has_trial_route():
            return jsonify({"error": "No trial route to apply"}), 404

        # Load trial route
        trial_locations = load_trial_route_from_json()
        if not trial_locations:
            return jsonify({"error": "Trial route is empty"}), 400

        # Save as main route
        save_santa_route_to_json(trial_locations)

        message = (
            f"Trial route applied as main route "
            f"({len(trial_locations)} locations)"
        )
        return (
            jsonify({"success": True, "message": message}),
            200,
        )

    except Exception as e:
        logger.exception("Error applying trial route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial/simulate", methods=["POST"])
@require_admin_auth
def simulate_trial_route():
    """
    Simulate the trial route instead of the main route.
    Accepts optional start time parameter.
    """
    try:
        # Check if trial route exists
        if not has_trial_route():
            return jsonify({"error": "No trial route to simulate"}), 404

        data = request.get_json(force=True, silent=True) or {}

        # Load trial locations
        all_locations = load_trial_route_from_json()
        if not all_locations:
            return jsonify({"error": "Trial route is empty"}), 400

        # Parse start time
        start_time, error = _parse_simulation_start_time(data.get("start_time"))
        if error:
            return error

        # Filter locations by IDs if provided
        locations, error = _filter_locations_by_ids(
            all_locations, data.get("location_ids")
        )
        if error:
            return error

        # Sort locations by UTC offset (descending) to follow time zones
        sorted_locations = sorted(
            locations, key=lambda loc: (-loc.utc_offset, loc.priority or 2)
        )

        # Simulate the route timing
        simulated_route = _simulate_route_timing(sorted_locations, start_time)

        # Calculate end time for summary (current_time after all stops)
        final_stop_time = start_time + timedelta(
            minutes=sum(loc["stop_duration"] for loc in simulated_route)
            + (len(simulated_route) * 10)
        )

        # Build response
        summary = _calculate_route_summary(simulated_route, start_time, final_stop_time)

        return (
            jsonify(
                {
                    "simulated_route": simulated_route,
                    "summary": summary,
                    "is_trial": True,
                }
            ),
            200,
        )

    except FileNotFoundError:
        return jsonify({"error": "Trial route not found"}), 404
    except Exception as e:
        logger.exception("Error simulating trial route: %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/backup/export", methods=["GET"])
@require_admin_auth
def export_backup():
    """Export current locations and route data as JSON backup."""
    try:
        locations = load_santa_route_from_json()

        # Create backup data structure
        backup_data = {
            "backup_timestamp": datetime.now().isoformat(),
            "total_locations": len(locations),
            "route": [
                {
                    "location": loc.name,
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "utc_offset": loc.utc_offset,
                    "arrival_time": loc.arrival_time,
                    "departure_time": loc.departure_time,
                    "stop_duration": loc.stop_duration,
                    "is_stop": loc.is_stop,
                    "priority": loc.priority,
                    "fun_facts": loc.fun_facts,
                }
                for loc in locations
            ],
        }

        return jsonify(backup_data), 200
    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


# ============== ADVENT CALENDAR ADMIN API ENDPOINTS ==============


@app.route("/api/admin/advent/days", methods=["GET"])
@require_admin_auth
def get_advent_days():
    """Get all advent calendar days with admin access (bypass unlock)."""
    try:
        days = load_advent_calendar()

        # Return all days with full payload for admin view
        days_data = [
            {
                "day": day.day,
                "title": day.title,
                "unlock_time": day.unlock_time,
                "content_type": day.content_type,
                "payload": day.payload,
                "is_unlocked_override": day.is_unlocked_override,
                "is_currently_unlocked": day.is_unlocked(),
            }
            for day in days
        ]

        return jsonify({"days": days_data, "total_days": len(days)}), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>", methods=["GET"])
@require_admin_auth
def get_advent_day_admin(day_number):
    """Get a specific advent day with admin access (bypass unlock)."""
    try:
        if not 1 <= day_number <= 24:
            return jsonify({"error": "Day number must be between 1 and 24"}), 400

        days = load_advent_calendar()

        # Find the requested day
        for day in days:
            if day.day == day_number:
                return (
                    jsonify(
                        {
                            "day": day.day,
                            "title": day.title,
                            "unlock_time": day.unlock_time,
                            "content_type": day.content_type,
                            "payload": day.payload,
                            "is_unlocked_override": day.is_unlocked_override,
                            "is_currently_unlocked": day.is_unlocked(),
                        }
                    ),
                    200,
                )

        return jsonify({"error": "Day not found"}), 404
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>", methods=["PUT"])
@require_admin_auth
def update_advent_day(day_number):
    """Update a specific advent day's content."""
    try:
        if not 1 <= day_number <= 24:
            return jsonify({"error": "Day number must be between 1 and 24"}), 400

        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        days = load_advent_calendar()

        # Find and update the day
        for i, day in enumerate(days):
            if day.day == day_number:
                # Create updated day object with validation
                try:
                    updated_day = AdventDay(
                        day=day_number,
                        title=data.get("title", day.title),
                        unlock_time=data.get("unlock_time", day.unlock_time),
                        content_type=data.get("content_type", day.content_type),
                        payload=data.get("payload", day.payload),
                        is_unlocked_override=data.get(
                            "is_unlocked_override", day.is_unlocked_override
                        ),
                    )
                except (ValueError, KeyError, TypeError):
                    logging.exception("Invalid advent day data provided by user.")
                    return jsonify({"error": "Invalid data provided"}), 400

                days[i] = updated_day
                save_advent_calendar(days)

                return jsonify({"message": "Day updated successfully"}), 200

        # If we get here, the day was not found
        return jsonify({"error": "Day not found"}), 404

    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>/toggle-unlock", methods=["POST"])
@require_admin_auth
def toggle_advent_day_unlock(day_number):
    """Toggle unlock override for a specific advent day."""
    try:
        if not 1 <= day_number <= 24:
            return jsonify({"error": "Day number must be between 1 and 24"}), 400

        data = request.get_json(force=True, silent=True)
        if data is None:
            return jsonify({"error": "No data provided"}), 400

        # Get the desired override state (can be true, false, or null to clear override)
        override_state = data.get("is_unlocked_override")

        days = load_advent_calendar()

        # Find and update the day
        for i, day in enumerate(days):
            if day.day == day_number:
                # Create updated day with new override state
                updated_day = AdventDay(
                    day=day.day,
                    title=day.title,
                    unlock_time=day.unlock_time,
                    content_type=day.content_type,
                    payload=day.payload,
                    is_unlocked_override=override_state,
                )

                days[i] = updated_day
                save_advent_calendar(days)

                return (
                    jsonify(
                        {
                            "message": "Unlock override toggled successfully",
                            "is_unlocked_override": override_state,
                            "is_currently_unlocked": updated_day.is_unlocked(),
                        }
                    ),
                    200,
                )

        # If we get here, the day was not found
        return jsonify({"error": "Day not found"}), 404

    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/validate", methods=["POST"])
@require_admin_auth
def validate_advent_calendar_endpoint():
    """Validate advent calendar data for completeness and correctness."""
    try:
        days = load_advent_calendar()
        validation_results = validate_advent_calendar(days)

        return jsonify(validation_results), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/export", methods=["GET"])
@require_admin_auth
def export_advent_backup():
    """Export advent calendar data as JSON backup."""
    try:
        days = load_advent_calendar()

        # Create backup data structure
        backup_data = {
            "backup_timestamp": datetime.now().isoformat(),
            "total_days": len(days),
            "days": [
                {
                    "day": day.day,
                    "title": day.title,
                    "unlock_time": day.unlock_time,
                    "content_type": day.content_type,
                    "payload": day.payload,
                    "is_unlocked_override": day.is_unlocked_override,
                }
                for day in days
            ],
        }

        return jsonify(backup_data), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/import", methods=["POST"])
@require_admin_auth
def import_advent_calendar():
    """Import advent calendar data from JSON."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Extract days array from various possible formats
        days_data = None
        if "days" in data:
            days_data = data["days"]
        elif isinstance(data, list):
            days_data = data
        else:
            return (
                jsonify({"error": "Invalid format: expected 'days' array or list"}),
                400,
            )

        if not isinstance(days_data, list):
            return jsonify({"error": "Days data must be an array"}), 400

        if len(days_data) == 0:
            return jsonify({"error": "Days array cannot be empty"}), 400

        # Parse and validate each day (all-or-nothing approach)
        imported_days = []
        errors = []

        for idx, day_data in enumerate(days_data):
            try:
                day = AdventDay(
                    day=day_data["day"],
                    title=day_data["title"],
                    unlock_time=day_data["unlock_time"],
                    content_type=day_data["content_type"],
                    payload=day_data["payload"],
                    is_unlocked_override=day_data.get("is_unlocked_override"),
                )
                imported_days.append(day)
            except (KeyError, ValueError, TypeError) as e:
                logging.error(
                    "Error importing day at index %d: %s", idx, str(e), exc_info=True
                )
                errors.append(f"Invalid day data at index {idx}")

        # If any errors occurred, reject entire import (all-or-nothing)
        if errors:
            return (
                jsonify(
                    {
                        "error": (
                            "Import failed - no days were saved "
                            "due to validation errors"
                        ),
                        "details": errors,
                        "failed_count": len(errors),
                    }
                ),
                400,
            )

        # Save all imported days (only if no errors)
        save_advent_calendar(imported_days)

        return (
            jsonify(
                {
                    "message": "Advent calendar imported successfully",
                    "imported_days": len(imported_days),
                }
            ),
            200,
        )

    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data file not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Only enable debug mode via environment variable to prevent security issues
    debug_mode = os.environ.get("FLASK_DEBUG", "False") == "True"
    app.run(debug=debug_mode)
