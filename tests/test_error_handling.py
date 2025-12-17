"""Tests for specific exception handling in API endpoints."""

import os
import shutil
from pathlib import Path
from unittest.mock import patch

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


class TestOSErrorHandling:
    """Tests for OSError handling in API endpoints using mocking."""

    def test_add_location_oserror(self, client, auth_headers):
        """Test that add location OSError returns 500 error."""
        with patch(
            "src.app.save_santa_route_to_json", side_effect=OSError("Disk full")
        ):
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

    def test_update_location_oserror(self, client, auth_headers):
        """Test that update location OSError returns 500 error."""
        with patch(
            "src.app.save_santa_route_to_json", side_effect=OSError("Disk full")
        ):
            response = client.put(
                "/api/admin/locations/0",
                headers=auth_headers,
                json={"name": "Updated City"},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_delete_location_oserror(self, client, auth_headers):
        """Test that delete location OSError returns 500 error."""
        with patch(
            "src.app.save_santa_route_to_json", side_effect=OSError("Disk full")
        ):
            response = client.delete(
                "/api/admin/locations/0",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_import_locations_oserror(self, client, auth_headers):
        """Test that import locations OSError returns 500 error."""
        with patch(
            "src.app.save_santa_route_to_json", side_effect=OSError("Disk full")
        ):
            response = client.post(
                "/api/admin/locations/import",
                headers=auth_headers,
                json={
                    "mode": "replace",
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

    def test_get_route_status_oserror(self, client, auth_headers):
        """Test that get route status OSError returns 500 error."""
        with patch(
            "src.app.load_santa_route_from_json",
            side_effect=OSError("Permission denied"),
        ):
            response = client.get(
                "/api/admin/route/status",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_upload_trial_route_oserror(self, client, auth_headers):
        """Test that upload trial route OSError returns 500 error."""
        with patch(
            "src.app.save_trial_route_to_json", side_effect=OSError("Disk full")
        ):
            response = client.post(
                "/api/admin/route/trial",
                headers=auth_headers,
                json={
                    "route": [
                        {
                            "name": "Test City",
                            "latitude": 0.0,
                            "longitude": 0.0,
                            "utc_offset": 0.0,
                        }
                    ]
                },
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_delete_trial_route_oserror(self, client, auth_headers):
        """Test that delete trial route OSError returns 500 error."""
        # First create a trial route, then mock the deletion to fail
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )
        try:
            # Create a trial route
            trial_file.write_text('{"route": []}')
            with patch(
                "src.app.delete_trial_route",
                side_effect=OSError("Permission denied"),
            ):
                response = client.delete(
                    "/api/admin/route/trial",
                    headers=auth_headers,
                )
                assert response.status_code == 500
                data = response.get_json()
                assert data["error"] == "Internal server error"
        finally:
            if trial_file.exists():
                trial_file.unlink()

    def test_apply_trial_route_oserror(self, client, auth_headers):
        """Test that apply trial route OSError returns 500 error."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )
        try:
            # Create a valid trial route
            trial_file.write_text(
                '{"route": [{"name": "Test", "latitude": 0.0, '
                '"longitude": 0.0, "utc_offset": 0.0}]}'
            )
            with patch(
                "src.app.save_santa_route_to_json", side_effect=OSError("Disk full")
            ):
                response = client.post(
                    "/api/admin/route/trial/apply",
                    headers=auth_headers,
                )
                assert response.status_code == 500
                data = response.get_json()
                assert data["error"] == "Internal server error"
        finally:
            if trial_file.exists():
                trial_file.unlink()

    def test_update_advent_day_oserror(self, client, auth_headers, backup_advent_file):
        """Test that update advent day OSError returns 500 error."""
        with patch("src.app.save_advent_calendar", side_effect=OSError("Disk full")):
            response = client.put(
                "/api/admin/advent/day/1",
                headers=auth_headers,
                json={"title": "Updated Title"},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_toggle_advent_unlock_oserror(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that toggle advent unlock OSError returns 500 error."""
        with patch("src.app.save_advent_calendar", side_effect=OSError("Disk full")):
            response = client.post(
                "/api/admin/advent/day/1/toggle-unlock",
                headers=auth_headers,
                json={"is_unlocked_override": True},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_import_advent_calendar_oserror(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that import advent calendar OSError returns 500 error."""
        with patch("src.app.save_advent_calendar", side_effect=OSError("Disk full")):
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
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"


class TestValueErrorHandling:
    """Tests for ValueError/KeyError handling in API endpoints using mocking."""

    def test_validate_locations_value_error(self, client, auth_headers):
        """Test that validate locations ValueError returns 500 error."""
        with patch(
            "src.app.validate_locations", side_effect=ValueError("Invalid data")
        ):
            response = client.post(
                "/api/admin/locations/validate",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_precompute_route_value_error(self, client, auth_headers):
        """Test that precompute route ValueError returns 500 error."""
        with patch(
            "src.app.load_santa_route_from_json",
            side_effect=ValueError("Invalid route data"),
        ):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_simulate_route_value_error(self, client, auth_headers):
        """Test that simulate route ValueError returns 500 error."""
        with patch(
            "src.app.load_santa_route_from_json",
            side_effect=ValueError("Invalid route data"),
        ):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_simulate_trial_route_value_error(self, client, auth_headers):
        """Test that simulate trial route ValueError returns 500 error."""
        trial_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "trial_route.json"
        )
        try:
            # Create a valid trial route
            trial_file.write_text(
                '{"route": [{"name": "Test", "latitude": 0.0, '
                '"longitude": 0.0, "utc_offset": 0.0}]}'
            )
            with patch(
                "src.app.load_trial_route_from_json",
                side_effect=ValueError("Invalid route data"),
            ):
                response = client.post(
                    "/api/admin/route/trial/simulate",
                    headers=auth_headers,
                    json={},
                )
                assert response.status_code == 500
                data = response.get_json()
                assert data["error"] == "Internal server error"
        finally:
            if trial_file.exists():
                trial_file.unlink()

    def test_get_advent_days_admin_value_error(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that get advent days admin ValueError returns 500 error."""
        with patch(
            "src.app.load_advent_calendar", side_effect=ValueError("Invalid data")
        ):
            response = client.get(
                "/api/admin/advent/days",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_get_advent_day_admin_value_error(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that get advent day admin ValueError returns 500 error."""
        with patch(
            "src.app.load_advent_calendar", side_effect=ValueError("Invalid data")
        ):
            response = client.get(
                "/api/admin/advent/day/1",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_validate_advent_calendar_value_error(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that validate advent calendar ValueError returns 500 error."""
        with patch(
            "src.app.validate_advent_calendar", side_effect=ValueError("Invalid data")
        ):
            response = client.post(
                "/api/admin/advent/validate",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_export_advent_backup_value_error(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that export advent backup ValueError returns 500 error."""
        with patch(
            "src.app.load_advent_calendar", side_effect=ValueError("Invalid data")
        ):
            response = client.get(
                "/api/admin/advent/export",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_export_backup_value_error(self, client, auth_headers):
        """Test that export backup ValueError returns 500 error."""
        with patch(
            "src.app.load_santa_route_from_json",
            side_effect=ValueError("Invalid route data"),
        ):
            response = client.get(
                "/api/admin/backup/export",
                headers=auth_headers,
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_advent_manifest_value_error(self, client, backup_advent_file):
        """Test that advent manifest ValueError returns 500 error."""
        with patch("src.app.get_manifest", side_effect=ValueError("Invalid data")):
            response = client.get("/api/advent/manifest")
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_advent_day_value_error(self, client, backup_advent_file):
        """Test that advent day ValueError returns 500 error."""
        with patch("src.app.get_day_content", side_effect=ValueError("Invalid data")):
            response = client.get("/api/advent/day/1")
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"


class TestAdditionalMissingCoverage:
    """Tests for remaining uncovered exception handlers."""

    def test_get_locations_value_error(self, client, auth_headers):
        """Test that get locations ValueError returns 500 error."""
        with patch(
            "src.app.load_santa_route_from_json",
            side_effect=ValueError("Invalid data"),
        ):
            response = client.get("/api/admin/locations", headers=auth_headers)
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Internal server error"

    def test_add_location_file_not_found(self, client, auth_headers):
        """Test that add location FileNotFoundError returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )
        temp_file = route_file.with_suffix(".json.temp_add")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
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
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Location data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)

    def test_update_location_file_not_found(self, client, auth_headers):
        """Test that update location FileNotFoundError returns 404 error."""
        route_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "santa_route.json"
        )
        temp_file = route_file.with_suffix(".json.temp_update")
        try:
            if route_file.exists():
                route_file.rename(temp_file)
            response = client.put(
                "/api/admin/locations/0",
                headers=auth_headers,
                json={"name": "Updated City"},
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Location data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(route_file)

    def test_delete_location_success(self, client, auth_headers):
        """Test that delete location succeeds and returns 200."""
        # First, make sure we have at least one location
        response = client.get("/api/admin/locations", headers=auth_headers)
        if response.status_code == 200:
            data = response.get_json()
            if data.get("locations") and len(data["locations"]) > 0:
                # Delete the first location
                response = client.delete(
                    "/api/admin/locations/0",
                    headers=auth_headers,
                )
                assert response.status_code == 200
                result = response.get_json()
                assert result["message"] == "Location deleted successfully"

    def test_get_advent_day_admin_day_not_found(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that get advent day admin returns 404 for non-existent day."""
        # Mock load_advent_calendar to return a list that doesn't have day 1
        from src.utils.advent import AdventDay

        mock_days = [
            AdventDay(
                day=2,
                title="Day 2",
                unlock_time="2024-12-02T00:00:00Z",
                content_type="fact",
                payload={"text": "Test"},
            )
        ]
        with patch("src.app.load_advent_calendar", return_value=mock_days):
            response = client.get("/api/admin/advent/day/1", headers=auth_headers)
            # Day 1 is in valid range but doesn't exist in the mocked data
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Day not found"

    def test_update_advent_day_day_not_found(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that update advent day returns 404 for non-existent day."""
        from src.utils.advent import AdventDay

        mock_days = [
            AdventDay(
                day=2,
                title="Day 2",
                unlock_time="2024-12-02T00:00:00Z",
                content_type="fact",
                payload={"text": "Test"},
            )
        ]
        with patch("src.app.load_advent_calendar", return_value=mock_days):
            response = client.put(
                "/api/admin/advent/day/1",
                headers=auth_headers,
                json={"title": "Test"},
            )
            # Day 1 is in valid range but doesn't exist in the mocked data
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Day not found"

    def test_toggle_advent_unlock_day_not_found(
        self, client, auth_headers, backup_advent_file
    ):
        """Test that toggle advent unlock returns 404 for non-existent day."""
        from src.utils.advent import AdventDay

        mock_days = [
            AdventDay(
                day=2,
                title="Day 2",
                unlock_time="2024-12-02T00:00:00Z",
                content_type="fact",
                payload={"text": "Test"},
            )
        ]
        with patch("src.app.load_advent_calendar", return_value=mock_days):
            response = client.post(
                "/api/admin/advent/day/1/toggle-unlock",
                headers=auth_headers,
                json={"is_unlocked_override": True},
            )
            # Day 1 is in valid range but doesn't exist in the mocked data
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Day not found"

    def test_toggle_advent_unlock_file_not_found(self, client, auth_headers):
        """Test that toggle advent unlock returns 404 for missing file."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )
        temp_file = advent_file.with_suffix(".json.temp_toggle")
        try:
            if advent_file.exists():
                advent_file.rename(temp_file)
            response = client.post(
                "/api/admin/advent/day/1/toggle-unlock",
                headers=auth_headers,
                json={"is_unlocked_override": True},
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(advent_file)


class TestPageRoutes:
    """Tests for HTML page routes to increase coverage."""

    def test_home_page(self, client):
        """Test home page renders."""
        response = client.get("/")
        assert response.status_code == 200

    def test_tracker_page(self, client):
        """Test tracker page renders."""
        response = client.get("/tracker")
        assert response.status_code == 200

    def test_advent_page(self, client):
        """Test advent page renders."""
        response = client.get("/advent")
        assert response.status_code == 200

    def test_route_simulator_page(self, client):
        """Test route simulator page renders."""
        response = client.get("/admin/route-simulator")
        assert response.status_code == 200

    def test_index_page(self, client):
        """Test index page renders (legacy route)."""
        response = client.get("/index")
        assert response.status_code == 200

    def test_admin_page(self, client):
        """Test admin page renders."""
        response = client.get("/admin")
        assert response.status_code == 200


class TestAdminPasswordNotSet:
    """Tests for scenarios when ADMIN_PASSWORD is not set."""

    def test_login_admin_password_not_set(self, client):
        """Test login when ADMIN_PASSWORD is not set returns 500."""
        # Save and remove ADMIN_PASSWORD
        orig_password = os.environ.get("ADMIN_PASSWORD")
        if "ADMIN_PASSWORD" in os.environ:
            del os.environ["ADMIN_PASSWORD"]

        try:
            response = client.post(
                "/api/admin/login",
                json={"password": "test"},
            )
            assert response.status_code == 500
            data = response.get_json()
            assert data["error"] == "Admin access not configured"
        finally:
            # Restore ADMIN_PASSWORD
            if orig_password:
                os.environ["ADMIN_PASSWORD"] = orig_password


class TestAdventDayLocked:
    """Tests for advent day locked scenarios."""

    def test_advent_day_locked(self, client, backup_advent_file):
        """Test that a locked advent day returns appropriate message."""
        # Mock get_day_content to return a locked day
        with patch(
            "src.app.get_day_content",
            return_value={
                "day": 25,
                "title": "Christmas Day",
                "is_unlocked": False,
                "unlock_time": "2099-12-25T00:00:00Z",
            },
        ):
            response = client.get("/api/advent/day/25")
            assert response.status_code == 403
            data = response.get_json()
            assert data["error"] == "Day is locked"
            assert data["day"] == 25


class TestUpdateLocationNotesFunFacts:
    """Tests for update_location notes/fun_facts handling."""

    def test_update_location_with_notes(self, client, auth_headers):
        """Test update location with notes field."""
        response = client.put(
            "/api/admin/locations/0",
            headers=auth_headers,
            json={"notes": ["Test note 1", "Test note 2"]},
        )
        # Should succeed if location exists
        assert response.status_code in [200, 404]

    def test_update_location_with_fun_facts(self, client, auth_headers):
        """Test update location with fun_facts field (backward compatibility)."""
        response = client.put(
            "/api/admin/locations/0",
            headers=auth_headers,
            json={"fun_facts": ["Fun fact 1", "Fun fact 2"]},
        )
        # Should succeed if location exists
        assert response.status_code in [200, 404]


class TestPrecomputeRouteScenarios:
    """Tests for precompute_route various scenarios."""

    def test_precompute_route_empty_locations(self, client, auth_headers):
        """Test precompute route with empty locations returns 400."""
        with patch("src.app.load_santa_route_from_json", return_value=[]):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 400
            data = response.get_json()
            assert data["error"] == "No locations to validate"

    def test_precompute_route_missing_arrival_time(self, client, auth_headers):
        """Test precompute route with missing arrival_time."""
        from src.utils.locations import Location

        mock_location_1 = Location(
            name="Anchor",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time=None,  # Missing
            departure_time="2024-12-25T01:00:00Z",
        )
        mock_location_2 = Location(
            name="Test",
            latitude=10.0,
            longitude=10.0,
            utc_offset=0.0,
            arrival_time=None,
            departure_time="2024-12-25T01:00:00Z",
        )
        with patch(
            "src.app.load_santa_route_from_json",
            return_value=[mock_location_1, mock_location_2],
        ):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 400
            data = response.get_json()
            assert "invalid_times" in data
            assert len(data["invalid_times"]) == 1
            assert data["invalid_times"][0]["index"] == 1
            assert "arrival_time" in data["invalid_times"][0]["issues"]

    def test_precompute_route_invalid_arrival_time_format(self, client, auth_headers):
        """Test precompute route with invalid arrival_time format."""
        from src.utils.locations import Location

        mock_location_1 = Location(
            name="Anchor",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time="2024-12-25T00:30:00Z",
        )
        mock_location_2 = Location(
            name="Test",
            latitude=10.0,
            longitude=10.0,
            utc_offset=0.0,
            arrival_time="not-a-date",  # Invalid format
            departure_time="2024-12-25T01:00:00Z",
        )
        with patch(
            "src.app.load_santa_route_from_json",
            return_value=[mock_location_1, mock_location_2],
        ):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 400
            data = response.get_json()
            assert "invalid_times" in data
            assert len(data["invalid_times"]) == 1
            assert data["invalid_times"][0]["index"] == 1
            assert (
                data["invalid_times"][0]["issues"]["arrival_time"] == "invalid format"
            )

    def test_precompute_route_missing_departure_time(self, client, auth_headers):
        """Test precompute route with missing departure_time."""
        from src.utils.locations import Location

        mock_location_1 = Location(
            name="Anchor",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time="2024-12-25T00:30:00Z",
        )
        mock_location_2 = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time=None,  # Missing
        )
        with patch(
            "src.app.load_santa_route_from_json",
            return_value=[mock_location_1, mock_location_2],
        ):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 400
            data = response.get_json()
            assert "invalid_times" in data
            assert len(data["invalid_times"]) == 1
            assert data["invalid_times"][0]["index"] == 1
            assert "departure_time" in data["invalid_times"][0]["issues"]

    def test_precompute_route_invalid_departure_time_format(self, client, auth_headers):
        """Test precompute route with invalid departure_time format."""
        from src.utils.locations import Location

        mock_location_1 = Location(
            name="Anchor",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time="2024-12-25T00:30:00Z",
        )
        mock_location_2 = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time="not-a-date",  # Invalid format
        )
        with patch(
            "src.app.load_santa_route_from_json",
            return_value=[mock_location_1, mock_location_2],
        ):
            response = client.post(
                "/api/admin/route/precompute",
                headers=auth_headers,
            )
            assert response.status_code == 400
            data = response.get_json()
            assert "invalid_times" in data
            assert len(data["invalid_times"]) == 1
            assert data["invalid_times"][0]["index"] == 1
            assert (
                data["invalid_times"][0]["issues"]["departure_time"] == "invalid format"
            )


class TestSimulateRouteScenarios:
    """Tests for simulate_route various scenarios."""

    def test_simulate_route_empty_locations(self, client, auth_headers):
        """Test simulate route with empty locations returns 400."""
        with patch("src.app.load_santa_route_from_json", return_value=[]):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 400
            data = response.get_json()
            assert data["error"] == "No locations to simulate"

    def test_simulate_route_with_invalid_location_ids_type(self, client, auth_headers):
        """Test simulate route with invalid location_ids type returns 400."""
        from src.utils.locations import Location

        mock_location = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="2024-12-25T00:00:00Z",
            departure_time="2024-12-25T01:00:00Z",
        )
        with patch("src.app.load_santa_route_from_json", return_value=[mock_location]):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={"location_ids": "not-a-list"},  # Invalid type
            )
            assert response.status_code == 400
            data = response.get_json()
            assert "location_ids must be a list" in data["error"]

    def test_simulate_route_with_location_ids(self, client, auth_headers):
        """Test simulate route with valid location_ids."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test1",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="2024-12-25T00:00:00Z",
                departure_time="2024-12-25T01:00:00Z",
            ),
            Location(
                name="Test2",
                latitude=1.0,
                longitude=1.0,
                utc_offset=1.0,
                arrival_time="2024-12-25T02:00:00Z",
                departure_time="2024-12-25T03:00:00Z",
            ),
        ]
        with patch("src.app.load_santa_route_from_json", return_value=mock_locations):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={"location_ids": [0]},  # Only first location
            )
            assert response.status_code == 200

    def test_simulate_route_no_timing_info(self, client, auth_headers):
        """Test simulate route with locations without timing info."""
        from src.utils.locations import Location

        mock_location = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time=None,
            departure_time=None,
        )
        with patch("src.app.load_santa_route_from_json", return_value=[mock_location]):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["summary"]["start_time"] is None
            assert data["summary"]["end_time"] is None
            assert data["summary"]["total_duration_minutes"] == 0


class TestTrialRouteScenarios:
    """Tests for trial route various scenarios."""

    def test_get_trial_route_status_exists(self, client, auth_headers):
        """Test get trial route status when trial route exists."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
            )
        ]
        with patch("src.app.has_trial_route", return_value=True):
            with patch(
                "src.app.load_trial_route_from_json", return_value=mock_locations
            ):
                response = client.get(
                    "/api/admin/route/trial",
                    headers=auth_headers,
                )
                assert response.status_code == 200
                data = response.get_json()
                assert data["exists"] is True
                assert data["location_count"] == 1

    def test_get_trial_route_status_not_exists(self, client, auth_headers):
        """Test get trial route status when trial route does not exist."""
        with patch("src.app.has_trial_route", return_value=False):
            response = client.get(
                "/api/admin/route/trial",
                headers=auth_headers,
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["exists"] is False
            assert data["location_count"] == 0

    def test_upload_trial_route_success(self, client, auth_headers):
        """Test successful trial route upload."""
        with patch(
            "src.app.validate_locations", return_value={"errors": [], "warnings": []}
        ):
            with patch("src.app.save_trial_route_to_json"):
                response = client.post(
                    "/api/admin/route/trial",
                    headers=auth_headers,
                    json={
                        "route": [
                            {
                                "name": "Test City",
                                "latitude": 0.0,
                                "longitude": 0.0,
                                "utc_offset": 0.0,
                            }
                        ]
                    },
                )
                assert response.status_code == 200
                data = response.get_json()
                assert data["success"] is True

    def test_upload_trial_route_validation_errors(self, client, auth_headers):
        """Test trial route upload with validation errors."""
        with patch(
            "src.app.validate_locations",
            return_value={"errors": ["Test error"], "warnings": []},
        ):
            response = client.post(
                "/api/admin/route/trial",
                headers=auth_headers,
                json={
                    "route": [
                        {
                            "name": "Test City",
                            "latitude": 0.0,
                            "longitude": 0.0,
                            "utc_offset": 0.0,
                        }
                    ]
                },
            )
            assert response.status_code == 400
            data = response.get_json()
            assert data["error"] == "Validation failed"

    def test_delete_trial_route_success(self, client, auth_headers):
        """Test successful trial route deletion."""
        with patch("src.app.delete_trial_route", return_value=True):
            response = client.delete(
                "/api/admin/route/trial",
                headers=auth_headers,
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["success"] is True

    def test_apply_trial_route_success(self, client, auth_headers):
        """Test successful trial route application."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
            )
        ]
        with patch("src.app.has_trial_route", return_value=True):
            with patch(
                "src.app.load_trial_route_from_json", return_value=mock_locations
            ):
                with patch("src.app.save_santa_route_to_json"):
                    response = client.post(
                        "/api/admin/route/trial/apply",
                        headers=auth_headers,
                    )
                    assert response.status_code == 200
                    data = response.get_json()
                    assert data["success"] is True

    def test_apply_trial_route_empty(self, client, auth_headers):
        """Test apply trial route when trial route is empty."""
        with patch("src.app.has_trial_route", return_value=True):
            with patch("src.app.load_trial_route_from_json", return_value=[]):
                response = client.post(
                    "/api/admin/route/trial/apply",
                    headers=auth_headers,
                )
                assert response.status_code == 400
                data = response.get_json()
                assert data["error"] == "Trial route is empty"

    def test_simulate_trial_route_success(self, client, auth_headers):
        """Test successful trial route simulation."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time="2024-12-25T00:00:00Z",
                departure_time="2024-12-25T01:00:00Z",
            )
        ]
        with patch("src.app.has_trial_route", return_value=True):
            with patch(
                "src.app.load_trial_route_from_json", return_value=mock_locations
            ):
                response = client.post(
                    "/api/admin/route/trial/simulate",
                    headers=auth_headers,
                    json={},
                )
                assert response.status_code == 200
                data = response.get_json()
                assert data["is_trial"] is True

    def test_simulate_trial_route_empty(self, client, auth_headers):
        """Test simulate trial route when trial route is empty."""
        with patch("src.app.has_trial_route", return_value=True):
            with patch("src.app.load_trial_route_from_json", return_value=[]):
                response = client.post(
                    "/api/admin/route/trial/simulate",
                    headers=auth_headers,
                    json={},
                )
                assert response.status_code == 400
                data = response.get_json()
                assert data["error"] == "Trial route is empty"

    def test_simulate_trial_route_no_timing(self, client, auth_headers):
        """Test simulate trial route with locations without timing."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
                arrival_time=None,
                departure_time=None,
            )
        ]
        with patch("src.app.has_trial_route", return_value=True):
            with patch(
                "src.app.load_trial_route_from_json", return_value=mock_locations
            ):
                response = client.post(
                    "/api/admin/route/trial/simulate",
                    headers=auth_headers,
                    json={},
                )
                assert response.status_code == 200
                data = response.get_json()
                assert data["summary"]["start_time"] is None
                assert data["summary"]["end_time"] is None

    def test_simulate_trial_route_with_location_ids(self, client, auth_headers):
        """Test simulate trial route with location_ids filter."""
        from src.utils.locations import Location

        mock_locations = [
            Location(
                name="Test1",
                latitude=0.0,
                longitude=0.0,
                utc_offset=0.0,
            ),
            Location(
                name="Test2",
                latitude=1.0,
                longitude=1.0,
                utc_offset=1.0,
            ),
        ]
        with patch("src.app.has_trial_route", return_value=True):
            with patch(
                "src.app.load_trial_route_from_json", return_value=mock_locations
            ):
                response = client.post(
                    "/api/admin/route/trial/simulate",
                    headers=auth_headers,
                    json={"location_ids": [0]},
                )
                assert response.status_code == 200


class TestDurationCalculation:
    """Tests for _calculate_total_duration_minutes edge cases."""

    def test_calculate_duration_empty_times(self, client, auth_headers):
        """Test duration calculation with empty times via simulate route."""
        from src.utils.locations import Location

        mock_location = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time=None,
            departure_time=None,
        )
        with patch("src.app.load_santa_route_from_json", return_value=[mock_location]):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["summary"]["total_duration_minutes"] == 0

    def test_calculate_duration_invalid_format(self, client, auth_headers):
        """Test duration calculation with invalid time format."""
        from src.utils.locations import Location

        mock_location = Location(
            name="Test",
            latitude=0.0,
            longitude=0.0,
            utc_offset=0.0,
            arrival_time="invalid",
            departure_time="invalid",
        )
        with patch("src.app.load_santa_route_from_json", return_value=[mock_location]):
            response = client.post(
                "/api/admin/route/simulate",
                headers=auth_headers,
                json={},
            )
            # Should still return 200 but with 0 duration
            assert response.status_code == 200


class TestImportLocationsScenarios:
    """Tests for import_locations various scenarios."""

    def test_import_locations_all_errors(self, client, auth_headers):
        """Test import locations when all locations have errors."""
        response = client.post(
            "/api/admin/locations/import",
            headers=auth_headers,
            json={
                "mode": "append",
                "locations": [
                    {"name": "Invalid"},  # Missing required fields
                ],
            },
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "No valid locations to import" in data["error"]

    def test_import_locations_parse_error(self, client, auth_headers):
        """Test import locations with parse error (ValueError/TypeError)."""
        with patch(
            "src.app._parse_location_from_data",
            return_value=(None, "Test error"),
        ):
            response = client.post(
                "/api/admin/locations/import",
                headers=auth_headers,
                json={
                    "mode": "append",
                    "locations": [
                        {
                            "name": "Test",
                            "latitude": 0.0,
                            "longitude": 0.0,
                            "utc_offset": 0.0,
                        }
                    ],
                },
            )
            assert response.status_code == 400


class TestGetAdventDayAdminFileNotFound:
    """Tests for get_advent_day_admin FileNotFoundError."""

    def test_get_advent_day_admin_file_not_found(self, client, auth_headers):
        """Test get advent day admin when file is missing."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )
        temp_file = advent_file.with_suffix(".json.temp_admin_day")
        try:
            if advent_file.exists():
                advent_file.rename(temp_file)
            response = client.get(
                "/api/admin/advent/day/1",
                headers=auth_headers,
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(advent_file)


class TestUpdateAdventDayFileNotFound:
    """Tests for update_advent_day FileNotFoundError."""

    def test_update_advent_day_file_not_found(self, client, auth_headers):
        """Test update advent day when file is missing."""
        advent_file = (
            Path(__file__).parent.parent
            / "src"
            / "static"
            / "data"
            / "advent_calendar.json"
        )
        temp_file = advent_file.with_suffix(".json.temp_update_day")
        try:
            if advent_file.exists():
                advent_file.rename(temp_file)
            response = client.put(
                "/api/admin/advent/day/1",
                headers=auth_headers,
                json={"title": "Test"},
            )
            assert response.status_code == 404
            data = response.get_json()
            assert data["error"] == "Advent calendar data not found"
        finally:
            if temp_file.exists():
                temp_file.rename(advent_file)
