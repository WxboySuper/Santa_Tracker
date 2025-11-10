import os
import secrets
import sys
from functools import wraps

from flask import Flask, jsonify, render_template, request

# Add the src directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.advent import get_day_content, get_manifest  # noqa: E402
from utils.locations import (  # noqa: E402
    Location,
    load_santa_route_from_json,
    save_santa_route_to_json,
    validate_locations,
)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key")


def require_admin_auth(f):
    """Decorator to require admin authentication via password."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        admin_password = os.environ.get("ADMIN_PASSWORD")

        if not admin_password:
            return jsonify({"error": "Admin access not configured"}), 500

        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401

        token = auth_header.split(" ")[1]
        if not secrets.compare_digest(token, admin_password):
            return jsonify({"error": "Invalid credentials"}), 403

        return f(*args, **kwargs)

    return decorated_function


@app.route("/")
def index():
    return render_template("index.html")


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


@app.route("/api/admin/locations/import", methods=["POST"])
@require_admin_auth
def import_locations():
    """Import locations in bulk from JSON data."""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        import_mode = data.get("mode", "append")  # "append" or "replace"
        locations_data = data.get("locations", [])

        if not isinstance(locations_data, list):
            return jsonify({"error": "Locations must be a list"}), 400

        if len(locations_data) == 0:
            return jsonify({"error": "No locations provided"}), 400

        # Parse and validate each location
        new_locations = []
        errors = []

        for idx, loc_data in enumerate(locations_data):
            try:
                # Support both "name" and "location" fields
                name = loc_data.get("name") or loc_data.get("location")
                if not name:
                    errors.append(
                        f"Location {idx}: Missing required field 'name' or 'location'"
                    )
                    continue

                # Check for required fields: latitude, longitude, utc_offset
                missing_fields = []
                for field in ["latitude", "longitude", "utc_offset"]:
                    if field not in loc_data or loc_data[field] is None:
                        missing_fields.append(field)
                if missing_fields:
                    errors.append(
                        f"Location {idx} ({name}): Missing required field(s): {', '.join(missing_fields)}"
                    )
                    continue

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
                new_locations.append(location)
            except (ValueError, TypeError):
                errors.append(
                    f"Location {idx} ({loc_data.get('name', 'unknown')}): Invalid data"
                )

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
                    "message": f"Successfully imported {len(new_locations)} location(s)",
                    "imported": len(new_locations),
                    "errors": errors if errors else None,
                    "mode": import_mode,
                }
            ),
            200,
        )
    except FileNotFoundError:
        return jsonify({"error": "Location data not found"}), 404
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Only enable debug mode via environment variable to prevent security issues
    debug_mode = os.environ.get("FLASK_DEBUG", "False") == "True"
    app.run(debug=debug_mode)
