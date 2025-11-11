// filepath: /static/script.js
// Santa Tracker - Enhanced with festive features and smooth animations

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize snowfall effect
    initSnowfall();
    
    // Initialize map with festive theme
    // skipcq: JS-0125
    const map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
    });
    
    // Add OpenStreetMap tiles (free and open-source)
    // skipcq: JS-0125
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        minZoom: 2
    }).addTo(map);

    // Create marker cluster group for better performance
    // Note: Currently not used but ready for when route points are added
    // skipcq: JS-0125
    // const markers = L.markerClusterGroup({
    //     spiderfyOnMaxZoom: true,
    //     showCoverageOnHover: false,
    //     zoomToBoundsOnClick: true,
    //     maxClusterRadius: 50
    // });

    // Custom Santa icon with animation
    // skipcq: JS-0125
    const santaIcon = L.icon({
        iconUrl: '/static/images/santa-icon.png',
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -24],
        className: 'santa-marker'
    });

    // Create Santa's marker with animation
    // skipcq: JS-0125
    const santaMarker = L.marker([20, 0], {
        icon: santaIcon,
        title: 'Santa Claus',
        alt: 'Santa\'s current position'
    }).addTo(map);

    // Add popup to Santa marker
    santaMarker.bindPopup('<div class="text-center p-2"><strong>🎅 Santa is here!</strong><br><span id="popup-location">North Pole</span></div>');

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

    // Track Santa's route for smooth animation
    let isAnimating = false;

    // Subscribe to Santa location updates with smooth movement
    EventSystem.subscribe('santaMove', (data) => {
        const { position, location, animate } = data;
        
        if (animate) {
            animateSantaMovement(position);
        } else {
            santaMarker.setLatLng(position);
            map.panTo(position, { animate: true, duration: 1.0 });
        }
        
        // Update popup
        const popupLocation = document.getElementById('popup-location');
        if (popupLocation && location) {
            popupLocation.textContent = location;
        }
    });

    // Smooth animation for Santa's movement along route
    function animateSantaMovement(targetPosition) {
        if (isAnimating) return;
        
        isAnimating = true;
        const startPosition = santaMarker.getLatLng();
        const steps = 30; // Number of animation steps
        let currentStep = 0;

        const animationInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;
            
            // Linear interpolation between positions
            const lat = startPosition.lat + (targetPosition[0] - startPosition.lat) * progress;
            const lng = startPosition.lng + (targetPosition[1] - startPosition.lng) * progress;
            
            santaMarker.setLatLng([lat, lng]);
            
            if (currentStep >= steps) {
                clearInterval(animationInterval);
                isAnimating = false;
                map.panTo(targetPosition, { animate: true, duration: 0.5 });
            }
        }, 50); // 50ms per step = 1.5s total animation
    }

    // Initialize countdown timers
    initCountdowns();

    // Example: Load and display route (replace with actual data loading)
    loadSantaRoute();

    // Simulate Santa movement (replace with real tracking logic)
    simulateSantaMovement();

    // Make map keyboard accessible
    map.getContainer().addEventListener('keydown', function(e) {
        const step = 0.1;
        const center = map.getCenter();
        
        switch(e.key) {
        case 'ArrowUp':
            map.panTo([center.lat + step, center.lng]);
            break;
        case 'ArrowDown':
            map.panTo([center.lat - step, center.lng]);
            break;
        case 'ArrowLeft':
            map.panTo([center.lat, center.lng - step]);
            break;
        case 'ArrowRight':
            map.panTo([center.lat, center.lng + step]);
            break;
        case '+':
        case '=':
            map.zoomIn();
            break;
        case '-':
        case '_':
            map.zoomOut();
            break;
        }
    });
});

