import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, Square, SkipBack, SkipForward, X, Clock, MapPin } from 'lucide-react';

// ============================================================================
// Simulation Speed Options
// ============================================================================
const SPEED_OPTIONS = [
    { value: 1, label: '1x' },
    { value: 10, label: '10x' },
    { value: 60, label: '60x' },
    { value: 300, label: '5min/s' },
    { value: 600, label: '10min/s' },
    { value: 3600, label: '1hr/s' },
];

// ============================================================================
// Santa Marker Component
// ============================================================================
function SantaMarker({ position }) {
    const santaIcon = useMemo(() => L.divIcon({
        html: '<span style="font-size: 32px;">🎅</span>',
        className: 'santa-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    }), []);

    if (!position) return null;

    return <Marker position={position} icon={santaIcon} />;
}

// ============================================================================
// Map Follower Component - Keeps map centered on Santa
// ============================================================================
function MapFollower({ position, shouldFollow }) {
    const map = useMap();

    useEffect(() => {
        if (shouldFollow && position) {
            map.panTo(position, { animate: true, duration: 0.5 });
        }
    }, [map, position, shouldFollow]);

    return null;
}

// ============================================================================
// Location Marker Icon
// ============================================================================
function getLocationIcon(index, isVisited, isCurrent) {
    const color = isCurrent ? '#22c55e' : isVisited ? '#6b7280' : '#c41e3a';
    const size = isCurrent ? 14 : 10;
    
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
// Format Time Helper
// ============================================================================
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
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================================================
// Main Route Simulator Component
// ============================================================================
export default function RouteSimulator({ routeNodes, onClose }) {
    // Simulation state
    const [status, setStatus] = useState('stopped'); // 'stopped' | 'running' | 'paused'
    const [speed, setSpeed] = useState(60);
    const [currentTime, setCurrentTime] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [santaPosition, setSantaPosition] = useState(null);
    const [visitedIndices, setVisitedIndices] = useState(new Set());
    const [followSanta, setFollowSanta] = useState(true);
    
    // Animation refs
    const animationRef = useRef(null);
    const lastRealTimeRef = useRef(null);

    // Filter out nodes without valid schedules and positions
    const validNodes = useMemo(() => {
        return routeNodes.filter(node => 
            node.location?.lat !== undefined && 
            node.location?.lng !== undefined
        );
    }, [routeNodes]);

    // Build simulated route with arrival/departure times
    const simulatedRoute = useMemo(() => {
        return validNodes.map((node, index) => {
            const arrivalUTC = node.schedule?.arrival_utc 
                ? new Date(node.schedule.arrival_utc) 
                : null;
            const departureUTC = node.schedule?.departure_utc 
                ? new Date(node.schedule.departure_utc) 
                : null;
            
            return {
                index,
                name: node.location?.name || `Stop ${index}`,
                region: node.location?.region || '',
                lat: node.location.lat,
                lng: node.location.lng,
                arrivalTime: arrivalUTC,
                departureTime: departureUTC,
                type: node.type || 'DELIVERY',
                stopDuration: node.stop_experience?.duration_seconds || 60,
            };
        });
    }, [validNodes]);

    // Calculate route start and end times
    const routeStartTime = useMemo(() => {
        const firstWithTime = simulatedRoute.find(s => s.departureTime);
        return firstWithTime?.departureTime || new Date();
    }, [simulatedRoute]);

    const routeEndTime = useMemo(() => {
        const lastWithTime = [...simulatedRoute].reverse().find(s => s.arrivalTime);
        return lastWithTime?.arrivalTime || new Date();
    }, [simulatedRoute]);

    // Polyline positions
    const polylinePositions = useMemo(() => {
        return simulatedRoute.map(stop => [stop.lat, stop.lng]);
    }, [simulatedRoute]);

    // ========================================================================
    // Simulation Logic
    // ========================================================================
    
    const interpolatePosition = useCallback((time) => {
        if (!time || simulatedRoute.length === 0) return null;

        // Find current segment
        for (let i = 0; i < simulatedRoute.length; i++) {
            const stop = simulatedRoute[i];
            
            // Before first departure (at start)
            if (i === 0 && stop.departureTime && time < stop.departureTime) {
                return { lat: stop.lat, lng: stop.lng, index: 0, phase: 'waiting' };
            }
            
            // At this stop
            if (stop.arrivalTime && stop.departureTime) {
                if (time >= stop.arrivalTime && time <= stop.departureTime) {
                    return { lat: stop.lat, lng: stop.lng, index: i, phase: 'stopped' };
                }
            }
            
            // In transit to next stop
            if (i < simulatedRoute.length - 1) {
                const nextStop = simulatedRoute[i + 1];
                const departTime = stop.departureTime;
                const arriveTime = nextStop.arrivalTime;
                
                if (departTime && arriveTime && time >= departTime && time < arriveTime) {
                    // Interpolate position
                    const progress = (time - departTime) / (arriveTime - departTime);
                    const lat = stop.lat + (nextStop.lat - stop.lat) * progress;
                    const lng = stop.lng + (nextStop.lng - stop.lng) * progress;
                    return { lat, lng, index: i, phase: 'transit', progress };
                }
            }
        }
        
        // After last arrival
        const lastStop = simulatedRoute[simulatedRoute.length - 1];
        return { lat: lastStop.lat, lng: lastStop.lng, index: simulatedRoute.length - 1, phase: 'finished' };
    }, [simulatedRoute]);

    const updateSimulation = useCallback(() => {
        if (status !== 'running') return;
        
        const now = performance.now();
        const deltaReal = now - lastRealTimeRef.current;
        lastRealTimeRef.current = now;
        
        // Advance simulation time
        const deltaSimMs = deltaReal * speed;
        setCurrentTime(prev => {
            const newTime = new Date(prev.getTime() + deltaSimMs);
            
            // Check if simulation is complete
            if (newTime >= routeEndTime) {
                setStatus('stopped');
                return routeEndTime;
            }
            
            return newTime;
        });
        
        animationRef.current = requestAnimationFrame(updateSimulation);
    }, [status, speed, routeEndTime]);

    // Update Santa position when time changes
    useEffect(() => {
        if (!currentTime) return;
        
        const pos = interpolatePosition(currentTime);
        if (pos) {
            setSantaPosition([pos.lat, pos.lng]);
            
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

    // Start/stop animation loop
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
        if (status === 'paused') {
            setStatus('running');
        } else {
            // Start from beginning
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
            setCurrentTime(nextStop.arrivalTime);
        }
    }, [currentIndex, simulatedRoute]);

    const handleJumpToStop = useCallback((index) => {
        const stop = simulatedRoute[index];
        if (stop?.arrivalTime) {
            setCurrentTime(stop.arrivalTime);
        }
    }, [simulatedRoute]);

    // ========================================================================
    // Progress Calculation
    // ========================================================================
    const progress = useMemo(() => {
        if (!currentTime || !routeStartTime || !routeEndTime) return 0;
        const total = routeEndTime - routeStartTime;
        const elapsed = currentTime - routeStartTime;
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }, [currentTime, routeStartTime, routeEndTime]);

    // ========================================================================
    // Render
    // ========================================================================
    
    if (simulatedRoute.length === 0) {
        return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
                    <div className="text-6xl mb-4">🎄</div>
                    <h2 className="text-xl font-bold mb-2">No Route to Simulate</h2>
                    <p className="text-gray-600 mb-4">
                        Add some locations to your route first, then come back to test the simulation.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-700 to-green-700 text-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🎅</span>
                    <div>
                        <h1 className="font-bold">Route Simulator</h1>
                        <p className="text-xs text-white/80">{simulatedRoute.length} stops</p>
                    </div>
                </div>
                
                {/* Time Display */}
                <div className="text-center">
                    <div className="text-2xl font-mono font-bold">
                        {formatTime(currentTime)}
                    </div>
                    <div className="text-xs text-white/80">
                        {formatDate(currentTime)}
                    </div>
                </div>
                
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    title="Close simulator"
                >
                    <X size={24} />
                </button>
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
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                            subdomains="abcd"
                        />
                        
                        {/* Route line */}
                        <Polyline
                            positions={polylinePositions}
                            color="#c41e3a"
                            weight={2}
                            opacity={0.6}
                            dashArray="5, 10"
                        />
                        
                        {/* Location markers */}
                        {simulatedRoute.map((stop, idx) => (
                            <Marker
                                key={idx}
                                position={[stop.lat, stop.lng]}
                                icon={getLocationIcon(idx, visitedIndices.has(idx), idx === currentIndex)}
                            >
                                <Popup>
                                    <div className="text-sm">
                                        <strong>{stop.name}</strong>
                                        {stop.region && <div className="text-gray-500">{stop.region}</div>}
                                        {stop.arrivalTime && (
                                            <div className="text-xs mt-1">
                                                Arrives: {formatTime(stop.arrivalTime)}
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                        
                        {/* Santa marker */}
                        <SantaMarker position={santaPosition} />
                        <MapFollower position={santaPosition} shouldFollow={followSanta && status === 'running'} />
                    </MapContainer>

                    {/* Progress bar overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-2">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-white/80 mt-1">
                            <span>{formatTime(routeStartTime)}</span>
                            <span>{Math.round(progress)}% complete</span>
                            <span>{formatTime(routeEndTime)}</span>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Location List */}
                <div className="w-80 bg-white border-l border-gray-300 flex flex-col">
                    <div className="p-3 bg-gray-100 border-b font-semibold flex items-center gap-2">
                        <MapPin size={16} />
                        Route Stops
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {simulatedRoute.map((stop, idx) => {
                            const isVisited = visitedIndices.has(idx);
                            const isCurrent = idx === currentIndex;
                            
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleJumpToStop(idx)}
                                    className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 flex items-center gap-2 transition-colors ${
                                        isCurrent ? 'bg-green-50 border-l-4 border-l-green-500' : ''
                                    } ${isVisited && !isCurrent ? 'text-gray-400' : ''}`}
                                >
                                    <span className="text-lg">
                                        {isCurrent ? '🎅' : isVisited ? '✅' : '📍'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-medium truncate ${isVisited && !isCurrent ? 'text-gray-400' : ''}`}>
                                            {stop.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {stop.arrivalTime ? formatTime(stop.arrivalTime) : 'No schedule'}
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {stop.type}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-center gap-4">
                {/* Playback controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSkipBack}
                        disabled={status === 'stopped'}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-50"
                        title="Previous stop"
                    >
                        <SkipBack size={20} />
                    </button>
                    
                    {status === 'running' ? (
                        <button
                            onClick={handlePause}
                            className="p-3 bg-yellow-500 hover:bg-yellow-600 rounded-full"
                            title="Pause"
                        >
                            <Pause size={24} />
                        </button>
                    ) : (
                        <button
                            onClick={handlePlay}
                            className="p-3 bg-green-500 hover:bg-green-600 rounded-full"
                            title="Play"
                        >
                            <Play size={24} />
                        </button>
                    )}
                    
                    <button
                        onClick={handleStop}
                        disabled={status === 'stopped'}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-50"
                        title="Stop"
                    >
                        <Square size={20} />
                    </button>
                    
                    <button
                        onClick={handleSkipForward}
                        disabled={status === 'stopped'}
                        className="p-2 hover:bg-white/10 rounded disabled:opacity-50"
                        title="Next stop"
                    >
                        <SkipForward size={20} />
                    </button>
                </div>

                {/* Speed control */}
                <div className="flex items-center gap-2 ml-6">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-400">Speed:</span>
                    <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
                    >
                        {SPEED_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* Follow toggle */}
                <label className="flex items-center gap-2 ml-6 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={followSanta}
                        onChange={(e) => setFollowSanta(e.target.checked)}
                        className="rounded"
                    />
                    <span className="text-sm">Follow Santa</span>
                </label>

                {/* Current stop info */}
                {currentIndex >= 0 && simulatedRoute[currentIndex] && (
                    <div className="ml-6 text-sm">
                        <span className="text-gray-400">Current: </span>
                        <span className="font-medium">{simulatedRoute[currentIndex].name}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
