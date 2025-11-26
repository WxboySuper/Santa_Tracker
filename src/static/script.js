// filepath: /static/script.js
// Santa Tracker - Enhanced with festive features and smooth animations

// Interval variables for cleanup
let animationInterval = null;
// Interval for Santa movement updates
let santaMovementInterval = null;

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize snowfall effect
    initSnowfall();
    
    // Initialize countdown timers first (independent of map)
    initCountdowns();
    
    // Check if Leaflet is loaded before initializing map
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded. Map functionality will be disabled.');
        return;
    }
    
    // Initialize map with festive theme
    // skipcq: JS-0125
    const map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
    });
    
    // Add CartoDB Dark Matter tiles (dark theme for night sky effect)
    // skipcq: JS-0125
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        minZoom: 2,
        subdomains: 'abcd'
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

    // Make EventSystem globally accessible
    window.EventSystem = EventSystem;

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

        animationInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;
            
            // Linear interpolation between positions
            const lat = startPosition.lat + (targetPosition[0] - startPosition.lat) * progress;
            const lng = startPosition.lng + (targetPosition[1] - startPosition.lng) * progress;
            
            santaMarker.setLatLng([lat, lng]);
            
            if (currentStep >= steps) {
                clearInterval(animationInterval);
                animationInterval = null;
                isAnimating = false;
                map.panTo(targetPosition, { animate: true, duration: 0.5 });
            }
        }, 50); // 50ms per step = 1.5s total animation
    }

    // Load and display route with real tracking logic
    loadSantaRoute();

    // Make map keyboard accessible
    map.getContainer().addEventListener('keydown', (e) => {
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
        default:
            // No action for other keys
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
        snowflake.style.left = `${Math.random() * 100}vw`;
        snowflake.style.fontSize = `${Number(Math.random()) * 1 + 0.5}em`;
        snowflake.style.animationDuration = `${Math.random() * 10 + 10}s`;
        snowflake.style.animationDelay = `${Math.random() * 10}s`;
        snowflake.style.opacity = Math.random() * 0.6 + 0.4;
        
        // Alternate animation direction for variety
        snowflake.style.animationName = i % 2 === 0 ? 'snowfall' : 'snowfall-left';
        
        snowfallContainer.appendChild(snowflake);
    }
}

// Initialize countdown timers
let christmasCountdownInterval = null;
let locationCountdownInterval = null;

function initCountdowns() {
    // Initialize main tour launch countdown using CountdownModule
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        christmasCountdownInterval = window.CountdownModule.createCountdown({
            targetElement: countdownElement,
            useLocalTime: false // Use UTC+14 time to match when Santa actually starts
        });
        christmasCountdownInterval.start();
    }
    
    // Initialize location-specific countdown
    updateLocationCountdown();
    locationCountdownInterval = setInterval(updateLocationCountdown, 1000);
}

// Update location countdown timer (for next departure from current location)
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
let santaRoute = [];

async function loadSantaRoute() {
    try {
        const response = await fetch('/static/data/santa_route.json');
        const data = await response.json();
        santaRoute = data.route || [];
        
        if (santaRoute.length > 0) {
            // Initialize with first location
            const firstLocation = santaRoute[0];
            updateLocationDisplay(firstLocation.name || firstLocation.location, 
                santaRoute[1] ? (santaRoute[1].name || santaRoute[1].location) : 'Unknown');
        }
        
        // Start real-time tracking based on timestamps
        startRealTimeTracking();
    } catch (error) {
        console.error('Failed to load Santa route:', error);
        // Fallback to simulation if route data fails to load
        simulateSantaMovement();
    }
}

