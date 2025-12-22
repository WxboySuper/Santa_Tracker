// filepath: /static/script.js
// Santa Tracker - Enhanced with festive features and smooth animations

// Interval variables for cleanup
let animationInterval = null;
// Interval for Santa movement updates
let santaMovementInterval = null;
// Whether the current santaMovement loop is a requestAnimationFrame (vs setInterval)
let santaMovementIsRAF = false;
// RAF id for real-time tracking loop
let _realTimeRAFId = null;
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

// North Pole coordinates (clamped to Leaflet-safe latitude range)
// Santa's North Pole latitude is 80 degrees in src/static/data/santa_route.json; use that directly.
// Place North Pole on the dateline (180/-180) to show it at the International Date Line.
const NORTH_POLE = { lat: 80, lng: 180 };

// Camera controller refs (declare at module scope so other functions can access)
let _lastZoom = null;
let _isCameraAnimating = false;
let _cameraAnimationTimeout = null;
let _savedMaxBounds = null;
let _savedMaxBoundsViscosity = null;
let _cameraSuppressedUntil = 0;
// Past trail polyline reference (module scope so other functions can append points)
let pastTrail = null;
// Whether the global/fullscreen overlay has already been hidden (avoid re-showing)
let _overlayHidden;
// Flags shared between map init and route loader so overlay logic can coordinate
let _mapTilesReady = false;
let _routeReady = false;
let _routeLoadedEmitted = false;
// Whether we've aligned the map view (center/zoom) to the initial trail/marker
let _initialViewAligned = false;
// Optional initial reference longitude lock to keep marker/trail on the chosen world copy
let _initialRefLng = null;

// Animation constants for liftoff transition
const LIFTOFF_FLY_DURATION = 3;
const LIFTOFF_FLY_EASE = 0.25;
const SANTA_MARKER_UPDATE_DELAY = 1500;
// Weather update interval (30 minutes) - realistic weather doesn't change frequently
const WEATHER_UPDATE_INTERVAL = 1800000;

// Preflight UX tuning
// Seconds before the anchor countdown that we switch the UI into 'live' mode
// (show live panel / hide top-right countdown). Choose 30-60s; default 45s.
const PRELIVE_SWITCH_SECONDS = 45;
// Minutes before launch to mark 'Preparing for Takeoff' in the preflight panel.
const PREPARE_WARNING_MINUTES = 30;
// Whether to hide the main countdown in the top-right when entering live mode early
const HIDE_COUNTDOWN_ON_LIVE = true;
// Internal flag to avoid repeated early switches
let _preliveSwitched = false;

