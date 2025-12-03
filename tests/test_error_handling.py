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
