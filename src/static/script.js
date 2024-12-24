// filepath: /static/script.js
// Wait for the DOM to be fully loaded

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    // skipcq: JS-0241, JS-0125
    const map = new L.Map('map').setView([90, 0], 3);
    
    // Add OpenStreetMap tiles
    // skipcq: JS-0125
    new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add a marker for Santa's initial position (North Pole)
    // skipcq: JS-0241, JS-0125
    const santaIcon = new L.Icon({
        iconUrl: '/src/static/santa-icon.png',
        iconSize: [38, 38]
    });

    // skipcq: JS-0241, JS-0125
    const santaMarker = new L.Marker([90, 0], {icon: santaIcon})
        .addTo(map)
        .bindPopup('Santa is here!');
    // Create an event system module
    const EventSystem = (function() {
        const events = {};
        
        return {
            // Subscribe to an event
            on: function(event, callback) {
                if (!events[event]) events[event] = [];
                events[event].push(callback);
            },
            
            // Emit an event
            emit: function(event, data) {
                if (!events[event]) return;
                events[event].forEach(callback => callback(data));
            }
        };
    })();
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

document.addEvenetLister('DOMContentLoaded', () => {
    updateCountdown();
    setInterval(updateCountdown, 1000);
})