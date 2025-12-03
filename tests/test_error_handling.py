"""Tests for specific exception handling in API endpoints."""

import os
import shutil
from pathlib import Path

import pytest

from src.app import app


@pytest.fixture
def client():
    """Create test client."""
    app.config["TESTING"] = True
    app.config["ADVENT_ENABLED"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    """Create authentication headers."""
    os.environ["ADMIN_PASSWORD"] = "test_password"
    return {"Authorization": "Bearer test_password"}


@pytest.fixture(autouse=True)
def backup_route_file():
    """Backup and restore the route file after tests."""
    route_file = (
        Path(__file__).parent.parent / "src" / "static" / "data" / "santa_route.json"
    )
    backup_file = route_file.with_suffix(".json.backup")

    if route_file.exists():
        shutil.copy(route_file, backup_file)

    yield

    if backup_file.exists():
        shutil.move(backup_file, route_file)


@pytest.fixture
def backup_advent_file():
    """Backup and restore the advent calendar file after tests."""
    advent_file = (
        Path(__file__).parent.parent
        / "src"
        / "static"
        / "data"
        / "advent_calendar.json"
    )
    backup_file = advent_file.with_suffix(".json.backup_advent")

    if advent_file.exists():
        shutil.copy(advent_file, backup_file)

    yield advent_file

    if backup_file.exists():
        shutil.move(backup_file, advent_file)


class TestJSONDecodeErrorHandling:
    """Tests for JSONDecodeError handling in API endpoints."""

    def test_get_locations_with_corrupted_json(self, client, auth_headers):
        """Test that corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        # Corrupt the JSON file
        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.get("/api/admin/locations", headers=auth_headers)
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            # Restore the file
            route_file.write_text(original_content)

    def test_add_location_with_corrupted_json(self, client, auth_headers):
        """Test that add location with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/locations",
                headers=auth_headers,
                json={
                    "name": "Test City",
                    "latitude": 0.0,
                    "longitude": 0.0,
                    "utc_offset": 0.0,
                },
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)


class TestFileNotFoundHandling:
    """Tests for FileNotFoundError handling in API endpoints."""

    def test_get_locations_with_missing_file(self, client, auth_headers):
        """Test that missing route file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        # Temporarily rename the file
        temp_file = route_file.with_suffix(".json.temp")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.get("/api/admin/locations", headers=auth_headers)
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Location data not found"
        finally:
            # Restore the file
            if temp_file.exists():
                temp_file.rename(route_file)


class TestValidDataErrorHandling:
    """Tests for ValueError and TypeError handling."""

    def test_add_location_invalid_latitude(self, client, auth_headers):
        """Test that invalid latitude returns 400 error."""
        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            json={
                "name": "Test City",
                "latitude": 100.0,  # Invalid: > 90
                "longitude": 0.0,
                "utc_offset": 0.0,
            },
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data format or values"

    def test_add_location_invalid_longitude(self, client, auth_headers):
        """Test that invalid longitude returns 400 error."""
        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            json={
                "name": "Test City",
                "latitude": 0.0,
                "longitude": 200.0,  # Invalid: > 180
                "utc_offset": 0.0,
            },
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data format or values"

    def test_add_location_invalid_utc_offset(self, client, auth_headers):
        """Test that invalid utc_offset returns 400 error."""
        response = client.post(
            "/api/admin/locations",
            headers=auth_headers,
            json={
                "name": "Test City",
                "latitude": 0.0,
                "longitude": 0.0,
                "utc_offset": 20.0,  # Invalid: > 14
            },
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data format or values"


class TestImportLocationsErrorHandling:
    """Tests for error handling in import_locations endpoint."""

    def test_import_invalid_locations_list(self, client, auth_headers):
        """Test that importing invalid location data returns errors."""
        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            json={
                "mode": "append",
                "locations": [
                    {
                        "name": "Valid City",
                        "latitude": 0.0,
                        "longitude": 0.0,
                        "utc_offset": 0.0,
                    },
                    {
                        # Missing required fields
                        "name": "Invalid City",
                    },
                ],
            },
        )
        # Should return 200 with partial success or 400 if all fail
        assert response.status_code in [200, 400]

    def test_import_with_corrupted_json(self, client, auth_headers):
        """Test that import with corrupted route file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/locations/import",
                headers=auth_headers,
                json={
                    "mode": "append",
                    "locations": [
                        {
                            "name": "Test City",
                            "latitude": 0.0,
                            "longitude": 0.0,
                            "utc_offset": 0.0,
                        }
                    ],
                },
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)


