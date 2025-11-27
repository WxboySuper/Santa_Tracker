"""Tests for environment variable loading from .env files."""

import json
import os
from pathlib import Path

import pytest


@pytest.fixture
def clean_admin_password():
    """Fixture to manage ADMIN_PASSWORD environment variable cleanup."""
    original_password = os.environ.get("ADMIN_PASSWORD")
    yield
    # Restore original password after test
    if original_password is not None:
        os.environ["ADMIN_PASSWORD"] = original_password
    elif "ADMIN_PASSWORD" in os.environ:
        del os.environ["ADMIN_PASSWORD"]


class TestDotenvLoading:
    """Test that environment variables are loaded from .env files."""

    def test_dotenv_is_imported_in_app(self):
        """Test that dotenv is imported in the app module.

        This test ensures that the fix for the admin password validation bug
        (loading .env files) is present in the code.
        """
        # Read the source file
        app_file = Path(__file__).parent.parent / "src" / "app.py"
        content = app_file.read_text()

        # Check for dotenv import
        assert (
            "from dotenv import load_dotenv" in content
        ), "app.py must import load_dotenv from dotenv to load .env files"

        # Check that load_dotenv() is called with explicit path
        # Handle both single-line and multi-line formatting
        assert "load_dotenv(" in content and "dotenv_path=" in content, (
            "app.py must call load_dotenv(dotenv_path=...) to load .env files. "
            "This is required for ADMIN_PASSWORD to be loaded from .env"
        )

    def test_login_with_environment_variable(self, clean_admin_password):
        """Test that admin login works with ADMIN_PASSWORD from environment.

        This test verifies the fix for the reported bug where admin password
        was not being validated correctly. The issue was that .env files were
        not being loaded, so ADMIN_PASSWORD environment variable was undefined.
        """
        from src.app import app

        # Set password via environment variable (simulating .env file being loaded)
        test_password = "test_env_password_123"
        os.environ["ADMIN_PASSWORD"] = test_password

        with app.test_client() as client:
            # Test login with correct password
            response = client.post(
                "/api/admin/login",
                data=json.dumps({"password": test_password}),
                content_type="application/json",
            )

            assert response.status_code == 200, (
                f"Login should succeed with correct password. "
                f"Got {response.status_code}: {response.get_json()}"
            )

            data = response.get_json()
            assert "token" in data, "Response should contain authentication token"
            assert len(data["token"]) > 0, "Token should not be empty"

            # Test login with incorrect password
            response2 = client.post(
                "/api/admin/login",
                data=json.dumps({"password": "wrong_password"}),
                content_type="application/json",
            )

            assert (
                response2.status_code == 401
            ), "Login should fail with incorrect password"

    def test_dotenv_loads_before_env_access(self):
        """Test that load_dotenv() is called before accessing environment variables.

        This ensures the fix is correctly positioned in the code.
        """
        app_file = Path(__file__).parent.parent / "src" / "app.py"
        content = app_file.read_text()

        # Find positions in the file (handle multi-line formatting)
        load_dotenv_pos = content.find("load_dotenv(")
        dotenv_path_pos = content.find("dotenv_path=")
        admin_password_pos = content.find('os.environ.get("ADMIN_PASSWORD")')

        assert load_dotenv_pos != -1, "load_dotenv() must be called in app.py"
        assert dotenv_path_pos != -1, "dotenv_path= must be specified in app.py"
        assert (
            admin_password_pos != -1
        ), "os.environ.get('ADMIN_PASSWORD') must be present in app.py"
        assert load_dotenv_pos < admin_password_pos, (
            "load_dotenv() must be called before accessing ADMIN_PASSWORD "
            "to ensure .env file is loaded first"
        )

    def test_dotenv_uses_absolute_path(self):
        """Test that load_dotenv uses an absolute path relative to app.py.

        This ensures the .env file is found regardless of the current working
        directory (e.g., when run via Systemd/Gunicorn from a different directory).
        """
        app_file = Path(__file__).parent.parent / "src" / "app.py"
        content = app_file.read_text()

        # Check for the absolute path calculation pattern
        # Uses double dirname to navigate from src/app.py to project root
        assert (
            "os.path.dirname(os.path.dirname(os.path.abspath(__file__)))" in content
        ), (
            "app.py must navigate to project root using double dirname "
            "to locate .env at root"
        )

        # Check that .env path is constructed from project root
        assert (
            'os.path.join' in content and '".env"' in content
        ), "app.py must construct .env path using os.path.join"

        # Check that load_dotenv is called with dotenv_path (handle multi-line)
        assert "load_dotenv(" in content and "dotenv_path=" in content, (
            "app.py must call load_dotenv with explicit dotenv_path "
            "to ensure .env is found regardless of working directory"
        )
