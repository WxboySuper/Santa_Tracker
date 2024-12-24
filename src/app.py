from flask import Flask, render_template, jsonify
from utils.route_tracker import get_current_position, load_route
import datetime

app = Flask(__name__)

@app.route('/api/santa-location')
def get_santa_location():
    route = load_route()
    current_lat, current_lon, current_index = get_current_position(route)
    
    if current_index >= 0:
        current_stop = route[current_index]
        next_stop = route[current_index + 1] if current_index + 1 < len(route) else None
        
        return jsonify({
            'latitude': current_lat,
            'longitude': current_lon,
            'current_stop': current_stop,
            'next_stop': next_stop
        })
        
    return jsonify({'error': 'Could not determine Santa\'s location'})

@app.route('/')
def index():
    return render_template('base.html', year=datetime.now().year)