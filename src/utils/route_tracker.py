import json
import folium
from datetime import datetime
import time
from math import radians, sin, cos, sqrt, atan2
import webbrowser
from dateutil import parser
import pytz

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371  # Earth's radius in km
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

def load_route():
    with open('src/static/data/santa_route.json', 'r') as f:
        return json.load(f)['route']

def get_santa_status(route):
    now = datetime.now(pytz.UTC)
    north_pole_departure = parser.parse(route[0]['departure_time']).replace(tzinfo=pytz.UTC)
    
    if now < north_pole_departure:
        return "pre-departure", route[0]
        
    for i in range(len(route)-1):
        current_stop = parser.parse(route[i]['departure_time']).replace(tzinfo=pytz.UTC)
        next_arrival = parser.parse(route[i+1]['arrival_time']).replace(tzinfo=pytz.UTC)
        next_departure = parser.parse(route[i+1]['departure_time']).replace(tzinfo=pytz.UTC)
        
        if current_stop <= now <= next_arrival:
            return "in-transit", route[i+1]
        elif next_arrival <= now <= next_departure:
            return "at-location", route[i+1]
            
    return "journey-complete", None

def get_current_position(route):
    now = datetime.now(pytz.UTC)
    
    # Pre-departure check
    north_pole_departure = parser.parse(route[0]['departure_time']).replace(tzinfo=pytz.UTC)
    if now < north_pole_departure:
        return route[0]['latitude'], route[0]['longitude'], 0
    
    # Check each route segment
    for i in range(len(route)-1):
        current_departure = parser.parse(route[i]['departure_time']).replace(tzinfo=pytz.UTC)
        next_arrival = parser.parse(route[i+1]['arrival_time']).replace(tzinfo=pytz.UTC)
        next_departure = parser.parse(route[i+1]['departure_time']).replace(tzinfo=pytz.UTC)
        
        # In transit between locations
        if current_departure <= now <= next_arrival:
            total_time = (next_arrival - current_departure).total_seconds()
            elapsed_time = (now - current_departure).total_seconds()
            factor = elapsed_time / total_time
            
            lat1, lon1 = route[i]['latitude'], route[i]['longitude']
            lat2, lon2 = route[i+1]['latitude'], route[i+1]['longitude']
            current_lat = lat1 + (lat2 - lat1) * factor
            current_lon = lon1 + (lon2 - lon1) * factor
            
            return current_lat, current_lon, i
        
        # At a location
        elif next_arrival <= now <= next_departure:
            return route[i+1]['latitude'], route[i+1]['longitude'], i + 1
    
    # Journey complete
    last_stop = route[-1]
    return last_stop['latitude'], last_stop['longitude'], len(route) - 1

if __name__ == "__main__":
    update_map()
    webbrowser.open('santa_tracker.html')