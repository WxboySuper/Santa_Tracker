from flask import Flask, render_template, jsonify
from utils.route_tracker import get_current_position, load_route, get_santa_status
from datetime import datetime

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

@app.route('/api/departure-time')
def get_departure_time():
    route = load_route()
    if route and len(route) > 0:
        return jsonify({
            'departure_time': route[0]['departure_time']
        })
    return jsonify({'error': 'Could not determine departure time'})

@app.route('/api/santa-status')
def get_status():
    route = load_route()
    status, location = get_santa_status(route)
    return jsonify({
        'status': status,
        'location': location
    })

@app.route('/')
def index():
    return render_template('index.html', year=datetime.now().year)

if __name__ == "__main__":
    app.run(port=5000)