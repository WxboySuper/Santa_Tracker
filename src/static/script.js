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
        iconUrl: 'static/santa-icon.png',
        iconSize: [38, 38]
    });

    // skipcq: JS-0241, JS-0125
    const santaMarker = new L.Marker([90, 0], {icon: santaIcon})
        .addTo(map)
        .bindPopup('Santa is here!');
    window.santaMarker = santaMarker; // Make it available globally
});

// Countdown timer
function updateCountdown() {
    const christmas = new Date(new Date().getFullYear(), 11, 25);
    const now = new Date();
    const diff = christmas - now;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    document.getElementById('countdown').innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

setInterval(updateCountdown, 1000);