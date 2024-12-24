import json
from src.utils.route_tracker import load_route, get_santa_status, get_current_position

def generate_static_data():
    route = load_route()
    initial_status = get_santa_status(route)
    initial_position = get_current_position(route)
    
    static_data = {
        "initial_status": initial_status[0],
        "current_stop": initial_status[1],
        "initial_position": {
            "latitude": initial_position[0],
            "longitude": initial_position[1],
            "route_index": initial_position[2]
        },
        "route": route
    }
    
    with open('src/static/data/static_data.json', 'w') as f:
        json.dump(static_data, f)