// Interpolate Santa's position between two locations based on timestamps
function interpolatePosition(loc1, loc2, currentTime) {
    // Validate inputs
    if (!loc1 || !loc2) {
        console.warn('interpolatePosition: Missing location objects.');
        return loc2 && typeof loc2.latitude === 'number' && typeof loc2.longitude === 'number'
            ? [loc2.latitude, loc2.longitude]
            : [0, 0];
    }

    const departure = adjustTimestampToCurrentYear(loc1.departure_time);
    const arrival = adjustTimestampToCurrentYear(loc2.arrival_time);
    const now = currentTime ? new Date(currentTime) : new Date();

    // Validate parsed dates
    if (!departure || !arrival) {
        console.warn('interpolatePosition: Invalid departure or arrival timestamps.', loc1.departure_time, loc2.arrival_time);
        return (typeof loc2.latitude === 'number' && typeof loc2.longitude === 'number')
            ? [loc2.latitude, loc2.longitude]
            : [0, 0];
    }
    
    // Calculate progress between 0 and 1
    const totalDuration = arrival - departure;
    if (totalDuration <= 0) {
        // Instant transition or invalid timestamps
        return [loc2.latitude, loc2.longitude];
    }
    const elapsed = now - departure;
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    
    // Ensure numeric coordinates
    const lat1 = Number(loc1.latitude);
    const lng1 = Number(loc1.longitude);
    const lat2 = Number(loc2.latitude);
    const lng2 = Number(loc2.longitude);

    if ([lat1, lng1, lat2, lng2].some(v => Number.isNaN(v))) {
        console.warn('interpolatePosition: Invalid coordinate values.', loc1, loc2);
        return (typeof loc2.latitude === 'number' && typeof loc2.longitude === 'number')
            ? [loc2.latitude, loc2.longitude]
            : [0, 0];
    }

    // Linear interpolation of latitude and longitude
    const lat = lat1 + (lat2 - lat1) * progress;
    const lng = lng1 + (lng2 - lng1) * progress;
    
    return [lat, lng];
}

