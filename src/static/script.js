// filepath: /static/script.js
// Wait for the DOM to be fully loaded

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

    // Global variables
    let nextLocationMarker = null;
    let routeLine = null;
    let santaMarker = null;
    let targetTime;
    let message;

    function updateSantaLocation() {
        fetch('/api/santa-status')
            .then(response => response.json())
            .then(statusData => {
                const deliveryStatus = document.getElementById('delivery-status');
                
                if (statusData.status === 'at-location') {
                    deliveryStatus.textContent = 'Santa is Delivering Presents! 🎁';
                    deliveryStatus.style.display = 'block';
                } else {
                    deliveryStatus.textContent = '';
                    deliveryStatus.style.display = 'none';
                }

                if (statusData.status === 'in-transit') {
                    fetch('/api/santa-location')
                        .then(response => response.json())
                        .then(locationData => {
                            if (locationData.latitude && locationData.longitude && locationData.next_stop) {
                                const currentZoom = map.getZoom();
                                const santaLatLng = [locationData.latitude, locationData.longitude];
                                const nextLatLng = [locationData.next_stop.latitude, locationData.next_stop.longitude];
                                
                                santaMarker.setLatLng(santaLatLng);
                                
                                if (!nextLocationMarker) {
                                    // skipcq: JS-0125
                                    nextLocationMarker = L.marker(nextLatLng, {
                                        // skipcq: JS-0125
                                        icon: L.icon({
                                            iconUrl: '../static/images/flag-icon.png',
                                            iconSize: [32, 32]
                                        })
                                    }).addTo(map);
                                } else {
                                    nextLocationMarker.setLatLng(nextLatLng);
                                }
                                
                                if (!routeLine) {
                                    // skipcq: JS-0125
                                    routeLine = L.polyline([santaLatLng, nextLatLng], {
                                        color: 'blue',
                                        dashArray: '10',
                                        opacity: 0.5,
                                        weight: 3
                                    }).addTo(map);
                                } else {
                                    routeLine.setLatLngs([santaLatLng, nextLatLng]);
                                }
                                
                                map.flyTo(santaLatLng, currentZoom, {
                                    animate: true,
                                    duration: 1.5
                                });

                                document.getElementById('current-location').textContent = 
                                    `Current Location: ${locationData.current_stop.location}`;
                                document.getElementById('next-stop').textContent = 
                                    `Next Stop: ${locationData.next_stop.location}`;
                            }
                        });
                } else if (routeLine) {
                    map.removeLayer(routeLine);
                    routeLine = null;
                }
            })
            .catch(error => console.error('Error updating location:', error));
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
                        iconUrl: '../static/images/santa-icon.png',
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

    // Set update intervals
    setInterval(updateSantaLocation, 1000);
    setInterval(updateLocationCountdown, 1000);
});
