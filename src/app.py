import os
import sys

from flask import Flask, jsonify, render_template

# Add the src directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.advent import get_day_content, get_manifest  # noqa: E402

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Only enable debug mode via environment variable to prevent security issues
    debug_mode = os.environ.get("FLASK_DEBUG", "False") == "True"
    app.run(debug=debug_mode)
