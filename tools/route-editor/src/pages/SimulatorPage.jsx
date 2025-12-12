import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, Square, SkipBack, SkipForward, Clock, MapPin, Video, VideoOff } from 'lucide-react';

// ============================================================================
// Camera Zoom Constants (from cinematic_logic_spec.md)
// ============================================================================
/**
 * Zoom levels based on action state:
 * - DELIVERY: High zoom (City/Street Level) - See the sleigh, counter, local facts
 * - SHORT_HOP: Medium zoom (Region Level) - See path to next target (CRUISING/REGIONAL speeds)
 * - LONG_HAUL: Low zoom (Globe/Curvature Level) - Grandeur of flight (HYPERSONIC speed)
 * - LAUNCH: Maximum cinematic zoom for the initial deployment (HYPERSONIC_LONG speed)
 */
const CAMERA_ZOOM = {
    DELIVERY: 13,       // High zoom - City/Street level when stopped at a delivery
    SHORT_HOP: 10,      // Medium zoom - Region level for local/regional travel (CRUISING) (closer)
    LONG_HAUL: 7,       // Low zoom - Globe/curvature level for ocean crossings (HYPERSONIC) (closer)
    LAUNCH: 3,          // Maximum cinematic zoom for the launch sequence (HYPERSONIC_LONG)
};

// ============================================================================
// Simulation Speed Options
// ============================================================================
const SPEED_OPTIONS = [
    { value: 1, label: '1x (Real-time)' },
    { value: 10, label: '10x' },
    { value: 60, label: '1 min/sec' },
    { value: 300, label: '5 min/sec' },
    { value: 600, label: '10 min/sec' },
    { value: 3600, label: '1 hour/sec' },
];

// ============================================================================
// Santa Marker Component
// ============================================================================
function SantaMarker({ position }) {
    const santaIcon = useMemo(() => L.divIcon({
        html: '<span style="font-size: 36px; filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.3));">🎅</span>',
        className: 'santa-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    }), []);

    if (!position) return null;

    return <Marker position={position} icon={santaIcon} zIndexOffset={1000} />;
}

// ============================================================================
// Camera Controller Component (implements cinematic zoom rules)
// ============================================================================
/**
 * Implements the "Camera Director" logic from cinematic_logic_spec.md:
 *
 * State A: The Delivery (Stop)
 *   - Action: Arrived at node
 *   - Zoom: High (City/Street Level) - CAMERA_ZOOM.DELIVERY
 *   - Focus: The Sleigh, the counter ticking up, local facts
 *
 * State B: Short Hop (Inter-Island/Region)
 *   - Action: Local and Regional Travel (CRUISING/REGIONAL speeds)
 *   - Zoom: Medium (Region Level) - CAMERA_ZOOM.SHORT_HOP
 *   - Focus: Seeing the path to the immediate next target
 *
 * State C: Long Haul (Ocean Crossing)
 *   - Action: Long haul Travel (HYPERSONIC speed)
 *   - Zoom: Low (Globe/Curvature Level) - CAMERA_ZOOM.LONG_HAUL
 *   - Focus: The grandeur of the flight
 *
 * Phase 1: The Launch
 *   - Action: Deploying from North Pole (HYPERSONIC_LONG speed)
 *   - Zoom: Maximum Cinematic - CAMERA_ZOOM.LAUNCH
 */
function CameraController({ position, shouldFollow, autoZoom, phase, speedCurve }) {
    const map = useMap();
    const lastZoomRef = useRef(null);
    const lastPhaseRef = useRef(null);
    const isAnimatingRef = useRef(false);
    const animationTimeoutRef = useRef(null);

    useEffect(() => {
        if (!shouldFollow || !position) return;

        let targetZoom = null;

        if (autoZoom) {
            // Determine zoom based on phase and speed curve
            if (phase === 'stopped' || phase === 'finished') {
                // State A: The Delivery - Zoom in to city/street level
                targetZoom = CAMERA_ZOOM.DELIVERY;
            } else if (phase === 'waiting') {
                // At the start, waiting to depart - medium zoom
                targetZoom = CAMERA_ZOOM.SHORT_HOP;
            } else if (phase === 'transit') {
                // Zoom based on speed curve (travel mode)
                switch (speedCurve) {
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
            }
        }

        // Check if zoom needs to change
        const zoomChanged = targetZoom !== null && targetZoom !== lastZoomRef.current;

        if (zoomChanged && !isAnimatingRef.current) {
            // Clear any existing timeout
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
            }

            // Mark animation as in progress
            isAnimatingRef.current = true;

            // Use longer duration when zooming in (more dramatic)
            const isZoomingIn = targetZoom > (lastZoomRef.current || map.getZoom());
            const duration = isZoomingIn ? 2.0 : 1.5;


            map.flyTo(position, targetZoom, {
                animate: true,
                duration: duration,
                easeLinearity: 0.25
            });

            lastZoomRef.current = targetZoom;
            lastPhaseRef.current = phase;

            // Mark animation as complete after duration
            animationTimeoutRef.current = setTimeout(() => {
                isAnimatingRef.current = false;
            }, duration * 1000 + 100); // Add small buffer

        } else if (!isAnimatingRef.current) {
            // Only pan if we're not currently animating a zoom change
            map.panTo(position, { animate: true, duration: 0.3 });
        }

    }, [map, position, shouldFollow, autoZoom, phase, speedCurve]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
            }
        };
    }, []);

    return null;
}

