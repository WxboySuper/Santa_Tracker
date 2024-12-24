import json
import folium
from datetime import datetime
import time
from math import radians, sin, cos, sqrt, atan2
import webbrowser
from dateutil import parser

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

def get_current_position(route):
    now = datetime.utcnow()
    
    # Find current route segment
    for i in range(len(route)-1):
        current_stop = parser.parse(route[i]['departure_time'])
        next_stop = parser.parse(route[i+1]['arrival_time'])
        
        if current_stop <= now <= next_stop:
            # Calculate interpolation factor
            total_time = (next_stop - current_stop).total_seconds()
            elapsed_time = (now - current_stop).total_seconds()
            factor = elapsed_time / total_time
            
            # Interpolate position
            lat1, lon1 = route[i]['latitude'], route[i]['longitude']
            lat2, lon2 = route[i+1]['latitude'], route[i+1]['longitude']
            current_lat = lat1 + (lat2 - lat1) * factor
            current_lon = lon1 + (lon2 - lon1) * factor
            
            return current_lat, current_lon, i
    
    return None, None, -1

def create_map(route):
    # Initialize map centered on North Pole
    m = folium.Map(location=[90, 0], zoom_start=2)
    
    # Get current position
    current_lat, current_lon, current_index = get_current_position(route)
    
    if current_index >= 0:
        # Plot completed route
        coordinates = []
        for i in range(current_index + 1):
            coordinates.append([route[i]['latitude'], route[i]['longitude']])
            
            # Add marker for each visited stop
            folium.Marker(
                [route[i]['latitude'], route[i]['longitude']],
                popup=f"{route[i]['location']}<br>Arrived: {route[i]['arrival_time']}<br>Departed: {route[i]['departure_time']}"
            ).add_to(m)
        
        # Plot completed route line
        folium.PolyLine(
            coordinates,
            weight=2,
            color='red',
            opacity=0.8
        ).add_to(m)
        
        # Add Santa's current position
        if current_lat and current_lon:
            folium.Marker(
                [current_lat, current_lon],
                popup='Santa is here!',
                icon=folium.Icon(color='red', icon='info-sign')
            ).add_to(m)
    
    return m

def update_map():
    while True:
        route = load_route()
        m = create_map(route)
        m.save('santa_tracker.html')
        time.sleep(60)  # Update every minute

if __name__ == "__main__":
    update_map()
    webbrowser.open('santa_tracker.html')