// Initialize animated snowfall effect
function initSnowfall() {
    const snowfallContainer = document.getElementById('snowfall');
    if (!snowfallContainer) return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const snowflakeCount = 40;
    const snowflakes = ['❄', '❅', '❆'];

    for (let i = 0; i < snowflakeCount; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.fontSize = (Math.random() * 1 + 0.5) + 'em';
        snowflake.style.animationDuration = (Math.random() * 10 + 10) + 's';
        snowflake.style.animationDelay = Math.random() * 10 + 's';
        snowflake.style.opacity = Math.random() * 0.6 + 0.4;
        
        // Alternate animation direction for variety
        snowflake.style.animationName = i % 2 === 0 ? 'snowfall' : 'snowfall-left';
        
        snowfallContainer.appendChild(snowflake);
    }
}

// Initialize countdown timers
function initCountdowns() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
    
    updateLocationCountdown();
    setInterval(updateLocationCountdown, 1000);
}

// Update main Christmas countdown
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    let christmas = new Date(currentYear, 11, 25, 0, 0, 0);
    
    // If Christmas has passed this year, show next year's Christmas
    if (now > christmas) {
        christmas = new Date(currentYear + 1, 11, 25, 0, 0, 0);
    }
    
    const diff = christmas - now;
    
    if (diff <= 0) {
        countdownElement.innerHTML = '🎄 Merry Christmas! 🎅';
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownElement.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Update location countdown timer
function updateLocationCountdown() {
    const countdownElement = document.getElementById('location-countdown');
    if (!countdownElement) return;
    
    // Simulate next departure time (replace with actual logic)
    const now = new Date();
    const nextDeparture = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    const diff = nextDeparture - now;
    
    if (diff <= 0) {
        countdownElement.innerHTML = '🚀 Departed!';
        return;
    }
    
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownElement.innerHTML = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Load Santa's route from data source
function loadSantaRoute() {
    // Example route points (replace with actual data loading)
    const exampleRoute = [
        { lat: 90, lng: 0, name: 'North Pole' },
        { lat: 64.2, lng: -21.9, name: 'Reykjavik, Iceland' },
        { lat: 51.5, lng: -0.1, name: 'London, UK' },
        { lat: 48.9, lng: 2.3, name: 'Paris, France' },
        { lat: 41.9, lng: 12.5, name: 'Rome, Italy' },
        { lat: 40.7, lng: -74.0, name: 'New York, USA' },
        { lat: -33.9, lng: 151.2, name: 'Sydney, Australia' },
        { lat: 35.7, lng: 139.7, name: 'Tokyo, Japan' }
    ];
    
    // Update current location display
    updateLocationDisplay(exampleRoute[0].name, exampleRoute[1].name);
    
    // Draw route on map (optional)
    // drawRouteOnMap(exampleRoute);
}

// Update location display in sidebar
function updateLocationDisplay(currentLocation, nextStop) {
    const currentLocationEl = document.getElementById('current-location');
    const nextStopEl = document.getElementById('next-stop');
    
    if (currentLocationEl) {
        currentLocationEl.textContent = currentLocation;
    }
    
    if (nextStopEl) {
        nextStopEl.textContent = `Next Stop: ${nextStop}`;
    }
}

// Simulate Santa's movement (replace with real tracking)
function simulateSantaMovement() {
    const cities = [
        { pos: [90, 0], name: 'North Pole' },
        { pos: [64.2, -21.9], name: 'Reykjavik' },
        { pos: [51.5, -0.1], name: 'London' },
        { pos: [48.9, 2.3], name: 'Paris' },
        { pos: [41.9, 12.5], name: 'Rome' }
    ];
    
    let currentIndex = 0;
    
    setInterval(() => {
        currentIndex = (currentIndex + 1) % cities.length;
        const nextIndex = (currentIndex + 1) % cities.length;
        
        const EventSystem = window.EventSystem || {
            emit: function() {}
        };
        
        // Emit movement event with smooth animation
        if (typeof EventSystem.emit === 'function') {
            EventSystem.emit('santaMove', {
                position: cities[currentIndex].pos,
                location: cities[currentIndex].name,
                animate: true
            });
        }
        
        updateLocationDisplay(cities[currentIndex].name, cities[nextIndex].name);
    }, 8000); // Move every 8 seconds
}