// Cinematic Camera Constants (shared at module scope so functions outside
// DOMContentLoaded can reference them, e.g. liftoff logic)
const CAMERA_ZOOM = {
    DELIVERY: 13,
    SHORT_HOP: 10,
    LONG_HAUL: 7,
};

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    console.debug && console.debug('Tracker DOMContentLoaded start');
    try {
    // Initialize snowfall effect
    initSnowfall();

    // Initialize countdown timers first (independent of map)
    initCountdowns();

    // Create and show a full-screen loading overlay while map and route initialize
    function createFullScreenOverlay() {
        let ov = document.getElementById('global-map-loading-overlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'global-map-loading-overlay';
        Object.assign(ov.style, {
            position: 'fixed',
            left: '0',
            top: '0',
            width: '100vw',
            height: '100vh',
            background: '#08101a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647,
            pointerEvents: 'auto'
        });
        ov.innerHTML = '<div style="text-align:center;"><div style="font-size:18px;margin-bottom:8px">Preparing Santa Tracker…</div><div style="width:40px;height:40px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div></div>';
        const styleEl = document.createElement('style');
        // mark the style block so we can remove it when hiding the overlay
        styleEl.id = 'global-map-loading-overlay-style';
        // enforce full opacity, stacking and pointer behavior via CSS !important
        styleEl.textContent = '\n@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}\n#global-map-loading-overlay{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#08101a!important;color:#fff!important;display:flex!important;align-items:center;justify-content:center!important;z-index:2147483647!important;pointer-events:auto!important;opacity:1!important;mix-blend-mode:normal!important}\n#global-map-loading-overlay .loader{width:40px;height:40px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite}\n';
        document.head.appendChild(styleEl);
        // remember the style id on the element for easier cleanup
        try { ov.__styleElId = styleEl.id; } catch (e) { /* ignore */ }
        // Always append to body as last child so fixed overlay sits above map panes
        document.body.appendChild(ov);
        try { console.debug && console.debug('createFullScreenOverlay: appended overlay to body'); } catch (e) {}
        return ov;
    }

    function showFullScreenOverlay() {
        if (typeof _overlayHidden !== 'undefined' && _overlayHidden) return; // do not re-show after we've hidden once
        const ov = createFullScreenOverlay();
        if (ov) {
            // move to end of body to ensure top stacking
            try { document.body.appendChild(ov); } catch (e) { /* ignore */ }
            ov.style.display = 'flex';
            // record show time so we can enforce minimum display duration
            try { ov.__shownAt = Date.now(); } catch (e) { /* ignore */ }
            try { console.debug && console.debug('showFullScreenOverlay: shown'); } catch (e) {}
            // Watchdog: ensure overlay doesn't block the UI indefinitely
            setTimeout(() => {
                try {
                    const stillVisible = (document.getElementById('global-map-loading-overlay') && document.getElementById('global-map-loading-overlay').style.display !== 'none');
                    if (stillVisible && !(_overlayHidden)) {
                        console.warn && console.warn('global-map-loading-overlay still visible after 10s — forcing hide to avoid blocking UI');
                        try { 
                            // Force hide both overlays and mark overlay as hidden to avoid re-showing
                            if (typeof _overlayHidden === 'undefined' || !_overlayHidden) _overlayHidden = true;
                            try { hideFullScreenOverlay(); } catch (e) { /* ignore */ }
                            try { hideMapLoadingOverlay(); } catch (e) { /* ignore */ }
                        } catch (e) { /* ignore */ }
                    }
                } catch (e) { /* ignore */ }
            }, 10000);
        }
    }

    function hideFullScreenOverlay() {
        const ov = document.getElementById('global-map-loading-overlay');
        if (!ov) return;
        const MIN_MS = 1200; // ensure overlay visible at least this long
        try {
            const shownAt = ov.__shownAt || 0;
            const elapsed = Date.now() - shownAt;
            if (elapsed < MIN_MS) {
                setTimeout(() => { try { ov.style.display = 'none'; } catch (e) {} }, MIN_MS - elapsed);
                return;
            }
        } catch (e) { /* ignore */ }
        try {
            // Some stylesheet rules use `display: flex !important` which can
            // override normal inline styles. Use setProperty with `important`
            // to ensure the overlay actually hides.
            ov.style.setProperty('display', 'none', 'important');
        } catch (e) {
            try { ov.style.display = 'none'; } catch (e) { /* ignore */ }
        }
        // As a final fallback, remove the element from DOM so it cannot block UI.
        try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) { /* ignore */ }

        // Remove any style blocks we added for the overlay (old pages may have
        // appended multiple). Prefer the named style id when available.
        try {
            const named = document.getElementById('global-map-loading-overlay-style');
            if (named && named.parentNode) named.parentNode.removeChild(named);
        } catch (e) { /* ignore */ }
        try {
            // Fallback: remove any <style> that contains the overlay rule.
            const styles = Array.from(document.head.querySelectorAll('style'));
            styles.forEach(s => {
                try {
                    if (s.textContent && s.textContent.indexOf('#global-map-loading-overlay') !== -1) {
                        if (s.parentNode) s.parentNode.removeChild(s);
                    }
                } catch (e) { /* ignore */ }
            });
        } catch (e) { /* ignore */ }

        // Mark overlay hidden so other logic won't re-show it.
        try { _overlayHidden = true; } catch (e) { /* ignore */ }

        try { console.debug && console.debug('hideFullScreenOverlay: hidden', { mapTilesReady: _mapTilesReady, routeReady: _routeReady, overlayHiddenFlag: _overlayHidden }); } catch (e) {}
    }

    // Immediately show global overlay to block UI while initializing
    showFullScreenOverlay();

    // Check if Leaflet is loaded before initializing map
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded. Map functionality will be disabled.');
        try { hideFullScreenOverlay(); } catch (e) { /* ignore */ }
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
        // prefer canvas for better compositing when animating
        preferCanvas: true,
        // Match route-editor: allow multiple world copies horizontally and keep stable coords
        worldCopyJump: false,
        // Wide longitudinal bounds to allow smooth wrapping without snapping
        maxBounds: [[-85, -540], [85, 540]],
        maxBoundsViscosity: 0.9
    });

    // Store map reference globally for mode transitions
    window.trackerMap = map;

    // Debug instrumentation: log zoom/move events and wrap common camera methods
    try {
        // Log major map events with zoom and center for tracing unexpected changes
        // map event logging removed in production to reduce console noise
        map.on && map.on('zoomstart zoomend movestart moveend', function (e) { /* instrumentation removed */ });

        // Monkey-patch flyTo / panTo / setView to log requested zooms and centers
            if (typeof map.flyTo === 'function') {
            const _origFlyTo = map.flyTo.bind(map);
            map.flyTo = function (center, zoom, options) {
                return _origFlyTo(center, zoom, options);
            };
        }
        if (typeof map.panTo === 'function') {
            const _origPanTo = map.panTo.bind(map);
            map.panTo = function (center, options) {
                return _origPanTo(center, options);
            };
        }
        if (typeof map.setView === 'function') {
            const _origSetView = map.setView.bind(map);
            map.setView = function (center, zoom, options) {
                return _origSetView(center, zoom, options);
            };
        }
    } catch (e) {
        console.debug('Map instrumentation failed', e);
    }

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
    // Improve tile rendering stability to reduce seam flicker and keep some buffer
    tileLayerOpts.keepBuffer = tileLayerOpts.keepBuffer || 2;
    tileLayerOpts.detectRetina = tileLayerOpts.detectRetina || (window.devicePixelRatio > 1);
    // Prefer updating tiles when idle to avoid continuous reloads during animations/pans
    tileLayerOpts.updateWhenIdle = true;

    const tileLayer = L.tileLayer(tileLayerUrl, tileLayerOpts).addTo(map);

    // Map loading overlay helpers (use module-scope flags declared above)
    _mapTilesReady = false;
    _routeReady = false;
    _routeLoadedEmitted = false;
    _overlayHidden = false;
    // Ensure we only run the aggressive leftover cleanup once
    let _leftoverOverlayCleanupDone = false;

    function createMapLoadingOverlay() {
        const container = map.getContainer();
        if (!container) return null;
        let overlay = container.querySelector('#map-loading-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'map-loading-overlay';
        Object.assign(overlay.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            right: '0',
            bottom: '0',
            background: 'rgba(8,12,20,0.75)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 650,
            fontSize: '1.1rem'
        });
        overlay.innerHTML = '<div style="text-align:center;"><div style="margin-bottom:8px">Loading map…</div><div class="loader" style="width:36px;height:36px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div></div>';
        // minimal spinner keyframes + tile rendering helper CSS to reduce seams
        const styleEl = document.createElement('style');
        styleEl.id = 'map-loading-overlay-style';
        styleEl.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .leaflet-container .leaflet-tile { background-color: transparent; } .leaflet-container { -webkit-backface-visibility: hidden; backface-visibility: hidden; } .leaflet-tile { image-rendering: -webkit-optimize-contrast; image-rendering: optimizeQuality; }';
        document.head.appendChild(styleEl);
        try { overlay.__mapStyleElId = styleEl.id; } catch (e) { /* ignore */ }
        container.style.position = container.style.position || 'relative';
        container.appendChild(overlay);
        return overlay;
    }

    function showMapLoadingOverlay() {
        // Prefer global full-screen overlay for blocking; keep map-local overlay as fallback
        try { showFullScreenOverlay(); } catch (e) { /* ignore */ }
        const ov = createMapLoadingOverlay();
        if (ov) ov.style.display = 'flex';
    }

    function hideMapLoadingOverlay() {
        try { console.debug && console.debug('hideMapLoadingOverlay: entering', { mapTilesReady: _mapTilesReady, routeReady: _routeReady, overlayHiddenFlag: _overlayHidden }); } catch (e) {}
        try { hideFullScreenOverlay(); } catch (e) { /* ignore */ }
        const container = map.getContainer();
        if (!container) return;
        const ov = container.querySelector('#map-loading-overlay');
        if (ov) {
            try { ov.style.setProperty('display', 'none', 'important'); } catch (e) { try { ov.style.display = 'none'; } catch (e) {} }
            try { if (ov.__mapStyleElId) { const s = document.getElementById(ov.__mapStyleElId); if (s && s.parentNode) s.parentNode.removeChild(s); } } catch (e) { /* ignore */ }
            try {
                // Fallback: remove any style that mentions .leaflet-tile (our injected helper)
                const styles = Array.from(document.head.querySelectorAll('style'));
                styles.forEach(s => {
                    try { if (s.textContent && s.textContent.indexOf('.leaflet-tile') !== -1) { if (s.parentNode) s.parentNode.removeChild(s); } } catch (e) {}
                });
            } catch (e) { /* ignore */ }
        }
        try { console.debug && console.debug('hideMapLoadingOverlay: hid map-local overlay and requested full-screen hide'); } catch (e) {}
        // Run aggressive cleanup after a short delay to catch any reinjected styles/elements
        try {
            if (!_leftoverOverlayCleanupDone) {
                setTimeout(() => { try { removeLeftoverOverlays(); } catch (e) {} }, 80);
                // also run slightly later in case other scripts re-insert overlays
                setTimeout(() => { try { removeLeftoverOverlays(); } catch (e) {} }, 450);
            }
        } catch (e) { /* ignore */ }
    }

    // Aggressive removal of any leftover overlay elements or style blocks that
    // might have been missed by the normal hide logic. This is a safe, one-time
    // cleanup to ensure the UI is unblocked even if another script re-inserts
    // a blocking overlay element.
    function removeLeftoverOverlays() {
        try {
            if (_leftoverOverlayCleanupDone) return;
            _leftoverOverlayCleanupDone = true;

            try {
                ['global-map-loading-overlay', 'map-loading-overlay'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.parentNode) {
                        try { el.parentNode.removeChild(el); } catch (e) { /* ignore */ }
                    }
                });
            } catch (e) { /* ignore */ }

            // Remove named style elements we created earlier
            try {
                const ids = ['global-map-loading-overlay-style', 'map-loading-overlay-style'];
                ids.forEach(sid => {
                    try {
                        const s = document.getElementById(sid);
                        if (s && s.parentNode) s.parentNode.removeChild(s);
                    } catch (e) { /* ignore */ }
                });
            } catch (e) { /* ignore */ }

            // Fallback: remove any full-viewport fixed element that contains our
            // overlay text or spinner markup to be conservative.
            try {
                const candidates = Array.from(document.body.querySelectorAll('div'));
                candidates.forEach(d => {
                    try {
                        const cs = window.getComputedStyle(d);
                        const isFull = (cs.position === 'fixed' || cs.position === 'absolute') && (Math.abs(d.offsetWidth - window.innerWidth) <= 2) && (Math.abs(d.offsetHeight - window.innerHeight) <= 2);
                        if (!isFull) return;
                        const text = (d.textContent || '').toLowerCase();
                        if (text.includes('preparing santa tracker') || text.includes('loading map')) {
                            if (d.parentNode) d.parentNode.removeChild(d);
                        }
                    } catch (e) { /* ignore */ }
                });
            } catch (e) { /* ignore */ }

            try { console.debug && console.debug('removeLeftoverOverlays: completed cleanup'); } catch (e) {}
        } catch (e) { /* ignore */ }
    }

    // Show overlay initially until tiles + route finish loading
    showMapLoadingOverlay();

    // Tile layer events: hide overlay only after both tiles and route are ready
    try {
        // Only listen for the tile 'load' event to know when the base layer finished
        // loading initially. Do NOT show the overlay on each tilestart (removes
        // the transient transparent overlay when users zoom/pan).
        tileLayer.on('load', function() {
            try { console.debug && console.debug('tileLayer: load event'); } catch (e) {}
            if (_mapTilesReady) {
                try { console.debug && console.debug('tileLayer: load event ignored (already ready)'); } catch (e) {}
                return; // only handle first load
            }
            _mapTilesReady = true;
            try { console.debug && console.debug('tileLayer: setting _mapTilesReady = true', { mapTilesReady: _mapTilesReady, routeReady: _routeReady }); } catch (e) {}
            // If route already ready and we've aligned the initial view, hide overlays
            if (_routeReady && _initialViewAligned) {
                try { console.debug && console.debug('tileLayer: both ready and aligned -> scheduling hideMapLoadingOverlay'); } catch (e) {}
                setTimeout(() => { hideMapLoadingOverlay(); }, 200);
            }
        });
        tileLayer.on('tileerror', function(err) {
            try { console.warn && console.warn('tileLayer: tileerror', err); } catch (e) {}
            // mark tiles ready to avoid sticking overlay indefinitely; do not show overlay
            _mapTilesReady = true;
            try { console.debug && console.debug('tileLayer: setting _mapTilesReady = true due to tileerror', { mapTilesReady: _mapTilesReady, routeReady: _routeReady }); } catch (e) {}
            if (_routeReady && _initialViewAligned) {
                try { console.debug && console.debug('tileLayer: tileerror and route ready & aligned -> scheduling hideMapLoadingOverlay'); } catch (e) {}
                setTimeout(() => { hideMapLoadingOverlay(); }, 200);
            }
        });
    } catch (e) {
        console.debug('Tile layer instrumentation failed', e);
    }

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
        console.error('pastTrail initialization failed', e);
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
    try { console.debug && console.debug('EventSystem: created and assigned to window.EventSystem'); } catch (e) {}

    // Listen for route load events so the map overlay can hide when ready
    try {
        EventSystem.subscribe('routeLoaded', function() {
            try { console.debug && console.debug('EventSystem: routeLoaded event received'); } catch (e) {}
            try {
                if (_routeReady) {
                    try { console.debug && console.debug('EventSystem: routeLoaded ignored (already _routeReady)'); } catch (e) {}
                    return; // ignore duplicate events
                }
                _routeReady = true;
                try { console.debug && console.debug('EventSystem: setting _routeReady = true', { mapTilesReady: _mapTilesReady, routeReady: _routeReady }); } catch (e) {}
                if (_mapTilesReady && _initialViewAligned) {
                    try { console.debug && console.debug('EventSystem: both ready and aligned -> hideMapLoadingOverlay'); } catch (e) {}
                    hideMapLoadingOverlay();
                } else {
                    try { console.debug && console.debug('EventSystem: routeLoaded but waiting for mapTiles or initial alignment', { mapTilesReady: _mapTilesReady, initialViewAligned: _initialViewAligned }); } catch (e) {}
                }
            } catch (e) { /* ignore */ }
        });
    } catch (e) {
        // ignore if instrumentation not installed yet
    }

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

        // If camera changes are temporarily suppressed (e.g., right after switching to live), skip all camera changes
        if (Date.now() < _cameraSuppressedUntil) {
            try { console.debug && console.debug('applyCinematicCamera: suppression active, skipping camera changes', { until: _cameraSuppressedUntil }); } catch (e) {}
            return; // do nothing while liftoff/flyTo is in progress
        }

        const status = getSantaStatus();
        if (!status) return;

        let targetZoom = null;

        if (status.status === 'Landed') {
            targetZoom = CAMERA_ZOOM.DELIVERY;
        } else if (status.status === 'Preparing') {
            targetZoom = CAMERA_ZOOM.SHORT_HOP;
        } else if (status.status === 'In Transit') {
            // use the destination (`status.to`) transit info only
            // Prefer explicit transit.speed_curve on the destination; otherwise
            // estimate based on transit metadata or distance. Use computeTravelZoom
            // to centralize this logic and ensure we don't pick a stop-level camera_zoom.
            try {
                targetZoom = computeTravelZoom(status.from, status.to);
            } catch (e) {
                targetZoom = CAMERA_ZOOM.SHORT_HOP;
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

    // Compute travel zoom based on transit metadata or distance between nodes.
    function computeTravelZoom(fromNode, toNode) {
        // Prefer explicit speed_curve if present
        const speedCurve = (toNode && (toNode.transit && toNode.transit.speed_curve))
            ? String(toNode.transit.speed_curve).toUpperCase()
            : (toNode && toNode.transit_to_here && toNode.transit_to_here.speed_curve)
                ? String(toNode.transit_to_here.speed_curve).toUpperCase()
                : null;

        if (speedCurve === 'HYPERSONIC_LONG') return CAMERA_ZOOM.LONG_HAUL;
        if (speedCurve === 'HYPERSONIC') return CAMERA_ZOOM.LONG_HAUL;
        if (speedCurve === 'REGIONAL' || speedCurve === 'CRUISING') return CAMERA_ZOOM.SHORT_HOP;

        // Fallback: estimate by great-circle distance
        try {
            if (fromNode && toNode) {
                const R = 6371; // km
                const lat1 = fromNode.latitude * Math.PI / 180;
                const lat2 = toNode.latitude * Math.PI / 180;
                const dLat = lat2 - lat1;
                const dLng = (toNode.longitude - fromNode.longitude) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const km = R * c;
                if (km > 2000) return CAMERA_ZOOM.LONG_HAUL;
                if (km > 500) return CAMERA_ZOOM.LONG_HAUL;
                return CAMERA_ZOOM.SHORT_HOP;
            }
        } catch (e) {
            // ignore and fall back
        }

        return CAMERA_ZOOM.SHORT_HOP;
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
        // Prefer explicit refLng, then any initial locked refLng chosen during alignment,
        // otherwise fall back to current map center.
        const effectiveRef = (typeof refLng !== 'undefined' && refLng !== null)
            ? refLng
            : (_initialRefLng !== null ? _initialRefLng : (window.trackerMap ? window.trackerMap.getCenter().lng : null));
        const displayLng = getDisplayLng(canonicalLng, effectiveRef);
        const displayPosition = [lat, displayLng];

        if (window.SANTA_TRACE) {
            try { console.debug && console.debug('santaMove: pos', { canonicalLng, effectiveRef, displayLng, animate }); } catch (e) {}
        }

        if (animate) {
            // Animate using display coordinates so interpolation stays on the same world copy
            // Pass refLng into the animator so the cinematic camera can reference the same world copy
                // When animating, pass the effectiveRef so the animator and camera use the same world copy.
                animateSantaMovement(displayPosition, effectiveRef);
                // Clear the initial ref lock on first real animation so future updates may use live center
                try {
                    if (_initialRefLng !== null) {
                        _initialRefLng = null;
                        if (window.SANTA_TRACE) {
                            try { console.debug && console.debug('santaMove: cleared initialRefLng due to animate movement'); } catch (e) {}
                        }
                    }
                } catch (e) {}
        } else {
            santaMarker.setLatLng(displayPosition);
            // Add to traveled trail if this is a new point (use display coords)
            try {
                const latlngs = pastTrail.getLatLngs();
                const last = latlngs.length ? latlngs[latlngs.length - 1] : null;
                // Use a small distance threshold to avoid adding duplicate points caused by
                // floating-point noise in coordinates.
                const DUPLICATE_POINT_THRESHOLD_METERS = 5;

                if (!last) {
                    pastTrail.addLatLng(displayPosition);
                } else {
                    const toRad = Math.PI / 180;
                    const lat1 = last.lat;
                    const lng1 = last.lng;
                    const lat2 = displayPosition[0];
                    const lng2 = displayPosition[1];

                    const dLat = (lat2 - lat1) * toRad;
                    const dLng = (lng2 - lng1) * toRad;
                    const haversineA =
                        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const haversineC = 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));
                    const earthRadiusMeters = 6371000; // Earth radius in meters
                    const distance = earthRadiusMeters * haversineC;

                    if (distance > DUPLICATE_POINT_THRESHOLD_METERS) {
                        pastTrail.addLatLng(displayPosition);
                    }
                }
            } catch (e) {
                console.debug('pastTrail addLatLng failed', e);
            }
            // Avoid changing camera while a marker animation is in progress
            if (!isAnimating) {
                applyCinematicCamera(displayPosition, effectiveRef);
            }
        }

        // Update popup
        const popupLocation = document.getElementById('popup-location');
        if (popupLocation && location) {
            popupLocation.textContent = location;
        }

        // Debug: log the current map zoom whenever Santa moves
        try {
            const mapRefForLog = window.trackerMap;
            if (mapRefForLog) {
                    if (animate && typeof mapRefForLog.once === 'function') {
                    // For animated movement, wait until the map finishes moving
                    mapRefForLog.once('moveend', () => { /* zoom debug removed */ });
                } else {
                    // Instant move — no debug log
                }
            }
        } catch (e) {
            console.debug('santaMove zoom logging failed', e);
        }
    });

    // Smooth animation for Santa's movement along route
    // `targetPosition` is in display coordinates (already converted to the chosen world copy)
    function animateSantaMovement(targetPosition, refLng) {
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
                        const COORD_EPSILON = 0.001;  //degrees; avoids adding near-duplicate points

                        const isNewPoint =
                            !last ||
                            Math.abs(last.lat - targetPosition[0]) > COORD_EPSILON ||
                            Math.abs(last.lng - targetPosition[1]) > COORD_EPSILON;
                        if (isNewPoint) {
                            pastTrail.addLatLng([targetPosition[0], targetPosition[1]]);
                        }
                    } catch (e) {
                        console.debug('Failed to add point to pastTrail in animateSantaMovement', e);
                    }
                    // Call cinematic camera to allow zooming/flyTo based on new status
                    try {
                        applyCinematicCamera([targetPosition[0], targetLngRaw], refLng);
                    } catch (e) {
                        console.debug('animateSantaMovement: applyCinematicCamera failed', e);
                    }
                }
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
    } catch (err) {
        console.error('Tracker initialization error', err);
        try { hideFullScreenOverlay(); } catch (e) { /* ignore */ }
    }
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
let christmasCountdownFallbackInterval = null;
// Shared version used to avoid race conditions between multiple countdown sources.
// Incrementing this value invalidates older fallback instances so they stop updating the DOM.
let countdownSharedVersion = 0;
// Enforcer to force visible countdown to anchor node departure (overrides other countdown modules)
let forceCountdownToAnchorInterval = null;
// Whether a CountdownModule is available (do not start it until route anchor is checked)
let countdownModuleAvailable = false;

