// filepath: /static/script.js
// Santa Tracker - Enhanced with festive features and smooth animations

// Interval variables for cleanup
let animationInterval = null;
// Interval for Santa movement updates
let santaMovementInterval = null;
// Interval for pre-flight updates
let preflightUpdateInterval = null;
// Interval for weather updates (separate from other preflight updates)
let weatherUpdateInterval = null;

// Timeout variables for cleanup
let santaMarkerTimeoutId = null;
let liftoffToastTimeoutId = null;
let liftoffToastHideTimeoutId = null;

// Tracking mode state: 'preflight' or 'live'
let currentMode = 'preflight';
// Flag to track if liftoff transition has occurred
let hasLiftoffOccurred = false;

let santaRoute = [];

// North Pole coordinates
const NORTH_POLE = { lat: 90, lng: 0 };

// Camera controller refs (declare at module scope so other functions can access)
let _lastZoom = null;
let _isCameraAnimating = false;
let _cameraAnimationTimeout = null;
let _savedMaxBounds = null;
let _savedMaxBoundsViscosity = null;
let _cameraSuppressedUntil = 0;
// Past trail polyline reference (module scope so other functions can append points)
let pastTrail = null;

// Animation constants for liftoff transition
const LIFTOFF_FLY_ZOOM = 7;
const LIFTOFF_FLY_DURATION = 3;
const LIFTOFF_FLY_EASE = 0.25;
const SANTA_MARKER_UPDATE_DELAY = 1500;
// Weather update interval (30 minutes) - realistic weather doesn't change frequently
const WEATHER_UPDATE_INTERVAL = 1800000;