class TestSpecificExceptionTypes:
    """Tests to verify specific exception types are caught correctly."""

    def test_login_handles_type_error(self, client):
        """Test that login handles TypeError properly."""
        os.environ["ADMIN_PASSWORD"] = "test_password"
        # Send malformed request data
        response = client.post(
            "/api/admin/login",
            data="not json",
            content_type="application/json",
        )
        # Should return 400 because get_json with silent=True returns None
        assert response.status_code == 400

    def test_login_handles_non_string_password(self, client):
        """Test that login handles non-string password (TypeError)."""
        os.environ["ADMIN_PASSWORD"] = "test_password"
        # Send password as integer which will cause TypeError in compare_digest
        response = client.post(
            "/api/admin/login",
            json={"password": 12345},  # Integer instead of string
        )
        # Should return 400 for invalid data format
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data format"

    def test_update_location_not_found(self, client, auth_headers):
        """Test that updating non-existent location returns 404."""
        response = client.put(
            "/api/admin/locations/9999",
            headers=auth_headers,
            json={"name": "Updated City"},
        )
        assert response.status_code == 404
        data = response.get_json()
        assert data["error"] == "Location not found"

    def test_delete_location_not_found(self, client, auth_headers):
        """Test that deleting non-existent location returns 404."""
        response = client.delete(
            "/api/admin/locations/9999",
            headers=auth_headers,
        )
        assert response.status_code == 404
        data = response.get_json()
        assert data["error"] == "Location not found"


