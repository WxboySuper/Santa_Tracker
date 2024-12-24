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

    // Event System for handling updates
    const EventSystem = (function() {
        const events = {};
        
        return {
            subscribe: function(event, callback) {
                if (!events[event]) events[event] = [];
                events[event].push(callback);
            },
            emit: function(event, data) {
                if (events[event]) {
                    events[event].forEach(callback => callback(data));
                }
            }
        };
    })();

    // Create Santa's marker
    const santaMarker = L.marker([90, 0], {
        icon: L.icon({
            iconUrl: 'src/static/images/santa-icon.png',
            iconSize: [38, 38]
        })
    }).addTo(map);

    // Subscribe to Santa location updates
    EventSystem.subscribe('santaMove', function(position) {
        santaMarker.setLatLng(position);
        map.panTo(position);
    });

    // Example update (replace with real tracking logic)
    setInterval(() => {
        const newPosition = [
            90 - Math.random() * 10,
            Math.random() * 360 - 180
        ];
        EventSystem.emit('santaMove', newPosition);
    }, 5000);
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

document.addEventListener('DOMContentLoaded', () => {
    updateCountdown();
    setInterval(updateCountdown, 1000);
});