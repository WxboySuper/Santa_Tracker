"""Tests for logging configuration and print statement detection."""

import ast
import logging
import os
import unittest
from unittest.mock import patch

from src.logging_config import configure_logging, get_log_level, get_logger


class TestLoggingConfig(unittest.TestCase):
    """Test cases for the logging configuration module."""

    def setUp(self):
        """Clean up environment variables before each test."""
        # Store original env vars
        self.original_log_level = os.environ.get("LOG_LEVEL")
        self.original_json_logs = os.environ.get("JSON_LOGS")

        # Clear env vars
        if "LOG_LEVEL" in os.environ:
            del os.environ["LOG_LEVEL"]
        if "JSON_LOGS" in os.environ:
            del os.environ["JSON_LOGS"]

    def tearDown(self):
        """Restore environment variables after each test."""
        if self.original_log_level is not None:
            os.environ["LOG_LEVEL"] = self.original_log_level
        elif "LOG_LEVEL" in os.environ:
            del os.environ["LOG_LEVEL"]

        if self.original_json_logs is not None:
            os.environ["JSON_LOGS"] = self.original_json_logs
        elif "JSON_LOGS" in os.environ:
            del os.environ["JSON_LOGS"]

    def test_get_log_level_default(self):
        """Test that default log level is INFO."""
        level = get_log_level()
        self.assertEqual(level, logging.INFO)

    def test_get_log_level_debug(self):
        """Test LOG_LEVEL=DEBUG returns correct level."""
        os.environ["LOG_LEVEL"] = "DEBUG"
        level = get_log_level()
        self.assertEqual(level, logging.DEBUG)

    def test_get_log_level_case_insensitive(self):
        """Test LOG_LEVEL is case-insensitive."""
        os.environ["LOG_LEVEL"] = "debug"
        level = get_log_level()
        self.assertEqual(level, logging.DEBUG)

        os.environ["LOG_LEVEL"] = "Warning"
        level = get_log_level()
        self.assertEqual(level, logging.WARNING)

    def test_get_log_level_warn_alias(self):
        """Test WARN is an alias for WARNING."""
        os.environ["LOG_LEVEL"] = "WARN"
        level = get_log_level()
        self.assertEqual(level, logging.WARNING)

    def test_get_log_level_invalid_defaults_to_info(self):
        """Test invalid LOG_LEVEL defaults to INFO."""
        os.environ["LOG_LEVEL"] = "INVALID"
        level = get_log_level()
        self.assertEqual(level, logging.INFO)

    def test_get_logger_returns_logger(self):
        """Test get_logger returns a Logger instance."""
        logger = get_logger("test_module")
        self.assertIsInstance(logger, logging.Logger)
        self.assertEqual(logger.name, "test_module")

    def test_configure_logging_sets_level(self):
        """Test configure_logging sets the correct log level."""
        os.environ["LOG_LEVEL"] = "DEBUG"
        configure_logging()

        root_logger = logging.getLogger()
        self.assertEqual(root_logger.level, logging.DEBUG)

    def test_configure_logging_with_explicit_level(self):
        """Test configure_logging with explicit level parameter."""
        configure_logging(level=logging.ERROR)

        root_logger = logging.getLogger()
        self.assertEqual(root_logger.level, logging.ERROR)

    def test_configure_logging_json_format_via_env(self):
        """Test JSON_LOGS environment variable enables JSON format."""
        os.environ["JSON_LOGS"] = "true"
        configure_logging()

        root_logger = logging.getLogger()
        # We can verify the handler format contains JSON-like structure
        for handler in root_logger.handlers:
            if isinstance(handler, logging.StreamHandler):
                format_str = handler.formatter._fmt
                self.assertIn("timestamp", format_str)
                self.assertIn("level", format_str)
                break

    def test_configure_logging_json_format_explicit(self):
        """Test configure_logging with explicit json_format parameter."""
        configure_logging(json_format=True)

        root_logger = logging.getLogger()
        for handler in root_logger.handlers:
            if isinstance(handler, logging.StreamHandler):
                format_str = handler.formatter._fmt
                self.assertIn("timestamp", format_str)
                break


class TestNoPrintInProductionModules(unittest.TestCase):
    """Test to ensure no print() statements in production src/ modules."""

    def test_no_print_in_src_utils_locations(self):
        """Test that src/utils/locations.py has no print() calls."""
        self._assert_no_print_in_file("src/utils/locations.py")

    def test_no_print_in_src_utils_tracker(self):
        """Test that src/utils/tracker.py has no print() calls."""
        self._assert_no_print_in_file("src/utils/tracker.py")

    def test_no_print_in_src_utils_advent(self):
        """Test that src/utils/advent.py has no print() calls."""
        self._assert_no_print_in_file("src/utils/advent.py")

    def test_no_print_in_src_app(self):
        """Test that src/app.py has no print() calls."""
        self._assert_no_print_in_file("src/app.py")

    def test_no_print_in_src_logging_config(self):
        """Test that src/logging_config.py has no print() calls."""
        self._assert_no_print_in_file("src/logging_config.py")

    def _assert_no_print_in_file(self, filepath: str):
        """
        Assert that a Python file contains no print() function calls.

        Args:
            filepath: Path to the Python file relative to project root.
        """
        # Get the project root directory
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(project_root, filepath)

        if not os.path.exists(full_path):
            self.skipTest(f"File {filepath} does not exist")

        with open(full_path, "r", encoding="utf-8") as f:
            source_code = f.read()

        try:
            tree = ast.parse(source_code)
        except SyntaxError:
            self.fail(f"Syntax error in {filepath}")

        print_calls = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                # Check for print() call
                if isinstance(node.func, ast.Name) and node.func.id == "print":
                    print_calls.append(node.lineno)

        if print_calls:
            lines = ", ".join(str(line) for line in print_calls)
            self.fail(
                f"Found print() statements in {filepath} at line(s): {lines}. "
                "Use logging instead."
            )


class TestLocationsLogging(unittest.TestCase):
    """Test logging behavior in locations module."""

    def test_update_santa_location_logs_message(self):
        """Test that update_santa_location uses logging instead of print."""
        from src.utils.locations import Location, update_santa_location

        location = Location(
            name="Test City",
            latitude=40.0,
            longitude=-74.0,
            utc_offset=-5.0,
        )

        # Capture log output
        with patch("src.utils.locations.logger") as mock_logger:
            update_santa_location(location)
            mock_logger.info.assert_called_once()
            call_args = mock_logger.info.call_args
            self.assertIn("Test City", str(call_args))


if __name__ == "__main__":
    unittest.main()
