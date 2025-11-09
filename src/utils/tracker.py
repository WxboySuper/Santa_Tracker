class Tracker:
    def __init__(self):
        self.locations = []
        self.status = "Waiting for Santa's arrival"

    def update_location(self, location):
        self.locations.append(location)
        self.status = f"Santa is currently at {location}"

    def get_status(self):
        return self.status

    def get_locations(self):
        return self.locations

    def clear_locations(self):
        self.locations = []
        self.status = "Waiting for Santa's arrival"