// Cinematic Camera Constants (shared at module scope so functions outside
// DOMContentLoaded can reference them, e.g. liftoff logic)
const CAMERA_ZOOM = {
    DELIVERY: 13,
    SHORT_HOP: 10,
    LONG_HAUL: 5,
    LAUNCH: 3
};

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

    // Initialize map with festive theme - start at North Pole for pre-flight
    // skipcq: JS-0125
    const map = L.map('map', {
        center: [NORTH_POLE.lat, NORTH_POLE.lng],
        zoom: 3,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
        // Match route-editor: allow multiple world copies horizontally and keep stable coords
        worldCopyJump: false,
        // Wide longitudinal bounds to allow smooth wrapping without snapping
        maxBounds: [[-85, -540], [85, 540]],
        maxBoundsViscosity: 0.9
    });

    // Store map reference globally for mode transitions
    window.trackerMap = map;

    // Add Carto Voyager tiles (colorful, readable)
    // skipcq: JS-0125
    const tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const tileLayerOpts = {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        minZoom: 2,
        subdomains: 'abcd',
        // allow tiles to repeat horizontally for world copies
        noWrap: false
    };
    L.tileLayer(tileLayerUrl, tileLayerOpts).addTo(map);

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

    // Create Santa's marker with animation - start at North Pole
    // skipcq: JS-0125
    const santaMarker = L.marker([NORTH_POLE.lat, NORTH_POLE.lng], {
        icon: santaIcon,
        title: 'Santa Claus',
        alt: 'Santa\'s current position'
    }).addTo(map);

    // Trail polyline showing where Santa has traveled
    pastTrail = L.polyline([], {
        color: '#fbbf24', // warm gold
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        className: 'santa-trail',
        interactive: false
    }).addTo(map);
    // Initialize trail with North Pole start
    try {
        pastTrail.addLatLng([NORTH_POLE.lat, NORTH_POLE.lng]);
    } catch (e) {
        console.debug('pastTrail initialization failed', e);
    }

    // Store Santa marker globally for mode transitions
    window.santaMarker = santaMarker;

    // Add popup to Santa marker
    santaMarker.bindPopup('<div class="text-center p-2"><strong>🎅 Santa is here!</strong><br><span id="popup-location">North Pole Workshop</span></div>');

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

    // Cinematic Camera Constants are declared at module scope

    // Camera controller refs (already declared at module scope)

    // Temporarily disable maxBounds so camera can follow across world copies
    function disableMapBoundsTemporarily(durationMs) {
        const mapRef = window.trackerMap;
        if (!mapRef) return;
        if (_savedMaxBounds === null) {
            _savedMaxBounds = mapRef.options.maxBounds || null;
            _savedMaxBoundsViscosity = mapRef.options.maxBoundsViscosity || 0;
            try {
                mapRef.setMaxBounds(null);
            } catch (e) {
                console.debug('disableMapBoundsTemporarily: could not clear maxBounds', e);
            }
        }
        // Restore after timeout
        setTimeout(() => {
            try {
                if (_savedMaxBounds !== null) {
                    mapRef.setMaxBounds(_savedMaxBounds);
                    mapRef.options.maxBoundsViscosity = _savedMaxBoundsViscosity;
                }
            } catch (e) {
                console.debug('disableMapBoundsTemporarily: could not restore maxBounds', e);
            }
            _savedMaxBounds = null;
            _savedMaxBoundsViscosity = null;
        }, durationMs || 800);
    }

    // Camera controller: decide zoom based on Santa status and transit speed_curve
    // `refLng` is an optional longitude used as the reference for display-wrapping calculations
    function applyCinematicCamera(targetPosition, refLng) {
        if (!window.trackerMap || !targetPosition) return;

        // Only auto-zoom when in live mode
        if (currentMode !== 'live') {
            // when preflight, keep to North Pole view
            if (!_isCameraAnimating) {
                window.trackerMap.panTo(targetPosition, { animate: true, duration: 0.5 });
            }
            return;
        }

        // If camera changes are temporarily suppressed (e.g., right after switching to live), only pan
        if (Date.now() < _cameraSuppressedUntil) {
            // suppression active: only pan so we don't zoom/fly while liftoff animation is in progress
            const displayLng = getDisplayLng(targetPosition[1], refLng);
            window.trackerMap.panTo([targetPosition[0], displayLng], { animate: true, duration: 0.6 });
            return;
        }

        const status = getSantaStatus();
        if (!status) return;

        let targetZoom = null;

        if (status.status === 'Landed') {
            targetZoom = CAMERA_ZOOM.DELIVERY;
        } else if (status.status === 'Preparing') {
            targetZoom = CAMERA_ZOOM.SHORT_HOP;
        } else if (status.status === 'In Transit') {
            // prefer the `to` transit info if available
            const to = status.to ?? status.location ?? null;
            const nextTransit = to?.transit?.speed_curve ?? null;

            switch (nextTransit) {
            case 'HYPERSONIC_LONG':
                targetZoom = CAMERA_ZOOM.LAUNCH;
                break;
            case 'HYPERSONIC':
                targetZoom = CAMERA_ZOOM.LONG_HAUL;
                break;
            case 'REGIONAL':
            case 'CRUISING':
            default:
                targetZoom = CAMERA_ZOOM.SHORT_HOP;
                break;
            }
        } else if (status.status === 'Completed') {
            targetZoom = CAMERA_ZOOM.DELIVERY;
        }

        const mapRef = window.trackerMap;

        const zoomChanged = targetZoom !== null && targetZoom !== _lastZoom;

        if (zoomChanged && !_isCameraAnimating) {
            // clear pending timeout
            if (_cameraAnimationTimeout) {
                clearTimeout(_cameraAnimationTimeout);
                _cameraAnimationTimeout = null;
            }

            _isCameraAnimating = true;

            // choose duration (longer when zooming in)
            const isZoomingIn = targetZoom > (mapRef.getZoom() || 0);
            const duration = isZoomingIn ? 2.0 : 1.5;

            // Use display longitude to fly to the nearest world copy
            const displayLng = getDisplayLng(targetPosition[1], refLng);
            // temporarily disable bounds while flying so the map can recenter across dateline
            disableMapBoundsTemporarily(duration * 1000 + 250);
            mapRef.flyTo([targetPosition[0], displayLng], targetZoom, {
                animate: true,
                duration,
                easeLinearity: 0.25
            });

            _lastZoom = targetZoom;

            _cameraAnimationTimeout = setTimeout(() => {
                _isCameraAnimating = false;
                _cameraAnimationTimeout = null;
            }, duration * 1000 + 150);
        } else if (!_isCameraAnimating) {
            const displayLng = getDisplayLng(targetPosition[1], refLng);
            // allow a short bounds-disable for pan so it centers fully
            disableMapBoundsTemporarily(700);
            mapRef.panTo([targetPosition[0], displayLng], { animate: true, duration: 0.5 });
        }
    }

    // Track Santa's route for smooth animation
    let isAnimating = false;

    // Subscribe to Santa location updates with smooth movement
    EventSystem.subscribe('santaMove', (data) => {
        const { position, location, animate, refLng } = data;

        // `position` is in canonical/adjusted longitude domain. Convert to display longitude
        // relative to the provided reference longitude so marker, trail and camera use the same world copy.
        const lat = Number(position[0]);
        const canonicalLng = Number(position[1]);
        const displayLng = getDisplayLng(canonicalLng, refLng);
        const displayPosition = [lat, displayLng];

        if (animate) {
            // Animate using display coordinates so interpolation stays on the same world copy
            animateSantaMovement(displayPosition);
        } else {
            santaMarker.setLatLng(displayPosition);
            // Add to traveled trail if this is a new point (use display coords)
            try {
                const latlngs = pastTrail.getLatLngs();
                const last = latlngs.length ? latlngs[latlngs.length - 1] : null;
                if (!last || last.lat !== displayPosition[0] || last.lng !== displayPosition[1]) {
                    pastTrail.addLatLng(displayPosition);
                }
            } catch (e) {
                console.debug('pastTrail addLatLng failed', e);
            }
            // Avoid changing camera while a marker animation is in progress
            if (!isAnimating) {
                applyCinematicCamera(displayPosition, refLng);
            }
        }

        // Update popup
        const popupLocation = document.getElementById('popup-location');
        if (popupLocation && location) {
            popupLocation.textContent = location;
        }
    });

    // Smooth animation for Santa's movement along route
    // `targetPosition` is in display coordinates (already converted to the chosen world copy)
    function animateSantaMovement(targetPosition) {
        if (isAnimating) return;

        isAnimating = true;
        const startPosition = santaMarker.getLatLng();
        const steps = 30; // Number of animation steps
        let currentStep = 0;

        // Align start longitude to the target copy so interpolation takes the shortest path.
        // Both startPosition and targetPosition are expected to be in display coordinates (same world copy).
        const startLngRaw = startPosition.lng;
        const targetLngRaw = targetPosition[1];
        const delta = ((targetLngRaw - startLngRaw + 540) % 360) - 180;
        // Compute target on the nearest world copy to start
        const alignedTargetLng = startLngRaw + delta;

        animationInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            // Linear interpolation between positions
            const lat = startPosition.lat + (targetPosition[0] - startPosition.lat) * progress;
            const lng = startLngRaw + (alignedTargetLng - startLngRaw) * progress;

            santaMarker.setLatLng([lat, lng]);

            if (currentStep >= steps) {
                clearInterval(animationInterval);
                animationInterval = null;
                isAnimating = false;
                const mapRef = window.trackerMap;
                if (mapRef) {
                    // ensure pan isn't constrained by bounds when finishing animation
                    disableMapBoundsTemporarily(700);
                    // targetPosition already uses display coords; pan directly to it
                    mapRef.panTo([targetPosition[0], targetLngRaw], { animate: true, duration: 0.5 });
                    // Add final position to traveled trail
                    try {
                        const latlngs = pastTrail.getLatLngs();
                        const last = latlngs.length ? latlngs[latlngs.length - 1] : null;
                        if (!last || last.lat !== targetPosition[0] || last.lng !== targetPosition[1]) {
                            pastTrail.addLatLng([targetPosition[0], targetPosition[1]]);
                        }
                    } catch (e) {
                        console.debug('Failed to add point to pastTrail in animateSantaMovement', e);
                    }
                }
            }
        }, 50); // 50ms per step = 1.5s total animation
    }

    // Load and display route with real tracking logic
    loadSantaRoute();

    // dev simulation removed in production build

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