// Adjusted longitudes for shortest-path interpolation (populated after route load)
let adjustedLongitudes = [];

// Normalize any longitude to the range [-180, 180)
function normalizeLng(lng) {
    if (lng === undefined || lng === null || Number.isNaN(Number(lng))) return 0;
    const n = Number(lng);
    return ((n + 180) % 360 + 360) % 360 - 180;
}

// Format a millisecond duration into a human-friendly string like
// "4d 17h 39m 40s" or "17h 39m 40s" or "39m 40s".
function formatDurationMs(diff) {
    if (diff <= 0) return '00:00:00';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
        return `${days}d ${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }
    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }
    return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
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

// Populate the pastTrail so refreshing mid-route reconstructs the path up to now.
function populateInitialTrail() {
    try {
        if (!Array.isArray(santaRoute) || santaRoute.length === 0) return;
        const now = getNow();
        const latlngs = [];

        // Always include the anchor/North Pole as the start
        latlngs.push([NORTH_POLE.lat, NORTH_POLE.lng]);

        for (let i = 0; i < santaRoute.length; i++) {
            const node = santaRoute[i];
            const idx = i;
            const lat = Number(node.latitude);
            const lng = (adjustedLongitudes && adjustedLongitudes.length === santaRoute.length)
                ? adjustedLongitudes[idx]
                : Number(node.longitude);

            // If node arrival_time exists and is in the past, include it
            const arrival = node.arrival_time ? adjustTimestampToCurrentYear(node.arrival_time) : null;
            const departure = node.departure_time ? adjustTimestampToCurrentYear(node.departure_time) : null;

            if (arrival && arrival.getTime() <= now.getTime()) {
                latlngs.push([lat, lng]);
                continue;
            }

            if (departure && departure.getTime() <= now.getTime()) {
                latlngs.push([lat, lng]);
                continue;
            }

            // If currently in-transit from this node to the next, include interpolated position then stop
            if (i < santaRoute.length - 1) {
                const next = santaRoute[i + 1];
                const nextArrival = next.arrival_time ? adjustTimestampToCurrentYear(next.arrival_time) : null;
                if (departure && nextArrival && now.getTime() > departure.getTime() && now.getTime() < nextArrival.getTime()) {
                    try {
                        const interp = interpolatePosition(node, next, now);
                        // Use display conversion relative to map center if available
                        const refLng = window.trackerMap ? window.trackerMap.getCenter().lng : null;
                        const displayLng = getDisplayLng(interp[1], refLng);
                        latlngs.push([interp[0], displayLng]);
                    } catch (e) {
                        latlngs.push([lat, lng]);
                    }
                    break;
                }
            }

            // None of the above: future node — stop building
            break;
        }

        // Convert canonical/adjusted longitudes into the display copy that
        // matches the current map center so the trail aligns with the marker.
        // Prefer the santa marker's display copy as the reference so the trail and
        // marker use the same world copy. Fall back to map center if marker not ready.
        // Prefer the locked initial refLng if set so the trail uses the same world copy
        let refLng = null;
        try {
            if (_initialRefLng !== null) {
                refLng = _initialRefLng;
            } else if (window.santaMarker && typeof window.santaMarker.getLatLng === 'function') {
                refLng = window.santaMarker.getLatLng().lng;
            } else if (window.trackerMap && typeof window.trackerMap.getCenter === 'function') {
                refLng = window.trackerMap.getCenter().lng;
            }
        } catch (e) {
            refLng = (window.trackerMap && typeof window.trackerMap.getCenter === 'function') ? window.trackerMap.getCenter().lng : null;
        }
        const displayLatLngs = latlngs.map(([la, ln]) => [la, getDisplayLng(ln, refLng)]);

        if (pastTrail && typeof pastTrail.setLatLngs === 'function') {
            pastTrail.setLatLngs(displayLatLngs);
        } else if (pastTrail && typeof pastTrail.addLatLng === 'function') {
            // Fallback: clear and add sequentially
            try { pastTrail._latlngs = []; } catch (e) { /* ignore */ }
            displayLatLngs.forEach(p => { try { pastTrail.addLatLng(p); } catch (e) { /* ignore */ } });
        }

        // Position Santa marker at the most recent point using display coordinates
        const lastDisplay = displayLatLngs.length ? displayLatLngs[displayLatLngs.length - 1] : [NORTH_POLE.lat, NORTH_POLE.lng];
        if (window.santaMarker && typeof window.santaMarker.setLatLng === 'function') {
            try { window.santaMarker.setLatLng(lastDisplay); } catch (e) { /* ignore */ }
        }
        // Reset the initial-view alignment flag; caller should call alignInitialView()
        try { _initialViewAligned = false; } catch (e) { /* ignore */ }
    } catch (e) {
        console.debug('populateInitialTrail failed', e);
    }
}

// Align the initial map view (center + zoom) to the populated trail and marker
function alignInitialView(retries) {
    retries = typeof retries === 'number' ? retries : 0;
    try {
        if (_initialViewAligned) return;
        const mapRef = window.trackerMap;
        if (!mapRef) {
            if (retries < 5) setTimeout(() => alignInitialView(retries + 1), 120);
            return;
        }

        // Prefer status.position, then the last point of the populated trail; fallback to marker or santaRoute nodes
        let centerPoint = null;
        // Prefer live status position when available (gives accurate current in-transit position)
        let status = null;
        try { status = getSantaStatus(); } catch (e) { status = null; }
        if (status && status.position) {
            try { centerPoint = [Number(status.position[0]), Number(status.position[1])]; } catch (e) { centerPoint = null; }
        }
        try {
            if (pastTrail && typeof pastTrail.getLatLngs === 'function') {
                const latlngs = pastTrail.getLatLngs();
                if (latlngs && latlngs.length) {
                    const l = latlngs[latlngs.length - 1];
                    centerPoint = [l.lat, l.lng];
                }
            }
        } catch (e) { /* ignore */ }

        if (!centerPoint && window.santaMarker && typeof window.santaMarker.getLatLng === 'function') {
            const p = window.santaMarker.getLatLng();
            if (p) centerPoint = [p.lat, p.lng];
        }

        // Fallback: derive from santaRoute + adjustedLongitudes if still missing
        if (!centerPoint && Array.isArray(santaRoute) && adjustedLongitudes && adjustedLongitudes.length === santaRoute.length) {
            try {
                const idx = Math.max(0, santaRoute.length - 1);
                centerPoint = [Number(santaRoute[idx].latitude), Number(adjustedLongitudes[idx])];
            } catch (e) { /* ignore */ }
        }
        if (!centerPoint) {
            if (retries < 5) setTimeout(() => alignInitialView(retries + 1), 120);
            return;
        }

        // Determine an appropriate zoom based on current status
        let desiredZoom = null;
        try {
            const status = getSantaStatus();
            if (status && status.status === 'In Transit') {
                desiredZoom = computeTravelZoom(status.from, status.to) || (CAMERA_ZOOM.LONG_HAUL);
            } else {
                desiredZoom = CAMERA_ZOOM.DELIVERY;
            }
        } catch (e) {
            desiredZoom = CAMERA_ZOOM.SHORT_HOP;
        }

        try {
            // Apply immediate non-animated setView so the user doesn't see a jump
            mapRef.setView(centerPoint, desiredZoom, { animate: false });
            _lastZoom = desiredZoom;
            _initialViewAligned = true;
            // Lock the reference longitude to the chosen world copy so marker/trail use the same copy
            try {
                _initialRefLng = mapRef.getCenter().lng;
                try { console.debug && console.debug('alignInitialView: set _initialRefLng', _initialRefLng); } catch (e) {}
                // Clear the lock after a short grace period in case no animated movement occurs
                setTimeout(() => { try { if (_initialRefLng !== null) { _initialRefLng = null; try { console.debug && console.debug('alignInitialView: cleared _initialRefLng after grace period'); } catch (e) {} } } catch (e) {} }, 3000);
            } catch (e) { /* ignore */ }
            try { console.debug && console.debug('alignInitialView: aligned map to', { center: centerPoint, zoom: desiredZoom }); } catch (e) {}
        } catch (e) {
            // If setView fails (map not ready), try again shortly
            if (retries < 5) setTimeout(() => alignInitialView(retries + 1), 120);
        }
    } catch (e) {
        if (retries < 5) setTimeout(() => alignInitialView(retries + 1), 120);
    }
}

// Compute travel zoom based on transit metadata or distance between nodes.
// Moved to module scope so it is available to all runtime code.
function computeTravelZoom(fromNode, toNode) {
    // Prefer explicit speed_curve if present
    const speedCurve = (toNode && (toNode.transit && toNode.transit.speed_curve))
        ? String(toNode.transit.speed_curve).toUpperCase()
        : (toNode && toNode.transit_to_here && toNode.transit_to_here.speed_curve)
            ? String(toNode.transit_to_here.speed_curve).toUpperCase()
            : null;

    if (speedCurve === 'HYPERSONIC_LONG') return CAMERA_ZOOM.LONG_HAUL;
    if (speedCurve === 'HYPERSONIC') return CAMERA_ZOOM.LONG_HAUL;
    if (speedCurve === 'REGIONAL' || speedCurve === 'CRUISING') return CAMERA_ZOOM.SHORT_HOP;

    // Fallback: estimate by great-circle distance
    try {
            if (fromNode && toNode) {
                const R = 6371; // km
                const lat1 = fromNode.latitude * Math.PI / 180;
                const lat2 = toNode.latitude * Math.PI / 180;
                const dLat = lat2 - lat1;
                const dLng = (toNode.longitude - fromNode.longitude) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const km = R * c;
                if (km > 2000) return CAMERA_ZOOM.LONG_HAUL;
                if (km > 500) return CAMERA_ZOOM.LONG_HAUL;
                return CAMERA_ZOOM.SHORT_HOP;
            }
    } catch (e) {
        // ignore and fall back
    }

    return CAMERA_ZOOM.SHORT_HOP;
}

// Helper function to safely get countdown time data
function getCountdownTimeData() {
    return christmasCountdownInterval ? christmasCountdownInterval.getTimeData() : null;
}

function initCountdowns() {
    // Initialize main tour launch countdown using CountdownModule with mode callback
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        // Guard: CountdownModule may be missing in some builds or if a dependency failed to load.
        if (window.CountdownModule && typeof window.CountdownModule.createCountdown === 'function') {
            // Don't start the module here — prefer the route anchor when it becomes available.
            countdownModuleAvailable = true;
        } else {
            console.warn('CountdownModule not available; using route-based fallback countdown');
        }

        // Fallback: when CountdownModule isn't available, derive a simple countdown
        // from the route's anchor node departure time. The route may not be loaded
        // yet when this runs (DOMContentLoaded), so retry a few times before
        // showing a placeholder to avoid briefly showing `--:--`.
        if (!countdownModuleAvailable) {
            if (christmasCountdownFallbackInterval) {
                clearInterval(christmasCountdownFallbackInterval);
                christmasCountdownFallbackInterval = null;
            }

            // Capture the current shared version for this fallback instance. If the
            // shared version is incremented (by the anchor enforcer), this fallback
            // instance will stop updating the DOM to avoid races.
            const fallbackInstanceVersion = countdownSharedVersion;

            const MAX_RETRIES = 10;
            const RETRY_DELAY_MS = 300;
            let retries = 0;

            const updateMainCountdownFallback = () => {
                // If another countdown source (enforcer/module) has taken over,
                // stop this fallback from updating the DOM.
                if (fallbackInstanceVersion !== countdownSharedVersion) return;

                const el = countdownElement;
                if (!el) return;

                // If route not loaded yet, retry a few times before showing placeholder
                if (!Array.isArray(santaRoute) || santaRoute.length === 0) {
                    retries += 1;
                    if (retries <= MAX_RETRIES) {
                        // schedule a retry sooner than the main interval
                        setTimeout(updateMainCountdownFallback, RETRY_DELAY_MS);
                        return;
                    }
                    // exhausted retries: show placeholder until route arrives
                    el.textContent = '--:--';
                    return;
                }

                // Prefer an explicit North Pole anchor node (by id or START type),
                // otherwise fall back to the first node in the route.
                let first = null;
                first = santaRoute.find(n => {
                    try {
                        const nid = String(n.id || '').toLowerCase();
                        const ntype = String(n.type || '').toLowerCase();
                        return nid === 'node_000_north_pole' || nid.includes('north_pole') || ntype === 'start';
                    } catch (e) {
                        console.debug('Failed to check for North Pole anchor node', e);
                        return false;
                    }
                }) || santaRoute[0];

                let target = null;
                if (first) {
                    // For takeoff anchor prefer the departure_time over arrival_time
                    target = first.departure_time || first.arrival_time || null;
                }

                if (!target) {
                    el.textContent = '--:--';
                    return;
                }

                const targetDate = adjustTimestampToCurrentYear(target);
                if (!targetDate || isNaN(targetDate.getTime())) {
                    el.textContent = '--:--';
                    return;
                }

                const now = getNow();
                const diff = targetDate - now;
                if (diff <= 0) {
                    el.textContent = '00:00:00';
                    // trigger liftoff once - log if handler errors
                    try {
                        handleCountdownUpdate({ isComplete: true });
                    } catch (err) {
                        console.debug('handleCountdownUpdate invocation failed', err);
                    }
                    return;
                }

                // Use human-friendly days/hours/minutes/seconds formatting
                el.textContent = formatDurationMs(diff);
            };

            // Update immediately and then every second
            updateMainCountdownFallback();
            christmasCountdownFallbackInterval = setInterval(updateMainCountdownFallback, 1000);
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
    if (!timeData) return;

    // Compute remaining seconds from the Countdown-like timeData structure
    const totalSeconds = (timeData.days || 0) * 86400 + (timeData.hours || 0) * 3600 + (timeData.minutes || 0) * 60 + (timeData.seconds || 0);

    // Early UI switch: move to live panel shortly before liftoff so the page can
    // prepare cinematic animations while still waiting for the exact timestamp.
    if (!hasLiftoffOccurred && currentMode === 'preflight' && !_preliveSwitched) {
        if (totalSeconds <= PRELIVE_SWITCH_SECONDS) {
            _preliveSwitched = true;
            updateTrackingMode(true);
            if (HIDE_COUNTDOWN_ON_LIVE) {
                const el = document.getElementById('countdown-hud');
                if (el) el.style.display = 'none';
            }
        }
    }

    // When the countdown reaches zero, trigger the full liftoff sequence.
    if (timeData?.isComplete && !hasLiftoffOccurred) {
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
        // Hide top-right countdown when entering live mode early
        try {
            const countdownEl = document.getElementById('countdown');
            if (countdownEl && HIDE_COUNTDOWN_ON_LIVE) countdownEl.style.display = 'none';
        } catch (e) {
            console.debug('Failed to hide countdown on live switch', e);
        }
    } else if (!isLaunched && currentMode === 'live') {
        currentMode = 'preflight';

        // Switch panels
        if (preflightPanel) preflightPanel.style.display = 'block';
        if (livePanel) livePanel.style.display = 'none';

        // Start pre-flight updates
        startPreflightUpdates();
        // Restore countdown visibility when returning to preflight
        try {
            const countdownEl = document.getElementById('countdown');
            if (countdownEl) countdownEl.style.display = 'block';
        } catch (e) {
            console.debug('Failed to restore countdown on preflight switch', e);
        }
    }
}

// Trigger liftoff sequence
function triggerLiftoff() {
    hasLiftoffOccurred = true;

    // Show liftoff toast
    showLiftoffToast();

    // Update mode
    updateTrackingMode(true);

    // Ensure real-time tracking loop starts immediately after switching to live
    try { startRealTimeTracking(); } catch (e) { console.debug('startRealTimeTracking failed', e); }

    // Animate map to the first real destination (node after anchor)
    if (santaRoute.length > 0 && window.trackerMap) {
        const mapRef = window.trackerMap;

        // Find anchor index (START or north pole node). Prefer explicit START type.
        const anchorIndex = santaRoute.findIndex(n => {
            try {
                const nid = String(n.id || '').toLowerCase();
                const ntype = String(n.type || '').toLowerCase();
                return ntype === 'start' || nid === 'node_000_north_pole' || nid.includes('north_pole');
            } catch (e) { return false; }
        });

        // Destination should be the node after the anchor when available, otherwise the first non-anchor node.
        let destNode = null;
        if (anchorIndex !== -1 && anchorIndex + 1 < santaRoute.length) destNode = santaRoute[anchorIndex + 1];
        if (!destNode) destNode = santaRoute.find((_, i) => i !== anchorIndex) || santaRoute[0];

        // Compute display longitude and use the same travel-based zoom logic
        // as during normal in-transit updates. This removes any special-case
        // "launch" zoom and keeps liftoff framing consistent with long-haul.
        const displayLng = getDisplayLng(destNode.longitude);
        let travelZoom = null;
        try {
            const anchorNode = (anchorIndex !== -1) ? santaRoute[anchorIndex] : null;
            travelZoom = computeTravelZoom(anchorNode, destNode);
        } catch (e) {
            travelZoom = CAMERA_ZOOM.LONG_HAUL || 7;
        }
        // liftoff travel zoom debug removed

        mapRef.flyTo([destNode.latitude, displayLng], travelZoom, {
            duration: LIFTOFF_FLY_DURATION,
            easeLinearity: LIFTOFF_FLY_EASE
        });

        // Ensure cinematic controller doesn't immediately override the requested zoom
        _lastZoom = travelZoom;

        try {
            mapRef.once && mapRef.once('moveend', function() {
                // map zoom after flyTo debug removed
            });
        } catch (e) { /* ignore */ }

        _isCameraAnimating = true;
        if (_cameraAnimationTimeout) {
            clearTimeout(_cameraAnimationTimeout);
            _cameraAnimationTimeout = null;
        }
        _cameraAnimationTimeout = setTimeout(() => {
            _isCameraAnimating = false;
            _cameraAnimationTimeout = null;
        }, LIFTOFF_FLY_DURATION * 1000 + 150);

        _cameraSuppressedUntil = Date.now() + (LIFTOFF_FLY_DURATION * 1000 + 1000);

        // Do not force the Santa marker to the destination here. Let the
        // real-time tracking loop and regular animation pipeline move the
        // marker smoothly along the transit path to avoid teleportation.
    }

    // Clear fallback countdown if it was running
    if (christmasCountdownFallbackInterval) {
        clearInterval(christmasCountdownFallbackInterval);
        christmasCountdownFallbackInterval = null;
    }
    // Clear anchor countdown enforcer if present
    if (forceCountdownToAnchorInterval) {
        clearInterval(forceCountdownToAnchorInterval);
        forceCountdownToAnchorInterval = null;
    }
    // Stop any active countdown module so it doesn't continue updating the DOM after liftoff
    if (christmasCountdownInterval) {
        if (typeof christmasCountdownInterval.stop === 'function') {
            try { christmasCountdownInterval.stop(); } catch (e) { console.debug('Failed to stop christmasCountdownInterval on liftoff', e); }
        } else {
            try { clearInterval(christmasCountdownInterval); } catch (e) { /* ignore */ }
        }
        // Do not clear the reference so preflight logic can still use getTimeData()
    }
}

// removed computeLaunchZoom: liftoff uses travel-based zoom (LONG_HAUL) exclusively

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
        // Calculate progress based on time remaining (closer to launch = higher index).
        // Use minute-based thresholds so the 'Preparing' state occurs closer to launch
        // (e.g., within PREPARE_WARNING_MINUTES).
        const totalMinutes = (timeData.days || 0) * 1440 + (timeData.hours || 0) * 60 + (timeData.minutes || 0);
        if (totalMinutes <= PREPARE_WARNING_MINUTES) progressIndex = 4;
        else if (totalMinutes <= PREPARE_WARNING_MINUTES * 2) progressIndex = 3;
        else if (totalMinutes <= 60 * 24 * 7) progressIndex = 2;
        else if (totalMinutes <= 60 * 24 * 14) progressIndex = 1;
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
    // TODO: Make the "Preparing for Takeoff" occur closer to launch (e.g., 10-30 minutes before)
    const statusEl = document.getElementById('preflight-status');
    if (statusEl && timeData) {
        const totalMinutes = (timeData.days || 0) * 1440 + (timeData.hours || 0) * 60 + (timeData.minutes || 0);
        if (totalMinutes <= PREPARE_WARNING_MINUTES) {
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
        const fallbackStatusLabel = status && status.status === 'In Transit'
            ? 'ETA to Destination'
            : 'Time to Departure';
        const labelText = headerText ? headerText : (label || fallbackStatusLabel);
        labelEl.textContent = labelText;
    }

    countdownElement.innerHTML = formatted;
}

// skipcq: JS-R1005
async function loadSantaRoute() {
    try {
        try { console.debug && console.debug('loadSantaRoute: starting fetch /static/data/santa_route.json'); } catch (e) {}
        const response = await fetch('/static/data/santa_route.json');
        const data = await response.json();
        // Normalize route data: support both legacy `route` and new `route_nodes` shape
        const nodes = data.route_nodes || data.route || [];

        // Map upstream node schema into the flat shape used by the tracker functions
        // skipcq: JS-R1005
        santaRoute = nodes.map(n => {
            const loc = n.location || {};
            const sched = n.schedule || {};
            const transit = n.transit_to_here || {};

            // Normalize longitude into [-180, 180]
            const lng = normalizeLng(Number(loc.lng ?? loc.longitude ?? 0));

            // Ensure we have at least one timestamp field to work with
            // manufacturing identical arrival/departure times from the same source.
            let arrival = sched.arrival_utc || sched.arrival_time || sched.departure_utc || sched.departure_time || null;
            let departure = sched.departure_utc || sched.departure_time || sched.arrival_utc || sched.arrival_time || null;

            // If arrival and departure resolve to the same non-null value, prefer to keep
            // the side that was explicitly set on the schedule and null out the other.
            if (arrival && departure && arrival === departure) {
                const hasExplicitArrival = Boolean(sched.arrival_utc || sched.arrival_time);
                const hasExplicitDeparture = Boolean(sched.departure_utc || sched.departure_time);

                if (hasExplicitArrival && !hasExplicitDeparture) {
                    // Arrival was explicit, departure came from fallback; drop departure
                    departure = null;
                } else if (!hasExplicitArrival && hasExplicitDeparture) {
                    // Departure was explicit, arrival came from fallback; drop arrival
                    arrival = null;
                } else {
                    // Both explicit or both ambiguous; default to clearing departure to
                    // keep at most one timestamp per location from a single value.
                    departure = null;
                }
            }

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
        try { console.debug && console.debug('loadSantaRoute: computed adjusted longitudes, nodes=', santaRoute.length); } catch (e) {}

        // Emit routeLoaded early so UI can hide overlays even if later steps error.
        try {
            if (!(_routeLoadedEmitted)) {
                _routeLoadedEmitted = true;
                window.EventSystem && typeof window.EventSystem.emit === 'function' && window.EventSystem.emit('routeLoaded');
                try { console.debug && console.debug('loadSantaRoute: early emit routeLoaded to ensure UI unblocks'); } catch (e) {}
                // Also mark route as ready locally so overlay logic doesn't race with event handlers
                try { 
                    _routeReady = true; 
                    try { console.debug && console.debug('loadSantaRoute: set _routeReady = true (early emit)', { mapTilesReady: _mapTilesReady, routeReady: _routeReady }); } catch (e) {}
                    if (_mapTilesReady && _initialViewAligned) {
                        try { console.debug && console.debug('loadSantaRoute: both ready & aligned -> hiding overlays'); } catch (e) {}
                        setTimeout(() => {
                            try {
                                if (typeof window.hideMapLoadingOverlay === 'function') window.hideMapLoadingOverlay();
                                else if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay();
                            } catch (e) { /* ignore */ }
                        }, 120);
                    } else {
                        // If not yet aligned, schedule a re-check shortly so overlays hide once alignment completes
                        try { console.debug && console.debug('loadSantaRoute: waiting for initial alignment or tiles before hiding overlays', { mapTilesReady: _mapTilesReady, initialViewAligned: _initialViewAligned }); } catch (e) {}
                        setTimeout(() => {
                            try {
                                if (_mapTilesReady && _initialViewAligned) {
                                    if (typeof window.hideMapLoadingOverlay === 'function') window.hideMapLoadingOverlay();
                                    else if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay();
                                }
                            } catch (e) { /* ignore */ }
                        }, 250);
                    }
                } catch (e) { console.debug('Could not set _routeReady', e); }
            }
        } catch (e) { console.debug('loadSantaRoute: early emit failed', e); }

        // Populate the trail up to the current time so mid-route refreshes show full path
        try {
            populateInitialTrail();
                // Align the map view to the populated trail/marker before we allow hides
                try { alignInitialView(); } catch (e) { /* ignore */ }
                // Re-populate the trail now that the map has been aligned so display
                // longitudes match the chosen world copy and marker/trail align.
                try { populateInitialTrail(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.debug('populateInitialTrail invocation failed', e);
        }

        // Lightweight validation: ensure timestamps parse to valid Dates where present.
        // Do not mutate original timestamp strings (other code may expect them).
        // Instead, attach non-destructive validation flags and warn. Also check
        // that parsed dates are in a reasonable range (not before Unix epoch
        // and not too far in the future).
        try {
            let sawInvalidTimestamp = false;
            const nowTs = getNow().getTime();
            const EARLIEST_TS = Date.UTC(1970, 0, 1); // 1970-01-01 UTC
            const LATEST_TS = nowTs + (2 * 365 * 24 * 60 * 60 * 1000); // ~2 years in future

            const validate = (raw) => {
                if (!raw && raw !== 0) return { valid: false, date: null, reason: 'missing' };
                const parsedDate = new Date(raw);
                if (isNaN(parsedDate.getTime())) return { valid: false, date: null, reason: 'unparseable' };
                const timeMs = parsedDate.getTime();
                if (timeMs < EARLIEST_TS) return { valid: false, date: parsedDate, reason: 'too_old' };
                if (timeMs > LATEST_TS) return { valid: false, date: parsedDate, reason: 'too_far_in_future' };
                return { valid: true, date: parsedDate, reason: null };
            };

            for (let i = 0; i < santaRoute.length; i++) {
                const item = santaRoute[i];
                // Clear any previous validation metadata added by earlier runs
                try {
                    delete item._arrival_time_valid;
                } catch (e) {
                    console.debug('Failed to delete _arrival_time_valid from item', e);
                }
                try {
                    delete item._departure_time_valid;
                } catch (e) {
                    console.debug('Failed to delete _departure_time_valid from item', e);
                }

                if (item.arrival_time) {
                    const res = validate(item.arrival_time);
                    item._arrival_time_valid = Boolean(res.valid);
                    if (!res.valid) {
                        console.warn(`santaRoute[${i}] has invalid arrival_time (${res.reason}):`, item.arrival_time, 'Expected ISO-8601 UTC-ish timestamp.');
                        sawInvalidTimestamp = true;
                    }
                } else {
                    item._arrival_time_valid = false;
                }

                if (item.departure_time) {
                    const res2 = validate(item.departure_time);
                    item._departure_time_valid = Boolean(res2.valid);
                    if (!res2.valid) {
                        console.warn(`santaRoute[${i}] has invalid departure_time (${res2.reason}):`, item.departure_time, 'Expected ISO-8601 UTC-ish timestamp.');
                        sawInvalidTimestamp = true;
                    }
                } else {
                    item._departure_time_valid = false;
                }
            }

            if (sawInvalidTimestamp) {
                console.warn('One or more route timestamps appear invalid or out-of-range — tracker will attempt best-effort fallbacks. Timestamps are expected to be ISO-8601 or parsable by Date constructor and within a reasonable range (>=1970, <= now+2y).');
            }
        } catch (e) {
            console.debug('Timestamp validation failed unexpectedly', e);
        }

        // Only update live tracking display if in live mode
        if (santaRoute.length > 0 && currentMode === 'live') {
            // Initialize with first location
            const firstLocation = santaRoute[0];
            updateLocationDisplay(firstLocation.name || firstLocation.location,
                santaRoute[1] ? (santaRoute[1].name || santaRoute[1].location) : 'Unknown');
        }

        // Ensure the visible countdown matches the route anchor departure exactly.
        try {
            // Find anchor node (explicit North Pole node id or START type)
            const anchor = santaRoute.find(n => {
                try {
                    const nid = String(n.id || '').toLowerCase();
                    const ntype = String(n.type || '').toLowerCase();
                    return nid === 'node_000_north_pole' || nid.includes('north_pole') || ntype === 'start';
                } catch (e) {
                    return false;
                }
            }) || (santaRoute.length ? santaRoute[0] : null);

            if (anchor) {
                const targetRaw = anchor.departure_time || anchor.arrival_time || null;
                const targetDate = targetRaw ? adjustTimestampToCurrentYear(targetRaw) : null;
                if (targetDate && !isNaN(targetDate.getTime())) {
                    startAnchorCountdownEnforcer(targetDate);
                } else {
                    // If anchor present but timestamp invalid, fall back to module if available
                    if (countdownModuleAvailable) {
                        try {
                            christmasCountdownInterval = window.CountdownModule.createCountdown({
                                targetElement: document.getElementById('countdown'),
                                useLocalTime: false,
                                onUpdate: handleCountdownUpdate
                            });
                            christmasCountdownInterval.start();
                        } catch (e) {
                            console.debug('Failed to start CountdownModule fallback', e);
                        }
                    }
                }
            } else {
                // No anchor node found: start module if available
                if (countdownModuleAvailable) {
                    try {
                        christmasCountdownInterval = window.CountdownModule.createCountdown({
                            targetElement: document.getElementById('countdown'),
                            useLocalTime: false,
                            onUpdate: handleCountdownUpdate
                        });
                        christmasCountdownInterval.start();
                    } catch (e) {
                        console.debug('Failed to start CountdownModule fallback', e);
                    }
                }
            }
        } catch (e) {
            console.debug('Anchor countdown enforcer failed to start', e);
        }

        // Start real-time tracking based on timestamps (will respect mode)
        startRealTimeTracking();
        // Notify any listeners that the route has been loaded so UI can hide loading overlays
        try {
                if (!(_routeLoadedEmitted)) {
                    _routeLoadedEmitted = true;
                    window.EventSystem && typeof window.EventSystem.emit === 'function' && window.EventSystem.emit('routeLoaded');
                    try { console.debug && console.debug('loadSantaRoute: emitted routeLoaded'); } catch (e) {}
                    try { if (!_routeReady) { _routeReady = true; try { console.debug && console.debug('loadSantaRoute: set _routeReady = true (final emit)', { mapTilesReady: _mapTilesReady, routeReady: _routeReady }); } catch (e) {} } } catch (e) {}
                    try {
                        if (_mapTilesReady && _routeReady && _initialViewAligned) {
                            try { console.debug && console.debug('loadSantaRoute: both ready & aligned after final emit -> hiding overlays'); } catch (e) {}
                            try { if (typeof window.hideMapLoadingOverlay === 'function') window.hideMapLoadingOverlay(); else if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay(); } catch (e) {}
                        } else {
                            try { console.debug && console.debug('loadSantaRoute: final emit but waiting for tiles/alignment', { mapTilesReady: _mapTilesReady, routeReady: _routeReady, initialViewAligned: _initialViewAligned }); } catch (e) {}
                            setTimeout(() => {
                                try {
                                    if (_mapTilesReady && _routeReady && _initialViewAligned) {
                                        if (typeof window.hideMapLoadingOverlay === 'function') window.hideMapLoadingOverlay(); else if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay();
                                    }
                                } catch (e) { /* ignore */ }
                            }, 220);
                        }
                    } catch (e) {}
                }
            } catch (e) { /* ignore */ }
    } catch (error) {
        console.error('Failed to load Santa route:', error);
        // Ensure UI doesn't remain blocked: mark route ready and emit routeLoaded
        try {
            _routeReady = true;
            if (!(_routeLoadedEmitted)) {
                _routeLoadedEmitted = true;
                window.EventSystem && typeof window.EventSystem.emit === 'function' && window.EventSystem.emit('routeLoaded');
            }
        } catch (e) { /* ignore */ }
        try { if (typeof window.hideMapLoadingOverlay === 'function') window.hideMapLoadingOverlay(); else if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay(); } catch (e) { /* ignore */ }
        // Fallback to simulation if route data fails to load
        try { console.warn && console.warn('loadSantaRoute: falling back to simulateSantaMovement'); } catch (e) {}
        simulateSantaMovement();
    }
}

// Force the visible countdown element to show the provided UTC targetDate (updates every second).
function startAnchorCountdownEnforcer(targetDate) {
    // Clear any existing enforcer
    if (forceCountdownToAnchorInterval) {
        clearInterval(forceCountdownToAnchorInterval);
        forceCountdownToAnchorInterval = null;
    }

    // Increment the shared version immediately so that any running/queued fallback
    // callbacks detect they are stale and stop updating the DOM.
    countdownSharedVersion++;

    const el = document.getElementById('countdown');
    if (!el || !targetDate) return;

    // Stop other countdown sources to avoid conflicts
    if (christmasCountdownFallbackInterval) {
        clearInterval(christmasCountdownFallbackInterval);
        christmasCountdownFallbackInterval = null;
    }
    if (christmasCountdownInterval && typeof christmasCountdownInterval.stop === 'function') {
        try { christmasCountdownInterval.stop(); } catch (e) { console.debug('Failed to stop christmasCountdownInterval', e); }
        christmasCountdownInterval = null;
    }

    // Expose a minimal Countdown-like interface so other helpers (e.g. preflight)
    // can query current countdown state via `getCountdownTimeData()`.
    const makeEnforcerCountdown = (target) => {
        let stopped = false;
        return {
            stop() {
                stopped = true;
                if (forceCountdownToAnchorInterval) {
                    clearInterval(forceCountdownToAnchorInterval);
                    forceCountdownToAnchorInterval = null;
                }
            },
            getTimeData() {
                if (stopped || !target) return null;
                const now = getNow();
                const diff = target - now;
                const isComplete = diff <= 0;
                if (isComplete) {
                    return { isComplete: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
                }
                const totalSeconds = Math.floor(diff / 1000);
                const days = Math.floor(totalSeconds / (24 * 3600));
                const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                return { isComplete: false, days, hours, minutes, seconds };
            }
        };
    };

    // Install the enforcer countdown object so callers can query its time data.
    christmasCountdownInterval = makeEnforcerCountdown(targetDate);

    const tick = () => {
        const now = getNow();
        const diff = targetDate - now;
        // Build timeData via the exposed enforcer interface when available so
        // caller-side handlers (e.g. handleCountdownUpdate) receive regular
        // updates and can perform early live-switch logic.
        const timeDataObj = (christmasCountdownInterval && typeof christmasCountdownInterval.getTimeData === 'function')
            ? christmasCountdownInterval.getTimeData()
            : null;

        if (timeDataObj) {
            try { handleCountdownUpdate(timeDataObj); } catch (e) { console.debug('handleCountdownUpdate failed in enforcer', e); }
        }

        // Debug: log planned liftoff zoom/source each tick so we can observe changes
            try {
                // Planned liftoff zoom logging removed
            } catch (e) {
                // ignore
            }

        if (diff <= 0) {
            el.textContent = '00:00:00';
            // cleanup enforcer interval and stop exposed countdown
            if (forceCountdownToAnchorInterval) {
                clearInterval(forceCountdownToAnchorInterval);
                forceCountdownToAnchorInterval = null;
            }
            if (christmasCountdownInterval && typeof christmasCountdownInterval.stop === 'function') {
                try { christmasCountdownInterval.stop(); } catch (e) { /* ignore */ }
            }
            christmasCountdownInterval = null;
            return;
        }

        // Use human-friendly days/hours/minutes/seconds formatting
        el.textContent = formatDurationMs(diff);
    };

    // Run immediately and then every second
    tick();
    forceCountdownToAnchorInterval = setInterval(tick, 1000);
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
    // Guard against malformed schedules where arrival <= departure which causes
    // instant teleport jumps. Use a small fallback duration so interpolation
    // produces a short smooth transit rather than a teleport.
    let adjustedTotalDuration = totalDuration;
    if (adjustedTotalDuration <= 0) {
        // 1s fallback
        adjustedTotalDuration = 1000;
        console.warn('interpolatePosition: non-positive totalDuration, using fallback 1000ms', { departure, arrival, loc1, loc2 });
    }
    const elapsed = now - departure;
    const progress = Math.max(0, Math.min(1, elapsed / adjustedTotalDuration));

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
    // Prefer departure_time but fall back to arrival_time for consistency with countdown logic
    const firstTimeRaw = firstLocation.departure_time || firstLocation.arrival_time || null;
    if (firstTimeRaw) {
        const firstArrivalTime = adjustTimestampToCurrentYear(firstTimeRaw);
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

        // Validate timestamps. The first location (anchor/North Pole) is allowed
        // to omit `arrival_time` (it represents Santa already at the workshop).
        // For index 0 require at minimum a valid `departure_time`; other
        // locations require both arrival and departure times.
        const hasArrival = Boolean(location.arrival_time);
        const hasDeparture = Boolean(location.departure_time);

        if (i === 0) {
            if (!hasDeparture) {
                console.warn(`Location at index ${i} missing required departure_time`);
                continue;
            }
        } else {
            if (!hasArrival || !hasDeparture) {
                console.warn(`Location at index ${i} missing required timestamps`);
                continue;
            }
        }

        const arrivalTime = hasArrival ? adjustTimestampToCurrentYear(location.arrival_time) : null;
        const departureTime = hasDeparture ? adjustTimestampToCurrentYear(location.departure_time) : null;

        if (i === 0) {
            if (!departureTime) {
                console.warn(`Location at index ${i} has invalid departure_time`);
                continue;
            }
        } else {
            if (!arrivalTime || !departureTime) {
                console.warn(`Location at index ${i} has invalid timestamps`);
                continue;
            }
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
    if (currentMode !== 'live') return;

    // Cancel any existing loop (interval or RAF)
    if (santaMovementInterval) {
        if (santaMovementIsRAF) {
            cancelAnimationFrame(santaMovementInterval);
        } else {
            clearInterval(santaMovementInterval);
        }
        santaMovementInterval = null;
        santaMovementIsRAF = false;
    }

    // Use requestAnimationFrame for smooth, frame-synced updates.
    // Throttle to ~30fps to reduce work while still being smooth.
    const FRAME_MS = 33;
    let lastFrame = performance.now();

    function step(ts) {
        const elapsed = ts - lastFrame;
        if (elapsed >= FRAME_MS) {
            lastFrame = ts;
            try {
                updateSantaPosition();
            } catch (e) {
                console.error('Error in real-time tracking step', e);
            }
        }
        const rafId = requestAnimationFrame(step);
        santaMovementInterval = rafId;
        santaMovementIsRAF = true;
    }

    const rafId = requestAnimationFrame(step);
    santaMovementInterval = rafId;
    santaMovementIsRAF = true;
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
            // Animate movements when Santa is in transit so cinematic camera can run
            animate: status && status.status === 'In Transit',
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
        if (santaMovementIsRAF) {
            try { cancelAnimationFrame(santaMovementInterval); } catch (e) { /* ignore */ }
        } else {
            try { clearInterval(santaMovementInterval); } catch (e) { /* ignore */ }
        }
        santaMovementInterval = null;
        santaMovementIsRAF = false;
    }
    if (christmasCountdownInterval) {
        // `christmasCountdownInterval` may be a CountdownModule instance (with `stop()`),
        // or in older/fallback cases an interval id. Prefer calling `stop()` when available.
        if (typeof christmasCountdownInterval.stop === 'function') {
            try {
                christmasCountdownInterval.stop();
            } catch (e) {
                console.debug('Failed to stop christmasCountdownInterval on unload', e);
            }
        } else {
            try {
                clearInterval(christmasCountdownInterval);
            } catch (e) {
                console.debug('Failed to clear christmasCountdownInterval on unload', e);
            }
        }
    }
    if (christmasCountdownFallbackInterval) {
        clearInterval(christmasCountdownFallbackInterval);
    }
    if (forceCountdownToAnchorInterval) {
        clearInterval(forceCountdownToAnchorInterval);
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

