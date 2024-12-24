from datetime import datetime
import json
import pytz
from utils.route_tracker import get_santa_status, get_current_position

def generate_static_data():
    with open('src/static/data/santa_route.json', 'r') as f:
        route = json.load(f)['route']
    
    status, location = get_santa_status(route)
    lat, lon, idx = get_current_position(route)
    
    static_data = {
        "status": status,
        "location": location,
        "position": {
            "latitude": lat,
            "longitude": lon,
            "current_index": idx
        },
        "route": route
    }
    
    with open('_site/static/data/santa_data.json', 'w') as f:
        json.dump(static_data, f)

if __name__ == "__main__":
    generate_static_data()