// Adjusted longitudes for shortest-path interpolation (populated after route load)
let adjustedLongitudes = [];

// Normalize any longitude to the range [-180, 180)
function normalizeLng(lng) {
    if (lng === undefined || lng === null || Number.isNaN(Number(lng))) return 0;
    const n = Number(lng);
    return ((n + 180) % 360 + 360) % 360 - 180;
}

// Return a longitude adjusted so it is the nearest copy relative to a reference longitude.
// If `refLng` is omitted, use the current map center longitude.
function getDisplayLng(lng, refLng) {
    const norm = normalizeLng(lng);
    if (!window.trackerMap && (refLng === undefined || refLng === null)) return norm;
    const centerLng = (refLng === undefined || refLng === null) ? window.trackerMap.getCenter().lng : refLng;
    const delta = ((norm - centerLng + 540) % 360) - 180;
    return centerLng + delta;
}

function computeAdjustedLongitudes() {
    adjustedLongitudes = [];
    if (!santaRoute || santaRoute.length === 0) return;

    for (let i = 0; i < santaRoute.length; i++) {
        const lngRaw = Number(santaRoute[i].longitude ?? 0);
        const norm = normalizeLng(lngRaw);
        if (i === 0) {
            adjustedLongitudes.push(norm);
        } else {
            const prev = adjustedLongitudes[i - 1];
            const delta = ((norm - prev + 540) % 360) - 180;
            adjustedLongitudes.push(prev + delta);
        }
    }
}

