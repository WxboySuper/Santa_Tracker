// filepath: /static/script.js
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    const map = L.map('map').setView([90, 0], 3);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add a marker for Santa's initial position (North Pole)
    const santaMarker = L.marker([90, 0])
        .addTo(map)
        .bindPopup('Santa is here!');
});

// Santa marker
const santaIcon = L.icon({
    iconUrl: 'static/santa-icon.png',
    iconSize: [38, 38]
});

const santaMarker = L.marker([90, 0], {icon: santaIcon}).addTo(map);

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