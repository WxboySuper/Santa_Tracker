import json
import logging
import os
import secrets
import sys
import time
from datetime import datetime
from functools import wraps
from types import SimpleNamespace
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, render_template, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

# Load environment variables from .env file using absolute path
# This ensures .env is found regardless of current working directory
# (e.g., when run via Systemd/Gunicorn from a different directory)
load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"
    ),
    verbose=True,
)

# Add the src directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Add parent directory for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Config  # noqa: E402
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
    create_location_from_payload,
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
app.config["ADVENT_ENABLED"] = Config.ADVENT_ENABLED

# Warn if using default SECRET_KEY (security risk in production)
if app.config["SECRET_KEY"] == "dev-secret-key":
    logger.warning(
        "Using default SECRET_KEY 'dev-secret-key'. "
        "This is insecure for production. "
        "Set SECRET_KEY environment variable to a secure random value."
    )

# Log advent calendar feature flag status
logger.info(
    "ADVENT_ENABLED feature flag: %s",
    "Enabled" if app.config["ADVENT_ENABLED"] else "Disabled",
)

# Verify ADMIN_PASSWORD environment variable loading status
logger.info(
    "ADMIN_PASSWORD environment variable loaded: %s",
    "Loaded" if os.environ.get("ADMIN_PASSWORD") else "Not Loaded",
)

# Create serializer for stateless session tokens
# This allows any Gunicorn worker to validate tokens without shared memory
_token_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])


def _mask_token(token: Optional[str]) -> str:
    """Mask a token for secure logging, showing only first 4 and last 4 characters."""
    if token is None or token == "":
        return "<empty>"
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}...{token[-4:]}"


def require_admin_auth(f):
    """Decorator to require admin authentication via stateless signed token."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        # Log whether Authorization header was found
        if not auth_header:
            logger.warning(
                "Auth failed: No Authorization header present in request to %s "
                "(worker PID: %d)",
                request.path,
                os.getpid(),
            )
            return jsonify({"error": "Authentication required"}), 401

        if not auth_header.startswith("Bearer "):
            logger.warning(
                "Auth failed: Authorization header does not start with 'Bearer ' "
                "for request to %s (worker PID: %d)",
                request.path,
                os.getpid(),
            )
            return jsonify({"error": "Authentication required"}), 401

        parts = auth_header.split(" ", 1)  # limit to 2 parts
        if len(parts) != 2 or not parts[1]:
            logger.warning(
                "Auth failed: Malformed Authorization header for request to %s "
                "(worker PID: %d)",
                request.path,
                os.getpid(),
            )
            return jsonify({"error": "Authentication required"}), 401
        token = parts[1]
        masked_token = _mask_token(token)

        logger.debug(
            "Auth attempt: Received token %s for request to %s (worker PID: %d)",
            masked_token,
            request.path,
            os.getpid(),
        )

        # Verify stateless signed token
        try:
            # Token expires after 24 hours (86400 seconds)
            data = _token_serializer.loads(token, max_age=86400)
            if data.get("admin") is True:
                logger.info(
                    "Auth success: Valid signed token %s for request to %s "
                    "(worker PID: %d)",
                    masked_token,
                    request.path,
                    os.getpid(),
                )
                return f(*args, **kwargs)
            else:
                logger.warning(
                    "Auth failed: Valid signature but invalid payload for token %s "
                    "for request to %s (worker PID: %d)",
                    masked_token,
                    request.path,
                    os.getpid(),
                )
                return jsonify({"error": "Invalid credentials"}), 403
        except SignatureExpired:
            logger.warning(
                "Auth failed: Token %s has expired for request to %s "
                "(worker PID: %d)",
                masked_token,
                request.path,
                os.getpid(),
            )
            return jsonify({"error": "Token expired"}), 403
        except BadSignature:
            logger.debug(
                "Auth check: Token %s is not a valid signed token (worker PID: %d)",
                masked_token,
                os.getpid(),
            )
            # Fall through to check if it's a direct password

        # Fallback: check if token matches admin password (for backward compatibility)
        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            logger.error(
                "Auth failed: ADMIN_PASSWORD environment variable not configured "
                "(worker PID: %d)",
                os.getpid(),
            )
            return jsonify({"error": "Admin access not configured"}), 500

        if secrets.compare_digest(token, admin_password):
            logger.info(
                "Auth success: Token matches ADMIN_PASSWORD (fallback auth) "
                "for request to %s (worker PID: %d)",
                request.path,
                os.getpid(),
            )
            return f(*args, **kwargs)

        logger.warning(
            "Auth failed: Token %s is invalid for request to %s (worker PID: %d)",
            masked_token,
            request.path,
            os.getpid(),
        )
        return jsonify({"error": "Invalid credentials"}), 403

    return decorated_function


def require_advent_enabled(f):
    """Decorator to require advent feature to be enabled."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not app.config.get("ADVENT_ENABLED", False):
            abort(404)
        return f(*args, **kwargs)

    return decorated_function


