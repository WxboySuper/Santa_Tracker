"""
Centralized logging configuration for the Santa Tracker application.

This module provides consistent logging configuration across all modules,
with support for environment-driven log level configuration and optional
JSON/structured formatting for production use.
"""

import logging
import os
import sys
from typing import Optional


def get_log_level() -> int:
    """
    Get the logging level from the LOG_LEVEL environment variable.

    Supported values: DEBUG, INFO, WARNING, ERROR, CRITICAL (case-insensitive)

    Returns:
        int: The logging level constant (e.g., logging.INFO)
    """
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "WARN": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }
    return level_map.get(level_name, logging.INFO)


def configure_logging(
    level: Optional[int] = None,
    json_format: bool = False,
) -> None:
    """
    Configure the root logger with consistent formatting.

    Args:
        level: Override log level. If None, uses LOG_LEVEL env var or INFO.
        json_format: If True, use JSON structured format for log aggregators.
    """
    if level is None:
        level = get_log_level()

    # Check for JSON_LOGS environment variable if json_format not explicitly set
    if not json_format:
        json_format = os.environ.get("JSON_LOGS", "").lower() in ("true", "1", "yes")

    if json_format:
        # Structured JSON format for production/log aggregators
        log_format = (
            '{"timestamp": "%(asctime)s", "name": "%(name)s", '
            '"level": "%(levelname)s", "message": "%(message)s"}'
        )
    else:
        # Human-readable format for development
        log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Configure root logger
    logging.basicConfig(
        level=level,
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,  # Override any existing configuration
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.

    This is a convenience function that returns a logger configured
    according to the centralized logging settings. It's equivalent to
    logging.getLogger(name) but ensures consistent usage across modules.

    Args:
        name: The logger name, typically __name__ of the calling module.

    Returns:
        logging.Logger: A configured logger instance.
    """
    return logging.getLogger(name)