// Helper function to adjust route timestamp to current or next Christmas season
function adjustTimestampToCurrentYear(timestamp) {
    const routeDate = new Date(timestamp);
    if (isNaN(routeDate.getTime())) {
        // Return null for invalid timestamps instead of an invalid Date object
        console.warn('adjustTimestampToCurrentYear: Invalid timestamp:', timestamp);
        return null;
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Get the tour end date for this year (Dec 26 00:00 UTC - after journey completes)
    const tourEndThisYear = new Date(Date.UTC(currentYear, 11, 26, 0, 0, 0));
    
    // Create adjusted date with current year
    const adjustedDate = new Date(routeDate);
    adjustedDate.setUTCFullYear(currentYear);
    
    // If we've already finished Christmas this year, use next year
    if (now > tourEndThisYear) {
        adjustedDate.setUTCFullYear(currentYear + 1);
    }
    
    return adjustedDate;
}

// Determine Santa's current status and position
function getSantaStatus() {
    if (santaRoute.length === 0) {
        return null;
    }
    
    const now = new Date();
    
    // Check if journey hasn't started yet (before first location)
    const firstLocation = santaRoute[0];
    if (firstLocation.arrival_time) {
        const firstArrivalTime = adjustTimestampToCurrentYear(firstLocation.arrival_time);
        if (firstArrivalTime && now < firstArrivalTime) {
            // Find North Pole location (Santa's workshop - identified by fun_facts or as last location)
            const northPole = santaRoute.find(loc => 
                (loc.notes && loc.notes.toLowerCase().includes('workshop')) ||
                (loc.fun_facts && loc.fun_facts.toLowerCase().includes('workshop'))
            ) || santaRoute[santaRoute.length - 1];
            
            return {
                status: 'Preparing',
                location: firstLocation,
                position: [northPole.latitude, northPole.longitude],
                currentIndex: 0
            };
        }
    }
    
    // Check each location to determine status
    for (let i = 0; i < santaRoute.length; i++) {
        const location = santaRoute[i];
        
        // Validate arrival_time and departure_time
        if (!location.arrival_time || !location.departure_time) {
            console.warn(`Location at index ${i} missing required timestamps`);
            continue;
        }
        const arrivalTime = adjustTimestampToCurrentYear(location.arrival_time);
        const departureTime = adjustTimestampToCurrentYear(location.departure_time);
        if (!arrivalTime || !departureTime) {
            console.warn(`Location at index ${i} has invalid timestamps`);
            continue;
        }
        
        // Santa is "Landed" if current time is between arrival and departure
        if (now >= arrivalTime && now <= departureTime) {
            return {
                status: 'Landed',
                location,
                position: [location.latitude, location.longitude],
                currentIndex: i,
                notes: location.notes || location.fun_facts
            };
        }
        
        // Check if Santa is "In Transit" to next location
        if (i < santaRoute.length - 1) {
            const nextLocation = santaRoute[i + 1];
            // Validate nextLocation.arrival_time
            if (!nextLocation.arrival_time) {
                console.warn(`Next location at index ${i + 1} missing arrival_time`);
                continue;
            }
            const nextArrivalTime = adjustTimestampToCurrentYear(nextLocation.arrival_time);
            if (!nextArrivalTime) {
                console.warn(`Next location at index ${i + 1} has invalid arrival_time`);
                continue;
            }
            
            if (now > departureTime && now < nextArrivalTime) {
                return {
                    status: 'In Transit',
                    from: location,
                    to: nextLocation,
                    position: interpolatePosition(location, nextLocation, now),
                    currentIndex: i,
                    progress: ((now - departureTime) / (nextArrivalTime - departureTime) * 100).toFixed(1)
                };
            }
        }
    }
    
    // After checking all locations, journey must be complete
    const lastLocation = santaRoute[santaRoute.length - 1];
    return {
        status: 'Completed',
        location: lastLocation,
        position: [lastLocation.latitude, lastLocation.longitude],
        currentIndex: santaRoute.length - 1
    };
}

// Start real-time tracking based on timestamps
function startRealTimeTracking() {
    // Update immediately
    updateSantaPosition();
    
    // Update every 5 seconds for smooth tracking
    santaMovementInterval = setInterval(updateSantaPosition, 5000);
}

// Update Santa's position based on current time and route data
function updateSantaPosition() {
    const status = getSantaStatus();
    
    if (!status) return;
    
    const EventSystem = window.EventSystem || {
        // eslint-disable-next-line no-empty-function
        emit() {} // No-op fallback when EventSystem is not available
    };
    
    // Emit movement event with position
    if (typeof EventSystem.emit === 'function') {
        EventSystem.emit('santaMove', {
            position: status.position,
            location: status.location ? (status.location.name || status.location.location) : 
                (status.to ? `En route to ${status.to.name || status.to.location}` : 'Unknown'),
            animate: false  // Use smooth updates instead of discrete animation
        });
    }
    
    // Update location display
    let currentLocationText = '';
    let nextStopText = '';
    
    if (status.status === 'Landed') {
        if (status.location) {
            currentLocationText = `${status.location.name || status.location.location} (Landed)`;
            const nextIndex = status.currentIndex + 1;
            if (nextIndex < santaRoute.length) {
                nextStopText = `Next Stop: ${santaRoute[nextIndex].name || santaRoute[nextIndex].location}`;
            } else {
                nextStopText = 'Journey Complete!';
            }
            
            // Display notes/fun facts if available
            if (status.notes) {
                updateNotesDisplay(status.notes);
            }
        }
    } else if (status.status === 'In Transit') {
        currentLocationText = `In Transit (${status.progress}%)`;
        if (status.to) {
            nextStopText = `Next Stop: ${status.to.name || status.to.location}`;
            
            // Display notes about destination
            if (status.to.notes || status.to.fun_facts) {
                updateNotesDisplay(status.to.notes || status.to.fun_facts);
            }
        }
    } else if (status.status === 'Preparing') {
        currentLocationText = 'Preparing for departure...';
        if (status.location) {
            nextStopText = `First Stop: ${status.location.name || status.location.location}`;
        }
    } else if (status.status === 'Completed') {
        currentLocationText = `${status.location.name || status.location.location} (Journey Complete!)`;
        nextStopText = 'All deliveries complete! 🎉';
    }
    
    updateLocationDisplay(currentLocationText, nextStopText);
}

// Update notes/fun facts display
function updateNotesDisplay(notes) {
    const notesElement = document.getElementById('location-notes');
    if (notesElement && notes) {
        notesElement.textContent = notes;
        notesElement.style.display = 'block';
    } else if (notesElement) {
        notesElement.style.display = 'none';
    }
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

function simulateSantaMovement() {
    // Display error message instead of simulating with fake data
    console.error('Santa route data failed to load. Cannot display tracking.');
    
    // Update UI to show error state
    updateLocationDisplay('Route data unavailable', 'Please check back later');
    
    // Try to reload after 30 seconds
    setTimeout(() => {
        console.log('Retrying route data load...');
        loadSantaRoute();
    }, 30000);
}

// Cleanup function for page unload
window.addEventListener('beforeunload', () => {
    if (santaMovementInterval) {
        clearInterval(santaMovementInterval);
    }
    if (christmasCountdownInterval) {
        clearInterval(christmasCountdownInterval);
    }
    if (locationCountdownInterval) {
        clearInterval(locationCountdownInterval);
    }
    if (animationInterval) {
        clearInterval(animationInterval);
    }
});