// Helper function to safely get countdown time data
function getCountdownTimeData() {
    return christmasCountdownInterval ? christmasCountdownInterval.getTimeData() : null;
}

function initCountdowns() {
    // Initialize main tour launch countdown using CountdownModule with mode callback
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        christmasCountdownInterval = window.CountdownModule.createCountdown({
            targetElement: countdownElement,
            useLocalTime: false, // Use UTC+14 time to match when Santa actually starts
            onUpdate: handleCountdownUpdate
        });
        christmasCountdownInterval.start();

        // Initial mode check
        const timeData = getCountdownTimeData();
        if (timeData) {
            updateTrackingMode(timeData.isComplete);
        }
    }

    // Initialize location-specific countdown (only shown in live mode)
    updateLocationCountdown();
    locationCountdownInterval = setInterval(updateLocationCountdown, 1000);

    // Start pre-flight status updates only if in preflight mode
    if (currentMode === 'preflight') {
        startPreflightUpdates();
    }
}

// Handle countdown updates and trigger mode transitions
function handleCountdownUpdate(timeData) {
    if (timeData?.isComplete && currentMode === 'preflight' && !hasLiftoffOccurred) {
        triggerLiftoff();
    }
}

// Update tracking mode based on countdown state
function updateTrackingMode(isLaunched) {
    const preflightPanel = document.getElementById('preflight-panel');
    const livePanel = document.getElementById('live-panel');

    if (isLaunched && currentMode === 'preflight') {
        currentMode = 'live';

        // Switch panels
        if (preflightPanel) preflightPanel.style.display = 'none';
        if (livePanel) livePanel.style.display = 'block';

        // Stop pre-flight updates
        if (preflightUpdateInterval) {
            clearInterval(preflightUpdateInterval);
            preflightUpdateInterval = null;
        }
        // Stop weather updates
        if (weatherUpdateInterval) {
            clearInterval(weatherUpdateInterval);
            weatherUpdateInterval = null;
        }
    } else if (!isLaunched && currentMode === 'live') {
        currentMode = 'preflight';

        // Switch panels
        if (preflightPanel) preflightPanel.style.display = 'block';
        if (livePanel) livePanel.style.display = 'none';

        // Start pre-flight updates
        startPreflightUpdates();
    }
}

