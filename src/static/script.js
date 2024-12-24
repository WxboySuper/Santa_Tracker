// filepath: /static/script.js
// Wait for the DOM to be fully loaded

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map without setting view yet
    // skipcq: JS-0125
    const map = L.map('map');
    
    // Add map tiles
    // skipcq: JS-0125
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Declare markers at top level scope
    let nextLocationMarker = null;
    let routeLine = null;
    let santaMarker = null;

    const NORTH_POLE = {
        name: "North Pole",
        coordinates: [90.0, 135.0]
    };

    // Get initial position and set up map
    fetch('/api/santa-location')
        .then(response => response.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                // Set initial view to Santa's position
                map.setView([data.latitude, data.longitude], 9);
                
                // Create Santa's marker (only once)
                // skipcq: JS-0125
                santaMarker = L.marker([data.latitude, data.longitude], {
                    // skipcq: JS-0125
                    icon: L.icon({
                        iconUrl: '../static/images/santa-icon.png',
                        iconSize: [38, 38]
                    })
                }).addTo(map);

                // Add next location marker if available
                if (data.next_stop) {
                    console.log('Adding next location marker:', data.next_stop);
                    // skipcq: JS-0125
                    nextLocationMarker = L.marker(
                        [data.next_stop.latitude, data.next_stop.longitude], 
                        {
                            // skipcq: JS-0125
                            icon: L.icon({
                                iconUrl: '../static/images/flag-icon.png',
                                iconSize: [32, 32]
                            })
                        }
                    ).addTo(map);

                    // Add route line
                    // skipcq: JS-0125
                    routeLine = L.polyline(
                        [[data.latitude, data.longitude], 
                         [data.next_stop.latitude, data.next_stop.longitude]], 
                        {
                            color: 'blue',
                            dashArray: '10',
                            opacity: 0.5
                        }
                    ).addTo(map);
                }

                // Initialize location displays
                document.getElementById('current-location').textContent = 
                    `Current Location: ${data.current_stop ? data.current_stop.location : 'North Pole'}`;
                document.getElementById('next-stop').textContent = 
                    data.next_stop ? `Next Stop: ${data.next_stop.location}` : 'Preparing for Christmas Eve!';

                // Initialize functionality
                updateLocationCountdown();
                updateSantaLocation();
                
                // Set intervals
                setInterval(updateSantaLocation, 1000);
                setInterval(updateLocationCountdown, 1000);
            }
        })
        .catch(error => console.error('Error initializing map:', error));

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
        
        fetch('/api/santa-status')
            .then(response => response.json())
            .then(data => {
                const now = new Date();
                let targetTime;
                let message;
                
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
                                
                                // Update Santa's marker
                                santaMarker.setLatLng(santaLatLng);
                                
                                // Update or create next location marker
                                if (!nextLocationMarker) {
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
                                
                                // Update or create route line
                                if (!routeLine) {
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
                            }
                        });
                } else {
                    // Remove route line when not in transit
                    if (routeLine) {
                        map.removeLayer(routeLine);
                        routeLine = null;
                    }
                }
                
                // Update status text
                document.getElementById('current-location').textContent = 
                    `Current Location: ${statusData.location ? statusData.location.location : 'North Pole'}`;
                document.getElementById('next-stop').textContent = 
                    statusData.status === 'pre-departure' ? 'Next Stop: Preparing for Christmas Eve!' :
                    statusData.status === 'journey-complete' ? 'Journey Complete!' :
                    `Next Stop: ${statusData.location ? statusData.location.location : ''}`;
            })
            .catch(error => console.error('Error updating location:', error));
    }

    // Initial setup
    map.setView(NORTH_POLE.coordinates, 3);
    document.getElementById('current-location').textContent = `Current Location: ${NORTH_POLE.name}`;
    document.getElementById('next-stop').textContent = 'Next Stop: Preparing for Christmas Eve!';

    // Initialize functionality
    updateSantaLocation();
    updateLocationCountdown();
    
    setInterval(updateSantaLocation, 1000);
    setInterval(updateLocationCountdown, 1000);
});