@app.route("/")
def home():
    """Landing page with festive design."""
    tracker_enabled = False
    return render_template("home.html", tracker_enabled=tracker_enabled)


@app.route("/tracker")
def tracker():
    """Santa tracking page with live map."""
    return render_template("tracker.html")


@app.route("/advent")
@require_advent_enabled
def advent():
    """Advent calendar page with North Pole map."""
    return render_template("advent.html")


@app.route("/admin/route-simulator")
def route_simulator():
    """Admin-only visual route simulator for testing (auth checked in JavaScript)."""
    return render_template("route_simulator_v2.html")


@app.route("/admin/route-simulator-legacy")
def route_simulator_legacy():
    """Legacy route simulator (deprecated)."""
    return render_template("route_simulator.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Admin login endpoint that returns a stateless signed session token."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data or "password" not in data:
            logger.warning("Login failed: No password provided in request")
            return jsonify({"error": "Password required"}), 400

        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            logger.error("Login failed: ADMIN_PASSWORD environment variable not set")
            return jsonify({"error": "Admin access not configured"}), 500

        if not secrets.compare_digest(data["password"], admin_password):
            logger.warning("Login failed: Invalid password provided")
            return jsonify({"error": "Invalid password"}), 401

        # Generate a stateless signed token that any Gunicorn worker can verify
        session_token = _token_serializer.dumps({"admin": True})

        logger.info(
            "Login success: Signed session token generated (token: %s, "
            "worker PID: %d)",
            _mask_token(session_token),
            os.getpid(),
        )

        return jsonify({"token": session_token}), 200
    except (TypeError, ValueError) as e:
        logger.warning("Login failed: Invalid data format - %s", str(e))
        return jsonify({"error": "Invalid data format"}), 400


@app.route("/index")
def index():
    """Legacy route - redirect to tracker."""
    return render_template("tracker.html")


@app.route("/admin")
def admin():
    """Admin dashboard for location management."""
    return render_template("admin.html")


@app.route("/api/advent/manifest")
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Advent manifest: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Advent manifest: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/advent/day/<int:day_number>")
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Advent day %d: JSON parsing error - %s", day_number, str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception(
            "Advent day %d: Data validation error - %s", day_number, str(e)
        )
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
                            "country": loc.country,
                            "population": loc.population,
                            "priority": loc.priority,
                            "notes": loc.notes,
                            "fun_facts": loc.notes,
                            # Deprecated fields for backward compatibility
                            "stop_duration": loc.stop_duration,
                            "is_stop": loc.is_stop,
                        }
                        for idx, loc in enumerate(locations)
                    ]
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Get locations: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Get locations: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/locations", methods=["POST"])
@require_admin_auth
def add_location():
    """Add a new location to the route."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Preserve previous behavior: explicit required-field and range checks
        required_fields = ["name", "latitude", "longitude", "utc_offset"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return (
                jsonify({"error": f"Missing required fields: {missing_fields}"}),
                400,
            )

        try:
            lat_val = float(data["latitude"])
            lon_val = float(data["longitude"])
            tz_val = float(data["utc_offset"])
        except (ValueError, TypeError, KeyError):
            return jsonify({"error": "Invalid data format or values"}), 400

        if (
            not (-90.0 <= lat_val <= 90.0)
            or not (-180.0 <= lon_val <= 180.0)
            or not (-12.0 <= tz_val <= 14.0)
        ):
            return jsonify({"error": "Invalid data format or values"}), 400

        try:
            new_location = create_location_from_payload(data)
        except (ValueError, TypeError, KeyError):
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
    except json.JSONDecodeError as e:
        logger.exception("Add location: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Add location: File I/O error - %s", str(e))
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
            # Support both 'notes' and 'fun_facts' for backward compatibility
            if "notes" in data:
                notes = data["notes"]
            elif "fun_facts" in data:
                notes = data["fun_facts"]
            else:
                notes = locations[location_id].notes

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
                country=data.get("country", locations[location_id].country),
                population=data.get("population", locations[location_id].population),
                priority=data.get("priority", locations[location_id].priority),
                notes=notes,
                # Deprecated fields
                stop_duration=data.get(
                    "stop_duration", locations[location_id].stop_duration
                ),
                is_stop=data.get("is_stop", locations[location_id].is_stop),
            )
        except (ValueError, TypeError, KeyError):
            return jsonify({"error": "Invalid data format or values"}), 400

        locations[location_id] = updated_location
        save_santa_route_to_json(locations)

        return jsonify({"message": "Location updated successfully"}), 200
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Update location: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Update location: File I/O error - %s", str(e))
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
    except json.JSONDecodeError as e:
        logger.exception("Delete location: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Delete location: File I/O error - %s", str(e))
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
    except json.JSONDecodeError as e:
        logger.exception("Validate locations: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Validate locations: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


def _extract_location_name(loc_data):
    """Return the canonical name/location value or None."""
    return loc_data.get("name") or loc_data.get("location")


def _find_missing_required_fields(loc_data, required_fields):
    """Return list of required fields that are missing or None."""
    return [f for f in required_fields if f not in loc_data or loc_data[f] is None]


def _parse_numeric_fields(loc_data):
    """Parse latitude, longitude, utc_offset as floats or raise ValueError/TypeError.

    Returns (lat, lon, tz)
    """
    lat = loc_data.get("latitude")
    lon = loc_data.get("longitude")
    tz = loc_data.get("utc_offset")
    if lat is None or lon is None or tz is None:
        raise ValueError("Missing required field(s)")
    return float(lat), float(lon), float(tz)


def _make_location_from_parsed(name, loc_data, lat, lon, tz, notes):
    """Construct and return a Location instance from validated pieces."""
    return Location(
        name=name,
        latitude=lat,
        longitude=lon,
        utc_offset=tz,
        arrival_time=loc_data.get("arrival_time"),
        departure_time=loc_data.get("departure_time"),
        country=loc_data.get("country"),
        population=loc_data.get("population"),
        priority=loc_data.get("priority"),
        notes=notes,
        stop_duration=loc_data.get("stop_duration"),
        is_stop=loc_data.get("is_stop", True),
    )


def _parse_location_from_data(loc_data, idx):
    """Parse a single location from import data.

    Returns:
        tuple: (Location object or None, error message or None)
    """
    # Compose using small helpers to reduce branching within this function
    name = _extract_location_name(loc_data)
    if not name:
        return (
            None,
            f"Location at index {idx}: Missing required field 'name' or 'location'",
        )

    required = ["latitude", "longitude", "utc_offset"]
    missing = _find_missing_required_fields(loc_data, required)
    if missing:
        safe_fields = ", ".join(str(f) for f in missing)
        return (
            None,
            f"Location at index {idx}: Missing required field(s): {safe_fields}",
        )

    # parse numeric fields and validate ranges
    try:
        lat_val, lon_val, tz_val = _parse_numeric_fields(loc_data)
    except (ValueError, TypeError):
        return None, f"Location at index {idx}: Invalid data"

    if not (-90.0 <= lat_val <= 90.0):
        return None, f"Location at index {idx}: Invalid latitude"
    if not (-180.0 <= lon_val <= 180.0):
        return None, f"Location at index {idx}: Invalid longitude"
    if not (-12.0 <= tz_val <= 14.0):
        return None, f"Location at index {idx}: Invalid utc_offset"

    # build the Location using centralized helper; keep notes backward-compat
    try:
        location = create_location_from_payload(loc_data)
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
    except json.JSONDecodeError as e:
        logger.exception("Import locations: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Import locations: File I/O error - %s", str(e))
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
    except json.JSONDecodeError as e:
        logger.exception("Get route status: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Get route status: File I/O error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/precompute", methods=["POST"])
@require_admin_auth
def precompute_route():
    """
    Deprecated: Route precomputation is no longer supported.
    The route must have explicit arrival_time and departure_time for all locations.
    Use this endpoint to validate that all locations have required timing information.
    """
    try:
        locations = load_santa_route_from_json()

        if len(locations) == 0:
            return jsonify({"error": "No locations to validate"}), 400

        # Check if all locations have required timing information
        missing_or_invalid_times = []
        for idx, loc in enumerate(locations):
            issues = {}

            # Allow the anchor/start node to be missing arrival_time (legacy behavior)
            # Prefer explicit `type == "anchor" but keep idx==0 as fallback.
            node_type = getattr(loc, "type", None)
            if (
                isinstance(node_type, str) and node_type.lower() == "anchor"
            ) or idx == 0:
                continue

            if not loc.arrival_time:
                issues["arrival_time"] = "missing"
            else:
                # Validate ISO 8601 format
                try:
                    datetime.fromisoformat(loc.arrival_time.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    issues["arrival_time"] = "invalid format"

            if not loc.departure_time:
                issues["departure_time"] = "missing"
            else:
                # Validate ISO 8601 format
                try:
                    datetime.fromisoformat(loc.departure_time.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    issues["departure_time"] = "invalid format"

            if issues:
                missing_or_invalid_times.append(
                    {
                        "index": idx,
                        "name": loc.name,
                        "issues": issues,
                    }
                )

        if missing_or_invalid_times:
            return (
                jsonify(
                    {
                        "error": "Some locations have missing/invalid timing info",
                        "invalid_times": missing_or_invalid_times,
                        "message": (
                            "All locations must have explicit arrival_time "
                            "and departure_time in ISO 8601 format. "
                            "Calculation of timings is no longer "
                            "supported."
                        ),
                    }
                ),
                400,
            )

        return (
            jsonify(
                {
                    "message": "All locations have valid timing information",
                    "total_locations": len(locations),
                    "status": "complete",
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Precompute route: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Precompute route: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


def _calculate_total_duration_minutes(start_time, end_time):
    """
    Calculate total duration in minutes between two ISO 8601 timestamps.

    Args:
        start_time: Start time string in ISO 8601 format
        end_time: End time string in ISO 8601 format

    Returns:
        int: Total duration in minutes, or 0 if calculation fails
    """
    if not start_time or not end_time:
        return 0
    try:
        start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        return int((end_dt - start_dt).total_seconds() / 60)
    except (ValueError, AttributeError):
        return 0


def _make_simulated_route_item(loc):
    """Map a normalized location object to the flat simulated-route dict."""
    return {
        "name": loc.name,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "utc_offset": loc.utc_offset,
        "arrival_time": loc.arrival_time,
        "departure_time": loc.departure_time,
        "country": loc.country,
        "population": loc.population,
        "priority": loc.priority,
        "notes": loc.notes,
        "is_stop": loc.is_stop,
        "stop_duration": loc.stop_duration,
    }


def _compute_route_summary(simulated_route):
    """Compute summary fields (start/end/duration) from simulated_route list."""
    locations_with_times = [
        loc
        for loc in simulated_route
        if loc.get("arrival_time") and loc.get("departure_time")
    ]

    if len(locations_with_times) > 0:
        start_time = locations_with_times[0]["arrival_time"]
        end_time = locations_with_times[-1]["departure_time"]
        total_duration_minutes = _calculate_total_duration_minutes(start_time, end_time)
    else:
        start_time = None
        end_time = None
        total_duration_minutes = 0

    return {
        "total_locations": len(simulated_route),
        "locations_with_timing": len(locations_with_times),
        "start_time": start_time,
        "end_time": end_time,
        "total_duration_minutes": total_duration_minutes,
    }


def _build_simulated_from_locations(all_locations, location_ids=None):
    """Filter, sort and build simulated route and summary from location objects.

    Returns tuple (simulated_route_list, summary_dict, error_response_or_None)
    """
    # Filter
    locations, error = _filter_locations_by_ids(all_locations, location_ids)
    if error:
        return None, None, error

    assert locations is not None

    # Sort by utc_offset desc then by priority
    sorted_locations = sorted(
        locations, key=lambda loc: (-loc.utc_offset, loc.priority or 2)
    )

    # Build simulated route list
    simulated_route = [_make_simulated_route_item(loc) for loc in sorted_locations]

    # Build summary
    summary = _compute_route_summary(simulated_route)

    return simulated_route, summary, None


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


@app.route("/api/admin/route/simulate", methods=["POST"])
@require_admin_auth
def simulate_route():
    """
    Get a preview of the current Santa route with timing information.
    No longer calculates timings - returns existing timestamps from route data.
    """
    try:
        data = request.get_json(force=True, silent=True) or {}

        # Load current locations
        all_locations = load_santa_route_from_json()
        if not all_locations:
            return jsonify({"error": "No locations to simulate"}), 400

        simulated_route, summary, error = _build_simulated_from_locations(
            all_locations, data.get("location_ids")
        )
        if error:
            return error

        return jsonify({"simulated_route": simulated_route, "summary": summary}), 200

    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Simulate route: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Simulate route: Data validation error - %s", str(e))
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
            raw = load_trial_route_from_json()
            trial_locations = [_normalize_loc_item(it) for it in (raw or [])]
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
    except json.JSONDecodeError as e:
        logger.exception("Get trial route status: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Get trial route status: File I/O error - %s", str(e))
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
                location = create_location_from_payload(loc_data)
                locations.append(location)
            except (KeyError, ValueError):
                logger.exception("Invalid location data in uploaded trial route.")
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
    except json.JSONDecodeError as e:
        logger.exception("Upload trial route: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Upload trial route: File I/O error - %s", str(e))
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
    except OSError as e:
        logger.exception("Delete trial route: File I/O error - %s", str(e))
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
        raw = load_trial_route_from_json()
        trial_locations = [_normalize_loc_item(it) for it in (raw or [])]
        if not trial_locations:
            return jsonify({"error": "Trial route is empty"}), 400

        # Save as main route
        save_santa_route_to_json(trial_locations)

        message = (
            f"Trial route applied as main route " f"({len(trial_locations)} locations)"
        )
        return (
            jsonify({"success": True, "message": message}),
            200,
        )

    except json.JSONDecodeError as e:
        logger.exception("Apply trial route: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Apply trial route: File I/O error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/route/trial/simulate", methods=["POST"])
@require_admin_auth
def simulate_trial_route():
    """
    Preview the trial route with its existing timing information.
    No longer calculates timings - returns existing timestamps from trial route data.
    """
    try:
        # Check if trial route exists
        if not has_trial_route():
            return jsonify({"error": "No trial route to simulate"}), 404

        data = request.get_json(force=True, silent=True) or {}

        # Load trial locations
        raw = load_trial_route_from_json()
        all_locations = [_normalize_loc_item(it) for it in (raw or [])]
        if not all_locations:
            return jsonify({"error": "Trial route is empty"}), 400

        simulated_route, summary, error = _build_simulated_from_locations(
            all_locations, data.get("location_ids")
        )
        if error:
            return error

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
    except json.JSONDecodeError as e:
        logger.exception("Simulate trial route: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Simulate trial route: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/backup/export", methods=["GET"])
@require_admin_auth
def export_backup():
    """Export current locations and route data as JSON backup."""
    try:
        locations = load_santa_route_from_json()

        # produce legacy-flat route entries for compatibility with tests
        backup_data = {
            "backup_timestamp": datetime.now().isoformat(),
            "total_locations": len(locations),
            "route": [
                {
                    "name": loc.name,
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "utc_offset": loc.utc_offset,
                    "arrival_time": loc.arrival_time,
                    "departure_time": loc.departure_time,
                    "country": loc.country,
                    "population": loc.population,
                    "priority": loc.priority,
                    "notes": loc.notes,
                    "fun_facts": loc.notes,
                    "stop_duration": loc.stop_duration,
                    "is_stop": loc.is_stop,
                }
                for loc in locations
            ],
        }

        return jsonify(backup_data), 200
    except FileNotFoundError:
        return jsonify({"error": "Route data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Export backup: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Export backup: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


# ============== ADVENT CALENDAR ADMIN API ENDPOINTS ==============


@app.route("/api/admin/advent/days", methods=["GET"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Get advent days: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Get advent days: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>", methods=["GET"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Get advent day admin: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Get advent day admin: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>", methods=["PUT"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Update advent day: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Update advent day: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Update advent day: File I/O error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/day/<int:day_number>/toggle-unlock", methods=["POST"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Toggle advent day unlock: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Toggle advent day unlock: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Toggle advent day unlock: File I/O error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/validate", methods=["POST"])
@require_advent_enabled
@require_admin_auth
def validate_advent_calendar_endpoint():
    """Validate advent calendar data for completeness and correctness."""
    try:
        days = load_advent_calendar()
        validation_results = validate_advent_calendar(days)

        return jsonify(validation_results), 200
    except FileNotFoundError:
        return jsonify({"error": "Advent calendar data not found"}), 404
    except json.JSONDecodeError as e:
        logger.exception("Validate advent calendar: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Validate advent calendar: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/export", methods=["GET"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Export advent backup: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except (ValueError, KeyError) as e:
        logger.exception("Export advent backup: Data validation error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/admin/advent/import", methods=["POST"])
@require_advent_enabled
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
    except json.JSONDecodeError as e:
        logger.exception("Import advent calendar: JSON parsing error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500
    except OSError as e:
        logger.exception("Import advent calendar: File I/O error - %s", str(e))
        return jsonify({"error": "Internal server error"}), 500


def _normalize_loc_item(loc_item):
    """Normalize a location item into a SimpleNamespace expected by app code."""
    if loc_item is None:
        return SimpleNamespace(
            name=None,
            latitude=None,
            longitude=None,
            utc_offset=None,
            arrival_time=None,
            departure_time=None,
            country=None,
            population=None,
            priority=None,
            notes=None,
            stop_duration=None,
            is_stop=None,
            type=None,
        )

    if isinstance(loc_item, dict):
        return _normalize_loc_item_from_dict(loc_item)

    return _normalize_loc_item_from_object(loc_item)


def _normalize_loc_item_from_dict(d: dict) -> SimpleNamespace:
    """Normalize when input is a dict (either new schema node or legacy flat dict)."""
    if isinstance(d.get("location"), dict):
        return _normalize_from_nested_dict(d)

    # Legacy flat dict: preserve original simple mapping, include `type` if present
    return SimpleNamespace(
        name=d.get("name"),
        latitude=d.get("latitude"),
        longitude=d.get("longitude"),
        utc_offset=d.get("utc_offset"),
        arrival_time=d.get("arrival_time"),
        departure_time=d.get("departure_time"),
        country=d.get("country"),
        population=d.get("population"),
        priority=d.get("priority"),
        notes=d.get("notes") or d.get("fun_facts"),
        stop_duration=d.get("stop_duration"),
        is_stop=d.get("is_stop", True),
        type=d.get("type") or d.get("node_type"),
    )


def _normalize_from_nested_dict(d: dict) -> SimpleNamespace:
    """Handle normalization for the nested/new schema node format."""
    # Delegate small responsibilities to helpers to reduce branching here
    name = _get_name_from_nested(d)
    lat, lng, tz = _get_coords_from_nested(d)
    arrival, departure = _get_schedule_times(d)
    stop_duration = _compute_stop_duration_from_stop_experience(
        d.get("stop_experience") or {}, d
    )
    country = _get_country_from_nested(d)
    population = d.get("population")
    priority = d.get("priority")
    notes = d.get("notes") or d.get("fun_facts")
    is_stop = d.get("is_stop", True)
    node_type = _get_node_type_from_nested(d)

    return SimpleNamespace(
        name=name,
        latitude=lat,
        longitude=lng,
        utc_offset=tz,
        arrival_time=arrival,
        departure_time=departure,
        country=country,
        population=population,
        priority=priority,
        notes=notes,
        stop_duration=stop_duration,
        is_stop=is_stop,
        type=node_type,
    )


def _get_name_from_nested(d: dict):
    loc = d.get("location") or {}
    return loc.get("name") or d.get("name") or d.get("id")


def _get_coords_from_nested(d: dict):
    loc = d.get("location") or {}
    lat = loc.get("lat") if loc.get("lat") is not None else d.get("latitude")
    lng = loc.get("lng") if loc.get("lng") is not None else d.get("longitude")
    tz = (
        loc.get("timezone_offset")
        if loc.get("timezone_offset") is not None
        else d.get("utc_offset")
    )
    return lat, lng, tz


def _get_schedule_times(d: dict):
    sched = d.get("schedule") or {}
    arrival = sched.get("arrival_utc") if sched else d.get("arrival_time")
    departure = sched.get("departure_utc") if sched else d.get("departure_time")
    return arrival, departure


def _get_node_type_from_nested(d: dict):
    loc = d.get("location") or {}
    return (
        loc.get("type") or loc.get("node_type") or d.get("type") or d.get("node_type")
    )


def _get_country_from_nested(d: dict):
    loc = d.get("location") or {}
    return loc.get("region") or d.get("country")


def _compute_stop_duration_from_stop_experience(se: dict, d: dict):
    """Compute stop_duration in minutes from stop_experience.duration_seconds,
    falling back to legacy d.get('stop_duration') on errors or absence.
    """
    if se and se.get("duration_seconds") is not None:
        try:
            # ensure numeric handling is robust
            return int(float(se.get("duration_seconds")) / 60)
        except (TypeError, ValueError):
            return d.get("stop_duration")
    return d.get("stop_duration")


def _normalize_loc_item_from_object(obj) -> SimpleNamespace:
    """Normalize when input is an object (Location/Node-like) via getattr fallbacks."""
    return SimpleNamespace(
        name=getattr(obj, "name", None),
        latitude=(getattr(obj, "latitude", None) or getattr(obj, "lat", None)),
        longitude=(getattr(obj, "longitude", None) or getattr(obj, "lng", None)),
        utc_offset=(
            getattr(obj, "utc_offset", None) or getattr(obj, "timezone_offset", None)
        ),
        arrival_time=getattr(obj, "arrival_time", None),
        departure_time=getattr(obj, "departure_time", None),
        country=(getattr(obj, "country", None) or getattr(obj, "region", None)),
        population=getattr(obj, "population", None),
        priority=getattr(obj, "priority", None),
        notes=(getattr(obj, "notes", None) or getattr(obj, "fun_facts", None)),
        stop_duration=getattr(obj, "stop_duration", None),
        is_stop=getattr(obj, "is_stop", True),
        type=(getattr(obj, "type", None) or getattr(obj, "node_type", None)),
    )


if "_orig_load_santa_route" not in globals():
    _orig_load_santa_route = load_santa_route_from_json


def load_santa_route_from_json_normalized(source=None):
    """
    Wrapper around the original loader:
    - if `source` is provided, return the loader's raw result.
    - Otherwise return a list of normalized SimpleNamespace items.
    """
    if source is not None:
        return _orig_load_santa_route(source)

    items = _orig_load_santa_route()
    return [_normalize_loc_item(it) for it in (items or [])]


# Explicit, easy-to-find rebinding used by the rest of this module
load_santa_route_from_json = load_santa_route_from_json_normalized

if __name__ == "__main__":
    # Start a local development server when this module is run directly.
    host = os.environ.get("FLASK_RUN_HOST", "127.0.0.1")
    port = int(os.environ.get("FLASK_RUN_PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "0") in ("1", "true", "True")
    logger.info(
        "Starting Flask development server on %s:%d (debug=%s)",
        host, port, debug
    )
    app.run(host=host, port=port, debug=debug)
