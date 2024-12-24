// filepath: /static/script.js
// Wait for the DOM to be fully loaded

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    // skipcq: JS-0125
    const map = L.map('map').setView([90, 0], 3);
    
    // Add map tiles
    // skipcq: JS-0125
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Event System for handling updates
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

    // Create Santa's marker at North Pole
    // skipcq: JS-0125
    const santaMarker = L.marker(NORTH_POLE.coordinates, {
        // skipcq: JS-0125
        icon: L.icon({
            iconUrl: 'src/static/images/santa-icon.png',
            iconSize: [38, 38]
        })
    }).addTo(map);

    // Center map on North Pole
    map.setView(NORTH_POLE.coordinates, 3);

    // Update location info
    document.getElementById('current-location').textContent = 
        `Current Location: ${NORTH_POLE.name}`;
    document.getElementById('next-stop').textContent = 
        'Next Stop: Preparing for Christmas Eve!';

    // Subscribe to Santa location updates
    EventSystem.subscribe('santaMove', (position) => {
        santaMarker.setLatLng(position);
        map.panTo(position);
    });

    document.addEventListener('DOMContentLoaded', () => {
        updateCountdown();
        setInterval(updateCountdown, 1000);
    });
});

// Countdown timer
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) {
        console.error('Countdown element not found');
        return;
    }
    const christmas = new Date(new Date().getFullYear(), 11, 25);
    const now = new Date();
    const diff = christmas - now;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownElement.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}