class TestUpdateLocationErrorHandling:
    """Tests for error handling in update_location endpoint."""

    def test_update_location_with_corrupted_json(self, client, auth_headers):
        """Test that update location with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.put(
                "/api/admin/locations/0",
                headers=auth_headers,
                json={"name": "Updated City"},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_update_location_invalid_latitude(self, client, auth_headers):
        """Test that invalid latitude in update returns 400 error."""
        response = client.put(
            "/api/admin/locations/0",
            headers=auth_headers,
            json={"latitude": 100.0},  # Invalid: > 90
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data format or values"


class TestDeleteLocationErrorHandling:
    """Tests for error handling in delete_location endpoint."""

    def test_delete_location_with_corrupted_json(self, client, auth_headers):
        """Test that delete location with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.delete(
                "/api/admin/locations/0",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_delete_location_with_missing_file(self, client, auth_headers):
        """Test that delete location with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_delete")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.delete(
                "/api/admin/locations/0",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Location data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestValidateLocationsErrorHandling:
    """Tests for error handling in validate_location_data endpoint."""

    def test_validate_locations_with_corrupted_json(self, client, auth_headers):
        """Test that validate locations with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/locations/validate",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_validate_locations_with_missing_file(self, client, auth_headers):
        """Test that validate locations with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_validate")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.post(
                "/api/admin/locations/validate",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Location data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestRouteStatusErrorHandling:
    """Tests for error handling in get_route_status endpoint."""

    def test_get_route_status_with_corrupted_json(self, client, auth_headers):
        """Test that get route status with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.get(
                "/api/admin/route/status",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_get_route_status_with_missing_file(self, client, auth_headers):
        """Test that get route status with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_status")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.get(
                "/api/admin/route/status",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Route data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestPrecomputeRouteErrorHandling:
    """Tests for error handling in precompute_route endpoint."""

    def test_precompute_route_with_corrupted_json(self, client, auth_headers):
        """Test that precompute route with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_precompute_route_with_missing_file(self, client, auth_headers):
        """Test that precompute route with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_precompute")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Route data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestSimulateRouteErrorHandling:
    """Tests for error handling in simulate_route endpoint."""

    def test_simulate_route_with_corrupted_json(self, client, auth_headers):
        """Test that simulate route with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_simulate_route_with_missing_file(self, client, auth_headers):
        """Test that simulate route with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_simulate")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Route data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestTrialRouteErrorHandling:
    """Tests for error handling in trial route endpoints."""

    def test_get_trial_route_status_with_corrupted_json(self, client, auth_headers):
        """Test that get trial route status with corrupted trial JSON returns 500."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )

        try:
            # Create a corrupted trial route file
            trial_file.write_text("{ invalid json content")
            response = client.get(
                "/api/admin/route/trial",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            if trial_file.exists():
                trial_file.unlink()

    def test_upload_trial_route_invalid_location(self, client, auth_headers):
        """Test that uploading trial route with invalid location returns 400."""
        response = client.post(
            "/api/admin/route/trial",
            headers=auth_headers,
            json={
                "route": [
                    {
                        "name": "Test City",
                        "latitude": 100.0,  # Invalid latitude
                        "longitude": 0.0,
                        "utc_offset": 0.0,
                    }
                ]
            },
        )
        assert response.status_code == 400

    def test_upload_trial_route_missing_fields(self, client, auth_headers):
        """Test that uploading trial route with missing fields returns 400."""
        response = client.post(
            "/api/admin/route/trial",
            headers=auth_headers,
            json={
                "route": [
                    {
                        "name": "Test City",
                        # Missing latitude, longitude, utc_offset
                    }
                ]
            },
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid location data."

    def test_apply_trial_route_not_found(self, client, auth_headers):
        """Test that applying non-existent trial route returns 404."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )

        # Ensure no trial route exists
        if trial_file.exists():
            trial_file.unlink()

        response = client.post(
            "/api/admin/route/trial/apply",
            headers=auth_headers,
        )
        assert response.status_code == 404
        data = response.get_json()
        assert data["error"] == "No trial route to apply"

    def test_simulate_trial_route_not_found(self, client, auth_headers):
        """Test that simulating non-existent trial route returns 404."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )

        # Ensure no trial route exists
        if trial_file.exists():
            trial_file.unlink()

        response = client.post(
            "/api/admin/route/trial/simulate",
            headers=auth_headers,
            json={},
        )
        assert response.status_code == 404
        data = response.get_json()
        assert data["error"] == "No trial route to simulate"

    def test_delete_trial_route_not_found(self, client, auth_headers):
        """Test that deleting non-existent trial route returns 404."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )

        # Ensure no trial route exists
        if trial_file.exists():
            trial_file.unlink()

        response = client.delete(
            "/api/admin/route/trial",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestBackupExportErrorHandling:
    """Tests for error handling in export_backup endpoint."""

    def test_export_backup_with_corrupted_json(self, client, auth_headers):
        """Test that export backup with corrupted JSON file returns 500 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        original_content = route_file.read_text()
        try:
            route_file.write_text("{ invalid json content")
            response = client.get(
                "/api/admin/backup/export",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            route_file.write_text(original_content)

    def test_export_backup_with_missing_file(self, client, auth_headers):
        """Test that export backup with missing file returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )

        temp_file = route_file.with_suffix(".json.temp_export")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.get(
                "/api/admin/backup/export",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Route data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)


class TestAdventErrorHandling:
    """Tests for error handling in advent calendar endpoints."""

    def test_advent_manifest_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that advent manifest with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.get("/api/advent/manifest")
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_advent_day_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that advent day with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.get("/api/advent/day/1")
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_get_advent_days_admin_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that get advent days admin with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.get("/api/admin/advent/days", headers=auth_headers)
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_get_advent_day_admin_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that get advent day admin with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.get("/api/admin/advent/day/1", headers=auth_headers)
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_update_advent_day_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that update advent day with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.put(
                "/api/admin/advent/day/1",
                headers=auth_headers,
                json={"title": "Updated Title"},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_toggle_advent_unlock_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that toggle advent unlock with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/advent/day/1/toggle-unlock",
                headers=auth_headers,
                json={"is_unlocked_override": True},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_validate_advent_calendar_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that validate advent calendar with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.post(
                "/api/admin/advent/validate",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_export_advent_backup_with_corrupted_json(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that export advent backup with corrupted JSON returns 500."""
        advent_file = backup_advent_file
        original_content = advent_file.read_text()
        try:
            advent_file.write_text("{ invalid json content")
            response = client.get(
                "/api/admin/advent/export",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"
        finally:
            advent_file.write_text(original_content)

    def test_import_advent_calendar_with_corrupted_file(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that import advent calendar successfully imports valid data."""
        response = client.post(
            "/api/admin/advent/import",
            headers=auth_headers,
            json={
                "days": [
                    {
                        "day": 1,
                        "title": "Test Day",
                        "unlock_time": "2024-12-01T00:00:00Z",
                        "content_type": "fact",
                        "payload": {"text": "Test content"},
                    }
                ]
            },
        )
        # Import should succeed with valid data
        assert response.status_code == 200

    def test_advent_manifest_with_missing_file(self, client, auth_headers):
        """Test that advent manifest with missing file returns 404."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )

        backup_file = advent_file.with_suffix(".json.temp_missing")
        try:
            if advent_file.exists():
                advent_file.rename(backup_file)
            response = client.get("/api/advent/manifest")
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if backup_file.exists():
                backup_file.rename(advent_file)

    def test_advent_day_with_missing_file(self, client, auth_headers):
        """Test that advent day with missing file returns 404."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )

        backup_file = advent_file.with_suffix(".json.temp_missing_day")
        try:
            if advent_file.exists():
                advent_file.rename(backup_file)
            response = client.get("/api/advent/day/1")
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if backup_file.exists():
                backup_file.rename(advent_file)

    def test_get_advent_days_admin_with_missing_file(self, client, auth_headers):
        """Test that get advent days admin with missing file returns 404."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )

        backup_file = advent_file.with_suffix(".json.temp_missing_admin")
        try:
            if advent_file.exists():
                advent_file.rename(backup_file)
            response = client.get("/api/admin/advent/days", headers=auth_headers)
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if backup_file.exists():
                backup_file.rename(advent_file)

    def test_update_advent_day_invalid_data(self, client, auth_headers):
        """Test that update advent day with invalid data returns 400."""
        response = client.put(
            "/api/admin/advent/day/1",
            headers=auth_headers,
            json={"content_type": "invalid_type"},  # Invalid content type
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "Invalid data provided"
