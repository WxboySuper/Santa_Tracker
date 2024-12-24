// filepath: /static/script.js
// Wait for the DOM to be fully loaded

async function updateSantaLocation() {
    try {
        const response = await fetch('./static/data/santa_data.json');
        const data = await response.json();
        
        const { status, location, position, route } = data;
        
        // Update delivery status
        const deliveryStatus = document.getElementById('delivery-status');
        if (status === 'at-location') {
            deliveryStatus.textContent = 'Santa is Delivering Presents! 🎁';
            deliveryStatus.style.display = 'block';
        } else {
            deliveryStatus.textContent = '';
            deliveryStatus.style.display = 'none';
        }

        // Update marker and map
        if (position.latitude && position.longitude) {
            const currentZoom = map.getZoom();
            const santaLatLng = [position.latitude, position.longitude];
            
            // Update Santa's marker
            if (!santaMarker) {
                santaMarker = L.marker(santaLatLng, {
                    icon: L.icon({
                        iconUrl: './static/images/santa-icon.png',
                        iconSize: [38, 38]
                    })
                }).addTo(map);
            } else {
                santaMarker.setLatLng(santaLatLng);
            }

            // Update text displays
            document.getElementById('current-location').textContent = 
                `Current Location: ${location ? location.location : 'North Pole'}`;
            
            if (position.current_index < route.length - 1) {
                const nextStop = route[position.current_index + 1];
                document.getElementById('next-stop').textContent = 
                    `Next Stop: ${nextStop.location}`;
            }
        }
    } catch (error) {
        console.error('Error updating Santa location:', error);
    }
}

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    // skipcq: JS-0125
    const map = L.map('map', {
        zoomControl: false
    });
    
    // skipcq: JS-0125
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Update asset paths to be relative to root
    const SANTA_ICON = './images/santa-icon.png';
    const FLAG_ICON = './images/flag-icon.png';

    // Global variables
    let nextLocationMarker = null;
    let routeLine = null;
    let santaMarker = null;
    let targetTime;
    let message;

    async function loadSantaData() {
        const response = await fetch('./static/data/santa_data.json');
        const data = await response.json();
        return data;
    }

    function updateLocationCountdown() {
        const locationCountdownElement = document.getElementById('location-countdown');
        
        fetch('/api/santa-status')
            .then(response => response.json())
            .then(data => {
                const now = new Date();
                
                switch(data.status) {
                    case 'pre-departure':
                        targetTime = new Date(data.location.departure_time);
                        message = 'Time until departure from North Pole: ';
                        break;
                    case 'in-transit':
                        targetTime = new Date(data.location.arrival_time);
                        message = `Time until arrival at ${data.location.location}: `;
                        break;
                    case 'at-location':
                        targetTime = new Date(data.location.departure_time);
                        message = `Time until departure from ${data.location.location}: `;
                        break;
                    default:
                        locationCountdownElement.textContent = 'Journey Complete!';
                        return;
                }
                
                const diff = targetTime - now;
                if (diff > 0) {
                    const { hours, minutes, seconds } = calculateTimeComponents(diff);
                    locationCountdownElement.textContent = 
                        `${message}${formatTimeComponent(hours)}:${formatTimeComponent(minutes)}:${formatTimeComponent(seconds)}`;
                }
            })
            .catch(error => console.error('Error fetching santa status:', error));
    }

    // Initial setup
    fetch('/api/santa-location')
        .then(response => response.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                map.setView([data.latitude, data.longitude], 9);
                
                // skipcq: JS-0125
                santaMarker = L.marker([data.latitude, data.longitude], {
                    // skipcq: JS-0125
                    icon: L.icon({
                        iconUrl: SANTA_ICON,
                        iconSize: [38, 38]
                    })
                }).addTo(map);

                document.getElementById('current-location').textContent = 
                    `Current Location: ${data.current_stop ? data.current_stop.location : 'North Pole'}`;
                document.getElementById('next-stop').textContent = 
                    data.next_stop ? `Next Stop: ${data.next_stop.location}` : 'Preparing for Christmas Eve!';

                updateLocationCountdown();
                updateSantaLocation();
            }
        })
        .catch(error => console.error('Error initializing map:', error));

    // Initialize
    updateSantaLocation();
    updateLocationCountdown();

    // Set update intervals
    setInterval(updateSantaLocation, 1000);
    setInterval(updateLocationCountdown, 1000);
});