// Trigger liftoff sequence
function triggerLiftoff() {
    hasLiftoffOccurred = true;

    // Show liftoff toast
    showLiftoffToast();

    // Update mode
    updateTrackingMode(true);

    // Animate map to first destination
    if (santaRoute.length > 0 && window.trackerMap) {
        const firstStop = santaRoute[0];
        const mapRef = window.trackerMap;

        // Fly from North Pole to first stop using display-adjusted longitude
        const displayLng = getDisplayLng(firstStop.longitude);
        // Use cinematic LAUNCH zoom (if available) to start more zoomed-out for liftoff
        const launchZoom = (typeof CAMERA_ZOOM !== 'undefined' && CAMERA_ZOOM.LAUNCH) ? CAMERA_ZOOM.LAUNCH : LIFTOFF_FLY_ZOOM;
        mapRef.flyTo([firstStop.latitude, displayLng], launchZoom, {
            duration: LIFTOFF_FLY_DURATION,
            easeLinearity: LIFTOFF_FLY_EASE
        });

        // Mark camera as animating to prevent the cinematic controller from fighting the liftoff flyTo
        _isCameraAnimating = true;
        _lastZoom = (typeof CAMERA_ZOOM !== 'undefined' && CAMERA_ZOOM.LAUNCH) ? CAMERA_ZOOM.LAUNCH : LIFTOFF_FLY_ZOOM;
        if (_cameraAnimationTimeout) {
            clearTimeout(_cameraAnimationTimeout);
            _cameraAnimationTimeout = null;
        }
        _cameraAnimationTimeout = setTimeout(() => {
            _isCameraAnimating = false;
            _cameraAnimationTimeout = null;
        }, LIFTOFF_FLY_DURATION * 1000 + 150);

        // Suppress cinematic zooms for a short time after liftoff
        _cameraSuppressedUntil = Date.now() + (LIFTOFF_FLY_DURATION * 1000 + 1000);

        // Update Santa marker position (tracked for cleanup)
        if (window.santaMarker) {
            santaMarkerTimeoutId = setTimeout(() => {
                if (currentMode === 'live' && window.santaMarker) {
                    window.santaMarker.setLatLng([firstStop.latitude, displayLng]);
                    // also add liftoff first stop to the trail using display-adjusted longitude
                    try {
                        const displayLngForTrail = getDisplayLng(firstStop.longitude);
                        if (pastTrail) pastTrail.addLatLng([firstStop.latitude, displayLngForTrail]);
                    } catch (e) {
                        // ignore
                    }
                }
            }, SANTA_MARKER_UPDATE_DELAY);
        }
    }
}

// Show liftoff toast notification
function showLiftoffToast() {
    const toast = document.getElementById('liftoff-toast');
    if (!toast) return;

    // Clear any previous timeouts and reset toast state
    clearLiftoffToastTimeouts();
    toast.style.display = 'block';
    toast.style.animation = 'toast-appear 0.5s ease-out forwards';

    // Hide toast after 4 seconds
    liftoffToastTimeoutId = setTimeout(() => {
        toast.style.animation = 'toast-disappear 0.5s ease-out forwards';
        liftoffToastHideTimeoutId = setTimeout(() => {
            toast.style.display = 'none';
            toast.style.animation = 'toast-appear 0.5s ease-out forwards';
        }, 500);
    }, 4000);
}

// Cleanup function to clear toast timeouts and reset toast state
function clearLiftoffToastTimeouts() {
    if (liftoffToastTimeoutId) {
        clearTimeout(liftoffToastTimeoutId);
        liftoffToastTimeoutId = null;
    }
    if (liftoffToastHideTimeoutId) {
        clearTimeout(liftoffToastHideTimeoutId);
        liftoffToastHideTimeoutId = null;
    }
}

