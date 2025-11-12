"""Tests for Advent Calendar Admin API endpoints."""

import json
import os

import pytest

from src.app import app


@pytest.fixture
def client():
    """Create a test client."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    """Get authentication headers with admin token."""
    # Set admin password for testing
    os.environ["ADMIN_PASSWORD"] = "test-password"
    return {"Authorization": "Bearer test-password"}


class TestAdventAdminAuth:
    """Test authentication for advent admin endpoints."""

    def test_get_advent_days_requires_auth(self, client):
        """Test that getting advent days requires authentication."""
        response = client.get("/api/admin/advent/days")
        assert response.status_code == 401

    def test_get_advent_days_with_invalid_auth(self, client):
        """Test advent days endpoint with invalid auth."""
        # Ensure admin password is set
        os.environ["ADMIN_PASSWORD"] = "correct-password"
        headers = {"Authorization": "Bearer wrong-password"}
        response = client.get("/api/admin/advent/days", headers=headers)
        assert response.status_code == 403

    def test_get_advent_days_with_valid_auth(self, client, auth_headers):
        """Test advent days endpoint with valid auth."""
        response = client.get("/api/admin/advent/days", headers=auth_headers)
        assert response.status_code == 200


class TestGetAdventDays:
    """Test GET /api/admin/advent/days endpoint."""

    def test_get_all_advent_days(self, client, auth_headers):
        """Test getting all advent days."""
        response = client.get("/api/admin/advent/days", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "days" in data
        assert "total_days" in data
        assert data["total_days"] == 24
        assert len(data["days"]) == 24

    def test_advent_days_include_all_fields(self, client, auth_headers):
        """Test that advent days include all required fields."""
        response = client.get("/api/admin/advent/days", headers=auth_headers)
        data = response.get_json()

        first_day = data["days"][0]
        assert "day" in first_day
        assert "title" in first_day
        assert "unlock_time" in first_day
        assert "content_type" in first_day
        assert "payload" in first_day
        assert "is_unlocked_override" in first_day
        assert "is_currently_unlocked" in first_day


class TestGetAdventDay:
    """Test GET /api/admin/advent/day/<day_number> endpoint."""

    def test_get_specific_day(self, client, auth_headers):
        """Test getting a specific advent day."""
        response = client.get("/api/admin/advent/day/1", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert data["day"] == 1
        assert "title" in data
        assert "payload" in data

    def test_get_day_invalid_number_low(self, client, auth_headers):
        """Test getting day with number too low."""
        response = client.get("/api/admin/advent/day/0", headers=auth_headers)
        assert response.status_code == 400

    def test_get_day_invalid_number_high(self, client, auth_headers):
        """Test getting day with number too high."""
        response = client.get("/api/admin/advent/day/25", headers=auth_headers)
        assert response.status_code == 400


class TestUpdateAdventDay:
    """Test PUT /api/admin/advent/day/<day_number> endpoint."""

    @pytest.fixture(autouse=True)
    def backup_calendar(self):
        """Backup and restore calendar data for each test."""
        import shutil

        calendar_path = "src/static/data/advent_calendar.json"
        backup_path = "src/static/data/advent_calendar.json.backup"

        if os.path.exists(calendar_path):
            shutil.copy(calendar_path, backup_path)

        yield

        # Restore original calendar
        if os.path.exists(backup_path):
            shutil.move(backup_path, calendar_path)

    def test_update_day_title(self, client, auth_headers):
        """Test updating a day's title."""
        update_data = {"title": "Updated Title"}

        response = client.put(
            "/api/admin/advent/day/1",
            data=json.dumps(update_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Verify the update
        response = client.get("/api/admin/advent/day/1", headers=auth_headers)
        data = response.get_json()
        assert data["title"] == "Updated Title"

    def test_update_day_invalid_content_type(self, client, auth_headers):
        """Test updating day with invalid content type."""
        update_data = {"content_type": "invalid_type"}

        response = client.put(
            "/api/admin/advent/day/1",
            data=json.dumps(update_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_day_invalid_day_number(self, client, auth_headers):
        """Test updating day with invalid day number."""
        update_data = {"title": "Test"}

        response = client.put(
            "/api/admin/advent/day/30",
            data=json.dumps(update_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_day_no_data(self, client, auth_headers):
        """Test updating day with no data."""
        response = client.put(
            "/api/admin/advent/day/1",
            data="",
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestToggleUnlock:
    """Test POST /api/admin/advent/day/<day_number>/toggle-unlock endpoint."""

    @pytest.fixture(autouse=True)
    def backup_calendar(self):
        """Backup and restore calendar data for each test."""
        import shutil

        calendar_path = "src/static/data/advent_calendar.json"
        backup_path = "src/static/data/advent_calendar.json.backup"

        if os.path.exists(calendar_path):
            shutil.copy(calendar_path, backup_path)

        yield

        # Restore original calendar
        if os.path.exists(backup_path):
            shutil.move(backup_path, calendar_path)

    def test_toggle_unlock_to_true(self, client, auth_headers):
        """Test toggling unlock override to true."""
        toggle_data = {"is_unlocked_override": True}

        response = client.post(
            "/api/admin/advent/day/20/toggle-unlock",
            data=json.dumps(toggle_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["is_unlocked_override"] is True

    def test_toggle_unlock_to_false(self, client, auth_headers):
        """Test toggling unlock override to false."""
        toggle_data = {"is_unlocked_override": False}

        response = client.post(
            "/api/admin/advent/day/20/toggle-unlock",
            data=json.dumps(toggle_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["is_unlocked_override"] is False

    def test_clear_unlock_override(self, client, auth_headers):
        """Test clearing unlock override (set to null)."""
        toggle_data = {"is_unlocked_override": None}

        response = client.post(
            "/api/admin/advent/day/20/toggle-unlock",
            data=json.dumps(toggle_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["is_unlocked_override"] is None

    def test_toggle_unlock_invalid_day(self, client, auth_headers):
        """Test toggle unlock with invalid day number."""
        toggle_data = {"is_unlocked_override": True}

        response = client.post(
            "/api/admin/advent/day/30/toggle-unlock",
            data=json.dumps(toggle_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestValidateAdventCalendar:
    """Test POST /api/admin/advent/validate endpoint."""

    def test_validate_calendar(self, client, auth_headers):
        """Test validating the advent calendar."""
        response = client.post("/api/admin/advent/validate", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "valid" in data
        assert "errors" in data
        assert "warnings" in data
        assert "total_days" in data


class TestExportAdventCalendar:
    """Test GET /api/admin/advent/export endpoint."""

    def test_export_calendar(self, client, auth_headers):
        """Test exporting the advent calendar."""
        response = client.get("/api/admin/advent/export", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert "backup_timestamp" in data
        assert "total_days" in data
        assert "days" in data
        assert len(data["days"]) == 24

    def test_export_contains_all_fields(self, client, auth_headers):
        """Test that export contains all necessary fields."""
        response = client.get("/api/admin/advent/export", headers=auth_headers)
        data = response.get_json()

        first_day = data["days"][0]
        assert "day" in first_day
        assert "title" in first_day
        assert "unlock_time" in first_day
        assert "content_type" in first_day
        assert "payload" in first_day


class TestImportAdventCalendar:
    """Test POST /api/admin/advent/import endpoint."""

    @pytest.fixture(autouse=True)
    def backup_calendar(self):
        """Backup and restore calendar data for each test."""
        # Backup original calendar
        import shutil

        calendar_path = "src/static/data/advent_calendar.json"
        backup_path = "src/static/data/advent_calendar.json.backup"

        if os.path.exists(calendar_path):
            shutil.copy(calendar_path, backup_path)

        yield

        # Restore original calendar
        if os.path.exists(backup_path):
            shutil.move(backup_path, calendar_path)

    def test_import_calendar_with_days_array(self, client, auth_headers):
        """Test importing calendar with days array."""
        # First, export current data to get complete structure
        export_response = client.get("/api/admin/advent/export", headers=auth_headers)
        original_data = export_response.get_json()

        import_data = {"days": original_data["days"][:1]}  # Import just the first day

        response = client.post(
            "/api/admin/advent/import",
            data=json.dumps(import_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert "imported_days" in data

    def test_import_calendar_direct_array(self, client, auth_headers):
        """Test importing calendar as direct array."""
        # First, export current data to get complete structure
        export_response = client.get("/api/admin/advent/export", headers=auth_headers)
        original_data = export_response.get_json()

        import_data = original_data["days"][:1]  # Import just the first day

        response = client.post(
            "/api/admin/advent/import",
            data=json.dumps(import_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

    def test_import_calendar_no_data(self, client, auth_headers):
        """Test importing with no data."""
        response = client.post(
            "/api/admin/advent/import",
            data="",
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_import_calendar_empty_array(self, client, auth_headers):
        """Test importing with empty array."""
        import_data = {"days": []}

        response = client.post(
            "/api/admin/advent/import",
            data=json.dumps(import_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_import_calendar_invalid_day_data(self, client, auth_headers):
        """Test importing with invalid day data."""
        import_data = {
            "days": [
                {
                    "day": 1,
                    "title": "Test Day",
                    # Missing required fields
                }
            ]
        }

        response = client.post(
            "/api/admin/advent/import",
            data=json.dumps(import_data),
            content_type="application/json",
            headers=auth_headers,
        )
        assert response.status_code == 400

        data = response.get_json()
        assert "details" in data
