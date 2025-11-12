# API Documentation

This document describes the Santa Tracker API endpoints and integration options.

## 📡 API Overview

The Santa Tracker provides RESTful API endpoints for accessing Santa's location data, route information, and advent calendar content.

**Base URL:** `http://localhost:5000` (development)

**Response Format:** JSON

**Authentication:** None required for public endpoints, password required for admin endpoints

---

## 🎅 Santa Tracking API

### GET /api/santa/location

Get Santa's current location.

**Response: 200 OK**
```json
{
  "current_location": {
    "name": "New York City",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "country": "United States",
    "arrival_time": "2024-12-24T23:30:00Z",
    "departure_time": "2024-12-24T23:45:00Z"
  },
  "next_location": {
    "name": "London",
    "latitude": 51.5074,
    "longitude": -0.1278,
    "country": "United Kingdom",
    "estimated_arrival": "2024-12-25T00:15:00Z"
  },
  "status": "delivering",
  "presents_delivered": 1500000,
  "distance_traveled_km": 42000
}
```

---

### GET /api/santa/route

Get Santa's complete route.

**Query Parameters:**
- `limit` (optional): Maximum number of locations to return (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response: 200 OK**
```json
{
  "total_locations": 250,
  "limit": 100,
  "offset": 0,
  "route": [
    {
      "sequence": 1,
      "name": "Wellington",
      "latitude": -41.2865,
      "longitude": 174.7762,
      "country": "New Zealand",
      "utc_offset": 13,
      "arrival_time": "2024-12-24T11:00:00Z",
      "departure_time": "2024-12-24T11:15:00Z",
      "priority": 1
    },
    {
      "sequence": 2,
      "name": "Sydney",
      "latitude": -33.8688,
      "longitude": 151.2093,
      "country": "Australia",
      "utc_offset": 11,
      "arrival_time": "2024-12-24T13:00:00Z",
      "departure_time": "2024-12-24T13:20:00Z",
      "priority": 1
    }
  ]
}
```

---

### GET /api/santa/distance

Calculate distance from Santa to a specific location.

**Query Parameters:**
- `lat` (required): Latitude of your location
- `lon` (required): Longitude of your location

**Example:** `/api/santa/distance?lat=40.7128&lon=-74.0060`

**Response: 200 OK**
```json
{
  "your_location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "santa_location": {
    "name": "Tokyo",
    "latitude": 35.6762,
    "longitude": 139.6503
  },
  "distance_km": 10850.5,
  "distance_miles": 6742.3,
  "estimated_arrival": "2024-12-24T22:30:00Z"
}
```

**Response: 400 Bad Request** (invalid parameters)
```json
{
  "error": "Invalid coordinates",
  "message": "Latitude must be between -90 and 90"
}
```

---

### GET /api/santa/stats

Get overall statistics about Santa's journey.

**Response: 200 OK**
```json
{
  "journey_status": "in_progress",
  "start_time": "2024-12-24T10:00:00Z",
  "current_time": "2024-12-24T15:30:00Z",
  "elapsed_hours": 5.5,
  "total_locations": 250,
  "locations_visited": 42,
  "locations_remaining": 208,
  "presents_delivered": 2500000,
  "total_distance_km": 48000,
  "average_speed_kmh": 8727,
  "progress_percentage": 16.8
}
```

---

## 🎄 Advent Calendar API

### GET /api/advent/manifest

Get the complete Advent calendar manifest with unlock status.

**Response: 200 OK**
```json
{
  "total_days": 24,
  "unlocked_days": 5,
  "days": [
    {
      "day": 1,
      "title": "Welcome to the Advent Calendar!",
      "unlock_time": "2024-12-01T00:00:00Z",
      "content_type": "fact",
      "is_unlocked": true
    },
    {
      "day": 2,
      "title": "Reindeer Facts",
      "unlock_time": "2024-12-02T00:00:00Z",
      "content_type": "fact",
      "is_unlocked": false
    }
  ]
}
```

**Note:** Payload data is NOT included in manifest to prevent spoilers.

---

### GET /api/advent/day/:id

Get content for a specific day if unlocked.

**Parameters:**
- `id` (path): Day number (1-24)

**Example:** `/api/advent/day/1`

**Response: 200 OK** (if unlocked)
```json
{
  "day": 1,
  "title": "Welcome to the Advent Calendar!",
  "unlock_time": "2024-12-01T00:00:00Z",
  "content_type": "fact",
  "is_unlocked": true,
  "payload": {
    "text": "Did you know? Santa's workshop is located at the North Pole!",
    "image_url": "/static/images/advent/day1.jpg"
  }
}
```

**Response: 403 Forbidden** (if locked)
```json
{
  "error": "Day is locked",
  "day": 2,
  "title": "Reindeer Facts",
  "unlock_time": "2024-12-02T00:00:00Z",
  "time_until_unlock": "PT12H30M15S"
}
```

**Response: 404 Not Found** (invalid day)
```json
{
  "error": "Day not found",
  "message": "Day must be between 1 and 24"
}
```

For detailed Advent Calendar API documentation, see [ADVENT_CALENDAR_API.md](ADVENT_CALENDAR_API.md).

---

## 🔐 Admin API

### POST /admin/login

Authenticate admin user.

**Request Body:**
```json
{
  "password": "admin-password"
}
```

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Authentication successful",
  "session_token": "bearer-token-here"
}
```

**Response: 401 Unauthorized**
```json
{
  "error": "Invalid password"
}
```

---

### POST /admin/locations

Add a new location to the route.

**Authentication:** Required (Bearer token in Authorization header)

**Request Body:**
```json
{
  "name": "Paris",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "country": "France",
  "utc_offset": 1,
  "population": 2148327,
  "priority": 1,
  "notes": "Eiffel Tower visit"
}
```

**Response: 201 Created**
```json
{
  "success": true,
  "message": "Location added successfully",
  "location": {
    "id": "generated-id",
    "name": "Paris",
    ...
  }
}
```

---

### PUT /admin/locations/:id

Update an existing location.

**Authentication:** Required

**Request Body:**
```json
{
  "priority": 2,
  "notes": "Updated notes"
}
```

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Location updated successfully"
}
```

