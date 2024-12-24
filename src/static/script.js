// filepath: /static/script.js
// Wait for the DOM to be fully loaded

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    const map = L.map('map').setView([90, 0], 3);
    
    // Add map tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Event System implementation
    const EventSystem = (function() {
        const events = {};
        return {
            subscribe(event, callback) {
                if (!events[event]) events[event] = [];
                events[event].push(callback);
            },
            emit(event, data) {
                if (events[event]) {
                    events[event].forEach(callback => callback(data));
                }
            }
        };
    })();

    const NORTH_POLE = {
        name: "North Pole",
        coordinates: [90.0, 135.0]
    };

    // Create Santa's marker
    const santaMarker = L.marker(NORTH_POLE.coordinates, {
        icon: L.icon({
            iconUrl: 'src/static/images/santa-icon.png',
            iconSize: [38, 38]
        })
    }).addTo(map);

    function formatTimeComponent(value) {
        return value.toString().padStart(2, '0');
    }

    function calculateTimeComponents(diff) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
    }

    function updateLocationCountdown() {
        const locationCountdownElement = document.getElementById('location-countdown');
        if (!locationCountdownElement) {
            console.error('Location countdown element not found');
            return;
        }
    
        const now = new Date();
        const northPoleDeparture = new Date('2024-12-24T09:45:00Z');
        const diff = northPoleDeparture - now;
    
        if (diff > 0) {
            const { hours, minutes, seconds } = calculateTimeComponents(diff);
            locationCountdownElement.textContent = 
                `Time until departure: ${formatTimeComponent(hours)}:${formatTimeComponent(minutes)}:${formatTimeComponent(seconds)}`;
        } else {
            locationCountdownElement.textContent = 'Santa has departed!';
            // Start tracking next location after departure
            updateNextLocationCountdown();
        }
    }

    function updateNextLocationCountdown() {
        fetch('/api/santa-location')
            .then(response => response.json())
            .then(data => {
                if (data.current_stop) {
                    const now = new Date();
                    const departureTime = new Date(data.current_stop.departure_time);
                    const diff = departureTime - now;

                    const locationCountdownElement = document.getElementById('location-countdown');
                    if (diff > 0) {
                        const { hours, minutes, seconds } = calculateTimeComponents(diff);
                        locationCountdownElement.textContent = 
                            `Time until next departure: ${formatTimeComponent(hours)}:${formatTimeComponent(minutes)}:${formatTimeComponent(seconds)}`;
                    } else {
                        locationCountdownElement.textContent = 'Departing...';
                    }
                }
            })
            .catch(error => console.error('Error fetching departure time:', error));
    }

    function updateSantaLocation() {
        fetch('/api/santa-location')
            .then(response => response.json())
            .then(data => {
                if (data.latitude && data.longitude) {
                    EventSystem.emit('santaMove', [data.latitude, data.longitude]);
                    
                    document.getElementById('current-location').textContent = 
                        `Current Location: ${data.current_stop.location}`;
                    document.getElementById('next-stop').textContent = 
                        data.next_stop ? `Next Stop: ${data.next_stop.location}` : 'Journey Complete!';
                }
            })
            .catch(error => console.error('Error fetching Santa\'s location:', error));
    }

    // Single EventSystem subscription
    EventSystem.subscribe('santaMove', (position) => {
        santaMarker.setLatLng(position);
        map.panTo(position);
    });

    // Initial setup
    map.setView(NORTH_POLE.coordinates, 3);
    document.getElementById('current-location').textContent = `Current Location: ${NORTH_POLE.name}`;
    document.getElementById('next-stop').textContent = 'Next Stop: Preparing for Christmas Eve!';

    // Initialize functionality
    updateSantaLocation();
    updateLocationCountdown();

    // Set intervals - remove duplicates
    const MINUTE = 60000;
    const SECOND = 1000;
    
    setInterval(updateSantaLocation, MINUTE);
    setInterval(updateLocationCountdown, SECOND);
});
