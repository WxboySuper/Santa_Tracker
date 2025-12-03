from typing import List

from src.utils.locations import Location


class Tracker:
    """Tracks Santa's journey through various locations."""

    def __init__(self) -> None:
        self._locations: List[Location] = []
        self._status: str = "Waiting for Santa's arrival"

    def update_location(self, location: Location) -> None:
        """
        Update Santa's current location.

        Args:
            location: A Location object representing Santa's new location.
        """
        if not isinstance(location, Location):
            raise TypeError(
                f"location must be a Location object, got {type(location).__name__}"
            )
        self._locations.append(location)
        self._status = f"Santa is currently at {location.name}"

    def get_status(self) -> str:
        """
        Get the current status of Santa's journey.

        Returns:
            A string describing Santa's current status.
        """
        return self._status

    def get_locations(self) -> List[Location]:
        """
        Get a copy of the list of visited locations.

        Returns:
            A copy of the list of Location objects representing visited locations.
        """
        return self._locations.copy()

    def clear_locations(self) -> None:
        """Clear all visited locations and reset the status."""
        self._locations = []
        self._status = "Waiting for Santa's arrival"

    @property
    def locations(self) -> List[Location]:
        """Get a copy of the list of visited locations (property accessor)."""
        return self._locations.copy()

    @property
    def status(self) -> str:
        """Get the current status (property accessor)."""
        return self._status