// Start pre-flight status updates
function startPreflightUpdates() {
    // Clear any existing intervals first to prevent duplicates
    if (preflightUpdateInterval) {
        clearInterval(preflightUpdateInterval);
        preflightUpdateInterval = null;
    }
    if (weatherUpdateInterval) {
        clearInterval(weatherUpdateInterval);
        weatherUpdateInterval = null;
    }

    updatePreflightStatus();
    preflightUpdateInterval = setInterval(updatePreflightStatus, 5000);

    // Start weather updates separately (less frequent - every 30 minutes)
    updatePreflightWeather();
    weatherUpdateInterval = setInterval(updatePreflightWeather, WEATHER_UPDATE_INTERVAL);
}

// Update pre-flight panel with dynamic status
function updatePreflightStatus() {
    if (currentMode !== 'preflight') return;

    const reindeerStatuses = [
        '🦌 Resting',
        '🦌 Stretching',
        '🦌 Eating Carrots',
        '🦌 Getting Harnessed',
        '🦌 Ready for Flight!'
    ];

    const sleighStatuses = [
        '🎁 Loading Gifts...',
        '🛷 Checking Runners',
        '✨ Polishing Sleigh',
        '📦 Securing Cargo',
        '✅ Ready for Departure!'
    ];

    // Get countdown to determine progress using helper function
    const timeData = getCountdownTimeData();
    let progressIndex = 0;

    if (timeData && !timeData.isComplete) {
        // Calculate progress based on time remaining (closer to launch = higher index)
        if (timeData.days <= 1) progressIndex = 4;
        else if (timeData.days <= 3) progressIndex = 3;
        else if (timeData.days <= 7) progressIndex = 2;
        else if (timeData.days <= 14) progressIndex = 1;
        else progressIndex = 0;
    }

    // Update reindeer status
    const reindeerEl = document.getElementById('preflight-reindeer');
    if (reindeerEl) {
        reindeerEl.textContent = reindeerStatuses[Math.min(progressIndex, reindeerStatuses.length - 1)];
    }

    // Update sleigh status
    const sleighEl = document.getElementById('preflight-sleigh');
    if (sleighEl) {
        sleighEl.textContent = sleighStatuses[Math.min(progressIndex, sleighStatuses.length - 1)];
    }

    // Update status indicator based on progress
    const statusEl = document.getElementById('preflight-status');
    if (statusEl && timeData) {
        if (timeData.days <= 1) {
            statusEl.innerHTML = '<span class="status-indicator status-flying"></span> Preparing for Takeoff';
        } else {
            statusEl.innerHTML = '<span class="status-indicator status-grounded"></span> Grounded';
        }
    }
}

// Update pre-flight weather conditions (separate from other status updates for slower refresh)
function updatePreflightWeather() {
    if (currentMode !== 'preflight') return;

    const weatherConditions = [
        '❄️ -24°C / Heavy Snow',
        '🌨️ -22°C / Light Snow',
        '☁️ -20°C / Cloudy',
        '🌬️ -26°C / Blizzard',
        '❄️ -18°C / Clear & Cold'
    ];

    const weatherEl = document.getElementById('preflight-weather');
    if (weatherEl) {
        const weatherIndex = Math.floor(Math.random() * weatherConditions.length);
        weatherEl.textContent = weatherConditions[weatherIndex];
    }
}