---

### DELETE /admin/locations/:id

Delete a location from the route.

**Authentication:** Required

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Location deleted successfully"
}
```

---

### POST /admin/route/precompute

Precompute optimal route timing.

**Authentication:** Required

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Route precomputed successfully",
  "locations_processed": 250,
  "processing_time_seconds": 2.5
}
```

---

## 🔌 Integration Examples

### JavaScript/TypeScript

```javascript
// Fetch Santa's location
async function getSantaLocation() {
  try {
    const response = await fetch('/api/santa/location');
    const data = await response.json();
    
    console.log(`Santa is in ${data.current_location.name}`);
    console.log(`Next stop: ${data.next_location.name}`);
  } catch (error) {
    console.error('Error fetching location:', error);
  }
}

// Calculate distance
async function getDistanceFromSanta(lat, lon) {
  const response = await fetch(`/api/santa/distance?lat=${lat}&lon=${lon}`);
  const data = await response.json();
  
  return data.distance_km;
}

// Get advent day content
async function getAdventDay(day) {
  try {
    const response = await fetch(`/api/advent/day/${day}`);
    
    if (response.status === 403) {
      const data = await response.json();
      console.log('Day is locked until:', data.unlock_time);
      return null;
    }
    
    const data = await response.json();
    return data.payload;
  } catch (error) {
    console.error('Error:', error);
  }
}
```

---

### Python

```python
import requests

# Get Santa's location
def get_santa_location():
    response = requests.get('http://localhost:5000/api/santa/location')
    data = response.json()
    
    print(f"Santa is in {data['current_location']['name']}")
    return data

# Calculate distance
def get_distance(lat, lon):
    params = {'lat': lat, 'lon': lon}
    response = requests.get(
        'http://localhost:5000/api/santa/distance',
        params=params
    )
    data = response.json()
    return data['distance_km']

# Admin authentication
def admin_login(password):
    response = requests.post(
        'http://localhost:5000/admin/login',
        json={'password': password}
    )
    return response.json()['session_token']

# Add location (requires auth)
def add_location(token, location_data):
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.post(
        'http://localhost:5000/admin/locations',
        json=location_data,
        headers=headers
    )
    return response.json()
```

---

### cURL

```bash
# Get Santa's location
curl http://localhost:5000/api/santa/location

# Get distance
curl "http://localhost:5000/api/santa/distance?lat=40.7128&lon=-74.0060"

# Get advent day
curl http://localhost:5000/api/advent/day/1

# Admin login
curl -X POST http://localhost:5000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin-password"}'

# Add location (with auth)
curl -X POST http://localhost:5000/admin/locations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"name":"Paris","latitude":48.8566,"longitude":2.3522}'
```

---

## 🔧 Rate Limiting

Currently, the API has no rate limiting. For production deployments, consider implementing rate limiting:

```python
from flask_limiter import Limiter

limiter = Limiter(
    app,
    key_func=lambda: request.remote_addr,
    default_limits=["100 per hour"]
)

@app.route('/api/santa/location')
@limiter.limit("10 per minute")
def get_location():
    # ...
```

---

## 📊 Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Access denied (e.g., locked day) |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal server error |

---

## 🔒 Security Considerations

### CORS
Configure CORS for cross-origin requests:

```python
from flask_cors import CORS

CORS(app, resources={
    r"/api/*": {
        "origins": ["https://yourdomain.com"]
    }
})
```

### API Keys (Optional)
For production, consider requiring API keys:

```python
@app.before_request
def check_api_key():
    if request.path.startswith('/api/'):
        api_key = request.headers.get('X-API-Key')
        if api_key != os.environ.get('API_KEY'):
            return jsonify({'error': 'Invalid API key'}), 401
```

### HTTPS
Always use HTTPS in production to encrypt API traffic.

---

## 📝 Best Practices

1. **Error Handling**: Always handle API errors gracefully
2. **Caching**: Cache responses when appropriate to reduce load
3. **Pagination**: Use pagination for large datasets
4. **Validation**: Validate all input parameters
5. **Documentation**: Keep API documentation up to date
6. **Versioning**: Consider API versioning for breaking changes
7. **Monitoring**: Log API usage and monitor for issues

---

## 🚀 Future API Enhancements

- WebSocket support for real-time updates
- GraphQL endpoint for flexible queries
- API versioning (v1, v2, etc.)
- Rate limiting with quotas
- API key authentication
- Webhook support for events
- Bulk operations for admin endpoints
- Search and filtering for locations
- Historical data endpoints
- Analytics endpoints
