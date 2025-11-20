"""Tests for admin API endpoints."""

import json
import os
import shutil
from pathlib import Path

import pytest

from src.app import app


@pytest.fixture
def client():
    """Create test client."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    """Create authentication headers."""
    # Set admin password for testing
    os.environ["ADMIN_PASSWORD"] = "test_password"
    return {"Authorization": "Bearer test_password"}


@pytest.fixture(autouse=True)
def backup_route_file():
    """Backup and restore the route file after tests."""
    route_file = (
        Path(__file__).parent.parent / "src" / "static" / "data" / "santa_route.json"
    )
    backup_file = route_file.with_suffix(".json.backup")

    # Backup the original file
    if route_file.exists():
        shutil.copy(route_file, backup_file)

    yield

    # Restore the original file
    if backup_file.exists():
        shutil.move(backup_file, route_file)


class TestAdminAuthentication:
    """Test admin authentication."""

    def test_admin_route_without_auth(self, client):
        """Test admin route requires authentication."""
        # Backup original ADMIN_PASSWORD
        orig_admin_pw = os.environ.get("ADMIN_PASSWORD")
        try:
            # Remove any existing password first
            if "ADMIN_PASSWORD" in os.environ:
                del os.environ["ADMIN_PASSWORD"]
            # Set it back
            os.environ["ADMIN_PASSWORD"] = "test"

            response = client.get("/api/admin/locations")
            assert response.status_code == 401
            data = response.get_json()
            assert "error" in data
        finally:
            # Restore original ADMIN_PASSWORD
            if orig_admin_pw is not None:
                os.environ["ADMIN_PASSWORD"] = orig_admin_pw
            elif "ADMIN_PASSWORD" in os.environ:
                del os.environ["ADMIN_PASSWORD"]

    def test_admin_route_with_invalid_auth(self, client):
        """Test admin route with invalid credentials."""
        os.environ["ADMIN_PASSWORD"] = "correct_password"
        headers = {"Authorization": "Bearer wrong_password"}
        response = client.get("/api/admin/locations", headers=headers)
        assert response.status_code == 403
        data = response.get_json()
        assert "error" in data

    def test_admin_route_with_valid_auth(self, client, auth_headers):
        """Test admin route with valid credentials."""
        response = client.get("/api/admin/locations", headers=auth_headers)
        assert response.status_code == 200

    def test_admin_route_without_password_configured(self, client):
        """Test admin route when no password is configured."""
        # Backup original ADMIN_PASSWORD
        orig_admin_pw = os.environ.get("ADMIN_PASSWORD")
        try:
            # Remove admin password
            if "ADMIN_PASSWORD" in os.environ:
                del os.environ["ADMIN_PASSWORD"]

            headers = {"Authorization": "Bearer some_password"}
            response = client.get("/api/admin/locations", headers=headers)
            assert response.status_code == 500
        finally:
            # Restore original ADMIN_PASSWORD
            if orig_admin_pw is not None:
                os.environ["ADMIN_PASSWORD"] = orig_admin_pw
            elif "ADMIN_PASSWORD" in os.environ:
                del os.environ["ADMIN_PASSWORD"]
        data = response.get_json()
        assert "not configured" in data["error"].lower()

    def test_login_endpoint_success(self, client):
        """Test successful login with correct password."""
        os.environ["ADMIN_PASSWORD"] = "test_password"
        response = client.post(
            "/api/admin/login",
            data=json.dumps({"password": "test_password"}),
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "token" in data
        assert len(data["token"]) > 0

    def test_login_endpoint_invalid_password(self, client):
        """Test login with incorrect password."""
        os.environ["ADMIN_PASSWORD"] = "correct_password"
        response = client.post(
            "/api/admin/login",
            data=json.dumps({"password": "wrong_password"}),
            content_type="application/json",
        )
        assert response.status_code == 401
        data = response.get_json()
        assert "error" in data

    def test_login_endpoint_no_password(self, client):
        """Test login without password."""
        response = client.post(
            "/api/admin/login",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_session_token_authentication(self, client):
        """Test that session token can be used for authentication."""
        os.environ["ADMIN_PASSWORD"] = "test_password"

        # Login to get session token
        login_response = client.post(
            "/api/admin/login",
            data=json.dumps({"password": "test_password"}),
            content_type="application/json",
        )
        assert login_response.status_code == 200
        token = login_response.get_json()["token"]

        # Use session token to access protected endpoint
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/admin/locations", headers=headers)
        assert response.status_code == 200


class TestGetLocations:
    """Test GET /api/admin/locations endpoint."""

    def test_get_all_locations(self, client, auth_headers):
        """Test getting all locations."""
        response = client.get("/api/admin/locations", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "locations" in data
        assert len(data["locations"]) > 0  # Should have at least some locations

        # Check first location has required fields
        loc1 = data["locations"][0]
        assert "name" in loc1
        assert "latitude" in loc1
        assert "longitude" in loc1
        assert "utc_offset" in loc1
        assert "id" in loc1

    def test_get_locations_includes_all_fields(self, client, auth_headers):
        """Test that all location fields are included in response."""
        response = client.get("/api/admin/locations", headers=auth_headers)
        data = response.get_json()

        location = data["locations"][0]
        required_fields = [
            "id",
            "name",
            "latitude",
            "longitude",
            "utc_offset",
            "arrival_time",
            "departure_time",
            "stop_duration",
            "is_stop",
            "priority",
            "fun_facts",
        ]

        for field in required_fields:
            assert field in location


class TestAddLocation:
    """Test POST /api/admin/locations endpoint."""

    def test_add_location_success(self, client, auth_headers):
        """Test successfully adding a new location."""
        # Get current count
        response = client.get("/api/admin/locations", headers=auth_headers)
        initial_count = len(response.get_json()["locations"])

        new_location = {
            "name": "Test New Location XYZ",
            "latitude": 35.6762,
            "longitude": 139.6503,
            "utc_offset": 9.0,
            "priority": 1,
        }

        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=json.dumps(new_location),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()
        assert "message" in data
        assert "Location added successfully" in data["message"]
        assert "id" in data

        # Verify it was added
        response = client.get("/api/admin/locations", headers=auth_headers)
        assert len(response.get_json()["locations"]) == initial_count + 1

    def test_add_location_with_all_fields(self, client, auth_headers):
        """Test adding location with all optional fields."""
        new_location = {
            "name": "Complete Location Test XYZ",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "utc_offset": 1.0,
            "priority": 2,
            "arrival_time": "2024-12-24T12:00:00Z",
            "departure_time": "2024-12-24T12:30:00Z",
            "stop_duration": 30,
            "is_stop": True,
            "fun_facts": "City of Light!",
        }

        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=json.dumps(new_location),
            content_type="application/json",
        )

        assert response.status_code == 201

    def test_add_location_missing_required_field(self, client, auth_headers):
        """Test adding location with missing required fields."""
        incomplete_location = {
            "name": "Incomplete Location",
            "latitude": 40.7128,
            # Missing longitude and utc_offset
        }

        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=json.dumps(incomplete_location),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "Missing required fields" in data["error"]

    def test_add_location_invalid_latitude(self, client, auth_headers):
        """Test adding location with invalid latitude."""
        invalid_location = {
            "name": "Invalid Location",
            "latitude": 100.0,  # Invalid: > 90
            "longitude": 0.0,
            "utc_offset": 0.0,
        }

        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=json.dumps(invalid_location),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "Invalid data" in data["error"]

    def test_add_location_invalid_utc_offset(self, client, auth_headers):
        """Test adding location with invalid UTC offset."""
        invalid_location = {
            "name": "Invalid Location UTC",
            "latitude": 40.0,
            "longitude": 0.0,
            "utc_offset": 15.0,  # Invalid: > 14
        }

        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=json.dumps(invalid_location),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_add_location_no_data(self, client, auth_headers):
        """Test adding location with no data."""
        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            data=None,
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "No data provided" in data["error"]


class TestUpdateLocation:
    """Test PUT /api/admin/locations/<id> endpoint."""

    def test_update_location_success(self, client, auth_headers):
        """Test successfully updating a location."""
        # Get existing location to update
        response = client.get("/api/admin/locations", headers=auth_headers)
        locations = response.get_json()["locations"]
        location_to_update = locations[-1]  # Use last location
        location_id = location_to_update["id"]

        updated_data = {
            "name": "Updated Test Location",
            "latitude": 41.0,
            "longitude": -75.0,
            "utc_offset": -4.0,
        }

        response = client.put(
            f"/api/admin/locations/{location_id}",
            headers=auth_headers,
            data=json.dumps(updated_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "Location updated successfully" in data["message"]

    def test_update_location_not_found(self, client, auth_headers):
        """Test updating non-existent location."""
        updated_data = {"name": "Does Not Exist"}

        response = client.put(
            "/api/admin/locations/99999",
            headers=auth_headers,
            data=json.dumps(updated_data),
            content_type="application/json",
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "Location not found" in data["error"]

    def test_update_location_invalid_data(self, client, auth_headers):
        """Test updating location with invalid data."""
        invalid_data = {"latitude": 100.0}  # Invalid latitude

        response = client.put(
            "/api/admin/locations/0",
            headers=auth_headers,
            data=json.dumps(invalid_data),
            content_type="application/json",
        )

        assert response.status_code == 400


class TestDeleteLocation:
    """Test DELETE /api/admin/locations/<id> endpoint."""

    def test_delete_location_not_found(self, client, auth_headers):
        """Test deleting non-existent location."""
        response = client.delete("/api/admin/locations/99999", headers=auth_headers)

        assert response.status_code == 404
        data = response.get_json()
        assert "Location not found" in data["error"]


class TestValidateLocations:
    """Test POST /api/admin/locations/validate endpoint."""

    def test_validate_locations_endpoint_works(self, client, auth_headers):
        """Test that validation endpoint returns expected structure."""
        response = client.post("/api/admin/locations/validate", headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert "valid" in data
        assert "total_locations" in data
        assert "errors" in data
        assert "warnings" in data
        assert isinstance(data["errors"], list)
        assert isinstance(data["warnings"], list)

    def test_validation_returns_location_count(self, client, auth_headers):
        """Test that validation returns correct location count."""
        # Get actual count
        response = client.get("/api/admin/locations", headers=auth_headers)
        actual_count = len(response.get_json()["locations"])

        # Validate
        response = client.post("/api/admin/locations/validate", headers=auth_headers)

        data = response.get_json()
        assert data["total_locations"] == actual_count


class TestImportLocations:
    """Test POST /api/admin/locations/import endpoint."""

    def test_import_locations_append_mode(self, client, auth_headers):
        """Test importing locations in append mode."""
        # Get initial count
        response = client.get("/api/admin/locations", headers=auth_headers)
        initial_count = len(response.get_json()["locations"])

        # Import new locations
        import_data = {
            "mode": "append",
            "locations": [
                {
                    "name": "Import Test Location 1",
                    "latitude": 45.0,
                    "longitude": -90.0,
                    "utc_offset": -6.0,
                },
                {
                    "name": "Import Test Location 2",
                    "latitude": 50.0,
                    "longitude": -100.0,
                    "utc_offset": -7.0,
                },
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data
        assert data["imported"] == 2
        assert data["mode"] == "append"

        # Verify locations were added
        response = client.get("/api/admin/locations", headers=auth_headers)
        new_count = len(response.get_json()["locations"])
        assert new_count == initial_count + 2

    def test_import_locations_replace_mode(self, client, auth_headers):
        """Test importing locations in replace mode."""
        import_data = {
            "mode": "replace",
            "locations": [
                {
                    "name": "Only Location",
                    "latitude": 0.0,
                    "longitude": 0.0,
                    "utc_offset": 0.0,
                }
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["imported"] == 1
        assert data["mode"] == "replace"

        # Verify only one location exists
        response = client.get("/api/admin/locations", headers=auth_headers)
        locations = response.get_json()["locations"]
        assert len(locations) == 1
        assert locations[0]["name"] == "Only Location"

    def test_import_with_all_fields(self, client, auth_headers):
        """Test importing location with all optional fields."""
        import_data = {
            "mode": "append",
            "locations": [
                {
                    "name": "Complete Import Location",
                    "latitude": 40.0,
                    "longitude": -80.0,
                    "utc_offset": -5.0,
                    "priority": 1,
                    "arrival_time": "2024-12-24T10:00:00Z",
                    "departure_time": "2024-12-24T10:30:00Z",
                    "stop_duration": 30,
                    "is_stop": True,
                    "fun_facts": "Test location with all fields",
                }
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 200

    def test_import_supports_location_field(self, client, auth_headers):
        """Test that import supports 'location' field as alias for 'name'."""
        import_data = {
            "mode": "append",
            "locations": [
                {
                    "location": "Test with location field",
                    "latitude": 30.0,
                    "longitude": -70.0,
                    "utc_offset": -4.0,
                }
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["imported"] == 1

    def test_import_no_data(self, client, auth_headers):
        """Test import with no data provided."""
        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=None,
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "No data provided" in data["error"]

    def test_import_empty_list(self, client, auth_headers):
        """Test import with empty locations list."""
        import_data = {"mode": "append", "locations": []}

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "No locations provided" in data["error"]

    def test_import_invalid_data_type(self, client, auth_headers):
        """Test import with non-list locations."""
        import_data = {"mode": "append", "locations": "not a list"}

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "must be a list" in data["error"]

    def test_import_with_invalid_location_data(self, client, auth_headers):
        """Test import with some invalid locations."""
        import_data = {
            "mode": "append",
            "locations": [
                {
                    "name": "Valid Location",
                    "latitude": 40.0,
                    "longitude": -75.0,
                    "utc_offset": -5.0,
                },
                {
                    # Missing name
                    "latitude": 50.0,
                    "longitude": -80.0,
                    "utc_offset": -6.0,
                },
                {
                    "name": "Another Valid",
                    "latitude": 45.0,
                    "longitude": -85.0,
                    "utc_offset": -5.0,
                },
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            data=json.dumps(import_data),
            content_type="application/json",
        )

        # Should succeed with warnings about invalid entries
        assert response.status_code == 200
        data = response.get_json()
        assert data["imported"] == 2  # Only valid ones imported
        assert data["errors"] is not None
        assert len(data["errors"]) > 0

    def test_import_requires_authentication(self, client):
        """Test that import requires authentication."""
        import_data = {
            "mode": "append",
            "locations": [
                {"name": "Test", "latitude": 0.0, "longitude": 0.0, "utc_offset": 0.0}
            ],
        }

        response = client.post(
            "/api/admin/locations/import",
            data=json.dumps(import_data),
            content_type="application/json",
        )

        assert response.status_code == 401


class TestRouteStatus:
    """Test GET /api/admin/route/status endpoint."""

    def test_get_route_status_success(self, client, auth_headers):
        """Test getting route status."""
        response = client.get("/api/admin/route/status", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "total_locations" in data
        assert "locations_with_timing" in data
        assert "priority_breakdown" in data
        assert "last_modified" in data
        assert "route_complete" in data
        assert isinstance(data["total_locations"], int)
        assert isinstance(data["route_complete"], bool)

    def test_get_route_status_requires_auth(self, client):
        """Test that route status requires authentication."""
        response = client.get("/api/admin/route/status")
        assert response.status_code == 401


class TestRoutePrecompute:
    """Test POST /api/admin/route/precompute endpoint."""

    def test_precompute_route_success(self, client, auth_headers):
        """Test route validation (precompute now validates, not calculates)."""
        response = client.post("/api/admin/route/precompute", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "message" in data
        assert "total_locations" in data
        assert "status" in data
        assert data["status"] == "complete"

    def test_precompute_route_requires_auth(self, client):
        """Test that route validation requires authentication."""
        response = client.post("/api/admin/route/precompute")
        assert response.status_code == 401


class TestBackupExport:
    """Test GET /api/admin/backup/export endpoint."""

    def test_export_backup_success(self, client, auth_headers):
        """Test exporting backup."""
        response = client.get("/api/admin/backup/export", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "backup_timestamp" in data
        assert "total_locations" in data
        assert "route" in data
        assert isinstance(data["route"], list)
        assert data["total_locations"] == len(data["route"])

    def test_export_backup_contains_all_fields(self, client, auth_headers):
        """Test that export includes all location fields."""
        response = client.get("/api/admin/backup/export", headers=auth_headers)
        data = response.get_json()

        if len(data["route"]) > 0:
            location = data["route"][0]
            required_fields = [
                "name",  # Updated from 'location' to 'name'
                "latitude",
                "longitude",
                "utc_offset",
                "is_stop",
            ]
            for field in required_fields:
                assert field in location

    def test_export_backup_requires_auth(self, client):
        """Test that backup export requires authentication."""
        response = client.get("/api/admin/backup/export")
        assert response.status_code == 401


class TestRouteSimulation:
    """Test POST /api/admin/route/simulate endpoint."""

    def test_simulate_route_default_params(self, client, auth_headers):
        """Test previewing route with default parameters."""
        response = client.post("/api/admin/route/simulate", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "route_preview" in data
        assert "summary" in data
        assert isinstance(data["route_preview"], list)

        summary = data["summary"]
        assert "total_locations" in summary
        assert "start_time" in summary
        assert "end_time" in summary
        assert "locations_with_timing" in summary

    def test_simulate_route_with_custom_start_time(self, client, auth_headers):
        """Test that custom start time is ignored."""
        custom_time = "2024-12-25T10:00:00Z"
        response = client.post(
            "/api/admin/route/simulate",
            headers=auth_headers,
            data=json.dumps({"start_time": custom_time}),
            content_type="application/json",
        )
        assert response.status_code == 200

        data = response.get_json()
        # Start time should come from route data, not custom parameter
        # This is expected behavior in the new static timeline model
        assert "start_time" in data["summary"]

    def test_simulate_route_with_location_ids(self, client, auth_headers):
        """Test previewing route with specific location IDs."""
        response = client.post(
            "/api/admin/route/simulate",
            headers=auth_headers,
            data=json.dumps({"location_ids": [0, 1]}),
            content_type="application/json",
        )
        assert response.status_code == 200

        data = response.get_json()
        # Should only preview the specified locations
        assert len(data["route_preview"]) <= 2

    def test_simulate_route_invalid_start_time(self, client, auth_headers):
        """Test that invalid start time parameter is ignored (no longer used)."""
        response = client.post(
            "/api/admin/route/simulate",
            headers=auth_headers,
            data=json.dumps({"start_time": "invalid-time"}),
            content_type="application/json",
        )
        # Should succeed because start_time parameter is no longer parsed
        assert response.status_code == 200

    def test_simulate_route_requires_auth(self, client):
        """Test that route simulation requires authentication."""
        response = client.post("/api/admin/route/simulate")
        assert response.status_code == 401

    def test_simulated_route_contains_all_fields(self, client, auth_headers):
        """Test that preview locations contain all expected fields."""
        response = client.post("/api/admin/route/simulate", headers=auth_headers)
        data = response.get_json()

        if len(data["route_preview"]) > 0:
            location = data["route_preview"][0]
            required_fields = [
                "name",
                "latitude",
                "longitude",
                "utc_offset",
                "arrival_time",
                "departure_time",
                "is_stop",
            ]
            for field in required_fields:
                assert field in location