// Update location countdown timer (for next departure from current location)
function updateLocationCountdown() {
    const countdownElement = document.getElementById('location-countdown');
    if (!countdownElement) return;
    const now = getNow();

    // Determine whether to show arrival or departure countdown based on Santa's status
    const status = getSantaStatus();
    let targetDate = null;
    let label = '';
    let headerText = 'Timer';

    if (status) {
        if (status.status === 'In Transit') {
            // countdown to arrival at the `to` location
            if (status.to?.arrival_time) {
                targetDate = adjustTimestampToCurrentYear(status.to.arrival_time);
                label = 'Arrival';
                headerText = 'ETA to Destination';
            }
        } else if (status.status === 'Landed' || status.status === 'Preparing') {
            // countdown to departure from current location
            if (status.location?.departure_time) {
                targetDate = adjustTimestampToCurrentYear(status.location.departure_time);
                label = 'Departure';
                headerText = 'Time to Departure';
            }
        }
    }

    // Fallback: next scheduled departure from route
    if (!targetDate) {
        const next = santaRoute.find(r => {
            const departureDate = adjustTimestampToCurrentYear(r.departure_time);
            return departureDate && departureDate.getTime() > now.getTime();
        });
        if (next) {
            targetDate = adjustTimestampToCurrentYear(next.departure_time);
            label = 'Next';
            headerText = 'Next Departure';
        }
    }

    if (!targetDate || isNaN(targetDate.getTime())) {
        // Update label fallback
        const labelEl = document.getElementById('location-countdown-label');
        if (labelEl) labelEl.textContent = headerText;
        countdownElement.innerHTML = '--:--';
        return;
    }

    const diff = targetDate - now;
    if (diff <= 0) {
        countdownElement.innerHTML = '00:00';
        return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const formatted = hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Update the label to indicate whether this is an Arrival or Departure timer
    const labelEl = document.getElementById('location-countdown-label');
    if (labelEl) {
        labelEl.textContent = headerText || (label || (status && status.status === 'In Transit' ? 'ETA to Destination' : 'Time to Departure'));
    }

    countdownElement.innerHTML = formatted;
}

async function loadSantaRoute() {
    try {
        const response = await fetch('/static/data/santa_route.json');
        const data = await response.json();
        // Normalize route data: support both legacy `route` and new `route_nodes` shape
        const nodes = data.route_nodes || data.route || [];

        // Map upstream node schema into the flat shape used by the tracker functions
        santaRoute = nodes.map(n => {
            const loc = n.location || {};
            const sched = n.schedule || {};
            const transit = n.transit_to_here || {};

            // Normalize longitude into [-180, 180]
            const lng = normalizeLng(Number(loc.lng ?? loc.longitude ?? 0));

            // Ensure we have at least one timestamp field to work with
            const arrival = sched.arrival_utc || sched.arrival_time || sched.departure_utc || sched.departure_time || null;
            const departure = sched.departure_utc || sched.departure_time || sched.arrival_utc || sched.arrival_time || null;

            return {
                id: n.id,
                name: loc.name || n.name || loc.location || 'Unknown',
                latitude: Number(loc.lat ?? loc.latitude ?? 0),
                longitude: lng,
                arrival_time: arrival,
                departure_time: departure,
                notes: n.notes || n.fun_facts || loc.notes || null,
                transit,
                stop_experience: n.stop_experience || {},
                type: n.type || 'DELIVERY'
            };
        });

        // Compute adjusted longitudes for smooth interpolation across dateline
        computeAdjustedLongitudes();

        // Only update live tracking display if in live mode
        if (santaRoute.length > 0 && currentMode === 'live') {
            // Initialize with first location
            const firstLocation = santaRoute[0];
            updateLocationDisplay(firstLocation.name || firstLocation.location,
                santaRoute[1] ? (santaRoute[1].name || santaRoute[1].location) : 'Unknown');
        }

        // Start real-time tracking based on timestamps (will respect mode)
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

    // Linear interpolation of latitude
    const lat = lat1 + (lat2 - lat1) * progress;

    // Longitude: prefer adjusted longitudes to take shortest path across dateline
    let lngA = lng1;
    let lngB = lng2;

    try {
        const idxA = santaRoute.findIndex(r => r.id === loc1.id);
        const idxB = santaRoute.findIndex(r => r.id === loc2.id);
        if (idxA !== -1 && idxB !== -1 && adjustedLongitudes.length === santaRoute.length) {
            lngA = adjustedLongitudes[idxA];
            lngB = adjustedLongitudes[idxB];
        }
    } catch (e) {
        console.debug('computeAdjustedLongitudes lookup failed, falling back to raw longitudes', e);
    }

    const delta = ((lngB - lngA + 540) % 360) - 180;
    const lng = lngA + delta * progress;

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

    const now = getNow();
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

// --- Simulation helpers (dev-only) -------------------------------------
// Returns the 'current' time; when simulation is active returns simulated time.
function getNow() {
    return new Date();
}

// Determine Santa's current status and position
function getSantaStatus() {
    if (santaRoute.length === 0) {
        return null;
    }

    const now = getNow();

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
    // Only update in live mode
    if (currentMode === 'live') {
        updateSantaPosition();
    }

    // Update every 5 seconds for smooth tracking
    santaMovementInterval = setInterval(() => {
        if (currentMode === 'live') {
            updateSantaPosition();
        }
    }, 5000);
}

// Update Santa's position based on current time and route data
// Helper to emit santa movement events (keeps main updater concise)
function emitSantaMove(status) {
    const EventSystem = window.EventSystem || { emit() {} }; // skipcq: JS-0057
    if (typeof EventSystem.emit === 'function') {
        // Ensure emitted position uses adjustedLongitudes when available to keep a canonical domain
        let emitPosition = status.position;
        try {
            if (Array.isArray(status.position) && status.position.length === 2) {
                // position may already be interpolated (adjusted). Use as-is.
                emitPosition = [Number(status.position[0]), Number(status.position[1])];
            } else if (status.currentIndex !== undefined && adjustedLongitudes.length === santaRoute.length) {
                // landed or static position: use adjusted longitude for the canonical copy
                const idx = Number(status.currentIndex) || 0;
                emitPosition = [Number(santaRoute[idx].latitude), adjustedLongitudes[idx]];
            }
        } catch (e) {
            // fallback to raw status.position
            emitPosition = status.position;
        }

        // Choose a stable reference longitude (map center) so the UI uses the same world copy across updates
        const refLng = window.trackerMap ? window.trackerMap.getCenter().lng : null;

        EventSystem.emit('santaMove', {
            position: emitPosition,
            location: status.location ? (status.location.name || status.location.location) :
                (status.to ? `En route to ${status.to.name || status.to.location}` : 'Unknown'),
            animate: false,
            refLng
        });
    }
}

// Helper to build display texts for current location and next stop
function buildLocationTexts(status) {
    let currentLocationText = '';
    let nextStopText = '';

    switch (status.status) {
    case 'Landed':
        if (status.location) {
            currentLocationText = `${status.location.name || status.location.location} (Landed)`;
            const nextIndex = status.currentIndex + 1;
            nextStopText = nextIndex < santaRoute.length
                ? `Next Stop: ${santaRoute[nextIndex].name || santaRoute[nextIndex].location}`
                : 'Journey Complete!';
            if (status.notes) updateNotesDisplay(status.notes);
        }
        break;
    case 'In Transit':
        currentLocationText = `In Transit (${status.progress}%)`;
        if (status.to) {
            nextStopText = `Next Stop: ${status.to.name || status.to.location}`;
            if (status.to.notes || status.to.fun_facts) updateNotesDisplay(status.to.notes || status.to.fun_facts);
        }
        break;
    case 'Preparing':
        currentLocationText = 'Preparing for departure...';
        if (status.location) nextStopText = `First Stop: ${status.location.name || status.location.location}`;
        break;
    case 'Completed':
        currentLocationText = `${status.location.name || status.location.location} (Journey Complete!)`;
        nextStopText = 'All deliveries complete! 🎉';
        break;
    default:
        break;
    }

    return { currentLocationText, nextStopText };
}

function updateSantaPosition() {
    // Skip updates if not in live mode
    if (currentMode !== 'live') return;

    const status = getSantaStatus();
    if (!status) return;

    emitSantaMove(status);

    const texts = buildLocationTexts(status);
    updateLocationDisplay(texts.currentLocationText, texts.nextStopText);
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
    if (preflightUpdateInterval) {
        clearInterval(preflightUpdateInterval);
    }
    if (weatherUpdateInterval) {
        clearInterval(weatherUpdateInterval);
    }
    // Cleanup liftoff transition timeouts
    if (santaMarkerTimeoutId) {
        clearTimeout(santaMarkerTimeoutId);
    }
    clearLiftoffToastTimeouts();
});