// ============================================================================
// Location Marker Icon
// ============================================================================
function getLocationIcon(index, total, isVisited, isCurrent, nodeType) {
    const isStart = nodeType === 'START';
    const isLast = index === total - 1;

    let color, size, emoji;

    if (isCurrent) {
        color = '#22c55e';
        size = 16;
        emoji = null;
    } else if (isStart) {
        color = '#3b82f6';
        size = 14;
        emoji = '🏠';
    } else if (isLast) {
        color = '#ef4444';
        size = 14;
        emoji = '🏁';
    } else if (isVisited) {
        color = '#9ca3af';
        size = 10;
        emoji = null;
    } else {
        color = '#c41e3a';
        size = 12;
        emoji = null;
    }

    if (emoji) {
        return L.divIcon({
            html: `<span style="font-size: 20px;">${emoji}</span>`,
            className: 'location-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });
    }

    return L.divIcon({
        html: `<div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        className: 'location-marker',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
    });
}

// ============================================================================
// Format Helpers
// ============================================================================
function normalizeLng(lng) {
    // Normalize any longitude to the range [-180, 180)
    if (lng === undefined || lng === null || Number.isNaN(Number(lng))) return 0;
    const n = Number(lng);
    return ((n + 180) % 360 + 360) % 360 - 180;
}

function formatTime(date) {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function formatDate(date) {
    if (!date) return '----';
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================================================
// Main Simulator Page Component
// ============================================================================
export default function SimulatorPage() {
    // Route data loaded from localStorage
    const [routeData, setRouteData] = useState(null);
    const [loadError, setLoadError] = useState(null);

    // Simulation state
    const [status, setStatus] = useState('stopped');
    const [speed, setSpeed] = useState(60);
    const [currentTime, setCurrentTime] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [santaPosition, setSantaPosition] = useState(null);
    const [visitedIndices, setVisitedIndices] = useState(new Set());
    const [followSanta, setFollowSanta] = useState(true);
    const [autoZoom, setAutoZoom] = useState(true); // Cinematic auto-zoom
    const [currentPhase, setCurrentPhase] = useState('waiting');
    const [currentSpeedCurve, setCurrentSpeedCurve] = useState('CRUISING');

    // Animation refs
    const animationRef = useRef(null);
    const lastRealTimeRef = useRef(null);
    const updateSimulationRef = useRef(null);

    // Load route data from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('routeEditorSimulatorData');
            if (!stored) {
                // eslint-disable-next-line
                setLoadError('No route data found. Please go back to the Route Editor and click "Test Route" again.');
                return;
            }

            const data = JSON.parse(stored);
            if (!data.route_nodes || !Array.isArray(data.route_nodes)) {
                setLoadError('Invalid route data format.');
                return;
            }

            setRouteData(data);
        } catch (err) {
            setLoadError(`Failed to load route data: ${err.message}`);
        }
    }, []);

    // Build simulated route with arrival/departure times and transit info
    const simulatedRoute = useMemo(() => {
        if (!routeData?.route_nodes) return [];

        return routeData.route_nodes
            .filter(node => node.location?.lat !== undefined && node.location?.lng !== undefined)
            .map((node, index) => {
                const arrivalUTC = node.schedule?.arrival_utc
                    ? new Date(node.schedule.arrival_utc)
                    : null;
                const departureUTC = node.schedule?.departure_utc
                    ? new Date(node.schedule.departure_utc)
                    : null;

                // Extract transit info for camera zoom decisions
                const transitDuration = node.transit_to_here?.duration_seconds || 0;
                const speedCurve = node.transit_to_here?.speed_curve || 'CRUISING';
                const distanceKm = node.transit_to_here?.distance_km || 0;

                const rawLng = Number(node.location.lng);
                const normLng = normalizeLng(rawLng);

                return {
                    index,
                    id: node.id,
                    name: node.location?.name || `Stop ${index}`,
                    region: node.location?.region || '',
                    lat: Number(node.location.lat),
                    lng: rawLng, // keep raw for reference
                    normLng,      // normalized into [-180, 180)
                    arrivalTime: arrivalUTC,
                    departureTime: departureUTC,
                    type: node.type || 'DELIVERY',
                    stopDuration: node.stop_experience?.duration_seconds || 60,
                    localArrivalTime: node.schedule?.local_arrival_time,
                    timeWindowStatus: node.schedule?.time_window_status,
                    // Transit info for camera
                    transitDuration,
                    speedCurve,
                    distanceKm,
                    isLaunch: speedCurve === 'HYPERSONIC_LONG', // Launch uses the fastest speed
                };
            });
    }, [routeData]);

    // Compute adjusted longitudes that follow the shortest path between consecutive points
    const adjustedLongitudes = useMemo(() => {
        if (!simulatedRoute || simulatedRoute.length === 0) return [];
        const out = [];
        for (let i = 0; i < simulatedRoute.length; i++) {
            const norm = simulatedRoute[i].normLng;
            if (i === 0) {
                out.push(norm);
            } else {
                const prev = out[i - 1];
                // shortest-angle delta from prev to norm
                const delta = ((norm - prev + 540) % 360) - 180;
                out.push(prev + delta);
            }
        }
        return out;
    }, [simulatedRoute]);

    // Polyline positions
    const polylinePositions = useMemo(() => {
        if (!simulatedRoute || simulatedRoute.length === 0) return [];

        const positions = [];

        for (let i = 0; i < simulatedRoute.length; i++) {
            const stop = simulatedRoute[i];
            const lat = stop.lat;
            const adjLng = adjustedLongitudes[i];

            // Skip invalid points
            if (lat === undefined || adjLng === undefined || lat === null || adjLng === null) continue;

            positions.push([lat, adjLng]);
        }

        return positions;
    }, [simulatedRoute, adjustedLongitudes]);

    // Route start and end times
    const routeStartTime = useMemo(() => {
        const firstWithTime = simulatedRoute.find(s => s.departureTime);
        return firstWithTime?.departureTime || null;
    }, [simulatedRoute]);

    const routeEndTime = useMemo(() => {
        const lastWithTime = [...simulatedRoute].reverse().find(s => s.departureTime || s.arrivalTime);
        return lastWithTime?.departureTime || lastWithTime?.arrivalTime || null;
    }, [simulatedRoute]);

    // ========================================================================
    // Simulation Logic
    // ========================================================================

    const interpolatePosition = useCallback((time) => {
        if (!time || simulatedRoute.length === 0) return null;

        for (let i = 0; i < simulatedRoute.length; i++) {
            const stop = simulatedRoute[i];

            // Before first departure
            if (i === 0 && stop.departureTime && time < stop.departureTime) {
                return { lat: stop.lat, lng: adjustedLongitudes[0] ?? stop.lng, index: 0, phase: 'waiting', transitDuration: 0, isLaunch: false };
            }

            // At this stop
            if (stop.arrivalTime && stop.departureTime) {
                if (time >= stop.arrivalTime && time <= stop.departureTime) {
                    return { lat: stop.lat, lng: adjustedLongitudes[i] ?? stop.lng, index: i, phase: 'stopped', transitDuration: 0, isLaunch: false };
                }
            }

            // In transit to next stop
            if (i < simulatedRoute.length - 1) {
                const nextStop = simulatedRoute[i + 1];
                const departTime = stop.departureTime;
                const arriveTime = nextStop.arrivalTime;

                if (departTime && arriveTime && time >= departTime && time < arriveTime) {
                    const progress = (time - departTime) / (arriveTime - departTime);
                    const lat = stop.lat + (nextStop.lat - stop.lat) * progress;

                    // Use adjusted longitudes and compute the shortest-angle delta for interpolation
                    const lngA = adjustedLongitudes[i] ?? normalizeLng(stop.lng);
                    const lngB = adjustedLongitudes[i + 1] ?? normalizeLng(nextStop.lng);
                    const delta = ((lngB - lngA + 540) % 360) - 180;
                    const lng = lngA + delta * progress;

                    return {
                        lat,
                        lng,
                        index: i,
                        phase: 'transit',
                        progress,
                        nextIndex: i + 1,
                        transitDuration: nextStop.transitDuration,
                        isLaunch: nextStop.isLaunch,
                        speedCurve: nextStop.speedCurve,
                    };
                }
            }
        }

        // After last arrival
        const lastStop = simulatedRoute[simulatedRoute.length - 1];
        return { lat: lastStop.lat, lng: adjustedLongitudes[simulatedRoute.length - 1] ?? lastStop.lng, index: simulatedRoute.length - 1, phase: 'finished', transitDuration: 0, isLaunch: false };
    }, [simulatedRoute, adjustedLongitudes]);

    const updateSimulation = useCallback(() => {
        if (status !== 'running') return;

        const now = performance.now();
        const deltaReal = now - lastRealTimeRef.current;
        lastRealTimeRef.current = now;

        const deltaSimMs = deltaReal * speed;
        setCurrentTime(prev => {
            if (!prev) return prev;
            const newTime = new Date(prev.getTime() + deltaSimMs);

            if (routeEndTime && newTime >= routeEndTime) {
                setStatus('stopped');
                return routeEndTime;
            }

            return newTime;
        });

        animationRef.current = requestAnimationFrame(updateSimulationRef.current);
    }, [status, speed, routeEndTime]);

    // Keep ref updated with latest callback
    useEffect(() => {
        updateSimulationRef.current = updateSimulation;
    }, [updateSimulation]);

    // Update Santa position and camera state when time changes
    useEffect(() => {
        if (!currentTime) return;

        const pos = interpolatePosition(currentTime);
        if (pos) {
            // eslint-disable-next-line
            setSantaPosition([pos.lat, pos.lng]);
            setCurrentPhase(pos.phase);
            setCurrentSpeedCurve(pos.speedCurve || 'CRUISING');

            if (pos.index !== currentIndex) {
                setCurrentIndex(pos.index);
                setVisitedIndices(prev => {
                    const next = new Set(prev);
                    for (let i = 0; i <= pos.index; i++) {
                        next.add(i);
                    }
                    return next;
                });
            }
        }
    }, [currentTime, interpolatePosition, currentIndex]);

    // Animation loop
    useEffect(() => {
        if (status === 'running') {
            lastRealTimeRef.current = performance.now();
            animationRef.current = requestAnimationFrame(updateSimulation);
        } else if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [status, updateSimulation]);

    // ========================================================================
    // Control Handlers
    // ========================================================================

    const handlePlay = useCallback(() => {
        if (!routeStartTime) return;

        if (status === 'paused') {
            setStatus('running');
        } else {
            setCurrentTime(routeStartTime);
            setCurrentIndex(-1);
            setVisitedIndices(new Set());
            setSantaPosition([simulatedRoute[0]?.lat, simulatedRoute[0]?.lng]);
            setStatus('running');
        }
    }, [status, routeStartTime, simulatedRoute]);

    const handlePause = useCallback(() => {
        setStatus('paused');
    }, []);

    const handleStop = useCallback(() => {
        setStatus('stopped');
        setCurrentTime(null);
        setCurrentIndex(-1);
        setVisitedIndices(new Set());
        setSantaPosition(null);
        setCurrentPhase('waiting');
    }, []);

    const handleSkipBack = useCallback(() => {
        if (currentIndex > 0) {
            const prevStop = simulatedRoute[currentIndex - 1];
            setCurrentTime(prevStop.arrivalTime || routeStartTime);
        } else {
            setCurrentTime(routeStartTime);
        }
    }, [currentIndex, simulatedRoute, routeStartTime]);

    const handleSkipForward = useCallback(() => {
        if (currentIndex < simulatedRoute.length - 1) {
            const nextStop = simulatedRoute[currentIndex + 1];
            if (nextStop?.arrivalTime) {
                setCurrentTime(nextStop.arrivalTime);
            }
        }
    }, [currentIndex, simulatedRoute]);

    const handleJumpToStop = useCallback((index) => {
        const stop = simulatedRoute[index];
        if (stop?.arrivalTime) {
            setCurrentTime(stop.arrivalTime);
            if (status === 'stopped') {
                setStatus('paused');
            }
        } else if (stop?.departureTime) {
            setCurrentTime(stop.departureTime);
            if (status === 'stopped') {
                setStatus('paused');
            }
        }
    }, [simulatedRoute, status]);

    // Progress calculation
    const progress = useMemo(() => {
        if (!currentTime || !routeStartTime || !routeEndTime) return 0;
        const total = routeEndTime - routeStartTime;
        const elapsed = currentTime - routeStartTime;
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }, [currentTime, routeStartTime, routeEndTime]);

    // ========================================================================
    // Error State
    // ========================================================================
    if (loadError) {
        return (
            <div className="h-screen w-screen bg-gray-900 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold mb-2 text-red-600">Route Not Found</h2>
                    <p className="text-gray-600 mb-4">{loadError}</p>
                    <a
                        href="/"
                        className="inline-block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Back to Route Editor
                    </a>
                </div>
            </div>
        );
    }

    // Loading state
    if (!routeData) {
        return (
            <div className="h-screen w-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎅</div>
                    <p>Loading route data...</p>
                </div>
            </div>
        );
    }

    // No valid stops
    if (simulatedRoute.length < 2) {
        return (
            <div className="h-screen w-screen bg-gray-900 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
                    <div className="text-6xl mb-4">🎄</div>
                    <h2 className="text-xl font-bold mb-2">Not Enough Stops</h2>
                    <p className="text-gray-600 mb-4">
                        Add at least 2 locations to your route to run the simulation.
                    </p>
                    <a
                        href="/"
                        className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                        Back to Route Editor
                    </a>
                </div>
            </div>
        );
    }

    // ========================================================================
    // Main Render
    // ========================================================================
    return (
        <div className="h-screen w-screen flex flex-col bg-gray-900">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-700 to-green-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🎅</span>
                    <div>
                        <h1 className="font-bold text-lg">Route Simulator</h1>
                        <p className="text-xs text-white/80">{simulatedRoute.length} stops • {routeData.meta?.year || 'Unknown Year'}</p>
                    </div>
                </div>

                {/* Time Display */}
                <div className="text-center">
                    <div className="text-3xl font-mono font-bold tracking-wider">
                        {formatTime(currentTime)}
                    </div>
                    <div className="text-sm text-white/80">
                        {formatDate(currentTime)}
                    </div>
                </div>

                {/* Status indicator */}
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                        status === 'running' ? 'bg-green-500' :
                            status === 'paused' ? 'bg-yellow-500' :
                                'bg-gray-500'
                    }`}>
                        {status.toUpperCase()}
                    </span>
                    <a
                        href="/"
                        className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm"
                    >
                        ← Back to Editor
                    </a>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Map */}
                <div className="flex-1 relative">
                    <MapContainer
                        center={[45, 170]}
                        zoom={2}
                        className="h-full w-full"
                        worldCopyJump={false}
                        minZoom={2}
                        maxBounds={[[-120, -Infinity], [120, Infinity]]}
                    >
                        <TileLayer
                            attribution='&copy; OpenStreetMap &copy; CARTO'
                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                            subdomains="abcd"
                        />

                        {/* Route line */}
                        <Polyline
                            positions={polylinePositions}
                            color="#c41e3a"
                            weight={3}
                            opacity={0.7}
                            dashArray="8, 12"
                        />

                        {/* Location markers */}
                        {simulatedRoute.map((stop, idx) => (
                            <Marker
                                key={stop.id || idx}
                                position={[stop.lat, adjustedLongitudes[idx] ?? stop.lng]}
                                icon={getLocationIcon(idx, simulatedRoute.length, visitedIndices.has(idx), idx === currentIndex, stop.type)}
                                eventHandlers={{
                                    click: () => handleJumpToStop(idx)
                                }}
                            >
                                <Popup>
                                    <div className="text-sm min-w-[150px]">
                                        <strong className="text-base">{stop.name}</strong>
                                        {stop.region && <div className="text-gray-500">{stop.region}</div>}
                                        <div className="mt-2 text-xs space-y-1">
                                            <div>Type: <span className="font-medium">{stop.type}</span></div>
                                            {stop.localArrivalTime && (
                                                <div>Local Arrival: <span className="font-medium">{stop.localArrivalTime}</span></div>
                                            )}
                                            {stop.arrivalTime && (
                                                <div>UTC: <span className="font-medium">{formatTime(stop.arrivalTime)}</span></div>
                                            )}
                                            {stop.timeWindowStatus && (
                                                <div className={`font-bold ${
                                                    stop.timeWindowStatus === 'GREEN' ? 'text-green-600' :
                                                        stop.timeWindowStatus === 'YELLOW' ? 'text-yellow-600' :
                                                            'text-red-600'
                                                }`}>
                                                    Status: {stop.timeWindowStatus}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Santa marker */}
                        <SantaMarker position={santaPosition} />
                        <CameraController
                            position={santaPosition}
                            shouldFollow={followSanta && status === 'running'}
                            autoZoom={autoZoom}
                            phase={currentPhase}
                            speedCurve={currentSpeedCurve}
                        />
                    </MapContainer>

                    {/* Progress bar overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-3">
                        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-200"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-white/80 mt-1">
                            <span>{routeStartTime ? formatTime(routeStartTime) : '--:--'}</span>
                            <span className="font-bold">{Math.round(progress)}% complete</span>
                            <span>{routeEndTime ? formatTime(routeEndTime) : '--:--'}</span>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Location List */}
                <div className="w-80 bg-white border-l border-gray-300 flex flex-col shrink-0">
                    <div className="p-3 bg-gray-100 border-b font-semibold flex items-center gap-2">
                        <MapPin size={16} />
                        Route Stops ({simulatedRoute.length})
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {simulatedRoute.map((stop, idx) => {
                            const isVisited = visitedIndices.has(idx);
                            const isCurrent = idx === currentIndex;

                            return (
                                <button
                                    key={stop.id || idx}
                                    onClick={() => handleJumpToStop(idx)}
                                    className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2 transition-colors ${
                                        isCurrent ? 'bg-green-50 border-l-4 border-l-green-500' : ''
                                    } ${isVisited && !isCurrent ? 'bg-gray-50' : ''}`}
                                >
                                    <span className="text-lg w-6 text-center">
                                        {isCurrent ? '🎅' : isVisited ? '✅' : stop.type === 'START' ? '🏠' : '📍'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-medium truncate ${isVisited && !isCurrent ? 'text-gray-500' : ''}`}>
                                            {stop.name}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span>{stop.localArrivalTime || formatTime(stop.arrivalTime)}</span>
                                            {stop.timeWindowStatus && (
                                                <span className={`px-1 rounded text-[10px] font-bold ${
                                                    stop.timeWindowStatus === 'GREEN' ? 'bg-green-100 text-green-700' :
                                                        stop.timeWindowStatus === 'YELLOW' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                                                }`}>
                                                    {stop.timeWindowStatus}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400 shrink-0">
                                        {stop.type === 'START' ? 'START' : stop.type === 'FLYBY' ? 'FLY' : idx}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-center gap-6 shrink-0">
                {/* Playback controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSkipBack}
                        disabled={status === 'stopped' || currentIndex <= 0}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous stop"
                    >
                        <SkipBack size={20} />
                    </button>

                    {status === 'running' ? (
                        <button
                            onClick={handlePause}
                            className="p-3 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors"
                            title="Pause"
                        >
                            <Pause size={28} />
                        </button>
                    ) : (
                        <button
                            onClick={handlePlay}
                            disabled={!routeStartTime}
                            className="p-3 bg-green-500 hover:bg-green-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={status === 'paused' ? 'Resume' : 'Play'}
                        >
                            <Play size={28} />
                        </button>
                    )}

                    <button
                        onClick={handleStop}
                        disabled={status === 'stopped'}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Stop"
                    >
                        <Square size={20} />
                    </button>

                    <button
                        onClick={handleSkipForward}
                        disabled={status === 'stopped' || currentIndex >= simulatedRoute.length - 1}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next stop"
                    >
                        <SkipForward size={20} />
                    </button>
                </div>

                <div className="w-px h-8 bg-gray-600" />

                {/* Speed control */}
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-400">Speed:</span>
                    <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                    >
                        {SPEED_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                <div className="w-px h-8 bg-gray-600" />

                {/* Camera controls */}
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={followSanta}
                            onChange={(e) => setFollowSanta(e.target.checked)}
                            className="rounded border-gray-500"
                        />
                        <span className="text-sm">Follow</span>
                    </label>

                    <button
                        onClick={() => setAutoZoom(!autoZoom)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
                            autoZoom
                                ? 'bg-blue-500 hover:bg-blue-600'
                                : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                        title={autoZoom ? 'Cinematic auto-zoom enabled' : 'Auto-zoom disabled'}
                    >
                        {autoZoom ? <Video size={14} /> : <VideoOff size={14} />}
                        <span>Auto-Zoom</span>
                    </button>
                </div>

                <div className="w-px h-8 bg-gray-600" />

                {/* Current state info */}
                <div className="text-sm flex items-center gap-3">
                    {currentPhase === 'transit' && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            currentSpeedCurve === 'HYPERSONIC_LONG' ? 'bg-purple-500' :
                                currentSpeedCurve === 'HYPERSONIC' ? 'bg-blue-500' :
                                    currentSpeedCurve === 'REGIONAL' ? 'bg-cyan-500' :
                                        'bg-green-500'
                        }`}>
                            {currentSpeedCurve === 'HYPERSONIC_LONG' ? '🚀 LAUNCH' :
                                currentSpeedCurve === 'HYPERSONIC' ? '✈️ LONG HAUL' :
                                    currentSpeedCurve === 'REGIONAL' ? '🛩️ REGIONAL' :
                                        '🎿 CRUISING'}
                        </span>
                    )}
                    {currentPhase === 'stopped' && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500">
                            📍 DELIVERING
                        </span>
                    )}
                    {currentIndex >= 0 && simulatedRoute[currentIndex] ? (
                        <span className="font-medium">{simulatedRoute[currentIndex].name}</span>
                    ) : (
                        <span className="text-gray-500">Ready to simulate</span>
                    )}
                </div>
            </div>
        </div>
    );
}
