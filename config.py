import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "your_default_secret_key"
    DEBUG = os.environ.get("DEBUG", "False") == "True"
    API_KEY = os.environ.get("API_KEY") or "your_api_key"
    DATABASE_URI = os.environ.get("DATABASE_URI") or "sqlite:///santa_tracker.db"
    # Advent calendar feature flag - controls visibility of advent calendar feature
    # Set to "True" to enable the advent calendar UI and API endpoints
    ADVENT_ENABLED = os.environ.get("ADVENT_ENABLED", "False") == "True"
